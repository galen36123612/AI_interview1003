/** Opt-in local console diagnostics. No transcript, query, audio, instructions,
 * raw provider message, credentials, persistence or remote telemetry. */
export function diagnosticSink() {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("trace") !== "1") return null;
  return (record) => console.info("[psych-route]", JSON.stringify(record));
}

export function safeErrorDetails(error) {
  const code = typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(error.code) ? error.code : "unknown_error";
  const param = typeof error?.param === "string" && /^[a-z_][a-z0-9_.]{0,63}$/i.test(error.param) ? error.param : null;
  const message = typeof error?.message === "string" ? error.message : "";
  let category = "unclassified";
  if (/no active response|no response.*cancel|cancel.*(?:not found|not active)/i.test(message)) category = "cancel_without_active_response";
  else if (/output audio buffer.*(?:empty|not|clear)|no audio.*(?:playing|buffer)/i.test(message)) category = "output_audio_state";
  else if (/input audio buffer.*(?:empty|small|short)|buffer.*too small/i.test(message)) category = "input_audio_state";
  else if (/(?:event_id|item.id|identifier).*(?:length|long|characters)/i.test(message)) category = "identifier_length";
  return { code, param, category };
}

export function createDiagnosticEmitter(sink, now = Date.now) {
  const publish = (record) => { try { sink?.(record); } catch { /* Diagnostics cannot break a turn. */ } };
  return (phase, fields, instructions) => {
    if (!sink) return;
    const record = { phase, at: now(), ...fields };
    publish(record);
    if (typeof instructions === "string" && globalThis.crypto?.subtle) {
      // Hash the exact per-response instructions sent, without retaining/logging them.
      void crypto.subtle.digest("SHA-256", new TextEncoder().encode(instructions)).then((digest) => {
        publish({ phase: "instructions_digest", at: now(), event_id: fields.event_id,
          turn_id: fields.turn_id, sha256: [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("") });
      }).catch(() => {});
    }
  };
}
