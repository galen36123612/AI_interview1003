"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTranscriptEvent } from "./transcript.mjs";
import styles from "./psych-support.module.css";

type Message = { id: string; role: "user" | "assistant"; text: string };
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/psych/session", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json()).then((info) => setConfigured(info.configured === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
    setMode(nextMode); setMessages([]); setError(""); setStatus("connecting");
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
        channel.send(JSON.stringify({ type: "response.create", response: { instructions: "請只說固定開場，說完等待。" } }));
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
      const result = await fetch("/api/psych/session", {
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

  const clear = () => { stop(); setMessages([]); setDraft(""); setError(""); };
  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted(!muted);
  };
  const connected = status === "connected";

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>REALTIME · RESEARCH PREVIEW</p><h1>先說說，今天的你。</h1>
          <p className={styles.subtitle}>心理支持 AI 測試｜溫暖、具體，留一點空間給你的感受。</p></div>
        <span className={styles.badge}>A 版 · 原 Prompt＋護欄</span>
      </header>
      <section className={styles.notice} aria-label="研究測試說明">
        <strong>私人研究預覽，請用虛構情境測試。</strong>
        <p>不是心理師、診斷或危機服務。Router、案例 RAG 與真人接手尚未啟用。若有立即危險，請直接尋求當地緊急服務或身邊可信任的人協助。</p>
        <p>語音與文字會傳送至 OpenAI。本頁不將逐字稿寫入後端紀錄或資料庫；畫面內容暫存於目前分頁，可隨時清除。</p>
        <label className={styles.consent}><input type="checkbox" checked={consent} disabled={status !== "idle"}
          onChange={(e) => setConsent(e.target.checked)} />我了解以上說明，同意將這次測試內容傳送至 OpenAI。</label>
      </section>
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <h2>開始一段對話</h2>
          <p>每次最多 10 分鐘。語音模式可以自然停頓，也可以打字補充。</p>
          {configured === false && <p role="alert" className={styles.error}>Preview 尚未設定 API key。</p>}
          <button className={styles.primary} disabled={!consent || status !== "idle" || configured === false} onClick={() => void start("voice")}>開始語音對話</button>
          <button className={styles.secondary} disabled={!consent || status !== "idle" || configured === false} onClick={() => void start("text")}>純文字測試（不用麥克風）</button>
          {status !== "idle" && <button className={styles.secondary} onClick={stop}>{status === "connecting" ? "取消連線" : "結束連線"}</button>}
          {connected && mode === "voice" && <button className={styles.secondary} onClick={toggleMute}>{muted ? "開啟麥克風" : "暫時靜音"}</button>}
          {connected && <button className={styles.secondary} onClick={interrupt}>停止 AI 說話</button>}
          {connected && <button className={styles.linkButton} onClick={() => void audioRef.current?.play().then(() => setError("")).catch(() => setError("請再試一次播放語音。"))}>播放語音</button>}
          <button className={styles.linkButton} onClick={clear}>結束並清除對話</button>
          <div className={styles.divider} />
          <h2>可以試試這些情境</h2>
          {["我今天有點委屈，先不要給建議，只想有人聽。", "我想跟同事表達界線，可以幫我想幾句自然的說法嗎？", "我終於完成一直不敢做的事，今天有點開心。"].map((text) =>
            <button key={text} className={styles.scenario} disabled={!connected} onClick={() => sendText(text)}>{text}</button>)}
          <p className={styles.small}>模型：gpt-realtime<br />案例檢索：關閉 · 0 筆</p>
        </aside>
        <section className={styles.conversation} aria-label="測試對話">
          <div className={styles.status} role="status"><span className={connected ? styles.dotConnected : styles.dot} />
            {status === "connecting" ? "正在連線…" : connected ? speaking ? "AI 正在說話" : listening ? "正在聽你說" : muted ? "麥克風已靜音" : "已連線，慢慢說就好" : "尚未連線"}</div>
          <div className={styles.messages}>
            {messages.length === 0 && <div className={styles.empty}><span>你好。</span><p>不用急著整理好。<br />先從一件小事開始，也可以。</p></div>}
            {messages.map((m) => <article key={m.id} className={m.role === "user" ? styles.userMessage : styles.aiMessage}>
              <span>{m.role === "user" ? "你" : "AI 支持助手"}</span><p>{m.text}</p></article>)}
            <div ref={scrollRef} />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); sendText(); }}>
            <label className={styles.srOnly} htmlFor="psych-message">訊息</label>
            <input id="psych-message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000}
              disabled={!connected} placeholder={connected ? "也可以在這裡打字…" : "先確認說明，再開始測試"} autoComplete="off" />
            <button type="submit" disabled={!connected || !draft.trim()} className={styles.send}>傳送</button>
          </form>
        </section>
      </div>
    </main>
  );
}
