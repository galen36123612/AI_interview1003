"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import Image from "next/image";
import { Check, Copy } from "lucide-react";

import { useTranscript } from "@/app/contexts/TranscriptContext";
import { TranscriptItem } from "@/app/types";

export interface TranscriptProps {
  userText: string;
  setUserText: (value: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  downloadRecording: () => void;
  handleTalkButtonDown: () => void;
  handleTalkButtonUp: () => void;
  isPTTUserSpeaking: boolean;
  isPTTActive: boolean;
  onRate?: (targetEventId: string, rating: number) => void;
  ratingsByTargetId?: Record<string, number>;
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-all duration-200 hover:bg-gray-200 ${
        copied ? "bg-green-50 text-green-600" : "text-gray-500"
      }`}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const AppleMicIcon = ({ isActive }: { isActive: boolean }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={isActive ? "text-white" : "text-gray-700"}
  >
    <rect x="7" y="2" width="6" height="10" rx="3" fill="currentColor" />
    <path
      d="M5 10C5 12.7614 7.23858 15 10 15C12.7614 15 15 12.7614 15 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line x1="10" y1="15" x2="10" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

type RatingOption = { value: number; emoji: string; label: string };

const RATING_OPTIONS: RatingOption[] = [
  { value: 100, emoji: "😍", label: "非常滿意" },
  { value: 80, emoji: "😊", label: "滿意" },
  { value: 50, emoji: "😐", label: "普通" },
  { value: 20, emoji: "😕", label: "不滿意" },
  { value: 0, emoji: "😡", label: "非常不滿意" },
];

const RatingBar = ({
  selected,
  onSelect,
}: {
  selected?: number;
  onSelect?: (score: number) => void;
}) => {
  const [clickedValue, setClickedValue] = React.useState<number | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const handleSelect = (value: number) => {
    setClickedValue(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setClickedValue(null), 550);
    onSelect?.(value);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (selected === undefined) return;
    const index = RATING_OPTIONS.findIndex((option) => option.value === selected);
    if (index < 0) return;

    if (event.key === "ArrowRight") {
      handleSelect(RATING_OPTIONS[Math.min(index + 1, RATING_OPTIONS.length - 1)].value);
    } else if (event.key === "ArrowLeft") {
      handleSelect(RATING_OPTIONS[Math.max(index - 1, 0)].value);
    }
  };

  const activeIndex =
    selected === undefined
      ? -1
      : RATING_OPTIONS.findIndex((option) => option.value === selected);

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-gray-500">滿意度：</span>
      <div
        className="flex items-center gap-2"
        role="radiogroup"
        aria-label="滿意度評分"
        onKeyDown={handleKeyDown}
      >
        {RATING_OPTIONS.map((option, index) => {
          const isActive = selected === option.value;
          const tabIndex = activeIndex === -1 ? (index === 0 ? 0 : -1) : isActive ? 0 : -1;

          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              title={option.label}
              role="radio"
              aria-checked={isActive}
              tabIndex={tabIndex}
              onClick={() => handleSelect(option.value)}
              className={[
                "relative flex h-8 w-8 select-none items-center justify-center rounded-full border",
                "transform transition duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                "active:scale-95",
                isActive
                  ? "scale-105 border-blue-500 bg-white shadow-sm ring-2 ring-blue-200"
                  : "border-gray-200 bg-white hover:border-gray-300",
              ].join(" ")}
            >
              {clickedValue === option.value && (
                <span className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-2 ring-blue-300 opacity-50" />
              )}
              <span className="text-base leading-none">{option.emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

function pickTargetEventId(item: TranscriptItem): string {
  const data = item.data as
    | { eventId?: string; id?: string; item_id?: string; responseId?: string }
    | undefined;
  const itemWithEventId = item as TranscriptItem & { eventId?: string };

  return (
    data?.eventId ||
    data?.id ||
    data?.item_id ||
    data?.responseId ||
    itemWithEventId.eventId ||
    item.itemId
  );
}

function Transcript({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  handleTalkButtonDown,
  handleTalkButtonUp,
  isPTTUserSpeaking,
  isPTTActive,
  onRate,
  ratingsByTargetId,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const transcriptRef = React.useRef<HTMLDivElement | null>(null);
  const previousItemsRef = React.useRef<TranscriptItem[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const firstAssistantIndex = transcriptItems.findIndex(
    (item) => !item.isHidden && item.type === "MESSAGE" && item.role === "assistant"
  );

  React.useEffect(() => {
    const previousItems = previousItemsRef.current;
    const hasNewMessage = transcriptItems.length > previousItems.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = previousItems[index];
      return oldItem && (newItem.title !== oldItem.title || newItem.data !== oldItem.data);
    });

    if ((hasNewMessage || hasUpdatedMessage) && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
    previousItemsRef.current = transcriptItems;
  }, [transcriptItems]);

  React.useEffect(() => {
    if (canSend) inputRef.current?.focus();
  }, [canSend]);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={transcriptRef} className="flex h-full flex-col gap-y-4 overflow-auto p-4">
          {transcriptItems.map((item, index) => {
            const { itemId, type, role, data, expanded, timestamp, title = "", isHidden } = item;
            if (isHidden) return null;

            if (type === "MESSAGE") {
              const isUser = role === "user";
              const isBracketedMessage = title.startsWith("[") && title.endsWith("]");
              const displayTitle = isBracketedMessage ? title.slice(1, -1) : title;
              const targetEventId = isUser ? "" : pickTargetEventId(item);
              const selectedRating = !isUser
                ? ratingsByTargetId?.[targetEventId]
                : undefined;
              const showRatingBar =
                !isUser && index !== firstAssistantIndex && typeof onRate === "function";

              return (
                <div
                  key={itemId}
                  className={`flex flex-col justify-end ${isUser ? "items-end" : "items-start"}`}
                >
                  <div className="relative max-w-lg">
                    <div
                      className={`max-w-lg rounded-xl p-3 ${
                        isUser ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-black"
                      }`}
                    >
                      <div
                        className={`font-mono text-xs ${
                          isUser ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {timestamp}
                      </div>
                      <div
                        className={`whitespace-pre-wrap ${
                          isBracketedMessage ? "italic text-gray-400" : ""
                        }`}
                      >
                        <ReactMarkdown>{displayTitle}</ReactMarkdown>
                      </div>
                      {showRatingBar && (
                        <RatingBar
                          selected={selectedRating}
                          onSelect={(score) => onRate?.(targetEventId, score)}
                        />
                      )}
                    </div>

                    {!isUser && (
                      <div className="absolute right-2 top-2">
                        <CopyButton text={displayTitle} />
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (type === "BREADCRUMB") {
              return (
                <div
                  key={itemId}
                  className="flex flex-col items-start justify-start text-sm text-gray-500"
                >
                  <span className="font-mono text-xs">{timestamp}</span>
                  <div
                    className={`flex items-center whitespace-pre-wrap font-mono text-sm text-gray-800 ${
                      data ? "cursor-pointer" : ""
                    }`}
                    onClick={() => data && toggleTranscriptItemExpand(itemId)}
                  >
                    {data && (
                      <span
                        className={`mr-1 select-none font-mono text-gray-400 transition-transform duration-200 ${
                          expanded ? "rotate-90" : "rotate-0"
                        }`}
                      >
                        ▶
                      </span>
                    )}
                    {title}
                  </div>
                  {expanded && data && (
                    <div className="text-left text-gray-800">
                      <pre className="mb-2 ml-1 mt-2 whitespace-pre-wrap break-words border-l-2 border-gray-200 pl-2 font-mono text-xs">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={itemId} className="flex justify-center font-mono text-sm italic text-gray-500">
                Unknown item type: {type} <span className="ml-2 text-xs">{timestamp}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-x-2 border-t border-gray-200 p-4">
        <input
          ref={inputRef}
          type="text"
          value={userText}
          onChange={(event) => setUserText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSend) onSendMessage();
          }}
          className="flex-1 px-4 py-2 focus:outline-none"
          placeholder="請輸入文字..."
        />

        {isPTTActive && (
          <button
            type="button"
            onClick={isPTTUserSpeaking ? handleTalkButtonUp : handleTalkButtonDown}
            disabled={!canSend}
            className={`rounded-full p-2 transition-colors disabled:opacity-50 ${
              isPTTUserSpeaking ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700"
            }`}
            aria-label={isPTTUserSpeaking ? "Stop recording and send" : "Start recording"}
          >
            <AppleMicIcon isActive={isPTTUserSpeaking} />
          </button>
        )}

        <button
          type="button"
          onClick={onSendMessage}
          disabled={!canSend || !userText.trim()}
          className="rounded-full bg-gray-900 px-2 py-2 text-white disabled:opacity-50"
        >
          <Image src="arrow.svg" alt="Send" width={24} height={24} />
        </button>
      </div>
    </div>
  );
}

export default Transcript;
