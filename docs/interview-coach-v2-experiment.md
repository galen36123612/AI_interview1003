# Interview Coach V2 experiment

Baseline: `95c44b56a2e655afd9fe476494ba59942928b5c3` on `main`  
Experiment: `experiment/interview-coach-v2`

This branch is an experimental comparison target. It does not change or merge the stable baseline.

## Architecture findings

The supplied transcript exposed problems at several layers rather than one prompt defect.

| Layer | Baseline behavior | V2 change |
| --- | --- | --- |
| ASR | Generic Mandarin transcription had no session-level canonical term context, so technical names could drift between turns. | Confirmed terms are stored generically and added to the transcription prompt. |
| VAD | `server_vad` ended a turn after 900 ms of silence. It could not distinguish a thinking pause from a completed technical answer. | `semantic_vad` with low eagerness estimates semantic completion. It can wait longer after fillers or unfinished clauses without setting an unlimited silence timeout. |
| Turn interruption | Server interruption was enabled, while the client also sent `response.cancel` on speech start. The two cancellation paths could race. | Server-managed interruption remains enabled; the client only clears already-buffered output audio when speech resumes. Text and push-to-talk actions still use explicit client cancellation where needed. |
| Realtime session | Candidate/assistant timing and duplicate-response signals were not measured. | A session-scoped tracker records turn start/end, answer duration, response start/end, interruptions, cancellations, duplicates, and the observable silence between detected speech segments. |
| System prompt | Modes were described, but the transition and intervention limits were loose. Truth rules prohibited invention generally but did not explicitly preserve method, causality, or uncertainty during rewrites. | Interview, Coach, and Demo behavior now have explicit entry conditions. Rewrites must preserve facts, method, causal strength, numbers, and limitations. |
| Conversation state | No generic confirmed-entity memory existed. | `remember_confirmed_term` stores user-confirmed canonical spellings and ASR variants in the session. No candidate or thesis term is hardcoded. |
| Response generation | Feedback could appear between fragments, “didn't hear” could trigger a longer lesson, and thesis answers could be pushed into a generic structure. | Feedback has a fixed small budget after a complete answer; repair repeats the prior question; research answers use problem, method, contribution, result, and limitation when useful. |

The VAD configuration follows the OpenAI Realtime API distinction between fixed-silence Server VAD and semantic turn detection: [Realtime VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad) and [Realtime client events reference](https://developers.openai.com/api/reference/resources/realtime/client-events).

## Behavioral changes

- Mandarin fillers and thinking pauses are treated as possible continuation signals.
- Voice barge-in has one response-cancellation owner, reducing double-cancel races.
- Interview mode stays neutral and does not coach after every answer.
- Coach mode waits for answer completion, then gives one strength, one or two priority improvements, and one retry constraint.
- Demo mode requires an explicit request and may only reorganize confirmed facts.
- “沒有聽清楚” repeats the same question briefly before simplifying it further.
- Thesis coaching can use Problem/Motivation → Method → Candidate contribution → Result → Limitation instead of forcing STAR.
- Delivery feedback can identify fillers, repeated starts, unclear subjects, long sentences, missing term explanations, or delayed conclusions, with at most two priorities per round.
- Confirmed technical terms are persisted as generic session data and fed back to both the assistant instructions and speech transcription prompt.

## Evaluation design

The branch includes:

- `test/fixtures/interview-coach/technical-thesis-session-001.json`: the supplied conversation converted to a synthetic regression fixture.
- `test/evals/interview-coach-v2.json`: ten required scenarios.
- `scripts/evaluate-interview-coach-v2.mjs`: deterministic configuration, prompt-contract, term-memory, fixture, and metrics checks.

The harness deliberately does not claim that a prompt-contract test proves model behavior. It labels live generative or speech measurements as pending.

## Baseline vs V2

| Metric | Baseline | V2 |
| --- | --- | --- |
| Premature interruption count | 3 observed in supplied fixture | Semantic VAD low-eagerness guard passes; live count pending |
| Average response latency | Not reliably observable from transcript | Instrumented; preview voice run pending |
| Duplicate assistant responses | None visible in supplied transcript; baseline had two cancellation owners | Instrumented and one voice cancellation owner; live count pending |
| Terminology consistency | Failed in supplied session | Confirmed-term memory and ASR prompt contract pass; live model run pending |
| Factual fidelity | Failed: method and certainty changed in final demo | Rewrite/fact/uncertainty contract pass; generative run pending |
| Coaching interruptions per answer | 4 observed in supplied fixture | Concentrated-feedback contract passes; live count pending |
| User answer completion rate | Not reliably computable from transcript | Turn boundaries instrumented; live run pending |
| Mode appropriateness | Mixed interviewer, coach, and demo behavior | Three-mode contract passes; generative run pending |

## Realtime observability

Currently recorded in the in-memory event log:

- candidate turn start and end;
- assistant response start and end;
- interruption event;
- client- or server-cancelled response;
- overlapping or repeated response creation;
- total answer duration, using server audio offsets when available;
- wall-clock silence between detected speech segments.

The exact pause that occurs *inside* one semantically unified user turn is not exposed as a separate server event, so that intra-turn silence duration remains **not currently observable**. Metrics are also not persisted across a page reload yet.

## Risks and remaining issues

- Low-eagerness Semantic VAD can wait longer before a response. The API documents a maximum timeout of up to eight seconds for low eagerness, so perceived latency must be measured against reduced interruption rate.
- Confirmed-term memory depends on the model calling the memory tool after an explicit correction. A live eval should measure tool-call recall and false confirmations.
- Static fidelity checks protect the instruction contract but do not prove every generated demo will remain faithful. A model-graded factual consistency eval is still needed.
- Speaking duration is recorded for evaluation, but it is not injected into the active response in time for automatic “this took 2:20” coaching. Doing that reliably would require client-managed response creation after turn completion.
- Realtime metrics are session-local and capped with the existing event log. A later experiment should add privacy-reviewed export or aggregate telemetry.
- The UI is intentionally unchanged so the experiment isolates conversation behavior.

## Recommended next experiment

Run the baseline and V2 preview with the same ten prerecorded or scripted Mandarin answers:

1. five short answers with normal completion;
2. three 90–120 second technical answers containing fillers and 0.8–2.5 second pauses;
3. two deliberate barge-in cases.

Measure interruption count, end-of-turn-to-response latency, answer completion, duplicate responses, and cancellation errors. If low eagerness is too slow, compare `low` against `auto` while keeping the single cancellation owner and all prompt/memory changes fixed. Separately, run the factual-fidelity and mode scenarios through the actual model and judge them against the JSON eval spec.

## HR interview practice addition

The experimental branch now includes a reviewed subset of the supplied *人事面談全流程實務* excerpt. The useful candidate-coaching material was converted into a semi-structured HR screening script: stable job-relevant dimensions, answer-driven follow-ups, behavioral evidence, realistic situational questions, reflection, and candidate reverse questions. Student evidence may come from theses, courses, clubs, volunteering, competitions, or part-time work rather than full-time employment.

The branch deliberately excludes recruitment administration, hiring notices, background-check procedures, salary-pressure tactics, canned personality answer keys, body-language lie detection, humiliating stress interviews, and unrelated sensitive questions. Static regression cases now check the semi-structured flow, rejection of a secret answer key, and the prohibition on inferring honesty or competence from nervous behavior or body language.
