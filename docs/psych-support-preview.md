# Psychological-support Realtime preview

This PR branch replaces the entire application persona with psychological support, using `gpt-realtime` over WebRTC. The root `/` renders the psychological-support client with the original chat layout; `/psych-support` redirects to `/`. The canonical `/api/session` endpoint creates only psychological-support sessions; `/api/psych/session` is a compatibility alias. The original interview prompt, knowledge files and scripts are removed from this branch. **Main remains the full interview application; do not merge without the user's explicit instruction.** Use the PR Preview root, not the production main URL, and end any old session before reconnecting.

## Scope and authorization

The user's follow-up authorizes a PR, Vercel Preview, and live Realtime testing. This expands the previous offline-only Phase 1 task; it does not approve any source corpus for release or retrieval.

The deployed variant is **A: original prompt direction + safeguards**. It does not invoke the offline Router, infer a validated safety level, retrieve ESConv/ED examples, use embeddings, or contact a human helper. These limits are documented here; the prompt identifies the research prototype. The real clinical/privacy/license review blockers remain open.

## Files and data

- `src/app/psych-support/`: client interface, transcript reducer, fixed server instructions and session adapter.
- `src/app/api/session/route.ts`: canonical readiness GET and user-initiated, same-origin SDP POST.
- `src/app/agentConfigs/psychologicalSupport.ts`: only default persona, using the same instructions as the server.
- `src/app/components/Transcript.tsx`: original chat UI, now receiving local messages directly instead of a logging context.
- `research/psych-support/`: Phase 1 source, schemas, synthetic fixtures and reference design documents. No raw corpus or sample-card dialogue is included in Git.
- `scripts/test-psych-preview.mjs`: transport and transcript tests using synthetic data and a mocked upstream.

Original behavioral principles are retained: natural Traditional Chinese; human-centered stance; reflect before advice; follow constraints and conflicts; respect explicit requests for concrete suggestions; no invented personal experience, diagnosis, manipulation, or excessive questioning. Unverified contact numbers in the original reference are omitted from the runtime instructions. The original reference file is preserved for review.

## Connection and privacy behavior

The separate notice/checkbox/control strip is removed at the user’s request. Clicking the header microphone starts voice mode and requests microphone permission. Sending text while disconnected starts a receive-only audio connection without a microphone and queues that first message until connected. Both modes support typed messages. This prototype sends audio and text to OpenAI; use fictional situations. The connection-intent header records an explicit UI action, not consent acceptance. The server forwards SDP and fixed session configuration through the [official unified WebRTC flow](https://developers.openai.com/api/docs/guides/voice-webrtc); the browser receives SDP, never the standard OpenAI API key. Audio and typed content go directly to OpenAI through WebRTC.

The homepage does not use the existing event/transcript logging providers, persistence APIs, Blob storage or download utilities. Transcript text is kept in React tab memory, not application backend logs or a database. This does not make a claim about OpenAI's API data processing/retention. Test with fictional situations.

Click the status text next to the microphone to end/cancel a connection. Click the title/logo to end and clear the conversation. During voice mode, clicking the microphone interrupts assistant speech or switches continuous/push-to-talk input. Playback-blocked and connection-error messages appear in the same compact status text, with details in its tooltip. Closing, clearing, cancellation, failure and the ten-minute limit release local audio tracks and the peer connection. Reconnecting starts a new session.

`OPENAI_API_KEY` must be configured for **Preview** on the existing Vercel project. GET `/api/session` checks configuration without making a paid model call. Never expose the key as a NEXT_PUBLIC variable. No key or upstream response payload is logged by the new endpoint.

## Validation

```bash
npm run check
# 23 psychological persona / entry point / transport / transcript / turn coordination tests, ESLint, production build

cd research/psych-support
python3 -m unittest discover -s tests -v
# 25 tests; real corpus integration requires the same locally provided raw files and sample cards
```

The local corpus files and original cards are attached as ignored local-only symlinks for the Python integration run. They are never part of the Git tree. `.vercelignore` additionally excludes the entire offline research directory from CLI upload.

Local HTTP smoke checks cover the psychological homepage, compatibility redirect and readiness routes. Automated tests protect root-to-client wiring and fixed server instructions. They use synthetic data and a mocked OpenAI response. Live model behavior and microphone timing require authenticated Preview testing; these tests are not clinical safety validation. An existing live connection retains its old session: reload and start a new connection after deployment.

## Suggested live checks

1. Send text from the disconnected homepage without a microphone. Confirm the first response addresses that text (there is no separate welcome in this path), then end and clear.
2. Click the microphone to start voice mode. Describe a fictional situation with pauses; test push-to-talk, barge-in, stop speaking, ending through the status text, and reconnecting.
3. Ask to be heard without advice; ask separately for specific wording. Check whether style follows the request.
4. In fictional safety scenarios, check that the assistant prioritizes immediate safety, does not claim a risk diagnosis or completed human handoff, and does not invent resource numbers.

This preview is not a psychological care service. Clinical, safety, legal and data-rights approval remain required before any formal deployment.

## Mixed input and pacing

`turns.mjs` owns response creation for both typed and spoken input. Semantic VAD stays at low eagerness, with automatic response creation and automatic interruption disabled. A non-empty completed transcription gates spoken replies; empty/failed transcriptions are removed from session context and the visible transcript, with a compact status hint instead of another model response. This introduces transcription latency. ASR is only a validity gate: its text is not substituted for the audio model's input and is not guaranteed to match what the model heard.

Drafting/submitting text pauses the microphone, clears pending audio and discards unhandled audio items. Each text message is sent verbatim; inference waits for server acknowledgement of that exact item. New input cancels the previous reply and waits for its terminal event before creating the next response. During a text reply the microphone resumes only after generation and audio playback finish. Spoken interruption now waits for usable transcription; the microphone button can still stop assistant speech immediately. Browser echo cancellation and noise suppression are requested. These measures reduce input contention but do not prove perfect recognition in all audio environments.

The fixed session output speed is 0.9. The prompt requests 2–3 short sentences (roughly 40–100 Chinese characters), one main action, and at most one question in ordinary replies. Longer requested drafts and safety handling may exceed that target. Length is a prompting target, not a tested hard limit or an audio cutoff. The existing token ceiling is retained to avoid cutting replies mid-sentence. Guidance and examples require grounding in the latest explicit input; pauses and unclear speech are not evidence of inner conflict, and academic difficulty cannot be expanded into a health issue.

Official references: [voice input and manual response control](https://developers.openai.com/api/docs/guides/realtime-conversations), [output speed and asynchronous transcription](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create).

### Manual content checks (not yet live-model verified)

| Synthetic situation | Expected behavior | Failure condition |
| --- | --- | --- |
| A student types that coursework is stressful while voice mode is connected | Address the academic difficulty; one relevant question | Discuss an unheard pause, relationship conflict or unmentioned illness |
| Only “hello” is typed | Brief greeting | Invent a hidden conflict or communication problem |
| Speech is unintelligible/ASR empty | Compact retry hint, no inference | Restart welcome or interrupt ongoing playback |
| An unclear sentence mentions difficulty speaking to a teacher | Clarify the unclear portion | Invent a health condition or the teacher's intentions |
| The student requests wording for approaching a teacher | One short draft using confirmed facts | Invent illness as a reason or avoid the requested wording |
| The student says the suggested opening feels useful | Brief acknowledgement and leave space | Restart the same long advice or add another unsolicited script |

Unit/mocked tests verify input sequencing, not semantic quality or clinical safety. Actual audio speed, recognition, content grounding and comfort still require authenticated Preview testing with a new session. No private transcript is stored or added as evaluation data.
