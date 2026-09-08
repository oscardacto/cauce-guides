#!/usr/bin/env node
// ATF — strategize-merge.js
//
// Soporte de sprint-incremental para /asdd:qa-web-strategize. Análogo a diagnose-merge.js
//: preserva el trabajo previo del strategist (priority, notes,
// dependencies_in/outbound) cuando re-ejecutas /asdd:qa-web-strategize sobre un run que
// ya tiene execution_plan.json, agregando módulos solo para HUs nuevas.
//
// Sub-comandos:
//   pre-check   — emite mode + snapshot del plan existente (o "fresh" si no existe)
//   post-merge  — mergea el output recién escrito por el strategist con el snapshot
//                 pre-strategize, preservando metadata enriquecida del trabajo previo
//
// Uso:
//   node strategize-merge.js pre-check  --run-id {RUN}
//   node strategize-merge.js post-merge --run-id {RUN}
//
// Stdout (pre-check, JSON):
//   {
//     ok, mode: "fresh"|"append",
//     existing_modules: [ {module_id, hus[], priority, notes, ...} ],
//     existing_hus: [hu_id, ...],
//     snapshot_path: ".tmp/pre_strategize_snapshot.json"
//   }
//
// Stdout (post-merge, JSON):
//   {
//     ok, mode: "fresh"|"append",
//     modules_total, modules_added, modules_preserved, modules_updated,
//     execution_plan_path
//   }
//
// Exit codes:
//   0 = OK
//   1 = error fatal

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) { process.stderr.write(`strategize-merge: ${msg}\n`); process.exit(1); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i+1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
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

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function resolveRunDir(runId) {
  if (!runId) die('--run-id es obligatorio');
  return path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', runId);
}

function preCheck(args) {
  const runId = args['run-id'];
  const runDir = resolveRunDir(runId);
  if (!fs.existsSync(runDir)) die(`run no existe: ${runDir}`);

  const strategyDir = path.join(runDir, 'strategy');
  const planPath = path.join(strategyDir, 'execution_plan.json');
  const tmpDir = path.join(strategyDir, '.tmp');
  ensureDir(tmpDir);
  const snapshotPath = path.join(tmpDir, 'pre_strategize_snapshot.json');

  const existingPlan = readJSON(planPath);
  const out = {
    ok: true,
    run_id: runId,
    mode: existingPlan ? 'append' : 'fresh',
    existing_modules: existingPlan ? (existingPlan.modules || []) : [],
    existing_hus: existingPlan
      ? (existingPlan.modules || []).flatMap(m => Array.isArray(m.hus) ? m.hus : [])
      : [],
    snapshot_path: existingPlan ? path.relative(PROJECT_ROOT, snapshotPath) : null,
  };

  // Si hay plan existente, guardamos snapshot pre-strategize (atómico)
  if (existingPlan) {
    writeJSONAtomic(snapshotPath, existingPlan);
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(0);
}

function postMerge(args) {
  const runId = args['run-id'];
  const runDir = resolveRunDir(runId);
  if (!fs.existsSync(runDir)) die(`run no existe: ${runDir}`);

  const strategyDir = path.join(runDir, 'strategy');
  const planPath = path.join(strategyDir, 'execution_plan.json');
  const snapshotPath = path.join(strategyDir, '.tmp', 'pre_strategize_snapshot.json');

  const newPlan = readJSON(planPath);
  if (!newPlan) die(`execution_plan.json no encontrado en ${planPath}`);

  const oldPlan = readJSON(snapshotPath);
  if (!oldPlan) {
    // Mode: fresh — nada que mergear
    process.stdout.write(JSON.stringify({
      ok: true, mode: 'fresh', modules_total: (newPlan.modules || []).length,
      modules_added: (newPlan.modules || []).length, modules_preserved: 0, modules_updated: 0,
      execution_plan_path: planPath,
    }, null, 2) + '\n');
    process.exit(0);
  }

  // Mode: append — mergear preservando metadata del trabajo previo
  const oldByModule = {};
  for (const m of (oldPlan.modules || [])) {
    if (m.module_id) oldByModule[m.module_id] = m;
  }
  const newByModule = {};
  for (const m of (newPlan.modules || [])) {
    if (m.module_id) newByModule[m.module_id] = m;
  }

  let added = 0, preserved = 0, updated = 0;
  const merged = [];

  // 1) Para cada módulo del nuevo plan, preservar metadata del viejo si coincide
  for (const newMod of (newPlan.modules || [])) {
    const old = oldByModule[newMod.module_id];
    if (old) {
      // Módulo existente: preservar priority/notes/dependencies del PRE;
      // tomar hus/risk_summary/estimated_cps/cp_file del NEW (refleja realidad actual).
      merged.push({
        ...newMod,
        priority:              old.priority              || newMod.priority,
        notes:                 old.notes                 || newMod.notes,
        dependencies_inbound:  Array.isArray(old.dependencies_inbound)  ? old.dependencies_inbound  : (newMod.dependencies_inbound  || []),
        dependencies_outbound: Array.isArray(old.dependencies_outbound) ? old.dependencies_outbound : (newMod.dependencies_outbound || []),
        primary_actor:         old.primary_actor         || newMod.primary_actor,
      });
      updated++;
    } else {
      // Módulo nuevo
      merged.push(newMod);
      added++;
    }
  }

  // 2) Para cada módulo del plan viejo NO presente en el nuevo, preservar tal cual
  //    (defensa: el strategist puede haber omitido un módulo por error)
  for (const oldMod of (oldPlan.modules || [])) {
    if (!newByModule[oldMod.module_id]) {
      merged.push(oldMod);
      preserved++;
    }
  }

  // Escribir plan consolidado preservando otros campos del newPlan
  const finalPlan = {
    ...newPlan,
    modules: merged,
    merge_strategy: { mode: 'append', preserved_from_snapshot: preserved, updated, added },
  };
  writeJSONAtomic(planPath, finalPlan);

  process.stdout.write(JSON.stringify({
    ok: true, mode: 'append',
    modules_total: merged.length,
    modules_added: added,
    modules_preserved: preserved,
    modules_updated: updated,
    execution_plan_path: planPath,
  }, null, 2) + '\n');
  process.exit(0);
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  if (!cmd) die('sub-comando requerido: pre-check | post-merge');
  if (cmd === 'pre-check')  return preCheck(args);
  if (cmd === 'post-merge') return postMerge(args);
  die(`sub-comando desconocido: ${cmd}`);
}

main();
