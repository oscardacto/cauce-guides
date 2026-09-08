#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-pre-tool-use-design-guard.mjs
//
// Hook PreToolUse que enforza el prerrequisito de Diseñar (ASDD WF-003):
// bloquea Write|Edit sobre docs/architecture/** si no existe al menos una
// spec funcional aprobada en docs/specs/ (cualquier *.md que NO empiece
// con "brief-").
//
// Espejo simétrico de sofka-asdd-pre-tool-use-analyze-guard.mjs (WF-002).
//
// Habilitado por defecto. Para desactivar:
//   export ASDD_DESIGN_GUARD_ENABLED=false
// O en .claude/settings.json, sección "env":
//   "env": { "ASDD_DESIGN_GUARD_ENABLED": "false" }
//
// Directorios protegidos configurables: ASDD_DESIGN_GUARD_PATHS
//   CSV de paths relativos al cwd. Default: "docs/architecture"
//   Ejemplo: ASDD_DESIGN_GUARD_PATHS="docs/architecture,docs/diseno"
//
// Directorio de specs configurable: ASDD_SPECS_DIR (default: docs/specs)
//
// Qué se considera "spec válida":
//   Cualquier archivo *.md dentro de ASDD_SPECS_DIR que NO empiece con
//   "brief-" (los briefs son el prerrequisito de WF-002, no de WF-003).
//
// Protocolo (Claude Code PreToolUse hooks):
//   - Entrada: JSON por stdin con { tool_name, tool_input, cwd, ... }.
//   - Bloquear: stderr con mensaje descriptivo + exit 2.
//   - Permitir: exit 0 sin output.
//
// Registro requerido en settings.json (manual — settings.json es deny-protegido):
//   En la entrada matcher "Write|Edit" de PreToolUse, agregar al final del array:
//   { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/sofka-asdd-pre-tool-use-design-guard.mjs" }
// -----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// ---- Config -----------------------------------------------------------------

const ENABLED = process.env.ASDD_DESIGN_GUARD_ENABLED !== "false";
const SPECS_DIR = process.env.ASDD_SPECS_DIR || "docs/specs";
const PROTECTED_PATHS_RAW = process.env.ASDD_DESIGN_GUARD_PATHS || "docs/architecture";
const PROTECTED_PATHS = PROTECTED_PATHS_RAW.split(",").map((p) => p.trim()).filter(Boolean);
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
    process.stderr.write(
      "[pre-tool-use-design-guard] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
    );
    process.exit(2);
  }
}

function toAbsolutePath(candidate, cwd) {
  if (!candidate) return null;
  if (isAbsolute(candidate)) return resolve(candidate);
  return resolve(cwd || process.cwd(), candidate);
}

// Containment cross-OS: `relative()` + `sep` en vez de `startsWith(dir + "/")`.
// El literal "/" nunca matchea en Windows (separador nativo "\"), lo que hacía
// que el guard concluyera "esta ruta no me concierne" y NO disparara (fail-open).
// `relative()` además es inmune al bug de directorio hermano con prefijo común.
// Caso rel === "": absPath ES el directorio protegido → cuenta como dentro.
function isInsideProtectedPath(absPath, cwd) {
  if (!absPath || !cwd) return false;
  for (const protectedPath of PROTECTED_PATHS) {
    const protAbs = resolve(cwd, protectedPath);
    const rel = relative(protAbs, absPath);
    if (rel === "") return true;
    if (isAbsolute(rel)) continue; // otro drive en Windows
    if (rel !== ".." && !rel.startsWith(`..${sep}`)) return true;
  }
  return false;
}

function findValidSpec(cwd) {
  const specsDir = resolve(cwd, SPECS_DIR);
  if (!existsSync(specsDir)) return { ok: false, reason: "no-specs-dir" };
  let entries;
  try {
    entries = readdirSync(specsDir);
  } catch (_err) {
    return { ok: false, reason: "no-specs-dir" };
  }
  // Spec válida = *.md que NO empiece con "brief-"
  const validSpecs = entries.filter(
    (e) => /\.md$/i.test(e) && !/^brief-/i.test(e)
  );
  if (validSpecs.length === 0) return { ok: false, reason: "no-spec" };
  return { ok: true, specFile: validSpecs[0] };
}

// ---- UX Required Check -------------------------------------------------------

function checkUiRequired(cwd) {
  const specsDir = resolve(cwd, SPECS_DIR);
  if (!existsSync(specsDir)) return { blocked: false };
  let entries;
  try {
    entries = readdirSync(specsDir);
  } catch (_err) {
    return { blocked: false };
  }
  const specFiles = entries.filter(
    (e) => /\.md$/i.test(e) && !/^brief-/i.test(e)
  );
  let triggeredBySpec = null;
  for (const f of specFiles) {
    try {
      const content = readFileSync(resolve(specsDir, f), "utf8");
      // Acepta formato bold (**ui_required:** true) o plain (ui_required: true)
      if (
        /\*\*ui_required:\*\*\s*true/im.test(content) ||
        /^ui_required:\s*true/im.test(content)
      ) {
        triggeredBySpec = f;
        break;
      }
    } catch (_err) {
      // skip archivos no legibles
    }
  }
  if (!triggeredBySpec) return { blocked: false };

  const uiDir = resolve(cwd, "docs/ui");
  let hasUiArtifacts = false;
  if (existsSync(uiDir)) {
    try {
      hasUiArtifacts = readdirSync(uiDir).filter((e) => !e.startsWith(".")).length > 0;
    } catch (_err) {
      hasUiArtifacts = false;
    }
  }
  if (hasUiArtifacts) return { blocked: false };

  return {
    blocked: true,
    message:
      `[ASDD WF-003 UX-Guard] Spec ${triggeredBySpec} declara ui_required: true pero ` +
      `${existsSync(uiDir) ? "docs/ui/ está vacío" : "no existe docs/ui/"}. ` +
      `Ejecutar @sofka-asdd-ux (skill: flows-builder) antes de diseñar.`,
  };
}

// ---- Main -------------------------------------------------------------------

export function getDesignGuardDecision(input, environment = process.env) {
  if (environment.ASDD_DESIGN_GUARD_ENABLED === "false") return null;
  const toolName = input.tool_name || input.toolName || "";
  if (!PROTECTED_TOOLS.has(toolName)) return null;

  const toolInput = input.tool_input || input.toolInput || {};
  const rawPath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
  const cwd = input.cwd || process.cwd();
  const absPath = toAbsolutePath(rawPath, cwd);

  if (!isInsideProtectedPath(absPath, cwd)) return null;

  const check = findValidSpec(cwd);
  if (check.ok) {
    const uiCheck = checkUiRequired(cwd);
    if (uiCheck.blocked) {
      return { decision: "deny", reason: uiCheck.message };
    }
    return null;
  }

  const reasonMap = {
    "no-specs-dir": `no existe el directorio ${SPECS_DIR}`,
    "no-spec": `no existe ninguna spec funcional (*.md que no sea brief-*.md) en ${SPECS_DIR}`,
  };

  const blockReason =
    `[ASDD WF-003 Prerrequisito] Intento de ${toolName} sobre artefacto de diseño (${rawPath}) ` +
    `sin spec funcional de WF-002: ${reasonMap[check.reason] || check.reason}. ` +
    `Ejecutar /sofka-asdd:analyze con sofka-asdd-producto (WF-002) para generar ` +
    `{feature}-NNN.md en ${SPECS_DIR} antes de diseñar.`;

  // exit 2 bloquea en PreToolUse (protocolo confirmado Claude Code).
  return { decision: "deny", reason: blockReason };
}

function main() {
  if (!ENABLED) process.exit(0);
  const result = getDesignGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
