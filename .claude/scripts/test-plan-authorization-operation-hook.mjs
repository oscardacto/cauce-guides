#!/usr/bin/env node
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { approveActiveChallenge, issueChallenge, RUNTIME_DIR } from "./lib/sofka-asdd-plan-authorization-lib.mjs";
import { getPlanGateDecision } from "../hooks/sofka-asdd-plan-gate.mjs";
import { getOperationAuthorizationDecision } from "../hooks/sofka-asdd-plan-authorization-operation.mjs";

let passed = 0;
let failed = 0;
const clean = () => rmSync(RUNTIME_DIR, { recursive: true, force: true });
const assert = (label, ok, detail = "") => {
  if (ok) { console.log(`  ✅ ${label}`); passed += 1; }
  else { console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); failed += 1; }
};
const allows = (result) => result === null;
const decision = (result, expected, code) => result?.decision === expected
  && (!code || result.reason.includes(code));
const plan = {
  request_id: "hook-binding-test",
  task: "hook binding test",
  budget_policy_version: 1,
  route: "LIGHT",
  phase: "build",
  risk: "low",
  confidence: 0.9,
  max_concurrent: 1,
  agents: [{
    agent: "sofka-asdd-developer-backend",
    capability: "sofka-asdd-developer-bug-fix",
    scope: [".claude/scripts/test-plan-authorization-operation-hook.mjs"],
    commands: ["node .claude/scripts/test-plan-authorization-operation-hook.mjs"],
    model: "sonnet", max_turns: 20, retries: 0,
  }],
};
const launch = (agent = "sofka-asdd-developer-backend") => ({
  tool_name: "Agent", tool_input: {
    subagent_type: agent,
    model: "sonnet",
    prompt: "[ASDD-BUDGET route=LIGHT phase=build model=sonnet max_turns=20 retries=0]\nnode .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix\nexecute authorized scope",
  },
});
const operation = (overrides = {}) => ({
  tool_name: "Edit",
  tool_input: { file_path: ".claude/scripts/test-plan-authorization-operation-hook.mjs" },
  agent_id: "runtime-agent-1",
  agent_type: "sofka-asdd-developer-backend",
  ...overrides,
});

console.log("PO1: sin lote ASDD el plan-gate mantiene ask y operaciones no cambian permisos");
clean();
assert("Agent sin lote devuelve ask", decision(getPlanGateDecision(launch()), "ask"));
assert("operación de subagente sin lote permite", allows(getOperationAuthorizationDecision(operation())));

console.log("PO2: lote aprobado permite launch + path/comando exactos");
clean();
issueChallenge(plan);
approveActiveChallenge();
assert("Agent autorizado permite", allows(getPlanGateDecision(launch())));
assert("Edit sin capability cargada devuelve deny", decision(getOperationAuthorizationDecision(operation()), "deny", "capability-not-loaded"));
assert("loader de capability declarada permite", allows(getOperationAuthorizationDecision(operation({
  tool_name: "Bash", tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix" },
}))));
assert("Edit dentro del scope tras cargar capability permite", allows(getOperationAuthorizationDecision(operation())));
assert("Bash exacto permite", allows(getOperationAuthorizationDecision(operation({
  tool_name: "Bash", tool_input: { command: "node .claude/scripts/test-plan-authorization-operation-hook.mjs" },
}))));
assert("resolver de capabilities read-only permite", allows(getOperationAuthorizationDecision(operation({
  tool_name: "Bash", tool_input: { command: "node .claude/scripts/sofka-asdd-resolve-capability.mjs sofka-asdd-developer-bug-fix" },
}))));
assert("loader de capability distinta devuelve deny", decision(getOperationAuthorizationDecision(operation({
  tool_name: "Bash", tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-unit-test" },
})), "deny", "capability-mismatch"));

console.log("PO3: challenge nuevo pendiente conserva el binding del lote vigente");
issueChallenge({
  ...plan,
  request_id: "hook-binding-reissue",
  task: "new plan pending approval",
  agents: [{
    ...plan.agents[0],
    scope: [".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs"],
    commands: [],
  }],
});
assert("Edit fuera del scope original sigue devolviendo deny", decision(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs" },
})), "deny", "scope-mismatch"));
assert("Bash fuera de commands original sigue devolviendo deny", decision(getOperationAuthorizationDecision(operation({
  // Fixture deliberadamente fuera de toda allowlist: resolve-workspace escribe
  // estado y ninguna regla se lo manda a un agente.
  tool_name: "Bash", tool_input: { command: "node .claude/scripts/sofka-asdd-resolve-workspace.mjs" },
})), "deny", "command-mismatch"));

console.log("PO4: mismatches de alcance/comando/identidad se deniegan");
assert("scope distinto devuelve deny", decision(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs" },
})), "deny", "scope-mismatch"));
assert("comando compuesto devuelve deny", decision(getOperationAuthorizationDecision(operation({
  tool_name: "Bash",
  tool_input: { command: "node .claude/scripts/test-plan-authorization-operation-hook.mjs; echo injected" },
})), "deny", "command-mismatch"));
assert("otro runtime agent devuelve deny", decision(getOperationAuthorizationDecision(operation({ agent_id: "runtime-agent-2" })), "deny", "runtime-identity-mismatch"));
assert("segundo launch devuelve deny", decision(getPlanGateDecision(launch()), "deny"));

console.log("PO5: un agente distinto no puede reutilizar el lote vivo");
clean();
issueChallenge(plan);
approveActiveChallenge();
assert("launch de agente distinto devuelve deny", decision(getPlanGateDecision(launch("sofka-asdd-security")), "deny"));
assert("operación con identidad incompleta devuelve deny", decision(getOperationAuthorizationDecision(operation({ agent_type: undefined })), "deny", "missing-runtime-identity"));

console.log("PO6: un symlink dentro del scope no permite escapar del árbol autorizado");
clean();
const symlinkFixture = ".claude/.runtime/e2e-symlink-fixture";
const symlinkPath = `${symlinkFixture}/escape.mjs`;
// Limpieza defensiva: una corrida previa abortada antes de este punto puede
// haber dejado el fixture en disco (untracked). Sanear siempre al empezar.
rmSync(symlinkFixture, { recursive: true, force: true });
mkdirSync(symlinkFixture, { recursive: true });
let symlinkCreated = false;
try {
  // Symlink de ARCHIVO: en Windows exige SeCreateSymbolicLinkPrivilege
  // (ejecutar como administrador) o Modo Desarrollador activo. A diferencia
  // de una junction (solo válida para directorios), no hay forma portable de
  // crear este symlink de archivo sin elevación.
  symlinkSync("../../scripts/lib/sofka-asdd-plan-authorization-lib.mjs", symlinkPath);
  symlinkCreated = true;
} catch (error) {
  if (error?.code === "EPERM") {
    console.log(
      "  ⚠️  SKIP PO6 — symlinkSync de archivo requiere privilegio de administrador o " +
      "Modo Desarrollador en Windows (EPERM). No se declara PASS: el caso queda " +
      "explícitamente sin ejecutar y PO1–PO5/PO7 continúan corriendo y reportando.",
    );
  } else {
    rmSync(symlinkFixture, { recursive: true, force: true });
    throw error;
  }
}
if (symlinkCreated) {
  try {
    issueChallenge({
      ...plan,
      request_id: "hook-symlink-test",
      task: "symlink escape test",
      agents: [{
        agent: "sofka-asdd-developer-backend",
        capability: "sofka-asdd-developer-bug-fix",
        scope: [`${symlinkFixture}/`],
        commands: [],
        model: "sonnet", max_turns: 20, retries: 0,
      }],
    });
    approveActiveChallenge();
    assert("launch del lote symlink permite", allows(getPlanGateDecision(launch())));
    assert("loader previo al Edit symlink permite", allows(getOperationAuthorizationDecision(operation({
      agent_id: "runtime-symlink-1",
      tool_name: "Bash",
      tool_input: { command: "node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix" },
    }))));
    assert("symlink dentro del scope devuelve scope-mismatch", decision(getOperationAuthorizationDecision(operation({
      agent_id: "runtime-symlink-1",
      tool_input: { file_path: symlinkPath },
    })), "deny", "scope-mismatch"));
  } finally {
    rmSync(symlinkFixture, { recursive: true, force: true });
  }
} else {
  rmSync(symlinkFixture, { recursive: true, force: true });
}

console.log("PO7: escape hatch del launch no desactiva el hook de operaciones");
clean();
issueChallenge(plan);
approveActiveChallenge();
const previousEscapeHatch = process.env.SOFKA_ASDD_PLAN_GATE_DISABLE;
process.env.SOFKA_ASDD_PLAN_GATE_DISABLE = "1";
try {
  assert("escape hatch permite launch sin consumirlo", allows(getPlanGateDecision(launch())));
} finally {
  if (previousEscapeHatch === undefined) delete process.env.SOFKA_ASDD_PLAN_GATE_DISABLE;
  else process.env.SOFKA_ASDD_PLAN_GATE_DISABLE = previousEscapeHatch;
}
assert("operación tras escape hatch devuelve launch-not-authorized", decision(
  getOperationAuthorizationDecision(operation({ agent_id: "runtime-escape-hatch-1" })),
  "deny",
  "launch-not-authorized",
));

console.log("PO8: composiciones read-only benignas pasan; las que escriben o ejecutan no");
clean();
issueChallenge(plan);
approveActiveChallenge();
getPlanGateDecision(launch());
const bash = (command, overrides = {}) => operation({ tool_name: "Bash", tool_input: { command }, ...overrides });

assert("loader con 2>&1 y pipe a head permite y registra la capability", allows(
  getOperationAuthorizationDecision(bash("node .claude/scripts/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix 2>&1 | head -20")),
));
assert("Edit tras el loader compuesto ya no pide capability", allows(getOperationAuthorizationDecision(operation())));

for (const command of [
  "ls .claude/scripts 2>/dev/null | head -20",
  "find .claude/scripts -type f -name \"*.mjs\" | sort",
  "ls -d .claude .claude/scripts 2>&1; echo \"---\"; ls .claude/hooks 2>&1",
  "rg -n \"plan|auth\" .claude/scripts/lib | head -5",
  "git rev-parse --abbrev-ref HEAD",
  "git -C . status",
  "pwd",
  "node --version",
  "cd .claude/scripts && cat lib/sofka-asdd-plan-authorization-lib.mjs",
]) {
  assert(`permite: ${command}`, allows(getOperationAuthorizationDecision(bash(command))));
}

for (const [command, code] of [
  ["node .claude/scripts/test-plan-authorization-operation-hook.mjs | head -5", "command-mismatch"],
  ["ls . && rm -rf /tmp/nope", "command-mismatch"],
  ["ls . | sh", "command-mismatch"],
  ["cat .gitignore | tee /tmp/copia.txt", "command-mismatch"],
  ["cat > /tmp/escritura.txt", "command-mismatch"],
  ["ASDD_DEP_GUARD_ENABLED=false cat > /tmp/escritura.txt", "command-mismatch"],
  ["git config user.email nadie@example.com", "command-mismatch"],
  ["git add .gitignore", "command-mismatch"],
  ["find . -name \"*.tmp\" -delete", "command-mismatch"],
  ["find . -name \"*.mjs\" -exec rm {} +", "command-mismatch"],
  ["sort .gitignore -o /tmp/ordenado.txt", "command-mismatch"],
  ["ls $(whoami)", "command-mismatch"],
  ["ls . &", "command-mismatch"],
]) {
  assert(`deniega: ${command}`, decision(getOperationAuthorizationDecision(bash(command)), "deny", code));
}

console.log("PO9: rutas que el framework obliga a escribir no exigen scope, pero no cruzan de agente");
assert("memoria del propio agente permite", allows(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".claude/agent-memory/sofka-asdd-developer-backend/MEMORY.md" },
}))));
assert("checkpoint del run permite", allows(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".asdd-run.json" },
}))));
assert("memoria de otro agente devuelve scope-mismatch", decision(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".claude/agent-memory/sofka-asdd-security/MEMORY.md" },
})), "deny", "scope-mismatch"));
assert("otra ruta bajo .claude sigue fuera de scope", decision(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".claude/settings.json" },
})), "deny", "scope-mismatch"));
assert("scratch en .tmp permite (sofka-asdd-ephemeral-artifacts)", allows(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: ".tmp/analyze-coverage.py" },
}))));
assert("raiz del repo sigue fuera de scope", decision(getOperationAuthorizationDecision(operation({
  tool_input: { file_path: "analyze-coverage.py" },
})), "deny", "scope-mismatch"));

console.log("PO10: el control-plane que las reglas obligan a ejecutar no exige declaracion");
for (const command of [
  // Las 9 reglas always-on exigen este comando en su bloque de carga condicional.
  "node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-orchestration",
  // sofka-asdd-system-integrity exige cerrar con el validador y el runner del proyecto.
  "node .claude/scripts/validate-template.mjs",
  "npm test",
  "npm run validate",
  // sofka-asdd-anti-loops exige verificar worktrees al cerrar sesion.
  "git worktree list",
]) {
  assert(`permite: ${command}`, allows(getOperationAuthorizationDecision(bash(command))));
}
for (const command of [
  // Scripts declarados en package.json que NO son de verificacion.
  "npm run setup",
  "npm run hash:regen",
  "npm test -- --coverage",
  // Escribe estado y ninguna regla se lo manda a un agente.
  "node .claude/scripts/sofka-asdd-resolve-workspace.mjs",
  // Un subagente no consulta ni aprueba su propia autorizacion (ORC-010-A).
  "node .claude/scripts/sofka-asdd-plan-authorization.mjs status",
  // Homonimo fuera del proyecto: el allowlist es por ruta, no por basename.
  "node /etc/evil/sofka-asdd-resolve-rule.mjs sofka-asdd-orchestration",
  "git worktree remove --force /tmp/x",
]) {
  assert(`deniega: ${command}`, decision(getOperationAuthorizationDecision(bash(command)), "deny", "command-mismatch"));
}

console.log("PO11: una cadena de loaders carga las dos capabilities aprobadas en una sola llamada");
clean();
const LOADER = "node .claude/scripts/sofka-asdd-load-capability.mjs";
const planConDependencia = {
  ...plan,
  request_id: "hook-loader-chain",
  agents: [{
    ...plan.agents[0],
    capability: "sofka-asdd-developer-bug-fix",
    dependencies: ["sofka-asdd-developer-unit-test"],
  }],
};
issueChallenge(planConDependencia);
approveActiveChallenge();
getPlanGateDecision(launch());
assert("cadena de dos loaders aprobados permite", allows(getOperationAuthorizationDecision(bash(
  `${LOADER} sofka-asdd-developer-bug-fix && ${LOADER} sofka-asdd-developer-unit-test`,
))));
assert("Edit tras la cadena ya no pide capability", allows(getOperationAuthorizationDecision(operation())));

clean();
issueChallenge(planConDependencia);
approveActiveChallenge();
getPlanGateDecision(launch());
assert("cadena en orden inverso tambien permite", allows(getOperationAuthorizationDecision(bash(
  `${LOADER} sofka-asdd-developer-unit-test && ${LOADER} sofka-asdd-developer-bug-fix`,
))));
assert("Edit tras la cadena invertida ya no pide capability", allows(getOperationAuthorizationDecision(operation())));

clean();
issueChallenge(planConDependencia);
approveActiveChallenge();
getPlanGateDecision(launch());
// La cadena no amplia autoridad: cada eslabon se valida igual que si fuera solo.
assert("cadena con una capability no aprobada devuelve capability-mismatch", decision(
  getOperationAuthorizationDecision(bash(`${LOADER} sofka-asdd-developer-bug-fix && ${LOADER} sofka-asdd-developer-e2e-test`)),
  "deny", "capability-mismatch",
));
assert("cadena con una escritura devuelve command-mismatch", decision(
  getOperationAuthorizationDecision(bash(`${LOADER} sofka-asdd-developer-bug-fix && rm -rf /tmp/x`)),
  "deny", "command-mismatch",
));
assert("cadena con un comando declarado devuelve command-mismatch", decision(
  getOperationAuthorizationDecision(bash(`${LOADER} sofka-asdd-developer-bug-fix && npm run setup`)),
  "deny", "command-mismatch",
));
assert("homonimo del loader fuera del proyecto devuelve command-mismatch", decision(
  getOperationAuthorizationDecision(bash(`node /etc/evil/sofka-asdd-load-capability.mjs sofka-asdd-developer-bug-fix && ${LOADER} sofka-asdd-developer-unit-test`)),
  "deny", "command-mismatch",
));
assert("cadena en background devuelve command-mismatch", decision(
  getOperationAuthorizationDecision(bash(`${LOADER} sofka-asdd-developer-bug-fix & ${LOADER} sofka-asdd-developer-unit-test`)),
  "deny", "command-mismatch",
));
assert("Edit tras la cadena rechazada sigue pidiendo capability", decision(
  getOperationAuthorizationDecision(operation()), "deny", "capability-not-loaded",
));

console.log("PO12: `test` es lectura; `>/dev/null` no convierte una escritura en lectura");
clean();
issueChallenge(plan);
approveActiveChallenge();
getPlanGateDecision(launch());
assert("permite: test -f .gitignore", allows(getOperationAuthorizationDecision(bash("test -f .gitignore"))));
assert("permite: loader con >/dev/null", allows(getOperationAuthorizationDecision(bash(
  `${LOADER} sofka-asdd-developer-bug-fix >/dev/null 2>&1`,
))));
assert("deniega: cat > /dev/null.txt", decision(
  getOperationAuthorizationDecision(bash("cat .gitignore >/dev/null.txt")), "deny", "command-mismatch",
));

clean();
console.log(`\nOperation authorization hook: ${passed} ✅ ${failed} ❌`);
if (failed) process.exit(1);
