#!/usr/bin/env node
/**
 * ATF — reprocess.js
 * CLI para regenerar reportes de runs anteriores.
 *
 * Uso:
 *   node reprocess.js --run_id <id>              # reprocesar un run específico
 *   node reprocess.js --all                      # todos los runs en runs_index.json
 *   node reprocess.js --last [N]                 # último run (o últimos N)
 *   node reprocess.js --index-only               # solo regenerar runs_index.html
 *   node reprocess.js --all --dry-run            # preview sin ejecutar
 *   node reprocess.js --all --concurrency 2      # procesar de a 2 runs simultáneos
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { spawnSync } = require('child_process');

// ── Rutas ──────────────────────────────────────────────────────────────────
const DASHBOARD_DIR   = __dirname;
const TEMPLATES_DIR   = path.join(DASHBOARD_DIR, 'templates');
const { PROJECT_ROOT: REPO_ROOT, OUTPUT_BASE } = require('./lib/output-base');
const RUNS_INDEX_JSON = path.join(OUTPUT_BASE, 'runs_index.json');
const GENERATE_REPORT = path.join(DASHBOARD_DIR, 'generate-report.js');
const GENERATE_INDEX  = path.join(DASHBOARD_DIR, 'generate-index.js');
const TEMPLATE_VERSION = '3.0.0';

// ── CLI args ───────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const isDry         = args.includes('--dry-run');
const isAll         = args.includes('--all');
const isIndexOnly   = args.includes('--index-only');

const runIdIdx      = args.indexOf('--run_id');
const runIdArg      = runIdIdx !== -1 ? args[runIdIdx + 1] : null;

const lastIdx       = args.indexOf('--last');
const lastN         = lastIdx !== -1
  ? (parseInt(args[lastIdx + 1], 10) || 1)
  : null;

const concIdx       = args.indexOf('--concurrency');
const concurrency   = concIdx !== -1 ? (parseInt(args[concIdx + 1], 10) || 1) : 1;

// ── Helpers ────────────────────────────────────────────────────────────────
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, data) {
  if (isDry) { console.log('[dry-run] would update:', p); return; }
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function printUsage() {
  console.log(`
  ATF — reprocess.js

  Uso:
    node reprocess.js --run_id <id>               Reprocesar un run específico
    node reprocess.js --all                        Todos los runs
    node reprocess.js --last [N]                   Último run (o últimos N)
    node reprocess.js --index-only                 Solo regenerar runs_index.html
    node reprocess.js --all --dry-run              Preview sin ejecutar

  Opciones:
    --dry-run              Mostrar qué haría sin ejecutar nada
    --concurrency N        Procesar N runs en paralelo (default: 1)

  Ejemplos:
    node reprocess.js --last
    node reprocess.js --all --concurrency 3
    node reprocess.js --run_id Saucedemo-v1.0-20260313-0321
    npm run reprocess -- --all
    npm run reprocess:all
  `);
}

// ── Selección de runs objetivo ─────────────────────────────────────────────
function resolveTargetRuns() {
  const indexData = readJson(RUNS_INDEX_JSON);
  if (!indexData) {
    console.error('[reprocess] No se encontró runs_index.json:', RUNS_INDEX_JSON);
    process.exit(1);
  }
  const runs = indexData.runs || [];

  if (runIdArg) {
    const found = runs.find(r => r.run_id === runIdArg);
    if (!found) {
      console.error(`[reprocess] run_id no encontrado en el índice: "${runIdArg}"`);
      console.error('[reprocess] Runs disponibles:', runs.map(r => r.run_id).join(', '));
      process.exit(1);
    }
    return [found];
  }

  if (isAll) {
    return [...runs].sort((a, b) => {
      const da = a.completed_at || a.started_at || '';
      const db = b.completed_at || b.started_at || '';
      return da.localeCompare(db);
    });
  }

  if (lastN !== null) {
    const sorted = [...runs].sort((a, b) => {
      const da = a.completed_at || a.started_at || '';
      const db = b.completed_at || b.started_at || '';
      return db.localeCompare(da); // descendente → más recientes primero
    });
    return sorted.slice(0, lastN);
  }

  return null;
}

// ── Estampado de regeneración en el índice ────────────────────────────────
function stampRegeneration(runId) {
  if (isDry) { console.log(`[dry-run] would stamp regeneration for: ${runId}`); return; }
  const indexData = readJson(RUNS_INDEX_JSON);
  if (!indexData) return;

  const entry = (indexData.runs || []).find(r => r.run_id === runId);
  if (!entry) return;

  entry.report_regenerated_at   = new Date().toISOString();
  entry.report_template_version = TEMPLATE_VERSION;

  writeJson(RUNS_INDEX_JSON, indexData);
  console.log(`[reprocess]   ✓ Estampado report_regenerated_at en runs_index.json para ${runId}`);
}

// ── Ejecución de generate-report.js ───────────────────────────────────────
function runGenerateReport(runId, extraFlags) {
  const flags = [GENERATE_REPORT, runId, ...(extraFlags || [])];
  console.log(`[reprocess] Ejecutando: node ${flags.join(' ')}`);

  if (isDry) {
    console.log(`[dry-run] would run: node ${flags.join(' ')}`);
    return true;
  }

  const result = spawnSync(process.execPath, flags, {
    stdio: 'inherit',
    cwd:   DASHBOARD_DIR,
    env:   process.env,
  });

  if (result.status !== 0) {
    console.error(`[reprocess] ❌ Error procesando ${runId} (exit code ${result.status})`);
    return false;
  }
  return true;
}

// ── Regenerar índice ───────────────────────────────────────────────────────
function regenerateIndex() {
  console.log('[reprocess] Regenerando runs_index.html...');
  if (isDry) { console.log('[dry-run] would run: node generate-index.js'); return true; }

  const result = spawnSync(process.execPath, [GENERATE_INDEX], {
    stdio: 'inherit',
    cwd:   DASHBOARD_DIR,
    env:   process.env,
  });

  if (result.status !== 0) {
    console.error('[reprocess] ❌ Error generando runs_index.html');
    return false;
  }
  return true;
}

// ── Procesamiento de un run ────────────────────────────────────────────────
function processRun(run) {
  const runId = run.run_id;
  console.log(`\n[reprocess] ── Procesando: ${runId} ──`);

  const ok = runGenerateReport(runId);

  if (ok) {
    stampRegeneration(runId);
    console.log(`[reprocess] ✅ ${runId} completado`);
  }

  return ok;
}

// ── Procesamiento en lotes (concurrencia básica via chunks) ────────────────
async function processBatch(runs) {
  const results = { ok: 0, fail: 0 };

  // Para concurrencia > 1 procesamos en chunks (spawnSync es síncrono,
  // pero agrupamos prints y evitamos bloquear todo el proceso en secuencia)
  for (let i = 0; i < runs.length; i += concurrency) {
    const chunk = runs.slice(i, i + concurrency);
    for (const run of chunk) {
      const ok = processRun(run);
      ok ? results.ok++ : results.fail++;
    }
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ATF — Reprocess CLI                      ║');
  console.log('╚══════════════════════════════════════════════╝');

  if (isDry) console.log('[reprocess] Modo: --dry-run (no se ejecutará nada)\n');

  // ── Caso: solo índice ────────────────────────────────────────────────────
  if (isIndexOnly) {
    regenerateIndex();
    console.log('\n[reprocess] ✅ Listo (--index-only)');
    return;
  }

  // ── Caso: sin flags → mostrar ayuda ─────────────────────────────────────
  if (!runIdArg && !isAll && lastN === null) {
    printUsage();
    process.exit(0);
  }

  // ── Resolver runs objetivo ───────────────────────────────────────────────
  const targets = resolveTargetRuns();
  if (!targets || targets.length === 0) {
    console.warn('[reprocess] No hay runs que procesar.');
    process.exit(0);
  }

  console.log(`\n[reprocess] Runs a procesar: ${targets.length}`);
  if (isDry || targets.length <= 10) {
    targets.forEach(r => console.log(`  • ${r.run_id}`));
  }
  console.log('');

  // ── Procesar ─────────────────────────────────────────────────────────────
  const results = await processBatch(targets);

  // ── Regenerar índice siempre al final ────────────────────────────────────
  regenerateIndex();

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  Resumen: ${results.ok} OK | ${results.fail} errores`.padEnd(46) + '║');
  console.log('╚══════════════════════════════════════════════╝');

  if (results.fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('[reprocess] Error fatal:', err);
  process.exit(1);
});
