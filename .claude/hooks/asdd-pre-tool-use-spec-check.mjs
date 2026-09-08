#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/pre-tool-use-spec-check.mjs
//
// Hook PreToolUse que enforza el principio ASDD CORE-001 ("Spec First"):
// bloquea Write|Edit sobre src/** si no existe una spec aprobada en docs/specs/.
//
// Como este repositorio es un TEMPLATE, el hook está por defecto DESACTIVADO
// (ASDD_SPEC_GUARD_ENABLED=true para activarlo). En el template no existe
// docs/specs/ todavía, así que dejarlo activo rompería cualquier write
// legítimo. Cada proyecto que adopte el template activa el guard cuando
// termina de configurar su estructura de specs.
//
// Activación por proyecto:
//   - En .claude/settings.json, sección "env":
//       "env": { "ASDD_SPEC_GUARD_ENABLED": "true" }
//   - O exportando la variable en el shell antes de iniciar Claude Code:
//       export ASDD_SPEC_GUARD_ENABLED=true
//
// Política de aprobación:
//   Una spec se considera "aprobada" si cumple TODAS estas condiciones:
//     1. Existe al menos un archivo en docs/specs/ (no vacío).
//     2. Al menos uno contiene la marca "Status: approved" o "Estado: aprobado"
//        (case-insensitive) — configurable via ASDD_SPEC_APPROVAL_MARKER.
//   La detección es intencionalmente conservadora: si hay dudas, el hook
//   permite el paso y deja traza en el payload.
//
// Rutas protegidas por defecto: src/**
//   Configurable via ASDD_SPEC_GUARD_PATHS (CSV de prefijos, p.ej. "src,lib,app").
//
// Protocolo (Claude Code PreToolUse hooks):
//   - Entrada: JSON por stdin con { tool_name, tool_input, cwd, ... }.
//   - Bloquear: stdout con { "decision": "block", "reason": "..." }, exit 0.
//   - Permitir: exit 0 sin output.
//
// Referencia: https://code.claude.com/docs/en/hooks
// -----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// ---- Config -----------------------------------------------------------------

const ENABLED = process.env.ASDD_SPEC_GUARD_ENABLED === "true";
const SPECS_DIR = process.env.ASDD_SPECS_DIR || "docs/specs";
const APPROVAL_MARKER_REGEX =
  process.env.ASDD_SPEC_APPROVAL_MARKER
    ? new RegExp(process.env.ASDD_SPEC_APPROVAL_MARKER, "i")
    : /(Status:\s*approved|Estado:\s*aprobad[oa])/i;
const PROTECTED_PREFIXES = (process.env.ASDD_SPEC_GUARD_PATHS || "src")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const PROTECTED_TOOLS = new Set(["Write", "Edit"]);

// ---- Helpers ----------------------------------------------------------------

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch (_err) {
    return "";
  }
}

function parseInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // JSON malformado con contenido no-vacío: fallar CERRADO (#3639).
    // Nota: el short-circuit por ASDD_SPEC_GUARD_ENABLED ocurre en main(),
    // antes de llamar a parseInput, así que este bloque solo alcanza cuando el guard está activo.
    process.stderr.write(
      "[pre-tool-use-spec-check] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
    );
    process.exit(2);
  }
}

function toAbsolutePath(candidate, cwd) {
  if (!candidate) return null;
  if (isAbsolute(candidate)) return resolve(candidate);
  return resolve(cwd || process.cwd(), candidate);
}

// PROTECTED_PREFIXES viene de env/config siempre en POSIX (default ["src"]), así
// que la comparación se hace contra una `rel` normalizada a "/" — no con `sep`.
// Dos defectos corregidos:
//   1) Separador: en Windows `rel` traía "\" y nunca matcheaba `${prefix}/`, por
//      lo que el guard concluía "ruta no protegida" y NO disparaba (fail-open CORE-001).
//   2) Prefijo sin cierre: `absPath.startsWith(base)` aceptaba un directorio
//      hermano (…\project-structure-otro) y el slice(base.length + 1) producía
//      una relativa basura. Se resuelve con `relative()`, que detecta el escape.
function pathIsProtected(absPath, cwd) {
  if (!absPath || !cwd) return false;
  const base = resolve(cwd);
  const relRaw = relative(base, absPath);
  const outside =
    relRaw === ".." || relRaw.startsWith(`..${sep}`) || isAbsolute(relRaw);
  // Fuera del repo se conserva el fallback histórico (comparar el absoluto, que
  // nunca matchea un prefijo relativo) en vez de cambiar la semántica del guard.
  const rel = outside ? absPath : relRaw;
  const relPosix = rel.split(sep).join("/");
  return PROTECTED_PREFIXES.some(
    (prefix) => relPosix === prefix || relPosix.startsWith(`${prefix}/`)
  );
}

function walkSpecs(dir, depth = 0) {
  // Recorrido poco profundo (depth máx 3) para no degradar performance
  // en repos con muchas specs.
  if (depth > 3) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (_err) {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch (_err) {
      continue;
    }
    if (st.isDirectory()) {
      files.push(...walkSpecs(full, depth + 1));
    } else if (/\.(md|markdown)$/i.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function hasApprovedSpec(cwd) {
  const specsDir = resolve(cwd, SPECS_DIR);
  if (!existsSync(specsDir)) return { ok: false, reason: "no-dir" };
  const specs = walkSpecs(specsDir);
  if (specs.length === 0) return { ok: false, reason: "empty" };
  for (const spec of specs) {
    let content = "";
    try {
      content = readFileSync(spec, "utf8");
    } catch (_err) {
      continue;
    }
    if (APPROVAL_MARKER_REGEX.test(content)) {
      return { ok: true, approvedFile: spec };
    }
  }
  return { ok: false, reason: "none-approved" };
}

// ---- Main -------------------------------------------------------------------

export function getSpecGuardDecision(input, environment = process.env) {
  if (environment.ASDD_SPEC_GUARD_ENABLED !== "true") return null;
  const toolName = input.tool_name || input.toolName || "";
  if (!PROTECTED_TOOLS.has(toolName)) return null;

  const toolInput = input.tool_input || input.toolInput || {};
  const rawPath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
  const cwd = input.cwd || process.cwd();
  const absPath = toAbsolutePath(rawPath, cwd);

  if (!pathIsProtected(absPath, cwd)) return null;

  const check = hasApprovedSpec(cwd);
  if (check.ok) return null;

  const reasonMap = {
    "no-dir": `no existe el directorio ${SPECS_DIR}`,
    empty: `${SPECS_DIR} está vacío`,
    "none-approved": `ninguna spec en ${SPECS_DIR} tiene marca de aprobación`,
  };

  return {
    decision: "deny",
    reason:
      `[ASDD CORE-001] Intento de ${toolName} sobre ruta protegida (${rawPath}) ` +
      `sin spec aprobada: ${reasonMap[check.reason] || check.reason}. ` +
      `Ejecuta /project:specify y /project:analyze antes de implementar. ` +
      `Para desactivar este guard temporalmente: ASDD_SPEC_GUARD_ENABLED=false.`,
  };
}

function main() {
  if (!ENABLED) process.exit(0);
  const result = getSpecGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
