import test from "node:test";
import assert from "node:assert/strict";
import { createTurnController } from "../src/app/psych-support/turns.mjs";
import { applyTranscriptEvent } from "../src/app/psych-support/transcript.mjs";

const textItem = (id, text = "課業讓我有壓力") => ({ id, type: "message", role: "user", content: [{ type: "input_text", text }] });
const ack = (item) => ({ type: "conversation.item.added", item });
const audio = (id) => ({ id, type: "message", role: "user", content: [{ type: "input_audio" }] });
const asr = (id, transcript) => ({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript });
const created = (id, turnId) => ({ type: "response.created", response: { id, metadata: { turn_id: turnId } } });
const done = (id) => ({ type: "response.done", response: { id, status: "completed" } });
function harness() {
  const sent = [], mic = [], discarded = [], notices = [];
  let now = 1000;
  const ctrl = createTurnController({ send: (e) => sent.push(e), setMicrophoneEnabled: (value) => mic.push(value),
    onDiscard: (id) => discarded.push(id), onNotice: (notice) => notices.push(notice), now: () => now });
  return { ctrl, sent, mic, discarded, notices, tick: (ms) => { now += ms; },
    replies: () => sent.filter((e) => e.type === "response.create") };
}

test("text is sent verbatim and gets one response only after server acknowledgement", () => {
  const h = harness(), item = textItem("t1", "你好");
  h.ctrl.submitText(item);
  assert.equal(h.replies().length, 0);
  assert.deepEqual(h.sent.find((e) => e.type === "conversation.item.create").item, item);
  assert.equal(h.mic.at(-1), false);
  h.ctrl.handle(ack(item)); h.ctrl.handle(ack(item));
  assert.equal(h.replies().length, 1);
  assert.deepEqual(h.replies()[0].response.metadata, { turn_id: "t1", input_kind: "text" });
});

test("empty speech does not restart greeting, interrupt playback, or trigger a reply", () => {
  const h = harness(); h.ctrl.greeting("hello"); h.ctrl.handle(created("r0", "welcome"));
  h.ctrl.handle({ type: "output_audio_buffer.started", response_id: "r0" });
  h.ctrl.handle(ack(audio("noise")));
  assert.equal(h.ctrl.handle(asr("noise", "  ")), false);
  assert.equal(h.replies().length, 1);
  assert.equal(h.sent.filter((e) => ["response.cancel", "output_audio_buffer.clear"].includes(e.type)).length, 0);
  assert.deepEqual(h.discarded, ["noise"]);
  assert.ok(h.notices.at(-1).includes("沒有聽清楚"));
});

test("failed transcription discards the item without inference", () => {
  const h = harness();
  h.ctrl.handle({ type: "conversation.item.input_audio_transcription.failed", item_id: "failed" });
  assert.deepEqual(h.discarded, ["failed"]); assert.equal(h.replies().length, 0);
});

test("typing mutes microphone and deletes late spoken input instead of answering it", () => {
  const h = harness(); h.ctrl.handle(ack(audio("old")));
  h.ctrl.setDrafting(true);
  assert.equal(h.mic.at(-1), false); assert.equal(h.ctrl.allowsVoice(), false);
  assert.equal(h.ctrl.handle(asr("old", "背景聲")), false);
  h.ctrl.handle({ type: "input_audio_buffer.committed", item_id: "later" });
  assert.equal(h.ctrl.handle(ack(audio("later"))), false);
  assert.equal(h.ctrl.handle(asr("later", "背景聲")), false);
  assert.equal(h.replies().length, 0);
  assert.deepEqual(h.discarded, ["old", "later"]);
  h.ctrl.setDrafting(false); assert.equal(h.mic.at(-1), true);
});

test("typed turn cancels old speech and waits for response.done before new inference", () => {
  const h = harness(); h.ctrl.handle(asr("v1", "舊問題")); h.ctrl.handle(created("r1", "v1"));
  h.ctrl.handle({ type: "output_audio_buffer.started", response_id: "r1" });
  h.ctrl.submitText(textItem("t1")); h.ctrl.handle(ack(textItem("t1")));
  assert.equal(h.replies().length, 1);
  assert.equal(h.sent.filter((e) => e.type === "response.cancel").length, 1);
  assert.equal(h.ctrl.handle({ type: "response.output_audio_transcript.delta", response_id: "r1", item_id: "stale", delta: "舊回覆" }), false);
  h.ctrl.handle(done("r1")); assert.equal(h.replies().length, 2);
  assert.equal(h.replies()[1].response.metadata.turn_id, "t1");
  h.ctrl.handle(created("r2", "t1")); h.ctrl.handle(done("r1"));
  assert.equal(h.mic.at(-1), false); // Old terminal events must not release new text hold.
});

test("new text arriving before response.created still serializes cancellation", () => {
  const h = harness(); h.ctrl.greeting("hello");
  h.ctrl.submitText(textItem("t1")); h.ctrl.handle(ack(textItem("t1")));
  assert.equal(h.sent.filter((e) => e.type === "response.cancel").length, 0);
  h.ctrl.handle(created("r0", "welcome")); h.ctrl.handle(created("r0", "welcome"));
  assert.equal(h.sent.filter((e) => e.type === "response.cancel").length, 1);
  h.ctrl.handle(done("r0")); assert.equal(h.replies().length, 2);
});

test("text reply holds microphone until output audio has finished, not just generation", () => {
  const h = harness(); h.ctrl.submitText(textItem("t1")); h.ctrl.handle(ack(textItem("t1")));
  h.ctrl.handle(created("r1", "t1")); h.ctrl.handle({ type: "output_audio_buffer.started", response_id: "r1" });
  h.ctrl.handle(done("r1")); assert.equal(h.mic.at(-1), false);
  h.ctrl.handle({ type: "output_audio_buffer.stopped", response_id: "r1" });
  assert.equal(h.mic.at(-1), true);
});

test("late playback end from a cancelled response does not unlock the next reply", () => {
  const h = harness(); h.ctrl.submitText(textItem("t1")); h.ctrl.handle(ack(textItem("t1")));
  h.ctrl.handle(created("r1", "t1")); h.ctrl.handle({ type: "output_audio_buffer.started", response_id: "r1" });
  h.ctrl.submitText(textItem("t2")); h.ctrl.handle(ack(textItem("t2"))); h.ctrl.handle(done("r1"));
  h.ctrl.handle(created("r2", "t2")); h.ctrl.handle({ type: "output_audio_buffer.started", response_id: "r2" });
  h.ctrl.handle(done("r2"));
  assert.equal(h.ctrl.handle({ type: "output_audio_buffer.cleared", response_id: "r1" }), false);
  assert.equal(h.mic.at(-1), false);
  h.ctrl.handle({ type: "output_audio_buffer.stopped", response_id: "r2" }); assert.equal(h.mic.at(-1), true);
});

test("valid spoken input triggers exactly one reply after transcription, not VAD", () => {
  const h = harness(); h.ctrl.handle({ type: "input_audio_buffer.speech_started", item_id: "v1" });
  h.ctrl.handle({ type: "input_audio_buffer.committed", item_id: "v1" });
  assert.equal(h.replies().length, 0);
  h.ctrl.handle(asr("v1", "我擔心老師不聽我說")); h.ctrl.handle(asr("v1", "我擔心老師不聽我說"));
  assert.equal(h.replies().length, 1);
});

test("push-to-talk commits usable audio but waits for ASR; very short taps do not commit", () => {
  const h = harness(); h.ctrl.setManual(true);
  assert.ok(h.ctrl.beginRecording()); h.ctrl.finishRecording();
  assert.equal(h.sent.filter((e) => e.type === "input_audio_buffer.commit").length, 0);
  assert.ok(h.ctrl.beginRecording()); h.tick(300); h.ctrl.finishRecording();
  assert.equal(h.sent.filter((e) => e.type === "input_audio_buffer.commit").length, 1);
  assert.equal(h.replies().length, 0); assert.equal(h.mic.at(-1), false);
  h.ctrl.handle(asr("manual", "測試語音")); assert.equal(h.replies().length, 1);
});

test("latest typed turn wins over a still-unacknowledged earlier submission", () => {
  const h = harness(); h.ctrl.submitText(textItem("t1")); h.ctrl.submitText(textItem("t2"));
  h.ctrl.handle(ack(textItem("t1"))); assert.equal(h.replies().length, 0);
  h.ctrl.handle(ack(textItem("t2"))); assert.equal(h.replies().length, 1);
  assert.equal(h.replies()[0].response.metadata.turn_id, "t2");
});

test("inference rejection releases its hold rather than blocking subsequent input forever", () => {
  const h = harness(); h.ctrl.submitText(textItem("t1")); h.ctrl.handle(ack(textItem("t1")));
  h.ctrl.handle({ type: "error", error: { event_id: "reply_t1", code: "synthetic_rejection" } });
  assert.equal(h.mic.at(-1), true);
  h.ctrl.submitText(textItem("t2")); h.ctrl.handle(ack(textItem("t2"))); assert.equal(h.replies().length, 2);
});

test("empty or failed audio is removed from the transcript, not shown as user speech", () => {
  const messages = [{ id: "u1", role: "user", text: "[正在辨識語音…]", receivedAt: 1 }];
  assert.deepEqual(applyTranscriptEvent(messages, asr("u1", "")), []);
  assert.deepEqual(applyTranscriptEvent(messages, { type: "conversation.item.input_audio_transcription.failed", item_id: "u1" }), []);
});

test("disposed controller ignores late acknowledgements and cannot send or enable microphone", () => {
  const h = harness(); h.ctrl.submitText(textItem("t1")); h.ctrl.dispose();
  const sentCount = h.sent.length, micCount = h.mic.length;
  assert.equal(h.ctrl.handle(ack(textItem("t1"))), false);
  h.ctrl.setDrafting(false); h.ctrl.submitText(textItem("t2"));
  assert.equal(h.sent.length, sentCount); assert.equal(h.mic.length, micCount);
});
