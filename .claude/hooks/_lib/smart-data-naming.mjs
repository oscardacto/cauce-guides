// -----------------------------------------------------------------------------
// .claude/hooks/_lib/smart-data-naming.mjs
//
// Single Source of Truth para el reconocimiento de artefactos del flujo
// Smart Data. Consumido por los hooks PreToolUse de la cadena:
//   - asdd-pre-tool-use-analyze-guard.mjs   (gate del dominio Data)
//   - asdd-pre-tool-use-artifact-name-guard.mjs (naming universal)
//
// Motivación (ADR-003 §Amendment 2 — 2026-07-02):
//   La regex del patrón Data estaba triplicada en los 3 hooks. Además, el
//   naming canónico de contratos Data (DC-004) es
//     smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md
//   cuyos puntos del semver NO pasan `[a-z0-9_-]` y cuyo sufijo NO termina
//   en `-{cliente}.md` sino en `-{cliente}-{X.Y.Z}.md`. Este módulo centraliza
//   ambos patrones y expone dos funciones puras (sin side-effects, sin IO):
//
//     isDataArtifact(basename)
//       → true si el basename es un artefacto Data reconocido:
//         - smart-data-eng-{tipo}-{cliente}.md (patrón general)
//         - smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md (contrato DC-004)
//
//     matchesClient(basename, clients)
//       → true si el basename termina en -{cliente}.md O
//         en -{cliente}-{X.Y.Z}.md para algún cliente del array.
//         Match por sufijo literal (case-insensitive) — soporta clientes
//         multi-palabra (ej. acme-retail) sin ambigüedad.
//
// Reglas estrictas — no aflojar más allá de estos dos patrones:
//   Debilitar la regex debilita el enforcement de specs software y puede
//   permitir que archivos no-Data eludan artifact-name-guard.
// -----------------------------------------------------------------------------

/**
 * Patrón general de artefactos Data.
 * smart-data-eng-{tipo}-{cliente}.md
 *   {tipo}    ≥ 1 char, cualquier secuencia (permite guiones internos, ej. governance-assessment)
 *   {cliente} slug canónico [a-z0-9][a-z0-9_-]* (mono o multi-palabra)
 */
const DATA_GENERAL_RE = /^smart-data-eng-.+-[a-z0-9][a-z0-9_-]*\.md$/i;

/**
 * Patrón de contrato Data versionado (DC-004).
 * smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md
 *   {capa}    landing | bronze | silver | gold | landing-* | otros slugs kebab
 *   {cliente} slug canónico
 *   {X.Y.Z}   semver básico N.N.N (permite números multidígito; sin pre-release)
 */
const DATA_CONTRACT_RE =
  /^smart-data-eng-contract-[a-z0-9][a-z0-9_-]*-[a-z0-9][a-z0-9_-]*-\d+\.\d+\.\d+\.md$/i;

const RUN_ARTIFACT_PREFIX_RE =
  /^\d{4}-\d{2}-\d{2}-\d{3}-[A-Z]+-\d{3}-/;

function domainBasename(value) {
  return String(value ?? "").replace(RUN_ARTIFACT_PREFIX_RE, "");
}

/**
 * ¿El basename representa un artefacto del flujo Smart Data?
 * Reconoce el patrón general (smart-data-eng-{tipo}-{cliente}.md) O el patrón
 * de contrato versionado (smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md).
 *
 * @param {string} basename Nombre del archivo (sin path).
 * @returns {boolean}
 */
export function isDataArtifact(basename) {
  if (!basename || typeof basename !== "string") return false;
  const name = domainBasename(basename);
  return DATA_CONTRACT_RE.test(name) || DATA_GENERAL_RE.test(name);
}

/**
 * ¿El basename matchea alguno de los clientes del registry, version-aware?
 * Match por sufijo literal case-insensitive:
 *   - `-{cliente}.md` (patrón general)
 *   - `-{cliente}-{X.Y.Z}.md` (contrato versionado)
 *
 * Soporta clientes multi-palabra (acme-retail) — el sufijo literal previene
 * matches parciales (RR-2 del ADR-003).
 *
 * @param {string} basename Nombre del archivo (sin path).
 * @param {string[]} clients Array de slugs de cliente detectados en filesystem.
 * @returns {boolean}
 */
export function matchesClient(basename, clients) {
  if (!basename || !Array.isArray(clients) || clients.length === 0) return false;
  const lower = domainBasename(basename).toLowerCase();
  for (const c of clients) {
    if (!c) continue;
    const client = c.toLowerCase();
    // Patrón general: -{cliente}.md
    if (lower.endsWith(`-${client}.md`)) return true;
    // Patrón contrato: -{cliente}-{X.Y.Z}.md (X.Y.Z = 3 números separados por punto)
    const contractSuffixRe = new RegExp(
      `-${escapeRegex(client)}-\\d+\\.\\d+\\.\\d+\\.md$`,
      "i"
    );
    if (contractSuffixRe.test(lower)) return true;
  }
  return false;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
