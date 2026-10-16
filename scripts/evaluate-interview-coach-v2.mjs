import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  formatConfirmedTerms,
  mergeConfirmedTerm,
  normalizeConfirmedTerm,
  transcriptionPromptForConfirmedTerms,
} from "../src/app/lib/confirmedTerms.mjs";
import { createRealtimeMetricsTracker } from "../src/app/lib/realtimeMetrics.mjs";

const BASELINE_COMMIT = "95c44b56a2e655afd9fe476494ba59942928b5c3";

const read = (path) => readFile(path, "utf8");
const readBaseline = (path) =>
  execFileSync("git", ["show", `${BASELINE_COMMIT}:${path}`], {
    encoding: "utf8",
  });

const [
  prompt,
  scripts,
  knowledge,
  app,
  sessionRoute,
  fixtureRaw,
  evalSpecRaw,
  baselineApp,
] = await Promise.all([
  read("src/app/agentConfigs/simpleExample.ts"),
  read("src/app/data/interviewCoachScripts.ts"),
  read("src/app/data/interviewCoachKnowledge.ts"),
  read("src/app/App.tsx"),
  read("src/app/api/session/route.ts"),
  read("test/fixtures/interview-coach/technical-thesis-session-001.json"),
  read("test/evals/interview-coach-v2.json"),
  Promise.resolve(readBaseline("src/app/App.tsx")),
]);

const fixture = JSON.parse(fixtureRaw);
const evalSpec = JSON.parse(evalSpecRaw);

const normalized = normalizeConfirmedTerm({
  canonical: "Model-X",
  variants: ["model ex", "MODEL EX", " model x "],
});
const mergedTerms = mergeConfirmedTerm(
  [{ canonical: "Example Canonical Term", variants: ["example canon term"] }],
  normalized
);
const termContext = formatConfirmedTerms(mergedTerms);
const transcriptionPrompt = transcriptionPromptForConfirmedTerms(mergedTerms);

let clock = 1_000;
const metrics = createRealtimeMetricsTracker({ now: () => (clock += 100) });
const metricEvents = [
  ...metrics.handleServerEvent({
    type: "input_audio_buffer.speech_started",
    audio_start_ms: 100,
  }),
  ...metrics.handleServerEvent({
    type: "input_audio_buffer.speech_stopped",
    audio_end_ms: 2_600,
  }),
  ...metrics.handleServerEvent({ type: "response.created", response: { id: "r1" } }),
  ...metrics.handleServerEvent({
    type: "input_audio_buffer.speech_started",
    audio_start_ms: 2_800,
  }),
  ...metrics.handleServerEvent({
    type: "response.done",
    response: { id: "r1", status: "cancelled" },
  }),
];

const tests = [
  {
    id: "eval-01-thinking-pause",
    pass:
      app.includes('type: "semantic_vad"') &&
      app.includes('eagerness: "low"') &&
      sessionRoute.includes('type: "semantic_vad"') &&
      prompt.includes("思考中的停頓") &&
      baselineApp.includes('type: "server_vad"'),
  },
  {
    id: "eval-02-long-technical-answer",
    pass:
      prompt.includes("完成整段回答再回應") &&
      scripts.includes("Do not coach between fragments of the same answer"),
  },
  {
    id: "eval-03-asr-terminology-drift",
    pass:
      prompt.includes("remember_confirmed_term") &&
      termContext.includes("Example Canonical Term") &&
      termContext.includes("Model-X") &&
      transcriptionPrompt.includes("Model-X"),
  },
  {
    id: "eval-04-no-fact-invention",
    pass:
      prompt.includes("Rewrite, don't invent") &&
      prompt.includes("不得改變方法、因果關係或證據強度") &&
      prompt.includes("必須保留同等程度的不確定性與限制") &&
      fixture.turns.some((turn) => turn.observedIssues?.includes("method_changed")) &&
      fixture.turns.some((turn) => turn.observedIssues?.includes("overclaim")),
  },
  {
    id: "eval-05-did-not-hear",
    pass:
      prompt.includes("第一次只簡短重述上一題") &&
      scripts.includes("briefly repeat the same question"),
  },
  {
    id: "eval-06-interview-mode",
    pass:
      prompt.includes("Interview mode") &&
      prompt.includes("不教答案、不稱讚、不在每題後回饋"),
  },
  {
    id: "eval-07-coach-mode",
    pass:
      prompt.includes("一個優點、最重要的 1 至 2 個改善點與一個 retry 指令") &&
      scripts.includes("one concrete strength"),
  },
  {
    id: "eval-08-demo-mode",
    pass:
      prompt.includes("Demo mode") &&
      prompt.includes("示範只能使用已確認事實"),
  },
  {
    id: "eval-09-filler-words",
    pass:
      prompt.includes("贅詞過多") && prompt.includes("每次最多指出 1 至 2 項"),
  },
  {
    id: "eval-10-thesis-structure",
    pass:
      prompt.includes("問題／動機 → 方法 → 個人關鍵決策或貢獻 → 結果 → 限制") &&
      scripts.includes("Problem and motivation → Method"),
  },
  {
    id: "eval-11-hr-semi-structured",
    pass:
      knowledge.includes("## HR screening method") &&
      scripts.includes("## HR screening practice") &&
      scripts.includes("Keep the core dimensions stable"),
  },
  {
    id: "eval-12-no-secret-answer-key",
    pass:
      knowledge.includes("Do not score against one canned") &&
      scripts.includes("Do not search for a secret answer key"),
  },
  {
    id: "eval-13-no-body-language-inference",
    pass:
      knowledge.includes("Do not infer honesty, personality, motivation, competence") &&
      knowledge.includes("body language, eye contact, posture, handshake"),
  },
  {
    id: "realtime-metrics-instrumentation",
    pass:
      metricEvents.some((event) => event.name === "total_answer_duration") &&
      metricEvents.some((event) => event.name === "interruption") &&
      metricEvents.some((event) => event.name === "cancelled_response") &&
      metrics.snapshot().completedCandidateTurns === 1,
  },
];

const definedEvalIds = new Set(evalSpec.cases.map((testCase) => testCase.id));
for (const test of tests.filter(({ id }) => id.startsWith("eval-"))) {
  if (!definedEvalIds.has(test.id)) test.pass = false;
}

for (const test of tests) {
  console.log(`${test.pass ? "✓" : "✗"} ${test.id}`);
}

const comparison = [
  [
    "Premature interruption count",
    `${fixture.baselineObservations.prematureInterruptionCount} observed in fixture`,
    "Semantic VAD (low eagerness); live count pending",
  ],
  ["Average response latency", "Not reliably observable", "Instrumented; live run pending"],
  ["Duplicate assistant responses", "Not observed in supplied fixture", "Instrumented; live run pending"],
  ["Terminology consistency", "Failed", "Static guard + confirmed-term memory pass"],
  ["Factual fidelity", "Failed", "Static guard pass; generative run pending"],
  [
    "Coaching interruptions per answer",
    `${fixture.baselineObservations.coachingInterruptionCount} observed in fixture`,
    "Concentrated-feedback contract pass; live count pending",
  ],
  ["User answer completion rate", "Not reliably observable", "Instrumented; live run pending"],
  ["Mode appropriateness", "Mixed", "Three-mode contract pass; generative run pending"],
];

console.log("\n| Metric | Baseline | V2 |");
console.log("| --- | --- | --- |");
for (const row of comparison) console.log(`| ${row.join(" | ")} |`);

const failed = tests.filter((test) => !test.pass);
if (failed.length) {
  process.exitCode = 1;
  throw new Error(`${failed.length} Interview Coach V2 evaluation checks failed.`);
}

console.log(`\n${tests.length} Interview Coach V2 evaluation checks passed.`);
