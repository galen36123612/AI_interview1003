/** Arbitrate typed and spoken turns in memory. No audio or raw event logging. */
export const VOICE_TURN_DETECTION = Object.freeze({
  type: "semantic_vad", eagerness: "low", create_response: false, interrupt_response: false,
});

export function createTurnController({ send, setMicrophoneEnabled, onDiscard, onNotice, now = Date.now }) {
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
  const audioItems = new Set();
  const blocked = new Set();
  const handled = new Set();
  const deleted = new Set();
  const cancelledResponses = new Set();

  const emit = (event) => { if (!disposed) send(event); };
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
    emit({ type: "response.create", event_id: `reply_${turn.id}`, response: {
      metadata: { turn_id: turn.id, input_kind: turn.kind },
      ...(turn.instructions ? { instructions: turn.instructions } : {}),
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
      pending = { id: item.id, kind: "text", ready: false };
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
      if (cancelledResponses.has(event.response_id) && /^response\.(output_audio_transcript|audio_transcript|output_text|text)\./.test(type)) return false;
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
        enqueue({ id, kind: "voice", ready: true });
      }
      if (type === "response.created") {
        const response = event.response;
        if (active && response?.metadata?.turn_id === active.id) {
          active.responseId = response.id;
          if (active.cancelled || pending) cancelActive();
        }
      }
      if (["response.done", "response.completed"].includes(type)) {
        if (active && (event.response?.id === active.responseId || event.response?.metadata?.turn_id === active.id)) {
          active = null; drain(); releaseTextHold();
        }
      }
      if (type === "error" && active && event.error?.event_id === `reply_${active.id}`) {
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
      disposed = true; pending = null; active = null;
      audioItems.clear(); blocked.clear(); handled.clear(); deleted.clear(); cancelledResponses.clear();
    },
  };
}
