#!/usr/bin/env node
/**
 * knowledge-updater.js — Actualiza los registros transaccionales post-ejecución.
 *
 * Implementa las 3 partes de .claude/skills/sofka-asdd-atf-web-knowledge-updater/SKILL.md como
 * script ejecutable determinístico. Lee SIEMPRE desde disco — nunca de memoria.
 *
 * Modo single-module (legacy):
 *   cd "{project_root}" && MSYS_NO_PATHCONV=1 node .claude/tools/knowledge-updater.js \
 *     --mode             full \
 *     --app-name         "{app_name}" \
 *     --module-id        "{module_id}" \
 *     --run-id           "{run_id}" \
 *     --module-result    "docs/testing/atf-web/{run_id}/execution/{module_id}/module_result.json" \
 *     --headless-results "docs/testing/atf-web/{run_id}/execution/{module_id}/headless_results.json"
 *
 * Modo batch multi-módulo (B1, recomendado para runs cross-módulo):
 *   node .claude/tools/knowledge-updater.js \
 *     --mode      full \
 *     --app-name  "OrangeHRM" \
 *     --run-id    "MiApp-v1.0-20260101-0900" \
 *     --modules-json '[
 *       {"module_id":"admin-organization","module_result":"docs/testing/atf-web/.../admin-organization/module_result.json","headless_results":"docs/testing/atf-web/.../admin-organization/headless_results.json"},
 *       {"module_id":"email-config","module_result":"docs/testing/atf-web/.../email-config/module_result.json","headless_results":"docs/testing/atf-web/.../email-config/headless_results.json"}
 *     ]'
 *
 * En modo batch, el script:
 *   - Lee `module_verdicts.json`, `cp_registry.json`, `cp_index.json` UNA SOLA vez al inicio.
 *   - Aplica los cambios de TODOS los módulos in-memory.
 *   - Escribe los 3 archivos UNA SOLA vez al final.
 * Esto evita race conditions (vs paralelizar invocaciones single-module en `&`)
 * y reduce overhead de spawn (1 vs N procesos node).
 *
 * Modos:
 *   full        → Parte 1 + Parte 2 + Parte 3
 *   verdicts    → Solo Parte 1 (module_verdicts.json)
 *   cp_registry → Solo Parte 2 (cp_registry.json)
 *   indices     → Solo Parte 3 (cp_index.json)
 *
 * Exit codes: 0 = OK | 1 = error fatal
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── helpers ──────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`❌ knowledge-updater: ${msg}`);
  process.exit(1);
}

function readJson(filePath, defaultVal) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    die(`JSON parse error en ${filePath}: ${e.message}`);
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function parseArgs() {
  const raw  = process.argv.slice(2);
  const opts = { mode: 'full' };
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case '--mode':             opts.mode            = raw[++i]; break;
      case '--app-name':         opts.appName         = raw[++i]; break;
      case '--module-id':        opts.moduleId        = raw[++i]; break;
      case '--run-id':           opts.runId           = raw[++i]; break;
      case '--module-result':    opts.moduleResult    = raw[++i]; break;
      case '--headless-results': opts.headlessResults = raw[++i]; break;
      case '--modules-json':     opts.modulesJson     = raw[++i]; break;
      // legacy aliases (compat con orchestrator inline calls)
      case '--module-result-path':    opts.moduleResult    = raw[++i]; break;
      case '--headless-results-path': opts.headlessResults = raw[++i]; break;
      case '--project-root':    opts.projectRoot = raw[++i]; break;
      case '--output-dir':      /* accepted, unused */ raw[++i]; break;
    }
  }
  return opts;
}

// ─── main ─────────────────────────────────────────────────────────────────────

const opts = parseArgs();

if (!opts.appName) die('--app-name es requerido');
if (!opts.runId)   die('--run-id es requerido');

// Construir lista de módulos a procesar — modo batch o legacy single
let modulesToProcess;
if (opts.modulesJson) {
  try {
    modulesToProcess = JSON.parse(opts.modulesJson);
  } catch (e) {
    die(`--modules-json JSON inválido: ${e.message}`);
  }
  if (!Array.isArray(modulesToProcess) || modulesToProcess.length === 0)
    die('--modules-json debe ser un array no vacío');
  for (const m of modulesToProcess) {
    if (!m.module_id || !m.module_result || !m.headless_results)
      die('cada elemento de --modules-json requiere module_id, module_result, headless_results');
  }
} else {
  // Modo single-module legacy
  if (!opts.moduleId)        die('--module-id es requerido (o usa --modules-json)');
  if (!opts.moduleResult)    die('--module-result es requerido (o usa --modules-json)');
  if (!opts.headlessResults) die('--headless-results es requerido (o usa --modules-json)');
  modulesToProcess = [{
    module_id:        opts.moduleId,
    module_result:    opts.moduleResult,
    headless_results: opts.headlessResults,
  }];
}

const PROJECT_ROOT = opts.projectRoot || process.cwd();
const MEMORY_DIR   = path.join(PROJECT_ROOT, '.claude', 'agent-memory', opts.appName);

if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// ── Leer y parsear inputs de cada módulo (1 lectura por archivo) ───────────────

const moduleData = []; // [{ module_id, runStats, headlessResults }, ...]

for (const m of modulesToProcess) {
  if (!fs.existsSync(m.module_result))
    die(`module_result no encontrado: ${m.module_result}`);
  if (!fs.existsSync(m.headless_results))
    die(`headless_results no encontrado: ${m.headless_results}`);

  const mr  = readJson(m.module_result, null);
  const hd  = readJson(m.headless_results, { results: [] });
  const hr  = hd.results || [];

  if (!mr) die(`module_result.json vacío o inválido: ${m.module_result}`);

  const summary = mr.summary || mr;

  moduleData.push({
    module_id: m.module_id,
    runStats: {
      total_cps: summary.total_cps   || mr.total_cps   || 0,
      passed:    summary.passed      || mr.passed       || 0,
      failed:    summary.failed      || mr.failed       || 0,
      blocked:   summary.blocked     || mr.blocked      || 0,
      verdict:   mr.verdict          || 'INCOMPLETE',
    },
    headlessResults: hr,
  });
}

const results = {
  verdicts_updated:    false,
  cp_registry_updated: false,
  indices_updated:     false,
  cps_processed:       0,
  modules_processed:   moduleData.length,
};

// ── Parte 1 — module_verdicts.json (1 lectura + N appends + 1 escritura) ──────

function updateVerdicts() {
  const verdictFile = path.join(MEMORY_DIR, 'module_verdicts.json');
  const verdicts    = readJson(verdictFile, { verdicts: [] });

  // P100 — defensivo: shape legacy `{app_name, modules:{}, last_updated:null}` sin verdicts[]
  if (!Array.isArray(verdicts.verdicts)) verdicts.verdicts = [];

  const fechaIso = new Date().toISOString();
  let appended = 0;
  for (const md of moduleData) {
    verdicts.verdicts.push({
      run_id:    opts.runId,
      module_id: md.module_id,
      verdict:   md.runStats.verdict,
      total_cps: md.runStats.total_cps,
      pass:      md.runStats.passed,
      fail:      md.runStats.failed,
      blocked:   md.runStats.blocked,
      fecha:     fechaIso,
    });
    appended++;
  }

  writeJson(verdictFile, verdicts);
  results.verdicts_updated = true;
  console.log(`✅ module_verdicts.json — ${appended} veredicto(s) registrado(s)`);
}

// ── Parte 2 — cp_registry.json (1 lectura + N módulos × M CPs + 1 escritura) ──

function updateRegistry() {
  const registryFile = path.join(MEMORY_DIR, 'cp_registry.json');
  const registry     = readJson(registryFile, { cps: {} });
  if (!registry.cps || typeof registry.cps !== 'object') registry.cps = {};

  let updated = 0;
  let created = 0;

  for (const md of moduleData) {
    for (const hr of md.headlessResults) {
      const { cp_id, status, executed_at, module_id } = hr;
      if (!cp_id) continue;

      const derivedModule = module_id || md.module_id;
      const historyEntry = {
        run_id:      opts.runId,
        status:      status || 'UNKNOWN',
        executed_at: executed_at || new Date().toISOString(),
      };

      if (registry.cps[cp_id]) {
        const alreadyRecorded = (registry.cps[cp_id].execution_history || [])
          .some(h => h.run_id === opts.runId && h.executed_at === executed_at);
        if (!alreadyRecorded) {
          registry.cps[cp_id].execution_history =
            registry.cps[cp_id].execution_history || [];
          registry.cps[cp_id].execution_history.push(historyEntry);
          updated++;
        }
      } else {
        registry.cps[cp_id] = {
          cp_id,
          module_id: derivedModule,
          execution_history: [historyEntry],
        };
        created++;
      }
    }
  }

  writeJson(registryFile, registry);
  results.cp_registry_updated = true;
  results.cps_processed = updated + created;
  console.log(`✅ cp_registry.json — ${updated} actualizados, ${created} nuevos`);
}

// ── Parte 3 — cp_index.json (1 lectura + N módulos × M CPs + 1 escritura) ─────

function updateIndex() {
  const indexFile = path.join(MEMORY_DIR, 'cp_index.json');
  const index     = readJson(indexFile, { updated_at: '', last_run_id: '', cps: {} });
  if (!index.cps || typeof index.cps !== 'object') index.cps = {};

  for (const md of moduleData) {
    for (const hr of md.headlessResults) {
      const { cp_id, status } = hr;
      if (!cp_id) continue;

      if (index.cps[cp_id]) {
        index.cps[cp_id].last_verdict = status;
        index.cps[cp_id].last_run_id  = opts.runId;
      } else {
        index.cps[cp_id] = {
          status:       'active',
          last_verdict: status,
          last_run_id:  opts.runId,
        };
      }
    }
  }

  index.updated_at  = new Date().toISOString();
  index.last_run_id = opts.runId;

  writeJson(indexFile, index);
  results.indices_updated = true;
  console.log(`✅ cp_index.json — ${Object.keys(index.cps).length} CPs en índice`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const mode = opts.mode;

if (mode === 'full' || mode === 'verdicts')    updateVerdicts();
if (mode === 'full' || mode === 'cp_registry') updateRegistry();
if (mode === 'full' || mode === 'indices')     updateIndex();

console.log(JSON.stringify(results));
process.exit(0);
