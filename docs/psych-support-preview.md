# Psychological-support Realtime preview

This branch adds `/psych-support`, a private research test page using `gpt-realtime` over WebRTC. The original interview homepage and its session endpoint are unchanged. Do not merge into main without the user's explicit instruction.

## Scope and authorization

The user's follow-up authorizes a PR, Vercel Preview, and live Realtime testing. This expands the previous offline-only Phase 1 task; it does not approve any source corpus for release or retrieval.

The deployed variant is **A: original prompt direction + safeguards**. It does not invoke the offline Router, infer a validated safety level, retrieve ESConv/ED examples, use embeddings, or contact a human helper. The UI labels these boundaries. The real clinical/privacy/license review blockers remain open.

## Files and data

- `src/app/psych-support/`: client interface, transcript reducer, fixed server instructions and session adapter.
- `src/app/api/psych/session/route.ts`: readiness GET and consent-gated, same-origin SDP POST.
- `research/psych-support/`: Phase 1 source, schemas, synthetic fixtures and reference design documents. No raw corpus or sample-card dialogue is included in Git.
- `scripts/test-psych-preview.mjs`: transport and transcript tests using synthetic data and a mocked upstream.

Original behavioral principles are retained: natural Traditional Chinese; human-centered stance; reflect before advice; follow constraints and conflicts; respect explicit requests for concrete suggestions; no invented personal experience, diagnosis, manipulation, or excessive questioning. Unverified contact numbers in the original reference are omitted from the runtime instructions. The original reference file is preserved for review.

## Connection and privacy behavior

Users explicitly acknowledge transmission to OpenAI before connecting. Voice mode requests microphone permission; text mode establishes a receive-only audio connection without a microphone. Both support typed messages. The server forwards SDP and fixed session configuration through the [official unified WebRTC flow](https://developers.openai.com/api/docs/guides/voice-webrtc); the browser receives SDP, never the standard OpenAI API key. Audio and typed content go directly to OpenAI through WebRTC.

The new page does not use the existing event/transcript logging providers, persistence APIs, Blob storage or download utilities. Transcript text is kept in React tab memory, not application backend logs or a database. This does not make a claim about OpenAI's API data processing/retention. Test with fictional situations.

Closing, clearing, cancellation during connection, failure and the ten-minute limit release local audio tracks and the peer connection. Reconnecting starts a new session. Microphone mute, stop assistant audio, playback retry and clear transcript controls are available.

`OPENAI_API_KEY` must be configured for **Preview** on the existing Vercel project. GET `/api/psych/session` checks configuration without making a paid model call. Never expose the key as a NEXT_PUBLIC variable. No key or upstream response payload is logged by the new endpoint.

## Validation

```bash
npm run check
# 15 existing interview contracts + 7 transport/transcript tests, ESLint, production build

cd research/psych-support
python3 -m unittest discover -s tests -v
# 25 tests; real corpus integration requires the same locally provided raw files and sample cards
```

The local corpus files and original cards are attached as ignored local-only symlinks for the Python integration run. They are never part of the Git tree. `.vercelignore` additionally excludes the entire offline research directory from CLI upload.

Local browser check: page, consent UI, input state, missing-key readiness message and original homepage separation. Live model behavior and microphone timing require Preview testing; these tests are not clinical safety validation.

## Suggested live checks

1. Start text mode without a microphone. Confirm the welcome, send a fictional positive event, then end and clear.
2. Start voice mode. Describe a fictional situation with pauses; test mute, barge-in, stop speaking and reconnect.
3. Ask to be heard without advice; ask separately for specific wording. Check whether style follows the request.
4. In fictional safety scenarios, check that the assistant prioritizes immediate safety, does not claim a risk diagnosis or completed human handoff, and does not invent resource numbers.

This preview is not a psychological care service. Clinical, safety, legal and data-rights approval remain required before any formal deployment.
