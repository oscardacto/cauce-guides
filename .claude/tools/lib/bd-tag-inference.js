'use strict';
/**
 * ATF — Inferencia determinística del tag `@bd` para CPs.
 *
 * Devuelve `true` si el CP asserta persistencia en BD. Usado por:
 *   - `convert-xlsx-fogafin.js` y `convert-xlsx.js` (modo Fábrica).
 *   - `agent_design-team` en PASO 3.8 (referencia las reglas abajo).
 *
 * El objetivo es un heurístico **conservador**: preferir falsos negativos
 * (CP sin @bd que "podría" tener uno) a falsos positivos (CP con @bd que
 * contamina `db_validations[]` con SKIPPED). El QA puede agregar el tag
 * manualmente cuando el heurístico no dispara.
 *
 * Señales que activan @bd:
 *   1) "Quedar registrado" / "queda registrado" / "debe quedar registrado"
 *   2) "se almacena" / "almacenado" / "quedar almacenado"
 *   3) "persiste" / "persistir" / "persistido" / "persistencia"
 *   4) "en la base de datos" / "en BD" / "en base de datos"
 *   5) "se registra" / "registrarse" (con contexto de CRUD)
 *   6) "se inserta" / "se actualiza" / "se elimina" / "se modifica" (explícito DB)
 *   7) "tabla {nombre}" / "tabla de {X}" (mención explícita de tabla)
 *   8) "db_table:" o "en la tabla"
 *   9) "registro [se] refleja[n]" (mirroring en BD)
 *  10) CP ya trae `@bd` (idempotente — no lo duplica)
 *
 * NO activan @bd por sí solos (evitar ruido):
 *   - "guardar" a solas (muy común en UI de formularios)
 *   - "se crea" a solas (puede ser UI)
 *   - "registrado" a solas (contexto ambiguo)
 *   - "verificar" / "listar" / "mostrar" (son read de UI por default)
 *
 * Tampoco activan:
 *   - `@responsive`, `@ai_edge` puros (layout/edge UI — si el edge involucra DB,
 *      el diseñador añade @bd manualmente).
 *
 * Uso:
 *   const { shouldTagBd, addBdTagIfNeeded } = require('./lib/bd-tag-inference');
 *   if (shouldTagBd({ steps_raw, expected_result, gherkin, preconditions, tags })) { ... }
 */

const STRONG_PATTERNS = [
  // Persistencia explícita (verbos de almacenamiento)
  /\bquedar?\s+registrad[oa]s?\b/i,
  /\bdebe\s+quedar\s+registrad[oa]s?\b/i,
  /\bse\s+almacen[ae]\b/i,
  /\bqueda(?:r)?\s+almacenad[oa]s?\b/i,
  /\bqueda(?:r)?\s+guardad[oa]s?\s+en\b/i,            // "queda guardado en BD/base/tabla"
  /\balmacenad[oa]s?\b/i,
  /\bpersist(?:e|ir|ido|encia)\b/i,

  // Referencia explícita a BD (nunca ambigua)
  /\ben\s+(la\s+)?base\s+de\s+datos\b/i,
  /\ben\s+(la\s+)?BD\b/,                              // case-sensitive "BD"
  /\ben\s+(la\s+)?DB\b/,
  /\bdb_table:/i,

  // Mención EXPLÍCITA de tabla de BD — requiere nombre estilo SQL
  // (UPPER_SNAKE, PascalCase o snake_case con al menos 1 underscore).
  // Evita falsos positivos como "tabla muestra", "tabla de resultados",
  // "tabla vacía" que son tablas de UI en español coloquial.
  /\btabla\s+[A-Z][A-Z0-9_]{2,}\b/,                   // "tabla INCIDENTS", "tabla USER_ROLES"
  /\btabla\s+[a-z]+_[a-z_]+\b/,                       // "tabla user_roles"
  /\ben\s+la\s+tabla\s+[A-Z][A-Z0-9_]{2,}\b/,
  /\ben\s+la\s+tabla\s+[a-z]+_[a-z_]+\b/,

  // Mirroring / reflection en BD
  /\bregistr[oa]s?\s+(?:se\s+)?reflej[ae]n?\s+en\s+(la\s+)?(base|bd|tabla)/i,
  /\bregistr[oa]s?\s+qued[ae]n?\s+(?:almacenad|registrad|persistid|en\s+bd|en\s+base)/i,

  // CRUD explícito en BD
  /\bse\s+insert[ae]\b/i,
  /\bse\s+actualiz[ae]\s+(?:el\s+)?registro\b/i,      // "se actualiza el registro" (vs. "se actualiza la pantalla")
  /\bse\s+elimin[ae]\s+(?:el\s+)?registro\b/i,
  /\bse\s+modific[ae]\s+(?:el\s+)?registro\b/i,
];

function normalizeText(text) {
  if (!text) return '';
  if (typeof text !== 'string') return String(text);
  return text;
}

/**
 * @param {Object} cp — { steps_raw, expected_result, gherkin, preconditions, tags }
 * @returns {boolean} true si el CP debería llevar @bd.
 */
function shouldTagBd(cp) {
  if (!cp || typeof cp !== 'object') return false;

  // Idempotente: si ya tiene @bd (case-insensitive) → true
  const tags = Array.isArray(cp.tags) ? cp.tags : [];
  if (tags.some(t => String(t).toLowerCase() === '@bd')) return true;

  // Construir corpus a evaluar: preferir expected_result + steps_raw; fallback a gherkin
  const corpus = [
    normalizeText(cp.expected_result),
    normalizeText(cp.expected_result_text),
    normalizeText(cp.steps_raw),
    normalizeText(cp.gherkin),
    normalizeText(cp.preconditions),
    normalizeText(cp.description_verify),
    normalizeText(cp.description_gnp),
  ].filter(Boolean).join('\n');

  if (!corpus) return false;

  return STRONG_PATTERNS.some(re => re.test(corpus));
}

/**
 * Retorna la lista de tags con `@bd` agregado al final si shouldTagBd es true
 * y el tag aún no está presente. Nunca duplica.
 *
 * @param {string[]} tags — array existente de tags
 * @param {Object} cp — el CP completo para el heurístico
 * @returns {string[]} tags (posiblemente con @bd añadido)
 */
function addBdTagIfNeeded(tags, cp) {
  const existing = Array.isArray(tags) ? [...tags] : [];
  const hasBd = existing.some(t => String(t).toLowerCase() === '@bd');
  if (hasBd) return existing;
  // Para la evaluación, armar una copia de cp sin el tag (evitar cortocircuito)
  const cpForEval = { ...cp, tags: existing };
  if (shouldTagBd(cpForEval)) existing.push('@bd');
  return existing;
}

/**
 * Retorna info de diagnóstico para audit/log — útil para reports de conversión Excel.
 * @returns {{ matched: boolean, matches: string[] }} patrones que activaron
 */
function diagnose(cp) {
  if (!cp) return { matched: false, matches: [] };
  const tags = Array.isArray(cp.tags) ? cp.tags : [];
  if (tags.some(t => String(t).toLowerCase() === '@bd')) {
    return { matched: true, matches: ['already_tagged'] };
  }
  const corpus = [
    normalizeText(cp.expected_result),
    normalizeText(cp.expected_result_text),
    normalizeText(cp.steps_raw),
    normalizeText(cp.gherkin),
    normalizeText(cp.preconditions),
    normalizeText(cp.description_verify),
    normalizeText(cp.description_gnp),
  ].filter(Boolean).join('\n');
  const matches = [];
  for (const re of STRONG_PATTERNS) {
    const m = corpus.match(re);
    if (m) matches.push(m[0]);
  }
  return { matched: matches.length > 0, matches };
}

module.exports = { shouldTagBd, addBdTagIfNeeded, diagnose, STRONG_PATTERNS };
