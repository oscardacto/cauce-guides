#!/usr/bin/env node
/**
 * merge-headless-result.js — Upsert unificado de headless_results.json.
 *
 * Reemplaza el uso inconsistente de `cat > ... <<EOF` (sobrescribe) y
 * `Read + Edit` (append sin dedup) que existían en executor y orchestrator.
 *
 * Uso:
 *   cd "{project_root}" && MSYS_NO_PATHCONV=1 node .claude/tools/merge-headless-result.js \
 *     --headless-file "docs/testing/atf-web/{run_id}/execution/{module_id}/headless_results.json" \
 *     --module-id     "{module_id}" \
 *     --run-id        "{run_id}" \
 *     --batch-id      {batch_id} \
 *     --results-json  '<JSON array de objetos {cp_id, status, executed_at, ...}>'
 *
 * Comportamiento:
 *   - Lee el archivo existente (si hay). Si no existe, inicializa vacío.
 *   - Hace upsert de cada CP por `cp_id` en `results[]` (no duplica).
 *   - Reescribe el archivo con merge completo.
 *
 * Exit codes: 0 = OK | 1 = error
 */
'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) {
  console.error(`❌ merge-headless-result: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const raw  = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case '--headless-file':  opts.headlessFile = raw[++i]; break;
      case '--module-id':      opts.moduleId     = raw[++i]; break;
      case '--run-id':         opts.runId        = raw[++i]; break;
      case '--batch-id':       opts.batchId      = parseInt(raw[++i], 10); break;
      case '--results-json':   opts.resultsJson  = raw[++i]; break;
      default:
        console.warn(`⚠️  Argumento desconocido ignorado: ${raw[i]}`);
    }
  }
  return opts;
}

const opts = parseArgs();

if (!opts.headlessFile) die('--headless-file es requerido');
if (!opts.moduleId)     die('--module-id es requerido');
if (!opts.runId)        die('--run-id es requerido');
if (!opts.resultsJson)  die('--results-json es requerido');

/* ── Parsear results nuevos ───────────────────────────────────────────────── */
let newResults;
try {
  newResults = JSON.parse(opts.resultsJson);
  if (!Array.isArray(newResults)) die('--results-json debe ser un JSON array');
} catch (e) {
  die(`--results-json inválido: ${e.message}`);
}

/* ── Leer archivo existente o inicializar ─────────────────────────────────── */
const absPath = path.resolve(opts.headlessFile);
let existing  = { module_id: opts.moduleId, run_id: opts.runId, results: [] };

if (fs.existsSync(absPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    if (!Array.isArray(existing.results)) existing.results = [];
  } catch (e) {
    console.warn(`⚠️  headless_results.json existente no es JSON válido — reinicializando: ${e.message}`);
    existing.results = [];
  }
}

/* ── Upsert por cp_id ─────────────────────────────────────────────────────── */
const byId = new Map(existing.results.map(r => [r.cp_id, r]));
let upserted = 0;

for (const result of newResults) {
  if (!result.cp_id) {
    console.warn(`⚠️  Resultado sin cp_id ignorado: ${JSON.stringify(result).substring(0, 80)}`);
    continue;
  }
  byId.set(result.cp_id, result);
  upserted++;
}

/* ── Escribir ─────────────────────────────────────────────────────────────── */
const merged = {
  module_id:   opts.moduleId,
  run_id:      opts.runId,
  executed_at: new Date().toISOString(),
  batch_id:    isNaN(opts.batchId) ? undefined : opts.batchId,
  results:     Array.from(byId.values()),
};

// Limpiar campos undefined
if (merged.batch_id === undefined) delete merged.batch_id;

try {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(merged, null, 2), 'utf8');
} catch (e) {
  die(`Error al escribir ${absPath}: ${e.message}`);
}

console.log(`✅ headless_results.json — ${merged.results.length} CPs total (${upserted} upserted en este batch)`);
process.exit(0);
