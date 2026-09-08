#!/usr/bin/env node
/**
 * exec-preflight-perf.js — preflight para `/sofka-asdd:qa-web-perf`. Análogo a
 * exec-preflight-vua.js. Consolida en 1 invocación Node:
 *   1. validate_run          → run folder existe.
 *   2. read_app_config       → appweb.yaml + performance.enabled === true (gate).
 *   3. read_framework_config → config.yaml → performance (umbrales/reps/wait).
 *   4. probe_strategy        → execution_plan.json + e2e_flows[] no vacío.
 *                              Si falta → needs_strategist (el comando decide).
 *   5. filter_flows          → por flow_scope (critical/all) | performance.flows | --flows.
 *   6. resume_detection      → marca flujos con lighthouse_{id}.json existente como skip.
 *   7. write_perf_context    → output/{run_id}/.tmp/perf_context.json.
 *
 * Uso: node exec-preflight-perf.js --run-id=<id> [--flows=E2E-001,E2E-003] [--output=<path>]
 * stdout: JSON con { ok, total_ms, phases[], needs_strategist, needs_diagnostics,
 *                    flows_planned[], flows_planned_count, flows_to_skip_count,
 *                    perf_context_path, warnings }
 * exit: 0 OK (incl. needs_strategist=true) · 1 fatal (gate off, run inexistente, etc.)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg, extra) {
  process.stderr.write('[exec-preflight-perf] ERROR: ' + msg + '\n');
  if (extra) process.stderr.write(JSON.stringify(extra, null, 2) + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { runId: null, flows: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--run-id='))       out.runId = a.split('=')[1];
    else if (a === '--run-id')           out.runId = argv[++i];
    else if (a.startsWith('--flows='))   out.flows = a.split('=')[1];
    else if (a === '--flows')            out.flows = argv[++i];
    else if (a.startsWith('--output='))  out.output = a.split('=')[1];
    else if (a === '--output')           out.output = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'exec-preflight-perf.js — preflight para /sofka-asdd:qa-web-perf\n' +
        'Uso: --run-id=<id> [--flows=E2E-001,E2E-003] [--output=<path>]\n'
      );
      process.exit(0);
    }
  }
  if (!out.runId) die('--run-id requerido');
  return out;
}

// ── readYamlSimple(): copiado verbatim de exec-preflight-vua.js ──
// Parser YAML mínimo — lee key:value scalars y mapas top-level/anidados por indentación.
// NO maneja anchors ni block sequences. Suficiente para appweb.yaml y config.yaml.
function readYamlSimple(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const txt = fs.readFileSync(filePath, 'utf8');
  const out = {};
  const stack = [out];
  const indents = [-1];
  const lines = txt.split(/\r?\n/);
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const line = raw.trim();
    while (indents.length > 1 && indent <= indents[indents.length - 1]) {
      stack.pop(); indents.pop();
    }
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('"') || val.startsWith("'")) {
      const q = val[0];
      const closeIdx = val.indexOf(q, 1);
      if (closeIdx > 0) {
        const afterQuote = val.slice(closeIdx + 1);
        const hashIdx = afterQuote.search(/\s#/);
        if (hashIdx >= 0) val = val.slice(0, closeIdx + 1 + hashIdx).trim();
      }
    } else {
      const hashIdx = val.search(/\s#/);
      if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    }
    const cur = stack[stack.length - 1];
    if (val === '' || val === '{}' || val === '[]') {
      const obj = (val === '[]') ? [] : {};
      cur[key] = obj;
      if (val === '') {
        stack.push(obj);
        indents.push(indent);
      }
    } else {
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'null' || val === '~') val = null;
      else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
      else if (/^-?\d*\.\d+$/.test(val)) val = parseFloat(val);
      else if (val.startsWith('[') && val.endsWith(']')) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* keep as string */ }
      }
      cur[key] = val;
    }
  }
  return out;
}

// ── findActiveAppYaml(): copiado verbatim de exec-preflight-vua.js ──
function findActiveAppYaml(projectRoot) {
  const cfg = path.join(projectRoot, 'docs', 'testing', 'atf-web', 'config');
  const main = path.join(cfg, 'appweb.yaml');
  if (fs.existsSync(main)) return main;
  const files = fs.existsSync(cfg) ? fs.readdirSync(cfg) : [];
  const cand = files.find(f => f.startsWith('app') && f.endsWith('.yaml'));
  return cand ? path.join(cfg, cand) : null;
}

function findFrameworkConfig(projectRoot) {
  const p = path.join(projectRoot, 'docs', 'testing', 'atf-web', 'config', 'config.yaml');
  return fs.existsSync(p) ? p : null;
}

function makeAbsolute(u, appUrl) {
  if (!u) return null;
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  try { if (s.startsWith('/') && appUrl) return new URL(appUrl).origin.replace(/\/+$/, '') + s; } catch { /* fall through */ }
  return s;
}

// Mapea flow_scope → niveles de riesgo aceptados. Sin metadato de riesgo → incluir.
function scopeMatches(flow, scope) {
  if (scope === 'all') return true;
  const lvl = String(flow.risk_level || flow.criticality || flow.priority || '').toLowerCase();
  if (!lvl) return true;
  if (scope === 'critical') return lvl === 'critical';
  if (scope === 'critical_and_high') return lvl === 'critical' || lvl === 'high';
  return true;
}

// =================== MAIN ===================

const args = parseArgs(process.argv.slice(2));
const tStart = Date.now();
const phases = [];
const warnings = [];

function phase(name, fn) {
  const t0 = Date.now();
  try {
    const res = fn();
    phases.push({ name, ok: true, ms: Date.now() - t0, ...(res && typeof res === 'object' ? res : {}) });
    return res;
  } catch (err) {
    phases.push({ name, ok: false, ms: Date.now() - t0, error: String(err && err.message || err) });
    throw err;
  }
}

const runFolder      = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
const strategyDir    = path.join(runFolder, 'strategy');
const diagnosticsDir = path.join(runFolder, 'diagnostics');
const perfDir        = path.join(runFolder, 'performance');
const tmpDir         = path.join(runFolder, '.tmp');

phase('validate_run', () => {
  if (!fs.existsSync(runFolder)) die(`Run folder no existe: ${runFolder}`);
});

let appConfig = null, perfAppCfg = null;
phase('read_app_config', () => {
  const appYamlPath = findActiveAppYaml(PROJECT_ROOT);
  if (!appYamlPath) die('appweb.yaml no encontrado en docs/testing/atf-web/config/');
  appConfig = readYamlSimple(appYamlPath) || {};
  perfAppCfg = appConfig.performance || {};
  if (!perfAppCfg.enabled) {
    die('performance.enabled: false en appweb.yaml — opt-in requerido. Activar y re-ejecutar.', { app_yaml: appYamlPath });
  }
  return { app_yaml_path: appYamlPath, performance_enabled: true };
});

let perfFwCfg = {};
phase('read_framework_config', () => {
  const cfgPath = findFrameworkConfig(PROJECT_ROOT);
  if (!cfgPath) { warnings.push('config.yaml no encontrado — se usarán umbrales default.'); return { framework_config: false }; }
  const cfg = readYamlSimple(cfgPath) || {};
  perfFwCfg = cfg.performance || {};
  return { framework_config: true };
});

let executionPlan = null, needsStrategist = false, needsDiagnostics = false;
phase('probe_strategy', () => {
  const planPath = path.join(strategyDir, 'execution_plan.json');
  if (!fs.existsSync(planPath)) {
    needsStrategist = true;
    if (!fs.existsSync(path.join(diagnosticsDir, 'base_pruebas.md'))) needsDiagnostics = true;
    return { strategy_present: false };
  }
  try { executionPlan = JSON.parse(fs.readFileSync(planPath, 'utf8')); }
  catch (e) { die(`execution_plan.json no es JSON válido: ${e.message}`); }
  if (!Array.isArray(executionPlan.e2e_flows) || executionPlan.e2e_flows.length === 0) {
    needsStrategist = true;
    if (!fs.existsSync(path.join(diagnosticsDir, 'base_pruebas.md'))) needsDiagnostics = true;
    return { strategy_present: true, e2e_flows_present: false };
  }
  return { strategy_present: true, e2e_flows_present: true, e2e_flows_count: executionPlan.e2e_flows.length };
});

if (needsStrategist) {
  process.stdout.write(JSON.stringify({
    ok: true, total_ms: Date.now() - tStart, phases,
    needs_strategist: true, needs_diagnostics: needsDiagnostics,
    flows_planned: [], flows_planned_count: 0, flows_to_skip_count: 0, perf_context_path: null,
    warnings: needsDiagnostics
      ? ['Falta diagnóstico (base_pruebas.md). Ejecutar /sofka-asdd:qa-web-diagnose y /sofka-asdd:qa-web-strategize antes.']
      : ['Falta strategy/execution_plan.json o e2e_flows[]. Auto-disparar /sofka-asdd:qa-web-strategize.']
  }, null, 2) + '\n');
  process.exit(0);
}

const appUrl = (appConfig.app && appConfig.app.url) || null;
let flowsPlanned = [];
phase('filter_flows', () => {
  const scope = perfAppCfg.flow_scope || 'critical';
  const base = executionPlan.e2e_flows;
  // Precedencia: --flows (CLI) > performance.flows (appweb) > flow_scope
  const explicit = args.flows
    ? args.flows.split(',').map(s => s.trim()).filter(Boolean)
    : (Array.isArray(perfAppCfg.flows) && perfAppCfg.flows.length ? perfAppCfg.flows : null);
  if (explicit) {
    flowsPlanned = base.filter(f => explicit.includes(f.e2e_id));
    if (!flowsPlanned.length) die(`Ningún flow del execution_plan matchea ${explicit.join(',')}`, { available: base.map(f => f.e2e_id) });
  } else {
    flowsPlanned = base.filter(f => scopeMatches(f, scope));
    if (!flowsPlanned.length) { warnings.push(`flow_scope='${scope}' no matcheó ningún flow; usando todos.`); flowsPlanned = base; }
  }
  const withoutUrl = flowsPlanned.filter(f => !f.entry_url);
  if (withoutUrl.length) warnings.push(`${withoutUrl.length} flujo(s) sin entry_url — se omitirán en la medición: ${withoutUrl.map(f => f.e2e_id).join(', ')}`);
  flowsPlanned = flowsPlanned.filter(f => f.entry_url);
  return { flow_scope: scope, flows_planned_count: flowsPlanned.length };
});

let flowsToSkip = 0;
phase('resume_detection', () => {
  for (const f of flowsPlanned) {
    if (fs.existsSync(path.join(perfDir, `lighthouse_${f.e2e_id}.json`))) {
      f.skip_reason = 'already_measured';
      flowsToSkip++;
    }
  }
  return { flows_to_skip_count: flowsToSkip };
});

let perfContextPath = args.output || path.join(tmpDir, 'perf_context.json');
phase('write_perf_context', () => {
  fs.mkdirSync(path.dirname(perfContextPath), { recursive: true });
  const auth = appConfig.auth || {};
  const ls = auth.login_selectors || {};
  const requiresAuth = (typeof auth.requires_auth === 'boolean') ? auth.requires_auth : !!auth.default_role;
  if (requiresAuth && !auth.session_state_file && !ls.username) {
    warnings.push('requires_auth=true sin session_state_file ni login_selectors: si el login no es estándar, pre-capturar sesión con save-session.js o configurar auth.login_selectors.');
  }
  const ctx = {
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    run_folder: runFolder,
    output_base_dir: perfDir,
    app_name: (appConfig.app && appConfig.app.name) || 'unknown',
    app_url: appUrl,
    auth: {
      requires_auth: requiresAuth,
      default_role: auth.default_role || null,
      mfa_type: auth.mfa_type || '',
      session_state_file: auth.session_state_file || '',
      login_selectors: {
        username: ls.username || '',
        password: ls.password || '',
        submit: ls.submit || ''
      }
    },
    perf_config: {
      repetitions: perfFwCfg.repetitions || 3,
      stabilization_wait_ms: perfFwCfg.stabilization_wait_ms || 2000,
      thresholds: perfFwCfg.thresholds || null  // null → lh-thresholds usa defaults
    },
    flows: flowsPlanned.map(f => ({
      e2e_id: f.e2e_id,
      name: f.name || f.e2e_id,
      entry_url: makeAbsolute(f.entry_url, appUrl),
      skip_reason: f.skip_reason || null
    }))
  };
  fs.writeFileSync(perfContextPath, JSON.stringify(ctx, null, 2));
  return { perf_context_path: perfContextPath };
});

process.stdout.write(JSON.stringify({
  ok: true, total_ms: Date.now() - tStart, phases,
  needs_strategist: false, needs_diagnostics: false,
  flows_planned: flowsPlanned.map(f => f.e2e_id),
  flows_planned_count: flowsPlanned.length,
  flows_to_skip_count: flowsToSkip,
  perf_context_path: perfContextPath,
  warnings
}, null, 2) + '\n');
process.exit(0);
