#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContextBudget } from "./lib/asdd-context-budget-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const policy = JSON.parse(readFileSync(resolve(root, ".asdd/context-budget.json"), "utf8"));
const agents = ["asdd-developer-backend", "asdd-developer-frontend"];
const capabilities = [
  "asdd-unit-test-design",
  "asdd-developer-feature",
  "asdd-developer-unit-test",
  "asdd-developer-integration-test",
  "asdd-developer-e2e-test",
  "asdd-developer-refactoring-execute",
  "asdd-developer-bug-fix",
  "asdd-developer-merge-conflicts",
  "asdd-developer-safe-refactor",
  "asdd-developer-build-validator",
  "asdd-developer-continuous-improver",
];
let failed = 0;
const assert = (ok, message) => {
  console.log(`${ok ? "✅" : "❌"} ${message}`);
  if (!ok) failed += 1;
};

const budget = analyzeContextBudget(root, policy);
for (const agent of agents) {
  const text = readFileSync(resolve(root, ".claude/agents", `${agent}.md`), "utf8");
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? "";
  assert(!/^skills:/mu.test(frontmatter), `${agent} does not eagerly load skills`);
  assert(text.includes("## Carga bajo demanda de capacidades"), `${agent} documents on-demand capability loading`);
  assert(text.includes("asdd-load-capability.mjs"), `${agent} uses the capability loader`);
  assert(text.includes("El plan canónico declara una `capability` primaria"), `${agent} requires a plan-declared primary capability`);
  assert(text.includes("`dependencies`"), `${agent} only allows an explicitly approved dependency`);
  for (const capability of capabilities) {
    assert(text.includes(capability), `${agent} retains ${capability} in its on-demand catalog`);
  }
  const measurement = budget.measurements.find((item) => item.id === `agent_with_skills:${agent}`);
  assert(measurement?.value <= 2_500, `${agent} eager payload stays <= 2500 words (${measurement?.value ?? "missing"})`);
}

if (failed) process.exit(1);
