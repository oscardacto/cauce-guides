#!/usr/bin/env node
/**
 * exec-preflight-vua.js — preflight para `/asdd:qa-web-visual-ux-a11y`. Análogo a
 * `exec-preflight.js` pero adaptado a la fase Visual + UX + A11y guiada por
 * flujos E2E. Reduce overhead a 1 sola invocación de Node.
 *
 * Ejecuta (en orden):
 *   1. validate_run         → run folder existe.
 *   2. read_app_config      → appweb.yaml + visual_ux_a11y.enabled === true (gate).
 *   3. probe_strategy       → execution_plan.json + e2e_flows[] no vacío.
 *                              Si falta → reporta needs_strategist (true|false según
 *                              base_pruebas.md). El comando decide qué hacer.
 *   4. filter_flows         → si --flows pasado, intersecar con e2e_flows[] del plan.
 *   5. derive_pages         → por flow, extraer pantallas únicas (entry_url +
 *                              URLs literales mencionadas en execution_sequence).
 *   6. resume_detection     → marca pantallas con findings.json existente como skip.
 *   7. precompile_axe       → corre axe-runtime.js --inject-runtime y --call-only
 *                              para tener los snippets pre-cargados en vua_context.json.
 *   8. write_vua_context    → output/{run_id}/.tmp/vua_context.json para el executor.
 *
 * Uso:
 *   node exec-preflight-vua.js --run-id=<id> [--flows=E2E-001,E2E-003]
 *                              [--app-language=es-CO] [--output=<path>]
 *
 * stdout: JSON con { ok, total_ms, phases[], flows_planned[], pages_planned_count,
 *                    pages_to_skip_count, vua_context_path, needs_strategist,
 *                    needs_diagnostics, warnings }
 *
 * exit: 0 si preflight OK (incluyendo needs_strategist=true — el comando se encarga)
 *       1 si fatal (run inexistente, appweb.yaml sin gate, faltan diagnostics+strategy)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function die(msg, extra) {
  process.stderr.write('[exec-preflight-vua] ERROR: ' + msg + '\n');
  if (extra) process.stderr.write(JSON.stringify(extra, null, 2) + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { runId: null, flows: null, appLanguage: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--run-id='))            out.runId = a.split('=')[1];
    else if (a === '--run-id')                out.runId = argv[++i];
    else if (a.startsWith('--flows='))        out.flows = a.split('=')[1];
    else if (a === '--flows')                 out.flows = argv[++i];
    else if (a.startsWith('--app-language=')) out.appLanguage = a.split('=')[1];
    else if (a === '--app-language')          out.appLanguage = argv[++i];
    else if (a.startsWith('--output='))       out.output = a.split('=')[1];
    else if (a === '--output')                out.output = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'exec-preflight-vua.js — preflight para /asdd:qa-web-visual-ux-a11y\n' +
        'Uso: --run-id=<id> [--flows=E2E-001,E2E-003] [--app-language=es-CO] [--output=<path>]\n'
      );
      process.exit(0);
    }
  }
  if (!out.runId) die('--run-id requerido');
  return out;
}

function readYamlSimple(filePath) {
  // Parser YAML mínimo — lee key:value scalars y top-level map.
  // Suficiente para el caso de appweb.yaml; NO maneja anchors ni block sequences.
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
    // Strip inline comment: " # comment" (espacio antes del # — preserva strings tipo #FF0).
    // Si el valor empieza con comilla, respetar comillas balanceadas antes de buscar #.
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
      // sub-map: el key apunta a un objeto donde se anidarán hijos
      const obj = (val === '[]') ? [] : {};
      cur[key] = obj;
      if (val === '') {
        stack.push(obj);
        indents.push(indent);
      }
    } else {
      // strip comillas
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // bool
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'null' || val === '~') val = null;
      else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
      else if (/^-?\d*\.\d+$/.test(val)) val = parseFloat(val);
      // arrays inline ["a","b"] (manejo simple)
      else if (val.startsWith('[') && val.endsWith(']')) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch { /* keep as string */ }
      }
      cur[key] = val;
    }
  }
  return out;
}

function findActiveAppYaml(projectRoot) {
  const cfg = path.join(projectRoot, 'docs', 'testing', 'atf-web', 'config');
  const main = path.join(cfg, 'appweb.yaml');
  if (fs.existsSync(main)) return main;
  // Fallback: cualquier app *.yaml. No esperado en práctica.
  const files = fs.existsSync(cfg) ? fs.readdirSync(cfg) : [];
  const cand = files.find(f => f.startsWith('app') && f.endsWith('.yaml'));
  return cand ? path.join(cfg, cand) : null;
}

function deriveScreensFromFlow(flow, appUrl) {
  // Extrae pantallas únicas del flow:
  //  1. entry_url (siempre, resuelto a absoluto si era relativo)
  //  2. action strings que contengan URL absoluta http(s):// o path /xyz
  //     (extracción más amplia: cualquier path /web/... mencionado, no solo tras "Navegar a")
  //
  // Resuelve URLs relativas usando appUrl del config (`appweb.yaml → app.url`).
  // Si flow.entry_url es relativo y appUrl está disponible → combinar.
  // Si appUrl tampoco es absoluto → mantener como path relativo (best-effort).
  const pages = [];
  const seenUrls = new Set();

  // Resolver base absoluto para combinar URLs relativas
  let baseAbsolute = null;
  try {
    if (appUrl) {
      const u = new URL(appUrl);
      baseAbsolute = u.origin;
    }
  } catch { /* baseAbsolute queda null */ }

  function makeAbsolute(maybeRelative) {
    if (!maybeRelative) return null;
    const s = String(maybeRelative).trim();
    if (/^https?:\/\//i.test(s)) return s; // ya absoluto
    if (s.startsWith('/') && baseAbsolute) {
      return baseAbsolute.replace(/\/+$/, '') + s;
    }
    return s; // sin base disponible → devolver tal cual (relativo)
  }

  function slugFromUrl(url) {
    try {
      const u = new URL(url, 'http://placeholder.local');
      let p = u.pathname.replace(/^\/+/, '').replace(/\.html?$/i, '').replace(/\/+$/, '');
      if (!p) p = 'root';
      return p.replace(/[\/\\]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    } catch {
      return url.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
    }
  }

  function pushUrl(url, source) {
    if (!url) return;
    const trimmed = String(url).trim().replace(/[)\].,]+$/, '');
    const absolute = makeAbsolute(trimmed);
    if (!absolute) return;
    if (seenUrls.has(absolute)) return;
    seenUrls.add(absolute);
    pages.push({ url: absolute, slug: slugFromUrl(absolute), source });
  }

  if (flow.entry_url) pushUrl(flow.entry_url, 'entry_url');

  const seq = Array.isArray(flow.execution_sequence) ? flow.execution_sequence : [];
  for (const step of seq) {
    const action = String(step.action || '');
    // 1) URL absoluta http(s)://
    const httpMatches = action.match(/https?:\/\/[^\s,)\]'"]+/g) || [];
    httpMatches.forEach(u => pushUrl(u, 'sequence_action_absolute'));
    // 2) Paths /web/... o /algo/cosa mencionados — extracción amplia (no requiere keyword)
    //    Captura primer segmento: ej "/web/index.php/admin/viewLocations".
    //    Filtra extensiones obvias de assets (.png, .css, .js, etc.) para evitar ruido.
    const pathMatches = action.match(/\/[A-Za-z][\w\-]*(?:\/[A-Za-z0-9][\w\-.]*)+/g) || [];
    pathMatches.forEach(p => {
      // Saltar assets típicos
      if (/\.(png|jpe?g|gif|svg|css|js|woff2?|ttf|ico)$/i.test(p)) return;
      pushUrl(p, 'sequence_action_path');
    });
  }
  return pages;
}

// Genera vua_context con snippets pre-cargados de axe-runtime
function precompileAxeSnippets(axeStandards, axeRulesDisabled) {
  const out = {};
  const standardsCsv = (axeStandards || ['wcag2a', 'wcag2aa']).join(',');
  const rulesDisabledCsv = (axeRulesDisabled || []).join(',');
  const snippetTool = path.join(__dirname, 'snippets', 'axe-runtime.js');
  if (!fs.existsSync(snippetTool)) {
    return { error: 'axe-runtime.js not found at ' + snippetTool };
  }
  // Inject runtime
  const r1 = spawnSync('node', [snippetTool, '--inject-runtime'], { encoding: 'utf8' });
  if (r1.status !== 0) return { error: 'axe-runtime --inject-runtime failed: ' + r1.stderr };
  out.inject_runtime = r1.stdout;
  // Call only
  const r2 = spawnSync('node', [snippetTool, '--call-only', '--standards', standardsCsv, '--rules-disabled', rulesDisabledCsv], { encoding: 'utf8' });
  if (r2.status !== 0) return { error: 'axe-runtime --call-only failed: ' + r2.stderr };
  out.call_snippet = r2.stdout;
  return out;
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

const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
const designDir = path.join(runFolder, 'design');
const strategyDir = path.join(runFolder, 'strategy');
const diagnosticsDir = path.join(runFolder, 'diagnostics');
const tmpDir = path.join(runFolder, '.tmp');

// Phase 1 — validate_run
phase('validate_run', () => {
  if (!fs.existsSync(runFolder)) die(`Run folder no existe: ${runFolder}`);
});

// Phase 2 — read_app_config
let appConfig = null, vuaConfig = null;
phase('read_app_config', () => {
  const appYamlPath = findActiveAppYaml(PROJECT_ROOT);
  if (!appYamlPath) die('appweb.yaml no encontrado en docs/testing/atf-web/config/');
  appConfig = readYamlSimple(appYamlPath) || {};
  vuaConfig = appConfig.visual_ux_a11y || {};
  if (!vuaConfig.enabled) {
    die('visual_ux_a11y.enabled: false en appweb.yaml — opt-in requerido. Activar y re-ejecutar.', { app_yaml: appYamlPath });
  }
  return { app_yaml_path: appYamlPath, vua_enabled: true };
});

// Phase 3 — probe_strategy
let executionPlan = null;
let needsStrategist = false;
let needsDiagnostics = false;

phase('probe_strategy', () => {
  const planPath = path.join(strategyDir, 'execution_plan.json');
  if (!fs.existsSync(planPath)) {
    needsStrategist = true;
    if (!fs.existsSync(path.join(diagnosticsDir, 'base_pruebas.md'))) needsDiagnostics = true;
    return { strategy_present: false };
  }
  try {
    executionPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  } catch (err) {
    die(`execution_plan.json no es JSON válido: ${err.message}`);
  }
  if (!Array.isArray(executionPlan.e2e_flows) || executionPlan.e2e_flows.length === 0) {
    needsStrategist = true;
    if (!fs.existsSync(path.join(diagnosticsDir, 'base_pruebas.md'))) needsDiagnostics = true;
    return { strategy_present: true, e2e_flows_present: false };
  }
  return { strategy_present: true, e2e_flows_present: true, e2e_flows_count: executionPlan.e2e_flows.length };
});

// Si necesita strategist (con o sin diagnostics) → reportar y salir 0.
// El comando /asdd:qa-web-visual-ux-a11y decidirá si auto-trigger o abort.
if (needsStrategist) {
  const out = {
    ok: true,
    total_ms: Date.now() - tStart,
    phases,
    needs_strategist: true,
    needs_diagnostics: needsDiagnostics,
    flows_planned: [],
    pages_planned_count: 0,
    pages_to_skip_count: 0,
    vua_context_path: null,
    warnings: needsDiagnostics
      ? ['Falta diagnóstico previo (base_pruebas.md). Ejecutar /asdd:qa-web-diagnose y /asdd:qa-web-strategize antes de /asdd:qa-web-visual-ux-a11y.']
      : ['Falta strategy/execution_plan.json o e2e_flows[]. El comando debe auto-disparar /asdd:qa-web-strategize.']
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(0);
}

// Phase 4 — filter_flows
let flowsRequested = null;
let flowsPlanned = [];
phase('filter_flows', () => {
  if (args.flows) {
    flowsRequested = args.flows.split(',').map(s => s.trim()).filter(Boolean);
    flowsPlanned = executionPlan.e2e_flows.filter(f => flowsRequested.includes(f.e2e_id));
    if (flowsPlanned.length === 0) {
      die(`Ningún flow del execution_plan matchea --flows=${args.flows}`, {
        available: executionPlan.e2e_flows.map(f => f.e2e_id)
      });
    }
  } else {
    flowsPlanned = executionPlan.e2e_flows;
  }
  return { flows_requested: flowsRequested, flows_planned_count: flowsPlanned.length };
});

// Phase 5 — derive_pages (CON DEDUP CROSS-FLOW)
// Si una URL aparece en N flows, se planifica UNA sola vez con flow_refs[] que
// referencia todos los flows. Esto:
//  1. Evita re-analizar la misma pantalla N veces (5× más rápido en runs con overlap).
//  2. Elimina findings duplicados de raíz (la pantalla solo se analiza 1 vez).
//  3. El reporte muestra "visto en X, Y, Z flows" en seen_in_pages[].
let pagesPlanned = [];
phase('derive_pages', () => {
  const maxPerFlow = vuaConfig.pages_per_flow_max || 10;
  const urlMap = new Map(); // canonicalUrl → page record consolidado
  let totalRawPages = 0;

  function canonicalUrl(u) {
    try {
      const url = new URL(u);
      const host = url.host.toLowerCase();
      let pathn = url.pathname.replace(/\/+$/, '') || '/';
      const search = url.search || '';
      return url.protocol + '//' + host + pathn + search;
    } catch {
      return String(u || '').replace(/\/+$/, '');
    }
  }

  const appUrl = (appConfig.app && appConfig.app.url) || null;
  for (const flow of flowsPlanned) {
    const pages = deriveScreensFromFlow(flow, appUrl).slice(0, maxPerFlow);
    if (pages.length === 0) {
      warnings.push(`Flow ${flow.e2e_id} sin pantallas extraíbles (sin entry_url ni URLs en execution_sequence). Saltado.`);
      continue;
    }
    totalRawPages += pages.length;
    for (const p of pages) {
      const key = canonicalUrl(p.url);
      if (urlMap.has(key)) {
        const existing = urlMap.get(key);
        if (!existing.flow_refs.includes(flow.e2e_id)) existing.flow_refs.push(flow.e2e_id);
      } else {
        const idx = urlMap.size + 1;
        urlMap.set(key, {
          page_index: idx,
          page_url: p.url,
          page_slug: p.slug,
          source: p.source,
          first_seen_in_flow: flow.e2e_id,
          flow_refs: [flow.e2e_id],
          output_dir: path.join(
            runFolder,
            'visual-ux-a11y',
            '_pages',
            String(idx).padStart(2, '0') + '_' + p.slug
          )
        });
      }
    }
  }

  pagesPlanned = Array.from(urlMap.values());
  const dedupSavings = totalRawPages - pagesPlanned.length;
  if (dedupSavings > 0) {
    warnings.push(`Dedup cross-flow: ${totalRawPages} pantallas pre-dedup → ${pagesPlanned.length} únicas (ahorro: ${dedupSavings} análisis duplicados).`);
  }
  return { pages_planned_count: pagesPlanned.length, raw_pages_count: totalRawPages, dedup_savings: dedupSavings };
});

// Phase 6 — resume_detection
//
// Skip una pantalla SOLO si su findings.json existe Y cumple el schema actual.
// Si el findings es de un scanner anterior (faltan campos del schema nuevo) →
// se invalida la carpeta entera para forzar re-scan con la versión actual de
// las reglas. Esto evita reportes obsoletos cuando se amplía la cobertura.
//
// Schema-required keys (deben aparecer en TODO findings.json válido del v2):
//   - axe_locale         (i18n axe-core)
//   - stability_strategy (waitForStablePage estrategia aplicada)
//   - page_type          (clasificación tipo de pantalla — Nielsen heurísticas)
//
// Si el resume falla por staleness, el preflight elimina los artefactos de la
// pantalla afectada (findings.json + page_scan_phase_a.json + page_blocked.json)
// para evitar que el aggregator mezcle data nueva con data vieja.
let pagesToSkip = 0;
let pagesInvalidated = 0;
const SCHEMA_REQUIRED_KEYS_V2 = ['axe_locale', 'stability_strategy', 'page_type'];
phase('resume_detection', () => {
  for (const p of pagesPlanned) {
    const findingsPath = path.join(p.output_dir, 'findings.json');
    if (!fs.existsSync(findingsPath)) continue;

    let findingsObj = null;
    try { findingsObj = JSON.parse(fs.readFileSync(findingsPath, 'utf8')); }
    catch (e) { findingsObj = null; }

    const missingKeys = SCHEMA_REQUIRED_KEYS_V2.filter((k) => findingsObj == null || findingsObj[k] === undefined);
    if (missingKeys.length === 0) {
      p.skip_reason = 'findings_already_exist';
      pagesToSkip++;
      continue;
    }

    // Stale: limpiar artefactos para forzar re-scan
    pagesInvalidated++;
    for (const f of ['findings.json', 'page_scan_phase_a.json', 'page_blocked.json']) {
      try { fs.unlinkSync(path.join(p.output_dir, f)); } catch (_) { /* ignore */ }
    }
    warnings.push(`page ${p.page_slug}: stale findings invalidated (missing: ${missingKeys.join(', ')})`);
  }
  return { pages_to_skip_count: pagesToSkip, pages_invalidated_count: pagesInvalidated };
});

// Phase 7 — precompile_axe
let axeSnippets = null;
phase('precompile_axe', () => {
  axeSnippets = precompileAxeSnippets(vuaConfig.axe_standards, vuaConfig.axe_rules_disabled);
  if (axeSnippets.error) {
    warnings.push('axe-runtime precompile failed: ' + axeSnippets.error);
    return { ok: false, error: axeSnippets.error };
  }
  return { inject_runtime_chars: axeSnippets.inject_runtime.length, call_snippet_chars: axeSnippets.call_snippet.length };
});

// Phase 8 — write_vua_context
let vuaContextPath = args.output || path.join(tmpDir, 'vua_context.json');
phase('write_vua_context', () => {
  fs.mkdirSync(path.dirname(vuaContextPath), { recursive: true });
  const vuaContext = {
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    run_folder: runFolder,
    output_base_dir: path.join(runFolder, 'visual-ux-a11y'),
    app_name: (appConfig.app && appConfig.app.name) || 'unknown',
    app_url: (appConfig.app && appConfig.app.url) || null,
    app_language: args.appLanguage || vuaConfig.app_language || 'es-CO',
    auth: {
      // Inferencia: si appweb.yaml declara requires_auth explícito, respetar.
      // Si no, deducir true cuando default_role está poblado (semántica
      // natural: rol declarado ⇒ app requiere autenticación). Esto evita
      // que /asdd:qa-web-visual-ux-a11y omita login y todas las pantallas autenticadas
      // redirijan a /login (caso OrangeHRM, Fogafin, etc.).
      requires_auth: appConfig.auth
        ? (typeof appConfig.auth.requires_auth === 'boolean'
            ? appConfig.auth.requires_auth
            : !!(appConfig.auth.default_role))
        : false,
      default_role: appConfig.auth ? appConfig.auth.default_role : null,
      mfa_type: appConfig.auth ? appConfig.auth.mfa_type : '',
      session_state_file: appConfig.auth ? appConfig.auth.session_state_file : ''
    },
    a11y_config: {
      axe_standards: vuaConfig.axe_standards || ['wcag2a', 'wcag2aa'],
      axe_rules_disabled: vuaConfig.axe_rules_disabled || [],
      severity_threshold: vuaConfig.severity_threshold || 'serious',
      app_language: vuaConfig.app_language || 'es-CO',
      ui_terminology_glossary: vuaConfig.ui_terminology_glossary || [],
      pages_per_flow_max: vuaConfig.pages_per_flow_max || 10
    },
    axe_runtime_snippet: axeSnippets && axeSnippets.inject_runtime ? axeSnippets.inject_runtime : null,
    axe_call_snippet: axeSnippets && axeSnippets.call_snippet ? axeSnippets.call_snippet : null,
    flows: flowsPlanned.map(f => ({
      e2e_id: f.e2e_id,
      name: f.name,
      type: f.type || 'unknown',
      modules_involved: f.modules_involved || [],
      // entry_url resuelto a absoluto si era relativo (consistencia con pages[].page_url).
      entry_url: f.entry_url
        ? (function(u) {
            try {
              if (/^https?:\/\//i.test(u)) return u;
              if (u.startsWith('/') && appConfig.app && appConfig.app.url) {
                const base = new URL(appConfig.app.url).origin;
                return base.replace(/\/+$/, '') + u;
              }
            } catch { /* fall through */ }
            return u;
          })(f.entry_url)
        : null,
      // INCLUIDO COMPLETO — el executor en MODO VUA PASO V4 itera estos steps
      // ejecutando navegaciones/clicks y capturando window.location.href para
      // descubrir pantallas adicionales que el preflight extrajo estáticamente.
      execution_sequence: Array.isArray(f.execution_sequence) ? f.execution_sequence : []
    })),
    pages: pagesPlanned
  };
  fs.writeFileSync(vuaContextPath, JSON.stringify(vuaContext, null, 2));
  return { vua_context_path: vuaContextPath };
});

const out = {
  ok: true,
  total_ms: Date.now() - tStart,
  phases,
  needs_strategist: false,
  needs_diagnostics: false,
  flows_planned: flowsPlanned.map(f => f.e2e_id),
  pages_planned_count: pagesPlanned.length,
  pages_to_skip_count: pagesToSkip,
  vua_context_path: vuaContextPath,
  warnings
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
process.exit(0);
