#!/usr/bin/env node
/**
 * ATF — Merge partial module_result_*.json files into the main module_result.json.
 *
 * When the executor runs a subset of CPs (custom tags, re-execution),
 * it writes a partial file (e.g. module_result_5_03.json). This script
 * merges those partial results back into the canonical module_result.json
 * so that generate-report.js can ingest them.
 *
 * Usage:
 *   node .claude/tools/merge-module-result.js \
 *     --execution-dir {execution_dir}/{module_id}
 *
 * The script:
 *   1. Finds all module_result_*.json files in the directory
 *   2. Reads the main module_result.json (must exist)
 *   3. For each partial file, upserts results[] entries by cp_id
 *   4. Enriches entries from individual result.json if available
 *   5. Recalculates summary counts from the merged results
 *   6. Writes back to module_result.json
 *   7. Renames processed partial files to .merged.json
 *
 * Exit codes: 0 = OK | 1 = error | 2 = nothing to merge
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) {
  console.error(`❌ merge-module-result: ${msg}`);
  process.exit(1);
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/* ─── Parse args ─────────────────────────────────────────────────────────── */

function parseArgs() {
  const raw = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '--execution-dir') opts.executionDir = raw[++i];
  }
  if (!opts.executionDir) die('--execution-dir es requerido');
  return opts;
}

/* ─── Enrich a partial entry with data from its individual result.json ──── */

function enrichEntry(entry, executionDir) {
  // Resolve the individual result.json path
  const resultPath = entry.result_path || entry.result_file;
  if (!resultPath) return entry;

  const fullPath = path.join(executionDir, resultPath);
  if (!fs.existsSync(fullPath)) return entry;

  try {
    const result = readJSON(fullPath);
    const steps = result.steps || [];
    const passedSteps = steps.filter(s => s.status === 'PASS').length;
    const failedSteps = steps.filter(s => s.status === 'FAIL').length;

    // Add steps info if missing
    if (entry.steps_total == null) entry.steps_total = steps.length;
    if (entry.steps_passed == null) entry.steps_passed = passedSteps;
    if (entry.steps_failed == null) entry.steps_failed = failedSteps;

    // Add evidence files if missing
    if (!entry.evidence_files && result.evidence_files) {
      entry.evidence_files = result.evidence_files;
    }

    // Add funcional_ref if missing
    if (!entry.funcional_ref && result.funcional_ref) {
      entry.funcional_ref = result.funcional_ref;
    }

    // Add tags if missing
    if (!entry.tags && result.tags) {
      entry.tags = result.tags;
    }

    // Normalize result_path → result_file (canonical field name)
    if (entry.result_path && !entry.result_file) {
      entry.result_file = entry.result_path;
      delete entry.result_path;
    }

    // Add fail info
    if (entry.status === 'FAIL') {
      const failStep = steps.find(s => s.status === 'FAIL');
      if (failStep && !entry.fail_step) entry.fail_step = failStep.n;
      if (failStep && !entry.fail_reason) entry.fail_reason = failStep.error || null;
    }

    // Bug info
    if (result.bug_candidate && !entry.bug_id) {
      entry.bug_id = result.bug_candidate.title || null;
    }
  } catch (e) {
    console.warn(`⚠️  merge-module-result: error enriching ${entry.cp_id}: ${e.message}`);
  }

  return entry;
}

/* ─── Recalculate summary from results array ─────────────────────────────── */

function recalcSummary(results) {
  const summary = {
    executed: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    total_in_scope: results.length,
  };

  for (const r of results) {
    const status = (r.status || '').toUpperCase();
    if (status === 'PASS') { summary.executed++; summary.passed++; }
    else if (status === 'FAIL') { summary.executed++; summary.failed++; }
    else if (status === 'BLOCKED') { summary.blocked++; }
    // SKIPPED, NOT_EXECUTED, etc. → count in total but not executed
  }

  return summary;
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

function main() {
  const opts = parseArgs();
  const dir = opts.executionDir;

  if (!fs.existsSync(dir)) die(`Directorio no existe: ${dir}`);

  // Find main module_result.json
  const mainPath = path.join(dir, 'module_result.json');
  if (!fs.existsSync(mainPath)) die(`module_result.json no encontrado en ${dir}`);

  // Find partial files: module_result_*.json (excluding .merged.json)
  const partialFiles = fs.readdirSync(dir).filter(name =>
    /^module_result_.+\.json$/.test(name) &&
    !name.endsWith('.merged.json') &&
    name !== 'module_result.json'
  );

  if (partialFiles.length === 0) {
    console.log('📍 merge-module-result: sin archivos parciales — nada que mergear');
    process.exit(2);
  }

  console.log(`📍 merge-module-result: ${partialFiles.length} archivo(s) parcial(es) encontrado(s): ${partialFiles.join(', ')}`);

  // Read main file
  const main = readJSON(mainPath);
  const results = main.results || [];

  // Index by cp_id for O(1) lookup
  const resultIndex = new Map();
  results.forEach((r, i) => resultIndex.set(r.cp_id, i));

  let added = 0;
  let updated = 0;

  for (const partialFile of partialFiles) {
    const partialPath = path.join(dir, partialFile);
    let partial;
    try { partial = readJSON(partialPath); } catch (e) {
      console.warn(`⚠️  merge-module-result: error leyendo ${partialFile}: ${e.message}`);
      continue;
    }

    const partialResults = partial.results || [];
    for (let entry of partialResults) {
      entry = enrichEntry(entry, dir);

      if (resultIndex.has(entry.cp_id)) {
        // Upsert: replace existing entry
        const idx = resultIndex.get(entry.cp_id);
        // Preserve fields from original that the partial may not have
        const original = results[idx];
        const merged = { ...original, ...entry };
        // Keep previous_status if this is a re-execution
        if (original.status !== entry.status && !entry.previous_status) {
          merged.previous_status = original.status;
        }
        results[idx] = merged;
        updated++;
      } else {
        // New entry: append
        results.push(entry);
        resultIndex.set(entry.cp_id, results.length - 1);
        added++;
      }
    }

    // Rename partial file to .merged.json to avoid re-processing
    const mergedPath = partialPath.replace(/\.json$/, '.merged.json');
    fs.renameSync(partialPath, mergedPath);
  }

  // Recalculate summary
  main.results = results;
  main.summary = recalcSummary(results);
  main.executed_at = new Date().toISOString();
  main._merge_note = `Merged ${added} new + ${updated} updated CPs from ${partialFiles.join(', ')} at ${new Date().toISOString()}`;

  writeJSON(mainPath, main);

  console.log(`✅ merge-module-result: ${added} añadidos, ${updated} actualizados → module_result.json`);
  console.log(`   Summary: ${main.summary.executed} ejecutados (${main.summary.passed} PASS, ${main.summary.failed} FAIL), ${main.summary.blocked} BLOCKED de ${main.summary.total_in_scope} en scope`);
}

main();
