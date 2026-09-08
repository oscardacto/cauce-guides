#!/usr/bin/env node
/**
 * refresh-session-context.js — Refresca `docs/testing/atf-web/{run_id}/session_context.json`
 * con paths derivados del cwd actual y campos volátiles del run en curso.
 *
 * Reemplaza al patrón inline `node -e "..."` que el orchestrator usaba en
 * PASO 0.3.1 (CONTINUACIÓN), que sufre escape problems de backslashes en
 * Windows y obliga a workarounds frágiles tipo `.tmp_refresh_sc.js`.
 *
 * Filosofía: este script NO inventa datos. Solo:
 *   1. Lee el `session_context.json` existente (si existe).
 *   2. Re-deriva los paths absolutos desde el cwd actual + run_id.
 *   3. Pisa los campos volátiles del run pasados por CLI (tags, evidence_mode,
 *      batch_size, mode, headless, is_continuation).
 *   4. Setea `pipeline_state.run_started_at` con timestamp del momento.
 *   5. Conserva el resto del contenido tal cual.
 *
 * Uso típico (CONTINUATION SHORTCUT):
 *   node .claude/tools/refresh-session-context.js \
 *     --run-id "MiApp-v1.0-20260101-0900" \
 *     --tags '["@cp:CP-auth-013"]' \
 *     --evidence-mode all \
 *     --batch-size 3 \
 *     --mode custom \
 *     --is-continuation true
 *
 * Uso mínimo (solo refrescar timestamp + paths):
 *   node .claude/tools/refresh-session-context.js --run-id "<id>"
 *
 * Exit codes:
 *   0 — OK, JSON refrescado a stdout (resumen humano-legible)
 *   1 — error (run_id ausente, session_context.json inexistente, JSON corrupto)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { readYaml } = require('./lib/yaml-minimal');

function die(msg) {
  process.stderr.write(`[refresh-session-context] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs() {
  const out = {
    runId: null,
    tags: null,
    evidenceMode: null,
    batchSize: null,
    mode: null,
    headless: null,
    isContinuation: null,
    appName: null
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--run-id')              out.runId          = next();
    else if (a === '--tags')           out.tags           = next();
    else if (a === '--evidence-mode')  out.evidenceMode   = next();
    else if (a === '--batch-size')     out.batchSize      = parseInt(next(), 10);
    else if (a === '--mode')           out.mode           = next();
    else if (a === '--headless')       out.headless       = next() === 'true';
    else if (a === '--is-continuation') out.isContinuation = next() === 'true';
    else if (a === '--app-name')       out.appName        = next();
  }
  if (!out.runId) die('--run-id es obligatorio');
  return out;
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

function main() {
  const args = parseArgs();
  const ROOT = toForwardSlashes(process.cwd());
  const RUN_FOLDER = toForwardSlashes(path.join(ROOT, 'docs', 'testing', 'atf-web', args.runId));
  const SC_PATH = path.join(RUN_FOLDER, 'session_context.json');

  if (!fs.existsSync(SC_PATH)) {
    die(`session_context.json no existe en ${SC_PATH}. ¿run_id válido?`);
  }

  let sc;
  try {
    sc = JSON.parse(fs.readFileSync(SC_PATH, 'utf8'));
  } catch (e) {
    die(`session_context.json inválido: ${e.message}`);
  }

  // 1. Re-derivar paths desde cwd actual (mata stale paths de otro proyecto)
  sc.run_folder           = RUN_FOLDER;
  sc.diagnostics_dir      = RUN_FOLDER + '/diagnostics';
  sc.strategy_dir         = RUN_FOLDER + '/strategy';
  sc.design_dir           = RUN_FOLDER + '/asdd:qa-web-design';
  sc.execution_dir        = RUN_FOLDER + '/execution';
  sc.reports_dir          = RUN_FOLDER + '/reports';
  sc.screen_coverage_path = RUN_FOLDER + '/screen_coverage.json';
  sc.functional_docs_folder = toForwardSlashes(path.join(ROOT, 'docs', 'testing', 'atf-web', 'requirements'));
  sc.credentials_file     = 'docs/testing/atf-web/config/credentials.yaml';

  // memory_dir depende del app_name (si no viene por CLI, usar el del session_context)
  const appName = args.appName || sc.app_name;
  if (appName) {
    sc.memory_dir = toForwardSlashes(path.join(ROOT, '.claude/agent-memory', appName));
  }

  // 1.5. Auto-refresh MFA fields desde appweb.yaml
  // Antes de  campos quedaban stale en session_context cuando el
  // QA editaba appweb.yaml entre runs. El MFA preflight leía appweb.yaml directo y
  // funcionaba bien, pero otros consumidores que solo leyeran session_context
  // verían los valores viejos. Ahora se sincronizan automáticamente.
  const appYamlPath = path.resolve('docs/testing/atf-web/config/appweb.yaml');
  if (fs.existsSync(appYamlPath)) {
    try {
      const appCfg = readYaml(appYamlPath) || {};
      const auth = appCfg.auth || {};
      // Solo pisamos si el campo está presente en appweb.yaml (evita perder valores válidos
      // si appweb.yaml está incompleto). String vacío "" SÍ es valor válido (= MFA off).
      if (auth.mfa_type !== undefined)                 sc.mfa_type                       = auth.mfa_type;
      if (auth.session_state_file !== undefined)       sc.session_state_file             = auth.session_state_file;
      if (auth.session_health_check_selector !== undefined) sc.session_health_check_selector = auth.session_health_check_selector;
      if (auth.requires_auth !== undefined)            sc.requires_auth                  = auth.requires_auth;
      if (auth.default_role !== undefined)             sc.default_role                   = auth.default_role;
    } catch (_) { /* appweb.yaml ilegible — preservar valores existentes en session_context */ }
  }

  // 2. Pisar campos volátiles del run (solo los que vinieron por CLI)
  if (args.tags !== null) {
    let parsed;
    try { parsed = JSON.parse(args.tags); }
    catch { die(`--tags debe ser JSON array válido. Recibido: ${args.tags}`); }
    if (!Array.isArray(parsed)) die('--tags debe ser un JSON array');
    sc.custom_tags        = parsed;
    sc.active_tag_filter  = parsed;
  }
  if (args.evidenceMode !== null)   sc.evidence_mode        = args.evidenceMode;
  if (args.batchSize !== null && !Number.isNaN(args.batchSize)) sc.fast_path_batch_size = args.batchSize;
  if (args.mode !== null)           sc.test_run_mode        = args.mode;
  if (args.headless !== null)       sc.headless             = args.headless;
  if (args.isContinuation !== null) sc.is_continuation      = args.isContinuation;

  // 3. Pipeline state — siempre actualizar run_started_at
  if (!sc.pipeline_state) sc.pipeline_state = {};
  sc.pipeline_state.run_started_at = new Date().toISOString();

  // 3.5. Fase 1 — backfill de execution defaults (idempotente).
  // Para runs legacy (creados antes de ) cuyo session_context.json
  // no tiene navigation_learning u otros campos heredables de config.yaml,
  // este paso los rellena sin pisar valores existentes. Un único punto de
  // verdad: defaultExecutionConfig() en session-context.js. Cierra el bug
  // MiApp-v1.0-20260101-0900 (run sin navigation_learning, feature inerte).
  try {
    const sessionCtxLib = require('./session-context');
    sessionCtxLib.applyExecutionDefaults(sc);
  } catch (e) {
    // No bloquear el refresh si el helper no está disponible — tabla legacy.
    process.stderr.write(`refresh-session-context: applyExecutionDefaults skipped (${e.message})\n`);
  }

  // 4. Persistir vía session-context DAO). Sin esto, los fragments quedaban stale tras
  //    cada refresh: agentes que leyeran auth_context.json post-edit de
  //    appweb.yaml verían `mfa_type` viejo aunque session_context.json tuviera
  //    el valor actualizado. El DAO normaliza active_tag_filter (@cp_id: → @cp:)
  //    y valida el schema antes de escribir.
  try {
    const sessionCtxLib = require('./session-context');
    sessionCtxLib.write(args.runId, sc);
  } catch (e) {
    // Fallback: escritura directa si el DAO no está disponible (entorno legacy).
    // Pierde la sincronización de fragments — emitir warning a stderr.
    process.stderr.write(`refresh-session-context: DAO write falló (${e.message}); fallback a fs.writeFileSync — fragments no se sincronizarán\n`);
    fs.writeFileSync(SC_PATH, JSON.stringify(sc, null, 2), 'utf8');
  }

  // 5. Resumen humano-legible a stdout
  const summary = {
    ok: true,
    session_context_path: SC_PATH,
    run_folder: sc.run_folder,
    app_name: sc.app_name || null,
    active_tag_filter: sc.active_tag_filter || null,
    evidence_mode: sc.evidence_mode || null,
    fast_path_batch_size: sc.fast_path_batch_size || null,
    mfa_type: sc.mfa_type || null,
    session_state_file: sc.session_state_file || null,
    is_continuation: sc.is_continuation || false,
    run_started_at: sc.pipeline_state.run_started_at
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

main();
