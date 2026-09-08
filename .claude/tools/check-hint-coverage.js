#!/usr/bin/env node
/**
 * check-hint-coverage.js — validador post-run de uso de selector_hints.
 *
 *  — reemplaza check-lookup-first.js (deprecated). La
 * métrica anterior medía `lookups runtime / interactive_steps`. Tras 
 * el lookup runtime ya NO es obligatorio (los hints se inyectan en preflight,
 * los records se sintetizan vía backfill). La métrica obsoleta reportaba
 * falsos positivos en TODOS los CPs.
 *
 * Nueva métrica: **hint coverage rate** = de los hints inyectados por el
 * preflight, ¿cuántos terminó usando el sub-agent en `interactions[].selector_used`?
 *
 *   ratio = hints_used / hints_inyectados
 *
 * Detecta:
 *   - Sub-agent ignora hints válidos y descubre por snapshot innecesariamente
 *     (regresión a comportamiento pre-Sprint-4.2).
 *   - Hints stale: el preflight inyecta selectores que ya no resuelven en runtime
 *     (el sub-agent debe descubrir alternativos). Esto NO es violación —
 *     es señal de que el nav_map necesita refresh.
 *
 * Mecánica:
 *   1. Lee `docs/testing/atf-web/{run_id}/.tmp/exec_context.json` → `cp_targets_resolved[].selector_hints`.
 *   2. Lee cada `result.json` → `steps[].interactions[].selector_used`.
 *   3. Por cada hint con selector S, verifica si algún `interactions[].selector_used`
 *      del mismo `step_n` matchea S (substring match — el sub-agent puede usar
 *      un selector más específico, ej. agregar `:nth-of-type(N)`).
 *   4. ratio = hints_matched / hints_total. CPs sin hints = `null` (no medible).
 *
 * Uso:
 *   node check-hint-coverage.js --run-id=<id> [--threshold=0.7] [--output=<path>]
 *
 * Output stdout JSON:
 *   {
 *     "run_id": "...", "threshold": 0.7, "scanned_cps": N,
 *     "by_cp": [
 *       { "cp_id": "...", "hints_total": 2, "hints_used": 2, "ratio": 1.0, "ok": true },
 *       { "cp_id": "...", "hints_total": 0, "ratio": null, "ok": true, "note": "no_hints_provided" }
 *     ],
 *     "violations": [ ... ]
 *   }
 *
 * Exit:
 *   0 — siempre (no blocker, solo informativo).
 *
 * Threshold:
 *   0.7 (default) — al menos 70% de hints aprovechados.
 *   1.0 (estricto) — todos los hints deben usarse.
 *   0.0 — desactiva el check.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) {
  process.stderr.write(`[check-hint-coverage] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs() {
  const out = { threshold: 0.7 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run-id='))         out.runId = a.slice('--run-id='.length);
    else if (a.startsWith('--threshold='))  out.threshold = parseFloat(a.slice('--threshold='.length));
    else if (a.startsWith('--output='))     out.output = a.slice('--output='.length);
  }
  if (!out.runId) die('--run-id requerido');
  if (!Number.isFinite(out.threshold) || out.threshold < 0 || out.threshold > 1) {
    die(`--threshold debe ser número en [0, 1], recibido: ${out.threshold}`);
  }
  return out;
}

// Match flexible: el selector usado en runtime puede ser idéntico al hint o más
// específico (substring match). El sub-agent puede agregar `:nth-of-type(N)` o
// `[data-X]` extra para resolver ambigüedad — sigue siendo un hit del hint.
function selectorMatch(hintSelector, runtimeSelector) {
  if (!hintSelector || !runtimeSelector) return false;
  if (hintSelector === runtimeSelector) return true;
  return runtimeSelector.includes(hintSelector) || hintSelector.includes(runtimeSelector);
}

const args = parseArgs();
const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
if (!fs.existsSync(runFolder)) die(`run_folder no existe: ${runFolder}`);

const ctxPath = path.join(runFolder, '.tmp', 'exec_context.json');
let ctx;
try { ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')); }
catch (_) {
  // Sin exec_context (run pre-Sprint-4.2 o sin preflight) → métrica no aplicable.
  process.stdout.write(JSON.stringify({
    run_id: args.runId,
    threshold: args.threshold,
    scanned_cps: 0,
    by_cp: [],
    violations: [],
    note: 'exec_context.json ausente — métrica no aplicable a este run',
  }, null, 2) + '\n');
  process.exit(0);
}

const cpResolved = ctx.cp_targets_resolved || [];
const executionDir = path.join(runFolder, 'execution');

const byCp = [];

for (const cp of cpResolved) {
  const cpId = cp.cp_id;
  const moduleId = cp.module_id;
  const hints = cp.selector_hints || {};
  const hintsTotal = Object.keys(hints).length;

  // Localizar result.json del CP. Slug heurístico: parte tras el module_id.
  // ej: CP-admin-organization-HU01-007 con module=admin-organization → slug HU01-007.
  let slug = cpId.startsWith('CP-' + moduleId + '-')
    ? cpId.slice(('CP-' + moduleId + '-').length)
    : cpId;
  slug = slug.replace(/[,.]/g, '_');  // slug filesystem-safe (legacy comma/dot)

  const resultPath = path.join(executionDir, moduleId, slug, 'result.json');
  if (!fs.existsSync(resultPath)) {
    byCp.push({
      cp_id: cpId, hints_total: hintsTotal, hints_used: 0, ratio: null,
      ok: true, note: 'result_json_missing',
    });
    continue;
  }

  if (hintsTotal === 0) {
    byCp.push({
      cp_id: cpId, hints_total: 0, hints_used: 0, ratio: null,
      ok: true, note: 'no_hints_provided',
    });
    continue;
  }

  let result;
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); }
  catch (_) {
    byCp.push({
      cp_id: cpId, hints_total: hintsTotal, hints_used: 0, ratio: null,
      ok: true, note: 'result_json_unreadable',
    });
    continue;
  }

  // Indexar interactions por step_n
  const interactionsByStep = {};
  for (const step of (result.steps || [])) {
    const n = String(step.n);
    interactionsByStep[n] = step.interactions || [];
  }

  let hintsUsed = 0;
  const hintDetails = [];
  for (const [stepN, hint] of Object.entries(hints)) {
    const stepInteractions = interactionsByStep[stepN] || [];
    const used = stepInteractions.some(ix => selectorMatch(hint.selector, ix.selector_used));
    if (used) hintsUsed++;
    hintDetails.push({
      step_n: parseInt(stepN, 10),
      hint_selector: hint.selector,
      hint_label: hint.label,
      used,
    });
  }

  const ratio = hintsTotal > 0 ? hintsUsed / hintsTotal : null;
  const ok = ratio === null || ratio >= args.threshold;
  byCp.push({
    cp_id: cpId,
    hints_total: hintsTotal,
    hints_used: hintsUsed,
    ratio: ratio !== null ? Number(ratio.toFixed(3)) : null,
    ok,
    hints: hintDetails,
  });
}

byCp.sort((a, b) => (a.cp_id < b.cp_id ? -1 : 1));
const violations = byCp.filter(c => !c.ok);

const result = {
  run_id: args.runId,
  threshold: args.threshold,
  scanned_cps: byCp.length,
  by_cp: byCp,
  violations,
};

if (args.output) {
  const outAbs = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(result, null, 2), 'utf8');
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(0);
