#!/usr/bin/env node
/**
 * knowledge-excerpt.js — extrae en UN solo JSON los datos de conocimiento + auth
 * que `/asdd:qa-web-exec` necesita pre-cargar antes de invocar al executor. Elimina las 4-5
 * lecturas redundantes del setup.
 *
 * Archivos consultados:
 *   - docs/testing/atf-web/config/appweb.yaml                  (app.*, auth.*, test_run.*, pipeline.*)
 *   - docs/testing/atf-web/config/credentials.yaml          (credenciales del rol default)
 *   - output/{run_id}/session_context.json  (navigation_learning, etc.)
 *   - output/{run_id}/auth_context.json     (opcional — preferido si existe)
 *   - docs/testing/atf-web/knowledge/app_behavior.{app_name}.md  (único path — sin fallback)
 *   - docs/testing/atf-web/knowledge/test_gotchas.{app_name}.md  (único path — sin fallback)
 *
 * Cache (opcional):
 *   Si --cache está presente, escribe el JSON en
 *   output/{run_id}/.knowledge_cache.json
 *   para que subsiguientes invocaciones dentro del mismo run reusen el resultado
 *   (mtime-check: si appweb.yaml o los knowledge files cambiaron desde el cache,
 *   invalida y recalcula).
 *
 * Uso:
 *   node .claude/tools/knowledge-excerpt.js --run-id=MiApp-v1.0-20260101-0900
 *   node .claude/tools/knowledge-excerpt.js --run-id=... --cache
 *   node .claude/tools/knowledge-excerpt.js --run-id=... --cache --force-refresh
 *   node .claude/tools/knowledge-excerpt.js --run-id=... --minimal
 *                  (--minimal: omite app_behavior + test_gotchas para re-runs rápidos)
 *
 * Output (stdout — JSON):
 *   {
 *     "app_yaml_extract": { app_name, app_url, app_version, app_environment,
 *                           evidence_mode, auth_required,
 *                           auth_role, navigation_learning_enabled },
 *     "credentials_for_default_role": { username, password } | null,
 *     "app_behavior_excerpt": "...",       // primeras ~80 líneas o archivo completo
 *     "test_gotchas_excerpt": "...",
 *     "source_files_read": [ paths ],
 *     "cached_at": "ISO | null",
 *     "warnings": [ ... ]
 *   }
 *
 * PROHIBICIONES:
 *   - NO incluye referencias a @known_bug, FAIL_BY_DESIGN, historia de bugs
 *     de CPs específicos. Si detecta esos patterns en los excerpts, agrega
 *     un warning pero preserva el contenido (el filtrado activo se hace en
 *     los knowledge files via `.claude/commands/asdd/qa-web-exec.md` PROHIBICIONES).
 *
 * Exit: 0 OK | 1 input inválido | 2 appweb.yaml no legible (fatal)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readYaml } = require('./lib/yaml-minimal');
const { loadResponsiveConfig } = require('./lib/responsive-config');

function die(code, msg) {
  process.stderr.write(`[knowledge-excerpt] ERROR: ${msg}\n`);
  process.exit(code);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { cache: false, forceRefresh: false, outputFile: null, minimal: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--run-id='))     out.runId = a.slice('--run-id='.length);
    else if (a === '--cache')          out.cache = true;
    else if (a === '--force-refresh')  out.forceRefresh = true;
    else if (a === '--minimal')        out.minimal = true;
    else if (a.startsWith('--output=')) out.outputFile = a.slice('--output='.length);
  }
  if (!out.runId) die(1, '--run-id=... requerido');
  return out;
}

/* ─── Readers ──────────────────────────────────────────────────────── */

function readAppYaml() {
  const p = path.resolve('docs/testing/atf-web/config/appweb.yaml');
  try { return { data: readYaml(p), path: p }; }
  catch (e) { die(2, `no se pudo leer appweb.yaml: ${e.message}`); }
}

function readCredentials(environment, role) {
  const p = path.resolve('docs/testing/atf-web/config/credentials.yaml');
  if (!fs.existsSync(p)) return { creds: null, path: null, warning: 'credentials.yaml no existe' };
  try {
    const data = readYaml(p);
    const env = data.environments?.[environment];
    if (env) {
      const roleObj = env.roles?.[role];
      if (!roleObj) return { creds: null, path: p, warning: `roles.${role} no existe en environments.${environment}` };
      return { creds: { username: roleObj.username, password: roleObj.password }, path: p, warning: null };
    }

    // Compat temporal: algunas apps legacy usan shape simplificado `roles.*`
    // sin wrapper `environments.{env}.roles.*`.
    const roleObjLegacy = data.roles?.[role];
    if (roleObjLegacy) {
      return {
        creds: { username: roleObjLegacy.username, password: roleObjLegacy.password },
        path: p,
        warning: `environments.${environment} no existe en credentials.yaml; usando fallback legacy roles.${role}. Migrar al schema canónico environments.{env}.roles.{role}.`,
      };
    }

    return {
      creds: null,
      path: p,
      warning: `environments.${environment} no existe en credentials.yaml y fallback roles.${role} tampoco existe`,
    };
  } catch (e) {
    return { creds: null, path: p, warning: `error leyendo credentials.yaml: ${e.message}` };
  }
}

function readSessionContext(runId) {
  const p = path.resolve(`docs/testing/atf-web/${runId}/session_context.json`);
  if (!fs.existsSync(p)) return { data: null, path: null };
  try { return { data: JSON.parse(fs.readFileSync(p, 'utf8')), path: p }; }
  catch { return { data: null, path: p }; }
}

function readKnowledgeExcerpt(kind, appName) {
  // Per-app único. Sin fallback al `.md` sin sufijo (eliminado por la regla de
  // aislamiento per-app: doctrina extraída vive solo en {kind}.{appName}.md).
  const p = path.resolve(`docs/testing/atf-web/knowledge/${kind}.${appName}.md`);
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, 'utf8');
    // Si > 4KB, tomar primeras 80 líneas; si corto, entero.
    if (text.length > 4000) {
      return { excerpt: text.split(/\r?\n/).slice(0, 80).join('\n'), path: p, truncated: true };
    }
    return { excerpt: text, path: p, truncated: false };
  }
  return { excerpt: null, path: null, truncated: false };
}

/* ─── Cache ────────────────────────────────────────────────────────── */

function cachePath(runId) {
  return path.resolve(`docs/testing/atf-web/${runId}/.knowledge_cache.json`);
}

function readCacheIfValid(runId, sourceFiles) {
  const p = cachePath(runId);
  if (!fs.existsSync(p)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!cached.cached_at || !Array.isArray(cached.source_files_read)) return null;
    const cacheMtime = fs.statSync(p).mtimeMs;
    // Invalidar si algún source file tiene mtime > cache mtime
    for (const sp of sourceFiles) {
      if (!sp || !fs.existsSync(sp)) continue;
      if (fs.statSync(sp).mtimeMs > cacheMtime) return null;
    }
    // Invalidar si el propio script cambió post-cache. Sin esto, los patches
    // a la lógica de extracción (ej: fallback a roles.{role} de ) no
    // surten efecto hasta que las source files se modifiquen. // run OrangeHRM: cache de 09:00 reusada a las 12:58 con
    // credentials_for_default_role:null pese al patch B6 ya aplicado.
    try {
      if (fs.statSync(__filename).mtimeMs > cacheMtime) return null;
    } catch (_) { /* no bloquear si stat del script falla */ }
    return cached;
  } catch { return null; }
}

function writeCache(runId, payload) {
  const p = cachePath(runId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
}

/* ─── Main ─────────────────────────────────────────────────────────── */

const args = parseArgs();
const warnings = [];

// Primero: si hay cache y --cache y no --force-refresh, probar cache
const appYamlPath = path.resolve('docs/testing/atf-web/config/appweb.yaml');
const credsPath   = path.resolve('docs/testing/atf-web/config/credentials.yaml');
const sessionCtxPath = path.resolve(`docs/testing/atf-web/${args.runId}/session_context.json`);

// Pre-identificar los knowledge files (requiere leer appweb.yaml para el app_name)
// Regla de aislamiento per-app: un solo path, sin fallback al `.md` sin sufijo.
const { data: appData } = readAppYaml();
const appName = appData.app?.name || 'generic';
const behaviorPath = path.resolve(`docs/testing/atf-web/knowledge/app_behavior.${appName}.md`);
const gotchasPath  = path.resolve(`docs/testing/atf-web/knowledge/test_gotchas.${appName}.md`);

// P40: EXCLUIR session_context.json del cache check.
// `session_context.json` se reescribe en CADA preflight (refresh-session-context.js)
// porque persiste valores volátiles del run (run_started_at, custom_tags, etc.).
// Si lo incluimos como source, el cache de knowledge-excerpt INVALIDA en cada run
// → cache miss garantizado (medido: 2330 ms vs 552 ms con HIT).
// Los campos que el excerpt SÍ usa de session_context (mfa_type, default_role)
// vienen originalmente de appweb.yaml — el refresh los REPLICA, no los introduce.
// Por tanto, el mtime check sobre appweb.yaml + credentials.yaml + knowledge files
// es suficiente para detectar cambios reales del input al excerpt.
const allSourceFiles = [appYamlPath, credsPath, behaviorPath, gotchasPath];

if (args.cache && !args.forceRefresh) {
  const cached = readCacheIfValid(args.runId, allSourceFiles);
  if (cached) {
    // Agregar un marcador indicando que vino del cache
    cached._from_cache = true;
    process.stdout.write(JSON.stringify(cached, null, 2) + '\n');
    process.exit(0);
  }
}

// Extract appweb.yaml fields
const app = appData.app || {};
const auth = appData.auth || {};
const test_run = appData.test_run || {};
const pipeline = appData.pipeline || {};
const responsiveCfg = loadResponsiveConfig(appData);
if (responsiveCfg.errors.length > 0) {
  warnings.push(...responsiveCfg.errors.map(e => `responsive config: ${e}`));
}
if (responsiveCfg.warnings.length > 0) {
  warnings.push(...responsiveCfg.warnings);
}

// navigation_learning viene del session_context, no del appweb.yaml
const { data: sessionCtx } = readSessionContext(args.runId);
let navLearning = sessionCtx?.navigation_learning;

// Fase 2 — fallback explícito a config.yaml cuando session_context
// no tiene navigation_learning. Sin este fallback, runs legacy (creados antes
// de Fase 1) heredaban undefined → coerción a false → executor
// saltaba R2.2 lookup/record y nav-learning quedaba inerte sin alerta.
//
// El fallback emite warning estructurado: el flag se respetó pero la fuente
// fue config.yaml (no session_context). Permite al QA detectar runs cuyo
// onboarding fue incompleto sin que el feature falle silenciosamente.
if (navLearning === undefined || navLearning === null) {
  try {
    const { defaultExecutionConfig } = require('./session-context');
    const defaults = defaultExecutionConfig();
    navLearning = defaults.navigation_learning;
    warnings.push(
      `navigation_learning ausente en session_context.json — fallback a ` +
      `config.yaml (enabled=${navLearning.enabled}). Recomendado: ejecutar ` +
      `refresh-session-context.js sobre este run para hacer backfill ` +
      `permanente, o re-onboardear la app via /asdd:qa-web-setup-app actualizado.`
    );
  } catch (e) {
    // session-context library no disponible — preservar comportamiento legacy
    // (queda undefined → false). No bloquear el preflight.
  }
}

const app_yaml_extract = {
  app_name: app.name,
  app_url: app.url,
  app_version: app.version,
  app_environment: app.environment,
  evidence_mode: test_run.evidence_mode || 'failures_only',
  auth_required: !!auth.requires_auth,
  auth_role: auth.default_role || 'default',
  navigation_learning_enabled: typeof navLearning === 'object'
    ? !!navLearning.enabled
    : !!navLearning,
};

// Credenciales del rol por defecto
const credsResult = readCredentials(app_yaml_extract.app_environment, app_yaml_extract.auth_role);
if (credsResult.warning) warnings.push(credsResult.warning);

// Excerpts (skipped in --minimal mode to reduce overhead for re-runs)
const behavior = args.minimal ? { excerpt: null, path: null, truncated: false } : readKnowledgeExcerpt('app_behavior', appName);
const gotchas = args.minimal ? { excerpt: null, path: null, truncated: false } : readKnowledgeExcerpt('test_gotchas', appName);

// Validar que los excerpts no contengan SESGOS por historia de CPs específicos.
// Patrón positivo: un CP-ID concreto en la MISMA línea que un término tóxico.
// Evita false-positives cuando el archivo documenta META "no incluir @known_bug"
// como regla explicativa (texto sobre el patrón prohibido, no el patrón aplicado).
function hasBiasByHistory(text) {
  if (!text) return false;
  const TOXIC = /@known_bug|FAIL_BY_DESIGN|bug conocido|ya falla|ya pasa|flaky/i;
  const CP_ID = /CP-[A-Za-z0-9_]+-[^\s"'`]+/;
  for (const line of text.split(/\r?\n/)) {
    if (TOXIC.test(line) && CP_ID.test(line)) return true;
  }
  return false;
}
if (hasBiasByHistory(behavior.excerpt)) {
  warnings.push(`app_behavior excerpt contiene sesgo por historia de CPs (CP-ID + término de veredicto en misma línea — ver PROHIBICIONES en /asdd:qa-web-exec.md)`);
}
if (hasBiasByHistory(gotchas.excerpt)) {
  warnings.push(`test_gotchas excerpt contiene sesgo por historia de CPs (CP-ID + término de veredicto en misma línea — ver PROHIBICIONES en /asdd:qa-web-exec.md)`);
}

const source_files_read = [appYamlPath, credsResult.path, sessionCtxPath, behavior.path, gotchas.path]
  .filter(Boolean)
  .map(p => path.relative(process.cwd(), p).replace(/\\/g, '/'));

const output = {
  app_yaml_extract,
  credentials_for_default_role: credsResult.creds,
  // FIX #9 propagation: MFA + BD config del session_context al exec_context.
  // Sin estos campos, el executor no ve db_config → nunca invoca PASO 3.5 → la REGLA 7
  // no se ejerce aunque la feature esté correctamente configurada.
  mfa_type: sessionCtx?.mfa_type || '',
  session_state_file: sessionCtx?.session_state_file || '',
  session_health_check_selector: sessionCtx?.session_health_check_selector || '',
  db_config: sessionCtx?.db_config || null,
  responsive: {
    enabled:        responsiveCfg.enabled,
    execution_mode: responsiveCfg.execution_mode,
    result_policy:  responsiveCfg.result_policy,
    mcp_capability: responsiveCfg.mcp_capability,
    viewports:      responsiveCfg.viewports,
  },
  app_behavior_excerpt: behavior.excerpt,
  test_gotchas_excerpt: gotchas.excerpt,
  highlight_runtime_snippet: (() => {
    try {
      const { execFileSync } = require('child_process');
      const highlightScript = path.join(__dirname, 'snippets', 'highlight.js');
      return execFileSync(process.execPath, [highlightScript, '--inject-runtime'], { encoding: 'utf8' }).trim();
    } catch (_) { return null; /* executor falls back to bash spawn */ }
  })(),
  source_files_read,
  cached_at: new Date().toISOString(),
  warnings,
};

if (args.cache) writeCache(args.runId, output);

// --output: write JSON to an explicit file (idempotent). Used by /asdd:qa-web-exec PASO 2.7
// to persist exec_context.json that the sub-agent reads without relying on stdout.
// If the target file already exists and all source files have older mtime, reuse it.
if (args.outputFile) {
  const outAbs = path.resolve(args.outputFile);
  let shouldWrite = true;
  if (fs.existsSync(outAbs) && !args.forceRefresh) {
    try {
      const outMtime = fs.statSync(outAbs).mtimeMs;
      const newestSource = allSourceFiles
        .filter(p => p && fs.existsSync(p))
        .map(p => fs.statSync(p).mtimeMs)
        .reduce((a, b) => Math.max(a, b), 0);
      if (outMtime >= newestSource) {
        // existing file is fresh — skip write, keep content
        shouldWrite = false;
        output._reused_existing_output = true;
      }
    } catch { /* fall through: write anyway */ }
  }
  if (shouldWrite) {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify(output, null, 2), 'utf8');
  }
  // Emit a small stdout line for /asdd:qa-web-exec to log (not the full JSON)
  process.stdout.write(JSON.stringify({
    output_file: path.relative(process.cwd(), outAbs).replace(/\\/g, '/'),
    reused: !shouldWrite,
    warnings: output.warnings,
  }) + '\n');
  process.exit(0);
}

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
