#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-pre-pr-gate.mjs
//
// Hook PreToolUse (matcher: Bash) que bloquea `glab mr create` y `gh pr create`
// si la rama no cumple las convenciones GitFlow. Refuerza la regla GS-009 de
// asdd-git-safety.md. A diferencia del pre-pr-gate de Humana (cosmético),
// este usa exit 2 — es BLOQUEANTE.
//
// Validaciones (feature branches):
//   1. La rama fuente NO es una rama protegida.
//   2. El nombre de la rama cumple el prefijo GitFlow.
//   3. La rama tiene al menos un commit que no está en la rama base.
//
// Fast-track (MRs de promoción entre ramas protegidas — dev→qa, qa→main, etc.):
//   Si fuente Y destino son ambas ramas protegidas y distintas, se omiten las
//   validaciones 1 y 2 (no aplican a feature branches). Solo se verifica check 3.
//
// Configuración (vía bloque `env` de .claude/settings.json):
//   ASDD_GUARD_PR_DISABLE=1      escape hatch auditable — desactiva.
//   ASDD_PROTECTED_BRANCHES      ramas protegidas (misma var que guard-branch).
//                                      Default: "main,master,qa,dev,develop".
//   ASDD_GITFLOW_PREFIXES        prefijos GitFlow válidos, separados por coma.
//                                      Default: ver GITFLOW_PREFIXES_DEFAULT.
// -----------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveEffectiveCwd, parseInlineEnvVar } from "./_lib/git-command-cwd.mjs";

const DEFAULT_PROTECTED = "main,master,qa,dev,develop";
const ENV_VAR_NAME = "ASDD_GUARD_PR_DISABLE";
const GITFLOW_PREFIXES_DEFAULT =
  "feature/,feat/,fix/,hotfix/,chore/,refactor/,test/,docs/,perf/,ci/";

// Detecta `glab mr create` o `gh pr create` como subcomandos reales.
// Se aplica sobre el comando con strings literales removidos para evitar
// falsos positivos cuando el patrón aparece dentro de un argumento.
const MR_CREATE_RE =
  /\b(glab\s+mr\s+create|gh\s+pr\s+create)\b/;

/** Valida que un nombre de rama no contenga caracteres de shell ni path traversal. */
function isValidBranchName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 250 &&
    /^[a-zA-Z0-9._\-/]+$/.test(name) &&
    !name.includes("..")
  );
}

/** Elimina el contenido de strings literales antes de evaluar el regex. */
function stripStringLiterals(cmd) {
  return cmd
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^']*)'/, "''");
}

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
    // JSON malformado con contenido no-vacío: fallar CERRADO (#3639).
    process.stderr.write(
      "[pre-pr-gate] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
    );
    process.exit(2);
  }
}

function currentBranch(cwd) {
  try {
    return execSync("git symbolic-ref --short HEAD", {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function protectedBranches() {
  return (process.env.ASDD_PROTECTED_BRANCHES || DEFAULT_PROTECTED)
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

function gitflowPrefixes() {
  return (process.env.ASDD_GITFLOW_PREFIXES || GITFLOW_PREFIXES_DEFAULT)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Detecta la rama base del MR leyendo --target-branch del comando,
 * o usa la rama de tracking del repositorio, o cae en "dev".
 */
function detectBaseBranch(command, cwd) {
  const m = command.match(/--target[-_]branch[=\s]+(\S+)/);
  if (m) {
    const candidate = m[1].replace(/^origin\//, "");
    return isValidBranchName(candidate) ? candidate : "dev";
  }
  try {
    const upstream = execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "@{u}"],
      { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    const candidate = upstream.replace(/^origin\//, "");
    return isValidBranchName(candidate) ? candidate : "dev";
  } catch {
    return "dev";
  }
}

function hasCommitsAheadOf(base, cwd) {
  try {
    const count = execFileSync(
      "git",
      ["rev-list", "--count", `origin/${base}..HEAD`],
      { cwd, encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return parseInt(count, 10) > 0;
  } catch {
    try {
      const count = execFileSync(
        "git",
        ["rev-list", "--count", `${base}..HEAD`],
        { cwd, encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      return parseInt(count, 10) > 0;
    } catch {
      return true; // conservador: si no podemos verificar, no bloqueamos por esto
    }
  }
}

export function getPrePrDecision(input, environment = process.env) {
  const effects = [];
  const toolName = input.tool_name || input.toolName || "";
  if (toolName !== "Bash") return null;

  const command = input?.tool_input?.command || input?.toolInput?.command || "";
  if (!MR_CREATE_RE.test(stripStringLiterals(command))) return null;

  // Escape hatch auditable: por env de sesión O por prefijo inline (B2/B3).
  if (environment[ENV_VAR_NAME] === "1" || parseInlineEnvVar(command, ENV_VAR_NAME)) {
    return { decision: "allow", effects: [{ type: "audit", message:
      `[pre-pr-gate] ADVERTENCIA: gate desactivado vía ${ENV_VAR_NAME}=1 — uso autorizado solo para emergencias.` }] };
  }

  const protected_ = protectedBranches();
  // FIX R3b: se pasa MR_CREATE_RE como targetRe para que el helper resuelva
  // el CWD de la invocación `glab mr create`/`gh pr create` real, no el de
  // un `-C`/`cd` de una invocación `git` no relacionada en el mismo comando
  // compuesto (bypass confirmado por auditoría adversarial — ver
  // git-command-cwd.mjs).
  const { resolved, ambiguous, candidates, unsafe, unsafeReason, forceBlock, base: repoBase } =
    resolveEffectiveCwd(command, input.cwd, MR_CREATE_RE);

  // FIX R3c: construcción de shell no parseable con certeza y sin ningún
  // cd/-C extraíble — no hay forma de confiar en que el MR/PR se cree desde
  // el repo base. Bloqueo incondicional (fail-closed duro).
  if (forceBlock) {
    return { decision: "deny", reason:
      `BLOQUEADO (pre-pr-gate): el comando contiene una construcción de shell no parseable con ` +
        `certeza ('${unsafeReason}') y no fue posible determinar desde qué repositorio se crea el ` +
        `MR/PR. Fail-closed obligatorio (R3c). Ejecutá el comando de forma simple y directa. ` +
        `Ver .claude/rules/asdd-git-safety.md (GS-001, GS-009).` };
  }

  if (unsafe) effects.push({ type: "audit", message:
    `[pre-pr-gate] construcción de shell no parseable ('${unsafeReason}') — evaluando TODOS los candidatos extraídos (fail-closed R3c).` });

  if (ambiguous) {
    // MITIGACIÓN FAIL-CLOSED (Bug B): parseo ambiguo → si CUALQUIER candidato
    // está en rama protegida, bloquear de inmediato. Nunca fail-open.
    for (const candidate of candidates) {
      const candidateBranch = currentBranch(candidate);
      if (candidateBranch && protected_.includes(candidateBranch)) {
        return { decision: "deny", effects, reason:
          `BLOQUEADO (pre-pr-gate): parseo ambiguo del comando (múltiples 'cd'/'-C' o variable de shell sin resolver) — ` +
            `el repo candidato '${candidate}' está en la rama protegida '${candidateBranch}'. ` +
            `Fail-closed obligatorio (Bug B — repos anidados). ` +
            `Ver .claude/rules/asdd-git-safety.md (GS-001, GS-009).` };
      }
    }
  }

  // Para el resto de las validaciones (naming, commits ahead) se usa el
  // mejor candidato resuelto — si es ambiguo, el último de la lista (el
  // best-effort del helper); si no, el resuelto de forma inequívoca.
  const effectiveCwd = ambiguous ? candidates[candidates.length - 1] : resolved;

  const branch = currentBranch(effectiveCwd);
  if (!branch) {
    // FIX R3d: fail-closed ante fallo de resolución de rama. Ver el mismo
    // razonamiento en asdd-guard-branch.mjs — solo se permite cuando
    // el cwd no fue relocalizado (mono-repo legítimo sin repo git real).
    if (effectiveCwd === repoBase) return effects.length ? { decision: "allow", effects } : null;
    return { decision: "deny", effects, reason:
      `BLOQUEADO (pre-pr-gate): no se pudo determinar la rama del repositorio origen ` +
        `('${effectiveCwd}'). El comando relocalizó el cwd (cd/-C/pushd) hacia un destino que ` +
        `no resuelve a ninguna rama git. Fail-closed obligatorio (R3d) — verificá que el path ` +
        `exista y ejecutá el comando de forma simple. ` +
        `Ver .claude/rules/asdd-git-safety.md (GS-001, GS-009).` };
  }

  const base = detectBaseBranch(command, effectiveCwd);

  // Fast-track: MR de promoción entre ramas protegidas (dev→qa, qa→main, etc.)
  // Ambas ramas son protegidas y distintas — las restricciones de feature branch no aplican.
  // Solo se verifica que haya commits nuevos que mergear.
  if (protected_.includes(branch) && protected_.includes(base) && branch !== base) {
    if (!hasCommitsAheadOf(base, effectiveCwd)) {
      return { decision: "deny", effects, reason:
        `BLOQUEADO (pre-pr-gate): MR de promoción '${branch}' → '${base}' sin commits nuevos. Nada que mergear.\n` +
          `Ver .claude/rules/asdd-git-safety.md (GS-009).` };
    }
    return effects.length ? { decision: "allow", effects } : null;
  }

  const errors = [];

  // Validación 1: no crear MR desde rama protegida (aplica a feature branches)
  if (protected_.includes(branch)) {
    errors.push(
      `La rama fuente '${branch}' es una rama protegida (${protected_.join(", ")}). ` +
        `Los MRs/PRs deben crearse desde feature branches.`
    );
  }

  // Validación 2: naming GitFlow
  const prefixes = gitflowPrefixes();
  const hasValidPrefix = prefixes.some((p) => branch.startsWith(p));
  if (!hasValidPrefix && !protected_.includes(branch)) {
    errors.push(
      `La rama '${branch}' no cumple el naming GitFlow. ` +
        `Prefijos válidos: ${prefixes.join(", ")} ` +
        `(configurables vía ASDD_GITFLOW_PREFIXES). ` +
        `Máximo 60 caracteres, kebab-case.`
    );
  }

  // Validación 3: al menos un commit adelante de la base
  if (!hasCommitsAheadOf(base, effectiveCwd)) {
    errors.push(
      `La rama '${branch}' no tiene commits nuevos respecto a '${base}'. ` +
        `Nada que mergear.`
    );
  }

  if (errors.length === 0) return effects.length ? { decision: "allow", effects } : null;

  return { decision: "deny", effects, reason:
    `BLOQUEADO (pre-pr-gate): ${errors.length} problema(s) antes de crear el MR/PR:\n` +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n") +
      `\n\nEscape hatch de emergencia (auditable): ASDD_GUARD_PR_DISABLE=1\n` +
      `Ver .claude/rules/asdd-git-safety.md (GS-009).` };
}

function main() {
  const result = getPrePrDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  for (const effect of result.effects ?? []) {
    if (effect.type === "audit") process.stdout.write(`${effect.message}\n`);
  }
  if (result.decision === "allow") process.exit(0);
  console.error(result.reason);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
