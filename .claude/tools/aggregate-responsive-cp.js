#!/usr/bin/env node
/**
 * aggregate-responsive-cp.js — consolida resultados de viewports en el result.json
 * raíz de un CP (REGLA 28 / REGLA 31 de sofka-asdd-atf-web-executor-invariants.md).
 *
 * Lee todos los {viewport_name}/result.json para el CP dado, aplica la
 * result_policy configurada (strict: FAIL > BLOCKED > PASS) y escribe el
 * result.json consolidado en la raíz de la carpeta del CP.
 *
 * El result.json consolidado tiene:
 *   - status:            agregado según result_policy
 *   - viewport_results[]: referencias por viewport con status y path relativo
 *   - steps: []          vacío (REGLA 31 — steps viven en cada {viewport}/result.json)
 *   - responsive: true
 *
 * Viewports ausentes → se generan stubs BLOCKED para garantizar trazabilidad (REGLA 28).
 *
 * Uso:
 *   node .claude/tools/aggregate-responsive-cp.js \
 *     --run-id    "AppName-v1.0-20260101-0900" \
 *     --module-id "auth" \
 *     --cp-id     "CP-auth-001"
 *     [--exec-context "docs/testing/atf-web/{run_id}/.tmp/exec_context.json"]
 *     [--design-dir   "docs/testing/atf-web/{run_id}/design"]
 *
 * Output (stdout — JSON):
 *   {
 *     ok, cp_id, module_id, slug, status, result_policy,
 *     viewports_expected, viewports_found, missing_viewports, result_path
 *   }
 *
 * Exit: 0 OK | 1 error fatal | 2 viewports faltantes (BLOCKED stubs generados, continuar)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { readJSON, writeJSON }                      = require('./lib/json-utils');
const { cpIdToFolderFromKnownModules }             = require('./lib/cp-slug');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function die(msg) {
  process.stderr.write(`[aggregate-responsive-cp] ERROR: ${msg}\n`);
  process.exit(1);
}

function getArg(flag) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
}

// ─── POLICY ───────────────────────────────────────────────────────────────────

const STATUS_ORDER = { FAIL: 0, BLOCKED: 1, PASS: 2 };

/**
 * Aplica result_policy: strict — el status más severo prevalece.
 * FAIL > BLOCKED > PASS. Qualquier status desconocido se trata como BLOCKED.
 */
function aggregateStrict(statuses) {
  let worst = 'PASS';
  for (const s of statuses) {
    const norm = String(s || 'BLOCKED').toUpperCase();
    const orderNorm  = STATUS_ORDER[norm]  ?? 1; // desconocido → BLOCKED severity
    const orderWorst = STATUS_ORDER[worst] ?? 2;
    if (orderNorm < orderWorst) worst = norm;
  }
  return worst;
}

// ─── STUB BLOCKED ─────────────────────────────────────────────────────────────

function buildBlockedStub(cpId, moduleId, vp) {
  return {
    cp_id:         cpId,
    module_id:     moduleId,
    viewport:      vp.name,
    status:        'BLOCKED',
    blocked_reason: 'viewport_not_executed',
    error_message:  'viewport_not_executed — stub generado por aggregate-responsive-cp.js',
    steps:          [],
    failed_step:    null,
    duration_ms:    0,
    steps_total:    0,
    steps_passed:   0,
    evidence_dir:   null,
    executed_at:    new Date().toISOString(),
    synthetic:      true,
    viewport_meta: {
      requested: { name: vp.name, width: vp.width || null, height: vp.height || null },
      observed:   null,
    },
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  const runId          = getArg('--run-id');
  const moduleId       = getArg('--module-id');
  const cpId           = getArg('--cp-id');
  const vpFilterRaw    = getArg('--viewport-filter'); // "mobile" | "mobile,tablet" | null

  if (!runId)    die('--run-id requerido');
  if (!moduleId) die('--module-id requerido');
  if (!cpId)     die('--cp-id requerido');

  // viewport_filter: si no-vacío, solo se re-ejecutaron esos viewports en este run.
  // Los demás deben leerse tal como están en disco (sin generar BLOCKED stubs nuevos).
  const viewportFilter = vpFilterRaw
    ? new Set(vpFilterRaw.split(',').map(v => v.trim()).filter(Boolean))
    : null; // null = sin filtro = comportamiento normal (stubs para todos los faltantes)

  const runFolder    = path.join(OUTPUT_BASE, runId);
  const execCtxPath  = getArg('--exec-context') || path.join(runFolder, '.tmp', 'exec_context.json');
  const designDir    = getArg('--design-dir')   || path.join(runFolder, 'design');
  const executionDir = path.join(runFolder, 'execution');

  if (!fs.existsSync(runFolder)) die(`run_folder no encontrado: ${runFolder}`);

  // ── Leer exec_context.json ──
  const ctx = readJSON(execCtxPath);
  if (!ctx) die(`exec_context.json no encontrado o inválido: ${execCtxPath}`);

  const responsive = ctx.responsive;
  if (!responsive?.enabled) {
    die(`responsive.enabled = false en exec_context — no hay viewports que agregar`);
  }

  const viewports    = responsive.viewports || [];
  const resultPolicy = responsive.result_policy || 'strict';

  if (viewports.length === 0) die('exec_context.responsive.viewports está vacío');

  // ── Derivar slug del CP ──
  const knownModules = fs.existsSync(designDir)
    ? fs.readdirSync(designDir)
        .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
        .map(f => f.slice('cp_modulo_'.length, -'.json'.length))
    : [];

  const slug  = cpIdToFolderFromKnownModules(cpId, knownModules);
  const cpDir = path.join(executionDir, moduleId, slug);

  if (!fs.existsSync(cpDir)) die(`carpeta del CP no encontrada: ${cpDir}`);

  // ── Leer / generar result.json por viewport ──
  const vpResults  = [];
  const missingVps = [];
  let exitCode     = 0;

  for (const vp of viewports) {
    const vpDir        = path.join(cpDir, vp.name);
    const vpResultPath = path.join(vpDir, 'result.json');

    let vpData = readJSON(vpResultPath);

    if (!vpData) {
      const isFiltered = viewportFilter !== null && !viewportFilter.has(vp.name);

      if (isFiltered) {
        // Viewport excluido del filtro activo: no se ejecutó intencionalmente.
        // No generar BLOCKED stub — registrar como "sin resultado previo disponible".
        // El run fue parcial (Phase 5 viewport_filter), el viewport se ejecutará en otro run.
        process.stderr.write(
          `[aggregate-responsive-cp] INFO: viewport "${vp.name}" sin resultado ` +
          `(excluido por viewport_filter — no se genera BLOCKED stub)\n`
        );
        vpData = buildBlockedStub(cpId, moduleId, vp);
        vpData.blocked_reason = 'viewport_excluded_by_filter';
        vpData.error_message  = 'viewport_excluded_by_filter — este viewport no se ejecutó en este run (Phase 5 filtro selectivo)';
        // No escribir a disco — no es un resultado persistente de este run
        // Solo se incluye en la agregación para calcular el status consolidado
      } else {
        // Viewport esperado pero ausente — BLOCKED stub (REGLA 28)
        missingVps.push(vp.name);
        exitCode = 2;
        vpData = buildBlockedStub(cpId, moduleId, vp);
        fs.mkdirSync(vpDir, { recursive: true });
        writeJSON(vpResultPath, vpData);
        process.stderr.write(
          `[aggregate-responsive-cp] WARN: viewport "${vp.name}" ausente — ` +
          `BLOCKED stub escrito en ${path.relative(runFolder, vpResultPath)}\n`
        );
      }
    }

    vpResults.push({
      viewport_name:   vp.name,
      viewport_width:  vp.width  || null,
      viewport_height: vp.height || null,
      status:          String(vpData.status || 'BLOCKED').toUpperCase(),
      result_file:     `${vp.name}/result.json`,
      duration_ms:     vpData.duration_ms  || 0,
      steps_total:     vpData.steps_total  || 0,
      steps_passed:    vpData.steps_passed || 0,
      failed_step:     vpData.failed_step  || null,
      executed_at:     vpData.executed_at  || null,
      synthetic:       vpData.synthetic    || false,
    });
  }

  // ── Agregar status según policy ──
  // Solo 'strict' en v1 — FAIL > BLOCKED > PASS
  const aggregatedStatus = aggregateStrict(vpResults.map(v => v.status));

  // ── Métricas totales ──
  const totalDuration = vpResults.reduce((s, v) => s + (v.duration_ms || 0), 0);
  const totalSteps    = vpResults.reduce((s, v) => s + (v.steps_total  || 0), 0);
  const totalPassed   = vpResults.reduce((s, v) => s + (v.steps_passed || 0), 0);

  // Bug candidate: tomar del primer viewport con FAIL (para ALM backlog)
  const failedVp = vpResults.find(v => v.status === 'FAIL');
  let bugCandidate = null;
  if (failedVp) {
    const failedData = readJSON(path.join(cpDir, failedVp.viewport_name, 'result.json'));
    bugCandidate = failedData?.bug_candidate || null;
  }

  // ── Escribir root result.json (REGLA 31: steps[] vacío) ──
  const rootResult = {
    cp_id:            cpId,
    module_id:        moduleId,
    status:           aggregatedStatus,
    responsive:       true,
    result_policy:    resultPolicy,
    viewport_results: vpResults,
    steps:            [],  // REGLA 31 — steps viven en cada {viewport}/result.json
    failed_step:      failedVp?.failed_step || null,
    error_message:    aggregatedStatus !== 'PASS'
      ? `Responsive aggregate [${resultPolicy}]: ${aggregatedStatus} — viewports: ${vpResults.map(v => `${v.viewport_name}=${v.status}`).join(', ')}`
      : null,
    duration_ms:        totalDuration,
    steps_total:        totalSteps,
    steps_passed:       totalPassed,
    evidence_dir:       `execution/${moduleId}/${slug}/`,
    executed_at:        new Date().toISOString(),
    bug_candidate:      bugCandidate,
    viewports_count:    viewports.length,
    viewports_missing:  missingVps,
  };

  const rootResultPath = path.join(cpDir, 'result.json');
  writeJSON(rootResultPath, rootResult);

  // ── Stdout ──
  const summary = {
    ok:                 exitCode === 0,
    cp_id:              cpId,
    module_id:          moduleId,
    slug,
    status:             aggregatedStatus,
    result_policy:      resultPolicy,
    viewport_filter:    viewportFilter ? Array.from(viewportFilter) : null,
    viewports_expected: viewports.length,
    viewports_run:      viewportFilter ? viewports.filter(v => viewportFilter.has(v.name)).length : viewports.length,
    viewports_found:    vpResults.filter(v => !v.synthetic).length,
    missing_viewports:  missingVps,
    result_path:        path.relative(runFolder, rootResultPath).replace(/\\/g, '/'),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(exitCode);
}

main();
