#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/asdd-pre-push-gate.mjs
//
// Hook PreToolUse (matcher: Bash) que bloquea `git push` si no existe un
// marcador de validación pre-push válido. Refuerza la regla GS-008 de
// asdd-git-safety.md.
//
// Flujo normal:
//   1. El agente ejecuta el skill pre-push (o el usuario valida manualmente).
//   2. El skill crea .claude/.prepush-validated con un timestamp.
//   3. Este hook verifica el marcador antes de permitir el push.
//   4. Si el marcador es válido → permite y lo CONSUME (borra).
//   5. Si no hay marcador o está vencido → bloquea con exit 2.
//
// Fast-track: si TODOS los archivos del diff son config/docs (sin código fuente
// según SOURCE_EXTS), el push se permite sin marcador.
//
// Configuración (vía bloque `env` de .claude/settings.json):
//   ASDD_GUARD_PUSH_DISABLE=1   escape hatch auditable — desactiva el
//                                     bloqueo para la sesión.
//   ASDD_PUSH_GATE_TTL          TTL en segundos. Default: 600 (10 min).
//   ASDD_SOURCE_EXTS            extensiones de código fuente separadas
//                                     por coma. Default: ver SOURCE_EXTS_DEFAULT.
// -----------------------------------------------------------------------------

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveEffectiveCwd, parseInlineEnvVar } from "./_lib/git-command-cwd.mjs";

const MARKER_FILENAME = ".prepush-validated";
const ENV_VAR_NAME = "ASDD_GUARD_PUSH_DISABLE";
const TTL_DEFAULT = 600; // 10 minutos
// Fallback embebido: solo se usa si `.asdd/source-exts.json` no está
// (repo consumidor viejo). La fuente de verdad es ese archivo — ver F6.
const SOURCE_EXTS_FALLBACK =
  "ts,tsx,js,jsx,mjs,cjs,py,go,java,kt,rb,rs,c,cc,cpp,h,hpp,cs,php,swift,scala,sql,sh,ps1,vue,svelte";
const SOURCE_EXTS_MANIFEST = new URL("../../.asdd/source-exts.json", import.meta.url);

// Detecta `git push` real eliminando primero el contenido de strings literales
// para evitar falsos positivos cuando `git push` aparece dentro del texto de
// un argumento (ej: glab mr create --description "...git push...").
const GIT_PUSH_RE =
  /\bgit(\s+(-C\s+\S+|--git-dir=\S+|--work-tree=\S+|-c\s+\S+))*\s+push\b/;
const FORCE_RE = /--force(?:-with-lease)?|\s-f\b/;

/**
 * Elimina el contenido dentro de strings literales ("..." y '...') del comando,
 * luego evalúa si contiene un `git push` real y no es un force push.
 */
function hasGitPushCommand(cmd) {
  const stripped = cmd
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^']*)'/, "''");
  return GIT_PUSH_RE.test(stripped) && !FORCE_RE.test(stripped);
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
    return {};
  }
}

// DECISIÓN B3 (Bug B — repos anidados): el marcador GS-008 vive SIEMPRE en
// una ubicación estable — CLAUDE_PROJECT_DIR/.claude/ — nunca en el repo
// efectivo resuelto del comando. Razón: un sub-repo anidado puede no tener
// su propio directorio .claude/, mientras que CLAUDE_PROJECT_DIR (el repo de
// configuración) siempre existe. El skill asdd-tech-lead-pre-push (B5)
// escribe el marcador en esta misma ubicación para mantener la coherencia.
function stableConfigRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function markerPath() {
  return join(stableConfigRoot(), ".claude", MARKER_FILENAME);
}

/**
 * Lee el marcador GS-008. Formato vigente: JSON `{ ts, head }` — el que escribe
 * el skill `asdd-tech-lead-pre-push` y el que ya leía el githook nativo
 * `.asdd/githooks/impl/pre-push.mjs`. Formato legado: timestamp Unix suelto.
 *
 * Antes acá había solo `parseInt(raw, 10)`: sobre el JSON vigente devolvía NaN y
 * el gate concluía "no existe .claude/.prepush-validated". Correr el gate pre-push
 * completo —build y tests, minutos— NO habilitaba el push, y la única salida
 * mecánica era el escape hatch. Las dos capas tienen que leer el mismo formato o
 * el marcador no significa nada.
 */
function readMarker(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
  // Ojo: un timestamp suelto TAMBIÉN es JSON válido (un número), así que no
  // alcanza con envolver JSON.parse en try/catch — hay que exigir un objeto.
  let doc = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) doc = parsed;
  } catch {
    // No es JSON: se intenta el formato legado abajo.
  }
  if (doc) {
    const ts = parseInt(doc.ts, 10);
    if (isNaN(ts)) return null;
    return { ts, head: typeof doc.head === "string" && doc.head ? doc.head : null };
  }
  const ts = parseInt(raw, 10);
  return isNaN(ts) ? null : { ts, head: null };
}

/** HEAD del repo EFECTIVO, para atar el marcador al commit que se está pusheando. */
function headCommit(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Compara HEAD con el commit del marcador tolerando hashes abreviados. */
function sameCommit(a, b) {
  if (!a || !b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

function ttl() {
  const v = parseInt(process.env.ASDD_PUSH_GATE_TTL || "", 10);
  return isNaN(v) || v <= 0 ? TTL_DEFAULT : v;
}

/**
 * Extensiones que cuentan como código fuente para GS-008, normalizadas con punto
 * inicial. Orden de precedencia: `ASDD_SOURCE_EXTS` (override por proyecto)
 * → `.asdd/source-exts.json` (fuente de verdad compartida con el githook
 * nativo) → fallback embebido.
 *
 * Antes esta capa y el githook nativo tenían listas hardcodeadas distintas: al
 * PreToolUse le faltaban sql, sh, ps1, php, rs, swift, scala y svelte, así que
 * las dos capas discrepaban sobre si un mismo push necesitaba marcador.
 */
function sourceExts() {
  let raw = process.env.ASDD_SOURCE_EXTS;
  if (!raw) {
    try {
      const manifest = JSON.parse(readFileSync(SOURCE_EXTS_MANIFEST, "utf8"));
      if (Array.isArray(manifest?.source_extensions) && manifest.source_extensions.length > 0) {
        raw = manifest.source_extensions.join(",");
      }
    } catch {
      // Manifiesto ausente o ilegible → fallback embebido, nunca lista vacía.
    }
  }
  return (raw || SOURCE_EXTS_FALLBACK)
    .split(",")
    .map((e) => e.trim().toLowerCase().replace(/^[.]+/, ""))
    .filter(Boolean)
    .map((e) => `.${e}`);
}

/**
 * Devuelve true si TODOS los archivos del diff upstream..HEAD son config/docs
 * (ninguno tiene extensión de código fuente). Si no se puede determinar,
 * devuelve false (conservador → requiere marcador).
 *
 * `cwd` es el repo EFECTIVO resuelto del comando bajo prueba (B3 — Bug B):
 * el diff se calcula sobre el repo donde el usuario realmente está
 * trabajando, no sobre CLAUDE_PROJECT_DIR.
 */
function diffNameOnly(cwd, args) {
  return execFileSync("git", ["diff", "--name-only", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 8000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Rama de integración del repo efectivo. Mismo criterio que el skill
 * `asdd-tech-lead-pre-push` y el githook nativo: lo que declare el equipo
 * en `ASDD_BASE_BRANCH`, si no dev → develop → main → master. NUNCA asumir
 * main.
 */
function resolveBaseRef(cwd) {
  const declared = String(process.env.ASDD_BASE_BRANCH || "").trim();
  for (const branch of declared ? [declared] : ["dev", "develop", "main", "master"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", `origin/${branch}`], {
        cwd,
        timeout: 8000,
        stdio: ["ignore", "ignore", "ignore"],
      });
      return `origin/${branch}`;
    } catch {
      // Esa base no existe en el remoto: probar la siguiente.
    }
  }
  return null;
}

function isConfigOnly(cwd) {
  try {
    // El diff se toma contra el upstream si existe y, si no —rama nueva, que es
    // el caso normal antes del primer push— contra la rama de integración.
    // Antes acá había un fallback a `HEAD~1`: decidía el fast-track mirando
    // SOLO el último commit, así que una rama con código fuente en commits
    // previos podía pushearse sin marcador.
    let raw = null;
    try {
      raw = diffNameOnly(cwd, ["@{u}"]);
    } catch {
      const base = resolveBaseRef(cwd);
      if (base) {
        try {
          raw = diffNameOnly(cwd, [`${base}...HEAD`]);
        } catch {
          raw = null;
        }
      }
    }
    // No se pudo determinar el diff → fail-closed: exigir marcador.
    if (raw === null) return false;
    if (!raw) return false; // sin cambios detectados → no fast-track
    const files = raw.split("\n").filter(Boolean);
    if (files.length === 0) return false;
    const exts = sourceExts();
    return files.every((f) => {
      const lower = f.toLowerCase();
      return !exts.some((ext) => lower.endsWith(ext));
    });
  } catch {
    return false;
  }
}

export function getPrePushDecision(input, environment = process.env) {
  const effects = [];
  const toolName = input.tool_name || input.toolName || "";
  if (toolName !== "Bash") return null;

  const command = input?.tool_input?.command || input?.toolInput?.command || "";
  if (!hasGitPushCommand(command)) return null;

  // Escape hatch auditable: por env de sesión O por prefijo inline (B2/B3).
  if (environment[ENV_VAR_NAME] === "1" || parseInlineEnvVar(command, ENV_VAR_NAME)) {
    return { decision: "allow", effects: [{ type: "audit", message:
      `[pre-push-gate] ADVERTENCIA: gate desactivado vía ${ENV_VAR_NAME}=1 — uso autorizado solo para emergencias.` }] };
  }

  // FIX R3b: se pasa GIT_PUSH_RE como targetRe para que el helper resuelva
  // el CWD de la invocación `git push` real, no el de un `-C` de otra
  // invocación `git` no relacionada en el mismo comando compuesto (bypass
  // confirmado por auditoría adversarial — ver git-command-cwd.mjs).
  const { resolved, ambiguous, candidates, unsafe, unsafeReason, forceBlock } =
    resolveEffectiveCwd(command, input.cwd, GIT_PUSH_RE);

  // FIX R3c: construcción de shell no parseable con certeza y sin ningún
  // cd/-C extraíble — no hay forma de confiar en que el push corre en el
  // repo base. Bloqueo incondicional (fail-closed duro), sin importar si
  // existe marcador válido.
  if (forceBlock) {
    return { decision: "deny", reason:
      `BLOQUEADO (pre-push-gate): el comando contiene una construcción de shell no parseable con ` +
        `certeza ('${unsafeReason}') y no fue posible determinar en qué repositorio corre 'git push'. ` +
        `Fail-closed obligatorio (R3c). Ejecutá el push de forma simple y directa. ` +
        `Ver .claude/rules/asdd-git-safety.md (GS-008).` };
  }

  if (unsafe) effects.push({ type: "audit", message:
    `[pre-push-gate] construcción de shell no parseable ('${unsafeReason}') — evaluando TODOS los candidatos extraídos (fail-closed R3c).` });

  // Fast-track: solo cambios de configuración/docs, evaluado en el repo
  // EFECTIVO (B3). Ante ambigüedad, fail-closed: fast-track solo si TODOS
  // los candidatos son config-only — cualquier duda exige el marcador.
  const fastTrack = ambiguous
    ? candidates.every((c) => isConfigOnly(c))
    : isConfigOnly(resolved);

  if (fastTrack) {
    return { decision: "allow", effects: [...effects, { type: "audit", message:
      "[pre-push-gate] fast-track: solo cambios config/docs — OK sin marcador." }] };
  }

  const mp = markerPath();
  const marker = readMarker(mp);
  const now = nowSecs();
  const limit = ttl();

  // Sin marcador válido → bloquear. Tres causas distintas, con mensajes
  // distintos: "no existe" mandaba a re-correr el gate incluso cuando el
  // problema real era el TTL o un commit posterior al validado.
  let reason = null;
  if (marker === null) {
    reason = "no existe .claude/.prepush-validated";
  } else if (now - marker.ts > limit) {
    reason = `marcador vencido (${now - marker.ts}s > TTL ${limit}s)`;
  } else if (marker.head) {
    // El marcador vale para el commit que se validó; uno posterior no heredó
    // esa validación. Mismo criterio que el githook nativo `pre-push`.
    const head = headCommit(ambiguous ? candidates[candidates.length - 1] : resolved);
    if (!sameCommit(head, marker.head)) {
      reason =
        `el marcador validó el commit ${marker.head.slice(0, 8)} y estás pusheando ${head.slice(0, 8)}`;
    }
  }

  if (reason === null) {
    return { decision: "allow", effects: [...effects, { type: "unlink", path: mp, optional: true }] };
  }

  return { decision: "deny", effects, reason:
    `BLOQUEADO (pre-push-gate): ${reason}.\n` +
      `Para pushear código fuente debés validar primero:\n` +
      `  1. Ejecutá el skill de validación pre-push (crea .claude/.prepush-validated).\n` +
      `  2. Alternativamente creá el marcador manualmente:\n` +
      `       node -e "require('fs').writeFileSync('.claude/.prepush-validated', String(Math.floor(Date.now()/1000)))"\n` +
      `  3. Escape hatch de emergencia (auditable): ASDD_GUARD_PUSH_DISABLE=1\n` +
      `Ver .claude/rules/asdd-git-safety.md (GS-008).` };
}

function main() {
  const result = getPrePushDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  for (const effect of result.effects ?? []) {
    if (effect.type === "audit") { process.stdout.write(`${effect.message}\n`); continue; }
    if (effect.type === "unlink") {
      try { unlinkSync(effect.path); } catch { if (!effect.optional) process.exit(2); }
    }
  }
  if (result.decision === "deny") {
    console.error(result.reason);
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
