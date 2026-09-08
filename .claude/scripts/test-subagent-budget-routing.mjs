#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  approveActiveChallenge,
  consumeBudgetedLaunchAuthorization,
  issueChallenge,
  RUNTIME_DIR,
} from "./lib/asdd-plan-authorization-lib.mjs";
import {
  logicalModel,
  normalizeBudgetEnvelope,
  resolveLogicalModel,
  sanitizeInvocationTelemetry,
  SUBAGENT_BUDGET,
} from "./lib/asdd-subagent-budget-lib.mjs";
import { routeRequest } from "./lib/asdd-proportional-router-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const clean = () => rmSync(RUNTIME_DIR, { recursive: true, force: true });
const agent = (name, values = {}) => ({
  agent: name, capability: null, dependencies: [], scope: ["."], commands: [],
  model: "sonnet", max_turns: 20, retries: 0, ...values,
});
const envelope = (agents, values = {}) => ({
  budget_policy_version: 1, route: "LIGHT", phase: "build", risk: "low",
  confidence: 0.9, max_concurrent: 1, agents, ...values,
});

assert.equal(JSON.parse(readFileSync(resolve(root, ".claude/settings.json"), "utf8")).model, SUBAGENT_BUDGET.model_ids.sonnet);
assert.equal(resolveLogicalModel({ phase: "build", agent: "asdd-developer-backend" }).model, "sonnet");
assert.equal(resolveLogicalModel({ phase: "build", agent: "asdd-explorer" }).model, "haiku");
assert.equal(resolveLogicalModel({ phase: "build", agent: "asdd-security", risk: "high" }).model, "opus");
assert.equal(logicalModel("claude-opus-4-8"), "opus");

const normalizedLight = normalizeBudgetEnvelope(envelope([
  agent("asdd-explorer", { model: "haiku" }),
]), [{ agent: "asdd-explorer", capability: null, dependencies: [], scope: ["."], commands: [] }]);
assert.equal(normalizedLight.agents[0].model_source, "agent_pinning");
const normalizedHighRisk = normalizeBudgetEnvelope(envelope([
  agent("asdd-security", { model: "opus", max_turns: 40 }),
], { route: "FULL", phase: "verify", risk: "high", max_concurrent: 1 }), [{ agent: "asdd-security", capability: null, dependencies: [], scope: ["."], commands: [] }]);
assert.equal(normalizedHighRisk.agents[0].model_source, "high_risk");
const normalizedSupport = normalizeBudgetEnvelope(envelope([
  agent("asdd-domain-expert", { budget_class: "support", max_turns: 15 }),
], { route: "FULL", phase: "specify", max_concurrent: 1 }), [{ agent: "asdd-domain-expert", capability: null, dependencies: [], scope: [], commands: [] }]);
assert.equal(normalizedSupport.agents[0].budget_class, "support");
assert.equal(normalizedSupport.agents[0].max_turns, 15);

assert.throws(() => normalizeBudgetEnvelope(envelope([
  agent("asdd-developer-backend"), agent("asdd-developer-frontend"),
], { max_concurrent: 1 }), [{ agent: "asdd-developer-backend" }, { agent: "asdd-developer-frontend" }]), /at most 1 subagents/);
assert.throws(() => normalizeBudgetEnvelope(envelope([
  agent("asdd-developer-backend", { max_turns: 21 }),
]), [{ agent: "asdd-developer-backend" }]), /max_turns/);
assert.throws(() => normalizeBudgetEnvelope(envelope([
  agent("asdd-developer-backend", { retries: 2 }),
]), [{ agent: "asdd-developer-backend" }]), /retries/);
assert.throws(() => normalizeBudgetEnvelope(envelope([
  agent("asdd-security", { model: "opus", escalation_reason: "auth risk" }),
], { risk: "high" }), [{ agent: "asdd-security" }]), /high risk requires FULL/);
assert.throws(() => normalizeBudgetEnvelope(envelope([
  agent("asdd-developer-backend", { model: "opus" }),
]), [{ agent: "asdd-developer-backend" }]), /violates resolved sonnet/);

const routeCases = [
  ["¿dónde está health?", "TRIVIAL"], ["actualiza src/home.ts", "LIGHT"],
  ["falla en src/auth.ts", "MEDIUM"], ["implementa autenticación OAuth", "FULL"],
];
for (const [request, expected] of routeCases) assert.equal(routeRequest(request).depth, expected);

// ORC-010-F — vía rápida. Una operación git no puede exigir plan-gate: ya tiene
// su gate propio (GS-003/008/009) y el lote ORC-010 ni siquiera puede declarar
// `git commit`. Pagar ambos significa dos confirmaciones para una operación.
for (const request of ["hacé commit de los cambios", "commiteá y pusheá", "creá el MR", "hacé el pull request"]) {
  const route = routeRequest(request);
  assert.equal(route.depth, "LIGHT", `${request}: depth`);
  assert.equal(route.fast_lane, "git_ops", `${request}: fast_lane`);
  assert.equal(route.requires_plan, false, `${request}: requires_plan`);
  assert.equal(route.requires_confirmation, false, `${request}: requires_confirmation`);
}

// Reescritura de historia y force push NO entran en vía rápida y exigen
// confirmación explícita.
for (const request of [
  "hacé force push a main",
  "git push --force",
  "reset --hard y reescribí la historia",
  "revisa los cambios y hacé push --force a la rama",
  "hacé rebase de la rama sobre dev",
  "eliminá las ramas ya mergeadas",
]) {
  const route = routeRequest(request);
  assert.equal(route.fast_lane, null, `${request}: fast_lane`);
  assert.equal(route.requires_confirmation, true, `${request}: requires_confirmation`);
  assert.notEqual(route.depth, "TRIVIAL", `${request}: depth`);
  assert.equal(route.requires_plan, true, `${request}: requires_plan`);
}

// El voseo es la forma habitual del usuario: sin él, "mové el archivo" caía a
// TRIVIAL por baja confianza y perdía la vía rápida atomic.
for (const request of ["mové docs/a.md a docs/b.md", "renombrá src/home.ts", "actualizá src/home.ts"]) {
  const route = routeRequest(request);
  assert.equal(route.depth, "LIGHT", `${request}: depth`);
  assert.equal(route.fast_lane, "atomic", `${request}: fast_lane`);
}

// Lo sensible no se degrada por la vía rápida.
assert.equal(routeRequest("implementa autenticación OAuth y hacé commit").depth, "FULL");

clean();
const plan = {
  request_id: "b8-launch", task: "budget launch", ...envelope([{
    agent: "asdd-developer-backend", capability: "asdd-developer-bug-fix",
    dependencies: [], scope: [".claude/scripts/test-subagent-budget-routing.mjs"], commands: [],
    model: "sonnet", max_turns: 20, retries: 0,
  }]),
};
issueChallenge(plan); approveActiveChallenge();
const marker = "[ASDD-BUDGET route=LIGHT phase=build model=sonnet max_turns=20 retries=0]";
const loader = "node .claude/scripts/asdd-load-capability.mjs asdd-developer-bug-fix";
assert.equal(consumeBudgetedLaunchAuthorization("asdd-developer-backend", { model: "sonnet", prompt: `${marker}\n${loader}\nact` }).model, "sonnet");
clean(); issueChallenge(plan); approveActiveChallenge();
assert.throws(() => consumeBudgetedLaunchAuthorization("asdd-developer-backend", { model: "opus", prompt: marker }), (error) => error.code === "launch-budget-mismatch");
clean(); issueChallenge(plan); approveActiveChallenge();
assert.throws(() => consumeBudgetedLaunchAuthorization("asdd-developer-backend", { model: "sonnet", prompt: "missing" }), (error) => error.code === "launch-budget-mismatch");
clean(); issueChallenge(plan); approveActiveChallenge();
assert.throws(() => consumeBudgetedLaunchAuthorization("asdd-developer-backend", { model: "sonnet", prompt: `${marker} act` }), (error) => error.code === "launch-budget-mismatch");

const telemetry = sanitizeInvocationTelemetry({ timestamp: "2026-07-18T00:00:00Z", event: "launch", route: "LIGHT", agent: "x", result: "authorized" });
assert.deepEqual(Object.keys(telemetry).sort(), ["agent", "event", "result", "route", "timestamp"]);
for (const key of SUBAGENT_BUDGET.telemetry.forbidden_fields) assert.throws(() => sanitizeInvocationTelemetry({ event: "launch", [key]: "secret" }), /forbidden telemetry field/);

const evalDirs = ["1-orchestrator", "4-workflow", "5-commands"];
const evalFiles = evalDirs.flatMap((dir) => readdirSync(resolve(root, ".claude/evals", dir)).filter((name) => name.endsWith(".yaml")).map((name) => resolve(root, ".claude/evals", dir, name)));
assert.ok(evalFiles.length >= 20);
for (const path of evalFiles) assert.match(readFileSync(path, "utf8"), /anthropic:messages:claude-sonnet-4-6/u);

for (const name of readdirSync(resolve(root, ".claude/agents")).filter((item) => item.endsWith(".md"))) {
  const turns = Number(readFileSync(resolve(root, ".claude/agents", name), "utf8").match(/^maxTurns:\s*(\d+)/mu)?.[1]);
  assert.ok(Number.isInteger(turns) && turns <= 50, `${name}: absolute maxTurns cap`);
}

clean();
console.log("PASS model routing: Sonnet default, Explorer/Haiku and high-risk/Opus precedence");
console.log("PASS budgets: TRIVIAL/LIGHT/MEDIUM/FULL fan-out, turns and retries fail closed");
console.log("PASS launch binding: exact model + ASDD-BUDGET marker; mismatch requires new plan");
console.log(`PASS eval/privacy: ${evalFiles.length} Sonnet eval configs and forbidden telemetry fields rejected`);
