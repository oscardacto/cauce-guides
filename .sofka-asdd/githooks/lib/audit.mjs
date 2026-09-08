// -----------------------------------------------------------------------------
// audit.mjs — registro durable de las decisiones de los git hooks ASDD.
//
// Por qué existe: la regla git-safety llama "auditable" al escape hatch y
// promete que "su uso queda registrado en el output del hook". Ese registro era
// una línea a stderr, transitoria y sin persistencia: no había forma de
// responder quién desactivó un guard, cuándo, y qué commit entró por ahí.
// Este módulo escribe un JSONL append-only, con permisos 0600.
// -----------------------------------------------------------------------------

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { git, repoRoot } from "./facts.mjs";

/**
 * Resuelve el archivo de auditoría. Preferimos `.claude/.runtime/` (gitignored
 * en el template); si el repo no tiene `.claude/`, caemos al directorio de git,
 * que siempre existe y nunca se versiona.
 */
function auditPath(cwd = repoRoot()) {
  const runtime = path.join(cwd, ".claude", ".runtime");
  if (existsSync(path.join(cwd, ".claude"))) {
    try {
      mkdirSync(runtime, { recursive: true, mode: 0o700 });
      return path.join(runtime, "git-audit.jsonl");
    } catch {
      /* cae al fallback */
    }
  }
  const gitDir = git(["rev-parse", "--git-dir"], cwd) || ".git";
  const abs = path.isAbsolute(gitDir) ? gitDir : path.join(cwd, gitDir);
  return path.join(abs, "asdd-git-audit.jsonl");
}

/**
 * Registra un evento. Nunca lanza: un fallo de auditoría no debe romper un
 * commit legítimo, pero sí se avisa por stderr para que no pase inadvertido.
 *
 * @param {object} event
 * @param {string} event.hook    Hook que decide (pre-commit, pre-push, ...).
 * @param {string} event.rule    Código de regla (GS-001, GS-005, ART-001, ...).
 * @param {"block"|"allow"|"warn"|"hatch"} event.decision
 * @param {string} [event.detail]
 */
export function record(event) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    hook: event.hook,
    rule: event.rule,
    decision: event.decision,
    detail: event.detail || "",
    branch: event.branch || "",
    repo: event.repo || repoRoot(),
    user: process.env.USERNAME || process.env.USER || "",
    ci: Boolean(process.env.CI),
  });
  try {
    appendFileSync(auditPath(), line + "\n", { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`[asdd-githooks] no se pudo escribir la auditoría: ${error.message}\n`);
  }
}

export { auditPath };
