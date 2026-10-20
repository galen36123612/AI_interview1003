/** Keep only visible messages in tab memory; never retain raw events or credentials. */
export function applyTranscriptEvent(messages, event) {
  const upsert = (id, role, text, append = false) => {
    if (!id || !["user", "assistant"].includes(role) || typeof text !== "string") return messages;
    const previous = messages.find((m) => m.id === id);
    const next = { id, role, text: append ? (previous?.text || "") + text : text, receivedAt: previous?.receivedAt ?? Date.now() };
    return previous ? messages.map((m) => m.id === id ? next : m) : [...messages, next].slice(-200);
  };
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    if (!event.transcript?.trim()) return messages.filter((m) => m.id !== event.item_id);
    return upsert(event.item_id, "user", event.transcript);
  }
  if (["conversation.item.input_audio_transcription.failed", "conversation.item.deleted"].includes(event.type)) {
    return messages.filter((m) => m.id !== event.item_id);
  }
  if (["conversation.item.added", "conversation.item.created"].includes(event.type)) {
    const item = event.item;
    const text = (item?.content || []).map((c) => c.text || c.transcript || "").join("");
    // Empty assistant items precede streamed transcripts; do not erase their content.
    if (!text && item?.role === "user" && !messages.some((m) => m.id === item.id)) {
      return upsert(item.id, "user", "[正在辨識語音…]");
    }
    return text ? upsert(item?.id, item?.role, text) : messages;
  }
  if (["response.output_audio_transcript.delta", "response.audio_transcript.delta",
    "response.output_text.delta", "response.text.delta"].includes(event.type)) {
    return upsert(event.item_id, "assistant", event.delta, true);
  }
  if (["response.output_audio_transcript.done", "response.audio_transcript.done",
    "response.output_text.done", "response.text.done"].includes(event.type)) {
    return upsert(event.item_id, "assistant", event.transcript ?? event.text ?? "");
  }
  return messages;
}
