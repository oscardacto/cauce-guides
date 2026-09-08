'use strict';

/**
 * ATF — session-context.js
 *
 * DAO centralizado del contexto de sesión del pipeline.
 *
 * Modelo de almacenamiento (Fase 4 del refactor,:
 *   output/{run_id}/
 *   ├── session_context.json      ← vista monolítica (legacy + compat)
 *   ├── auth_context.json         ← credenciales, roles, URL
 *   ├── execution_context.json    ← tag_filter, evidence_mode, timeouts, nav_learning
 *   ├── design_context.json       ← docs funcionales, coverage, lighthouse, automation_scope
 *   └── pipeline_state.json       ← pipeline_switches, cycle_type, continued_from_session
 *
 * La escritura del monolítico dispara la proyección automática de los 4 archivos por rol.
 * La lectura puede hacerse del monolítico (legacy) o de los contextos segregados (getters por rol).
 *
 * API como librería:
 *   const sc = require('.claude/tools/session-context');
 *   sc.read(runId)                      → objeto monolítico (ensamblado si solo existen los 4 contextos)
 *   sc.write(runId, patch)              → merge sobre el actual, escribe monolítico + 4 contextos
 *   sc.validate(ctx)                    → { ok, errors[], warnings[] }
 *   sc.exists(runId)                    → boolean
 *   sc.pathFor(runId)                   → ruta del session_context.json
 *
 *   // Getters por rol (Fase 4)
 *   sc.getAuthContext(runId)            → { credentials_file, requires_auth, default_role, additional_roles, app_url, app_environment }
 *   sc.getExecutionContext(runId)       → { active_tag_filter, active_flow_scope, evidence_mode, browser, headless, timeout_ms, navigation_learning, instance_timeout_min, memory_dir, execution_dir, exploratory_dir, run_folder, run_id }
 *   sc.getDesignContext(runId)          → { functional_docs_folder, design_dir, strategy_dir, diagnostics_dir, visual_dir, a11y_dir, performance_dir, selectors_dir, screen_coverage_path, max_pages, lighthouse_mode, lighthouse_repetitions, automation_scope, automation_dir, run_folder, run_id }
 *   sc.getPipelineState(runId)          → { pipeline_switches, cycle_type, changed_modules, unchanged_modules, continued_from_session, regression_enabled, baseline_run_id }
 *   sc.writePipelineState(runId, patch) → merge incremental sobre pipeline_state.json (y propaga al monolítico)
 *
 * CLI:
 *   node session-context.js read            <run_id>
 *   node session-context.js exists          <run_id>
 *   node session-context.js validate        <run_id>
 *   node session-context.js auth            <run_id>   (imprime auth_context)
 *   node session-context.js execution       <run_id>
 *   node session-context.js design          <run_id>
 *   node session-context.js pipeline-state  <run_id>
 *   node session-context.js init-minimal    <run_id>   (crea session_context.json mínimo para modo standalone)
 */

const fs   = require('fs');
const path = require('path');
const { readJSONStrict, writeJSON } = require('./lib/json-utils');
const { readYaml } = require('./lib/yaml-minimal');
const { resolveDbConfig } = require('./lib/db-config-resolver');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');
const APP_YAML     = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'appweb.yaml');
const CONFIG_YAML  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config', 'config.yaml');

/* ─── Rutas ─────────────────────────────────────────────────────────────── */

function pathFor(runId) {
  return path.join(OUTPUT_BASE, runId, 'session_context.json');
}

function authPathFor(runId)        { return path.join(OUTPUT_BASE, runId, 'auth_context.json'); }
function executionPathFor(runId)   { return path.join(OUTPUT_BASE, runId, 'execution_context.json'); }
function designPathFor(runId)      { return path.join(OUTPUT_BASE, runId, 'design_context.json'); }
function pipelineStatePathFor(runId){ return path.join(OUTPUT_BASE, runId, 'pipeline_state.json'); }

function exists(runId) {
  return fs.existsSync(pathFor(runId));
}

/* ─── Partición por rol ─────────────────────────────────────────────────── */

// Campos que cada contexto proyecta desde el monolítico.
// Los campos "core" (run_id, app_name, app_url, run_folder) se replican en todos
// los contextos para que cada agente tenga contexto mínimo sin leer el monolítico.

const CORE_FIELDS = [
  'run_id', 'app_name', 'app_url', 'app_version', 'app_environment', 'app_description',
  'run_folder',
];

const AUTH_FIELDS = [
  'credentials_file',
  'requires_auth',
  'default_role',
  'additional_roles',
  // --- MFA / storageState ---
  'mfa_type',
  'session_state_file',
  'session_health_check_selector',
];

const EXECUTION_FIELDS = [
  'active_tag_filter',
  'active_flow_scope',
  'evidence_mode',
  'browser',
  'headless',
  'timeout_ms',
  'navigation_learning',
  'instance_timeout_min',
  'memory_dir',
  'execution_dir',
  'exploratory_dir',
  'reports_dir',
  // --- Validación BD (REGLA 7) ---
  // db_config único: null = feature off; objeto con {host, port, name, username,
  // password, driver, options, registry_path} cuando está activa. El bloqueo
  // por DB_FAIL se resuelve exclusivamente desde el registry (`required`).
  'db_config',
];

const DESIGN_FIELDS = [
  'functional_docs_folder',
  'design_dir',
  'strategy_dir',
  'diagnostics_dir',
  'visual_dir',
  'a11y_dir',
  'performance_dir',
  'selectors_dir',
  'screen_coverage_path',
  'max_pages',
  'lighthouse_mode',
  'lighthouse_repetitions',
  'automation_scope',
  'automation_dir',
  'notebooklm_enabled',
  'notebooklm_notebook_id',
];

const PIPELINE_STATE_FIELDS = [
  'pipeline_switches',
  'cycle_type',
  'changed_modules',
  'unchanged_modules',
  'continued_from_session',
  'regression_enabled',
  'baseline_run_id',
];

function project(ctx, fields) {
  const out = {};
  for (const f of CORE_FIELDS) {
    if (ctx[f] !== undefined) out[f] = ctx[f];
  }
  for (const f of fields) {
    if (ctx[f] !== undefined) out[f] = ctx[f];
  }
  return out;
}

function writeProjections(runId, ctx) {
  writeJSON(authPathFor(runId),          project(ctx, AUTH_FIELDS));
  writeJSON(executionPathFor(runId),     project(ctx, EXECUTION_FIELDS));
  writeJSON(designPathFor(runId),        project(ctx, DESIGN_FIELDS));
  writeJSON(pipelineStatePathFor(runId), project(ctx, PIPELINE_STATE_FIELDS));
}

/* ─── Read / Write ──────────────────────────────────────────────────────── */

function read(runId) {
  // Si existe el monolítico, retornarlo tal cual (path canónico)
  const mono = readJSONStrict(pathFor(runId));
  if (mono) return mono;

  // Fallback: si solo existen los 4 contextos (migración futura), ensamblarlos
  const auth     = readJSONStrict(authPathFor(runId))          || {};
  const exec     = readJSONStrict(executionPathFor(runId))     || {};
  const design   = readJSONStrict(designPathFor(runId))        || {};
  const pipeline = readJSONStrict(pipelineStatePathFor(runId)) || {};
  const merged   = Object.assign({}, pipeline, design, exec, auth);
  return Object.keys(merged).length ? merged : null;
}

/**
 * Normaliza un array de active_tag_filter:
 * - `@cp_id:CP-X` (prefijo legacy) → `@cp:CP-X` (canónico)
 * - Otros tags (`@smoke`, `@critical`, `@cp:CP-X`, etc.) se preservan intactos.
 * Idempotente. No altera el formato canónico.
 */
function normalizeActiveTagFilter(value) {
  if (!Array.isArray(value)) return value;
  return value.map(t => {
    if (typeof t !== 'string') return t;
    if (t.startsWith('@cp_id:')) return '@cp:' + t.slice('@cp_id:'.length);
    return t;
  });
}

function validateActiveTagFilter(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    return `active_tag_filter debe ser Array, recibido: ${typeof value}`;
  }
  for (const t of value) {
    if (typeof t !== 'string' || t.trim() === '') {
      return `active_tag_filter contiene item no-string o vacío: ${JSON.stringify(t)}`;
    }
    // Rechazar prefijos obsoletos conocidos que NO son '@'-prefixed
    if (/^source_id:/i.test(t) || /^cp_id:/i.test(t)) {
      return `active_tag_filter contiene prefijo obsoleto sin '@' (usar '@cp:CP-X'): ${JSON.stringify(t)}`;
    }
    if (!t.startsWith('@')) {
      return `active_tag_filter contiene tag inválido (debe iniciar con '@'): ${JSON.stringify(t)}`;
    }
  }
  return null;
}

function write(runId, patch) {
  if (patch && 'active_tag_filter' in patch) {
    const err = validateActiveTagFilter(patch.active_tag_filter);
    if (err) {
      throw new Error(`session-context.write: schema violation — ${err}`);
    }
    // Normalizar prefijo legacy `@cp_id:` → `@cp:` antes de persistir.
    // Downstream consumers siempre leen formato canónico.
    const before = patch.active_tag_filter;
    const after  = normalizeActiveTagFilter(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      console.warn(`session-context: normalizado active_tag_filter legacy '@cp_id:' → '@cp:' (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
      patch = Object.assign({}, patch, { active_tag_filter: after });
    }
  }
  const filePath = pathFor(runId);
  const current  = readJSONStrict(filePath) || {};
  const merged   = Object.assign({}, current, patch || {});
  writeJSON(filePath, merged);
  try {
    writeProjections(runId, merged);
  } catch (err) {
    // La proyección nunca bloquea la escritura del monolítico.
    // Si falla, el caller ya tiene el session_context.json escrito.
    console.error(`session-context: proyección parcial falló — ${err.message}`);
  }
  return merged;
}

/* ─── Getters por rol (Fase 4) ──────────────────────────────────────────── */

function getAuthContext(runId) {
  const direct = readJSONStrict(authPathFor(runId));
  if (direct) return direct;
  // Fallback: proyectar desde el monolítico en caliente
  const mono = read(runId);
  return mono ? project(mono, AUTH_FIELDS) : null;
}

function getExecutionContext(runId) {
  const direct = readJSONStrict(executionPathFor(runId));
  if (direct) return direct;
  const mono = read(runId);
  return mono ? project(mono, EXECUTION_FIELDS) : null;
}

function getDesignContext(runId) {
  const direct = readJSONStrict(designPathFor(runId));
  if (direct) return direct;
  const mono = read(runId);
  return mono ? project(mono, DESIGN_FIELDS) : null;
}

function getPipelineState(runId) {
  const direct = readJSONStrict(pipelineStatePathFor(runId));
  if (direct) return direct;
  const mono = read(runId);
  return mono ? project(mono, PIPELINE_STATE_FIELDS) : null;
}

function writePipelineState(runId, patch) {
  const current = getPipelineState(runId) || {};
  const merged  = Object.assign({}, current, patch || {});
  // Escribir archivo segregado
  writeJSON(pipelineStatePathFor(runId), merged);
  // Propagar al monolítico para mantener consistencia
  const mono = read(runId) || {};
  const updated = Object.assign({}, mono);
  for (const f of PIPELINE_STATE_FIELDS) {
    if (merged[f] !== undefined) updated[f] = merged[f];
  }
  writeJSON(pathFor(runId), updated);
  return merged;
}

/* ─── Init minimal (modo standalone) ──────────────────────────────────── */

/**
 * Genera un session_context.json mínimo para un run_id standalone
 * (invocado desde /asdd:qa-web-diagnose, /asdd:qa-web-strategize, /asdd:qa-web-design).
 *
 * Idempotente: si output/{run_id}/session_context.json ya existe, no hace nada
 * y retorna el contexto existente (respeta lo que haya).
 *
 * Lee appweb.yaml y resuelve paths estándar del run_folder.
 *
 * @param {string} runId
 * @returns {object} session_context resultante
 */
/**
 * Fase 1 — defaults de execution heredados de config.yaml.
 *
 * Lee `config.yaml.execution.*` y devuelve un objeto con los campos canónicos
 * (`navigation_learning`, `evidence_mode`, `headless`, `instance_timeout_min`,
 * `timeout_ms`, `browser`) ya parseados. Si config.yaml no existe o falta el
 * bloque `execution`, devuelve defaults seguros.
 *
 * Centraliza la herencia de defaults para evitar drift entre `initMinimal`,
 * `refresh-session-context`, y cualquier futuro caller. **Una sola fuente de
 * verdad**: config.yaml. Este helper es la única vía para obtenerlos.
 *
 * Bug histórico que cierra: previo a `initMinimal` NO inyectaba
 * `navigation_learning` al ctx. session_context.json salía sin el flag,
 * `knowledge-excerpt` lo coercía a false, executor saltaba R2.2 lookup/record
 * (REGLA 19), y nav-learning quedaba inerte por toda la app.
 *
 * @returns {object} { navigation_learning, evidence_mode, headless,
 *                     instance_timeout_min, timeout_ms, browser }
 */
function defaultExecutionConfig() {
  let configYaml = {};
  try { configYaml = readYaml(CONFIG_YAML) || {}; } catch { /* config.yaml opcional */ }
  const execution = configYaml.execution || {};
  const navLearning = execution.navigation_learning;

  return {
    navigation_learning: typeof navLearning === 'object' && navLearning !== null
      ? {
          enabled:                navLearning.enabled !== false, // default true
          min_confidence:         typeof navLearning.min_confidence === 'number' ? navLearning.min_confidence : 0.5,
          stale_purge_after_runs: typeof navLearning.stale_purge_after_runs === 'number' ? navLearning.stale_purge_after_runs : 3,
          max_alternatives:       typeof navLearning.max_alternatives === 'number' ? navLearning.max_alternatives : 3,
        }
      : { enabled: true, min_confidence: 0.5, stale_purge_after_runs: 3, max_alternatives: 3 },
    evidence_mode:        execution.evidence_mode || 'failures_only',
    headless:             execution.headless !== false, // default true
    instance_timeout_min: typeof execution.instance_timeout_min === 'number' ? execution.instance_timeout_min : 30,
    timeout_ms:           typeof execution.timeout_ms === 'number' ? execution.timeout_ms : 30000,
    browser:              execution.browser || 'chromium',
  };
}

/**
 * Aplica defaults de execution a un ctx en-place (mutating). Solo agrega campos
 * que estén AUSENTES en el ctx — preserva valores existentes (idempotente).
 *
 * Llamado por `initMinimal` (creación standalone) y `refresh-session-context.js`
 * (backfill de runs legacy creados antes de ). Agregar nuevos campos a
 * `defaultExecutionConfig()` los hace heredar automáticamente sin tocar callers.
 */
function applyExecutionDefaults(ctx) {
  const defaults = defaultExecutionConfig();
  for (const key of Object.keys(defaults)) {
    if (ctx[key] === undefined) {
      ctx[key] = defaults[key];
    }
  }
  return ctx;
}

function initMinimal(runId) {
  if (!runId || typeof runId !== 'string') {
    throw new Error('initMinimal: runId requerido');
  }

  if (exists(runId)) {
    return read(runId);
  }

  const appYaml = readYaml(APP_YAML);
  const app     = appYaml.app || {};
  const auth    = appYaml.auth || {};
  const testRun = appYaml.test_run || {};
  const funcDocs = appYaml.functional_docs || {};
  const notebooklm = appYaml.notebooklm || {};

  // — herencia desde config.yaml cuando appweb.yaml omite campos.
  // Antes el LLM tenía que parchear session_context.json a mano (// en /asdd:qa-web-diagnose sobre OrangeHRM).
  let configYaml = {};
  try { configYaml = readYaml(CONFIG_YAML) || {}; } catch { /* config.yaml opcional */ }
  const configFolders = configYaml.folders || {};

  const runFolder = path.join(OUTPUT_BASE, runId);
  if (!fs.existsSync(runFolder)) {
    fs.mkdirSync(runFolder, { recursive: true });
  }

  // Resolver functional_docs_folder: appweb.yaml → config.yaml.folders.requirements
  // → 'docs/testing/atf-web/requirements/hu-bajo-prueba' (último recurso).
  const functionalDocsRaw = funcDocs.folder
    || configFolders.requirements
    || '{project-root}/requirements/hu-bajo-prueba';
  const functionalDocsFolder = functionalDocsRaw.replace('{project-root}', PROJECT_ROOT);

  // --- Resolver db_config desde credentials.yaml + registry (si aplica) ---
  // Feature off by default — db_config === null si la app no declara sección
  // `database` en credentials.yaml (ej: SauceDemo) o no tiene registry. REGLA 7.
  const { db_config } = resolveDbConfig(app.name || '', app.environment || '', testRun);

  const ctx = {
    run_id: runId,
    app_name: app.name || '',
    app_url: app.url || '',
    app_version: app.version || '1.0', // P51: default razonable cuando appweb.yaml lo omite
    app_environment: app.environment || 'qa', // P51: ambiente por defecto
    app_description: app.description || '',

    requires_auth: auth.requires_auth === true,
    default_role: auth.default_role || '',
    additional_roles: Array.isArray(auth.additional_roles) ? auth.additional_roles : [],
    credentials_file: path.join('docs', 'testing', 'atf-web', 'config', 'credentials.yaml'),

    // --- MFA / storageState (feature off si mfa_type === '') ---
    mfa_type: auth.mfa_type || '',
    session_state_file: auth.session_state_file || '',
    session_health_check_selector: auth.session_health_check_selector || '',

    // --- Validación BD (feature off si db_config === null) ---
    // Una sola señal. El bloqueo (DB_FAIL → FAIL del CP) se resuelve desde
    // `registry.{modules[].required || required}` — no desde appweb.yaml. REGLA 7.
    db_config, // null cuando feature off

    functional_docs_folder: functionalDocsFolder,

    notebooklm_enabled: notebooklm.enabled === true,
    notebooklm_notebook_id: notebooklm.notebook_id || '',

    run_folder: runFolder,
    diagnostics_dir: path.join(runFolder, 'diagnostics'),
    strategy_dir: path.join(runFolder, 'strategy'),
    design_dir: path.join(runFolder, 'design'),
    execution_dir: path.join(runFolder, 'execution'),
    reports_dir: path.join(runFolder, 'reports'),

    standalone_mode: true,
    pipeline_switches: {},
    created_at: new Date().toISOString(),
  };

  // Fase 1 — heredar defaults de execution (navigation_learning,
  // evidence_mode, headless, etc.) desde config.yaml. Sin esto, runs standalone
  // quedaban con flags ausentes y features inertes (REGLA 19 navigation_learning
  // fue víctima de este bug — confirmado en).
  applyExecutionDefaults(ctx);

  writeJSON(pathFor(runId), ctx);
  try {
    writeProjections(runId, ctx);
  } catch (err) {
    console.error(`session-context: proyección parcial falló — ${err.message}`);
  }
  return ctx;
}

/* ─── Validación de schema mínima ───────────────────────────────────────── */

const REQUIRED_FIELDS = [
  'run_id',
  'app_name',
  'app_url',
  'run_folder',
  'credentials_file',
  'functional_docs_folder',
];

const RECOMMENDED_FIELDS = [
  'app_version',
  'app_environment',
  'automation_scope',
  'evidence_mode',
  'pipeline_switches',
  // Fase 1 — execution defaults heredados de config.yaml.
  // validate() emite warning cuando faltan (no bloquea). Si knowledge-excerpt
  // los lee como undefined, su fallback a config.yaml los resuelve (Fase 2).
  'navigation_learning',
];

function validate(ctx) {
  const errors   = [];
  const warnings = [];

  if (!ctx || typeof ctx !== 'object') {
    return { ok: false, errors: ['ctx no es un objeto'], warnings };
  }

  for (const f of REQUIRED_FIELDS) {
    if (ctx[f] === undefined || ctx[f] === null || ctx[f] === '') {
      errors.push(`Campo requerido ausente o vacío: "${f}"`);
    }
  }

  for (const f of RECOMMENDED_FIELDS) {
    if (ctx[f] === undefined) {
      warnings.push(`Campo recomendado ausente: "${f}"`);
    }
  }

  if (ctx.pipeline_switches && typeof ctx.pipeline_switches !== 'object') {
    errors.push('pipeline_switches debe ser objeto');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ─── CLI ──────────────────────────────────────────────────────────────── */

function printJSONOrExit(obj, runId, label) {
  if (!obj) {
    console.error(`Not found: ${label} for run ${runId}`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main(argv) {
  const cmd   = argv[0];
  const runId = argv[1];

  if (!cmd || !runId) {
    console.error('Uso: node session-context.js {read|exists|validate|auth|execution|design|pipeline-state|init-minimal} <run_id>');
    process.exit(2);
  }

  if (cmd === 'read')            return printJSONOrExit(read(runId), runId, 'session_context');
  if (cmd === 'auth')            return printJSONOrExit(getAuthContext(runId), runId, 'auth_context');
  if (cmd === 'execution')       return printJSONOrExit(getExecutionContext(runId), runId, 'execution_context');
  if (cmd === 'design')          return printJSONOrExit(getDesignContext(runId), runId, 'design_context');
  if (cmd === 'pipeline-state')  return printJSONOrExit(getPipelineState(runId), runId, 'pipeline_state');

  if (cmd === 'init-minimal') {
    try {
      const preExisted = exists(runId);
      const ctx = initMinimal(runId);
      process.stdout.write(JSON.stringify({ ok: true, run_id: runId, created: !preExisted, reused: preExisted, run_folder: ctx.run_folder }, null, 2) + '\n');
      return process.exit(0);
    } catch (err) {
      console.error(`init-minimal falló: ${err.message}`);
      return process.exit(1);
    }
  }

  if (cmd === 'exists') {
    process.stdout.write(String(exists(runId)) + '\n');
    process.exit(exists(runId) ? 0 : 1);
  }

  if (cmd === 'validate') {
    const ctx = read(runId);
    if (!ctx) {
      console.error(`Not found: ${pathFor(runId)}`);
      process.exit(1);
    }
    const res = validate(ctx);
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    process.exit(res.ok ? 0 : 1);
  }

  console.error(`Comando desconocido: ${cmd}`);
  process.exit(2);
}

module.exports = {
  read,
  write,
  validate,
  validateActiveTagFilter,
  normalizeActiveTagFilter,
  exists,
  pathFor,
  initMinimal,
  // Fase 1 — defaults de execution (lee config.yaml)
  defaultExecutionConfig,
  applyExecutionDefaults,
  // Fase 4 — getters por rol
  getAuthContext,
  getExecutionContext,
  getDesignContext,
  getPipelineState,
  writePipelineState,
  // Paths de contextos segregados
  authPathFor,
  executionPathFor,
  designPathFor,
  pipelineStatePathFor,
  // Constantes
  OUTPUT_BASE,
  REQUIRED_FIELDS,
  RECOMMENDED_FIELDS,
  CORE_FIELDS,
  AUTH_FIELDS,
  EXECUTION_FIELDS,
  DESIGN_FIELDS,
  PIPELINE_STATE_FIELDS,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
