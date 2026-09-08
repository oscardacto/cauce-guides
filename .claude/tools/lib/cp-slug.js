'use strict';

/**
 * ATF — cp-slug.js
 *
 * Deriva el slug de carpeta filesystem-safe a partir de un CP-ID canónico.
 *
 * Motivación: los CP-ID siguen el patrón "CP-{module_id}-{suffix}" donde `suffix`
 * puede contener caracteres no filesystem-safe como "," (Matriz Excel ≥ 3 columnas
 * numeradas). El framework escribe resultados bajo
 * `execution/{module_id}/{slug}/` — y el slug es únicamente el sufijo del CP-ID
 * con los caracteres problemáticos reemplazados por "_".
 *
 * Ejemplos:
 *   cpIdToFolder("CP-Matriz_1-12,01,1")  → "12_01_1"
 *   cpIdToFolder("CP-M1-001")            → "001"
 *   cpIdToFolder("CP-auth-login_happy")  → "login_happy"
 *   cpIdToFolder("CP-M1-FL-02,3")        → "FL-02_3"   (conserva guiones internos del sufijo)
 *
 * API:
 *   cpIdToFolder(cpId)          → string  (slug para nombre de carpeta)
 *   extractModuleId(cpId)       → string  (module_id entre el primer "-" y el último "-" relevante)
 *   parseCpIdParts(cpId)        → { prefix, moduleId, suffix } | null
 *
 * NO toca el CP-ID canónico. Los JSON (cp_modulo, result, registries) siguen
 * usando la forma con comas "CP-Matriz_1-12,01,1". El slug aplica solo a nombres
 * de carpetas en el filesystem.
 */

const fs   = require('fs');
const path = require('path');

// Caracteres que no son válidos en nombres de carpeta en Windows NTFS
// (Windows bloquea <>:"/\|?*, pero además convenimos reemplazar "," por legibilidad
// dado que la Matriz Excel usa comas como separador jerárquico).
const UNSAFE_FS_CHARS = /[,:<>"|?*]/g;

/**
 * Parsea un CP-ID en { prefix, moduleId, suffix }.
 * Convención: "CP-{module_id}-{suffix}" donde module_id es la primera parte
 * después de "CP-" y suffix es TODO lo demás (puede contener guiones y comas).
 * Retorna null si el CP-ID no sigue el patrón.
 */
function parseCpIdParts(cpId) {
  if (typeof cpId !== 'string' || !cpId) return null;
  const parts = cpId.split('-');
  if (parts.length < 3) return null;
  return {
    prefix:   parts[0],             // "CP"
    moduleId: parts[1],             // "Matriz_1"
    suffix:   parts.slice(2).join('-'), // "12,01,1"  o  "FL-02,3"
  };
}

/**
 * Slug de carpeta para el CP. Toma el suffix y reemplaza unsafe chars.
 * Si el CP-ID no sigue el patrón, hace best-effort reemplazando unsafes en todo el string.
 *
 * NOTA: usa parseCpIdParts (split-by-dash) — falla con módulos multi-palabra
 * como "admin-organization" (slug = "organization-HU01-001" en lugar de
 * "HU01-001"). Para esos casos usar `cpIdToFolderFromKnownModules`.
 */
function cpIdToFolder(cpId) {
  const parsed = parseCpIdParts(cpId);
  if (!parsed) return String(cpId || '').replace(UNSAFE_FS_CHARS, '_');
  return parsed.suffix.replace(UNSAFE_FS_CHARS, '_');
}

/**
 * Slug de carpeta usando longest-prefix match contra una lista de module_ids
 * conocidos. Robusto para módulos multi-palabra.
 *
 * — añadido tras detectar bug en:
 * cp_id "CP-admin-organization-HU01-001" generaba slug "organization-HU01-001"
 * con `cpIdToFolder` (split-by-dash trunca el module_id en el primer guion).
 * Esta función matchea contra módulos reales del run y devuelve el suffix
 * después del module_id completo.
 *
 * Ejemplos:
 *   cpIdToFolderFromKnownModules("CP-admin-organization-HU01-001",
 *     ["admin-organization", "email-config", "job-titles"])
 *     → "HU01-001"
 *   cpIdToFolderFromKnownModules("CP-email-config-007",
 *     ["admin-organization", "email-config", "job-titles"])
 *     → "007"
 *   cpIdToFolderFromKnownModules("CP-Matriz_1-12,01,1", ["Matriz_1"])
 *     → "12_01_1"  (mantiene compat con módulos sin guiones)
 *   cpIdToFolderFromKnownModules("CP-auth-013", ["auth"])
 *     → "013"  (sin guiones — funciona igual que cpIdToFolder)
 *
 * Si `knownModuleIds` está vacío o ningún match → fallback a `cpIdToFolder`.
 *
 * @param {string} cpId — CP-ID canónico
 * @param {string[]} knownModuleIds — lista de module_ids conocidos del run
 * @returns {string} slug filesystem-safe
 */
function cpIdToFolderFromKnownModules(cpId, knownModuleIds) {
  if (typeof cpId !== 'string' || !cpId.startsWith('CP-')) {
    return cpIdToFolder(cpId);
  }
  if (!Array.isArray(knownModuleIds) || knownModuleIds.length === 0) {
    return cpIdToFolder(cpId);
  }
  const afterPrefix = cpId.slice(3); // quitar "CP-"
  // Ordenar por longitud descendente — longest-prefix match wins
  const sorted = [...knownModuleIds].sort((a, b) => b.length - a.length);
  for (const mod of sorted) {
    if (typeof mod !== 'string' || !mod) continue;
    if (afterPrefix === mod) {
      // CP-ID sin suffix (raro). Slug vacío no es seguro — fallback al CP-ID completo sanitizado.
      return cpId.replace(UNSAFE_FS_CHARS, '_');
    }
    if (afterPrefix.startsWith(mod + '-')) {
      const suffix = afterPrefix.slice(mod.length + 1); // skip "{mod}-"
      return suffix.replace(UNSAFE_FS_CHARS, '_');
    }
  }
  // Sin match — fallback heurístico
  return cpIdToFolder(cpId);
}

/**
 * Extrae module_id del CP-ID. Wrapper legible para otros tools.
 *
 * NOTA: esta función asume que el module_id es UNA palabra entre los dos primeros
 * guiones (parts[1]). Falla con módulos multi-palabra como "admin-organization"
 * o "email-config" — para ese caso usar `extractModuleIdFromKnownModules`.
 * Mantenida como fallback heurístico cuando no se conocen los módulos disponibles.
 */
function extractModuleId(cpId) {
  const parsed = parseCpIdParts(cpId);
  return parsed ? parsed.moduleId : null;
}

/**
 * Extrae module_id del CP-ID usando longest-prefix match contra una lista de
 * module_ids conocidos. Robusto para módulos multi-palabra (admin-organization,
 * email-config) que la heurística de split-by-dash no captura correctamente.
 *
 * — añadido tras detectar bug en:
 * cp_id "CP-admin-organization-HU01-001" devolvía module_id="admin" con
 * `extractModuleId`. La nueva función matchea contra archivos `cp_modulo_*.json`
 * reales del run, devolviendo "admin-organization" correctamente.
 *
 * Algoritmo:
 *   1. Quitar prefijo "CP-" del cp_id.
 *   2. Ordenar knownModuleIds por longitud descendente (longest-prefix wins).
 *   3. Para cada module_id conocido, verificar si es prefijo del resto del cp_id
 *      (con un "-" como separador esperado, o match exacto).
 *   4. Devolver el primer match. null si ninguno.
 *
 * Ejemplos:
 *   extractModuleIdFromKnownModules("CP-admin-organization-HU01-001",
 *     ["admin-organization", "email-config", "job-titles"])
 *     → "admin-organization"
 *   extractModuleIdFromKnownModules("CP-email-config-007",
 *     ["admin-organization", "email-config", "job-titles"])
 *     → "email-config"
 *   extractModuleIdFromKnownModules("CP-job-titles-HU2-001",
 *     ["admin-organization", "email-config", "job-titles"])
 *     → "job-titles"
 *   extractModuleIdFromKnownModules("CP-auth-001", ["auth", "M1"])
 *     → "auth"  (caso sin guiones internos, sigue funcionando)
 *
 * @param {string} cpId — CP-ID canónico (debe empezar con "CP-")
 * @param {string[]} knownModuleIds — lista de module_ids conocidos del run
 *   (típicamente derivada de `docs/testing/atf-web/{run_id}/design/cp_modulo_*.json`)
 * @returns {string | null}
 */
function extractModuleIdFromKnownModules(cpId, knownModuleIds) {
  if (typeof cpId !== 'string' || !cpId.startsWith('CP-')) return null;
  if (!Array.isArray(knownModuleIds) || knownModuleIds.length === 0) return null;
  const afterPrefix = cpId.slice(3); // quitar "CP-"
  // Ordenar por longitud descendente — longest-prefix match wins
  const sorted = [...knownModuleIds].sort((a, b) => b.length - a.length);
  for (const mod of sorted) {
    if (typeof mod !== 'string' || !mod) continue;
    if (afterPrefix === mod || afterPrefix.startsWith(mod + '-')) {
      return mod;
    }
  }
  return null;
}

module.exports = {
  cpIdToFolder,
  cpIdToFolderFromKnownModules,
  extractModuleId,
  extractModuleIdFromKnownModules,
  parseCpIdParts,
};

// ─── CLI (para smoke test rápido) ────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node cp-slug.js <cp_id>');
    console.error('Ej : node cp-slug.js CP-Matriz_1-12,01,1  →  12_01_1');
    process.exit(2);
  }
  const parsed = parseCpIdParts(arg);
  process.stdout.write(JSON.stringify({
    cp_id:     arg,
    parsed,
    slug:      cpIdToFolder(arg),
    module_id: extractModuleId(arg),
  }, null, 2) + '\n');
}
