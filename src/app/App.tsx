"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import Transcript from "./components/Transcript";
import Events from "./components/Events";
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { INTERVIEW_WELCOME_INSTRUCTION } from "@/app/data/interviewCoachKnowledge";
import { useEvent } from "@/app/contexts/EventContext";
import { useHandleServerEvent } from "./hooks/useHandleServerEvent";
import { SessionStatus } from "@/app/types";
import {
  formatConfirmedTerms,
  mergeConfirmedTerm,
  transcriptionPromptForConfirmedTerms,
} from "@/app/lib/confirmedTerms.mjs";
import { createRealtimeMetricsTracker } from "@/app/lib/realtimeMetrics.mjs";

const agentSet = allAgentSets[defaultAgentSetKey];
const interviewCoach = agentSet[0];

type ConfirmedTerm = {
  canonical: string;
  variants: string[];
};

function App() {
  const { logClientEvent, logServerEvent } = useEvent();

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");
  const [selectedAgentName, setSelectedAgentName] = useState(
    interviewCoach?.name ?? "interviewCoach"
  );
  const [userText, setUserText] = useState("");
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isOutputAudioBufferActive, setIsOutputAudioBufferActive] =
    useState(false);
  const [, setConnectionError] = useState("");
  const [ratingsByTargetId, setRatingsByTargetId] = useState<
    Record<string, number>
  >({});
  const [confirmedTerms, setConfirmedTerms] = useState<ConfirmedTerm[]>([]);

  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const hasWelcomedRef = useRef(false);
  const isOutputActiveRef = useRef(false);
  const isResponseActiveRef = useRef(false);
  const realtimeMetricsRef = useRef(createRealtimeMetricsTracker());

  useEffect(() => {
    isOutputActiveRef.current = isOutputAudioBufferActive;
  }, [isOutputAudioBufferActive]);

  const sendClientEvent = useCallback(
    (event: Record<string, unknown>, label = "") => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") return false;

      logClientEvent(event, label);
      for (const metric of realtimeMetricsRef.current.handleClientEvent(event)) {
        logClientEvent(metric, metric.name);
      }
      channel.send(JSON.stringify(event));
      return true;
    },
    [logClientEvent]
  );

  const rememberConfirmedTerm = useCallback((term: ConfirmedTerm) => {
    setConfirmedTerms((current) => mergeConfirmedTerm(current, term));
  }, []);

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet: agentSet,
    sendClientEvent,
    setSelectedAgentName,
    setIsOutputAudioBufferActive,
    onConfirmedTerm: rememberConfirmedTerm,
  });

  const sendWelcomeOnce = useCallback(() => {
    if (hasWelcomedRef.current) return;
    hasWelcomedRef.current = true;

    sendClientEvent(
      {
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: INTERVIEW_WELCOME_INSTRUCTION,
        },
      },
      "welcome"
    );
  }, [sendClientEvent]);

  const updateSession = useCallback(() => {
    const turnDetection = isPTTActive
      ? null
      : {
          type: "semantic_vad",
          eagerness: "low",
          create_response: true,
          interrupt_response: true,
        };

    const confirmedTermContext = formatConfirmedTerms(confirmedTerms);
    const transcriptionPrompt =
      transcriptionPromptForConfirmedTerms(confirmedTerms);

    sendClientEvent(
      {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: [interviewCoach.instructions, confirmedTermContext]
            .filter(Boolean)
            .join("\n\n"),
          output_modalities: ["audio"],
          audio: {
            input: {
              noise_reduction: { type: "near_field" },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "zh",
                ...(transcriptionPrompt
                  ? { prompt: transcriptionPrompt }
                  : {}),
              },
              turn_detection: turnDetection,
            },
            output: { voice: "cedar" },
          },
          tools: interviewCoach.tools,
          tool_choice: "auto",
        },
      },
      "interview coach configuration"
    );
  }, [confirmedTerms, isPTTActive, sendClientEvent]);

  const cancelAssistantSpeech = useCallback(() => {
    if (isResponseActiveRef.current) {
      sendClientEvent({ type: "response.cancel" }, "user interruption");
    }
    if (isOutputActiveRef.current) {
      sendClientEvent(
        { type: "output_audio_buffer.clear" },
        "clear interrupted audio"
      );
    }
  }, [sendClientEvent]);

  const stopSession = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
    }

    hasWelcomedRef.current = false;
    isResponseActiveRef.current = false;
    realtimeMetricsRef.current.reset();
    setIsPTTUserSpeaking(false);
    setIsListening(false);
    setIsOutputAudioBufferActive(false);
    setSessionStatus("DISCONNECTED");
  }, []);

  const connectToRealtime = useCallback(async () => {
    if (peerConnectionRef.current) return;

    setConnectionError("");
    setSessionStatus("CONNECTING");
    hasWelcomedRef.current = false;

    try {
      const tokenResponse = await fetch("/api/session", { cache: "no-store" });
      const tokenPayload = await tokenResponse.json().catch(() => null);
      logServerEvent(tokenPayload ?? {}, "session token");

      if (!tokenResponse.ok) {
        throw new Error(
          tokenPayload?.detail || "無法建立面試練習連線，請稍後再試。"
        );
      }

      const ephemeralKey =
        tokenPayload?.client_secret?.value || tokenPayload?.value;
      if (!ephemeralKey) {
        throw new Error("伺服器沒有回傳可用的即時連線權杖。" );
      }

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElementRef.current = audioElement;

      peerConnection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
        void audioElement.play().catch(() => {
          setConnectionError("瀏覽器暫停了語音播放，請再點一次畫面後重試。" );
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peerConnection.connectionState)) {
          setConnectionError("語音連線已中斷，請重新開始。" );
          stopSession();
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      localStream
        .getAudioTracks()
        .forEach((track) => peerConnection.addTrack(track, localStream));

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("open", () => {
        setSessionStatus("CONNECTED");
        updateSession();
      });

      dataChannel.addEventListener("message", (messageEvent) => {
        let event: Record<string, any>;
        try {
          event = JSON.parse(messageEvent.data);
        } catch {
          return;
        }

        for (const metric of realtimeMetricsRef.current.handleServerEvent(event)) {
          logServerEvent(metric, metric.name);
        }

        if (event.type === "session.updated") sendWelcomeOnce();

        if (event.type === "response.created") {
          isResponseActiveRef.current = true;
        }
        if (
          event.type === "response.done" ||
          event.type === "response.completed"
        ) {
          isResponseActiveRef.current = false;
        }

        if (event.type === "input_audio_buffer.speech_started") {
          setIsListening(true);
          if (isOutputActiveRef.current) {
            sendClientEvent(
              { type: "output_audio_buffer.clear" },
              "clear audio after server-managed interruption"
            );
          }
        }

        if (
          event.type === "input_audio_buffer.speech_stopped" ||
          event.type === "input_audio_buffer.committed"
        ) {
          setIsListening(false);
        }

        handleServerEventRef.current(event as any);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            "Content-Type": "application/sdp",
          },
        }
      );

      if (!sdpResponse.ok) {
        const detail = await sdpResponse.text();
        throw new Error(detail || "Realtime 語音連線失敗。" );
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "需要麥克風權限才能開始語音面試；請在瀏覽器允許後重試。"
          : error instanceof Error
            ? error.message
            : "連線失敗，請稍後再試。";
      setConnectionError(message);
      stopSession();
    }
  }, [
    cancelAssistantSpeech,
    handleServerEventRef,
    logServerEvent,
    sendWelcomeOnce,
    stopSession,
    updateSession,
  ]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") updateSession();
  }, [isPTTActive, sessionStatus, updateSession]);

  useEffect(() => {
    void connectToRealtime();
  }, [connectToRealtime]);

  useEffect(() => stopSession, [stopSession]);

  const sendTextMessage = useCallback(
    (preset?: string) => {
      const text = (preset ?? userText).trim();
      if (!text || sessionStatus !== "CONNECTED") return;

      cancelAssistantSpeech();
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        },
        "user text"
      );
      sendClientEvent(
        {
          type: "response.create",
          response: { output_modalities: ["audio"] },
        },
        "answer user"
      );
      setUserText("");
    },
    [
      cancelAssistantSpeech,
      sendClientEvent,
      sessionStatus,
      userText,
    ]
  );

  const handleTalkButtonDown = () => {
    if (sessionStatus !== "CONNECTED") return;
    cancelAssistantSpeech();
    setIsPTTUserSpeaking(true);
    setIsListening(true);
    sendClientEvent({ type: "input_audio_buffer.clear" }, "start push to talk");
  };

  const handleTalkButtonUp = () => {
    if (!isPTTUserSpeaking || sessionStatus !== "CONNECTED") return;
    setIsPTTUserSpeaking(false);
    setIsListening(false);
    sendClientEvent({ type: "input_audio_buffer.commit" }, "end push to talk");
    sendClientEvent(
      {
        type: "response.create",
        response: { output_modalities: ["audio"] },
      },
      "answer push to talk"
    );
  };

  const isConnected = sessionStatus === "CONNECTED";

  const handleMicrophoneClick = () => {
    if (isOutputAudioBufferActive) {
      cancelAssistantSpeech();
      return;
    }

    setIsPTTActive((active) => !active);
  };

  const handleRating = (targetEventId: string, rating: number) => {
    setRatingsByTargetId((ratings) => ({
      ...ratings,
      [targetEventId]: rating,
    }));
  };

  return (
    <div
      className="relative flex flex-col bg-gray-100 text-base text-gray-800"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-3 text-lg font-semibold sm:p-5">
        <div
          className="flex cursor-pointer items-center"
          onClick={() => window.location.reload()}
        >
          <Image
            src="/aigoasia_logo.png"
            alt="Weider Logo"
            width={40}
            height={40}
            className="mr-2"
          />
          <div>Influencer_KB</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleMicrophoneClick}
            className={`relative flex h-12 w-12 animate-pulse items-center justify-center rounded-full font-medium text-white shadow-md transition-all duration-200 ${
              isPTTActive
                ? "bg-blue-500 hover:bg-blue-600"
                : "bg-green-500 hover:bg-green-600"
            }`}
            title={
              isOutputAudioBufferActive
                ? "點擊打斷 AI 講話"
                : isPTTActive
                  ? "點擊切換到持續對話模式"
                  : "持續對話模式"
            }
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>

            {!isPTTActive && isListening && !isOutputAudioBufferActive && (
              <div className="absolute -right-1 -top-1">
                <div className="h-3 w-3 animate-ping rounded-full bg-green-400" />
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500" />
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden px-2">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={() => sendTextMessage()}
          downloadRecording={() => undefined}
          canSend={isConnected}
          handleTalkButtonDown={handleTalkButtonDown}
          handleTalkButtonUp={handleTalkButtonUp}
          isPTTUserSpeaking={isPTTUserSpeaking}
          isPTTActive={isPTTActive}
          onRate={handleRating}
          ratingsByTargetId={ratingsByTargetId}
        />

        <Events isExpanded={false} />
      </div>
    </div>
  );
}

export default App;
