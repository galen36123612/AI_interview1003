"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  BrainCircuit,
  CircleStop,
  MessageCircleQuestion,
  Mic2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Transcript from "./components/Transcript";
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { INTERVIEW_WELCOME_INSTRUCTION } from "@/app/data/interviewCoachKnowledge";
import { useEvent } from "@/app/contexts/EventContext";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useHandleServerEvent } from "./hooks/useHandleServerEvent";
import { SessionStatus } from "@/app/types";

const agentSet = allAgentSets[defaultAgentSetKey];
const interviewCoach = agentSet[0];

const PRACTICE_AREAS = [
  {
    icon: Sparkles,
    title: "自我介紹",
    body: "整理 60–90 秒主線，補上可信的經驗證據。",
  },
  {
    icon: BrainCircuit,
    title: "論文研究",
    body: "從問題、方法到貢獻，練到非本科面試官也能懂。",
  },
  {
    icon: MessageCircleQuestion,
    title: "專案經驗",
    body: "拆清楚個人角色、關鍵決策、成果與反思。",
  },
];

function App() {
  const { logClientEvent, logServerEvent } = useEvent();
  const { resetTranscript } = useTranscript();

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
  const [connectionError, setConnectionError] = useState("");

  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const hasWelcomedRef = useRef(false);
  const isOutputActiveRef = useRef(false);
  const isResponseActiveRef = useRef(false);

  useEffect(() => {
    isOutputActiveRef.current = isOutputAudioBufferActive;
  }, [isOutputAudioBufferActive]);

  const sendClientEvent = useCallback(
    (event: Record<string, unknown>, label = "") => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") return false;

      logClientEvent(event, label);
      channel.send(JSON.stringify(event));
      return true;
    },
    [logClientEvent]
  );

  const handleServerEventRef = useHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet: agentSet,
    sendClientEvent,
    setSelectedAgentName,
    setIsOutputAudioBufferActive,
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
          type: "server_vad",
          threshold: 0.62,
          prefix_padding_ms: 450,
          silence_duration_ms: 900,
          create_response: true,
          interrupt_response: true,
        };

    sendClientEvent(
      {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: interviewCoach.instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              noise_reduction: { type: "near_field" },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "zh",
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
  }, [isPTTActive, sendClientEvent]);

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
          cancelAssistantSpeech();
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

  const restartSession = async () => {
    stopSession();
    resetTranscript();
    await connectToRealtime();
  };

  const isConnected = sessionStatus === "CONNECTED";

  return (
    <main className="min-h-screen bg-[#f4f2ec] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 lg:flex-row lg:p-6">
        <aside className="flex w-full flex-col rounded-[28px] bg-[#183d35] p-6 text-white shadow-[0_24px_80px_rgba(24,61,53,0.18)] lg:w-[360px] lg:p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#d9ff6f] text-[#183d35]">
              <AudioLines size={24} strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
                Interview practice
              </p>
              <h1 className="text-xl font-semibold">面試陪練</h1>
            </div>
          </div>

          <div className="mt-9">
            <p className="max-w-[18rem] text-[28px] font-semibold leading-[1.2] tracking-[-0.03em]">
              把真實經驗，練成面試官聽得懂的答案。
            </p>
            <p className="mt-4 text-sm leading-6 text-emerald-50/70">
              一次一題、逐層追問。卡住時可以換題、要提示，也可以請教練示範。
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {PRACTICE_AREAS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5"
              >
                <Icon className="mt-0.5 shrink-0 text-[#d9ff6f]" size={18} />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/60">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-start gap-2 rounded-2xl bg-black/10 p-3 text-xs leading-5 text-emerald-50/65">
              <ShieldCheck className="mt-0.5 shrink-0" size={16} />
              <p>教練不會替你捏造經歷；專業內容無法驗證時會標示待查證。</p>
            </div>

            <div className="mt-4 flex gap-2">
              {!isConnected ? (
                <button
                  type="button"
                  onClick={connectToRealtime}
                  disabled={sessionStatus === "CONNECTING"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#d9ff6f] px-4 py-3 text-sm font-semibold text-[#183d35] transition hover:bg-[#e4ff98] disabled:cursor-wait disabled:opacity-70"
                >
                  <Mic2 size={17} />
                  {sessionStatus === "CONNECTING" ? "正在連線…" : "開始語音練習"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={restartSession}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#d9ff6f] px-4 py-3 text-sm font-semibold text-[#183d35] transition hover:bg-[#e4ff98]"
                  >
                    <RotateCcw size={16} />
                    重新開始
                  </button>
                  <button
                    type="button"
                    onClick={stopSession}
                    aria-label="結束練習"
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                  >
                    <CircleStop size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[680px] flex-1 flex-col overflow-hidden rounded-[28px] border border-black/[0.06] bg-[#fffdf9] shadow-[0_24px_80px_rgba(28,45,40,0.08)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.07] px-5 py-4 sm:px-7">
            <div>
              <p className="text-sm font-semibold">學生／新鮮人面試教練</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected
                      ? "bg-emerald-500"
                      : sessionStatus === "CONNECTING"
                        ? "animate-pulse bg-amber-400"
                        : "bg-slate-300"
                  }`}
                />
                {isConnected
                  ? isOutputAudioBufferActive
                    ? "教練正在回答"
                    : isListening
                      ? "正在聽你說"
                      : "已連線，換你回答"
                  : sessionStatus === "CONNECTING"
                    ? "正在準備語音空間"
                    : "尚未開始"}
              </div>
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setIsPTTActive(false)}
                className={`rounded-lg px-3 py-2 transition ${
                  !isPTTActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                自然對話
              </button>
              <button
                type="button"
                onClick={() => setIsPTTActive(true)}
                className={`rounded-lg px-3 py-2 transition ${
                  isPTTActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                按住說話
              </button>
            </div>
          </header>

          {connectionError && (
            <div className="mx-5 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-7">
              {connectionError}
            </div>
          )}

          <Transcript
            userText={userText}
            setUserText={setUserText}
            onSendMessage={() => sendTextMessage()}
            onQuickPrompt={sendTextMessage}
            canSend={isConnected}
            sessionStatus={sessionStatus}
            handleTalkButtonDown={handleTalkButtonDown}
            handleTalkButtonUp={handleTalkButtonUp}
            isPTTUserSpeaking={isPTTUserSpeaking}
            isPTTActive={isPTTActive}
            isListening={isListening}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
