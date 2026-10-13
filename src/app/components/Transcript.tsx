"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Check,
  Copy,
  CornerDownLeft,
  Mic,
  Send,
  Sparkles,
} from "lucide-react";

import { useTranscript } from "@/app/contexts/TranscriptContext";
import { SessionStatus } from "@/app/types";

const QUICK_PROMPTS = [
  {
    label: "練自我介紹",
    prompt: "我想練習 60 到 90 秒的自我介紹，請用教練模式帶我開始。",
  },
  {
    label: "練論文說明",
    prompt: "我想練習向非本科面試官說明我的論文，請先出第一題。",
  },
  {
    label: "練專案追問",
    prompt: "我想練習專案經驗，請像面試官一樣一層一層追問。",
  },
  {
    label: "直接模擬面試",
    prompt: "請切換成模擬面試模式；先問我應徵的職位，再開始提問。",
  },
];

interface TranscriptProps {
  userText: string;
  setUserText: (value: string) => void;
  onSendMessage: () => void;
  onQuickPrompt: (prompt: string) => void;
  canSend: boolean;
  sessionStatus: SessionStatus;
  handleTalkButtonDown: () => void;
  handleTalkButtonUp: () => void;
  isPTTUserSpeaking: boolean;
  isPTTActive: boolean;
  isListening: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-black/[0.04] hover:text-slate-600"
      aria-label="複製回答"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "已複製" : "複製"}
    </button>
  );
}

export default function Transcript({
  userText,
  setUserText,
  onSendMessage,
  onQuickPrompt,
  canSend,
  sessionStatus,
  handleTalkButtonDown,
  handleTalkButtonUp,
  isPTTUserSpeaking,
  isPTTActive,
  isListening,
}: TranscriptProps) {
  const { transcriptItems } = useTranscript();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const messages = useMemo(
    () =>
      transcriptItems.filter(
        (item) => !item.isHidden && item.type === "MESSAGE"
      ),
    [transcriptItems]
  );

  const hasUserMessage = messages.some((item) => item.role === "user");

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (canSend) inputRef.current?.focus();
  }, [canSend]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8"
      >
        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center py-12 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-[#e9f4d3] text-[#245447]">
              <Sparkles size={27} />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">
              {sessionStatus === "CONNECTING"
                ? "正在準備你的練習空間"
                : sessionStatus === "CONNECTED"
                  ? "教練正在開場"
                  : "從一段真實回答開始"}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              {sessionStatus === "DISCONNECTED"
                ? "點選「開始語音練習」，允許麥克風後即可說話；也能全程使用文字。"
                : "不用先準備完美答案。先照你的方式說，教練會從最值得追問的地方開始。"}
            </p>
          </div>
        )}

        {messages.map((item) => {
          const isUser = item.role === "user";
          const text = item.title ?? "";
          const isPlaceholder = text.startsWith("[") && text.endsWith("]");

          return (
            <div
              key={item.itemId}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[88%] sm:max-w-[78%] ${isUser ? "text-right" : ""}`}>
                <div
                  className={`rounded-[22px] px-4 py-3 text-left text-[15px] leading-7 ${
                    isUser
                      ? "rounded-br-md bg-[#183d35] text-white"
                      : "rounded-bl-md border border-black/[0.05] bg-white text-slate-800 shadow-[0_8px_30px_rgba(20,40,35,0.06)]"
                  } ${isPlaceholder ? "italic opacity-60" : ""}`}
                >
                  <ReactMarkdown>{
                    isPlaceholder ? text.slice(1, -1) : text
                  }</ReactMarkdown>
                </div>
                {!isUser && text && !isPlaceholder && (
                  <div className="mt-1 flex justify-start pl-1">
                    <CopyButton text={text} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {canSend && !hasUserMessage && messages.length > 0 && (
          <div className="mx-auto max-w-2xl pt-2">
            <p className="mb-2 text-center text-xs font-medium text-slate-400">
              或直接選一個練習方向
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onQuickPrompt(item.prompt)}
                  className="rounded-full border border-[#183d35]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#245447] transition hover:border-[#183d35]/30 hover:bg-[#f4f8ed]"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-black/[0.06] bg-white/70 px-4 py-4 backdrop-blur sm:px-7">
        {canSend && (
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isListening ? "animate-pulse bg-rose-500" : "bg-emerald-500"
                }`}
              />
              {isListening
                ? "正在收音"
                : isPTTActive
                  ? "按住麥克風再回答"
                  : "可直接開口回答"}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <CornerDownLeft size={12} /> Enter 送出 · Shift + Enter 換行
            </span>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-[22px] border border-black/[0.09] bg-white p-2 shadow-[0_10px_35px_rgba(24,61,53,0.07)] focus-within:border-[#245447]/35">
          <textarea
            ref={inputRef}
            rows={1}
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                canSend &&
                userText.trim()
              ) {
                event.preventDefault();
                onSendMessage();
              }
            }}
            disabled={!canSend}
            placeholder={canSend ? "也可以用文字回答…" : "開始練習後可輸入文字"}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />

          {isPTTActive && (
            <button
              type="button"
              onPointerDown={handleTalkButtonDown}
              onPointerUp={handleTalkButtonUp}
              onPointerLeave={() => {
                if (isPTTUserSpeaking) handleTalkButtonUp();
              }}
              disabled={!canSend}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition ${
                isPTTUserSpeaking
                  ? "scale-95 bg-rose-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              } disabled:opacity-40`}
              aria-label={isPTTUserSpeaking ? "放開送出語音" : "按住說話"}
            >
              <Mic size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={onSendMessage}
            disabled={!canSend || !userText.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#183d35] text-white transition hover:bg-[#245447] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            aria-label="送出訊息"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
