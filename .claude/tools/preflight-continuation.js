#!/usr/bin/env node
/**
 * preflight-continuation.js — Pre-flight consolidado para CONTINUATION SHORTCUT.
 *
 * Reemplaza la cadena WAVE 0 + WAVE 1 + WAVE 2 + ls design + inject
 * cp_targets_resolved que el orchestrator ejecutaba como ~7 bash + 5 reads
 * + ~10 momentos de thinking del LLM (~2:00-3:00 min de overhead).
 *
 * Estrategia:
 *   1. SYNC inicial — lee appweb.yaml + session_context.json + verifica run_folder
 *      + GUARD cp_modulo_*.json + deriva module_id desde tags (sin `ls design/`)
 *      + lee checkpoint.json.
 *   2. PARALLEL — spawn 4 child_process en paralelo:
 *        a. refresh-session-context.js       (refresca session_context con appweb.yaml)
 *        b. knowledge-excerpt.js --cache     (genera exec_context.json)
 *        c. restore-mfa-session.js           (MFA preflight dry-run)
 *        d. reset-cp-artifacts.js            (limpieza si re-ejecución)
 *   3. SYNC final — inyecta cp_targets_resolved[] en exec_context.json
 *      (depende de que knowledge-excerpt haya escrito el archivo).
 *   4. Emite UN JSON consolidado a stdout con TODO lo que el orchestrator
 *      necesita para spawnear al Agent:Executor.
 *
 * Uso:
 *   node preflight-continuation.js \
 *     --run-id "MiApp-v1.0-20260101-0900" \
 *     --tags '["@cp:CP-auth-013"]' \
 *     --evidence-mode all \
 *     --batch-size 3 \
 *     --mode custom
 *
 * Output JSON (stdout):
 *   {
 *     ok: true,
 *     run_id, run_folder, design_dir, execution_dir,
 *     app_name, app_url, environment,
 *     module_id,                    // derivado de los tags
 *     cp_targets: ["CP-auth-013"],  // ids filtrados
 *     cp_targets_resolved_count: 1, // cuántos CPs se inyectaron
 *     evidence_mode, batch_size, mode,
 *     mfa_status: "feature_off"|"ready"|"needs_reauth"|"parse_error",
 *     mfa_action_required: null|"node .claude/tools/save-session.js --env qa --force",
 *     design_status: "DESIGN_OK"|"DESIGN_MISSING",
 *     cp_modulo_file: "design/cp_modulo_{module}.json",
 *     checkpoint: null|{...},
 *     exec_context_path: ".tmp/exec_context.json",
 *     knowledge_excerpt_reused: true|false,
 *     reset_manifest: {actions_count, removed},
 *     run_started_at: "2026-04-27T18:00:00.000Z",
 *     timings_ms: {sync_init, parallel_spawns, inject_targets, total}
 *   }
 *
 * Exit codes:
 *   0 — OK, todo el preflight resolvió
 *   1 — error fatal (run_folder no existe, design missing, tag inválido, etc.)
 *   2 — MFA needs_reauth (BLOCKED batch — el orchestrator NO debe spawnear executor)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { readYaml } = require('./lib/yaml-minimal');
const { cpIdToFolder, cpIdToFolderFromKnownModules, extractModuleIdFromKnownModules } = require('./lib/cp-slug.js');
const { loadResponsiveConfig, totalExecutionUnits } = require('./lib/responsive-config');

/**
 * Lista los module_ids disponibles en design/ del run.
 * usado para longest-prefix match contra los tags @cp,
 * eliminando el bug de regex `/^@cp:CP-([a-zA-Z0-9_]+)-/` que truncaba
 * "admin-organization" a "admin".
 */
function loadKnownModules(designDir) {
  if (!fs.existsSync(designDir)) return [];
  return fs.readdirSync(designDir)
    .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
    .map(f => f.replace(/^cp_modulo_/, '').replace(/\.json$/, ''));
}

const TOOLS_DIR = __dirname;

// ─── Args parsing ────────────────────────────────────────────────────────────

function parseArgs() {
  const out = {
    runId:        null,
    tags:         '[]',
    evidenceMode: 'failures_only',
    batchSize:    3,
    mode:         'custom',
    viewport:     null,  // --viewport "mobile,tablet" | "mobile" para filtro selectivo (Phase 5)
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--run-id')               out.runId        = next();
    else if (a === '--tags')            out.tags         = next();
    else if (a === '--evidence-mode')   out.evidenceMode = next();
    else if (a === '--batch-size')      out.batchSize    = parseInt(next(), 10);
    else if (a === '--mode')            out.mode         = next();
    else if (a === '--viewport')        out.viewport     = next();
  }
  if (!out.runId) die('--run-id es obligatorio');
  return out;
}

function die(msg, code = 1) {
  process.stderr.write(`[preflight-continuation] FATAL: ${msg}\n`);
  process.exit(code);
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

// ─── Spawn helper (Promise + parallel) ───────────────────────────────────────

function runScript(scriptPath, scriptArgs, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: process.cwd(),
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    child.on('error', err => {
      resolve({ exitCode: -1, stdout, stderr: stderr + `\n[spawn-error] ${err.message}`, error: err });
    });
    child.on('close', code => {
      resolve({ exitCode: code, stdout, stderr });
    });
    if (opts.timeoutMs) {
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
      }, opts.timeoutMs);
    }
  });
}

// ─── Tag → module_id derivation (P15/P23: NO ls design/) ─────────────────────

/**
 * Acepta: @cp:CP-{module_id}-{suffix} → extrae module_id correctamente,
 * incluso para módulos con guiones (admin-organization, email-config).
 *
 * antes: regex `/^@cp:CP-([a-zA-Z0-9_]+)-/` truncaba
 * `admin-organization` a `admin`, generando falsos "multiple_modules".
 *
 * Estrategia híbrida (igual que P99b en exec-preflight.js):
 *   1. Si knownModules tiene contenido → longest-prefix match (preciso).
 *   2. Si no matchea → fallback regex heurística (módulos single-word: auth, M1).
 */
function deriveModuleAndCps(tagsArr, knownModules) {
  const cpPrefix = '@cp:CP-';
  const moduleSet = new Set();
  const cpIds = [];
  for (const tag of tagsArr) {
    const tagStr = String(tag);
    if (!tagStr.startsWith(cpPrefix)) continue; // ignora otros tags (ej: @smoke)
    const cpId = tagStr.slice('@cp:'.length); // "CP-..."
    // 1) Longest-prefix match contra módulos del run
    let moduleId = extractModuleIdFromKnownModules(cpId, knownModules);
    // 2) Fallback heurístico (single-word modules)
    if (!moduleId) {
      const m = cpId.match(/^CP-([a-zA-Z0-9_]+)-/);
      if (m) moduleId = m[1];
    }
    if (!moduleId) continue;
    moduleSet.add(moduleId);
    cpIds.push(cpId);
  }
  if (moduleSet.size === 0) {
    return { error: 'no_cp_tags', module_id: null, cp_ids: [] };
  }
  if (moduleSet.size > 1) {
    return { error: 'multiple_modules', module_ids: Array.from(moduleSet), cp_ids: cpIds };
  }
  return { module_id: Array.from(moduleSet)[0], cp_ids: cpIds };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const args = parseArgs();
  const ROOT = toForwardSlashes(process.cwd());

  // 1. SYNC inicial — paths + reads
  const RUN_FOLDER = path.join(ROOT, 'docs', 'testing', 'atf-web', args.runId);
  if (!fs.existsSync(RUN_FOLDER)) {
    die(`run_folder no existe: ${RUN_FOLDER}. ¿run_id válido?`);
  }
  const SC_PATH       = path.join(RUN_FOLDER, 'session_context.json');
  const DESIGN_DIR    = path.join(RUN_FOLDER, 'design');
  const EXECUTION_DIR = path.join(RUN_FOLDER, 'execution');
  const TMP_DIR       = path.join(RUN_FOLDER, '.tmp');
  const EXEC_CTX_PATH = path.join(TMP_DIR, 'exec_context.json');
  const MFA_PRE_PATH  = path.join(TMP_DIR, 'mfa_preflight.json');
  const CHECKPOINT_PATH = path.join(RUN_FOLDER, 'checkpoint.json');

  fs.mkdirSync(TMP_DIR, { recursive: true });

  // appweb.yaml
  const APP_YAML = path.join(ROOT, 'docs/testing/atf-web/config/appweb.yaml');
  if (!fs.existsSync(APP_YAML)) die(`appweb.yaml no encontrado en ${APP_YAML}`);
  let appCfg;
  try { appCfg = readYaml(APP_YAML); } catch (e) { die(`appweb.yaml inválido: ${e.message}`); }

  const appName = appCfg.app && appCfg.app.name;
  const appUrl  = appCfg.app && appCfg.app.url;
  const appEnv  = appCfg.app && appCfg.app.environment;
  if (!appName) die('appweb.yaml → app.name ausente');

  // Responsive config — fail fast antes de spawnear child processes
  const responsiveCfg = loadResponsiveConfig(appCfg);
  if (responsiveCfg.errors.length > 0) {
    die(`appweb.yaml → responsive config inválida:\n${responsiveCfg.errors.map(e => `  - ${e}`).join('\n')}`);
  }
  for (const w of responsiveCfg.warnings) {
    process.stderr.write(`[preflight-continuation] WARN: ${w}\n`);
  }

  // session_context.json (puede no existir si run nuevo, pero en CONTINUATION debe existir)
  if (!fs.existsSync(SC_PATH)) {
    die(`session_context.json no existe en ${SC_PATH}. ¿es un run válido?`);
  }

  // 2. SYNC — GUARD cp_modulo_*.json
  let designStatus = 'DESIGN_MISSING';
  if (fs.existsSync(DESIGN_DIR)) {
    const found = fs.readdirSync(DESIGN_DIR).some(f => /^cp_modulo_.*\.json$/.test(f));
    if (found) designStatus = 'DESIGN_OK';
  }
  if (designStatus === 'DESIGN_MISSING') {
    die(`No se encontraron CPs diseñados en ${DESIGN_DIR}/. Ejecuta /asdd:qa-web-design antes de continuar con fase_2c.`);
  }

  // 3. SYNC — derivar module_id + cp_ids desde tags let tagsArr;
  try { tagsArr = JSON.parse(args.tags); }
  catch { die(`--tags debe ser JSON array válido. Recibido: ${args.tags}`); }
  if (!Array.isArray(tagsArr)) die('--tags debe ser un JSON array');

  // P99c — pre-cargar known modules para longest-prefix match (módulos multi-palabra)
  const knownModules = loadKnownModules(DESIGN_DIR);

  const derived = deriveModuleAndCps(tagsArr, knownModules);
  if (derived.error === 'no_cp_tags') {
    die(`Ningún tag @cp:CP-* en --tags. Recibido: ${args.tags}. CONTINUATION SHORTCUT requiere tags @cp:CP-*.`);
  }
  if (derived.error === 'multiple_modules') {
    die(`Tags @cp apuntan a múltiples módulos: ${derived.module_ids.join(', ')}. CONTINUATION SHORTCUT solo soporta 1 módulo por invocación. ` +
        `Si necesitas ejecutar CPs cross-módulo, usa /asdd:qa-web-exec directo (que sí soporta multi-módulo via exec-preflight.js) ` +
        `o lanza CONTINUATION 1 vez por módulo.`);
  }
  const moduleId = derived.module_id;
  let cpIds      = derived.cp_ids;
  const cpModuloFile = path.join(DESIGN_DIR, `cp_modulo_${moduleId}.json`);
  if (!fs.existsSync(cpModuloFile)) {
    die(`cp_modulo_${moduleId}.json no existe en ${DESIGN_DIR}/. ¿el módulo derivado del tag (${moduleId}) es correcto?`);
  }

  // 3b. SYNC — viewport filter (Phase 5: @viewport:{name} tag + --viewport flag)
  // Fuentes: (1) --viewport CLI flag, (2) @viewport:name tags en --tags, (3) checkpoint resume.
  // Prioridad: CLI > tags. Checkpoint solo actúa cuando no hay filter explícito.
  let viewportFilter = [];
  if (responsiveCfg.enabled) {
    const configuredVpNames = new Set(responsiveCfg.viewports.map(v => v.name));

    // -- CLI flag (--viewport "mobile,tablet")
    if (args.viewport) {
      const cliVps = args.viewport.split(',').map(v => v.trim()).filter(Boolean);
      const invalid = cliVps.filter(v => !configuredVpNames.has(v));
      if (invalid.length > 0) {
        die(`--viewport "${invalid.join(',')}" no configurado(s) en appweb.yaml. ` +
            `Configurados: ${[...configuredVpNames].join(', ')}`);
      }
      viewportFilter = cliVps;
    }

    // -- @viewport:name tags (solo cuando no hay --viewport CLI)
    if (viewportFilter.length === 0) {
      const tagVps = tagsArr
        .filter(t => String(t).startsWith('@viewport:'))
        .map(t => String(t).slice('@viewport:'.length).trim())
        .filter(Boolean);
      const badTagVps = tagVps.filter(v => !configuredVpNames.has(v));
      if (badTagVps.length > 0) {
        die(`@viewport tag(s) "${badTagVps.join(',')}" no configurado(s) en appweb.yaml. ` +
            `Configurados: ${[...configuredVpNames].join(', ')}`);
      }
      viewportFilter = tagVps;
    }
  }

  // 4. SYNC — checkpoint.json (opcional)
  let checkpoint = null;
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try { checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')); }
    catch (_) { checkpoint = { _parse_error: true }; }
  }

  // 4b. SYNC — Checkpoint resume para runs responsive (Phase 5)
  // Solo aplica si: responsive habilitado + checkpoint tiene responsive_progress
  //                + no hay viewport_filter explícito del usuario.
  // Lógica: para cada CP target, determinar qué viewports ya están completos.
  //   - CP totalmente completo → excluir del batch (skip).
  //   - CP parcialmente completo → mantener en batch; derivar viewport_filter auto
  //     (unión de viewports pendientes de TODOS los CPs parciales).
  //   - Sin checkpoint → sin cambios.
  let checkpointSkipped = [];
  if (responsiveCfg.enabled && checkpoint?.responsive_progress && viewportFilter.length === 0) {
    const configuredVpNames = responsiveCfg.viewports.map(v => v.name);
    const prog = checkpoint.responsive_progress; // { [cpId]: { mobile: true, tablet: false, ... } }
    const toSkip  = [];
    const partialPendingVps = new Set();

    for (const cpId of cpIds) {
      const cpProg = prog[cpId] || {};
      const doneVps    = configuredVpNames.filter(vp => cpProg[vp] === true);
      const pendingVps = configuredVpNames.filter(vp => !cpProg[vp]);

      if (pendingVps.length === 0) {
        // Todos los viewports completos → saltear este CP
        toSkip.push(cpId);
      } else if (doneVps.length > 0) {
        // Parcialmente completo → agregar pendientes al auto-filter
        pendingVps.forEach(v => partialPendingVps.add(v));
      }
      // Sin ningún viewport completo → sin cambios (run normal)
    }

    if (toSkip.length > 0) {
      cpIds = cpIds.filter(id => !toSkip.includes(id));
      checkpointSkipped = toSkip;
      process.stderr.write(
        `[preflight-continuation] checkpoint resume: ${toSkip.length} CP(s) ya completos → ` +
        `skipping ${toSkip.join(', ')}\n`
      );
    }

    // Auto-viewport_filter solo si TODOS los CPs restantes son parciales (no hay CPs sin progreso)
    if (cpIds.length > 0 && partialPendingVps.size > 0 && partialPendingVps.size < configuredVpNames.length) {
      viewportFilter = Array.from(partialPendingVps);
      process.stderr.write(
        `[preflight-continuation] checkpoint resume: viewport_filter auto-derivado → ` +
        `[${viewportFilter.join(', ')}] (viewports pendientes)\n`
      );
    }

    if (cpIds.length === 0) {
      // Todos los CPs del batch ya están completos → exit limpio
      process.stderr.write(`[preflight-continuation] checkpoint resume: todos los CPs ya completos — nada que ejecutar\n`);
      const allDone = {
        ok: true, run_id: args.runId, all_cps_already_complete: true,
        checkpoint_skipped: checkpointSkipped,
        run_started_at: new Date().toISOString(),
      };
      process.stdout.write(JSON.stringify(allDone, null, 2) + '\n');
      process.exit(0);
    }
  }

  // 5. PARALLEL — spawn 4 child_process
  const tasks = [];

  // (a) refresh-session-context
  tasks.push(runScript(path.join(TOOLS_DIR, 'refresh-session-context.js'), [
    '--run-id', args.runId,
    '--tags', args.tags,
    '--evidence-mode', args.evidenceMode,
    '--batch-size', String(args.batchSize),
    '--mode', args.mode,
    '--is-continuation', 'true',
  ], { timeoutMs: 30000 }).then(r => ({ name: 'refresh', ...r })));

  // (b) knowledge-excerpt --cache
  tasks.push(runScript(path.join(TOOLS_DIR, 'knowledge-excerpt.js'), [
    `--run-id=${args.runId}`,
    `--output=${toForwardSlashes(EXEC_CTX_PATH)}`,
    '--cache',
  ], { timeoutMs: 60000 }).then(r => ({ name: 'knowledge-excerpt', ...r })));

  // (c) restore-mfa-session (dry-run)
  tasks.push(runScript(path.join(TOOLS_DIR, 'restore-mfa-session.js'), [
    '--run-folder', RUN_FOLDER,
  ], { timeoutMs: 30000 }).then(r => ({ name: 'mfa-preflight', ...r })));

  // (d) reset-cp-artifacts
  // --design-dir es OBLIGATORIO para detectar correctamente módulos multi-palabra
  // (admin-organization, email-config) en la limpieza de slugs legacy. Sin él,
  // el script cae a heurística split-by-dash y omite la limpieza de carpetas
  // contaminantes de runs anteriores con slug truncado.
  if (cpIds.length > 0) {
    const resetArgs = [
      '--execution-dir', EXECUTION_DIR,
      '--design-dir',    DESIGN_DIR,
      '--cp-ids', JSON.stringify(cpIds),
    ];
    // Si hay viewport_filter: limpiar solo la subcarpeta del viewport (REGLA 29)
    // para preservar resultados de viewports que NO se van a re-ejecutar.
    if (responsiveCfg.enabled && viewportFilter.length === 1) {
      resetArgs.push('--viewport', viewportFilter[0]);
    }
    // viewport_filter con múltiples viewports: no existe --viewport multi en v1 → reset completo
    // (accept la perdida de los resultados de los otros viewports para garantizar consistencia).
    tasks.push(runScript(path.join(TOOLS_DIR, 'reset-cp-artifacts.js'), resetArgs,
      { timeoutMs: 30000 }).then(r => ({ name: 'reset-artifacts', ...r })));
  }

  const results = await Promise.all(tasks);
  // Validar resultados
  const refresh = results.find(r => r.name === 'refresh');
  const knex    = results.find(r => r.name === 'knowledge-excerpt');
  const mfa     = results.find(r => r.name === 'mfa-preflight');
  const reset   = results.find(r => r.name === 'reset-artifacts');

  if (refresh.exitCode !== 0) die(`refresh-session-context falló (exit ${refresh.exitCode}): ${refresh.stderr || refresh.stdout}`);
  if (knex.exitCode !== 0)    die(`knowledge-excerpt falló (exit ${knex.exitCode}): ${knex.stderr || knex.stdout}`);

  // MFA: parsear stdout (último JSON object emitido por restore-mfa-session)
  // El script usa emit('ready', ...) que llega al stdout en formato JSON pretty-printed
  let mfaStatus = 'parse_error';
  let mfaReason = null;
  let mfaActionRequired = null;
  try {
    // restore-mfa-session imprime { status: '...', ... } como JSON
    // Buscamos el último JSON válido en stdout
    const stdoutTrim = (mfa.stdout || '').trim();
    if (stdoutTrim) {
      // extraer último bloque JSON balanceado
      const lastBraceClose = stdoutTrim.lastIndexOf('}');
      let depth = 0;
      let startIdx = -1;
      for (let i = lastBraceClose; i >= 0; i--) {
        const ch = stdoutTrim[i];
        if (ch === '}') depth++;
        else if (ch === '{') {
          depth--;
          if (depth === 0) { startIdx = i; break; }
        }
      }
      if (startIdx >= 0) {
        const jsonStr = stdoutTrim.substring(startIdx, lastBraceClose + 1);
        const parsed = JSON.parse(jsonStr);
        mfaStatus = parsed.status || 'parse_error';
        mfaReason = parsed.reason || null;
        mfaActionRequired = parsed.action_required || null;
        // Persistir mfa_preflight.json (compat con consumidores legacy)
        fs.writeFileSync(MFA_PRE_PATH, JSON.stringify(parsed, null, 2), 'utf8');
      }
    }
  } catch (_) { mfaStatus = 'parse_error'; }

  // 6. SYNC final — inyectar cp_targets_resolved[] en exec_context.json
  if (!fs.existsSync(EXEC_CTX_PATH)) {
    die(`exec_context.json no fue generado por knowledge-excerpt en ${EXEC_CTX_PATH}`);
  }
  let ctx;
  try { ctx = JSON.parse(fs.readFileSync(EXEC_CTX_PATH, 'utf8')); }
  catch (e) { die(`exec_context.json corrupto: ${e.message}`); }

  let cpModuloData;
  try { cpModuloData = JSON.parse(fs.readFileSync(cpModuloFile, 'utf8')); }
  catch (e) { die(`${cpModuloFile} corrupto: ${e.message}`); }

  const idsSet = new Set(cpIds);
  const resolved = (cpModuloData.test_cases || []).filter(c => idsSet.has(c.cp_id));
  if (resolved.length !== cpIds.length) {
    const found = new Set(resolved.map(c => c.cp_id));
    const missing = cpIds.filter(id => !found.has(id));
    die(`Algunos cp_ids no se encontraron en ${cpModuloFile}: ${missing.join(', ')}`);
  }
  ctx.cp_targets_resolved = resolved;
  ctx.responsive = {
    enabled:         responsiveCfg.enabled,
    execution_mode:  responsiveCfg.execution_mode,
    result_policy:   responsiveCfg.result_policy,
    mcp_capability:  responsiveCfg.mcp_capability,
    viewports:       responsiveCfg.viewports,
    // viewport_filter: si no-vacío, el executor solo itera estos viewports (Phase 5).
    // [] = sin filtro = ejecutar todos los viewports configurados.
    viewport_filter: viewportFilter,
  };
  fs.writeFileSync(EXEC_CTX_PATH, JSON.stringify(ctx, null, 2), 'utf8');

  // 6.5. SYNC — Crear carpetas de execution por cp_id
  // El executor antes hacía esto con `Bash node -e ...` inline, anti-patrón
  // prosa-vs-código (mismo bug que P4/P33). Lo hace ahora el preflight,
  // determinístico, sin escapes Windows.
  // — usar `cpIdToFolderFromKnownModules` para módulos multi-palabra
  // (admin-organization, email-config). El `knownModules` se derivó arriba.
  // Con viewport_filter: solo crear subcarpetas de los viewports que se van a ejecutar
  // (los demás ya existen del run previo — REGLA 29).
  const vpFoldersToCreate = responsiveCfg.enabled
    ? (viewportFilter.length > 0
        ? responsiveCfg.viewports.filter(v => viewportFilter.includes(v.name))
        : responsiveCfg.viewports)
    : [];
  for (const cp of resolved) {
    const slug = cpIdToFolderFromKnownModules(cp.cp_id, knownModules);
    const cpDir = path.join(EXECUTION_DIR, moduleId, slug);
    fs.mkdirSync(cpDir, { recursive: true });
    for (const vp of vpFoldersToCreate) {
      fs.mkdirSync(path.join(cpDir, vp.name), { recursive: true });
    }
  }

  // 7. Output consolidado
  const summary = {
    ok: true,
    run_id: args.runId,
    run_folder: toForwardSlashes(RUN_FOLDER),
    design_dir: toForwardSlashes(DESIGN_DIR),
    execution_dir: toForwardSlashes(EXECUTION_DIR),
    app_name: appName,
    app_url: appUrl || null,
    environment: appEnv || null,
    module_id: moduleId,
    cp_targets: cpIds,
    cp_targets_resolved_count: resolved.length,
    responsive_enabled:      responsiveCfg.enabled,
    viewport_count:          responsiveCfg.viewports.length,
    viewport_filter:         viewportFilter,            // [] = sin filtro; Phase 5
    checkpoint_skipped:      checkpointSkipped,         // CPs saltados por resume; Phase 5
    total_execution_units:   totalExecutionUnits(
      resolved.length,
      responsiveCfg.enabled
        ? (viewportFilter.length > 0 ? viewportFilter.length : responsiveCfg.viewports.length)
        : 1
    ),
    evidence_mode: args.evidenceMode,
    batch_size: args.batchSize,
    mode: args.mode,
    mfa_status: mfaStatus,
    mfa_reason: mfaReason,
    mfa_action_required: mfaActionRequired,
    design_status: designStatus,
    cp_modulo_file: toForwardSlashes(path.relative(ROOT, cpModuloFile)),
    checkpoint,
    exec_context_path: toForwardSlashes(path.relative(ROOT, EXEC_CTX_PATH)),
    run_started_at: new Date().toISOString(),
  };

  process.stderr.write(`[preflight-continuation] total: ${Date.now() - t0} ms\n`);

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  // Exit 2 si MFA needs_reauth (señal al orchestrator de NO spawnear executor)
  if (mfaStatus === 'needs_reauth' || mfaStatus === 'parse_error') {
    process.exit(2);
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[preflight-continuation] UNCAUGHT: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
