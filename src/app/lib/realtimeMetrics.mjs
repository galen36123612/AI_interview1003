function responseId(event) {
  return event?.response?.id || event?.response_id || null;
}

export function createRealtimeMetricsTracker(options = {}) {
  const now = options.now || (() => Date.now());
  const seenResponseIds = new Set();
  let activeResponseId = null;
  let responseStartedAtMs = null;
  let speechStartedAtMs = null;
  let speechAudioStartMs = null;
  let lastSpeechStoppedAtMs = null;

  const counters = {
    interruptions: 0,
    cancelledResponses: 0,
    duplicateResponses: 0,
    completedCandidateTurns: 0,
    completedAssistantResponses: 0,
  };

  const metric = (name, data = {}) => ({
    type: "interview.metric",
    name,
    observed_at_ms: now(),
    ...data,
  });

  const handleClientEvent = (event) => {
    if (event?.type !== "response.cancel") return [];
    counters.cancelledResponses += 1;
    return [
      metric("cancelled_response", {
        source: "client",
        response_id: activeResponseId,
      }),
    ];
  };

  const handleServerEvent = (event) => {
    const emitted = [];

    if (event?.type === "input_audio_buffer.speech_started") {
      const startedAt = now();
      if (activeResponseId) {
        counters.interruptions += 1;
        emitted.push(
          metric("interruption", {
            response_id: activeResponseId,
            reason: "candidate_speech_started",
          })
        );
      }
      if (lastSpeechStoppedAtMs !== null) {
        emitted.push(
          metric("silence_duration", {
            duration_ms: Math.max(0, startedAt - lastSpeechStoppedAtMs),
            observability: "wall_clock_between_detected_speech_segments",
          })
        );
      }
      speechStartedAtMs = startedAt;
      speechAudioStartMs =
        typeof event.audio_start_ms === "number" ? event.audio_start_ms : null;
      emitted.push(
        metric("candidate_turn_start", {
          audio_start_ms: speechAudioStartMs,
        })
      );
    }

    if (event?.type === "input_audio_buffer.speech_stopped") {
      const stoppedAt = now();
      const serverDuration =
        speechAudioStartMs !== null && typeof event.audio_end_ms === "number"
          ? Math.max(0, event.audio_end_ms - speechAudioStartMs)
          : null;
      const wallClockDuration =
        speechStartedAtMs !== null ? Math.max(0, stoppedAt - speechStartedAtMs) : null;

      counters.completedCandidateTurns += 1;
      emitted.push(
        metric("candidate_turn_end", {
          audio_end_ms:
            typeof event.audio_end_ms === "number" ? event.audio_end_ms : null,
        }),
        metric("total_answer_duration", {
          duration_ms: serverDuration ?? wallClockDuration,
          source: serverDuration === null ? "wall_clock" : "server_audio_offsets",
        })
      );
      speechStartedAtMs = null;
      speechAudioStartMs = null;
      lastSpeechStoppedAtMs = stoppedAt;
    }

    if (event?.type === "response.created") {
      const id = responseId(event);
      if ((id && seenResponseIds.has(id)) || (activeResponseId && activeResponseId !== id)) {
        counters.duplicateResponses += 1;
        emitted.push(
          metric("duplicate_assistant_response", {
            response_id: id,
            active_response_id: activeResponseId,
          })
        );
      }
      if (id) seenResponseIds.add(id);
      activeResponseId = id;
      responseStartedAtMs = now();
      emitted.push(metric("assistant_response_start", { response_id: id }));
    }

    if (event?.type === "response.done" || event?.type === "response.completed") {
      const id = responseId(event) || activeResponseId;
      const status = event?.response?.status;
      if (status === "cancelled") {
        counters.cancelledResponses += 1;
        emitted.push(metric("cancelled_response", { source: "server", response_id: id }));
      }
      counters.completedAssistantResponses += 1;
      emitted.push(
        metric("assistant_response_end", {
          response_id: id,
          status: status || "completed",
          duration_ms:
            responseStartedAtMs === null
              ? null
              : Math.max(0, now() - responseStartedAtMs),
        })
      );
      if (!id || id === activeResponseId) activeResponseId = null;
      responseStartedAtMs = null;
    }

    return emitted;
  };

  const snapshot = () => ({ ...counters, activeResponseId });

  const reset = () => {
    seenResponseIds.clear();
    activeResponseId = null;
    responseStartedAtMs = null;
    speechStartedAtMs = null;
    speechAudioStartMs = null;
    lastSpeechStoppedAtMs = null;
    for (const key of Object.keys(counters)) counters[key] = 0;
  };

  return { handleClientEvent, handleServerEvent, snapshot, reset };
}
