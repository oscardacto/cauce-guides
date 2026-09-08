#!/usr/bin/env node
/**
 * ATF — generate-index.js
 * Genera runs_index.html a partir de runs_index.json + runs_index.tmpl.html
 *
 * Uso:
 *   node generate-index.js
 *   node generate-index.js --out <ruta-directorio>   # directorio de salida alternativo
 *   node generate-index.js --dry-run                 # preview sin escribir archivos
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Rutas ──────────────────────────────────────────────────────────────────
const DASHBOARD_DIR  = __dirname;
const TEMPLATES_DIR  = path.join(DASHBOARD_DIR, 'templates');
const TOKENS_CSS     = path.join(TEMPLATES_DIR, '_tokens.css');
const INDEX_TEMPLATE = path.join(TEMPLATES_DIR, 'runs_index.tmpl.html');
const { PROJECT_ROOT: REPO_ROOT, OUTPUT_BASE } = require('./lib/output-base');
const RUNS_INDEX_JSON = path.join(OUTPUT_BASE, 'runs_index.json');

const TEMPLATE_VERSION = '3.0.0';
const INDEX_PLACEHOLDER = '<script id="atf-index-data-placeholder">window.ATF_INDEX = null;</script>';

// ── CLI args ───────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const isDry   = args.includes('--dry-run');
const outIdx  = args.indexOf('--out');
const outDir  = outIdx !== -1 ? args[outIdx + 1] : OUTPUT_BASE;

// ── Helpers ────────────────────────────────────────────────────────────────
function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function readJson(p) {
  const t = readText(p);
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) {
    console.error('[generate-index] JSON parse error:', p, e.message);
    return null;
  }
}

function writeText(p, content) {
  if (isDry) { console.log('[dry-run] would write:', p, `(${content.length} bytes)`); return; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'
    });
  } catch { return iso; }
}

// ── Carga y enriquecimiento ────────────────────────────────────────────────
function loadIndex() {
  const data = readJson(RUNS_INDEX_JSON);
  if (!data) {
    console.error('[generate-index] No se encontró runs_index.json en:', RUNS_INDEX_JSON);
    process.exit(1);
  }
  return data;
}

function computeSummaryStats(runs) {
  const total     = runs.length;

  // Avg pass rate (solo runs con pass_rate_pct numérico)
  const withRate  = runs.filter(r => typeof r.pass_rate_pct === 'number');
  const avgRate   = withRate.length
    ? Math.round(withRate.reduce((s, r) => s + r.pass_rate_pct, 0) / withRate.length)
    : null;

  // Total P1+P2
  const totalP12  = runs.reduce((s, r) => s + (r.p1_bugs || 0) + (r.p2_bugs || 0), 0);

  // Outdated count — runs sin report_template_version o versión anterior
  const outdated  = runs.filter(r =>
    r.report_path && (!r.report_template_version || r.report_template_version !== TEMPLATE_VERSION)
  ).length;

  return { total, avgRate, totalP12, outdated };
}

function buildRunRows(runs) {
  return runs.map(r => {
    const isOutdated = r.report_path &&
      (!r.report_template_version || r.report_template_version !== TEMPLATE_VERSION);

    return {
      run_id:          r.run_id,
      app_name:        r.app_name || '—',
      app_version:     r.app_version || '—',
      started_at:      r.started_at  || null,
      completed_at:    r.completed_at || null,
      date_str:        fmtDate(r.completed_at || r.started_at),
      duration_str:    fmtDuration(r.duration_ms),
      pass_rate:       typeof r.pass_rate_pct === 'number' ? r.pass_rate_pct : null,
      fpy_pct:         typeof r.fpy_pct === 'number' ? r.fpy_pct : null,
      frs_pct:         typeof r.frs_pct === 'number' ? r.frs_pct : null,
      total_cps:       r.total_cps || 0,
      passed:          r.passed || 0,
      failed:          r.failed || 0,
      blocked:         r.blocked || 0,
      p1_bugs:         r.p1_bugs || 0,
      p2_bugs:         r.p2_bugs || 0,
      p3_bugs:         r.p3_bugs || 0,
      p4_bugs:         r.p4_bugs || 0,
      p12_bugs:        (r.p1_bugs || 0) + (r.p2_bugs || 0),
      report_path:     r.report_path || null,
      report_regenerated_at:   r.report_regenerated_at   || null,
      report_template_version: r.report_template_version || null,
      is_outdated:     isOutdated,
    };
  });
}

// ── Inyección de tokens CSS ────────────────────────────────────────────────
function injectTokens(html) {
  const tokens = readText(TOKENS_CSS) || '';
  return html.replace('/* ATF:INJECT_TOKENS */', tokens);
}

// ── Generación principal ───────────────────────────────────────────────────
function generateIndex() {
  console.log('[generate-index] Iniciando generación de runs_index.html...');

  // 1. Cargar datos
  const indexData   = loadIndex();
  const runs        = indexData.runs || [];
  const app         = indexData.app  || {};

  // 2. Estadísticas
  const stats       = computeSummaryStats(runs);

  // 3. Enriquecer filas
  const enrichedRuns = buildRunRows(runs);

  // 4. Objeto final para el template
  const atfIndex = {
    app: {
      name:    app.name || 'ATF',
      version: app.version || '',
    },
    runs:          enrichedRuns,
    stats,
    generated_at:  new Date().toISOString(),
    template_version: TEMPLATE_VERSION,
  };

  // 5. Leer template
  const tmpl = readText(INDEX_TEMPLATE);
  if (!tmpl) {
    console.error('[generate-index] Template no encontrado:', INDEX_TEMPLATE);
    process.exit(1);
  }

  // 6. Inyectar data + tokens
  const dataScript = `<script id="atf-index-data-placeholder">window.ATF_INDEX = ${
    JSON.stringify(atfIndex).replace(/<\/script>/gi, '<\\/script>')
  };</script>`;

  let html = tmpl.replace(INDEX_PLACEHOLDER, dataScript);
  html = injectTokens(html);

  // 7. Escribir
  const outPath = path.join(outDir, 'runs_index.html');
  writeText(outPath, html);

  if (!isDry) {
    console.log(`[generate-index] ✅ runs_index.html generado: ${outPath}`);
    console.log(`[generate-index]    Runs: ${enrichedRuns.length} | Outdated: ${stats.outdated} | Avg Pass Rate: ${stats.avgRate ?? '—'}%`);
  }

  return { outPath, stats, runCount: enrichedRuns.length };
}

// ── Entry point ────────────────────────────────────────────────────────────
generateIndex();
