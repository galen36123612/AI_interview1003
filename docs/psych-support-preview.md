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
# 9 psychological persona / entry point / transport / transcript tests, ESLint, production build

cd research/psych-support
python3 -m unittest discover -s tests -v
# 25 tests; real corpus integration requires the same locally provided raw files and sample cards
```

The local corpus files and original cards are attached as ignored local-only symlinks for the Python integration run. They are never part of the Git tree. `.vercelignore` additionally excludes the entire offline research directory from CLI upload.

Local HTTP smoke checks cover the psychological homepage, compatibility redirect and readiness routes. Automated tests protect root-to-client wiring and fixed server instructions. They use synthetic data and a mocked OpenAI response. Live model behavior and microphone timing require authenticated Preview testing; these tests are not clinical safety validation. An existing live connection retains its old session: reload and start a new connection after deployment.

## Suggested live checks

1. Send text from the disconnected homepage without a microphone. Confirm the welcome, send a fictional positive event, then end and clear.
2. Click the microphone to start voice mode. Describe a fictional situation with pauses; test push-to-talk, barge-in, stop speaking, ending through the status text, and reconnecting.
3. Ask to be heard without advice; ask separately for specific wording. Check whether style follows the request.
4. In fictional safety scenarios, check that the assistant prioritizes immediate safety, does not claim a risk diagnosis or completed human handoff, and does not invent resource numbers.

This preview is not a psychological care service. Clinical, safety, legal and data-rights approval remain required before any formal deployment.
