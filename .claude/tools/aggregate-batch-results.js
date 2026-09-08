#!/usr/bin/env node
/**
 * aggregate-batch-results.js — agrega resultados de UN batch del executor
 * fast-path en los `module_result.json` de cada módulo afectado.
 *
 * Un batch puede contener CPs de múltiples módulos. Este script:
 *   1. Agrupa los resultados del batch por module_id.
 *   2. Por cada módulo afectado:
 *      a. Lee `execution/{module_id}/module_result.json` si existe (batch previo).
 *      b. Lee `design/cp_modulo_{module_id}.json` para contadores totales.
 *      c. Merge: agrega/actualiza los CPs del batch nuevo en `results[]`.
 *         (Si un cp_id ya estaba, el nuevo lo sobreescribe — re-run).
 *      d. Recalcula `summary`, `coverage_by_risk`, `verdict`, `failed_cps`,
 *         `bug_candidates_emitted`.
 *      e. Escribe el archivo de vuelta con schema canónico.
 *
 * Input (JSON por stdin o archivo):
 *   {
 *     "run_folder": "docs/testing/atf-web/{run_id}/",
 *     "batch_id": 2,
 *     "custom_tags": ["@cp:CP-M1-001", "..."],
 *     "evidence_mode": "all",
 *     "attempted_cp_ids": [                    // OPCIONAL pero RECOMENDADO.
 *       { "cp_id": "CP-M1-001", "module_id": "M1" },   // IDs de todos los CPs que el batch
 *       { "cp_id": "CP-M1-002", "module_id": "M1" }    // intentó ejecutar. Si aparece un cp_id
 *     ],                                               // en attempted_cp_ids pero NO en
 *     "batch_results": [                               // batch_results, el aggregator lo
 *       { "cp_id": "CP-M1-001", "module_id": "M1", "status": "PASS", "duration_ms": 3200,
 *         "failed_step": null, "error_message": null, "evidence_dir": "execution/M1/001/",
 *         "steps_total": 6, "steps_passed": 6, "executed_at": "2026-04-19T12:00:00Z" },
 *       ...                                  //   (status=BLOCKED, error=abort_before_result)
 *     ]                                      // — esto previene ghost PASS de batches previos.
 *   }
 *
 * Output (stdout — JSON):
 *   {
 *     "modules_updated": ["M1", "M4"],
 *     "files_written": ["execution/M1/module_result.json", "execution/M4/module_result.json"],
 *     "per_module": {
 *       "M1": { "total_cps": 10, "executed": 5, "passed": 5, "failed": 0, "verdict": "CERTIFIED" },
 *       "M4": { "total_cps": 10, "executed": 1, "passed": 1, "failed": 0, "verdict": "INCOMPLETE" }
 *     },
 *     "warnings": []
 *   }
 *
 * Exit: 0 OK | 1 input inválido | 2 error de FS
 */

'use strict';

const fs = require('fs');
const path = require('path');

function die(code, msg) {
  process.stderr.write(`[aggregate-batch-results] ERROR: ${msg}\n`);
  process.exit(code);
}

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
    try { raw = fs.readFileSync(0, 'utf8'); }
    catch (e) { die(1, `no se pudo leer stdin: ${e.message}`); }
  }
  let obj;
  try { obj = JSON.parse(raw); }
  catch (e) { die(1, `JSON inválido: ${e.message}`); }
  if (!obj.run_folder || typeof obj.run_folder !== 'string') die(1, '`run_folder` requerido');
  if (!Array.isArray(obj.batch_results)) die(1, '`batch_results` debe ser array');
  return obj;
}

/* ─── Lectura / escritura de JSON ─────────────────────────────────────── */

function readJSON(fpath) {
  try { return JSON.parse(fs.readFileSync(fpath, 'utf8')); }
  catch { return null; }
}

function writeJSON(fpath, obj) {
  fs.mkdirSync(path.dirname(fpath), { recursive: true });
  fs.writeFileSync(fpath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/* ─── Agregación por módulo ───────────────────────────────────────────── */

function loadModuleDesign(run_folder, module_id) {
  const designFile = path.join(run_folder, 'design', `cp_modulo_${module_id}.json`);
  const data = readJSON(designFile);
  if (!data) return { total: 0, by_risk: { critical: 0, high: 0, medium: 0, low: 0 }, module_name: module_id };
  const list = data.test_cases || data.cps || data.cases || [];
  const by_risk = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const cp of list) {
    const r = String(cp.risk_level || 'medium').toLowerCase();
    if (r in by_risk) by_risk[r]++;
  }
  return {
    total: list.length,
    by_risk,
    module_name: data.module_name || module_id,
  };
}

function computeCoverageByRisk(design, results) {
  // results: array de cp_results con status + risk_level implícito (del design)
  // Construimos un mapa cp_id -> risk desde el design
  const cov = {
    critical: { total: design.by_risk.critical, executed: 0, passed: 0, failed: 0 },
    high:     { total: design.by_risk.high,     executed: 0, passed: 0, failed: 0 },
    medium:   { total: design.by_risk.medium,   executed: 0, passed: 0, failed: 0 },
    low:      { total: design.by_risk.low,      executed: 0, passed: 0, failed: 0 },
  };
  for (const r of results) {
    const risk = String(r.risk_level || 'medium').toLowerCase();
    if (!(risk in cov)) continue;
    cov[risk].executed++;
    if (r.status === 'PASS') cov[risk].passed++;
    else if (r.status === 'FAIL') cov[risk].failed++;
  }
  for (const k of Object.keys(cov)) {
    cov[k].coverage_pct = cov[k].total > 0
      ? Math.round((cov[k].executed / cov[k].total) * 100)
      : 0;
  }
  return cov;
}

function computeVerdict(cov, summary) {
  const cc = cov.critical.coverage_pct;
  const ch = cov.high.coverage_pct;
  const criticalFailed = cov.critical.failed > 0;
  const highFailed = cov.high.failed > 0;
  const executed = summary.executed;
  const passed = summary.passed;
  const blocked = summary.blocked;
  const passRate = executed > 0 ? (passed / executed) * 100 : 0;

  if (blocked > 0 && blocked / (summary.total_cps || 1) > 0.5) return 'BLOCKED';
  if (criticalFailed || highFailed || passRate < 60) return 'FAIL';
  if (cc === 100 && ch >= 90 && passRate >= 80) return 'CERTIFIED';
  if (cc >= 80 && passRate >= 60) return 'CONDITIONAL';
  return 'INCOMPLETE';
}

function mergeModule(run_folder, module_id, newResults, batch_id, custom_tags, evidence_mode) {
  const moduleFile = path.join(run_folder, 'execution', module_id, 'module_result.json');
  const existing = readJSON(moduleFile) || {};
  const design = loadModuleDesign(run_folder, module_id);

  // Merge de results por cp_id — el batch nuevo sobreescribe entries previas
  const mergedByCpId = new Map();
  const previousResults = Array.isArray(existing.results) ? existing.results : [];
  for (const r of previousResults) {
    if (r && r.cp_id) mergedByCpId.set(r.cp_id, r);
  }
  // Cache del design (re-usado para risk_level y source_id backfill)
  let designList = null;
  const ensureDesignList = () => {
    if (designList !== null) return designList;
    const designFile = path.join(run_folder, 'design', `cp_modulo_${module_id}.json`);
    const designData = readJSON(designFile);
    designList = (designData?.test_cases || designData?.cps || designData?.cases || []);
    return designList;
  };
  for (const r of newResults) {
    // Enriquecer con risk_level / source_id del design si faltan.
    // source_id es crítico: el dashboard usa cpKey(cp_id, source_id) como llave
    // compuesta para matchear diseño↔ejecución. Sin source_id el CP aparece
    // como "Pendiente" aunque tenga result.json.
    const needsRisk = !r.risk_level;
    const needsSourceId = !r.source_id;
    if (needsRisk || needsSourceId) {
      const list = ensureDesignList();
      const match = list.find(c => c && c.cp_id === r.cp_id);
      if (needsRisk) r.risk_level = match?.risk_level || 'medium';
      if (needsSourceId && match?.source_id) r.source_id = match.source_id;
    }
    mergedByCpId.set(r.cp_id, r);
  }
  const mergedResults = [...mergedByCpId.values()];

  // Summary recalculado
  const summary = {
    total_cps: design.total,
    executed: mergedResults.length,
    passed: mergedResults.filter(r => r.status === 'PASS').length,
    failed: mergedResults.filter(r => r.status === 'FAIL').length,
    blocked: mergedResults.filter(r => r.status === 'BLOCKED').length,
    skipped_by_filter: Math.max(0, design.total - mergedResults.length),
    risk_override_count: existing.summary?.risk_override_count || 0,
  };

  const coverage_by_risk = computeCoverageByRisk(design, mergedResults);
  const verdict = computeVerdict(coverage_by_risk, summary);
  const failed_cps = mergedResults.filter(r => r.status === 'FAIL').map(r => r.cp_id);
  const bug_candidates_emitted = mergedResults
    .filter(r => r.status === 'FAIL')
    .map(r => r.cp_id);

  const verdict_rationale = [
    `${summary.passed}/${summary.executed} PASS`,
    `cobertura critical: ${coverage_by_risk.critical.coverage_pct}%`,
    `cobertura high: ${coverage_by_risk.high.coverage_pct}%`,
    `veredicto: ${verdict}`,
  ].join(' · ');

  const out = {
    module_id,
    module_name: design.module_name,
    run_id: existing.run_id || '',
    executor_instance: `fast-path-batch-${batch_id || '?'}`,
    tag_filter_applied: custom_tags || [],
    risk_override_applied: existing.risk_override_applied || false,
    evidence_mode: evidence_mode || existing.evidence_mode || 'all',
    executed_at: new Date().toISOString(),
    summary,
    results: mergedResults,
    coverage_by_risk,
    verdict,
    verdict_rationale,
    failed_cps,
    bug_candidates_emitted,
    headless_results_path: `execution/${module_id}/headless_results.json`,
    evidence_dir: `execution/${module_id}/`,
    nav_learning: existing.nav_learning || { skipped: true, reason: 'fast_path_batch_aggregation' },
    last_batch_id: batch_id || null,
  };

  // Preservar run_id si el existing lo tiene
  if (!out.run_id && existing.run_id) out.run_id = existing.run_id;

  writeJSON(moduleFile, out);

  return {
    module_id,
    total_cps: summary.total_cps,
    executed: summary.executed,
    passed: summary.passed,
    failed: summary.failed,
    blocked: summary.blocked,
    verdict,
    file: path.relative(run_folder, moduleFile).replace(/\\/g, '/'),
  };
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

const input = parseInput();
const warnings = [];

// ANTI-GHOST: si el caller pasa `attempted_cp_ids`, sintetizamos
// entradas BLOCKED para los CPs intentados que NO aparecen en batch_results. Esto evita
// que el merge preserve un PASS stale de un run previo cuando el batch abortó antes de
// producir resultados (ej. MFA session expired en PASO 2).
const attemptedCpIds = Array.isArray(input.attempted_cp_ids) ? input.attempted_cp_ids : null;
const ghostClearedBlocked = [];  // para logging/reporte
if (attemptedCpIds && attemptedCpIds.length > 0) {
  const resultCpIdSet = new Set(
    (input.batch_results || []).filter(r => r && r.cp_id).map(r => r.cp_id)
  );
  for (const att of attemptedCpIds) {
    if (!att || !att.cp_id || !att.module_id) {
      warnings.push(`Entrada inválida en attempted_cp_ids: ${JSON.stringify(att)}`);
      continue;
    }
    if (!resultCpIdSet.has(att.cp_id)) {
      // Inyectar BLOCKED explícito — sobreescribe cualquier PASS stale en module_result.json
      const synthetic = {
        cp_id: att.cp_id,
        module_id: att.module_id,
        status: 'BLOCKED',
        duration_ms: 0,
        failed_step: null,
        error_message: att.abort_reason || 'abort_before_result_written',
        evidence_dir: null,
        steps_total: 0,
        steps_passed: 0,
        executed_at: new Date().toISOString(),
        blocked_reason: att.abort_reason || 'abort_before_result_written',
        synthetic_blocked_entry: true,   // marcador para audit
      };
      input.batch_results.push(synthetic);
      ghostClearedBlocked.push(att.cp_id);
    }
  }
  if (ghostClearedBlocked.length > 0) {
    warnings.push(
      `Anti-ghost: ${ghostClearedBlocked.length} CP(s) intentado(s) sin resultado — ` +
      `inyectadas entradas BLOCKED sintéticas: ${ghostClearedBlocked.join(', ')}. ` +
      `Esto sobreescribe cualquier PASS/FAIL stale en module_result.json.`
    );
  }
}

// Agrupar results por module_id
const byModule = new Map();
for (const r of input.batch_results) {
  if (!r || !r.cp_id || !r.module_id) {
    warnings.push(`Entrada inválida en batch_results: ${JSON.stringify(r)}`);
    continue;
  }
  if (!byModule.has(r.module_id)) byModule.set(r.module_id, []);
  byModule.get(r.module_id).push(r);
}

if (byModule.size === 0) die(1, 'batch_results vacío o todas las entradas inválidas');

const per_module = {};
const files_written = [];
const modules_updated = [];

for (const [module_id, rs] of byModule.entries()) {
  const stats = mergeModule(
    input.run_folder,
    module_id,
    rs,
    input.batch_id,
    input.custom_tags,
    input.evidence_mode
  );
  per_module[module_id] = stats;
  modules_updated.push(module_id);
  files_written.push(stats.file);
}

const output = {
  modules_updated,
  files_written,
  per_module,
  warnings,
  anti_ghost: {
    attempted_cp_ids_count: attemptedCpIds ? attemptedCpIds.length : 0,
    synthetic_blocked_injected: ghostClearedBlocked,
  },
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
