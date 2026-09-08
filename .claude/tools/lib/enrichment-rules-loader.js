'use strict';
/**
 * ATF v2 — enrichment-rules-loader.js
 *
 * Carga reglas de enriquecimiento per-app desde
 * `docs/testing/atf-web/knowledge/enrichment_rules.{app_name}.yaml`.
 *
 * Devuelve un objeto normalizado con 4 secciones:
 *   - type_a_entities[]     — palabras clave que señalan entidades creables
 *   - product_patterns[]    — regex para extraer códigos de producto
 *   - plan_codes[]          — lista cerrada de tokens para detección exacta
 *   - h4_data_defaults{}    — defaults por producto + defaults globales
 *
 * Si el archivo NO existe → retorna schema vacío (modo degradado).
 * Si existe pero malformado → warning a stderr + schema vacío.
 *
 * Uso programático:
 *   const { loadEnrichmentRules } = require('./lib/enrichment-rules-loader');
 *   const rules = loadEnrichmentRules('FogafinSIO');
 *
 * Uso CLI (dump para pasar al sub-agente skill):
 *   node .claude/tools/lib/enrichment-rules-loader.js --app=FogafinSIO
 *   → stdout JSON con el objeto normalizado.
 *
 * Por qué existe:
 *   El skill enrichment-analyzer original tenía VITAL/OIPA hardcoded en las
 *   secciones A, B y H4. Esto bloqueaba reuso para otras apps (Fogafin,
 *   SauceDemo, GNP, etc.). Al externalizar las reglas a YAML per-app, el
 *   skill queda genuinamente agnóstico y la configuración de dominio viaja
 *   con la app, no con el framework.
 */

const fs   = require('fs');
const path = require('path');
const { readYaml } = require('./yaml-minimal');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── Schema vacío (modo degradado / app sin reglas) ──────────────────────────
const EMPTY_RULES = Object.freeze({
  type_a_entities: [],
  product_patterns: [],
  plan_codes: [],
  h4_data_defaults: { rules: [], always: {} },
  source: null,        // path absoluto del YAML, null si no existe
  degraded: true,      // true si se usó el schema vacío
  warnings: [],
});

function warn(msg) {
  process.stderr.write(`[enrichment-rules-loader] WARN: ${msg}\n`);
}

/**
 * Carga y normaliza el YAML de reglas para una app.
 * @param {string} appName — nombre de la app (case-sensitive, como `appweb.yaml → app.name`)
 * @returns {object} reglas normalizadas (siempre devuelve objeto; nunca null)
 */
function loadEnrichmentRules(appName) {
  if (!appName || typeof appName !== 'string') {
    warn('appName vacío — devolviendo schema vacío');
    return { ...EMPTY_RULES, warnings: ['app_name_missing'] };
  }

  const filePath = path.join(
    PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'knowledge', `enrichment_rules.${appName}.yaml`
  );

  if (!fs.existsSync(filePath)) {
    return {
      ...EMPTY_RULES,
      source: filePath,
      warnings: ['file_not_found'],
    };
  }

  let raw;
  try {
    raw = readYaml(filePath);
  } catch (err) {
    warn(`YAML malformado en ${filePath}: ${err.message}`);
    return {
      ...EMPTY_RULES,
      source: filePath,
      warnings: ['yaml_parse_error'],
    };
  }

  if (!raw || typeof raw !== 'object') {
    warn(`YAML vacío o no-objeto en ${filePath}`);
    return {
      ...EMPTY_RULES,
      source: filePath,
      warnings: ['yaml_empty'],
    };
  }

  // Normalización defensiva — cada campo es opcional y tolerante a ausencia.
  // El YAML usa schema "map-form" (clave→valor) para compatibilidad con
  // yaml-minimal (no soporta arrays de objetos). Aquí normalizamos al formato
  // canónico que el skill consume (arrays de objetos).

  const typeAEntities = Array.isArray(raw.type_a_entities) ? raw.type_a_entities.map(String) : [];

  // product_patterns: map { name: regex_string } → array [{name, regex}]
  //                   (acepta también array de objetos si el parser mejora en el futuro)
  let productPatterns = [];
  if (Array.isArray(raw.product_patterns)) {
    productPatterns = raw.product_patterns
      .filter(p => p && typeof p === 'object' && p.regex)
      .map(p => ({ name: String(p.name || 'unnamed'), regex: String(p.regex) }));
  } else if (raw.product_patterns && typeof raw.product_patterns === 'object') {
    productPatterns = Object.entries(raw.product_patterns)
      .filter(([_, v]) => typeof v === 'string' && v.length > 0)
      .map(([name, regex]) => ({ name, regex }));
  }

  const planCodes = Array.isArray(raw.plan_codes) ? raw.plan_codes.map(String) : [];

  // h4_data_defaults.rules: map { prefix: defaults_object } → array [{when_product_starts_with, defaults}]
  const h4 = (raw.h4_data_defaults && typeof raw.h4_data_defaults === 'object') ? raw.h4_data_defaults : {};
  let h4Rules = [];
  if (Array.isArray(h4.rules)) {
    h4Rules = h4.rules.filter(r => r && typeof r === 'object');
  } else if (h4.rules && typeof h4.rules === 'object') {
    h4Rules = Object.entries(h4.rules)
      .filter(([_, defs]) => defs && typeof defs === 'object')
      .map(([prefix, defaults]) => ({ when_product_starts_with: [prefix], defaults }));
  }
  const h4Always = (h4.always && typeof h4.always === 'object') ? h4.always : {};

  const warnings = [];
  // Sanity checks — advertir sin fallar
  for (const p of productPatterns) {
    try { new RegExp(p.regex); } catch (_) { warnings.push(`invalid_regex:${p.name}`); }
  }

  return {
    type_a_entities: typeAEntities,
    product_patterns: productPatterns,
    plan_codes: planCodes,
    h4_data_defaults: { rules: h4Rules, always: h4Always },
    source: filePath,
    degraded: false,
    warnings,
  };
}

module.exports = { loadEnrichmentRules, EMPTY_RULES };

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  let appName = null;
  for (const a of args) {
    if (a.startsWith('--app=')) appName = a.slice(6);
    else if (a === '--help' || a === '-h') {
      process.stdout.write('enrichment-rules-loader — dumps normalized rules as JSON\n');
      process.stdout.write('Uso: --app={app.name}\n');
      process.stdout.write('Output: JSON en stdout; warnings a stderr; exit 0 siempre (degraded no es error).\n');
      process.exit(0);
    }
  }
  if (!appName) {
    process.stderr.write('ERROR: --app=<name> requerido\n');
    process.exit(1);
  }
  const rules = loadEnrichmentRules(appName);
  process.stdout.write(JSON.stringify(rules, null, 2) + '\n');
  process.exit(0);
}
