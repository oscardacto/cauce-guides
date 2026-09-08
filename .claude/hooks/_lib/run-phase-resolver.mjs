// .claude/hooks/_lib/run-phase-resolver.mjs
//
// Single Source of Truth para resolver la fase activa de un run ASDD a
// partir de .asdd-run.json. Consumido por:
//   - .claude/scripts/sofka-asdd-artifact-name.mjs (helper de naming)
//   - .claude/hooks/sofka-asdd-pre-tool-use-artifact-name-guard.mjs (guard)
//
// Bug A (2026-07-07-001-BUILD-005), ítem A2: antes de este módulo, el
// helper y el guard tenían estrategias de resolución divergentes — el
// helper hacía fallback a phases.*.status === "in_progress" cuando
// current_phase faltaba, pero el guard no. Este módulo centraliza esa
// lógica para que ambos se mantengan sincronizados.

/** Fases válidas — alineadas con .sofka-asdd/asdd-run.schema.json → current_phase / phases. */
export const VALID_PHASES = Object.freeze([
  "specify",
  "analyze",
  "design",
  "build",
  "verify",
  "document",
]);

const VALID_PHASES_SET = new Set(VALID_PHASES);

/**
 * Resuelve la fase activa de un run.
 *
 * Orden de precedencia:
 *   1. runJson.current_phase, si está presente Y es un valor válido del enum
 *      (case-insensitive — se normaliza a minúscula antes de comparar).
 *   2. Fallback: primera fase en runJson.phases cuyo status === "in_progress".
 *   3. null si ninguna de las dos resuelve una fase válida.
 *
 * @param {object} runJson  Contenido parseado de .asdd-run.json.
 * @returns {string|null}   Fase en minúscula (ej. "design") o null.
 */
export function resolveActivePhase(runJson) {
  if (!runJson || typeof runJson !== "object") return null;

  // 1. current_phase explícito (normalizado a minúscula).
  if (typeof runJson.current_phase === "string" && runJson.current_phase.trim() !== "") {
    const normalized = runJson.current_phase.trim().toLowerCase();
    if (VALID_PHASES_SET.has(normalized)) {
      return normalized;
    }
  }

  // 2. Fallback: escanear phases.*.status === "in_progress".
  if (runJson.phases && typeof runJson.phases === "object") {
    for (const [name, state] of Object.entries(runJson.phases)) {
      if (state && state.status === "in_progress" && VALID_PHASES_SET.has(name)) {
        return name;
      }
    }
  }

  return null;
}
