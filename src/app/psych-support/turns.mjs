import { selectSafetyResponse } from "./safety.mjs";
import { routeKnowledge, citationFooter, matchesBoundedReply } from "./knowledge.mjs";
import { KNOWLEDGE } from "./knowledge.generated.mjs";
import { diagnosticSink, createDiagnosticEmitter, safeErrorDetails } from "./diagnostics.mjs";

/** Arbitrate typed and spoken turns in memory. No audio or raw event logging. */
export const VOICE_TURN_DETECTION = Object.freeze({
  type: "semantic_vad", eagerness: "low", create_response: false, interrupt_response: false,
});

export function createTextMessage(text) {
  return { id: `msg_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`, type: "message", role: "user",
    content: [{ type: "input_text", text }] };
}

/** Show schema diagnostics only; never expose upstream messages or input payloads. */
export function describeRealtimeError(error) {
  const code = typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(error.code) ? error.code : "unknown_error";
  const param = typeof error?.param === "string" && /^[a-z_][a-z0-9_.]{0,63}$/i.test(error.param) ? error.param : "";
  const origin = ["input_audio_buffer.clear", "input_audio_buffer.commit", "conversation.item.create", "conversation.item.delete",
    "response.create", "response.cancel", "output_audio_buffer.clear", "session.update"].includes(error?.client_event_type) ? error.client_event_type : "";
  return `Realtime 事件錯誤：${code}${param ? `（${param}）` : ""}${origin ? `［${origin}］` : ""}。請重試或重新連線。`;
}

export function createTurnController({ send, setMicrophoneEnabled, onDiscard, onNotice, now = Date.now, onTrace = diagnosticSink() }) {
  const trace = createDiagnosticEmitter(onTrace, now);
  let pending = null;
  let active = null;
  let playing = false;
  let playingId = null;
  let drafting = false;
  let textHold = false;
  let manual = false;
  let recording = false;
  let recordingStartedAt = 0;
  let disposed = false;
  let safetyConcern = null;
  let knowledgeState = { topic: null, articleIds: [] };
  const audioItems = new Set();
  const blocked = new Set();
  const handled = new Set();
  const deleted = new Set();
  const cancelledResponses = new Set();
  const sentEventTypes = new Map();
  let eventSequence = 0;

  const contextFor = (text) => {
    const result = selectSafetyResponse(text, safetyConcern);
    safetyConcern = result.concern;
    if (result.mode) {
      knowledgeState = { topic: null, articleIds: [] };
      return { safety: result.mode, instructions: result.instructions };
    }
    const knowledge = routeKnowledge(text, knowledgeState);
    return { knowledgeRoute: knowledge.route, instructions: knowledge.instructions,
      guideId: knowledge.guideId, replyMode: knowledge.replyMode, sourceMode: knowledge.sourceMode,
      references: knowledge.references, nextKnowledgeState: knowledge.state, scriptedText: knowledge.scriptedText };
  };

  const emit = (event) => {
    if (disposed) return;
    const tagged = { ...event, event_id: event.event_id || `client_${++eventSequence}` };
    sentEventTypes.set(tagged.event_id, tagged.type);
    if (sentEventTypes.size > 64) sentEventTypes.delete(sentEventTypes.keys().next().value);
    send(tagged);
    if (tagged.type === "response.create") {
      trace("response_requested", { event_id: tagged.event_id, ...tagged.response.metadata,
        isolated_input: Array.isArray(tagged.response.input), instructions_chars: tagged.response.instructions?.length || 0,
        knowledge_hash: KNOWLEDGE.content_hash }, tagged.response.instructions);
    } else trace("client_event", { event_id: tagged.event_id, type: tagged.type });
  };
  const syncMicrophone = () => {
    if (!disposed) setMicrophoneEnabled(!drafting && !textHold && (!manual || recording));
  };
  const releaseTextHold = () => {
    if (!drafting && !pending && !active && !playing) textHold = false;
    syncMicrophone();
  };
  const discard = (id) => {
    if (!id || deleted.has(id)) return;
    deleted.add(id); handled.add(id);
    emit({ type: "conversation.item.delete", item_id: id });
    onDiscard(id);
  };
  const blockVoice = () => {
    for (const id of audioItems) if (!handled.has(id)) { blocked.add(id); discard(id); }
    if (pending?.kind === "voice") pending = null;
  };
  const cancelActive = () => {
    if (active) {
      active.cancelled = true;
      if (active.responseId && !active.cancelSent) {
        active.cancelSent = true; cancelledResponses.add(active.responseId);
        emit({ type: "response.cancel", response_id: active.responseId });
      }
    }
    if (playing) { emit({ type: "output_audio_buffer.clear" }); playing = false; }
  };
  const drain = () => {
    if (disposed || active || !pending?.ready) return;
    const turn = pending; pending = null;
    active = { ...turn, responseId: null, cancelled: false, cancelSent: false };
    active.requestEventId = `reply_${turn.id.slice(-24)}`;
    const metadata = { turn_id: turn.id, input_kind: turn.kind, knowledge_version: KNOWLEDGE.version,
      ...(turn.knowledgeRoute ? { knowledge_route: turn.knowledgeRoute, context_mode: turn.replyMode,
        source_mode: turn.sourceMode, guide_id: turn.guideId || "none",
        article_ids: (turn.references || []).map((a) => a.id).join(",") || "none" } : {}),
      ...(turn.safety ? { safety_mode: turn.safety } : {}) };
    active.metadata = metadata;
    emit({ type: "response.create", event_id: active.requestEventId, response: {
      metadata,
      ...(turn.instructions ? { instructions: turn.instructions } : {}),
      ...(turn.safety ? { input: [], max_output_tokens: 1536 } : {}),
    } });
  };
  const enqueue = (turn) => { pending = turn; cancelActive(); drain(); };

  return {
    greeting(instructions) {
      if (!disposed && !active && !pending) enqueue({ id: "welcome", kind: "greeting", ready: true, instructions });
    },
    setDrafting(value) {
      if (disposed) return;
      if (value && !drafting) {
        textHold = true; blockVoice();
        emit({ type: "input_audio_buffer.clear" });
      }
      drafting = value;
      releaseTextHold();
    },
    submitText(item) {
      if (disposed) return;
      textHold = true; drafting = false; recording = false;
      blockVoice(); syncMicrophone(); onNotice("");
      pending = { id: item.id, kind: "text", ready: false,
        ...contextFor(item.content?.filter((c) => c.type === "input_text").map((c) => c.text).join("\n") || "") };
      cancelActive();
      emit({ type: "input_audio_buffer.clear" });
      // Response is requested only after the server acknowledges this exact item.
      emit({ type: "conversation.item.create", item });
    },
    interrupt() { pending = null; cancelActive(); releaseTextHold(); },
    setManual(value) {
      manual = value; recording = false;
      emit({ type: "session.update", session: { type: "realtime", audio: { input: {
        turn_detection: manual ? null : { ...VOICE_TURN_DETECTION },
      } } } });
      emit({ type: "input_audio_buffer.clear" });
      syncMicrophone();
    },
    beginRecording() {
      if (drafting || textHold || !manual || disposed) return false;
      pending = null; cancelActive();
      emit({ type: "input_audio_buffer.clear" });
      recording = true; recordingStartedAt = now(); syncMicrophone();
      return true;
    },
    finishRecording() {
      if (!recording || disposed) return;
      recording = false; syncMicrophone();
      if (now() - recordingStartedAt < 120) {
        emit({ type: "input_audio_buffer.clear" });
        onNotice("錄音太短，請再說一次。"); return;
      }
      emit({ type: "input_audio_buffer.commit" });
      // ASR completion validates the committed audio before requesting a reply.
    },
    allowsVoice() { return !disposed && !drafting && !textHold; },
    handle(event) {
      if (disposed) return false;
      const type = event.type;
      if (type === "error" && event.error && sentEventTypes.has(event.error.event_id)) {
        event.error.client_event_type = sentEventTypes.get(event.error.event_id);
      }
      if (type === "error") trace("provider_error", { ...safeErrorDetails(event.error),
        client_event_type: sentEventTypes.get(event.error?.event_id) || "uncorrelated",
        active_turn: active?.id || null, generating: Boolean(active), playing });
      if (["output_audio_buffer.started", "output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(type)) {
        trace("playback_event", { type, response_id: event.response_id || null });
      }
      if (cancelledResponses.has(event.response_id) && /^response\.(output_audio_transcript|audio_transcript|output_text|text)\./.test(type)) return false;
      // Append trusted source links to the existing message text only. The UI and
      // spoken audio stay unchanged; cancelled/stale responses get no citations.
      if (/^response\.(output_audio_transcript|audio_transcript|output_text|text)\.done$/.test(type)
        && active && !active.cancelled && event.response_id === active.responseId) {
        const field = typeof event.transcript === "string" ? "transcript" : "text";
        // Idempotent on a repeated completed event already decorated by this controller.
        const expectedFooter = citationFooter(active.references || []);
        const text = expectedFooter && event[field]?.endsWith(expectedFooter) ? event[field].slice(0, -expectedFooter.length) : event[field];
        active.sourceReplyAccepted = !active.scriptedText || matchesBoundedReply(text, active.scriptedText);
        if (active.scriptedText) trace("bounded_reply_checked", { turn_id: active.id,
          knowledge_route: active.knowledgeRoute, matches_script: active.sourceReplyAccepted });
        if (active.sourceReplyAccepted && active.nextKnowledgeState) knowledgeState = active.nextKnowledgeState;
        const footer = active.sourceReplyAccepted ? expectedFooter : "";
        if (typeof event[field] === "string" && !event[field].endsWith(footer)) event[field] += footer;
      }
      if (["conversation.item.added", "conversation.item.created"].includes(type)) {
        const item = event.item;
        if (pending?.kind === "text" && item?.id === pending.id) {
          pending.ready = true; drain();
        } else if (item?.role === "user" && item.content?.some((c) => c.type === "input_audio")) {
          audioItems.add(item.id);
          if (drafting || textHold) { blocked.add(item.id); discard(item.id); return false; }
        }
      }
      if (type === "input_audio_buffer.committed") {
        audioItems.add(event.item_id);
        if (drafting || textHold) { blocked.add(event.item_id); discard(event.item_id); return false; }
      }
      if (type === "input_audio_buffer.speech_started") {
        if (drafting || textHold) { blocked.add(event.item_id); return false; }
        onNotice("");
      }
      if (["conversation.item.input_audio_transcription.completed", "conversation.item.input_audio_transcription.failed"].includes(type)) {
        const id = event.item_id;
        if (!id || handled.has(id)) return false;
        if (blocked.has(id) || drafting || textHold) { discard(id); return false; }
        const text = type.endsWith(".completed") ? event.transcript?.trim() : "";
        if (!text) {
          discard(id); onNotice("沒有聽清楚，請再說一次或輸入文字。"); return false;
        }
        handled.add(id); onNotice("");
        enqueue({ id, kind: "voice", ready: true, ...contextFor(text) });
      }
      if (type === "response.created") {
        const response = event.response;
        if (active && response?.metadata?.turn_id === active.id) {
          active.responseId = response.id;
          trace("response_accepted", { turn_id: active.id, response_id: response.id,
            knowledge_route: active.knowledgeRoute || (active.safety ? "safety" : "greeting"),
            metadata_matches: Object.entries(active.metadata).every(([key, value]) => response.metadata[key] === value) });
          if (active.cancelled || pending) cancelActive();
        }
      }
      if (["response.done", "response.completed"].includes(type)) {
        if (active && (event.response?.id === active.responseId || event.response?.metadata?.turn_id === active.id)) {
          if (!active.cancelled && event.response?.status === "completed" && active.nextKnowledgeState
            && (!active.scriptedText || active.sourceReplyAccepted)) knowledgeState = active.nextKnowledgeState;
          trace("response_finished", { turn_id: active.id, response_id: event.response?.id || null,
            status: ["completed", "cancelled", "failed", "incomplete"].includes(event.response?.status) ? event.response.status : "unknown",
            cancelled_by_client: active.cancelled });
          active = null; drain(); releaseTextHold();
        }
      }
      if (type === "error" && active && event.error?.event_id === active.requestEventId) {
        active = null; drain(); releaseTextHold();
      }
      if (type === "output_audio_buffer.started") { playing = true; playingId = event.response_id; syncMicrophone(); }
      if (["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(type)) {
        if (playingId && event.response_id && event.response_id !== playingId) return false;
        playing = false; playingId = null; releaseTextHold();
      }
      if (type === "conversation.item.deleted") onDiscard(event.item_id);
      return true;
    },
    dispose() {
      disposed = true; pending = null; active = null; safetyConcern = null; knowledgeState = { topic: null, articleIds: [] };
      audioItems.clear(); blocked.clear(); handled.clear(); deleted.clear(); cancelledResponses.clear();
      sentEventTypes.clear();
    },
  };
}
