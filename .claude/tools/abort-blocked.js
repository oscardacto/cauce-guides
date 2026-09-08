#!/usr/bin/env node
/**
 * abort-blocked.js — Escribe artefactos BLOCKED de forma atómica cuando una
 * fase del pipeline aborta (browser MCP caído, MFA inválido, infra rota).
 *
 * Reemplaza la cadena prosa de § P26 + § P32 (/2.1) que el LLM tenía
 * que improvisar con `node -e` inline (frágil en Windows por escapes de
 * backslash) o creando scripts temporales en disco.
 *
 * Filosofía:
 *   Aplica la doctrina "prosa-vs-código" de CLAUDE.md. P32 era una lista de 5
 *   pasos determinísticos descritos en prosa. El LLM no decide nada — solo
 *   ejecuta una secuencia fija. → Es script atómico, no prosa.
 *
 * Hace internamente:
 *   1. Carga `cp_modulo_{module_id}.json` para extraer `steps_raw` de cada
 *      cp_id (shape REGLA 1: fidelidad 1:1 con steps[]).
 *   2. Por cada cp_id: calcula slug canónico (REGLA 2.1), crea carpeta,
 *      escribe `result.json` BLOCKED con N steps en NOT_EXECUTED.
 *   3. Escribe `execution_blocked.json` a nivel run_folder.
 *   4. Mergea `module_result.json` (shape REGLA 3): preserva resultados
 *      previos de OTROS cp_ids del módulo, upsert los BLOCKED actuales,
 *      recalcula summary.
 *   5. Idem `headless_results.json` (upsert por cp_id).
 *
 * Uso:
 *   node abort-blocked.js \
 *     --run-id "MiApp-v1.0-20260101-0900" \
 *     --module-id "auth" \
 *     --cp-ids '["CP-auth-014"]' \
 *     --reason "browser_mcp_unavailable" \
 *     --action-required "Reiniciar MCP server playwright en VSCode → Ctrl+Shift+P → Claude: Restart MCP Server" \
 *     --detected-via "ToolSearch:0_hits"
 *
 * Output JSON (stdout):
 *   {
 *     ok: true,
 *     run_id, module_id,
 *     blocked_count: N,
 *     files_written: ["execution_blocked.json", "execution/auth/014/result.json", ...],
 *     reason, blocked_at
 *   }
 *
 * Exit codes:
 *   0 — OK, artefactos escritos
 *   1 — error fatal (run_folder ausente, cp_modulo missing, cp_id no encontrado)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { cpIdToFolder, cpIdToFolderFromKnownModules } = require('./lib/cp-slug.js');

function die(msg, code = 1) {
  process.stderr.write(`[abort-blocked] FATAL: ${msg}\n`);
  process.exit(code);
}

function toForwardSlashes(p) {
  return p.replace(/\\/g, '/');
}

function parseStepsRaw(stepsRaw) {
  // REGLA 1 canonical parsing: split \n, strip "- ", trim, filter empty
  if (!stepsRaw) return [];
  return String(stepsRaw)
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(line => line.length > 0);
}

function parseArgs() {
  const out = {
    runId: null,
    moduleId: null,
    cpIds: null,
    reason: 'browser_mcp_unavailable',
    actionRequired: '',
    detectedVia: null,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '--run-id')                out.runId          = next();
    else if (a === '--module-id')        out.moduleId       = next();
    else if (a === '--cp-ids')           out.cpIds          = next();
    else if (a === '--reason')           out.reason         = next();
    else if (a === '--action-required')  out.actionRequired = next();
    else if (a === '--detected-via')     out.detectedVia    = next();
  }
  if (!out.runId)      die('--run-id es obligatorio');
  if (!out.moduleId)   die('--module-id es obligatorio');
  if (!out.cpIds)      die('--cp-ids es obligatorio (JSON array)');
  let cpIdsArr;
  try { cpIdsArr = JSON.parse(out.cpIds); }
  catch { die(`--cp-ids debe ser JSON array válido. Recibido: ${out.cpIds}`); }
  if (!Array.isArray(cpIdsArr) || cpIdsArr.length === 0) {
    die('--cp-ids debe ser un JSON array no vacío');
  }
  out.cpIds = cpIdsArr;
  return out;
}

function recalcSummary(results) {
  // executed = passed + failed (CPs que sí corrieron). blocked aparte.
  const summary = { executed: 0, passed: 0, failed: 0, blocked: 0 };
  for (const r of results) {
    const st = String(r.status || '').toUpperCase();
    if (st === 'PASS' || st === 'PASSED')      { summary.passed++;  summary.executed++; }
    else if (st === 'FAIL' || st === 'FAILED') { summary.failed++;  summary.executed++; }
    else if (st === 'BLOCKED')                 { summary.blocked++; }
  }
  return summary;
}

function upsertResults(existing, additions) {
  // Reemplaza por cp_id; preserva resultados de otros cp_ids (idempotente).
  const addIds = new Set(additions.map(r => r.cp_id));
  const filtered = (existing || []).filter(r => !addIds.has(r.cp_id));
  return [...filtered, ...additions];
}

function main() {
  const args = parseArgs();
  const ROOT          = process.cwd();
  const RUN_FOLDER    = path.join(ROOT, 'docs', 'testing', 'atf-web', args.runId);
  const EXECUTION_DIR = path.join(RUN_FOLDER, 'execution');
  const MODULE_DIR    = path.join(EXECUTION_DIR, args.moduleId);
  const DESIGN_DIR    = path.join(RUN_FOLDER, 'design');
  const CP_MODULO     = path.join(DESIGN_DIR, `cp_modulo_${args.moduleId}.json`);

  if (!fs.existsSync(RUN_FOLDER)) die(`run_folder no existe: ${RUN_FOLDER}`);
  if (!fs.existsSync(CP_MODULO))  die(`${CP_MODULO} no existe`);

  let cpModuloData;
  try { cpModuloData = JSON.parse(fs.readFileSync(CP_MODULO, 'utf8')); }
  catch (e) { die(`${CP_MODULO} corrupto: ${e.message}`); }

  const idsSet = new Set(args.cpIds);
  const resolvedCps = (cpModuloData.test_cases || []).filter(c => idsSet.has(c.cp_id));
  if (resolvedCps.length !== args.cpIds.length) {
    const found = new Set(resolvedCps.map(c => c.cp_id));
    const missing = args.cpIds.filter(id => !found.has(id));
    die(`cp_ids no encontrados en ${CP_MODULO}: ${missing.join(', ')}`);
  }

  fs.mkdirSync(MODULE_DIR, { recursive: true });

  // — derivar known modules desde design/ para slug consistente
  // con módulos multi-palabra (admin-organization, email-config).
  const knownModules = (() => {
    if (!fs.existsSync(DESIGN_DIR)) return [args.moduleId];
    return fs.readdirSync(DESIGN_DIR)
      .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
      .map(f => f.replace(/^cp_modulo_/, '').replace(/\.json$/, ''));
  })();

  const nowIso = new Date().toISOString();
  const filesWritten = [];
  const blockedResults = [];

  // 1) result.json BLOCKED por cada cp_id (shape REGLA 1+5+6)
  for (const cp of resolvedCps) {
    const slug   = cpIdToFolderFromKnownModules(cp.cp_id, knownModules);
    const cpDir  = path.join(MODULE_DIR, slug);
    fs.mkdirSync(cpDir, { recursive: true });

    const stepsParsed = parseStepsRaw(cp.steps_raw);
    const steps = stepsParsed.map((text, i) => ({
      n: i + 1,
      text,
      status: 'NOT_EXECUTED',
      interactions: [],
    }));

    const evidenceDirRel = toForwardSlashes(path.relative(RUN_FOLDER, cpDir)) + '/';

    const result = {
      cp_id: cp.cp_id,
      source_id: cp.source_id || null,
      module_id: args.moduleId,
      status: 'BLOCKED',
      duration_ms: 0,
      failed_step: null,
      error_message: `${args.reason} — ${args.actionRequired}`,
      blocked_reason: args.reason,
      evidence_dir: evidenceDirRel,
      setup_steps: [],
      steps,
      db_validations: [],
      db_connection_failed: false,
      bug_candidate: null,
      executed_at: nowIso,
    };

    const resPath = path.join(cpDir, 'result.json');
    fs.writeFileSync(resPath, JSON.stringify(result, null, 2), 'utf8');
    filesWritten.push(toForwardSlashes(path.relative(ROOT, resPath)));

    blockedResults.push({
      cp_id: cp.cp_id,
      source_id: cp.source_id || null,
      module_id: args.moduleId,
      status: 'BLOCKED',
      duration_ms: 0,
      blocked_reason: args.reason,
      evidence_dir: evidenceDirRel,
      steps_total: steps.length,
      steps_passed: 0,
      executed_at: nowIso,
    });
  }

  // 2) execution_blocked.json (run-level)
  const ebPath = path.join(RUN_FOLDER, 'execution_blocked.json');
  fs.writeFileSync(ebPath, JSON.stringify({
    run_id: args.runId,
    module_id: args.moduleId,
    cp_targets: args.cpIds,
    blocked_at: nowIso,
    reason: args.reason,
    detected_via: args.detectedVia,
    action_required: args.actionRequired,
    rule_reference: 'reference/atf-web/sofka-asdd-atf-web-orchestrator-fastpath-rules.md § P26 + § P32',
  }, null, 2), 'utf8');
  filesWritten.push(toForwardSlashes(path.relative(ROOT, ebPath)));

  // 3) module_result.json (shape REGLA 3) — merge con resultados previos del módulo
  const mrPath = path.join(MODULE_DIR, 'module_result.json');
  let moduleResult = null;
  if (fs.existsSync(mrPath)) {
    try { moduleResult = JSON.parse(fs.readFileSync(mrPath, 'utf8')); }
    catch { moduleResult = null; }
  }
  if (!moduleResult || !moduleResult.summary) {
    moduleResult = { module_id: args.moduleId, summary: {}, results: [] };
  }
  moduleResult.results = upsertResults(moduleResult.results, blockedResults);
  moduleResult.summary = recalcSummary(moduleResult.results);
  fs.writeFileSync(mrPath, JSON.stringify(moduleResult, null, 2), 'utf8');
  filesWritten.push(toForwardSlashes(path.relative(ROOT, mrPath)));

  // 4) headless_results.json — merge incremental por cp_id
  const hrPath = path.join(MODULE_DIR, 'headless_results.json');
  let headlessResults = null;
  if (fs.existsSync(hrPath)) {
    try { headlessResults = JSON.parse(fs.readFileSync(hrPath, 'utf8')); }
    catch { headlessResults = null; }
  }
  if (!headlessResults || !Array.isArray(headlessResults.results)) {
    headlessResults = { module_id: args.moduleId, run_id: args.runId, results: [] };
  }
  headlessResults.results = upsertResults(headlessResults.results, blockedResults);
  fs.writeFileSync(hrPath, JSON.stringify(headlessResults, null, 2), 'utf8');
  filesWritten.push(toForwardSlashes(path.relative(ROOT, hrPath)));

  // 5) Output JSON consolidado
  process.stdout.write(JSON.stringify({
    ok: true,
    run_id: args.runId,
    module_id: args.moduleId,
    blocked_count: blockedResults.length,
    files_written: filesWritten,
    reason: args.reason,
    blocked_at: nowIso,
  }, null, 2) + '\n');
  process.exit(0);
}

try { main(); }
catch (err) {
  process.stderr.write(`[abort-blocked] UNCAUGHT: ${err.message}\n${err.stack}\n`);
  process.exit(1);
}
