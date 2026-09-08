#!/usr/bin/env node
/**
 * axe-runtime.js — emite por stdout un IIFE listo para `browser_evaluate` del MCP
 * Playwright. Inyecta axe-core (Deque) en la página actual y expone
 * `window.__atfA11yScan(options)` para análisis WCAG 2.1 AA on-demand.
 *
 * Estrategia de carga (en orden, primera que funcione gana):
 *   1) **inline-Function** — embebe el bundle local `node_modules/axe-core/axe.min.js`
 *      como string en el snippet y lo ejecuta con `new Function(src)()`. Saltea CSP
 *      `script-src` porque NO inyecta `<script src=...>`. Es la estrategia primaria
 *      para apps enterprise con CSP estricto (OrangeHRM, banca, etc.).
 *   2) **inline-eval** — fallback con `(0, eval)(src)` si Function constructor falla
 *      por CSP `unsafe-eval` denegado en algunas configs específicas.
 *   3) **CDN** — último recurso `<script src="cdnjs.cloudflare.com/.../axe.min.js">`.
 *      Solo aplica cuando el target NO tiene CSP que bloquee CDN externo.
 *
 * Uso típico (sub-agente executor en MODO visual_ux_a11y):
 *   1) Inject runtime UNA vez por page load:
 *        RUNTIME=$(node .claude/tools/snippets/axe-runtime.js --inject-runtime)
 *        browser_evaluate(RUNTIME)
 *   2) Invocar scan por pantalla (sin re-inyectar):
 *        CALL=$(node .claude/tools/snippets/axe-runtime.js --call-only --standards wcag2a,wcag2aa)
 *        browser_evaluate(CALL)
 *
 * Flags:
 *   --inject-runtime  Emite arrow function que carga axe-core (inline → CDN fallback).
 *   --call-only       Emite `window.__atfA11yScan({...})`. Requiere inject-runtime previo.
 *   --standards       CSV (default "wcag2a,wcag2aa"). Tags de axe-core.
 *   --rules-disabled  CSV de rule_ids a excluir.
 *   --cdn-only        Forzar comportamiento legacy CDN-only (tests / debug).
 *
 * Exit codes: 0 OK · 1 args inválidos
 */
'use strict';

const fs = require('fs');
const path = require('path');

const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

function parseArgs(argv) {
  const out = {
    injectRuntime: false,
    callOnly: false,
    standards: 'wcag2a,wcag2aa',
    rulesDisabled: '',
    cdnOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--inject-runtime')      out.injectRuntime = true;
    else if (a === '--call-only')      out.callOnly = true;
    else if (a === '--standards')      out.standards = argv[++i];
    else if (a === '--rules-disabled') out.rulesDisabled = argv[++i];
    else if (a === '--cdn-only')       out.cdnOnly = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'axe-runtime.js — emite snippet JS para browser_evaluate.\n' +
        'Modos: --inject-runtime | --call-only [--standards X,Y] [--rules-disabled R1,R2] [--cdn-only]\n'
      );
      process.exit(0);
    }
  }
  return out;
}

function readLocalAxeBundle() {
  // axe.min.js vive en node_modules/axe-core/ relativo al project root.
  // Este script vive en .claude/tools/snippets/axe-runtime.js → 3 niveles arriba al root.
  const candidate = path.join(__dirname, '..', '..', '..', 'node_modules', 'axe-core', 'axe.min.js');
  try {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  } catch { /* fallthrough */ }
  return null;
}

function emitInjectRuntime(opts) {
  const localBundle = opts.cdnOnly ? null : readLocalAxeBundle();
  // JSON.stringify produce un string JS válido con todos los escapes correctos
  // (incluye backticks, dollar-brace, backslashes). El resultado es seguro para
  // embeber dentro de otro template string ES6 sin colisión.
  const localBundleLiteral = localBundle ? JSON.stringify(localBundle) : 'null';

  process.stdout.write(`(async () => {
  if (window.__atfA11yScan && window.axe) {
    return { installed: true, reused: true, axe_version: window.axe.version || 'unknown', source: 'already_loaded' };
  }

  const AXE_LOCAL_SOURCE = ${localBundleLiteral};
  let source = null;
  const errors = {};

  // Estrategia 1 — inline via Function constructor (saltea CSP script-src)
  if (!window.axe && AXE_LOCAL_SOURCE) {
    try {
      new Function(AXE_LOCAL_SOURCE)();
      if (window.axe) source = 'inline-function';
    } catch (e) {
      errors.inline_function = String(e && e.message || e);
    }
  }

  // Estrategia 2 — eval indirecto (fallback si Function falla)
  if (!window.axe && AXE_LOCAL_SOURCE) {
    try {
      (0, eval)(AXE_LOCAL_SOURCE);
      if (window.axe) source = 'inline-eval';
    } catch (e) {
      errors.inline_eval = String(e && e.message || e);
    }
  }

  // Estrategia 3 — CDN fallback (último recurso, requiere CSP permisivo)
  if (!window.axe) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '${AXE_CDN}';
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('CDN load blocked or failed: ' + s.src));
        document.head.appendChild(s);
      });
      if (window.axe) source = 'cdn';
    } catch (e) {
      errors.cdn = String(e && e.message || e);
    }
  }

  if (!window.axe) {
    return {
      installed: false,
      reused: false,
      error: 'axe-core no disponible tras todas las estrategias (inline-function, inline-eval, cdn). Causa probable: CSP estricto sin unsafe-eval y sin allowance del CDN.',
      attempts: errors,
      local_bundle_available: AXE_LOCAL_SOURCE !== null
    };
  }

  // Instala __atfA11yScan
  window.__atfA11yScan = async (options) => {
    options = options || {};
    const standards = (options.standards && options.standards.length) ? options.standards : ['wcag2a', 'wcag2aa'];
    const rulesDisabled = options.rulesDisabled || [];
    const config = {
      runOnly: { type: 'tag', values: standards },
      resultTypes: ['violations', 'incomplete'],
      rules: rulesDisabled.reduce((acc, r) => { acc[r] = { enabled: false }; return acc; }, {})
    };
    try {
      const result = await window.axe.run(document, config);
      return {
        ok: true,
        axe_version: window.axe.version,
        violations: (result.violations || []).map(v => ({
          id: v.id,
          impact: v.impact,
          tags: v.tags,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: (v.nodes || []).slice(0, 10).map(n => ({
            target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target || ''),
            failureSummary: n.failureSummary || '',
            html: (n.html || '').slice(0, 300)
          }))
        })),
        incomplete: (result.incomplete || []).map(v => ({
          id: v.id, description: v.description, nodes_count: (v.nodes || []).length
        })),
        passes_count: (result.passes || []).length,
        rules_run: (result.violations.length + result.passes.length + result.incomplete.length)
      };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  };
  return { installed: true, reused: false, axe_version: window.axe.version, source };
})()`);
}

function emitCallOnly(standardsCSV, rulesDisabledCSV) {
  const standards = standardsCSV.split(',').map(s => s.trim()).filter(Boolean);
  const rulesDisabled = rulesDisabledCSV.split(',').map(s => s.trim()).filter(Boolean);
  const standardsLit = JSON.stringify(standards);
  const rulesLit = JSON.stringify(rulesDisabled);
  process.stdout.write(`window.__atfA11yScan({ standards: ${standardsLit}, rulesDisabled: ${rulesLit} })`);
}

const args = parseArgs(process.argv.slice(2));

if (args.injectRuntime && args.callOnly) {
  process.stderr.write('axe-runtime: --inject-runtime y --call-only son mutuamente exclusivos\n');
  process.exit(1);
}
if (!args.injectRuntime && !args.callOnly) {
  process.stderr.write('axe-runtime: pasar --inject-runtime o --call-only (ver --help)\n');
  process.exit(1);
}

if (args.injectRuntime) {
  emitInjectRuntime(args);
} else {
  emitCallOnly(args.standards, args.rulesDisabled);
}
process.exit(0);
