#!/usr/bin/env node
/**
 * plan-batches.js — divide cp_targets[] en batches ordenados por riesgo+módulo.
 *
 * Input (JSON por stdin o archivo):
 *   {
 *     "cp_targets": [{"module_id": "M1", "cp_id": "CP-M1-001"}, ...],
 *     "batch_size": 15,
 *     "run_folder": "docs/testing/atf-web/{run_id}/"
 *   }
 *
 * Output (stdout — JSON):
 *   {
 *     "batches": [
 *       [{"module_id":"M1","cp_id":"CP-M1-001","risk_level":"critical"}, ...],
 *       [...]
 *     ],
 *     "total_batches": 3,
 *     "stats": {
 *       "total_cps": 23,
 *       "by_risk": {"critical": 2, "high": 5, "medium": 10, "low": 6},
 *       "by_module": {"M1": 5, "M4": 8, "M5": 10}
 *     },
 *     "estimated_duration_min": 12,
 *     "warnings": []
 *   }
 *
 * Ordenamiento dentro del flat sort (antes de chunking):
 *   1. risk_level: critical > high > medium > low > unknown
 *   2. module_id: agrupar CPs del mismo módulo consecutivos
 *   3. cp_id: orden natural estable
 *
 * Así los batches: los primeros contienen los CPs más críticos. Si el run se
 * interrumpe, la cobertura de riesgo alto se preserva.
 *
 * Uso:
 *   echo '{"cp_targets":[...],"batch_size":10,"run_folder":"..."}' | node plan-batches.js
 *   node plan-batches.js --input=plan-input.json
 *
 * Exit: 0 OK | 1 input inválido | 2 error de FS
 */

'use strict';

const fs = require('fs');
const path = require('path');

function die(code, msg) {
  process.stderr.write(`[plan-batches] ERROR: ${msg}\n`);
  process.exit(code);
}

const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

/** Factor de duración por CP según risk (minutos). Estimación grosera. */
const DURATION_BY_RISK = { critical: 1.5, high: 1.2, medium: 0.9, low: 0.7, unknown: 1.0 };

/* ─── Parse input ─────────────────────────────────────────────────────── */

function parseInput() {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => a.startsWith('--input='));
  let raw;
  if (fileArg) {
    const fpath = fileArg.slice('--input='.length);
    try { raw = fs.readFileSync(fpath, 'utf8'); }
    catch (e) { die(2, `no se pudo leer --input=${fpath}: ${e.message}`); }
  } else {
    try { raw = fs.readFileSync(0, 'utf8'); } // stdin
    catch (e) { die(1, `no se pudo leer stdin: ${e.message}`); }
  }
  if (!raw || !raw.trim()) die(1, 'input vacío (se esperaba JSON por stdin o --input)');
  let obj;
  try { obj = JSON.parse(raw); }
  catch (e) { die(1, `JSON inválido: ${e.message}`); }
  if (!Array.isArray(obj.cp_targets)) die(1, '`cp_targets` debe ser un array');
  if (!obj.batch_size || typeof obj.batch_size !== 'number' || obj.batch_size < 1) {
    die(1, '`batch_size` debe ser un número ≥ 1');
  }
  if (!obj.run_folder || typeof obj.run_folder !== 'string') {
    die(1, '`run_folder` requerido (string)');
  }
  return obj;
}

/* ─── Resolver risk_level de cada cp_target ───────────────────────────── */

function enrichRiskLevels(cp_targets, run_folder) {
  const designDir = path.join(run_folder, 'design');
  // Cache de cp_modulo_*.json por module_id para no releer
  const moduleCache = new Map();
  const warnings = [];

  function loadModule(module_id) {
    if (moduleCache.has(module_id)) return moduleCache.get(module_id);
    const file = path.join(designDir, `cp_modulo_${module_id}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = data.test_cases || data.cps || data.cases || [];
      const byId = new Map();
      for (const cp of list) {
        if (cp && cp.cp_id) byId.set(cp.cp_id, cp);
      }
      moduleCache.set(module_id, byId);
      return byId;
    } catch (e) {
      warnings.push(`cp_modulo_${module_id}.json no legible (${e.code || e.message}) — risk_level=unknown para sus CPs`);
      moduleCache.set(module_id, new Map());
      return moduleCache.get(module_id);
    }
  }

  const enriched = cp_targets.map(t => {
    const mod = loadModule(t.module_id);
    const cp = mod.get(t.cp_id);
    const risk = (cp && cp.risk_level) ? String(cp.risk_level).toLowerCase() : 'unknown';
    if (!cp) warnings.push(`CP ${t.cp_id} no encontrado en cp_modulo_${t.module_id}.json`);
    return {
      module_id: t.module_id,
      cp_id: t.cp_id,
      risk_level: risk in RISK_ORDER ? risk : 'unknown',
    };
  });

  return { enriched, warnings };
}

/* ─── Ordenar + dividir en batches ────────────────────────────────────── */

function planBatches(enriched, batch_size) {
  // Sort estable: risk asc (critical primero), luego module, luego cp_id
  const sorted = [...enriched].sort((a, b) => {
    const dr = RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level];
    if (dr !== 0) return dr;
    if (a.module_id !== b.module_id) return a.module_id < b.module_id ? -1 : 1;
    return a.cp_id < b.cp_id ? -1 : a.cp_id > b.cp_id ? 1 : 0;
  });

  const batches = [];
  for (let i = 0; i < sorted.length; i += batch_size) {
    batches.push(sorted.slice(i, i + batch_size));
  }
  return batches;
}

function computeStats(enriched) {
  const by_risk = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const by_module = {};
  for (const t of enriched) {
    by_risk[t.risk_level] = (by_risk[t.risk_level] || 0) + 1;
    by_module[t.module_id] = (by_module[t.module_id] || 0) + 1;
  }
  return { total_cps: enriched.length, by_risk, by_module };
}

function estimateDurationMin(enriched) {
  let sum = 0;
  for (const t of enriched) sum += (DURATION_BY_RISK[t.risk_level] || 1.0);
  return Math.round(sum * 10) / 10; // 1 decimal
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

const input = parseInput();
const { enriched, warnings } = enrichRiskLevels(input.cp_targets, input.run_folder);
const batches = planBatches(enriched, input.batch_size);
const stats = computeStats(enriched);
const estimated_duration_min = estimateDurationMin(enriched);

const output = {
  batches,
  total_batches: batches.length,
  stats,
  estimated_duration_min,
  warnings,
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
