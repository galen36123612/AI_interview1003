import test from "node:test";
import assert from "node:assert/strict";
import { createPsychSession, sessionConfiguration } from "../src/app/psych-support/session.mjs";
import { applyTranscriptEvent } from "../src/app/psych-support/transcript.mjs";

const SDP = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const request = (headers = {}, body = SDP) => new Request("https://preview.example/api/psych/session", {
  method: "POST", headers: { origin: "https://preview.example", "content-type": "application/sdp",
    "x-psych-preview-consent": "1", ...headers }, body,
});

test("session is isolated prompt-only gpt-realtime with no corpus tools", () => {
  const config = sessionConfiguration();
  assert.equal(config.model, "gpt-realtime");
  assert.equal(config.audio.input.turn_detection.type, "semantic_vad");
  assert.equal(config.audio.input.turn_detection.eagerness, "low");
  assert.deepEqual(config.tools, []);
});

test("reject cross-origin, missing consent, wrong MIME, invalid SDP before OpenAI", async () => {
  let called = false;
  const fake = async () => { called = true; throw new Error("must not call"); };
  for (const [headers, body, expected] of [
    [{ origin: "https://other.example" }, SDP, 403],
    [{ "x-psych-preview-consent": "0" }, SDP, 400],
    [{ "content-type": "application/json" }, SDP, 415],
    [{}, "invalid", 400], [{}, SDP + "a".repeat(100_000), 400],
  ]) {
    assert.equal((await createPsychSession(request(headers, body), "test-key", fake)).status, expected);
  }
  assert.equal(called, false);
});

test("missing key fails without network or secret exposure", async () => {
  const result = await createPsychSession(request(), undefined, () => assert.fail("network"));
  assert.equal(result.status, 503);
});

test("unified WebRTC sends fixed server config; browser receives SDP only", async () => {
  const result = await createPsychSession(request(), "synthetic-secret", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/realtime/calls");
    assert.equal(init.headers.Authorization, "Bearer synthetic-secret");
    assert.equal(init.body.get("sdp"), SDP);
    assert.equal(JSON.parse(init.body.get("session")).model, "gpt-realtime");
    return new Response(SDP);
  });
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("content-type"), "application/sdp");
  assert.equal(await result.text(), SDP);
});

test("upstream errors and invalid payloads never echo upstream secrets", async () => {
  for (const upstream of [new Response("synthetic-secret", { status: 401 }), new Response("invalid-answer")]) {
    const result = await createPsychSession(request(), "synthetic-secret", async () => upstream);
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes("synthetic-secret"));
  }
  const result = await createPsychSession(request(), "synthetic-secret", async () => { throw new Error("synthetic-secret"); });
  assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes("synthetic-secret"));
});

test("transcripts preserve audio order and deduplicate final text", () => {
  let messages = applyTranscriptEvent([], { type: "conversation.item.created", item: { id: "u1", role: "user", content: [] } });
  messages = applyTranscriptEvent(messages, { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "合成" });
  messages = applyTranscriptEvent(messages, { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "合成問題" });
  messages = applyTranscriptEvent(messages, { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "合成回覆" });
  assert.deepEqual(messages, [{ id: "u1", role: "user", text: "合成問題" }, { id: "a1", role: "assistant", text: "合成回覆" }]);
});

test("ignore credential, session, and function events rather than retaining raw payloads", () => {
  const state = [];
  assert.equal(applyTranscriptEvent(state, { type: "session.created", client_secret: "synthetic-secret" }), state);
  assert.equal(applyTranscriptEvent(state, { type: "conversation.item.created", item: { id: "t1", type: "function_call", name: "evil", content: [] } }), state);
});
