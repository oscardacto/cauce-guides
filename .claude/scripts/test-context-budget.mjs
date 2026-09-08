#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeContextBudget } from "./lib/sofka-asdd-context-budget-lib.mjs";

const root = mkdtempSync(join(tmpdir(), "asdd-budget-"));
const put = (path, text) => {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
};

put("CLAUDE.md", "one two");
put(".claude/rules/a.md", "three four");
put(".claude/skills/alpha/SKILL.md", "alpha skill body");
put(".claude/skills/beta/SKILL.md", "beta skill body");
put(".claude/agents/inline.md", "---\nname: inline\nskills: [alpha, beta]\n---\nsame agent body");
put(".claude/agents/block.md", "---\nname: block\nskills:\n  - alpha\n  - beta\n---\nsame agent body");
put(".claude/agents/empty.md", "---\nname: empty\nskills: []\n---\nempty body");
put(".claude/agents/absent.md", "---\nname: absent\n---\nabsent body");
put(".claude/agents/missing.md", "---\nname: missing\nskills: [not-installed]\n---\nmissing body");
put(".claude/commands/do.md", "small active command");
put(".claude/hooks/h.mjs", "small hook");
put("docs/baselines/hook.json", "{}");

const policy = {
  schema_version: 2,
  limits: {
    global_words: 100,
    agent_words: 100,
    agent_with_skills_words: 100,
    command_words: 100,
    hook_source_words: 100,
  },
  targets: {
    always_on_core_words: { limit: 3, stage: "warning" },
    eager_skills_per_agent: { limit: 1, stage: "warning" },
    initial_agent_plus_skill_words: { limit: 100, stage: "measurement" },
  },
  measured_components: {
    hook_injection_words: { value: 2, source: "docs/baselines/hook.json" },
  },
  unmeasured_components: ["tool_schemas", "mcp_schemas"],
  exceptions: [],
};

let report = analyzeContextBudget(root, policy, new Date("2026-01-01"));
const inline = report.layers.agents.find((item) => item.agent === "inline");
const block = report.layers.agents.find((item) => item.agent === "block");
assert.equal(inline.eager_skills_words, block.eager_skills_words);
assert.equal(
  inline.agent_words + inline.eager_skills_words,
  block.agent_words + block.eager_skills_words,
  "inline and block YAML must produce the same agent+skills total",
);
assert.equal(inline.measured_effective_context_words, 4 + inline.agent_words + 6 + 3 + 2);
assert.equal(report.layers.agents.find((item) => item.agent === "empty").eager_skills, 0);
assert.equal(report.layers.agents.find((item) => item.agent === "absent").eager_skills, 0);
assert(report.integrity_errors.some((item) => item.id === "skill-reference:missing:not-installed"));
assert(report.summary.errors >= 1, "missing skill must fail integrity");
assert(report.summary.warnings >= 2, "transition targets must warn without hiding debt");
assert.deepEqual(report.unmeasured_components.slice(0, 2), [{ id: "tool_schemas" }, { id: "mcp_schemas" }]);

policy.exceptions = [{
  id: "target:always_on_core",
  owner: "owner",
  reason: "migration",
  expires_at: "2026-02-01",
}];
report = analyzeContextBudget(root, policy, new Date("2026-01-01"));
assert(report.violations.some((item) => item.id === "target:always_on_core" && item.status === "excepted"));
report = analyzeContextBudget(root, policy, new Date("2026-03-01"));
assert(report.violations.some((item) => item.id === "target:always_on_core" && item.status === "warning"));

assert.throws(
  () => analyzeContextBudget(root, { ...policy, limits: { ...policy.limits, global_words: -1 } }),
  /non-negative/u,
);

// `target()` era fail-open: un renombre de clave apagaba el gate sin avisar y el
// validador seguia en verde. La politica que no declara un target que el codigo
// mide tiene que salir como error de integridad, no como silencio.
const renamed = { ...policy, targets: { ...policy.targets } };
delete renamed.targets.always_on_core_words;
renamed.targets.always_on_words = { limit: 3, stage: "error" };
report = analyzeContextBudget(root, renamed, new Date("2026-01-01"));
assert(
  report.integrity_errors.some((item) => item.id === "target-not-declared:always_on_core_words"),
  "un target medido por el codigo y no declarado en la politica debe fallar",
);
assert(
  !report.measurements.some((item) => item.id === "target:always_on_core"),
  "el gate renombrado deja de medirse: por eso el error de integridad es la unica senal",
);
report = analyzeContextBudget(root, policy, new Date("2026-01-01"));
assert(
  !report.integrity_errors.some((item) => item.id.startsWith("target-not-declared:")),
  "la politica completa no debe reportar targets sin declarar",
);

// Direccion inversa: un target declarado que ningun `target()` invoco (ej. `coordinators`
// desactualizado — ningun agente real matchea la condicion y `thin_coordinator_words`
// deja de enforzarse en silencio, aunque siga declarado).
const orphanTarget = { ...policy, targets: { ...policy.targets, thin_coordinator_words: { limit: 3, stage: "error" } } };
report = analyzeContextBudget(root, orphanTarget, new Date("2026-01-01"));
assert(
  report.integrity_errors.some((item) => item.id === "target-never-invoked:thin_coordinator_words"),
  "un target declarado que ningun target() invoco debe fallar, no quedar mudo",
);
report = analyzeContextBudget(root, policy, new Date("2026-01-01"));
assert(
  !report.integrity_errors.some((item) => item.id.startsWith("target-never-invoked:")),
  "la politica completa no debe reportar targets nunca invocados",
);

rmSync(root, { recursive: true, force: true });
console.log("PASS context budget: YAML-equivalent totals and broken-reference integrity");
console.log("PASS context budget: layered formula, staged gates, exceptions and unmeasured components");
console.log("PASS context budget: un target medido y no declarado falla cerrado, no en silencio");
console.log("PASS context budget: un target declarado y nunca invocado falla cerrado, no en silencio");
