import test from "node:test";
import assert from "node:assert/strict";
import { createTurnController, createTextMessage, describeRealtimeError } from "../src/app/psych-support/turns.mjs";
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
  assert.equal(h.replies()[0].response.metadata.turn_id, "t1");
  assert.equal(h.replies()[0].response.metadata.input_kind, "text");
  assert.equal(h.replies()[0].response.metadata.knowledge_route, "core_only");
  assert.equal(h.replies()[0].response.metadata.context_mode, "conversation");
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


test("actual text-item factory uses short IDs and survives acknowledgement matching", () => {
  const h = harness(), item = createTextMessage("合成測試：課業壓力");
  assert.ok(item.id.length <= 32); assert.match(item.id, /^msg_[a-f0-9]{24}$/);
  assert.equal(item.content[0].text, "合成測試：課業壓力");
  h.ctrl.submitText(item); h.ctrl.handle(ack(item));
  assert.equal(h.replies().length, 1);
  assert.equal(h.replies()[0].response.metadata.turn_id, item.id);
});

test("UI error diagnostics include only validated code/parameter, never raw payload", () => {
  const safe = describeRealtimeError({ code: "invalid_value", param: "item.id", message: "synthetic-secret" });
  assert.match(safe, /invalid_value/); assert.match(safe, /item.id/); assert.ok(!safe.includes("synthetic-secret"));
  const unsafe = describeRealtimeError({ code: "Bearer synthetic-secret", param: "user content / synthetic-secret", message: "synthetic-secret" });
  assert.ok(!unsafe.includes("synthetic-secret")); assert.match(unsafe, /unknown_error/);
});

test("an open safety concern carries into a new controller and is reported as it changes", () => {
  const changes = [];
  const h0 = harness();
  const first = createTurnController({ send: (e) => h0.sent.push(e), setMicrophoneEnabled() {}, onDiscard() {}, onNotice() {},
    onConcernChange: (c) => changes.push(c) });
  const item = textItem("m1", "我剛剛吞了一整瓶媽媽的安眠藥");
  first.submitText(item); first.handle(ack(item));
  assert.equal(first.concern(), "medical"); assert.deepEqual(changes, ["medical"]);
  first.dispose();
  // Reconnect (e.g. after the 10-minute limit): the caller passes the last concern back in.
  const sent = [];
  const second = createTurnController({ send: (e) => sent.push(e), setMicrophoneEnabled() {}, onDiscard() {}, onNotice() {},
    initialConcern: "medical", onConcernChange: (c) => changes.push(c) });
  const bye = textItem("m2", "謝謝你，我先去睡了");
  second.submitText(bye); second.handle(ack(bye));
  const reply = sent.find((e) => e.type === "response.create");
  assert.equal(reply.response.metadata.safety_mode, "medical"); assert.deepEqual(reply.response.input, []);
  assert.match(reply.response.instructions, /立即撥打 119/);
  assert.equal(second.concern(), "medical"); assert.deepEqual(changes, ["medical"]);
  // Without the carry-over the same goodbye would be an ordinary turn.
  const sent2 = [];
  const third = createTurnController({ send: (e) => sent2.push(e), setMicrophoneEnabled() {}, onDiscard() {}, onNotice() {} });
  third.submitText(bye); third.handle(ack(bye));
  assert.equal(sent2.find((e) => e.type === "response.create").response.metadata.safety_mode, undefined);
});

test("ordinary replies wait for the pacing delay and carry an output budget; safety replies do not wait", () => {
  const timers = [];
  const sent = [];
  const ctrl = createTurnController({ send: (e) => sent.push(e), setMicrophoneEnabled() {}, onDiscard() {}, onNotice() {},
    replyDelayMs: 1500, schedule: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
    cancelScheduled: (id) => { timers[id].live = false; } });
  const replies = () => sent.filter((e) => e.type === "response.create");
  const item = textItem("d1", "最近壓力好大");
  ctrl.submitText(item); ctrl.handle(ack(item));
  assert.equal(replies().length, 0); assert.equal(timers.length, 1); assert.equal(timers[0].ms, 1500);
  timers[0].fn();
  assert.equal(replies().length, 1); assert.equal(replies()[0].response.max_output_tokens, 768);
  assert.equal(replies()[0].response.metadata.turn_id, "d1");
  ctrl.handle(created("r1", "d1")); ctrl.handle(done("r1"));
  // A newer message during the wait drops the waiting turn without a response.cancel.
  const a = textItem("d2", "其實也沒什麼"); ctrl.submitText(a); ctrl.handle(ack(a));
  assert.equal(timers.length, 2);
  const b = textItem("d3", "算了不說了"); ctrl.submitText(b); ctrl.handle(ack(b));
  assert.equal(timers[1].live, false); assert.equal(sent.filter((e) => e.type === "response.cancel").length, 0);
  timers[1].fn(); // stale timer firing anyway must not request a reply for d2
  assert.equal(replies().length, 1);
  timers[2].fn();
  assert.equal(replies().length, 2); assert.equal(replies()[1].response.metadata.turn_id, "d3");
  ctrl.handle(created("r3", "d3")); ctrl.handle(done("r3"));
  // Safety turns are requested immediately with their own budget.
  const s = textItem("d4", "我現在有傷害自己的念頭"); ctrl.submitText(s); ctrl.handle(ack(s));
  assert.equal(replies().length, 3); assert.equal(replies()[2].response.max_output_tokens, 1536);
  assert.equal(timers.length, 3);
});

test("response usage is traced as counts only", () => {
  const traces = [];
  const sent = [];
  const ctrl = createTurnController({ send: (e) => sent.push(e), setMicrophoneEnabled() {}, onDiscard() {}, onNotice() {}, onTrace: (r) => traces.push(r) });
  const item = textItem("u1", "你好"); ctrl.submitText(item); ctrl.handle(ack(item)); ctrl.handle(created("r1", "u1"));
  ctrl.handle({ type: "response.done", response: { id: "r1", status: "completed",
    usage: { output_tokens: 210, output_token_details: { audio_tokens: 180, text_tokens: 30 } } } });
  const finished = traces.find((r) => r.phase === "response_finished");
  assert.equal(finished.output_tokens, 210); assert.equal(finished.output_audio_tokens, 180); assert.equal(finished.output_text_tokens, 30);
  assert.ok(!JSON.stringify(finished).includes("你好"));
});
