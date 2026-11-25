// Report how the fixed safety guard handles the stress battery: `npm run safety:stress`.
// Add `--strict` to exit 1 on any miss or false trigger outside the known lists.
import { selectSafetyResponse } from "../src/app/psych-support/safety.mjs";
import { CASES, HELD_OUT, KNOWN_MISSES, KNOWN_FALSE_TRIGGERS } from "./psych-safety-cases.mjs";

export function runBattery(cases = CASES) {
  const rows = cases.map(([category, text, expected]) => ({ category, text, expected, mode: selectSafetyResponse(text).mode }));
  return { rows, misses: rows.filter((r) => r.expected && r.mode === null), falseTriggers: rows.filter((r) => !r.expected && r.mode !== null) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { rows, misses, falseTriggers } = runBattery();
  const categories = new Map();
  for (const row of rows) {
    const entry = categories.get(row.category) || { total: 0, ok: 0 };
    entry.total++; if ((row.mode !== null) === row.expected) entry.ok++;
    categories.set(row.category, entry);
  }
  for (const [category, { ok, total }] of categories) console.log(`${category}\t${ok}/${total}`);
  console.log(`\n漏接 ${misses.length}，誤觸 ${falseTriggers.length}，總題數 ${rows.length}`);
  for (const row of misses) console.log(`漏接 [${row.category}] ${row.text}${KNOWN_MISSES.has(row.text) ? "（已知，交給模型）" : ""}`);
  for (const row of falseTriggers) console.log(`誤觸 [${row.category}] ${row.text} -> ${row.mode}${KNOWN_FALSE_TRIGGERS.has(row.text) ? "（已知）" : ""}`);
  const held = runBattery(HELD_OUT);
  const shouldTrigger = held.rows.filter((r) => r.expected).length;
  console.log(`\n未調校題組（僅供參考，不列入通過條件）：接住 ${shouldTrigger - held.misses.length}/${shouldTrigger}，誤觸 ${held.falseTriggers.length}/${held.rows.length - shouldTrigger}`);
  for (const row of held.misses) console.log(`  漏接 [${row.category}] ${row.text}`);
  for (const row of held.falseTriggers) console.log(`  誤觸 [${row.category}] ${row.text} -> ${row.mode}`);
  const unexpected = misses.filter((r) => !KNOWN_MISSES.has(r.text)).length + falseTriggers.filter((r) => !KNOWN_FALSE_TRIGGERS.has(r.text)).length;
  if (process.argv.includes("--strict") && unexpected) process.exit(1);
}
