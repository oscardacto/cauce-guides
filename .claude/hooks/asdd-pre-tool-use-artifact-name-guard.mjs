#!/usr/bin/env node
/**
 * asdd-pre-tool-use-artifact-name-guard.mjs
 * PreToolUse hook — matcher: Write
 *
 * Enforza que TODO artefacto nuevo escrito bajo docs/** siga el patrón:
 *   {run_id}-{PHASE}-{SEQ}-{slug}.{ext}
 * donde run_id y PHASE se cruzan contra .asdd-run.json activo.
 * WI #3658 — parte de v2.23.2
 *
 * Desactivar: ASDD_ARTIFACT_NAME_GUARD_ENABLED=false
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveActivePhase } from "./_lib/run-phase-resolver.mjs";
import { isDataArtifact } from "./_lib/smart-data-naming.mjs";

// ---- Config -----------------------------------------------------------------

const ENABLED = process.env.ASDD_ARTIFACT_NAME_GUARD_ENABLED !== "false";

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
      "[artifact-name-guard] ERROR: stdin contiene JSON malformado — bloqueando por seguridad. WI #3658\n"
    );
    process.exit(2);
  }
}

/**
 * Determina si el archivo es exento de la validación de nombre.
 * @param {string} absPath  Ruta absoluta del archivo a escribir.
 * @param {string} cwd      Directorio de trabajo del proyecto.
 * @returns {boolean}
 */
function isExempt(absPath, cwd) {
  const relPath = path.relative(cwd, absPath).replace(/\\/g, "/");
  // Código, configuración y cualquier archivo fuera de docs/ quedan fuera.
  // Dentro de docs/ NO existen excepciones por carpeta, tipo o extensión:
  // briefs, specs, ADRs, diagramas, reportes, evidencia, ATF, Smart Data y
  // manifests usan el mismo contrato universal.
  return !relPath.startsWith("docs/");
}

// ---- Main -------------------------------------------------------------------

export function getArtifactNameDecision(input, environment = process.env) {
  if (environment.ASDD_ARTIFACT_NAME_GUARD_ENABLED === "false") return null;
  const toolName = input.tool_name || input.toolName || "";

  // Solo aplica a Write
  if (toolName !== "Write") return null;

  const toolInput = input.tool_input || input.toolInput || {};
  const filePath = toolInput.file_path || toolInput.path || toolInput.filePath || "";
  const cwd = input.cwd || process.cwd();

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);

  // Verificar exención
  if (isExempt(absPath, cwd)) return null;

  // ── Exención de dominio Data (ADR-003) ────────────────────────────────
  // Paridad con analyze-guard: el dominio Data valida contra su propio
  // contrato de nombres, no contra ART-001.
  //
  // Se exige además que el nombre EMPIECE por el prefijo canónico: en Smart
  // Data el único nombre aceptado es `smart-data-eng-*`. isDataArtifact() por
  // sí solo no alcanza — usa domainBasename(), que quita el prefijo de run
  // antes de comparar, y esa tolerancia es del analyze-guard, no de acá.
  const dataBasename = path.basename(absPath);
  if (dataBasename.startsWith("smart-data-eng-") && isDataArtifact(dataBasename)) {
    return null;
  }
  // ───────────────────────────────────────────────────────────────────────

  // Leer .asdd-run.json
  const runFilePath = path.join(cwd, ".asdd-run.json");
  let runJson;
  try {
    const rawRun = readFileSync(runFilePath, "utf8");
    runJson = JSON.parse(rawRun);
  } catch (_err) {
    return { decision: "deny", reason: "[artifact-name-guard] No hay run activo. Ejecutá /asdd:specify para iniciar un run. WI #3658" };
  }

  // Validar que run_id existe
  if (!runJson || !runJson.run_id) {
    return { decision: "deny", reason: "[artifact-name-guard] No hay run activo. Ejecutá /asdd:specify para iniciar un run. WI #3658" };
  }

  // Un artefacto nuevo nunca se agrega a un run cerrado.
  if (runJson.status === "complete") {
    return { decision: "deny", reason:
      `[artifact-name-guard] run ${runJson.run_id} cerrado. Iniciá un run nuevo antes de crear otro artefacto.` };
  }

  const activeRunId = runJson.run_id;
  const resolvedPhase = resolveActivePhase(runJson);
  const currentPhase = resolvedPhase ? resolvedPhase.toUpperCase() : null;

  // Validar patrón del basename
  const basename = path.basename(absPath);
  const PATTERN = /^(\d{4}-\d{2}-\d{2}-\d{3})-([A-Z]+)-(\d{3})-([a-z0-9]+(?:[.-][a-z0-9]+)*)\.([a-z0-9]{1,10})$/;
  const match = basename.match(PATTERN);

  if (!match) {
    const phaseHint = currentPhase ? currentPhase.toLowerCase() : "specify";
    return { decision: "deny", reason:
      `[artifact-name-guard] "${basename}" no sigue el patrón de artefacto de run.\n` +
      `Patrón: {run_id}-{PHASE}-{SEQ}-{slug}.{ext}\n` +
      `Usá: node .claude/scripts/asdd-artifact-name.mjs --phase ${phaseHint} --slug {descripcion}\n` +
      `WI #3658`
    };
  }

  // Validar que el run_id coincida
  if (match[1] !== activeRunId) {
    return { decision: "deny", reason: `[artifact-name-guard] run_id incorrecto: archivo declara "${match[1]}", run activo es "${activeRunId}". WI #3658` };
  }

  // Advertir si no hay current_phase pero no bloquear
  if (currentPhase === null) {
    return { decision: "allow", effects: [{ type: "stderr", message:
      "[artifact-name-guard] ADVERTENCIA: .asdd-run.json sin current_phase. No se puede validar PHASE. WI #3658" }] };
  }

  // Validar que el PHASE coincida
  if (match[2] !== currentPhase) {
    return { decision: "deny", reason:
      `[artifact-name-guard] PHASE incorrecto: archivo declara "${match[2]}", run "${activeRunId}" está en fase "${currentPhase}".\n` +
      `Usá --phase ${currentPhase.toLowerCase()} al invocar el helper, o avanzá la fase del run. WI #3658\n`
    };
  }

  // Todas las validaciones pasaron
  return null;
}

function main() {
  if (!ENABLED) process.exit(0);
  const result = getArtifactNameDecision(parseInput(readStdin()));
  if (!result) process.exit(0);
  for (const effect of result.effects ?? []) {
    if (effect.type === "stderr") process.stderr.write(`${effect.message}\n`);
  }
  if (result.decision === "allow") process.exit(0);
  process.stderr.write(`${result.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
