"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTranscriptEvent } from "./transcript.mjs";
import Image from "next/image";
import Transcript from "@/app/components/Transcript";
import { TranscriptItem } from "@/app/types";
import { PSYCH_SUPPORT_GREETING } from "./policy.mjs";

type Message = { id: string; role: "user" | "assistant"; text: string; receivedAt: number };
type Status = "idle" | "connecting" | "connected";
const SESSION_LIMIT_MS = 10 * 60 * 1000;

export default function PsychSupportClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [isPTTActive, setIsPTTActive] = useState(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const responseActiveRef = useRef(false);
  const outputActiveRef = useRef(false);
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
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.srcObject = null; }
    audioRef.current = null;
    responseActiveRef.current = false;
    outputActiveRef.current = false;
    setStatus("idle"); setSpeaking(false); setListening(false); setMuted(false);
    setIsPTTActive(false); setIsPTTUserSpeaking(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/session", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json()).then((info) => setConfigured(info.configured === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => stop, [stop]);

  const interrupt = useCallback(() => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") return;
    if (responseActiveRef.current) channel.send(JSON.stringify({ type: "response.cancel" }));
    if (outputActiveRef.current) channel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
  }, []);

  const start = async (nextMode: "voice" | "text") => {
    if (!consent || pcRef.current || status === "connecting") return;
    stop();
    const generation = generationRef.current;
    setMode(nextMode); setMessages([]); setRatings({}); setError(""); setStatus("connecting");
    const controller = new AbortController(); abortRef.current = controller;
    connectionTimeoutRef.current = setTimeout(() => {
      if (generation === generationRef.current) { stop(); setError("連線逾時，請重新開始。"); }
    }, 30_000);
    try {
      if (nextMode === "voice") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (generation !== generationRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
      }
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const pc = new RTCPeerConnection(); pcRef.current = pc;
      const audio = new Audio(); audio.autoplay = true; audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => setError("請按「播放語音」允許瀏覽器播放聲音。"));
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
        channel.send(JSON.stringify({ type: "response.create", response: { instructions: `請以 AI 心理支持助手的身分，逐字說：「${PSYCH_SUPPORT_GREETING}」說完等待。` } }));
      };
      channel.onclose = () => {
        if (generation === generationRef.current) { stop(); setError("測試連線已關閉，請重新開始。"); }
      };
      channel.onmessage = ({ data }) => {
        if (generation !== generationRef.current) return;
        let event;
        try { event = JSON.parse(data); } catch { return; }
        setMessages((current) => applyTranscriptEvent(current, event));
        if (event.type === "response.created") responseActiveRef.current = true;
        if (["response.done", "response.completed"].includes(event.type)) responseActiveRef.current = false;
        if (event.type === "output_audio_buffer.started") { outputActiveRef.current = true; setSpeaking(true); }
        if (["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(event.type)) {
          outputActiveRef.current = false; setSpeaking(false);
        }
        if (event.type === "input_audio_buffer.speech_started") setListening(true);
        if (["input_audio_buffer.speech_stopped", "input_audio_buffer.committed"].includes(event.type)) setListening(false);
        if (event.type === "error") setError("Realtime 回應發生錯誤，請重試或重新連線。");
      };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const result = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/sdp", "x-psych-preview-consent": "1" },
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
        ? "麥克風未獲允許，你可以改用純文字測試。"
        : e instanceof DOMException && e.name === "AbortError"
          ? "連線逾時，請重新開始。" : e instanceof Error ? e.message : "連線失敗，請重試。");
    }
  };

  const sendText = (text = draft) => {
    const channel = channelRef.current;
    if (status !== "connected" || channel?.readyState !== "open" || !text.trim()) return;
    interrupt();
    const item = { id: `msg_${crypto.randomUUID().replaceAll("-", "")}`, type: "message", role: "user",
      content: [{ type: "input_text", text: text.trim() }] };
    channel.send(JSON.stringify({ type: "conversation.item.create", item }));
    setMessages((current) => applyTranscriptEvent(current, { type: "conversation.item.created", item }));
    channel.send(JSON.stringify({ type: "response.create" }));
    setDraft("");
  };

  const clear = () => { stop(); setMessages([]); setRatings({}); setDraft(""); setError(""); };
  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted(!muted);
  };
  const connected = status === "connected";

  const togglePushToTalk = () => {
    const channel = channelRef.current;
    if (!connected || mode !== "voice" || channel?.readyState !== "open") return;
    interrupt();
    const next = !isPTTActive;
    setIsPTTActive(next); setIsPTTUserSpeaking(false);
    channel.send(JSON.stringify({ type: "session.update", session: {
      type: "realtime", audio: { input: { turn_detection: next ? null : {
        type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true,
      } } },
    } }));
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(false);
  };
  const beginRecording = () => {
    if (!connected || !isPTTActive || channelRef.current?.readyState !== "open") return;
    interrupt();
    channelRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    setIsPTTUserSpeaking(true); setListening(true);
  };
  const finishRecording = () => {
    if (!connected || !isPTTUserSpeaking || channelRef.current?.readyState !== "open") return;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
    setIsPTTUserSpeaking(false); setListening(false);
    channelRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    channelRef.current.send(JSON.stringify({ type: "response.create" }));
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
        <div className="flex items-center">
          <Image src="/aigoasia_logo.png" alt="Logo" width={40} height={40} className="mr-2" />
          <div>AI 心理支持</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-normal text-gray-500" role="status">
            {status === "connecting" ? "正在連線…" : connected ? speaking ? "AI 正在說話" : listening ? "正在聽你說" : "已連線" : "尚未連線"}
          </span>
          <button type="button" onClick={speaking ? interrupt : togglePushToTalk} disabled={!connected || mode !== "voice"}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full font-medium text-white shadow-md transition-all duration-200 disabled:opacity-50 ${isPTTActive ? "bg-blue-500 hover:bg-blue-600" : "bg-green-500 hover:bg-green-600"}`}
            title={speaking ? "點擊打斷 AI 講話" : isPTTActive ? "切換持續對話" : "切換按鍵說話"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 px-4 py-2 text-xs text-gray-600">
        <span>研究測試，不取代真人心理師。內容會傳送至 OpenAI，請使用虛構情境。</span>
        <label className="flex items-center gap-2"><input type="checkbox" checked={consent} disabled={status !== "idle"} onChange={(e) => setConsent(e.target.checked)} />我了解並同意</label>
        {status === "idle" ? <>
          <button className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-40" disabled={!consent || configured === false} onClick={() => void start("voice")}>開始語音</button>
          <button className="rounded border border-gray-300 px-3 py-2 disabled:opacity-40" disabled={!consent || configured === false} onClick={() => void start("text")}>純文字測試</button>
        </> : <button className="rounded border border-gray-300 px-3 py-2" onClick={stop}>{connected ? "結束連線" : "取消連線"}</button>}
        {connected && mode === "voice" && !isPTTActive && <button onClick={toggleMute}>{muted ? "開啟麥克風" : "靜音"}</button>}
        {connected && <button onClick={interrupt}>停止 AI 說話</button>}
        {connected && <button onClick={() => void audioRef.current?.play().then(() => setError("")).catch(() => setError("請再試一次播放語音。"))}>播放語音</button>}
        <button onClick={clear}>結束並清除</button>
      </div>
      {configured === false && <p className="px-4 py-1 text-xs text-red-700" role="alert">Preview 尚未設定 API key。</p>}
      {error && <p className="px-4 py-1 text-xs text-red-700" role="alert">{error}</p>}
      <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden px-2">
        <Transcript transcriptItems={transcriptItems} userText={draft} setUserText={setDraft}
          onSendMessage={() => sendText()} canSend={connected} downloadRecording={() => undefined}
          handleTalkButtonDown={beginRecording} handleTalkButtonUp={finishRecording}
          isPTTUserSpeaking={isPTTUserSpeaking} isPTTActive={isPTTActive}
          onRate={(id, rating) => setRatings((current) => ({ ...current, [id]: rating }))}
          ratingsByTargetId={ratings} />
      </div>
    </div>
  );
}
