#!/usr/bin/env node
import { rmSync } from "node:fs";
import {
  approveActiveChallenge,
  authorizeAgentOperation,
  consumeLaunchAuthorization,
  isAuthorizationError,
  issueChallenge,
  RUNTIME_DIR,
} from "./lib/sofka-asdd-plan-authorization-lib.mjs";

let passed = 0;
let failed = 0;
const assert = (label, ok, detail = "") => {
  if (ok) { console.log(`  ✅ ${label}`); passed += 1; }
  else { console.error(`  ❌ ${label} ${detail}`); failed += 1; }
};
const throwsCode = (fn, code) => {
  try { fn(); return false; } catch (error) { return isAuthorizationError(error, code); }
};
const clean = () => rmSync(RUNTIME_DIR, { recursive: true, force: true });
const plan = {
  request_id: "req-test",
  task: "test",
  budget_policy_version: 1,
  route: "MEDIUM",
  phase: "build",
  risk: "low",
  confidence: 0.9,
  max_concurrent: 2,
  agents: [
    {
      agent: "sofka-asdd-developer-backend",
      capability: "sofka-asdd-developer-bug-fix",
      scope: [".claude/scripts/test-plan-gate-hook.mjs"],
      commands: ["node .claude/scripts/test-plan-gate-hook.mjs"],
      model: "sonnet", max_turns: 30, retries: 0,
    },
    { agent: "sofka-asdd-qa", scope: [".claude/scripts/"], commands: [], model: "sonnet", max_turns: 30, retries: 0 },
  ],
};
const operation = (overrides = {}) => ({
  agent_id: "agent-runtime-1",
  agent_type: "sofka-asdd-developer-backend",
  tool_name: "Edit",
  tool_input: { file_path: ".claude/scripts/test-plan-gate-hook.mjs" },
  ...overrides,
});

clean();
console.log("PA1: sin challenge/autorización → no hay autoridad ASDD activa");
assert("launch sin store se clasifica como no-active", throwsCode(
  () => consumeLaunchAuthorization("sofka-asdd-developer-backend"),
  "no-active-authorization",
));

console.log("PA2: challenge canónico + aprobación → lanzamiento único por agente");
const challenge = issueChallenge(plan);
assert("hash SHA-256", /^[a-f0-9]{64}$/.test(challenge.plan_hash));
const auth = approveActiveChallenge();
assert("una autorización por agente", auth.length === 2);
const first = consumeLaunchAuthorization("sofka-asdd-developer-backend");
assert("scope exacto preservado", first.scope[0] === ".claude/scripts/test-plan-gate-hook.mjs");
assert("segundo lanzamiento es replay", throwsCode(
  () => consumeLaunchAuthorization("sofka-asdd-developer-backend"),
  "authorization-replay",
));
assert("segundo agente del lote independiente", consumeLaunchAuthorization("sofka-asdd-qa").agent === "sofka-asdd-qa");

console.log("PA3: operación del subagente usa scope/comando y runtime identity");
clean();
issueChallenge(plan);
approveActiveChallenge();
consumeLaunchAuthorization("sofka-asdd-developer-backend");
assert("Edit dentro del scope sin capability rechaza", throwsCode(
  () => authorizeAgentOperation(operation()),
  "capability-not-loaded",
));
assert("loader con capability distinta rechaza", throwsCode(
  () => authorizeAgentOperation(operation({
    tool_name: "Bash",
    tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-unit-test" },
  })),
  "capability-mismatch",
));
assert("loader de capability declarada permite", authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix" },
})).loaded_capability === "sofka-asdd-developer-bug-fix");
assert("Edit dentro del scope tras cargar capability permite", authorizeAgentOperation(operation()).agent === "sofka-asdd-developer-backend");
assert("Bash exacto autorizado permite", authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/test-plan-gate-hook.mjs" },
})).agent === "sofka-asdd-developer-backend");
assert("resolver de capabilities read-only permite", authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/sofka-asdd-resolve-capability.mjs sofka-asdd-developer-bug-fix" },
})).agent === "sofka-asdd-developer-backend");
assert("archivo fuera del scope rechaza", throwsCode(
  () => authorizeAgentOperation(operation({ tool_input: { file_path: ".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs" } })),
  "scope-mismatch",
));
assert("comando extendido rechaza", throwsCode(
  () => authorizeAgentOperation(operation({ tool_name: "Bash", tool_input: { command: "node .claude/scripts/test-plan-gate-hook.mjs; echo injected" } })),
  "command-mismatch",
));
assert("composición read-only benigna permite", authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "ls .claude/scripts 2>/dev/null | head -20" },
})).agent === "sofka-asdd-developer-backend");
assert("comando declarado con pipe agregado rechaza", throwsCode(
  () => authorizeAgentOperation(operation({ tool_name: "Bash", tool_input: { command: "node .claude/scripts/test-plan-gate-hook.mjs | head -5" } })),
  "command-mismatch",
));
assert("otro runtime agent no hereda", throwsCode(
  () => authorizeAgentOperation(operation({ agent_id: "agent-runtime-2" })),
  "runtime-identity-mismatch",
));

console.log("PA4: emitir un challenge nuevo no degrada el lote vigente a permisos nativos");
clean();
issueChallenge(plan);
approveActiveChallenge();
consumeLaunchAuthorization("sofka-asdd-developer-backend");
authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix" },
}));
issueChallenge({
  ...plan,
  request_id: "req-reissue",
  task: "replacement proposal pending approval",
  max_concurrent: 1,
  agents: [{
    ...plan.agents[0],
    scope: [".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs"],
    commands: [],
  }],
});
assert("operación del agente ya lanzado conserva su scope original", throwsCode(
  () => authorizeAgentOperation(operation({
    tool_input: { file_path: ".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs" },
  })),
  "scope-mismatch",
));
assert("challenge pendiente no habilita comandos nuevos", throwsCode(
  () => authorizeAgentOperation(operation({
    tool_name: "Bash",
    // Fixture deliberadamente fuera de toda allowlist (ver suite del hook de operaciones).
    tool_input: { command: "node .claude/scripts/sofka-asdd-resolve-workspace.mjs" },
  })),
  "command-mismatch",
));

console.log("PA4-bis: aprobar un lote nuevo no revoca al agente ya lanzado");
clean();
issueChallenge(plan);
approveActiveChallenge();
consumeLaunchAuthorization("sofka-asdd-developer-backend");
// La capability primero: `operation()` es un Edit, y sin capability cargada da
// `capability-not-loaded` antes de llegar a la comprobación que nos importa.
authorizeAgentOperation(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix" },
}));
// Envuelto: sin el Paso 1 esto lanza, y un throw desnudo mata la suite entera en
// vez de reportar un assert en rojo — que es lo que la prueba tiene que hacer.
const agenteAutorizado = (op) => {
  try { return authorizeAgentOperation(op).agent; }
  catch (error) { return `ERROR:${error.code ?? error.message}`; }
};
assert("opera antes de la aprobación nueva",
  agenteAutorizado(operation()) === "sofka-asdd-developer-backend");
issueChallenge({
  ...plan, request_id: "req-otro-lote", max_concurrent: 1,
  agents: [{ agent: "sofka-asdd-qa", scope: [".claude/scripts/"], commands: [], model: "sonnet", max_turns: 30, retries: 0 }],
});
approveActiveChallenge();
// ESTE es el assert que mide el arreglo: sin el Paso 1 da agent-mismatch.
assert("el agente en vuelo conserva su autorización tras la aprobación",
  agenteAutorizado(operation()) === "sofka-asdd-developer-backend");
assert("pero NO hereda el scope del lote nuevo", throwsCode(
  () => authorizeAgentOperation(operation({ tool_input: { file_path: ".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs" } })),
  "scope-mismatch",
));
assert("un agente que ningún plan declaró sigue rechazado", throwsCode(
  () => consumeLaunchAuthorization("sofka-asdd-security"),
  "agent-mismatch",
));

console.log("PA5: cambio de agente/scope y expiración no degradan a otro lote");
assert("agente fuera del plan rechaza", throwsCode(
  () => consumeLaunchAuthorization("sofka-asdd-security"),
  "agent-mismatch",
));
clean();
issueChallenge({ ...plan, ttl_seconds: 1 }, new Date("2026-01-01T00:00:00Z"));
assert("challenge vencido no se aprueba", (() => {
  try { approveActiveChallenge(new Date("2026-01-01T00:00:02Z")); return false; } catch (error) { return /expired/.test(error.message); }
})());
assert("tipos duplicados se rechazan al emitir", (() => {
  try {
    issueChallenge({ ...plan, agents: [plan.agents[0], { ...plan.agents[0] }] });
    return false;
  } catch (error) { return /unique agent type/.test(error.message); }
})());
assert("developer sin capability se rechaza al emitir", (() => {
  try {
    issueChallenge({ ...plan, request_id: "missing-cap", max_concurrent: 1, agents: [{ ...plan.agents[0], capability: undefined }] });
    return false;
  } catch (error) { return /requires one declared capability/.test(error.message); }
})());
assert("capability ajena se rechaza al emitir", (() => {
  try {
    issueChallenge({ ...plan, request_id: "wrong-cap", max_concurrent: 1, agents: [{ ...plan.agents[0], capability: "sofka-asdd-ui-accessibility" }] });
    return false;
  } catch (error) { return /not allowed/.test(error.message); }
})());
assert("alias no ambiguo se canoniza al emitir", (() => {
  const aliased = issueChallenge({ ...plan, request_id: "short-cap", max_concurrent: 1, agents: [{ ...plan.agents[0], capability: "build-validator" }] });
  return aliased.plan.agents[0].capability === "sofka-asdd-developer-build-validator";
})());

console.log("PA6: git commit queda fuera del lote (GS-003)");
clean();
const bad = { ...plan, request_id: "req-bad", max_concurrent: 1, agents: [{ agent: "sofka-asdd-tech-lead", capability: "sofka-asdd-tech-lead-commit", scope: ["."], commands: ["git commit -m test"], model: "sonnet", max_turns: 30, retries: 0 }] };
assert("issuer rechaza commit", (() => {
  try { issueChallenge(bad); return false; } catch (error) { return /GS-003/.test(error.message); }
})());

clean();
console.log(`\nPlan authorization: ${passed} ✅ ${failed} ❌`);
if (failed) process.exit(1);
