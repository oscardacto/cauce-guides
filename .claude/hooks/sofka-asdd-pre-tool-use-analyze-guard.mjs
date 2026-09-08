#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/hooks/sofka-asdd-pre-tool-use-analyze-guard.mjs
//
// Hook PreToolUse que enforza el prerrequisito de Analizar (ASDD WF-002):
// bloquea Write|Edit sobre docs/specs/**/*.md si no existe un brief aprobado
// en docs/specs/brief-*.md.
//
// Los briefs mismos (brief-*.md) nunca se bloquean — son el prerrequisito que
// este hook verifica, no el artefacto que protege.
//
// Habilitado por defecto. Para desactivar:
//   export ASDD_ANALYZE_GUARD_ENABLED=false
// O en .claude/settings.json, sección "env":
//   "env": { "ASDD_ANALYZE_GUARD_ENABLED": "false" }
//
// Política de aprobación:
//   Un brief se considera "aprobado" si contiene la marca
//   "Estado: aprobado" o "Status: approved" (case-insensitive).
//   Configurable via ASDD_SPEC_APPROVAL_MARKER (regex string).
//
// Directorio de specs configurable: ASDD_SPECS_DIR (default: docs/specs).
//
// Nota: el hook verifica EXISTENCIA del brief (brief-*.md en docs/specs/),
// no su estado de aprobación. La gestión de estados es futura (#3589).
//
// Rama Data (ADR-003 — domain-aware analyze guard):
//   Los artefactos de la ruta Data (smart-data-eng-*-{cliente}.md, ej.
//   smart-data-eng-discovery-{cliente}.md, smart-data-eng-governance-assessment-{cliente}.md,
//   smart-data-eng-dictionary-{cliente}.md) no dependen de un brief.md — su
//   equivalente-brief es el Excel de trabajo del cliente:
//     docs/smart-data/data/smart-data-eng-{cliente}.xlsx
//   (la plantilla docs/smart-data/data/smart-data-eng-cliente.xlsx se excluye de
//   la detección de clientes). Se bloquea con:
//     M1 — no existe el directorio de datos
//     M2 — existe el directorio pero no hay ningún Excel de cliente (solo la plantilla)
//     M3 — el sufijo de cliente del .md no coincide con ningún cliente detectado
//   Directorio configurable: ASDD_SMART_DATA_DIR (default: docs/smart-data/data).
//   La ruta software (brief-*.md) queda intacta — esta rama es aditiva.
//
// Protocolo (Claude Code PreToolUse hooks):
//   - Entrada: JSON por stdin con { tool_name, tool_input, cwd, ... }.
//   - Bloquear: stderr con mensaje descriptivo + exit 2 (protocolo confirmado CC PreToolUse).
//   - Permitir: exit 0 sin output.
// -----------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, isAbsolute, basename, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDataArtifact, matchesClient } from "./_lib/smart-data-naming.mjs";

// ---- Config -----------------------------------------------------------------

const ENABLED = process.env.ASDD_ANALYZE_GUARD_ENABLED !== "false";
const SPECS_DIR = process.env.ASDD_SPECS_DIR || "docs/specs";
const PROTECTED_TOOLS = new Set(["Write", "Edit"]);
const SMART_DATA_DIR = process.env.ASDD_SMART_DATA_DIR || "docs/smart-data/data";
const SMART_DATA_TEMPLATE_XLSX = "smart-data-eng-cliente.xlsx";

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
      "[pre-tool-use-analyze-guard] ERROR: stdin contiene JSON malformado — bloqueando por seguridad.\n"
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
function isInsideSpecsDir(absPath, cwd) {
  if (!absPath || !cwd) return false;
  const specsAbs = resolve(cwd, SPECS_DIR);
  const rel = relative(specsAbs, absPath);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false; // otro drive en Windows
  return rel !== ".." && !rel.startsWith(`..${sep}`);
}

function isBriefFile(absPath) {
  return /(?:^|[-_.])brief(?:[-_.]|\.md$)/i.test(basename(absPath));
}

// Bug A ítem A8: los bug reports del skill sofka-asdd-tech-lead-new-bug no
// requieren brief (WF-002 aplica solo a specs de feature). Se exceptúan dos
// patrones: el clásico documentado por el skill (bug-{NNN}-{slug}.md) y el
// canónico de artefacto de run cuando el slug incluye "bug-"
// ({run_id}-{PHASE}-{SEQ}-bug-{slug}.md).
const BUG_REPORT_CLASSIC = /^bug-.+\.md$/i;
const BUG_REPORT_RUN_NAMED = /^\d{4}-\d{2}-\d{2}-\d{3}-[A-Z]+-\d{3}-bug-.+\.md$/i;

function isBugReportFile(absPath) {
  const name = basename(absPath);
  return BUG_REPORT_CLASSIC.test(name) || BUG_REPORT_RUN_NAMED.test(name);
}

function findBriefFile(cwd) {
  const specsDir = resolve(cwd, SPECS_DIR);
  if (!existsSync(specsDir)) return { ok: false, reason: "no-dir" };
  let entries;
  try {
    entries = readdirSync(specsDir);
  } catch (_err) {
    return { ok: false, reason: "no-dir" };
  }
  const briefs = entries.filter((e) => /(?:^|[-_.])brief(?:[-_.]|\.md$)/i.test(e));
  if (briefs.length === 0) return { ok: false, reason: "no-brief" };
  return { ok: true, briefFile: briefs[0] };
}

// ---- Rama Data (ADR-003) ------------------------------------------------------

function detectSmartDataClients(cwd) {
  const dataDir = resolve(cwd, SMART_DATA_DIR);
  if (!existsSync(dataDir)) return { ok: false, reason: "no-dir" };
  let entries;
  try {
    entries = readdirSync(dataDir);
  } catch (_err) {
    return { ok: false, reason: "no-dir" };
  }
  const clients = entries
    .filter(
      (e) =>
        /^smart-data-eng-.+\.xlsx$/i.test(e) &&
        e.toLowerCase() !== SMART_DATA_TEMPLATE_XLSX
    )
    .map((e) => e.replace(/^smart-data-eng-/i, "").replace(/\.xlsx$/i, ""))
    .filter(Boolean);
  if (clients.length === 0) return { ok: false, reason: "no-client-xlsx" };
  return { ok: true, clients };
}

// ---- Main -------------------------------------------------------------------

export function getAnalyzeGuardDecision(input, environment = process.env) {
  if (environment.ASDD_ANALYZE_GUARD_ENABLED === "false") return null;
  const toolName = input.tool_name || input.toolName || "";
  if (!PROTECTED_TOOLS.has(toolName)) return null;

  const toolInput = input.tool_input || input.toolInput || {};
  const rawPath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
  const cwd = input.cwd || process.cwd();
  const absPath = toAbsolutePath(rawPath, cwd);

  if (!isInsideSpecsDir(absPath, cwd)) return null;

  // Briefs se escriben sin restricción — son el prerrequisito, no el artefacto protegido
  if (isBriefFile(absPath)) return null;

  // Bug A ítem A8: bug reports (sofka-asdd-tech-lead-new-bug) no requieren brief.
  if (isBugReportFile(absPath)) return null;

  // Rama Data (ADR-003): equivalente-brief es el Excel de trabajo del cliente,
  // no un brief-*.md. Se evalúa antes de la rama software.
  if (isDataArtifact(basename(absPath))) {
    const detection = detectSmartDataClients(cwd);

    if (!detection.ok) {
      const code = detection.reason === "no-dir" ? "M1" : "M2";
      const reasonText =
        detection.reason === "no-dir"
          ? `no existe el directorio ${SMART_DATA_DIR}`
          : `no existe ningún Excel de cliente en ${SMART_DATA_DIR} (solo se encontró, si acaso, la plantilla ${SMART_DATA_TEMPLATE_XLSX})`;
      const howToFix =
        detection.reason === "no-dir"
          ? `Crear el directorio ${SMART_DATA_DIR} y copiar la plantilla como ${SMART_DATA_DIR}/smart-data-eng-{cliente}.xlsx antes de ejecutar /sofka-asdd:data-eng-discover.`
          : `Copiar ${SMART_DATA_DIR}/${SMART_DATA_TEMPLATE_XLSX} como ${SMART_DATA_DIR}/smart-data-eng-{cliente}.xlsx, completarlo con el diccionario/fuentes del cliente, y ejecutar /sofka-asdd:data-eng-discover.`;
      const blockReason =
        `[ASDD Smart Data — equivalente-brief (${code})] Intento de ${toolName} sobre ${rawPath} ` +
        `sin Excel de cliente: ${reasonText}. ${howToFix}`;
      return { decision: "deny", reason: blockReason };
    }

    // ADR-003 §"Cliente con nombre multi-palabra" + RR-2 + Amendment 2:
    // match por sufijo literal delegado al módulo SSOT hooks/_lib/smart-data-naming.mjs.
    // Version-aware: reconoce `-{cliente}.md` y `-{cliente}-{X.Y.Z}.md` (contratos DC-004).
    const clientMatches = matchesClient(basename(absPath), detection.clients);

    if (!clientMatches) {
      const blockReason =
        `[ASDD Smart Data — equivalente-brief (M3)] Intento de ${toolName} sobre ${rawPath}: ` +
        `el archivo ${basename(absPath)} no matchea el sufijo -{cliente}.md de ningún cliente ` +
        `detectado en ${SMART_DATA_DIR} (clientes detectados: ${detection.clients.join(", ")}). ` +
        `Verificá el nombre del archivo o creá ${SMART_DATA_DIR}/smart-data-eng-{tu-cliente}.xlsx con el slug adecuado.`;
      return { decision: "deny", reason: blockReason };
    }

    return null;
  }

  const check = findBriefFile(cwd);
  if (check.ok) return null;

  const reasonMap = {
    "no-dir": `no existe el directorio ${SPECS_DIR}`,
    "no-brief": `no existe ningún brief en ${SPECS_DIR} (patrón: brief-{feature}.md o {run_id}-SPECIFY-NNN-brief-{feature}.md)`,
  };

  const howToFix =
    check.reason === "no-dir"
      ? `Crear el directorio y ejecutar /sofka-asdd:specify para generar el brief.`
      : `Ejecutar /sofka-asdd:specify para generar el brief en ${SPECS_DIR}.`;

  const blockReason =
    `[ASDD WF-002 Prerrequisito] Intento de ${toolName} sobre ${rawPath} ` +
    `sin brief: ${reasonMap[check.reason] || check.reason}. ` +
    howToFix;
  // exit 2 bloquea en PreToolUse (protocolo confirmado Claude Code — {decision:"block"} con exit 0 NO bloquea).
  return { decision: "deny", reason: blockReason };
}

function main() {
  if (!ENABLED) process.exit(0);
  const result = getAnalyzeGuardDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
