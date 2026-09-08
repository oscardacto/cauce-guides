#!/usr/bin/env node
/**
 * ATF — validate-execution-output.js
 *
 * Normaliza artefactos de ejecución ANTES de generar el reporte.
 * Auto-corrige desviaciones de schema conocidas sin pérdida de datos.
 *
 * Uso:
 *   node .claude/tools/validate-execution-output.js <run_id>
 *   node .claude/tools/validate-execution-output.js   ← usa el run más reciente
 *
 * Correcciones automáticas:
 *   [1] module_result.json: summary.pass→passed / summary.fail→failed
 *   [2] responsive: stubs BLOCKED para viewports faltantes (REGLA 28) +
 *       root result.json consolidado si ausente (REGLA 31)
 *
 * Exit 0 → artefactos normalizados, reporte puede generarse
 * Exit 1 → error irrecuperable (run_folder no existe / JSON corrupto crítico)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');
const KNOWLEDGE    = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'knowledge');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const { readJSON, writeJSON } = require('./lib/json-utils');

function writeText(filePath, text) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, text, 'utf-8');
}

function findFiles(dir, matchFn) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, matchFn));
    else if (matchFn(entry.name)) results.push(full);
  }
  return results;
}

// ─── FIX 1 — module_result.json: pass/fail → passed/failed ───────────────────

function fixModuleResults(runDir) {
  const files = findFiles(path.join(runDir, 'execution'), n => n === 'module_result.json');
  let fixed = 0, ok = 0;

  for (const f of files) {
    const data = readJSON(f);
    if (!data) continue;
    const s = data.summary;
    if (!s) continue;
    let dirty = false;

    if ('pass' in s && !('passed' in s))   { s.passed  = s.pass;  delete s.pass;  dirty = true; }
    if ('fail' in s && !('failed' in s))   { s.failed  = s.fail;  delete s.fail;  dirty = true; }
    if (!('passed'  in s)) { s.passed  = 0; dirty = true; }
    if (!('failed'  in s)) { s.failed  = 0; dirty = true; }
    if (!('blocked' in s)) { s.blocked = 0; dirty = true; }

    if (data.coverage_by_risk) {
      for (const lvl of Object.values(data.coverage_by_risk)) {
        if ('pass' in lvl && !('passed' in lvl)) { lvl.passed = lvl.pass; delete lvl.pass; dirty = true; }
        if ('fail' in lvl && !('failed' in lvl)) { lvl.failed = lvl.fail; delete lvl.fail; dirty = true; }
      }
    }

    if (dirty) { writeJSON(f, data); fixed++; console.log(`  ✔ normalizado: ${path.relative(runDir, f)}`); }
    else ok++;
  }

  const total = fixed + ok;
  if (total === 0) {
    console.log('⚠  module_result.json: ningún archivo encontrado (¿FASE 2C no ejecutada?)');
  } else {
    console.log(`✓ module_result.json: ${total} archivo(s) — ${fixed} normalizado(s), ${ok} ya correcto(s)`);
  }
  return true;
}

// ─── FIX 2 — responsive: REGLA 28 + REGLA 31 ─────────────────────────────────

const STATUS_ORDER_VP = { FAIL: 0, BLOCKED: 1, PASS: 2 };

function aggregateStrictVp(statuses) {
  let worst = 'PASS';
  for (const s of statuses) {
    const norm  = String(s || 'BLOCKED').toUpperCase();
    const oNorm  = STATUS_ORDER_VP[norm]  ?? 1;
    const oWorst = STATUS_ORDER_VP[worst] ?? 2;
    if (oNorm < oWorst) worst = norm;
  }
  return worst;
}

function fixResponsiveResults(runDir) {
  const execCtxPath = path.join(runDir, '.tmp', 'exec_context.json');
  const ctx = readJSON(execCtxPath);

  if (!ctx?.responsive?.enabled) {
    console.log('✓ responsive: deshabilitado o sin exec_context — omitiendo FIX 2');
    return true;
  }

  const viewports    = ctx.responsive.viewports || [];
  const resultPolicy = ctx.responsive.result_policy || 'strict';

  if (viewports.length === 0) {
    console.log('⚠  responsive: habilitado pero sin viewports configurados — omitiendo FIX 2');
    return true;
  }

  const expectedVpNames = new Set(viewports.map(v => v.name));
  const execDir         = path.join(runDir, 'execution');

  if (!fs.existsSync(execDir)) {
    console.log('⚠  responsive: carpeta execution/ no encontrada — omitiendo FIX 2');
    return true;
  }

  let cpsChecked = 0, vpStubs = 0, rootFixed = 0;
  const now = new Date().toISOString();

  for (const modEntry of fs.readdirSync(execDir, { withFileTypes: true })) {
    if (!modEntry.isDirectory()) continue;
    const moduleId  = modEntry.name;
    const moduleDir = path.join(execDir, moduleId);

    for (const cpEntry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
      if (!cpEntry.isDirectory()) continue;
      const slug  = cpEntry.name;
      const cpDir = path.join(moduleDir, slug);

      // Solo CPs responsive: aquellos con al menos un subdirectorio de viewport esperado
      const vpSubDirs = fs.readdirSync(cpDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && expectedVpNames.has(e.name));
      if (vpSubDirs.length === 0) continue;

      cpsChecked++;

      // Intentar obtener cp_id desde cualquier result.json disponible
      let cpId = null;
      for (const vp of viewports) {
        const vpData = readJSON(path.join(cpDir, vp.name, 'result.json'));
        if (vpData?.cp_id) { cpId = vpData.cp_id; break; }
      }
      if (!cpId) {
        const rootData = readJSON(path.join(cpDir, 'result.json'));
        if (rootData?.cp_id) cpId = rootData.cp_id;
      }
      if (!cpId) cpId = `${moduleId}/${slug}`;  // fallback legible

      // FIX 2a — stubs BLOCKED para viewports faltantes (REGLA 28)
      for (const vp of viewports) {
        const vpDir        = path.join(cpDir, vp.name);
        const vpResultPath = path.join(vpDir, 'result.json');
        if (!readJSON(vpResultPath)) {
          const stub = {
            cp_id:         cpId,
            module_id:     moduleId,
            viewport:      vp.name,
            status:        'BLOCKED',
            blocked_reason: 'viewport_not_executed',
            error_message:  'viewport_not_executed — stub generado por validate-execution-output FIX 2',
            steps:          [],
            failed_step:    null,
            duration_ms:    0,
            steps_total:    0,
            steps_passed:   0,
            evidence_dir:   null,
            executed_at:    now,
            synthetic:      true,
            viewport_meta:  { requested: { name: vp.name, width: vp.width || null, height: vp.height || null }, observed: null },
          };
          fs.mkdirSync(vpDir, { recursive: true });
          writeJSON(vpResultPath, stub);
          vpStubs++;
          console.log(`  ✔ viewport stub BLOCKED: ${path.relative(runDir, vpResultPath)}`);
        }
      }

      // FIX 2b — root result.json consolidado faltante (REGLA 31)
      const rootResultPath = path.join(cpDir, 'result.json');
      if (!readJSON(rootResultPath)) {
        const vpResults = viewports.map(vp => {
          const vpData  = readJSON(path.join(cpDir, vp.name, 'result.json')) || {};
          return {
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
          };
        });

        const aggregatedStatus = aggregateStrictVp(vpResults.map(v => v.status));
        const failedVp = vpResults.find(v => v.status === 'FAIL');

        const consolidated = {
          cp_id:            cpId,
          module_id:        moduleId,
          status:           aggregatedStatus,
          responsive:       true,
          result_policy:    resultPolicy,
          viewport_results: vpResults,
          steps:            [],  // REGLA 31
          failed_step:      failedVp?.failed_step || null,
          error_message:    aggregatedStatus !== 'PASS'
            ? `Responsive aggregate [validate-fix2/${resultPolicy}]: ${aggregatedStatus}`
            : null,
          duration_ms:   vpResults.reduce((s, v) => s + (v.duration_ms || 0), 0),
          steps_total:   vpResults.reduce((s, v) => s + (v.steps_total  || 0), 0),
          steps_passed:  vpResults.reduce((s, v) => s + (v.steps_passed || 0), 0),
          evidence_dir:  `execution/${moduleId}/${slug}/`,
          executed_at:   now,
          viewports_count:   viewports.length,
          viewports_missing: [],
        };
        writeJSON(rootResultPath, consolidated);
        rootFixed++;
        console.log(`  ✔ root result.json consolidado: ${path.relative(runDir, rootResultPath)}`);
      }
    }
  }

  if (cpsChecked === 0) {
    console.log('✓ responsive: habilitado pero sin CPs responsive detectados en execution/');
  } else {
    console.log(
      `✓ responsive: ${cpsChecked} CP(s) responsive — ` +
      `${vpStubs} stub(s) viewport BLOCKED creados, ${rootFixed} root result.json consolidados`
    );
  }
  return true;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(runId) {
  const runDir = path.join(OUTPUT_BASE, runId);
  console.log(`\n⬡  ATF — validate-execution-output.js`);
  console.log(`   run_id : ${runId}`);
  console.log(`   carpeta: ${runDir}\n`);

  if (!fs.existsSync(runDir)) {
    console.error(`❌ run_folder no encontrado: ${runDir}`);
    process.exit(1);
  }

  fixModuleResults(runDir);
  fixResponsiveResults(runDir);

  console.log('\n✅ Normalización completada — artefactos listos para generate-report.js\n');
  process.exit(0);
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const runIdArg = args.find(a => !a.startsWith('--'));

if (!runIdArg) {
  if (!fs.existsSync(OUTPUT_BASE)) {
    console.error(`❌ No existe la carpeta de outputs: ${OUTPUT_BASE}`);
    process.exit(1);
  }
  const runs = fs.readdirSync(OUTPUT_BASE)
    .filter(d => { try { return fs.statSync(path.join(OUTPUT_BASE, d)).isDirectory(); } catch { return false; } })
    .sort().reverse();
  if (!runs.length) {
    console.error('❌ No se encontró ningún run. Uso: node validate-execution-output.js <run_id>');
    process.exit(1);
  }
  console.log(`ℹ  run_id no especificado — usando el más reciente: ${runs[0]}`);
  main(runs[0]);
} else {
  main(runIdArg);
}
