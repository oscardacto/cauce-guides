#!/usr/bin/env node
/**
 * ATF — design-precheck.js
 *
 * Pre-resuelve el contexto que el agente design-team necesita ANTES de invocarlo,
 * eliminando Reads redundantes durante la inferencia. Mismo patrón que
 * `diagnose-merge.js pre-check`.
 *
 * El agente design-team (modo standalone /asdd:qa-web-design) recibe el path a este JSON y
 * usa los campos pre-resueltos en lugar de hacer Reads de:
 *   - docs/testing/atf-web/knowledge/{app_behavior, test_gotchas}.{app}.md (excerpts)
 *   - {strategy_dir}/execution_plan.json (filtrado al módulo objetivo)
 *   - {strategy_dir}/risk_matrix.json (filtrado al módulo objetivo)
 *   - {diagnostics_dir}/base_pruebas.md (subset por HUs del módulo)
 *
 * Args:
 *   --run-id <id>          (obligatorio)
 *   --module <module_id>   (obligatorio en single-module; opcional si --all)
 *   --output <ruta>        (default: {run_folder}/.tmp/design_precheck.json)
 *
 * Stdout: JSON consolidado igual al output_path.
 * Exit: 0 OK · 1 error fatal.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');

function die(msg) {
  process.stderr.write(`design-precheck: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function readJSON(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`JSON inválido en ${p}: ${e.message}`); }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function excerpt(filePath, maxLines = 200) {
  if (!fs.existsSync(filePath)) return null;
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split('\n');
  if (lines.length <= maxLines) return txt;
  return lines.slice(0, maxLines).join('\n') +
    `\n\n[... truncado en línea ${maxLines}, total ${lines.length} líneas ...]`;
}

/** Filtra base_pruebas.md a las HUs del módulo. Conserva headers globales. */
function basePruebasSubset(md, huIds) {
  if (!md || !huIds || huIds.length === 0) return md;
  // Extraer head global (hasta el primer "## Módulo:")
  const moduloIdx = md.search(/^##\s+Módulo:/m);
  const head = moduloIdx >= 0 ? md.slice(0, moduloIdx) : '';

  // Por cada heading H3 (HU-X), incluir solo si su id está en huIds
  const huHeadings = [...md.matchAll(/^###\s+(HU-?\w+):\s*(.+?)$/gm)];
  const blocks = [];
  for (let i = 0; i < huHeadings.length; i++) {
    const m = huHeadings[i];
    const huLabel = m[1];
    // Match si huLabel aparece como prefijo de algún huId del módulo (HU-1 ↔ HU-1-consultar-...)
    const matches = huIds.some(id => String(id).startsWith(huLabel) || String(id) === huLabel);
    if (!matches) continue;
    const startIdx = m.index;
    const endIdx = i < huHeadings.length - 1 ? huHeadings[i + 1].index : md.length;
    blocks.push(md.slice(startIdx, endIdx));
  }
  // Sección "## Módulo: ..." reusable + bloques HU
  const moduleHeader = md.match(/^##\s+Módulo:.*$/m);
  return head + (moduleHeader ? moduleHeader[0] + '\n\n' : '') + blocks.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const runId = args['run-id'];
  const moduleId = args.module;
  if (!runId) die('--run-id es obligatorio');

  const runFolder = path.join(OUTPUT_BASE, runId);
  if (!fs.existsSync(runFolder)) die(`run_folder no existe: ${runFolder}`);

  const sessionCtx = readJSON(path.join(runFolder, 'session_context.json')) || {};
  const appName    = sessionCtx.app_name || '';

  // --- Knowledge excerpts (anti-self-read del agente) ---
  const knowledgeDir = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', 'knowledge');
  const knowledge_excerpts = {
    app_name:     appName,
    app_behavior: appName ? excerpt(path.join(knowledgeDir, `app_behavior.${appName}.md`)) : null,
    test_gotchas: appName ? excerpt(path.join(knowledgeDir, `test_gotchas.${appName}.md`)) : null,
  };

  // --- Inline context (campos del session_context que el agente necesita) ---
  const inline_context = {
    app_name:                appName,
    app_url:                 sessionCtx.app_url || '',
    app_version:             sessionCtx.app_version || '',
    app_environment:         sessionCtx.app_environment || '',
    notebooklm_enabled:      sessionCtx.notebooklm_enabled === true,
    notebooklm_notebook_id:  sessionCtx.notebooklm_notebook_id || '',
    diagnostics_dir:         sessionCtx.diagnostics_dir || path.join(runFolder, 'diagnostics'),
    strategy_dir:            sessionCtx.strategy_dir    || path.join(runFolder, 'strategy'),
    design_dir:              sessionCtx.design_dir      || path.join(runFolder, 'design'),
  };

  // --- Strategy subset (solo el módulo objetivo) ---
  const execPlan = readJSON(path.join(inline_context.strategy_dir, 'execution_plan.json'));
  const riskMat  = readJSON(path.join(inline_context.strategy_dir, 'risk_matrix.json'));

  let module_subset = null;
  let hus_asignadas = [];
  let risks_subset = [];

  if (moduleId && execPlan?.modules) {
    module_subset = execPlan.modules.find(m => m.module_id === moduleId) || null;
    if (module_subset) hus_asignadas = module_subset.hus || [];
  }

  if (moduleId && riskMat?.risks) {
    risks_subset = riskMat.risks.filter(r => r.module === moduleId);
  }

  // --- base_pruebas subset (solo HUs del módulo) ---
  const bpPath = path.join(inline_context.diagnostics_dir, 'base_pruebas.md');
  const bpFull = fs.existsSync(bpPath) ? fs.readFileSync(bpPath, 'utf8') : null;
  const base_pruebas_subset = (bpFull && hus_asignadas.length > 0)
    ? basePruebasSubset(bpFull, hus_asignadas)
    : bpFull;

  // --- Output ---
  const outputPath = args.output || path.join(runFolder, '.tmp', 'design_precheck.json');
  ensureDir(path.dirname(outputPath));

  const result = {
    ok: true,
    run_id: runId,
    module_id: moduleId || null,
    inline_context,
    knowledge_excerpts,
    module_subset,
    hus_asignadas,
    risks_subset,
    base_pruebas_subset,
    base_pruebas_full_path: bpPath,
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  // Stdout: versión sin los excerpts grandes para no saturar logs
  const stdout = {
    ok: true,
    run_id: runId,
    module_id: moduleId || null,
    output_path: outputPath,
    has_module_subset: !!module_subset,
    hus_asignadas_count: hus_asignadas.length,
    risks_subset_count: risks_subset.length,
    knowledge_app_behavior_chars: (knowledge_excerpts.app_behavior || '').length,
    knowledge_test_gotchas_chars: (knowledge_excerpts.test_gotchas || '').length,
    base_pruebas_subset_chars: (base_pruebas_subset || '').length,
    base_pruebas_full_chars: (bpFull || '').length,
  };
  process.stdout.write(JSON.stringify(stdout, null, 2) + '\n');
  process.exit(0);
}

main();
