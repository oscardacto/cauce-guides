// -----------------------------------------------------------------------------
// GS-003 modo `intent` — decidir si la orden del usuario ES la autorización.
//
// Vive acá y no en el hook por dos razones: el hook `user-prompt-submit` es un
// despachador delgado con presupuesto de contexto propio
// (`.sofka-asdd/context-budget.json`), y esta decisión es testeable por sí sola.
// El porqué del modo está en ADR-022 y en GS-003 de la referencia de git-safety.
// -----------------------------------------------------------------------------
import { appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { issueIntentCommitAuthorization } from "./sofka-asdd-commit-authorization-lib.mjs";
import { isAutomatedTurn } from "./sofka-asdd-proportional-router-lib.mjs";

// Subconjunto de GIT_OPS_RE: acá solo importa si el turno ordena COMMITEAR.
// Push y MR/PR tienen sus propios gates y no dependen de esto.
export const COMMIT_INTENT_RE = new RegExp(
  [
    String.raw`\bgit\s+commit\b`,
    String.raw`\bcommite[aá]\w*\b`,
    String.raw`\bcommitear\b`,
    String.raw`\b(?:haz|hac[eé]r?|hagamos|prepar[aá]?r?|arm[aá]?r?|gener[aá]?r?)\s+(?:el\s+|un\s+|los\s+)?commits?\b`,
    String.raw`\b(?:make|create|do)\s+(?:a\s+|the\s+)?commit\b`,
    String.raw`\bcommit\s+(?:the\s+|these\s+|my\s+)?(?:changes?|code|work)\b`,
    String.raw`^\s*commit(?:\s+y\s+push)?\s*[.!]*\s*$`,
  ].join("|"),
  "i",
);

const DEFAULT_PROTECTED_BRANCHES = "main,master,qa,dev,develop";

const projectRoot = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();

function currentBranch() {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
      cwd: projectRoot(),
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Sin rama no hay binding posible: no se pre-autoriza nada.
    return null;
  }
}

function protectedBranches() {
  return (process.env.SOFKA_ASDD_PROTECTED_BRANCHES || DEFAULT_PROTECTED_BRANCHES)
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

// Una pre-autorización es una decisión de GS-003, y la regla promete que toda
// decisión es auditable: va al mismo JSONL que usan las otras capas. Nunca lanza
// —auditar no puede convertirse en bloqueo— pero tampoco queda en silencio.
function audit(branch, authorization) {
  try {
    const runtime = path.join(projectRoot(), ".claude", ".runtime");
    mkdirSync(runtime, { recursive: true, mode: 0o700 });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      hook: "user-prompt-submit",
      rule: "GS-003",
      decision: "intent-preauth",
      detail: `orden git explícita del usuario: pre-autorización de commit para '${branch}' `
        + `(cupo ${authorization.max_uses_per_branch}, vence ${authorization.expires_at})`,
      branch,
      authorization_id: authorization.authorization_id,
      prompt_hash: authorization.prompt_hash,
      user: process.env.USERNAME || process.env.USER || "",
    });
    appendFileSync(path.join(runtime, "git-audit.jsonl"), `${line}\n`, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`[asdd] no se pudo auditar la pre-autorización GS-003: ${error.message}\n`);
  }
}

/**
 * Emite la pre-autorización si el turno la justifica, o `null` si no.
 *
 * Condiciones acumulativas, todas necesarias: la ruta determinista resolvió la
 * vía rápida git (que ya excluyó DANGEROUS_GIT — force push, reset --hard,
 * reescritura de historia), el prompt ORDENA commitear y no solo menciona git,
 * el turno lo escribió el usuario y no la máquina, y la rama no es protegida
 * (ahí manda GS-001 y no hay nada que autorizar).
 *
 * Nunca lanza y nunca degrada a permitir: si algo falla, devuelve `null` y rige
 * el challenge clásico.
 */
export function issueIntentCommitPreauthorization({ prompt, route }) {
  if (route?.fast_lane !== "git_ops") return null;
  if (!COMMIT_INTENT_RE.test(String(prompt ?? ""))) return null;
  if (isAutomatedTurn(prompt)) return null;

  const branch = currentBranch();
  if (!branch || protectedBranches().includes(branch)) return null;

  try {
    const authorization = issueIntentCommitAuthorization({ branch, prompt, max_uses: 1 });
    audit(branch, authorization);
    return authorization;
  } catch {
    return null;
  }
}
