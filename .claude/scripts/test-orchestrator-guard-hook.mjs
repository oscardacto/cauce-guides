#!/usr/bin/env node
/**
 * Smoke test — asdd-orchestrator-guard.mjs (#3606/#3607)
 * Uso: node .claude/scripts/test-orchestrator-guard-hook.mjs
 *
 * Verifica que el hook PreToolUse aplica ORC-000 / ORC-000-B / CORE-009:
 *
 * C1 — main thread + Bash no incluido (sin agent_id) → DEBE pedir autorización (ask)
 * C2 — subagente + Bash (con agent_id)   → DEBE permitir
 * C3 — main thread + Read (tool no cubierta) → DEBE permitir
 * C4 — main thread + Bash + env DISABLE=1 → DEBE permitir
 * C5 — main thread + Edit (sin agent_id) → DEBE DENEGAR (deny)  [cambiado en #3607]
 * C6 — main thread + Write (sin agent_id) → DEBE DENEGAR (deny) [cambiado en #3607]
 * C7 — main thread + Bash read-only allow-listed → DEBE permitir sin ask
 * C8 — comandos read-only con side effects de shell/find → DEBEN pedir ask
 * C9 — emisión canónica de challenge ORC-010-A → DEBE permitir sin ask;
 *      comandos de control redundantes → DEBEN denegarse sin prompt nativo
 */

import { getOrchestratorGuardDecision } from "../hooks/asdd-orchestrator-guard.mjs";

let passed = 0;
let failed = 0;

function assert(label, ok, detail = "") {
  if (ok) {
    console.log(`    ✅ ${label}`);
    passed++;
  } else {
    console.error(`    ❌ FAIL: ${label}${detail ? `  →  ${detail}` : ""}`);
    failed++;
  }
}

function run(payload, opts = {}) {
  const { env: extra = {} } = opts;
  const env = { ...process.env, ...extra };
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  const result = getOrchestratorGuardDecision(payload, env);
  const stdout = result
    ? JSON.stringify({ hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      } })
    : "";
  return { stdout, stderr: "", code: 0 };
}

function isAsk(stdout) {
  if (!stdout.trim()) return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed?.hookSpecificOutput?.permissionDecision === "ask";
  } catch {
    return false;
  }
}

function isDeny(stdout) {
  if (!stdout.trim()) return false;
  try {
    const parsed = JSON.parse(stdout);
    return parsed?.hookSpecificOutput?.permissionDecision === "deny";
  } catch {
    return false;
  }
}

// C1 — `pwd` es lectura pura → allow. Cambiado en P5 del plan «Clasificar por
// plano»: `pwd` ya estaba en el léxico de la librería de subagentes y no en el del
// guard, y esa divergencia es exactamente la que el léxico único elimina.
console.log("C1: main thread + `pwd` (lectura pura) → allow; no clasificable → ask");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "pwd" },
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  // ANTES: se esperaba ask. `pwd` no lee ni escribe nada del workspace.
  assert("`pwd` no pide confirmación", r.stdout.trim() === "", r.stdout.slice(0, 200));
  // ANTES: el texto se medía sobre `pwd`. `ask` sigue vivo y sigue citando ORC-000,
  // pero ahora solo sobre lo que de verdad no se puede clasificar (D1).
  const noClasificable = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "terraform plan" },
  });
  assert(
    "un ejecutable no declarado sigue dando ask citando ORC-000",
    isAsk(noClasificable.stdout) && noClasificable.stdout.includes("ORC-000"),
    noClasificable.stdout.slice(0, 200),
  );
}

// C7 — main thread + Bash de consulta local allow-listed → permitir
console.log("C7: main thread + Bash local read-only allow-listed → allow");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: {
      command: '(rg -l -i "context" .claude/ --glob "*.mjs" 2>/dev/null || grep -rli "context" .claude/ --include="*.mjs" 2>/dev/null); echo "---SCRIPTS---"; ls .claude/scripts/',
    },
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("stdout vacío (sin ask)", r.stdout.trim() === "", r.stdout.slice(0, 200));
}
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: 'rg -li "context.*valid|valid.*context|context.*budget|token.*budget" -l 2>/dev/null | head -30' },
  });
  assert("regex quoted with pipes remains an allow-listed read", r.stdout.trim() === "", r.stdout.slice(0, 200));
}
for (const command of [
  "git -C /tmp/consumer status --short",
  "node .claude/scripts/asdd-route-request.mjs --file docs/contexto/prompts/00-auditoria-contexto.md",
  'cat .asdd/capability-loading.json 2>/dev/null | python3 -m json.tool 2>/dev/null | grep -A3 "producto" | head -40',
]) {
  const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
  assert(`${command} es diagnóstico read-only permitido`, r.stdout.trim() === "", r.stdout.slice(0, 200));
}

// C8 — redirección, sustitución, `find -exec`, `tree -o`, mutación de git y
// traversal NO son TRIVIAL, y tampoco son una pregunta al usuario.
// Cambiado en P5 del plan «Clasificar por plano»: la política vieja era «comando de
// lectura con efecto secundario → preguntale al usuario», y cruzada con la tasa de
// aprobación real —32 de 32— no era un control sino un clic que autorizaba una
// escritura. Cada caso lleva abajo el motivo por el que ahora deniega.
console.log("C8: Bash con side effect o ejecución indirecta → deny");
for (const [command, porQue] of [
  ["rg context .claude > resultado.txt", "redirección de escritura"],
  ["grep $(cat secreto) .claude", "sustitución de comandos"],
  ["find . -exec echo {} \;", "predicado de ejecución"],
  ["tree -o inventario.txt", "escribe un archivo"],
  ["git branch -D feature/temporal", "muta el repositorio"],
  ["node .claude/scripts/asdd-route-request.mjs --file ../secreto.md", "traversal fuera del proyecto"],
]) {
  const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
  assert(`${command} produce deny (${porQue})`, isDeny(r.stdout), r.stdout.slice(0, 200));
}

// C9 — la única escritura efímera admitida al orquestador antes de `ok`.
console.log("C9: emisión challenge ORC-010-A → allow");
{
  const issue = `node .claude/scripts/asdd-plan-authorization.mjs issue --plan-json '{"request_id":"req-e2e","task":"cambio","agents":[{"agent":"asdd-developer-backend","capability":"asdd-developer-bug-fix","scope":[".asdd/context-budget.json"],"commands":["node .claude/scripts/validate-template.mjs"]}]}'`;
  const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: issue } });
  assert("challenge canónico no pide confirmación extra", r.stdout.trim() === "", r.stdout.slice(0, 200));
  const multiline = issue.replace("{\"request_id\"", "{\n  \"request_id\"").replace("\"task\"", "\n  \"task\"");
  const multilineResult = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: multiline } });
  assert("challenge JSON multilínea no pide confirmación", multilineResult.stdout.trim() === "", multilineResult.stdout.slice(0, 200));
  const absoluteIssue = issue.replace("node .claude/scripts/", "node /tmp/consumer/.claude/scripts/") + " 2>&1";
  const absoluteResult = run({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd: "/tmp/consumer", tool_input: { command: absoluteIssue } });
  assert("challenge con ruta absoluta del proyecto y 2>&1 no duplica autorización", absoluteResult.stdout.trim() === "", absoluteResult.stdout.slice(0, 200));
  const bootstrap = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "node .claude/scripts/asdd-run-bootstrap.mjs --feature aid-bancolombia --phase specify --artifact-dir docs/specs --artifact-slug brief-aid-bancolombia" } });
  assert("bootstrap canónico de run es control-plane permitido", bootstrap.stdout.trim() === "", bootstrap.stdout.slice(0, 200));
  const escaped = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: `${issue}; rm -rf /tmp/nope` } });
  assert("challenge con comando extra se deniega", isDeny(escaped.stdout), escaped.stdout.slice(0, 200));
  for (const command of [
    "node .claude/scripts/asdd-plan-authorization.mjs approve",
    "node .claude/scripts/asdd-plan-authorization.mjs status",
    "node .claude/scripts/asdd-plan-authorization.mjs --help",
  ]) {
    const control = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    assert(`${command} se deniega sin prompt nativo`, isDeny(control.stdout), control.stdout.slice(0, 200));
    assert(`${command} explica consumo por UserPromptSubmit`, control.stdout.includes("UserPromptSubmit"), control.stdout.slice(0, 200));
  }
}

// C2 — subagente + Bash → DEBE permitir
console.log("C2: subagente + Bash (con agent_id) → allow");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo hola" },
    agent_id: "abc",
    agent_type: "asdd-developer-backend",
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("stdout vacío (sin ask)", r.stdout.trim() === "", r.stdout.slice(0, 200));
}

// C3 — main thread + Read (tool no cubierta) → DEBE permitir
console.log("C3: main thread + Read (tool no cubierta) → allow");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path: "/tmp/foo" },
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("stdout vacío (sin ask)", r.stdout.trim() === "", r.stdout.slice(0, 200));
}

// C4 — main thread + Bash + DISABLE=1 → DEBE permitir
console.log("C4: main thread + Bash + ASDD_ORCHESTRATOR_GUARD_DISABLE=1 → allow");
{
  const r = run(
    {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo hola" },
    },
    { env: { ASDD_ORCHESTRATOR_GUARD_DISABLE: "1" } },
  );
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("stdout vacío (sin ask)", r.stdout.trim() === "", r.stdout.slice(0, 200));
}

// C5 — main thread + Edit → DEBE DENEGAR (deny) — ORC-000 prohibe escritura directa del orquestador
console.log("C5: main thread + Edit (sin agent_id) → deny");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/foo", old_string: "a", new_string: "b" },
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("output contiene permissionDecision:'deny'", isDeny(r.stdout), r.stdout.slice(0, 200));
  assert(
    "razón cita ORC-000",
    r.stdout.includes("ORC-000"),
    r.stdout.slice(0, 200),
  );
}

// C6 — main thread + Write → DEBE DENEGAR (deny) — ORC-000 prohibe escritura directa del orquestador
console.log("C6: main thread + Write (sin agent_id) → deny");
{
  const r = run({
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: "/tmp/foo", content: "x" },
  });
  assert("exit code 0", r.code === 0, `code=${r.code}`);
  assert("output contiene permissionDecision:'deny'", isDeny(r.stdout), r.stdout.slice(0, 200));
  assert(
    "razón cita ORC-000",
    r.stdout.includes("ORC-000"),
    r.stdout.slice(0, 200),
  );
}

// C10 — ORC-010-E: las formas acotadas del CLI de autorización se permiten y
// el resto del CLI sigue denegado. Se verifica PARIDAD con el `issue` de C9 en
// las tres formas de comando que produce un checkout Windows: el orquestador
// emite posix por convención (`normalizeProjectControlCommand` reescribe el
// prefijo absoluto), y la forma con backslash cae a ask — igual que `issue`,
// que es la dirección segura.
console.log("C10: approve/amend acotados ORC-010-E → allow; resto del CLI → deny");
{
  const id = "11111111-2222-3333-4444-555555555555";
  const cli = "node .claude/scripts/asdd-plan-authorization.mjs";
  const allowed = [
    `${cli} approve --challenge-id ${id}`,
    `${cli} amend --challenge-id ${id} --confirm-unchanged`,
  ];
  for (const command of allowed) {
    const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    assert(`${command.slice(cli.length + 1)} no pide confirmación extra`, r.stdout.trim() === "", r.stdout.slice(0, 200));
  }
  const denied = [
    `${cli} approve`,
    `${cli} status`,
    `${cli} amend --challenge-id ${id}`,
    `${cli} approve --challenge-id not-a-uuid`,
    `${cli} approve --challenge-id ${id} ; rm -rf .claude`,
  ];
  for (const command of denied) {
    const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    assert(`${command.slice(cli.length + 1)} no se permite`, r.stdout.trim() !== "", r.stdout.slice(0, 200));
  }
}

// C11 — los cuatro defectos que ESTA suite le encontró al rediseño durante su
// validación. Se fijan como casos propios para que no puedan volver por otra vía.
console.log("C11: los cuatro defectos que la suite le cazó al rediseño");
{
  const cli = "node .claude/scripts/asdd-plan-authorization.mjs";
  const id = "11111111-2222-3333-4444-555555555555";
  const deny = (command) => isDeny(run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }).stdout);

  assert("amend --challenge-id sin --confirm-unchanged no se permite",
    deny(`${cli} amend --challenge-id ${id}`));
  assert("approve --challenge-id con uuid inválido no se permite",
    deny(`${cli} approve --challenge-id not-a-uuid`));

  const control = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: `${cli} status` } });
  assert("el deny de plan-authorization conserva el texto del consumo por UserPromptSubmit",
    isDeny(control.stdout) && control.stdout.includes("UserPromptSubmit"), control.stdout.slice(0, 200));

  const parentesis = run({ hook_event_name: "PreToolUse", tool_name: "Bash",
    tool_input: { command: '(ls .claude/scripts/ | head -5)' } });
  assert("una composición de lectura entre paréntesis no cae a ask",
    parentesis.stdout.trim() === "", parentesis.stdout.slice(0, 200));
}

// C11 — El orquestador sondeando su propio control-plane. `test` es lectura pura
// y `>/dev/null` no lleva datos a ningún lado: los dos caían fuera y el guard los
// reportaba como hueco del manifiesto o como redirección de escritura.
console.log("C11: `test` y `>/dev/null` en el sondeo del control-plane → allow");
{
  const permitidos = [
    "test -f .gitignore",
    "node .claude/scripts/asdd-resolve-rule.mjs asdd-orchestration >/dev/null 2>&1",
  ];
  for (const command of permitidos) {
    const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    assert(`${command} no cae a ask ni a deny`, r.stdout.trim() === "", r.stdout.slice(0, 200));
  }
  const denegados = [
    // El `\b` de la limpieza dejaba pasar esto como lectura.
    "cat .gitignore >/dev/null.txt",
    // Una parte peligrosa sigue mandando aunque la primera sea `test`.
    "test -f .gitignore && rm -rf /tmp/x",
  ];
  for (const command of denegados) {
    const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    assert(`${command} produce deny`, isDeny(r.stdout), r.stdout.slice(0, 200));
  }
}

console.log(`\n${"─".repeat(52)}`);
console.log(`Smoke asdd-orchestrator-guard: ${passed} ✅  ${failed} ❌`);
if (failed > 0) {
  process.exit(1);
}
