#!/usr/bin/env node
/**
 * ATF — validate-session.js
 *
 * Valida la estructura y coherencia de session_context.json antes de lanzar
 * agentes del pipeline. Detecta corrupción, campos faltantes y referencias
 * inválidas (paths inexistentes, credenciales faltantes) de forma temprana.
 *
 * Uso:
 *   node .claude/tools/validate-session.js <run_id>
 *   node .claude/tools/validate-session.js MiApp-v1.0-20260101-0900
 *
 * Salida:
 *   Exit 0  → session_context.json válido, pipeline puede arrancar
 *   Exit 1  → errores críticos encontrados (lista en stdout)
 *   Exit 2  → advertencias solamente (pipeline puede arrancar, pero revisar)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT  = path.join(__dirname, '..', '..');
const OUTPUT_BASE   = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');
const CONFIG_DIR    = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'config');
const CREDS_PATH    = path.join(CONFIG_DIR, 'credentials.yaml');

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const errors   = [];
const warnings = [];

function err(msg)  { errors.push(`  ❌  ${msg}`); }
function warn(msg) { warnings.push(`  ⚠️   ${msg}`); }
function ok(msg)   { console.log(`  ✅  ${msg}`); }

const { readJSONStrict: readJSON } = require('./lib/json-utils');

function exists(p) {
  return fs.existsSync(p);
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// ─── VALIDADORES OPCIONALES (REGLA 7 + Protocolo MFA) ────────────────────────
//
// Cada validador retorna { errors[], warnings[], oks[] } con mensajes listos
// para consumir por `main()`. Estructura adoptada tras T2.4 para aislar
// validaciones de features opcionales sin cargar main() con if/else lineales.
// Rule of Three: cuando aparezca un 3er validador opcional, extraer a módulos
// separados en `.claude/tools/lib/`.

function validateMfa(ctx, opts) {
  const out = { errors: [], warnings: [], oks: [] };
  const { authPhasesActive, defaultEnv } = opts || {};
  const mfaType = ctx.mfa_type || '';
  const sessionStateFile = ctx.session_state_file || '';

  if (!mfaType) return out; // feature off — silencio

  if (!sessionStateFile) {
    out.errors.push(`auth.mfa_type="${mfaType}" configurado pero session_state_file está vacío — completar en appweb.yaml`);
    return out;
  }

  const absSessionFile = path.isAbsolute(sessionStateFile)
    ? sessionStateFile
    : path.join(PROJECT_ROOT, sessionStateFile);

  if (!exists(absSessionFile)) {
    const env = defaultEnv || 'qa';
    if (authPhasesActive) {
      out.errors.push(`mfa_type="${mfaType}" pero session_state_file no existe en disco: ${sessionStateFile}. Ejecutar: node .claude/tools/save-session.js --env ${env}`);
    } else {
      out.warnings.push(`mfa_type="${mfaType}" y session_state_file no existe, pero ninguna fase con auth está activa — no se requiere en esta ejecución`);
    }
  } else {
    out.oks.push(`MFA activo (${mfaType}) — session_state_file presente`);
  }

  return out;
}

function validateDb(ctx) {
  const out = { errors: [], warnings: [], oks: [] };
  const dbConfig = ctx.db_config || null;

  if (!dbConfig) return out; // feature off — silencio

  const registryPath = dbConfig.registry_path || '';
  const absRegistry = registryPath
    ? (path.isAbsolute(registryPath) ? registryPath : path.join(PROJECT_ROOT, registryPath))
    : '';

  if (!registryPath || !exists(absRegistry)) {
    out.warnings.push(`db_config resuelto pero registry_path no existe en disco: ${registryPath || '(vacío)'}`);
    return out;
  }

  // Sanity check: driver conocido (solo mssql implementado; otros bajo demanda)
  const driver = dbConfig.driver || 'mssql';
  if (driver !== 'mssql') {
    out.warnings.push(`db_config.driver="${driver}" requiere adapter en .claude/tools/db-adapters/${driver}-adapter.js (implementar bajo demanda)`);
  }

  out.oks.push(`Validación BD activa — driver: ${driver}, registry: ${registryPath}`);
  return out;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main(runId) {
  const runDir     = path.join(OUTPUT_BASE, runId);
  const ctxPath    = path.join(runDir, 'session_context.json');

  console.log(`\n⬡  ATF — Validación de session_context.json`);
  console.log(`   run_id : ${runId}`);
  console.log(`   archivo: ${ctxPath}\n`);

  // ── 1. Existencia del run_folder ─────────────────────────────────────────
  if (!exists(runDir) || !isDir(runDir)) {
    err(`run_folder no existe: ${runDir}`);
    printSummary();
    process.exit(1);
  }
  ok(`run_folder existe: ${runDir}`);

  // ── 2. Existencia y parseo de session_context.json ───────────────────────
  if (!exists(ctxPath)) {
    err(`session_context.json no encontrado en ${runDir}`);
    printSummary();
    process.exit(1);
  }

  let ctx;
  try {
    ctx = readJSON(ctxPath);
  } catch (e) {
    err(`session_context.json tiene JSON inválido: ${e.message}`);
    printSummary();
    process.exit(1);
  }

  if (!ctx || typeof ctx !== 'object') {
    err('session_context.json está vacío o no es un objeto JSON válido');
    printSummary();
    process.exit(1);
  }
  ok('session_context.json parseable como JSON válido');

  // ── 3. Campos de identidad obligatorios ──────────────────────────────────
  const ctxRunId = ctx.run_id;
  if (!ctxRunId) {
    err('Campo "run_id" ausente o vacío');
  } else if (ctxRunId !== runId) {
    err(`"run_id" en session_context (${ctxRunId}) no coincide con el run_id del directorio (${runId})`);
  } else {
    ok(`run_id consistente: ${ctxRunId}`);
  }

  const runFolder = ctx.run_folder;
  if (!runFolder) {
    err('Campo "run_folder" ausente');
  } else {
    // Aceptar tanto ruta absoluta como relativa al PROJECT_ROOT
    const absRunFolder = path.isAbsolute(runFolder)
      ? runFolder
      : path.join(PROJECT_ROOT, runFolder);
    if (!exists(absRunFolder)) {
      err(`"run_folder" apunta a un path inexistente: ${runFolder}`);
    } else {
      ok(`run_folder path válido: ${runFolder}`);
    }
  }

  // ── 3b. Validación de modo continuación (is_continuation) ─────────────────
  const isContinuation = ctx.is_continuation === true || ctx.is_continuation === 'true'
    || ctx.continue_run_id; // backwards compat con session_context.json pre-v2.1
  if (isContinuation) {
    const runId = ctx.run_id || '';
    const continueDir = runId ? path.join(OUTPUT_BASE, runId) : '';
    if (!continueDir || !exists(continueDir) || !isDir(continueDir)) {
      err(`is_continuation=true pero la carpeta del run no existe: ${continueDir || '(run_id vacío)'}`);
    } else {
      const continueCtx = path.join(continueDir, 'session_context.json');
      if (!exists(continueCtx)) {
        warn(`is_continuation=true — carpeta ${runId} existe pero no tiene session_context.json`);
      } else {
        ok(`Modo continuación válido: ${runId} (carpeta y session_context.json existen)`);
      }
    }
  }

  // ── 3d. Validación de rerun_targets (si aplica) ────────────────────────────
  const rerunTargets = ctx.rerun_targets || null;
  if (rerunTargets !== null && typeof rerunTargets === 'object') {
    let rerunValid = true;

    if (!Array.isArray(rerunTargets.cp_ids)) {
      err('rerun_targets.cp_ids debe ser un array de strings');
      rerunValid = false;
    } else if (rerunTargets.cp_ids.length === 0) {
      warn('rerun_targets.cp_ids está vacío — rerun_targets no tendrá efecto');
    }

    if (!Array.isArray(rerunTargets.module_ids_affected)) {
      err('rerun_targets.module_ids_affected debe ser un array de strings');
      rerunValid = false;
    }

    if (typeof rerunTargets.cleanup_completed !== 'boolean') {
      warn('rerun_targets.cleanup_completed debería ser boolean');
    } else if (!rerunTargets.cleanup_completed && Array.isArray(rerunTargets.cp_ids) && rerunTargets.cp_ids.length > 0) {
      warn('rerun_targets.cleanup_completed=false con CPs pendientes — el orquestador no completó el cleanup antes de salir');
    }

    if (rerunValid && Array.isArray(rerunTargets.cp_ids) && rerunTargets.cp_ids.length > 0) {
      ok(`rerun_targets válido — ${rerunTargets.cp_ids.length} CP(s) en ${(rerunTargets.module_ids_affected || []).length} módulo(s), reason: ${rerunTargets.reason || 'N/A'}`);
    }
  }

  // ── 4. Configuración de la app ───────────────────────────────────────────
  const app     = ctx.app || {};
  const appUrl  = app.url || ctx.app_url || '';
  const appName = app.name || ctx.app_name || '';

  if (!appUrl) {
    err('app.url ausente o vacío — el pipeline no puede navegar sin URL destino');
  } else if (!/^https?:\/\/.+/.test(appUrl)) {
    warn(`app.url no parece una URL HTTP válida: "${appUrl}"`);
  } else {
    ok(`app.url: ${appUrl}`);
  }

  if (!appName) {
    warn('app.name ausente — el run_id podría no coincidir con la app real');
  } else {
    ok(`app.name: ${appName}`);
  }

  // ── 5. pipeline_switches — tipos boolean ─────────────────────────────────
  const switches = ctx.pipeline_switches || {};
  const knownSwitches = ['fase_0','fase_1','fase_1c','fase_2c','fase_1d_e2e_fills'];
  let switchesOk = true;

  for (const sw of knownSwitches) {
    if (sw in switches) {
      if (typeof switches[sw] !== 'boolean') {
        err(`pipeline_switches.${sw} debe ser boolean, encontrado: ${JSON.stringify(switches[sw])}`);
        switchesOk = false;
      }
    }
  }

  // Detectar claves desconocidas en pipeline_switches
  const unknownKeys = Object.keys(switches).filter(k => !knownSwitches.includes(k));
  if (unknownKeys.length > 0) {
    warn(`pipeline_switches contiene claves desconocidas: ${unknownKeys.join(', ')}`);
  }

  if (switchesOk && Object.keys(switches).length > 0) {
    ok(`pipeline_switches válidos: ${JSON.stringify(switches)}`);
  } else if (Object.keys(switches).length === 0) {
    warn('pipeline_switches ausente o vacío — todas las fases se ejecutarán por defecto');
  }

  // ── 7. instance_timeout_min ───────────────────────────────────────────────
  const timeout = ctx.instance_timeout_min;
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || timeout < 1 || timeout > 240) {
      warn(`instance_timeout_min fuera de rango razonable: ${timeout} (esperado: 1–240 min)`);
    } else {
      ok(`instance_timeout_min: ${timeout} min`);
    }
  }

  // ── 8. Directorios de output referenciados ───────────────────────────────
  const dirFields = {
    diagnostics_dir: ctx.diagnostics_dir,
    design_dir:      ctx.design_dir,
    execution_dir:   ctx.execution_dir,
    strategy_dir:    ctx.strategy_dir,
    reports_dir:     ctx.reports_dir,
  };

  for (const [field, val] of Object.entries(dirFields)) {
    if (!val) continue; // opcional — no error si ausente
    const absPath = path.isAbsolute(val)
      ? val
      : path.join(PROJECT_ROOT, val);
    // Los dirs pueden no existir aún (se crean durante el pipeline) — solo validar formato
    if (typeof val !== 'string' || val.trim() === '') {
      err(`${field} tiene valor inválido: ${JSON.stringify(val)}`);
    }
    // Verificar que el path no apunte fuera del proyecto (normalizar case y separadores)
    const norm    = absPath.toLowerCase().replace(/\\/g, '/');
    const normOut = OUTPUT_BASE.toLowerCase().replace(/\\/g, '/');
    const normPrj = PROJECT_ROOT.toLowerCase().replace(/\\/g, '/');
    if (!norm.startsWith(normOut) && !norm.startsWith(normPrj)) {
      warn(`${field} apunta fuera del proyecto: ${val}`);
    }
  }

  if (Object.values(dirFields).some(v => v)) {
    ok('Rutas de directorios con formato válido');
  }

  // ── 9. Credenciales si requires_auth ─────────────────────────────────────
  // Validación diferida: solo es error crítico si hay fases activas que necesitan auth.
  // Fase con browser+login: fase_2c (executor).
  const AUTH_PHASES = ['fase_2c'];
  const authPhasesActive = AUTH_PHASES.some(p => switches[p] === true);

  const requiresAuth = ctx.requires_auth
    ?? ctx.auth?.requires_auth
    ?? (app.auth && app.auth.requires_auth);

  if (requiresAuth === true || requiresAuth === 'true') {
    // B5 — Solo verificación de existencia. El parseo/validación real de
    // estructura y ambiente lo hace sofka-asdd-atf-web-auth-handler en tiempo de login.
    if (!exists(CREDS_PATH)) {
      if (authPhasesActive) {
        err(`requires_auth=true pero credentials.yaml no encontrado en: ${CREDS_PATH}`);
      } else {
        warn(`requires_auth=true y credentials.yaml no existe, pero ninguna fase con auth está activa (${AUTH_PHASES.join(', ')}) — no se requiere en esta ejecución`);
      }
    } else {
      ok(`credentials.yaml presente en ${path.basename(CREDS_PATH)}`);
    }
  } else {
    ok('requires_auth=false — credenciales no requeridas');
  }

  // ── 9b. MFA / storageState (opcional) ──────────────────────────────────
  {
    const r = validateMfa(ctx, { authPhasesActive, defaultEnv: app.environment || ctx.app_environment || 'qa' });
    r.errors.forEach(m => err(m));
    r.warnings.forEach(m => warn(m));
    r.oks.forEach(m => ok(m));
  }

  // ── 9c. Validación BD (opcional — REGLA 7) ──────────────────────────────
  {
    const r = validateDb(ctx);
    r.errors.forEach(m => err(m));
    r.warnings.forEach(m => warn(m));
    r.oks.forEach(m => ok(m));
  }

  // ── 10. checkpoint.json — advertir si está marcado como completo ──────────
  const cpPath = path.join(runDir, 'checkpoint.json');
  if (exists(cpPath)) {
    let cp;
    try { cp = JSON.parse(fs.readFileSync(cpPath, 'utf-8')); } catch { cp = null; }
    if (cp && cp.pipeline_complete === true) {
      warn('checkpoint.json existe con pipeline_complete=true — el Orchestrator lo ignorará e ' +
           'iniciará fresh. Si deseas reanudar un run incompleto, verifica que sea el run_id correcto.');
    } else if (cp && cp.next_phase) {
      ok(`checkpoint.json detectado — pipeline reanudará desde fase: ${cp.next_phase}`);
    }
  }

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  printSummary();

  if (errors.length > 0) process.exit(1);
  if (warnings.length > 0) process.exit(2);
  process.exit(0);
}

function printSummary() {
  console.log('');
  if (warnings.length > 0) {
    console.log('─── Advertencias ───────────────────────────────────────');
    warnings.forEach(w => console.log(w));
  }
  if (errors.length > 0) {
    console.log('─── Errores críticos ────────────────────────────────────');
    errors.forEach(e => console.log(e));
    console.log('');
    console.log('❌  Validación FALLIDA — corregir errores antes de lanzar el pipeline.');
  } else if (warnings.length > 0) {
    console.log('');
    console.log('⚠️   Validación con advertencias — el pipeline puede arrancar, pero revisar los items marcados.');
  } else {
    console.log('');
    console.log('✅  session_context.json válido — el pipeline puede arrancar.');
  }
  console.log('');
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const runIdArg = args.find(a => !a.startsWith('--'));

if (!runIdArg) {
  // Si no se pasa run_id, intentar usar el más reciente
  if (!fs.existsSync(OUTPUT_BASE)) {
    console.error(`❌  No existe la carpeta de outputs: ${OUTPUT_BASE}`);
    process.exit(1);
  }
  const runs = fs.readdirSync(OUTPUT_BASE)
    .filter(d => { try { return fs.statSync(path.join(OUTPUT_BASE, d)).isDirectory(); } catch { return false; } })
    .sort().reverse();
  if (!runs.length) {
    console.error('❌  No se encontró ningún run. Uso: node validate-session.js <run_id>');
    process.exit(1);
  }
  console.log(`ℹ️  run_id no especificado. Usando el más reciente: ${runs[0]}`);
  main(runs[0]);
} else {
  main(runIdArg);
}
