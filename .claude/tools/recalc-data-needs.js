#!/usr/bin/env node
// ATF — recalc-data-needs.js (cierre)
//
// Recálculo determinístico de `data_needs_summary` sobre un cp_modulo_*.json
// existente, a partir de los `test_cases[].data_needs[]` ya poblados.
//
// Red de seguridad complementaria a la de design-merge.js (que sólo aplica
// en merges nuevos en modo `single_hu`). Si un cp_modulo conserva
// `total_needs: 0` aunque sus CPs tengan `data_needs[]`, este script lo
// recalcula sin re-ejecutar /sofka-asdd:qa-web-design.
//
// Uso:
//   node recalc-data-needs.js --cp-file <ruta-cp_modulo>
//
// Stdout JSON:
//   { ok, cp_file, before: {total_needs}, after: {total_needs, by_provisioning},
//     mutated, real_count }
//
// Exit codes: 0 OK · 1 archivo ausente / JSON corrupto.

'use strict';

const fs   = require('fs');
const path = require('path');

function die(msg) { process.stderr.write(`recalc-data-needs: ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i+1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    }
  }
  return out;
}

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`JSON inválido en ${p}: ${e.message}`); }
}

function writeJSONAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args['cp-file']) die('--cp-file es obligatorio');
  const cpFile = path.resolve(args['cp-file']);
  if (!fs.existsSync(cpFile)) die(`cp_modulo no encontrado: ${cpFile}`);

  const cp = readJSON(cpFile);
  const beforeTotal = cp.data_needs_summary?.total_needs || 0;

  // Recalcular determinísticamente desde test_cases[]
  let total = 0;
  const byProvisioning = {};
  const clientActions = new Set(cp.data_needs_summary?.client_action_required || []);
  const cpDeps = new Set(cp.data_needs_summary?.cp_dependencies || []);

  for (const tc of (cp.test_cases || [])) {
    const needs = Array.isArray(tc.data_needs) ? tc.data_needs : [];
    total += needs.length;
    for (const n of needs) {
      const prov = (n && n.provisioning) || 'unspecified';
      byProvisioning[prov] = (byProvisioning[prov] || 0) + 1;
      // Recolectar action_required y dependencies si vienen en el needed
      if (n && n.client_action) clientActions.add(n.client_action);
      if (n && Array.isArray(n.depends_on_cps)) {
        for (const d of n.depends_on_cps) cpDeps.add(d);
      }
    }
  }

  // Mutar el doc (preserva cualquier otro campo del summary que no recalculamos)
  cp.data_needs_summary = cp.data_needs_summary || {};
  cp.data_needs_summary.total_needs = total;
  cp.data_needs_summary.by_provisioning = byProvisioning;
  cp.data_needs_summary.client_action_required = [...clientActions];
  cp.data_needs_summary.cp_dependencies = [...cpDeps];
  cp.data_needs_summary.recalc_at = new Date().toISOString();

  const mutated = beforeTotal !== total;
  if (mutated) {
    writeJSONAtomic(cpFile, cp);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    cp_file: cpFile,
    before: { total_needs: beforeTotal },
    after: {
      total_needs: total,
      by_provisioning: byProvisioning,
      client_action_required_count: clientActions.size,
      cp_dependencies_count: cpDeps.size,
    },
    mutated,
    real_count: total,
  }, null, 2) + '\n');

  process.exit(0);
}

main();
