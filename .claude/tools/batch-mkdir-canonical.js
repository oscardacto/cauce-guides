#!/usr/bin/env node
/**
 * batch-mkdir-canonical.js — Crea carpetas canónicas SOLO para los CPs del batch.
 *
 * Reemplaza el bloque inline R2.1.6 del execute.md (que pedía al LLM
 * expandir un `<JSON array de cps_to_execute>`). Un sub-agente puede expandir
 * mal ese JSON e incluir CPs ajenos al batch — incidente run OrangeHRM
 *: solicitando 1 CP de job-titles, se crearon 3 carpetas
 * (HU1-001, HU2-001, HU3-001) con 2 vacías permanentes.
 *
 * Doctrina prosa-vs-código: aquí no hay decisión de dominio — solo lectura
 * determinista de `exec_context.cp_targets_resolved[]` y `mkdir`. Migrar a
 * script elimina al LLM como fuente de verdad para qué carpetas crear.
 *
 * Uso:
 *   node .claude/tools/batch-mkdir-canonical.js \
 *     --exec-context "docs/testing/atf-web/{run_id}/.tmp/exec_context.json" \
 *     --run-folder   "docs/testing/atf-web/{run_id}" \
 *     [--batch-cp-ids '["CP-x","CP-y"]']  // opcional: limita a un subset
 *
 * Si `--batch-cp-ids` se omite, crea para TODOS los `cp_targets_resolved[]`
 * del exec_context (caso normal: el preflight ya filtró por batch).
 *
 * Si se pasa, intersecta `cp_targets_resolved[]` con los IDs dados (caso de
 * batch parcial dentro de un exec_context con múltiples batches).
 *
 * Output stdout: JSON con { ok, created, total, folders[] }.
 *
 * Exit codes: 0 = OK | 1 = error fatal (exec_context ausente, parse, etc.)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { cpIdToFolder, cpIdToFolderFromKnownModules } = require('./lib/cp-slug.js');

function die(msg) {
  process.stderr.write(`[batch-mkdir-canonical] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs() {
  const raw = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < raw.length; i++) {
    switch (raw[i]) {
      case '--exec-context': opts.execContext = raw[++i]; break;
      case '--run-folder':   opts.runFolder   = raw[++i]; break;
      case '--batch-cp-ids': opts.batchCpIds  = raw[++i]; break;
      case '--help': case '-h':
        process.stdout.write('Uso: ver header del archivo.\n');
        process.exit(0);
    }
  }
  return opts;
}

const opts = parseArgs();
if (!opts.execContext) die('--exec-context es requerido');
if (!opts.runFolder)   die('--run-folder es requerido');

if (!fs.existsSync(opts.execContext))
  die(`exec_context no encontrado: ${opts.execContext}`);

let ctx;
try {
  ctx = JSON.parse(fs.readFileSync(opts.execContext, 'utf8'));
} catch (e) {
  die(`exec_context JSON parse error: ${e.message}`);
}

const resolved = Array.isArray(ctx.cp_targets_resolved) ? ctx.cp_targets_resolved : [];
if (resolved.length === 0) die('exec_context.cp_targets_resolved[] vacío o ausente');

let targets = resolved;
if (opts.batchCpIds) {
  let filterIds;
  try {
    filterIds = JSON.parse(opts.batchCpIds);
  } catch (e) {
    die(`--batch-cp-ids JSON inválido: ${e.message}`);
  }
  if (!Array.isArray(filterIds)) die('--batch-cp-ids debe ser un array JSON');
  const filterSet = new Set(filterIds);
  targets = resolved.filter(t => filterSet.has(t.cp_id));
  if (targets.length === 0)
    die(`Ninguno de los cp_ids de --batch-cp-ids matchea cp_targets_resolved[]: ${filterIds.join(', ')}`);
}

const executionDir = path.join(opts.runFolder, 'execution');
const folders = [];
let created = 0;

// Derivar known modules desde los targets — robusto para módulos multi-palabra
const knownModules = [...new Set(targets.map(t => t.module_id).filter(Boolean))];

for (const t of targets) {
  if (!t.module_id || !t.cp_id) continue;
  const slug = cpIdToFolderFromKnownModules(t.cp_id, knownModules);
  const dir  = path.join(executionDir, t.module_id, slug);
  const existed = fs.existsSync(dir);
  if (!existed) {
    fs.mkdirSync(dir, { recursive: true });
    created++;
  }
  folders.push({
    module_id: t.module_id,
    cp_id: t.cp_id,
    slug,
    dir: path.relative(opts.runFolder, dir).replace(/\\/g, '/'),
    created: !existed,
  });
}

const out = {
  ok: true,
  created,
  total: targets.length,
  folders,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
process.exit(0);
