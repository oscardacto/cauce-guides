#!/usr/bin/env node
/**
 * ATF — Reset de corrida
 *
 * Limpia los artefactos generados por el pipeline para iniciar una nueva corrida desde cero.
 *
 * MODOS:
 *   --soft    Borra solo artefactos de corridas anteriores + logs de browser (default)
 *             Preserva: knowledge/, agent-memory/, configuración
 *             Úsalo cuando: quieres re-correr con los mismos requerimientos, reteniendo
 *                           el historial de CPs, riesgos y navegación ya aprendida
 *
 *   --hard    Todo lo anterior + resetea los registros transaccionales de la app actual
 *             en agent-memory/{APP}/ (cp_registry, cp_index, module_verdicts, risk_history)
 *             Preserva: recetas manuales (navigation-recipes, data-recipes), knowledge/
 *             Úsalo cuando: cambiaron los requerimientos o quieres análisis completamente fresco
 *
 * FLAGS ADICIONALES:
 *   --clear-runs-index    Resetea runs_index.json a lista vacía (por defecto se conserva)
 *   --dry-run             Muestra qué se borraría sin ejecutar ninguna acción
 *   --yes                 Salta la confirmación interactiva
 *
 * Uso:
 *   node .claude/tools/reset-run.js [--soft|--hard] [--clear-runs-index] [--dry-run] [--yes]
 *
 * Ejemplos:
 *   node .claude/tools/reset-run.js
 *   node .claude/tools/reset-run.js --hard
 *   node .claude/tools/reset-run.js --soft --dry-run
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const KP   = require('./lib/knowledge-paths');

// ─── Resolución de paths ──────────────────────────────────────────────────────
const ROOT = KP.PROJECT_ROOT;
const APP  = KP.getAppName();

const PATHS = {
  output:             path.join(ROOT, 'docs', 'testing', 'atf-web'),
  runsIndex:          path.join(ROOT, 'docs', 'testing', 'atf-web', 'runs_index.json'),
  runsIndexHtml:      path.join(ROOT, 'docs', 'testing', 'atf-web', 'runs_index.html'),
  knowledge:          KP.KNOWLEDGE,
  agentMemory:        KP.AGENT_MEMORY,
  appMemoryDir:       KP.agentMemoryDir(),
  playwrightMcp:      path.join(ROOT, '.playwright-mcp'),
};

// Registros transaccionales de la app actual que se resetean a estado vacío en modo --hard.
// Viven en agent-memory/{APP}/ desde el refactor de aislamiento per-app.
const TRANSACTIONAL_FILES = {
  'cp_registry.json':     { cps: {}, total: 0 },
  'cp_index.json':        { updated_at: '', last_run_id: '', cps: {} },
  'risk_history.json':    { history: [] },
  'module_verdicts.json': { verdicts: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE      = args.includes('--hard') ? 'hard' : 'soft';
const DRY_RUN   = args.includes('--dry-run');
const NO_PROMPT = args.includes('--yes');
const CLEAR_IDX = args.includes('--clear-runs-index');

let deleted = 0;
const log = { deleted: [], reset: [] };

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function rmrf(p, label) {
  if (!exists(p)) return;
  if (DRY_RUN) {
    console.log(`  [DRY] eliminaría → ${path.relative(ROOT, p)}`);
    log.deleted.push(label || path.relative(ROOT, p));
    deleted++;
    return;
  }
  fs.rmSync(p, { recursive: true, force: true });
  console.log(`  ✓ eliminado → ${path.relative(ROOT, p)}`);
  log.deleted.push(label || path.relative(ROOT, p));
  deleted++;
}

function resetJson(filePath, emptyValue, label) {
  if (!exists(filePath)) return;
  if (DRY_RUN) {
    console.log(`  [DRY] resetearía → ${path.relative(ROOT, filePath)}`);
    log.reset.push(label);
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(emptyValue, null, 2) + '\n', 'utf8');
  console.log(`  ↺ reseteado  → ${path.relative(ROOT, filePath)}`);
  log.reset.push(label);
}

function listSubdirs(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dir, d.name));
}

function listFiles(dir, pattern) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => pattern.test(f))
    .map(f => path.join(dir, f));
}

// ─── Lógica de limpieza ───────────────────────────────────────────────────────

function cleanRunDirectories() {
  console.log('\n📁  Artefactos de corridas anteriores');
  const RUN_PATTERN = /^.+-.+-.+-.+$/;   // formato: AppName-v1.0-20260317-1230
  const subdirs = listSubdirs(PATHS.output).filter(d => RUN_PATTERN.test(path.basename(d)));

  if (subdirs.length === 0) {
    console.log('  (no hay carpetas de corridas)');
    return;
  }
  subdirs.forEach(d => rmrf(d, `docs/testing/atf-web/${path.basename(d)}/`));
}

function cleanPlaywrightLogs() {
  console.log('\n🌐  Logs de browser (.playwright-mcp/)');
  if (!exists(PATHS.playwrightMcp)) {
    console.log('  (carpeta no existe)');
    return;
  }
  const logs = listFiles(PATHS.playwrightMcp, /^console-.+\.log$/);
  const pngs = listFiles(PATHS.playwrightMcp, /^page-.+\.png$/);
  const all  = [...logs, ...pngs];
  if (all.length === 0) { console.log('  (no hay logs)'); return; }
  all.forEach(f => rmrf(f));
}

function cleanTransactionalRegistries() {
  console.log(`\n🧠  Registros transaccionales (agent-memory/${APP}/)`);
  Object.entries(TRANSACTIONAL_FILES).forEach(([filename, empty]) => {
    const fp = KP.agentMemoryFile(filename);
    resetJson(fp, empty, filename);
  });
  // Nota: navigation_map.json NO se resetea — es learning cross-run acumulativo.
  //       known_risks.md, notebooklm-inventory.md, navigation-recipes.md,
  //       data-recipes.md, learned-selectors.md, test-data-notes.md
  //       son recetas manuales / doctrina — no se tocan con --hard.
}

function cleanRunsIndex() {
  console.log('\n📋  Índice de corridas (runs_index.json)');
  const empty = { runs: [], total: 0, last_updated: null };
  resetJson(PATHS.runsIndex, empty, 'runs_index.json');
  rmrf(PATHS.runsIndexHtml, 'runs_index.html');
}

// ─── Confirmación interactiva ─────────────────────────────────────────────────

function confirm(msg) {
  return new Promise(resolve => {
    if (NO_PROMPT || DRY_RUN) { resolve(true); return; }
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${msg} [s/N] `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 's');
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const MODE_DESC = {
  soft: 'SOFT  — Borra corridas anteriores + logs de browser',
  hard: `HARD  — Todo lo anterior + resetea registros transaccionales de agent-memory/${APP}/`,
};

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   ATF — Reset de corrida                             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Modo:  ${MODE_DESC[MODE]}`);
  console.log(`  App:   ${APP}`);
  if (CLEAR_IDX) console.log('  Extra: resetear runs_index.json');
  if (DRY_RUN)   console.log('  ⚠️  DRY-RUN — no se modificará nada');
  console.log(`  Root:  ${ROOT}\n`);

  const ok = await confirm('¿Continuar?');
  if (!ok) { console.log('\nOperación cancelada.\n'); process.exit(0); }

  // ── Tier 1: siempre (soft, hard) ──
  cleanRunDirectories();
  cleanPlaywrightLogs();

  // ── Tier 2: solo hard ──
  if (MODE === 'hard') {
    cleanTransactionalRegistries();
  }

  // ── Opcional: runs_index ──
  if (CLEAR_IDX) {
    cleanRunsIndex();
  }

  // ─── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Resumen del reset');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Eliminados : ${log.deleted.length} elementos`);
  console.log(`  Reseteados : ${log.reset.length} archivos JSON`);
  if (DRY_RUN) {
    console.log('\n  ℹ️  DRY-RUN: ningún archivo fue modificado.');
  } else {
    console.log('\n  ✅ Proyecto listo para nueva corrida.');
    console.log('  Próximo paso: actualiza appweb.yaml y corre el pipeline.\n');
  }
}

main().catch(err => {
  console.error('\n❌ Error durante el reset:', err.message);
  process.exit(1);
});
