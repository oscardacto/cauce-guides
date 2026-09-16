#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-guard-branch.mjs
//
// Hook PreToolUse (matcher: Bash) que bloquea `git commit` en ramas protegidas.
// Refuerza mecánicamente la regla GS-001 de asdd-git-safety.md.
//
// Protocolo (hooks PreToolUse de Claude Code):
//   - Entrada: JSON por stdin con { tool_name, tool_input, ... }.
//   - Exit code 2 + mensaje por stderr: BLOQUEA la ejecución del tool.
//     (exit 1 es error no bloqueante — el commit se ejecutaría igual).
//   - Exit code 0: permite.
//
// Configuración (por proyecto, vía bloque `env` de .claude/settings.json):
//   ASDD_PROTECTED_BRANCHES   lista separada por comas. Default:
//                                   "main,master,qa,dev,develop"
//   ASDD_GUARD_BRANCH_DISABLE=1   escape hatch auditable — desactiva el
//                                   bloqueo para la sesión. Su uso se anuncia
//                                   por stdout para que quede en el log.
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveEffectiveCwd, parseInlineEnvVar, maskQuotes } from "./_lib/git-command-cwd.mjs";
import { consumeCommitAuthorization } from "../scripts/lib/asdd-commit-authorization-lib.mjs";

const DEFAULT_PROTECTED = "main,master,qa,dev,develop";
const ENV_VAR_NAME = "ASDD_GUARD_BRANCH_DISABLE";

// Matchea `git commit` como subcomando real: `git commit`, `git -C x commit`,
// `cd y && git commit`. No matchea menciones en strings de otros comandos
// gracias al límite de palabra y a exigir `git` + flags globales + `commit`.
const GIT_COMMIT_RE = /\bgit(\s+(-C\s+\S+|--git-dir=\S+|--work-tree=\S+|-c\s+\S+))*\s+commit\b/;

// Un comando que invoca un intérprete puede esconder "git commit" en una
// cadena que el intérprete evalúa en runtime — ahí hay que mirar el crudo
// (fail-closed), enmascarar comillas ahí abriría un bypass real.
const INTERPRETER_RE = /\b(bash|sh|zsh)\s+(-\w*c\w*)\b|\beval\b|\bnode\s+-e\b|\bcmd(\.exe)?\s+\/c\b/i;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// symbolic-ref resuelve también ramas "unborn" (repo recién inicializado sin
// commits), donde rev-parse falla y dejaría pasar el commit.
function currentBranch(cwd) {
  try {
    return execSync("git symbolic-ref --short HEAD", {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // No es un repo git, git no disponible, o HEAD detached — nada que proteger.
    return null;
  }
}

export function getBranchGuardDecision(input, environment = process.env) {
  const toolName = input.tool_name || input.toolName || "";
  if (toolName !== "Bash") return null;

  const command = input?.tool_input?.command || input?.toolInput?.command || "";
  const commandForDetection = INTERPRETER_RE.test(command) ? command : maskQuotes(command, true);
  if (!GIT_COMMIT_RE.test(commandForDetection)) return null;

  // Escape hatch auditable: por env de sesión O por prefijo inline en el
  // comando (VAR=1 comando). El prefijo inline nunca llega al proceso Node
  // del hook, así que se detecta parseando el string del comando (B2).
  // El escape hatch existe por diseño (ADR-007) y desactiva GS-001: la
  // verificación de rama protegida. Lo que NO puede desactivar es GS-003, que
  // es otra regla, con otro mecanismo —challenge ligado a rama y comando, de un
  // solo uso— nacido justamente de un bypass reportado y remediado. Antes esta
  // rama retornaba `allow` antes de llegar al efecto que consume la
  // autorización, así que un prefijo que el propio agente escribe en el
  // comando apagaba las dos reglas de una vez. Ahora el hatch se registra,
  // exime de GS-001 y deja GS-003 en pie.
  const hatchActivo =
    environment[ENV_VAR_NAME] === "1" || parseInlineEnvVar(command, ENV_VAR_NAME);
  const efectoAuditoria = hatchActivo
    ? [{
        type: "audit",
        message:
          `[guard-branch] ADVERTENCIA: GS-001 desactivado vía ${ENV_VAR_NAME}=1 — ` +
          `uso autorizado solo para operaciones de release. GS-003 sigue exigiendo autorización explícita.`,
      }]
    : [];

  const protectedBranches = (environment.ASDD_PROTECTED_BRANCHES || DEFAULT_PROTECTED)
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  // FIX R3b: se pasa GIT_COMMIT_RE como targetRe para que el helper resuelva
  // el CWD de la invocación `git commit` real, no el de un `-C`/`cd` de otra
  // invocación `git` no relacionada en el mismo comando compuesto (bypass
  // confirmado por auditoría adversarial — ver git-command-cwd.mjs).
  const { resolved, ambiguous, candidates, unsafe, unsafeReason, forceBlock, base } =
    resolveEffectiveCwd(command, input.cwd, GIT_COMMIT_RE);

  // FIX R3c: el comando contiene una construcción de shell que no se puede
  // parsear con certeza (subshell, brace group, command substitution,
  // backtick, eval, pipe) y no se pudo extraer NINGÚN cd/-C del comando —
  // no hay forma de confiar en que el commit corre en el repo base.
  // Bloqueo incondicional (fail-closed duro).
  if (forceBlock) {
    return { decision: "deny", reason:
      `BLOQUEADO: el comando contiene una construcción de shell no parseable con certeza ` +
        `('${unsafeReason}') y no fue posible determinar en qué repositorio corre 'git commit'. ` +
        `Fail-closed obligatorio (R3c). Ejecutá el commit de forma simple y directa, sin ` +
        `subshells, brace groups, command substitution, backticks, eval ni pipes. ` +
        `Ver .claude/rules/asdd-git-safety.md (GS-001).`
    };
  }

  if (ambiguous) {
    // MITIGACIÓN FAIL-CLOSED (Bug B): parseo ambiguo → evaluar TODOS los
    // candidatos (repo resuelto + repo raíz) y bloquear si CUALQUIERA está
    // en rama protegida. Nunca degradar a fail-open.
    for (const candidate of candidates) {
      const branch = currentBranch(candidate);
      if (branch && protectedBranches.includes(branch)) {
        return { decision: "deny", reason:
          `BLOQUEADO: parseo ambiguo del comando (múltiples 'cd'/'-C' o variable de shell sin resolver) — ` +
            `el repo candidato '${candidate}' está en la rama protegida '${branch}'. ` +
            `Fail-closed obligatorio (Bug B — repos anidados). ` +
            `Crea primero una feature branch (GitFlow: feature/|fix/|hotfix/|chore/|refactor/|test/|docs/ + kebab-case). ` +
            `Ver .claude/rules/asdd-git-safety.md (GS-001).`
        };
      }
    }
    return null;
  }

  const branch = currentBranch(resolved);
  if (!branch) {
    // FIX R3d: antes fallaba abierto (exit 0) ante cualquier fallo de
    // resolución de rama. Si el comando no relocalizó el cwd (resolved ===
    // base), es el caso mono-repo legítimo donde `base` simplemente no es
    // un repo git — nada que proteger, se permite (comportamiento
    // histórico). Si el comando SÍ relocalizó el cwd (cd/-C/pushd) y ese
    // destino no resuelve a ninguna rama, es sospechoso — fail-closed:
    // bloquear en vez de permitir en silencio.
    if (resolved === base) return null;
    return { decision: "deny", reason:
      `BLOQUEADO: no se pudo determinar la rama del repositorio objetivo ('${resolved}'). ` +
        `El comando relocalizó el cwd (cd/-C/pushd) hacia un destino que no resuelve a ninguna ` +
        `rama git. Fail-closed obligatorio (R3d) — verificá que el path exista y ejecutá el ` +
        `commit de forma simple. Ver .claude/rules/asdd-git-safety.md (GS-001).`
    };
  }

  if (protectedBranches.includes(branch) && !hatchActivo) {
    return { decision: "deny", reason:
      `BLOQUEADO: no se puede hacer commit directamente en la rama protegida '${branch}'. ` +
        `Crea primero una feature branch (GitFlow: feature/|fix/|hotfix/|chore/|refactor/|test/|docs/ + kebab-case). ` +
        `Ramas protegidas: ${protectedBranches.join(", ")} (configurables vía ASDD_PROTECTED_BRANCHES). ` +
        `Ver .claude/rules/asdd-git-safety.md (GS-001).`
    };
  }

  // GS-003: aun en ramas no protegidas —y aun con el hatch de GS-001 activo—
  // un commit requiere challenge explícito, ligado a la rama y consumible una
  // sola vez. Nunca reutiliza el plan-gate.
  return {
    decision: "allow",
    effects: [
      ...efectoAuditoria,
      {
        type: "consume-commit-authorization",
        execute: () => consumeCommitAuthorization({ branch, command }),
        failureReason:
          "BLOQUEADO GS-003: este git commit no tiene autorización explícita vigente. " +
          "Mostrá el comando exacto, emití el challenge con asdd-commit-authorization.mjs issue y esperá confirmación del usuario.",
      },
    ],
  };
}

function main() {
  const result = getBranchGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  for (const effect of result.effects ?? []) {
    if (effect.type === "audit") { process.stdout.write(`${effect.message}\n`); continue; }
    try { effect.execute(); } catch { process.stderr.write(`${effect.failureReason}\n`); process.exit(2); }
  }
  if (result.decision === "allow") process.exit(0);
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
