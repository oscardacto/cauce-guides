#!/usr/bin/env node
/**
 * run-backfill.js — orquestador del nav-learning-backfill post-batch.
 *
 *  — convierte el bash multilínea de `exec.md` PASO 4.6.5
 * en un script atómico. Razón: el bloque bash con `for` loops y escapes
 * Windows/MSYS era saltado/mal-ejecutado por el orquestador inline. Bug
 * observado run OrangeHRM: 16 selectores reales en interactions[]
 * pero 0 discoveries en nav_session (backfill no corrió).
 *
 * Doctrina prosa-vs-código aplicada: secuencia determinística → script atómico.
 *
 * Acciones:
 *   1. Detectar todos los `nav_session_*.json` en `{run_folder}/.tmp/`.
 *   2. Para cada session, derivar module_id (limpiando sufijo `_b{N}`).
 *   3. Iterar CPs en `execution/{module_id}/headless_results.json`.
 *   4. Por cada CP con `result.json` existente, invocar `nav-learning-backfill.js`.
 *   5. Acumular logs en `{run_folder}/.tmp/nav_backfill.log` (append).
 *   6. Devolver JSON consolidado a stdout.
 *
 * Uso:
 *   node run-backfill.js --run-folder=output/{run_id} --run-id={run_id}
 *
 * Output stdout (JSON):
 *   {
 *     "ok": true,
 *     "sessions_processed": N,
 *     "cps_processed": M,
 *     "total_backfilled": K,
 *     "total_skipped": L,
 *     "log_file": ".tmp/nav_backfill.log",
 *     "warnings": []
 *   }
 *
 * Exit:
 *   0 — siempre (no blocker; el backfill es red de seguridad).
 *   1 — error fatal (run_folder ausente, JSON corrupto).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_DIR = __dirname;
const NAV_BACKFILL = path.join(SCRIPT_DIR, 'nav-learning-backfill.js');
const { cpIdToFolderFromKnownModules } = require('./lib/cp-slug');

function die(msg) {
  process.stderr.write(`[run-backfill] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-folder=')) out.runFolder = a.slice('--run-folder='.length);
    else if (a.startsWith('--run-id=')) out.runId = a.slice('--run-id='.length);
  }
  if (!out.runFolder) die('--run-folder requerido');
  if (!out.runId)     die('--run-id requerido');
  return out;
}

const args = parseArgs();
const runFolder = path.isAbsolute(args.runFolder)
  ? args.runFolder
  : path.join(PROJECT_ROOT, args.runFolder);

if (!fs.existsSync(runFolder)) die(`run_folder no existe: ${runFolder}`);

const tmpDir = path.join(runFolder, '.tmp');
const executionDir = path.join(runFolder, 'execution');
const logFile = path.join(tmpDir, 'nav_backfill.log');

// 1) Detectar sessions
let sessionFiles = [];
if (fs.existsSync(tmpDir)) {
  sessionFiles = fs.readdirSync(tmpDir)
    .filter(f => /^nav_session_.*\.json$/.test(f))
    .map(f => path.join(tmpDir, f));
}

if (sessionFiles.length === 0) {
  process.stdout.write(JSON.stringify({
    ok: true,
    sessions_processed: 0,
    cps_processed: 0,
    total_backfilled: 0,
    total_skipped: 0,
    log_file: null,
    warnings: ['no nav_session_*.json files found — nav-learning likely disabled'],
  }, null, 2) + '\n');
  process.exit(0);
}

// 2) Derivar módulos del run para cpIdToFolderFromKnownModules
const knownModules = [];
const designDir = path.join(runFolder, 'design');
if (fs.existsSync(designDir)) {
  for (const f of fs.readdirSync(designDir)) {
    const m = f.match(/^cp_modulo_(.+)\.json$/);
    if (m) knownModules.push(m[1]);
  }
}

const stats = {
  ok: true,
  sessions_processed: 0,
  cps_processed: 0,
  total_backfilled: 0,
  total_skipped: 0,
  per_cp: [],
  warnings: [],
};

// Reset log file (append por CP dentro)
fs.writeFileSync(logFile, `# nav_backfill.log — ${new Date().toISOString()}\n`, 'utf8');

for (const sessionPath of sessionFiles) {
  let session;
  try { session = JSON.parse(fs.readFileSync(sessionPath, 'utf8')); }
  catch (e) {
    stats.warnings.push(`session ilegible: ${path.basename(sessionPath)} — ${e.message}`);
    continue;
  }

  // module_id viene del session file directamente
  let moduleId = session.module_id;
  if (!moduleId) {
    // Fallback: derivar del filename, limpiando sufijo _b{N}
    moduleId = path.basename(sessionPath, '.json')
      .replace(/^nav_session_/, '')
      .replace(/_b\d+$/, '');
  }

  const moduleDir = path.join(executionDir, moduleId);
  const headlessFile = path.join(moduleDir, 'headless_results.json');
  if (!fs.existsSync(headlessFile)) {
    stats.warnings.push(`headless_results.json ausente para módulo ${moduleId}`);
    continue;
  }

  let headless;
  try { headless = JSON.parse(fs.readFileSync(headlessFile, 'utf8')); }
  catch (e) {
    stats.warnings.push(`headless_results.json ilegible para ${moduleId}: ${e.message}`);
    continue;
  }

  const cps = headless.results || headless.scenarios || headless.cps || [];
  stats.sessions_processed++;

  for (const cpEntry of cps) {
    const cpId = cpEntry.cp_id;
    if (!cpId) continue;

    const slug = cpIdToFolderFromKnownModules(cpId, knownModules.length ? knownModules : [moduleId]);
    const resultFile = path.join(moduleDir, slug, 'result.json');
    if (!fs.existsSync(resultFile)) continue;

    // Solo backfillear CPs PASS o FAIL (los BLOCKED no tienen interactions valiosas)
    let resultStatus = '';
    try { resultStatus = JSON.parse(fs.readFileSync(resultFile, 'utf8')).status || ''; }
    catch (_) { /* skip */ }
    const statusUpper = String(resultStatus).toUpperCase();
    if (!['PASS', 'FAIL'].includes(statusUpper)) {
      continue;
    }

    //  — Si CP terminó PASS, los selectors ejecutados produjeron
    // un resultado exitoso → pasar `--verified` para que `nav-learning record`
    // marque `verified_against_dom: true` y aplique bonus de confidence.
    // Para FAIL: comportamiento conservador (no asume verificación) — el step
    // fallido puede haber causado el FAIL; los previos pueden o no estar OK.
    const backfillArgs = [
      NAV_BACKFILL,
      '--result-file', resultFile,
      '--session',     sessionPath,
      '--run-id',      args.runId,
    ];
    if (statusUpper === 'PASS') backfillArgs.push('--verified');

    const r = spawnSync('node', backfillArgs, { encoding: 'utf8', timeout: 30000 });

    const stdoutStr = (r.stdout || '').trim();
    const stderrStr = (r.stderr || '').trim();

    fs.appendFileSync(logFile, `\n--- CP ${cpId} (status=${resultStatus}) ---\n`);
    if (stdoutStr) fs.appendFileSync(logFile, stdoutStr + '\n');
    if (stderrStr) fs.appendFileSync(logFile, '[stderr] ' + stderrStr + '\n');

    if (r.status !== 0) {
      stats.warnings.push(`backfill exit ${r.status} para ${cpId}`);
      continue;
    }

    // Parsear stdout JSON (nav-learning-backfill emite un único JSON al final)
    try {
      const parsed = JSON.parse(stdoutStr);
      stats.cps_processed++;
      stats.total_backfilled += parsed.backfilled || 0;
      stats.total_skipped    += parsed.skipped    || 0;
      stats.per_cp.push({
        cp_id: cpId,
        backfilled: parsed.backfilled || 0,
        skipped: parsed.skipped || 0,
        skip_reasons: parsed.skip_reasons || {},
      });
    } catch (e) {
      stats.warnings.push(`stdout no parseable de ${cpId}: ${e.message}`);
    }
  }
}

stats.log_file = path.relative(runFolder, logFile).replace(/\\/g, '/');

process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
process.exit(0);
