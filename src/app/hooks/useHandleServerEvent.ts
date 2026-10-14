"use client";

import { useRef } from "react";

import { useEvent } from "@/app/contexts/EventContext";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { AgentConfig, ServerEvent, SessionStatus } from "@/app/types";

interface UseHandleServerEventParams {
  setSessionStatus: (status: SessionStatus) => void;
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  sendClientEvent: (
    event: Record<string, unknown>,
    label?: string
  ) => boolean;
  setSelectedAgentName: (name: string) => void;
  setIsOutputAudioBufferActive: (active: boolean) => void;
  onConfirmedTerm?: (term: { canonical: string; variants: string[] }) => void;
}

function textFromContent(content: any): string {
  const parts = Array.isArray(content) ? content : content ? [content] : [];
  return parts
    .map(
      (part) =>
        part?.text ||
        part?.transcript ||
        part?.output_text ||
        part?.input_text ||
        part?.audio?.transcript ||
        ""
    )
    .join("");
}

export function useHandleServerEvent({
  setSessionStatus,
  selectedAgentName,
  selectedAgentConfigSet,
  sendClientEvent,
  setSelectedAgentName,
  setIsOutputAudioBufferActive,
  onConfirmedTerm,
}: UseHandleServerEventParams) {
  const {
    transcriptItems,
    addTranscriptBreadcrumb,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItem,
  } = useTranscript();
  const { logServerEvent } = useEvent();

  const knownMessageIdsRef = useRef(new Set<string>());
  const responseItemIdsRef = useRef<Record<string, string>>({});
  const handledCallsRef = useRef(new Set<string>());

  for (const item of transcriptItems) {
    if (item.type === "MESSAGE") knownMessageIdsRef.current.add(item.itemId);
  }

  const ensureMessage = (
    itemId: string,
    role: "user" | "assistant",
    initialText = ""
  ) => {
    if (knownMessageIdsRef.current.has(itemId)) return;
    knownMessageIdsRef.current.add(itemId);
    addTranscriptMessage(itemId, role, initialText);
  };

  const assistantItemId = (event: any) =>
    event.item_id ||
    event.output_item_id ||
    event.item?.id ||
    responseItemIdsRef.current[event.response_id] ||
    event.response_id;

  const handleFunctionCall = async (outputItem: any) => {
    const callId = outputItem.call_id || outputItem.id;
    if (!callId || handledCallsRef.current.has(callId)) return;
    handledCallsRef.current.add(callId);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(outputItem.arguments || "{}");
    } catch {
      args = {};
    }

    const currentAgent = selectedAgentConfigSet?.find(
      (agent) => agent.name === selectedAgentName
    );

    let result: unknown = { ok: false, error: "Tool is not configured." };

    if (currentAgent?.toolLogic?.[outputItem.name]) {
      result = await currentAgent.toolLogic[outputItem.name](
        args,
        transcriptItems,
        addTranscriptBreadcrumb
      );
    } else if (outputItem.name === "transferAgents") {
      const destination = String(args.destination_agent || "");
      const nextAgent = selectedAgentConfigSet?.find(
        (agent) => agent.name === destination
      );
      if (nextAgent) setSelectedAgentName(nextAgent.name);
      result = { ok: Boolean(nextAgent), destination_agent: destination };
    }

    if (
      result &&
      typeof result === "object" &&
      "kind" in result &&
      result.kind === "confirmed_term" &&
      "canonical" in result &&
      typeof result.canonical === "string"
    ) {
      onConfirmedTerm?.({
        canonical: result.canonical,
        variants:
          "variants" in result && Array.isArray(result.variants)
            ? result.variants.filter(
                (variant): variant is string => typeof variant === "string"
              )
            : [],
      });
    }

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      },
      `tool result: ${outputItem.name}`
    );
    sendClientEvent({ type: "response.create" }, "continue after tool");
  };

  const handleServerEvent = (serverEvent: ServerEvent) => {
    const event: any = serverEvent;
    logServerEvent(event);

    switch (event.type) {
      case "session.created":
      case "session.updated":
        setSessionStatus("CONNECTED");
        break;

      case "output_audio_buffer.started":
        setIsOutputAudioBufferActive(true);
        break;

      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setIsOutputAudioBufferActive(false);
        break;

      case "conversation.item.created":
      case "conversation.item.added": {
        const item = event.item;
        if (!item?.id || !item?.role) break;
        const text = textFromContent(item.content);
        ensureMessage(
          item.id,
          item.role,
          item.role === "user" && !text ? "[正在辨識語音…]" : text
        );
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        if (!event.item_id) break;
        const transcript = event.transcript?.trim() || "[沒有聽清楚]";
        ensureMessage(event.item_id, "user", transcript);
        updateTranscriptMessage(event.item_id, transcript, false);
        updateTranscriptItem(event.item_id, { status: "DONE" });
        break;
      }

      case "conversation.item.input_audio_transcription.failed": {
        if (!event.item_id) break;
        ensureMessage(event.item_id, "user", "[沒有聽清楚]");
        updateTranscriptMessage(event.item_id, "[沒有聽清楚]", false);
        updateTranscriptItem(event.item_id, { status: "DONE" });
        break;
      }

      case "response.output_item.added": {
        if (event.response_id && event.item?.id) {
          responseItemIdsRef.current[event.response_id] = event.item.id;
        }
        break;
      }

      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
      case "response.text.delta":
      case "response.output_text.delta": {
        const itemId = assistantItemId(event);
        if (!itemId || !event.delta) break;
        ensureMessage(itemId, "assistant");
        updateTranscriptMessage(itemId, event.delta, true);
        break;
      }

      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
      case "response.text.done":
      case "response.output_text.done": {
        const itemId = assistantItemId(event);
        const text = event.transcript || event.text || "";
        if (!itemId || !text) break;
        ensureMessage(itemId, "assistant", text);
        updateTranscriptMessage(itemId, text, false);
        updateTranscriptItem(itemId, { status: "DONE" });
        break;
      }

      case "response.output_item.done": {
        const item = event.item;
        if (item?.type === "function_call") {
          void handleFunctionCall(item);
          break;
        }
        const text = textFromContent(item?.content);
        if (item?.id && item?.role === "assistant" && text) {
          ensureMessage(item.id, "assistant", text);
          updateTranscriptMessage(item.id, text, false);
          updateTranscriptItem(item.id, { status: "DONE" });
        }
        break;
      }

      case "response.done":
      case "response.completed":
        for (const outputItem of event.response?.output || []) {
          if (outputItem.type === "function_call") {
            void handleFunctionCall(outputItem);
          }
        }
        break;

      case "error":
        console.error("Realtime API error", event.error || event);
        break;

      default:
        break;
    }
  };

  const handleServerEventRef = useRef(handleServerEvent);
  handleServerEventRef.current = handleServerEvent;
  return handleServerEventRef;
}
