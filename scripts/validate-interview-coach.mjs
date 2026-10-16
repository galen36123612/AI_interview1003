import { readFile } from "node:fs/promises";

const files = {
  prompt: "src/app/agentConfigs/simpleExample.ts",
  knowledge: "src/app/data/interviewCoachKnowledge.ts",
  scripts: "src/app/data/interviewCoachScripts.ts",
  app: "src/app/App.tsx",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ])
  )
);

const checks = [
  ["prompt persona", source.prompt.includes("準備充分、耐心而坦白的學長姐")],
  ["one question policy", source.prompt.includes("一次只問一個主要問題")],
  ["truth boundary", source.prompt.includes("不得發明使用者")],
  ["assistance ladder", source.prompt.includes("# Assistance ladder")],
  ["scoring boundary", source.prompt.includes("資訊不足寫「尚未評估」")],
  ["gap diagnosis", source.knowledge.includes("Expression gap")],
  ["HR semi-structured method", source.knowledge.includes("## HR screening method")],
  ["HR evidence-based safeguards", source.knowledge.includes("Do not infer honesty")],
  ["self-introduction script", source.scripts.includes("## Self-introduction")],
  ["thesis script", source.scripts.includes("## Thesis or research")],
  ["project script", source.scripts.includes("## Project experience")],
  ["HR screening script", source.scripts.includes("## HR screening practice")],
  ["new-graduate evidence parity", source.scripts.includes("Do not penalize a student")],
  ["welcome is interview-specific", source.app.includes("INTERVIEW_WELCOME_INSTRUCTION")],
];

const forbidden = ["AI市長", "沈伯洋", "蔣萬安", "里長", "市議員"];
for (const phrase of forbidden) {
  checks.push([
    `legacy prompt removed: ${phrase}`,
    !source.prompt.includes(phrase) && !source.app.includes(phrase),
  ]);
}

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
  throw new Error(`${failed.length} interview coach contract checks failed.`);
}

console.log(`\n${checks.length} interview coach contract checks passed.`);
