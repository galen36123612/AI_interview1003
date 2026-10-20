"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTranscriptEvent } from "./transcript.mjs";
import Image from "next/image";
import Transcript from "@/app/components/Transcript";
import { TranscriptItem } from "@/app/types";
import { PSYCH_SUPPORT_GREETING } from "./policy.mjs";
import { createTurnController, createTextMessage, describeRealtimeError } from "./turns.mjs";

type Message = { id: string; role: "user" | "assistant"; text: string; receivedAt: number };
type Status = "idle" | "connecting" | "connected";
const SESSION_LIMIT_MS = 10 * 60 * 1000;

export default function PsychSupportClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [inputNotice, setInputNotice] = useState("");
  const [typing, setTyping] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const draftRef = useRef("");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const turnsRef = useRef<ReturnType<typeof createTurnController> | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
    deadlineRef.current = null;
    turnsRef.current?.dispose(); turnsRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; }
    audioRef.current = null;
    setInputNotice(""); setTyping(false);
    setStatus("idle"); setSpeaking(false); setListening(false); setPlaybackBlocked(false);
    setIsPTTActive(false); setIsPTTUserSpeaking(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json()).then((info) => setConfigured(info.configured === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => stop, [stop]);

  const interrupt = useCallback(() => { turnsRef.current?.interrupt(); }, []);
  const updateDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value); setTyping(Boolean(value.trim()));
    turnsRef.current?.setDrafting(Boolean(value.trim()));
    if (value.trim()) setListening(false);
  };

  const start = async (nextMode: "voice" | "text", firstMessage?: string) => {
    if (pcRef.current || status === "connecting" || configured === false) return;
    stop();
    const generation = generationRef.current;
    setMode(nextMode); setMessages([]); setRatings({}); setError(""); setStatus("connecting");
    const controller = new AbortController(); abortRef.current = controller;
    connectionTimeoutRef.current = setTimeout(() => {
      if (generation === generationRef.current) { stop(); setError("連線逾時，請重新開始。"); }
    }, 30_000);
    try {
      if (nextMode === "voice") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (generation !== generationRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
      }
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const pc = new RTCPeerConnection(); pcRef.current = pc;
      const audio = new Audio(); audio.autoplay = true; audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => setPlaybackBlocked(true));
      };
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      else pc.addTransceiver("audio", { direction: "recvonly" });
      pc.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return;
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          stop(); setError("連線已中斷，請重新開始。");
        }
      };
      const channel = pc.createDataChannel("oai-events"); channelRef.current = channel;
      channel.onopen = () => {
        if (generation !== generationRef.current) return;
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        setStatus("connected");
        deadlineRef.current = setTimeout(() => {
          stop(); setError("本次 10 分鐘測試已結束，可重新開始。");
        }, SESSION_LIMIT_MS);
        turnsRef.current = createTurnController({
          send: (event: Record<string, unknown>) => {
            if (generation === generationRef.current && channel.readyState === "open") channel.send(JSON.stringify(event));
          },
          setMicrophoneEnabled: (enabled: boolean) => {
            streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
          },
          onDiscard: (id: string) => setMessages((current) => current.filter((message) => message.id !== id)),
          onNotice: (notice: string) => setInputNotice(notice),
        });
        setTyping(Boolean(draftRef.current.trim()));
        if (firstMessage) {
          const item = createTextMessage(firstMessage);
          turnsRef.current.submitText(item);
          setMessages((current) => applyTranscriptEvent(current, { type: "conversation.item.created", item }));
          if (draftRef.current.trim() === firstMessage.trim()) updateDraft("");
          else turnsRef.current.setDrafting(Boolean(draftRef.current.trim()));
        } else {
          turnsRef.current.greeting(`請以 AI 心理支持助手的身分，逐字說：「${PSYCH_SUPPORT_GREETING}」說完等待。`);
          turnsRef.current.setDrafting(Boolean(draftRef.current.trim()));
        }
      };
      channel.onclose = () => {
        if (generation === generationRef.current) { stop(); setError("測試連線已關閉，請重新開始。"); }
      };
      channel.onmessage = ({ data }) => {
        if (generation !== generationRef.current) return;
        let event;
        try { event = JSON.parse(data); } catch { return; }
        if (!turnsRef.current?.handle(event)) return;
        setMessages((current) => applyTranscriptEvent(current, event));
        if (event.type === "output_audio_buffer.started") setSpeaking(true);
        if (["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(event.type)) setSpeaking(false);
        if (event.type === "input_audio_buffer.speech_started" && turnsRef.current.allowsVoice()) setListening(true);
        if (["input_audio_buffer.speech_stopped", "input_audio_buffer.committed"].includes(event.type)) setListening(false);
        if (event.type === "response.done" && event.response?.status === "failed") setError("這次回應未完成，請重試或重新連線。");
        if (event.type === "error") setError(describeRealtimeError(event.error));
      };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const result = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/sdp", "x-psych-preview-connect": "1" },
        body: offer.sdp, signal: controller.signal,
      });
      if (!result.ok) {
        const info = await result.json().catch(() => ({}));
        throw new Error(info.error || "無法建立 Realtime 連線。");
      }
      if (generation !== generationRef.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: await result.text() });
    } catch (e) {
      if (generation !== generationRef.current) return;
      stop();
      setError(e instanceof DOMException && e.name === "NotAllowedError"
        ? "麥克風未獲允許，你也可以直接輸入文字。"
        : e instanceof DOMException && e.name === "AbortError"
          ? "連線逾時，請重新開始。" : e instanceof Error ? e.message : "連線失敗，請重試。");
    }
  };

  const sendText = (text = draft) => {
    const channel = channelRef.current;
    if (!text.trim()) return;
    if (status === "idle") { void start("text", text.trim()); return; }
    if (status !== "connected" || channel?.readyState !== "open") return;
    setError("");
    const item = createTextMessage(text.trim());
    turnsRef.current?.submitText(item);
    setMessages((current) => applyTranscriptEvent(current, { type: "conversation.item.created", item }));
    updateDraft("");
  };

  const clear = () => { stop(); setMessages([]); setRatings({}); updateDraft(""); setError(""); };
  const connected = status === "connected";

  const togglePushToTalk = () => {
    const channel = channelRef.current;
    if (!connected || mode !== "voice" || channel?.readyState !== "open") return;
    interrupt();
    const next = !isPTTActive;
    setIsPTTActive(next); setIsPTTUserSpeaking(false);
    turnsRef.current?.setManual(next);
  };
  const beginRecording = () => {
    if (!connected || !isPTTActive || channelRef.current?.readyState !== "open") return;
    if (!turnsRef.current?.beginRecording()) return;
    setIsPTTUserSpeaking(true); setListening(true);
  };
  const finishRecording = () => {
    if (!connected || !isPTTUserSpeaking || channelRef.current?.readyState !== "open") return;
    setIsPTTUserSpeaking(false); setListening(false);
    turnsRef.current?.finishRecording();
  };
  const microphoneTitle = status === "connecting" ? "取消連線"
    : !connected ? "開始語音對話"
      : mode === "text" ? "結束文字連線，之後可開始語音"
        : speaking ? "點擊打斷 AI 講話"
          : isPTTActive ? "切換持續對話" : "切換按鍵說話";
  const handleMicrophoneClick = () => {
    if (status === "connecting" || (connected && mode === "text")) { stop(); setError(""); return; }
    if (!connected) { void start("voice"); return; }
    if (speaking) interrupt();
    else togglePushToTalk();
  };
  const statusText = configured === false ? "尚未設定連線"
    : error ? connected ? "回應異常，點此結束" : "連線失敗，點此重試"
      : playbackBlocked ? "點此播放語音"
        : inputNotice || (typing && connected ? "正在輸入文字" : "")
          || (status === "connecting" ? "正在連線…"
          : connected ? speaking ? "AI 正在說話" : listening ? "正在聽你說" : "已連線"
            : "點麥克風開始");
  const statusTitle = error || inputNotice || (playbackBlocked ? "播放語音" : status === "connecting" ? "取消連線"
    : connected ? "點擊結束連線" : "開始語音對話；也可以直接輸入文字");
  const handleStatusClick = () => {
    if (!error && playbackBlocked && audioRef.current) {
      void audioRef.current.play().then(() => setPlaybackBlocked(false)).catch(() => {});
    } else if (status !== "idle") { stop(); setError(""); }
    else { void start(mode); }
  };
  const transcriptItems: TranscriptItem[] = messages.map((m) => ({
    itemId: m.id, type: "MESSAGE", role: m.role, title: m.text,
    timestamp: new Date(m.receivedAt).toLocaleTimeString("zh-TW", { hour12: false }) +
      "." + String(m.receivedAt % 1000).padStart(3, "0"),
    createdAtMs: m.receivedAt, expanded: false, status: "DONE", isHidden: false,
  }));

  return (
    <div className="relative flex flex-col bg-gray-100 text-base text-gray-800" style={{ height: "100dvh", maxHeight: "100dvh" }}>
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-3 text-lg font-semibold sm:p-5">
        <button type="button" onClick={clear} title="結束並清除對話" className="flex items-center">
          <Image src="/aigoasia_logo.png" alt="Logo" width={40} height={40} className="mr-2" />
          <div>AI 心理支持</div>
        </button>
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleStatusClick} title={statusTitle}
            disabled={configured === false} className="text-xs font-normal text-gray-500 hover:text-gray-700">
            <span role="status" aria-live="polite">{statusText}</span>
          </button>
          <button type="button" onClick={handleMicrophoneClick} disabled={configured === false}
            aria-label={microphoneTitle}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full font-medium text-white shadow-md transition-all duration-200 disabled:opacity-50 ${isPTTActive ? "bg-blue-500 hover:bg-blue-600" : "bg-green-500 hover:bg-green-600"}`}
            title={microphoneTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden px-2">
        <Transcript transcriptItems={transcriptItems} userText={draft} setUserText={updateDraft}
          onSendMessage={() => sendText()} canSend={status !== "connecting" && configured !== false} downloadRecording={() => undefined}
          handleTalkButtonDown={beginRecording} handleTalkButtonUp={finishRecording}
          isPTTUserSpeaking={isPTTUserSpeaking} isPTTActive={isPTTActive}
          onRate={(id, rating) => setRatings((current) => ({ ...current, [id]: rating }))}
          ratingsByTargetId={ratings} />
      </div>
    </div>
  );
}
