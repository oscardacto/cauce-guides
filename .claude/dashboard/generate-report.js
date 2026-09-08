#!/usr/bin/env node
/**
 * ATF Report Generator v2
 * Lee los artefactos del pipeline ATF, los adapta al formato del dashboard
 * y genera un report.html autocontenido (sin servidor, sin dependencias).
 *
 * Uso:
 *   node .claude/dashboard/generate-report.js <run_id>
 *   node .claude/dashboard/generate-report.js MiApp-v1.0-20260101-0900
 *   node .claude/dashboard/generate-report.js          ← usa el run más reciente
 *
 * El reporte se regenera tras cada fase del pipeline. No usa auto-refresh;
 * el estado (running/partial/complete) se infiere de los artefactos en disco.
 *
 * Output:
 *   output/<run_id>/report.html
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { cpIdToFolder, cpIdToFolderFromKnownModules } = require('../tools/lib/cp-slug');

/**
 * Lista module_ids derivando de cp_modulo_*.json en el design dir del run.
 * Robusto para módulos multi-palabra. Cache por runDir.
 */
const _knownModulesCache = new Map();
function loadKnownModulesForRun(runDir) {
  if (_knownModulesCache.has(runDir)) return _knownModulesCache.get(runDir);
  const designDir = path.join(runDir, 'design');
  let mods = [];
  try {
    if (fs.existsSync(designDir)) {
      mods = fs.readdirSync(designDir)
        .filter(f => f.startsWith('cp_modulo_') && f.endsWith('.json'))
        .map(f => f.replace(/^cp_modulo_/, '').replace(/\.json$/, ''));
    }
  } catch { /* fallback empty */ }
  _knownModulesCache.set(runDir, mods);
  return mods;
}

// ─── PATHS ────────────────────────────────────────────────────────────────────
const { PROJECT_ROOT, OUTPUT_BASE } = require('./lib/output-base');
const DASHBOARD_TEMPLATE       = path.join(__dirname, 'dashboard.html');
const TEMPLATES_DIR            = path.join(__dirname, 'templates');
const TOKENS_CSS               = path.join(TEMPLATES_DIR, '_tokens.css');
const EVIDENCE_CP_TEMPLATE     = path.join(TEMPLATES_DIR, 'evidence_cp.tmpl.html');
const RUNS_INDEX_TEMPLATE      = path.join(TEMPLATES_DIR, 'runs_index.tmpl.html');
const REPORT_TEMPLATE_VERSION  = '3.0.0';

/** Carga el CSS de tokens e inyecta en el bloque /* ATF:INJECT_TOKENS * / del template */
function injectTokens(html) {
  const tokens = readText(TOKENS_CSS) || '';
  return html.replace('/* ATF:INJECT_TOKENS */', tokens);
}

// ─── FILE HELPERS ─────────────────────────────────────────────────────────────
function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function readJSON(filePath) {
  const t = readText(filePath);
  if (!t) return null;
  // Eliminar BOM (U+FEFF) que algunos editores insertan al inicio del archivo
  try { return JSON.parse(t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t); } catch { return null; }
}

/** Busca archivos de forma recursiva que cumplan matchFn(filename, fullPath) */
function findFiles(dir, matchFn) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, matchFn));
    } else if (matchFn(entry.name, full)) {
      results.push(full);
    }
  }
  return results;
}

// ─── ADAPTER: session_context.json → appweb.yaml (mínimo) ──────────────────────
function synthesizeAppYaml(ctx) {
  if (!ctx) return '';
  const app = ctx.app || {};
  return [
    `name: "${app.name || ctx.app_name || '—'}"`,
    `url: "${app.url || ctx.app_url || '—'}"`,
    `version: "${app.version || ctx.app_version || '—'}"`,
    `environment: "${app.environment || ctx.app_environment || 'qa'}"`,
  ].join('\n');
}

// ─── PARSER: base_pruebas.md → flujos por HU ────────────────
// Extrae por cada `## Módulo:` el listado de HUs (`### HU-X: Title`) con su
// `**Flujo principal:**` narrativo. Se inyecta en flow_map para enriquecer
// la card del dashboard con secuencia de HUs y descripción funcional.
function parseBasePruebasFlows(filepath) {
  if (!filepath || !fs.existsSync(filepath)) return { byHeader: {}, byId: {} };
  const md = fs.readFileSync(filepath, 'utf8');
  const lines = md.split('\n');
  const byHeader = {}; // moduleHeader → [ {hu_id, title, flow} ]
  const byId = {};     // hu_id (lowercase) → {hu_id, title, flow}
  let curMod = null;
  let curHu = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = l.match(/^##\s+Módulo:\s*(.+?)\s*$/);
    if (m) { curMod = m[1].trim(); byHeader[curMod] = byHeader[curMod] || []; curHu = null; continue; }

    m = l.match(/^###\s+(HU-?\d+):\s*(.+?)\s*$/);
    if (m) {
      const cleanTitle = m[2].replace(/⚠️.*$/, '').trim();
      curHu = { hu_id: m[1].trim(), title: cleanTitle, flow: '' };
      // Guardar en header si hay módulo activo, y SIEMPRE en byId para fallback
      // (P85d maneja HUs huérfanas del modo append de /asdd:qa-web-diagnose que
      // no emite `## Módulo:` para HUs nuevas — bug pendiente P87 modo acumulativo).
      if (curMod) {
        byHeader[curMod] = byHeader[curMod] || [];
        byHeader[curMod].push(curHu);
      }
      byId[curHu.hu_id.toLowerCase()] = curHu;
      continue;
    }

    m = l.match(/^\*\*Flujo principal:\*\*\s*(.+?)\s*$/);
    if (m && curHu && !curHu.flow) {
      curHu.flow = m[1].trim();
      continue;
    }
  }
  return { byHeader, byId };
}

// Match heurístico: module_name del execution_plan → header del base_pruebas.
// Compara case-insensitive con substring bidireccional (ignora paréntesis).
function matchModuleHeader(headers, moduleName) {
  if (!moduleName || !headers) return [];
  const norm = (s) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  const tgt = norm(moduleName);
  for (const h of Object.keys(headers)) {
    const hn = norm(h);
    if (tgt === hn || tgt.includes(hn) || hn.includes(tgt)) return headers[h];
  }
  return [];
}

// Extraer número del hu_id ("HU-1-consultar" → "1", "HU01-general" → "1")
function huIdNumber(huid) {
  const m = String(huid || '').match(/^hu-?0*(\d+)/i);
  return m ? m[1] : null;
}

// ─── ADAPTER: execution_plan.json → flow_map.json ───────────
//
// P85a: además de los campos básicos (flow_id, name, risk_level,
// critical, requires_auth), enriquecer con datos del strategist que ya
// existen en `execution_plan.modules[]` y NO se rendereaban: primary_actor,
// priority, hus_count, risk_summary detallado, top_risks, estimated_cps,
// dependencies_inbound/outbound, notes. Ahora todo viaja al render del
// dashboard para densidad informativa real.
//
// P85a además: el flow_map ahora se PERSISTE como artefacto
// auditable en `docs/testing/atf-web/{run_id}/strategy/flow_map.json` (no solo render
// in-memory). Consumidores futuros (dashboard externo, /asdd:qa-web-exec, validators)
// pueden leerlo sin reconstruirlo desde execution_plan.
function synthesizeFlowMap(ep, basePruebasPath) {
  if (!ep) return null;
  const modules = ep.modules
    || ep.instances?.flatMap(i => i.modules || [])
    || [];

  // P85d — parsear flujos por HU desde base_pruebas.md (si existe).
  // bpFlows = { byHeader: {...}, byId: {...} } — el byId se usa como fallback
  // cuando el modo append de /asdd:qa-web-diagnose no escribe `## Módulo:` para HUs nuevas.
  const bpFlows = parseBasePruebasFlows(basePruebasPath);

  // E2E cross-module flows.
  // Antes solo se propagaban 6 campos básicos. P94 propaga todos los
  // campos canónicos del schema (ver docs/concepts/e2e-flows.md) para que el
  // dashboard pueda renderizar las secuencias completas, NFRs, business_value, etc.
  const e2eFlows = (ep.e2e_flows || []).map((e, idx) => ({
    e2e_id:                  e.e2e_id || e.id || `E2E-${idx+1}`,
    name:                    e.name || e.e2e_name || e.description || e.e2e_id || '',
    type:                    e.type || 'e2e',
    category:                e.category || 'functional',
    objective:               e.objective || '',
    business_value:          e.business_value || '',
    modules_involved:        Array.isArray(e.modules_involved) ? e.modules_involved : [],
    hus_involved:            Array.isArray(e.hus_involved) ? e.hus_involved : [],
    actor:                   e.actor || '',
    session_duration_min:    e.session_duration_min || 0,
    entry_url:               e.entry_url || '',
    execution_sequence:      Array.isArray(e.execution_sequence) ? e.execution_sequence : [],
    state_continuity_checks: Array.isArray(e.state_continuity_checks) ? e.state_continuity_checks : [],
    what_to_look_for:        Array.isArray(e.what_to_look_for) ? e.what_to_look_for : [],
    risk_level:              e.risk_level || 'critical',
    requires_auth:           e.requires_auth !== false,
    pending_po_validation:   e.pending_po_validation === true,
    nfrs:                    Array.isArray(e.nfrs) ? e.nfrs : [],
  }));

  // Módulos: enriquecer con todos los campos del strategist
  const moduleFlows = modules.map(m => {
    const rs = m.risk_summary || {};
    const isCritical = (rs.critical || 0) > 0 || m.risk_level === 'critical';

    // P85d — secuencia de HUs con título legible + flujo principal.
    // Estrategia de match (priorizar formato EXACTO del prefijo HU del strategist):
    //   1) Match por header del módulo `## Módulo:` (más confiable cuando existe).
    //   2) Fallback EXACTO por prefijo: extraer "HU-1" o "HU01" del hu_id del
    //      strategist y matchear contra byId (sin scan-by-number cross-módulo).
    // Antes (fallback agresivo) cruzaba HU-1 con HU01 generando matchings erróneos.
    const bpHusByHeader = matchModuleHeader(bpFlows.byHeader, m.module_name || '');
    const husSequence = (m.hus || []).map(huid => {
      const num = huIdNumber(huid);
      // 1) Match por header
      let bp = num ? bpHusByHeader.find(h => huIdNumber(h.hu_id) === num) : null;
      // 2) Fallback estricto: prefijo HU<num> EXACTO (preserva formato HU-1 vs HU01)
      if (!bp && bpFlows.byId) {
        const huPrefixMatch = String(huid).match(/^(HU-?\d+)/i);
        const huShort = huPrefixMatch ? huPrefixMatch[1].toLowerCase() : null;
        if (huShort && bpFlows.byId[huShort]) bp = bpFlows.byId[huShort];
      }
      // Fallback de título: derivar del slug del hu_id si no hay match
      const fallbackTitle = String(huid)
        .replace(/^hu-?\d+-?/i, '')
        .replace(/-/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
      return {
        hu_id:        huid,
        short_title:  bp ? bp.title : fallbackTitle,
        flow_summary: bp ? bp.flow  : '',
      };
    });

    return {
      flow_id:               m.module_id || m.id || '',
      name:                  m.module_name || m.name || m.module_id || '',
      risk_level:            isCritical ? 'critical' : ((rs.high || 0) > 0 ? 'high' : (m.risk_level || 'medium')),
      critical:              isCritical,
      requires_auth:         true,
      // P85a — campos enriquecidos del strategist (antes descartados)
      primary_actor:         m.primary_actor || '',
      priority:              m.priority || '',
      hus_count:             Array.isArray(m.hus) ? m.hus.length : 0,
      risk_summary:          {
        critical: rs.critical || 0,
        high:     rs.high     || 0,
        medium:   rs.medium   || 0,
        low:      rs.low      || 0,
      },
      top_risks:             Array.isArray(rs.top_risks) ? rs.top_risks.slice(0, 5) : [],
      estimated_cps:         m.estimated_cps || 0,
      dependencies_inbound:  Array.isArray(m.dependencies_inbound)  ? m.dependencies_inbound  : [],
      dependencies_outbound: Array.isArray(m.dependencies_outbound) ? m.dependencies_outbound : [],
      notes:                 m.notes || '',
      // P85d — secuencia funcional del módulo (HUs con flujo principal)
      hus_sequence:          husSequence,
    };
  });

  // — separación canónica:
  //   flows[]      → módulos individuales (sección 2 del dashboard)
  //   e2e_flows[]  → flujos cross-módulo reales (sección 1, prioridad UX)
  // El campo critical_paths se mantiene como alias retrocompatible apuntando a e2e_flows
  // (renderDiscovery lee critical_paths para sección 1).
  return {
    flows:          moduleFlows,            // módulos
    total_flows:    moduleFlows.length,
    e2e_flows:      e2eFlows,               // flujos E2E reales (cross-módulo)
    total_e2e:      e2eFlows.length,
    critical_paths: e2eFlows,               // alias usado por renderDiscovery
    critical_flows: ep.critical_flows || [],
  };
}

// ─── ADAPTER: cp_modulo_*.json → Gherkin feature text ────────────────────────
function convertCpToGherkin(cp) {
  if (!cp || !cp.module_id) return '';
  let out = `Feature: ${cp.module_id}\n`;
  if (cp.description) out += `  ${cp.description}\n`;
  out += '\n';

  for (const tc of (cp.test_cases || [])) {
    const tags = (tc.tags || []).join(' ');
    if (tags) out += `  ${tags}\n`;
    const title = tc.name || tc.title || tc.id || 'Caso sin nombre';
    out += `  Scenario: [${tc.risk_level || 'medium'}] ${title}\n`;
    const steps = tc.given_when_then || tc.steps
      || (tc.gherkin
          ? tc.gherkin.split('\n')
              .filter(l => /^\s+(Given|When|Then|And|But|Dado|Cuando|Entonces|Y|Pero)\s/.test(l))
              .map(l => l.trim())
          : []);
    for (const step of steps) {
      out += `    ${step}\n`;
    }
    out += '\n';
  }
  return out;
}

// ─── NORMALIZER: risk_matrix.json → flat risks[] ─────────────────────────────
// — además de aplanar baseline/incremental, también enriquece
// items que ya vienen flat pero con campos faltantes:
//   - risk_score ausente o undefined → derivar desde risk_level (rlMap)
//   - full_description con keys abreviadas (puede_pasar/provocaria) → mapear a
//     las keys canónicas del dashboard (puede_pasar_que/lo_que_provocaria_que)
const RL_MAP = { critical: 12, high: 8, medium: 4, low: 1 };

function normalizeRiskItem(item) {
  const out = { ...item };
  // Inferir risk_score si falta o es undefined/null/0 inválido
  if (out.risk_score == null || out.risk_score === undefined) {
    out.risk_score = RL_MAP[out.risk_level] || 4;
  }
  // Normalizar keys de full_description (drift de spec entre strategist y dashboard)
  if (out.full_description && typeof out.full_description === 'object') {
    const fd = out.full_description;
    out.full_description = {
      dado_que:                fd.dado_que || '',
      puede_pasar_que:         fd.puede_pasar_que || fd.puede_pasar || '',
      lo_que_provocaria_que:   fd.lo_que_provocaria_que || fd.provocaria || fd.lo_que_provocaria || '',
    };
  }
  return out;
}

function normalizeRiskMatrix(rm) {
  if (!rm) return rm;

  // Caso 1: ya tiene flat risks[] o flows[] o risk_items[] → enriquecer cada item
  if (rm.risks?.length) return { ...rm, risks: rm.risks.map(normalizeRiskItem) };
  if (rm.risk_items?.length) return { ...rm, risk_items: rm.risk_items.map(normalizeRiskItem) };
  if (rm.flows?.length) return rm;

  // Caso 2: aplanar modules[].hus[] (baseline) o modules[].risks[] (incremental) → risks[]
  const risks = [];
  for (const mod of (rm.modules || [])) {
    const items = (mod.risks?.length ? mod.risks : null) || mod.hus || [];
    for (const item of items) {
      risks.push(normalizeRiskItem({
        risk_id:       item.risk_id || item.hu_id || item.id,
        description:   item.description || item.title,
        module:        mod.module_id || item.module,
        risk_level:    item.risk_level,
        risk_score:    item.risk_score,
        justification: item.justification || item.rationale || '',
        full_description: item.full_description,
      }));
    }
  }
  return { ...rm, risks };
}

// ─── INVEST TABLE PARSER: base_pruebas.md → invest_table.json ────────────────
/**
 * Extrae la validación INVEST por HU desde base_pruebas.md.
 * Formato esperado: ### HU-XX: Title
 *                   **FRS ítem:** 80.5% | **INVEST:** I:✅ N:✅ V:✅ E:✅ S:✅ T:✅
 */
function parseINVESTTable(md) {
  if (!md) return null;
  const entries = [];
  const huRegex = /###\s+(HU-\d+):\s*([^\n]+)/g;
  let m;
  while ((m = huRegex.exec(md)) !== null) {
    const huId    = m[1];
    const title   = m[2].trim();
    // Buscar línea INVEST dentro de los siguientes 400 caracteres
    const slice   = md.substring(m.index, m.index + 400);
    const investM = slice.match(/\*\*INVEST:\*\*\s+I:(\S+)\s+N:(\S+)\s+V:(\S+)\s+E:(\S+)\s+S:(\S+)\s+T:(\S+)/);
    if (!investM) continue;
    const criteria = { I: investM[1], N: investM[2], V: investM[3], E: investM[4], S: investM[5], T: investM[6] };
    // FRS del ítem
    const frsM    = slice.match(/\*\*FRS[^*]*\*\*[:\s]*(\d+(?:\.\d+)?)%/);
    const frsItem = frsM ? parseFloat(frsM[1]) : null;
    // Estado global: ❌ → red, ⚠️ → yellow, todo ✅ → green
    const vals    = Object.values(criteria);
    const hasRed  = vals.some(v => v.includes('❌'));
    const hasYlw  = vals.some(v => v.includes('⚠'));
    const status  = hasRed ? 'red' : hasYlw ? 'yellow' : 'green';
    // Resumen: primer criterio de aceptación o título
    const caM     = slice.match(/\*\*Criterios de aceptación:\*\*\n([\s\S]{0,250})/);
    const summary = caM
      ? caM[1].trim().split('\n')[0].replace(/^[-*•]\s*/, '').substring(0, 90)
      : title.substring(0, 90);
    entries.push({ hu_id: huId, title, frs_item: frsItem, criteria, status, summary });
  }
  return entries.length ? { entries } : null;
}

// ─── Removido: parseBugFiles / buildEvidenceHtml / generateBugEvidenceFiles.
// El executor ya no emite archivos BUG-*.md; la info del bug vive dentro del
// result.json del CP (campo bug_candidate) y se renderiza en evidence.html vía
// evidence_cp.tmpl.html cuando status=FAIL. Ver git history para la implementación previa.


// ─── CP EVIDENCE HTML GENERATOR ──────────────────────────────────────────────

/**
 * Genera evidence.html para un CP responsive (root result.json con
 * viewport_results[] y steps[] vacío — REGLA 31).
 * Muestra la matriz de viewports con links a la evidencia individual.
 */
function buildResponsiveCpEvidenceHtml(cpDir, result) {
  const {
    cp_id, module_id, status, executed_at,
    viewport_results = [], result_policy, viewports_count,
  } = result;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const STATUS_COLOR = { PASS: '#1a8a3e', FAIL: '#d42020', BLOCKED: '#e07020' };
  const STATUS_EMOJI = { PASS: '✅', FAIL: '❌', BLOCKED: '⚠️' };
  const dateStr = executed_at ? new Date(executed_at).toLocaleString('es-CO') : '—';
  const aggColor = STATUS_COLOR[status] || '#888';
  const aggEmoji = STATUS_EMOJI[status] || '◦';

  const vpRows = viewport_results.map(vp => {
    const vpColor   = STATUS_COLOR[vp.status] || '#888';
    const vpEmoji   = STATUS_EMOJI[vp.status] || '◦';
    const vpEvPath  = path.join(cpDir, vp.viewport_name, 'evidence.html');
    const hasEv     = fs.existsSync(vpEvPath);
    const dimStr    = (vp.viewport_width && vp.viewport_height) ? `${vp.viewport_width}×${vp.viewport_height}` : '—';
    const durStr    = vp.duration_ms ? `${(vp.duration_ms / 1000).toFixed(1)}s` : '—';
    const stepsStr  = vp.steps_total ? `${vp.steps_passed ?? 0}/${vp.steps_total}` : '—';
    return `<tr>
      <td><strong>${esc(vp.viewport_name)}</strong><br><span style="color:#888;font-size:.75rem">${dimStr}</span></td>
      <td style="color:${vpColor};font-weight:700">${vpEmoji} ${esc(vp.status)}</td>
      <td>${stepsStr}</td>
      <td>${durStr}</td>
      <td>${hasEv ? `<a href="${esc(vp.viewport_name)}/evidence.html" target="_blank" style="color:#D46800;text-decoration:none;font-weight:600">Ver evidencia ↗</a>` : '<span style="color:#888;font-size:.8rem">No disponible</span>'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Evidencia Responsive — ${esc(cp_id)} | ATF</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;background:#f7f5f2;color:#1a1a18}
    .rh{background:#1a1a18;color:#efeae4;border-radius:8px;padding:1.5rem 2rem;margin-bottom:1.5rem;border-bottom:3px solid #D46800}
    .c{max-width:920px;margin:2rem auto;padding:0 1.5rem}
    section{background:#fff;border-radius:8px;padding:1.5rem 2rem;margin-bottom:1.5rem;border:1px solid #ddd8d0}
    h2{font-size:1rem;font-weight:700;margin-bottom:1rem}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:.45rem .75rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#D46800;font-weight:800;background:#f0ede8;border-bottom:2px solid #ddd8d0}
    td{padding:.6rem .75rem;border-bottom:1px solid #eee;vertical-align:middle}tr:last-child td{border-bottom:none}
    .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem}
    .mi{font-size:.8rem;color:#4a4640}.mi span{font-weight:700;color:#1a1a18;display:block}
  </style>
</head>
<body>
<div class="c">
  <div class="rh">
    <h1 style="font-size:1.3rem">📱 Evidencia Responsive — ${esc(cp_id)}</h1>
    <p style="color:rgba(239,234,228,.6);margin-top:.3rem">${esc(module_id || '—')} · responsive run</p>
  </div>
  <section>
    <div class="meta">
      <div class="mi">Estado agregado<span style="color:${aggColor}">${aggEmoji} ${esc(status)}</span></div>
      <div class="mi">Policy<span>${esc(result_policy || 'strict')}</span></div>
      <div class="mi">Viewports<span>${viewports_count || viewport_results.length}</span></div>
      <div class="mi">Ejecutado<span>${esc(dateStr)}</span></div>
    </div>
  </section>
  <section>
    <h2>Resultados por Viewport</h2>
    <table>
      <thead><tr><th>Viewport</th><th>Estado</th><th>Pasos ✓/total</th><th>Duración</th><th>Evidencia</th></tr></thead>
      <tbody>${vpRows || '<tr><td colspan="5" style="text-align:center;color:#888;padding:2rem">Sin resultados de viewport.</td></tr>'}</tbody>
    </table>
  </section>
</div>
</body>
</html>`;
}

/**
 * Genera evidence.html autocontenido para un CP ejecutado (PASS o FAIL).
 * Usa result.json para los metadatos/pasos e incrusta screenshots en base64.
 * Idempotente — sobreescribe si ya existe.
 *
 * Para CPs responsive (result.responsive === true) delega a
 * buildResponsiveCpEvidenceHtml que genera una vista de matriz de viewports.
 */
function buildCpEvidenceHtml(cpDir, result) {
  // Responsive root CPs: steps[] vacío (REGLA 31) — usar vista de viewport matrix
  if (result.responsive === true && Array.isArray(result.viewport_results)) {
    return buildResponsiveCpEvidenceHtml(cpDir, result);
  }
  // ── Derive missing metadata from folder structure ──────────────────────────
  // Folder layout: execution/{module_id}/{source_id}/result.json
  const _folderModuleId = path.basename(path.dirname(cpDir));
  const _moduleResultPath = path.join(path.dirname(cpDir), 'module_result.json');
  let _enriched = {};
  if (fs.existsSync(_moduleResultPath)) {
    try {
      const mr = JSON.parse(fs.readFileSync(_moduleResultPath, 'utf8'));
      const match = (mr.results || []).find(r =>
        r.source_id === result.source_id && r.cp_id === result.cp_id
      );
      if (match) _enriched = { module_id: mr.module_id, hu_id: match.funcional_ref, risk_level: match.risk_level };
    } catch { /* skip */ }
  }

  const {
    cp_id,
    module_id = _enriched.module_id || _folderModuleId || '—',
    hu_id = _enriched.hu_id || '—',
    status,
    risk_level = _enriched.risk_level || '—',
    executed_at, failed_step, error_message, steps = [],
    bug_screenshot = 'bug_screenshot_annotated.png',
  } = result;

  // ── Enriquecer con datos de diseño del CP (preconditions, steps_raw, expected_result, tags) ──
  // Layout: execution/{module_id}/{cp_slug}/result.json → run_dir = ../../..
  let cpDesign = {};
  try {
    const runDirForCp = path.resolve(cpDir, '..', '..', '..');
    const designFile = path.join(runDirForCp, 'design', `cp_modulo_${module_id}.json`);
    if (fs.existsSync(designFile)) {
      const cpMod = JSON.parse(fs.readFileSync(designFile, 'utf8'));
      const match = (cpMod.test_cases || []).find(tc =>
        tc.cp_id === cp_id || (tc.source_id && tc.source_id === result.source_id)
      );
      if (match) {
        cpDesign = {
          preconditions:   match.preconditions || result.preconditions || '',
          steps_raw:       match.steps_raw || result.steps_raw || '',
          expected_result: match.expected_result || result.expected_result || '',
          tags:            Array.isArray(match.tags) ? match.tags : [],
        };
      }
    }
  } catch { /* fallback a lo que traiga result */ }
  // Fallback — si no se encontró el design, usar lo que venga en result.json
  if (!cpDesign.preconditions && !cpDesign.steps_raw && !cpDesign.expected_result) {
    cpDesign = {
      preconditions:   result.preconditions || '',
      steps_raw:       result.steps_raw || '',
      expected_result: result.expected_result || '',
      tags:            Array.isArray(result.tags) ? result.tags : [],
    };
  }

  // ── Cargar screenshots del directorio del CP ──────────────────────────────
  // Also load from sibling directories when evidence paths contain '/'
  const screenshots = {};   // { 'evidence_01.png': b64, ... }
  let bugShotB64 = null;
  const moduleDir = path.dirname(cpDir);  // execution/{module_id}/
  const pngFiles = findFiles(cpDir, n => n.endsWith('.png'));

  // Pre-load sibling screenshots referenced in steps (cross-directory evidence)
  for (const s of steps) {
    if (s.evidence && s.evidence.includes('/')) {
      const crossPath = path.join(moduleDir, s.evidence);
      if (fs.existsSync(crossPath) && !pngFiles.includes(crossPath)) {
        pngFiles.push(crossPath);
      }
    }
  }

  for (const pngPath of pngFiles) {
    try {
      const b64 = fs.readFileSync(pngPath).toString('base64');
      const fname = path.basename(pngPath);
      // For cross-dir files, also index by relative path from moduleDir
      const relFromModule = path.relative(moduleDir, pngPath).replace(/\\/g, '/');
      if (fname === bug_screenshot || fname === 'bug_screenshot_annotated.png') {
        if (!bugShotB64) bugShotB64 = b64;
      } else {
        screenshots[fname] = b64;
        if (relFromModule !== fname) screenshots[relFromModule] = b64;
        // Normalizar: paso_01_fail.png / step_01.png → evidence_01.png
        const numMatch = fname.match(/(?:evidence|paso|step)[_-](\d+)/i);
        if (numMatch) {
          const canonKey = `evidence_${numMatch[1].padStart(2, '0')}.png`;
          if (!screenshots[canonKey]) screenshots[canonKey] = b64;
        }
      }
    } catch { /* skip */ }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const passCount = steps.filter(s => s.status === 'PASS').length;
  const failCount = steps.filter(s => s.status === 'FAIL').length;
  const dateStr = executed_at ? new Date(executed_at).toLocaleString('es-CO') : '—';

  // ── Pre-resolver screenshots por paso (base64 embebido para template y fallback) ──
  const stepsWithImg = steps.map((s, idx) => {
    const stepNum = s.n || (idx + 1);
    const isFail = s.status === 'FAIL';
    // Resolve evidence key — support both local filenames and cross-dir paths (e.g. "2_01_1/rn7_evidence_05.png")
    const evKey = s.evidence || `evidence_${String(stepNum).padStart(2, '0')}.png`;
    const imgB64 = (evKey && screenshots[evKey])
      || (evKey && screenshots[path.basename(evKey)])
      || screenshots[`evidence_${String(stepNum).padStart(2, '0')}.png`]
      || (isFail ? bugShotB64 : null)
      || null;
    return {
      n:     stepNum,
      text:  s.text || s.action || s.description || '',
      status: s.status,
      error: s.error || null,
      imgB64,
      evidence_status: s.evidence_status || (imgB64 ? 'captured' : null),
      evidence_error: s.evidence_error || null,
      evidence_retry: s.evidence_retry || false,
    };
  });

  // Detectar evidence_mode desde session_context.json del run
  const runDirForCtx = path.resolve(cpDir, '..', '..', '..', '..');
  const ctxForEv = readJSON(path.join(runDirForCtx, 'session_context.json'))
    || readJSON(path.join(path.resolve(cpDir, '..', '..', '..'), 'session_context.json'))
    || {};
  const cpEvidenceMode = ctxForEv?.test_run?.evidence_mode || ctxForEv?.evidence_mode || 'failures_only';

  // ── ALM report data (solo para FAIL) ────────────────────────────────────
  const bug = result.bug_candidate || {};
  const almReport = (status === 'FAIL') ? {
    title:              bug.title || `[${cp_id}] FAIL — ${result.title || ''}`,
    matrix_ref:         bug.matrix_ref || result.ca_ref || result.funcional_ref || '—',
    environment:        ctxForEv?.app_environment || 'QA',
    steps_to_reproduce: bug.steps_to_reproduce || (steps || []).map((s, i) => `${i + 1}. ${s.text || s.action || ''}`).join('\n'),
    expected_result:    bug.expected_result || result.expected_result || '—',
    actual_result:      bug.actual_result || result.actual_result || error_message || '—',
    evidence_files:     bug.evidence || (steps || []).filter(s => s.status === 'FAIL').map(s => s.evidence).filter(Boolean),
    priority:           bug.priority || ({ critical: 'Alta', high: 'Alta', medium: 'Media', low: 'Baja' }[risk_level] || 'Media'),
    labels:             bug.labels || [result.hu_id, module_id].filter(Boolean),
    assignee:           bug.assignee || 'Automático',
    initial_status:     bug.initial_status || 'To Do',
    project_type:       bug.project_type || 'Defecto funcional',
    severity:           bug.severity || risk_level,
    root_cause:         bug.root_cause_hypothesis || '',
    recommended_action: bug.recommended_action || '',
    business_ref:       bug.business_ref || result.business_data?.ref || '',
  } : null;

  // ── Pre-resolver screenshots de setup_steps (ADR-001 Opción C' — playbooks de precondición) ──
  const setupSteps = Array.isArray(result.setup_steps) ? result.setup_steps : [];
  const setupStepsWithImg = setupSteps.map((s, idx) => {
    const stepNum = s.n || (idx + 1);
    const evKey = s.evidence || `setup_${String(stepNum).padStart(2, '0')}.png`;
    const imgB64 = (evKey && screenshots[evKey])
      || (evKey && screenshots[path.basename(evKey)])
      || null;
    return {
      n:     stepNum,
      playbook_id: s.playbook_id || null,
      text:  s.text || '',
      status: s.status,
      error: s.error || null,
      imgB64,
      interactions: s.interactions || [],
    };
  });

  // ── Validaciones BD (REGLA 7) — pasan tal cual si existen; inline de rows
  // para los adapters que no pasaron por db-query.js (futuros adapters que
  // escriban directo al result.json). Para entradas con evidence_file pero sin rows inline,
  // leemos el db_evidence_{N}.json del directorio del CP.
  let dbValidations = Array.isArray(result.db_validations) ? result.db_validations : [];
  dbValidations = dbValidations.map(v => {
    const out = Object.assign({}, v);
    if (!Array.isArray(out.rows) && out.evidence_file) {
      const evFile = path.isAbsolute(out.evidence_file)
        ? out.evidence_file
        : path.join(cpDir, out.evidence_file);
      const evData = readJSON(evFile);
      if (evData) {
        if (Array.isArray(evData.rows)) out.rows = evData.rows;
        if (typeof evData.row_count === 'number') out.row_count = evData.row_count;
        if (typeof evData.duration_ms === 'number') out.duration_ms = evData.duration_ms;
        if (!out.query && evData.query) out.query = evData.query;
      }
    }
    return out;
  });

  const cpData = {
    cp_id, module_id, hu_id,
    status,
    risk_level,
    dateStr,
    failed_step: failed_step || null,
    error_message: error_message || '',
    passCount,
    failCount,
    steps: stepsWithImg,
    setup_steps: setupStepsWithImg,
    blocked_reason: result.blocked_reason || null,
    environmental_limitation: result.environmental_limitation || false,
    bugShotB64: bugShotB64 || null,
    evidence_mode: cpEvidenceMode,
    alm_report: almReport,
    // ── Validaciones BD (REGLA 7 — apéndice técnico del evidence.html) ──
    db_validations: dbValidations,
    db_connection_failed: result.db_connection_failed === true,
    // flag feature on/off para que el template distinga entre
    // "feature off (no renderizar sección)" y "feature on pero 0 matches (renderizar banner info)".
    db_feature_enabled: (() => {
      try {
        const runDir = path.resolve(cpDir, '..', '..', '..');
        const sc = readJSON(path.join(runDir, 'session_context.json'));
        return !!(sc && sc.db_config);
      } catch { return false; }
    })(),
    // — REGLA 7 doble opt-in: el CP debe tener `@bd` para
    // que la sección BD se renderice. Sin este tag el CP nunca iba a validar
    // BD, así que el banner "feature activa, sin matches" es irrelevante.
    db_cp_opted_in: Array.isArray(cpDesign.tags)
      && cpDesign.tags.some(t => String(t).toLowerCase() === '@bd'),
    // ── Especificación del CP (desde cp_modulo_*.json) ──
    preconditions:   cpDesign.preconditions,
    steps_raw:       cpDesign.steps_raw,
    expected_result: cpDesign.expected_result,
    tags:            cpDesign.tags,
  };

  // ── Cargar template externo; fallback a inline si no existe ────────────────
  const cpTmplHtml = readText(EVIDENCE_CP_TEMPLATE);
  if (cpTmplHtml) {
    const dataScript = `<script id="atf-cp-data-placeholder">window.CP_DATA = ${
      JSON.stringify(cpData).replace(/<\/script>/gi, '<\\/script>')
    };</script>`;
    return injectTokens(
      cpTmplHtml.replace('<script id="atf-cp-data-placeholder">window.CP_DATA = null;</script>', dataScript)
    );
  }

  // ── Fallback inline (legacy) ───────────────────────────────────────────────
  const stepRows = stepsWithImg.map(s => {
    const isFail = s.status === 'FAIL';
    const evStatus = s.evidence_status || (s.imgB64 ? 'captured' : null);
    let imgHtml;
    if (s.imgB64) {
      imgHtml = `<img src="data:image/png;base64,${s.imgB64}" style="max-width:100%;border-radius:6px;cursor:zoom-in">`;
    } else if (evStatus === 'capture_failed') {
      imgHtml = `<span style="color:#e07020;font-weight:600;font-size:.8rem">&#9888; Captura fallida${s.evidence_error ? ` (${esc(s.evidence_error)})` : ''}${s.evidence_retry ? ' — reintentado' : ''}</span>`;
    } else if (evStatus === 'not_captured' || cpEvidenceMode === 'failures_only') {
      imgHtml = `<span style="color:#888;font-style:italic;font-size:.8rem">Sin captura (modo eficiencia)</span>`;
    } else {
      imgHtml = `<span style="color:#888;font-style:italic;font-size:.8rem">${isFail ? '&#9888; Sin screenshot' : ''}</span>`;
    }
    return `<div style="border:1px solid #ddd;border-radius:8px;margin-bottom:12px;overflow:hidden;border-left:4px solid ${isFail?'#d42020':'#1a8a3e'}">
      <div style="padding:.6rem 1rem;background:#f8fafc;display:flex;align-items:center;gap:.75rem">
        <span>${isFail?'❌':'✅'}</span><span style="font-weight:500">${esc(s.text)}</span>
        <span style="margin-left:auto;font-size:.7rem;font-weight:700;color:${isFail?'#d42020':'#1a8a3e'}">${s.status}</span>
      </div>
      ${isFail ? `<div style="padding:.4rem 1rem;background:#fef2f2;color:#d42020;font-size:.8rem"><code>${esc(s.error||error_message||'Error desconocido')}</code></div>` : ''}
      <div style="padding:1rem;text-align:center">${imgHtml}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Evidencia — ${esc(cp_id)} | ATF</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;font-size:14px;background:#f7f5f2;color:#1a1a18}
.rh{background:#1a1a18;color:#efeae4;border-radius:8px;padding:1.5rem 2rem;margin-bottom:2rem;border-bottom:3px solid #D46800}
.container{max-width:1100px;margin:2rem auto;padding:0 1.5rem}
section{background:#fff;border-radius:8px;padding:1.5rem 2rem;margin-bottom:2rem;border:1px solid #ddd8d0}
</style></head><body>
<div class="container">
<div class="rh"><h1 style="font-size:1.3rem">📋 Evidencia de Ejecución — ${esc(cp_id)}</h1>
<p style="color:rgba(239,234,228,.6);margin-top:.3rem">${esc(module_id)} · ${esc(hu_id)}</p></div>
<section><h2 style="font-size:1rem;margin-bottom:1rem">Pasos de Ejecución (${steps.length} pasos)</h2>
${stepRows||'<p style="color:#888;font-style:italic">Sin pasos disponibles.</p>'}</section>
${cpData.bugShotB64?`<section style="text-align:center"><h2 style="font-size:1rem;margin-bottom:1rem;color:#d42020">Bug Screenshot</h2><img src="data:image/png;base64,${cpData.bugShotB64}" style="max-width:100%;border-radius:8px"></section>`:''}
</div></body></html>`;
}

/**
 * Genera evidence.html por cada CP ejecutado (PASS y FAIL) bajo execution/.
 * Idempotente — sobreescribe el HTML si ya existe.
 *
 * @param {string} runDir          — ruta al run folder
 * @param {string[]|null} filterSlugs  — si es array con valores, solo regenera
 *   evidence.html para los CPs cuya carpeta (basename) coincida con uno de los
 *   slugs. Si es null/vacío/undefined, regenera todos (comportamiento por defecto).
 */
function generateCpEvidenceFiles(runDir, filterSlugs) {
  const execDirs = [
    path.join(runDir, 'execution'),
  ].filter(d => fs.existsSync(d));

  const slugSet = Array.isArray(filterSlugs) && filterSlugs.length > 0
    ? new Set(filterSlugs)
    : null;

  let count = 0;
  for (const execDir of execDirs) {
    const resultFiles = findFiles(execDir, n => n === 'result.json');
    for (const resultPath of resultFiles) {
      const result = readJSON(resultPath);
      if (!result) continue;  // genera evidence.html para PASS y FAIL
      const cpDir = path.dirname(resultPath);

      // Filtro opcional por slug del CP (para modo --evidence-only --cp-ids=...)
      if (slugSet && !slugSet.has(path.basename(cpDir))) continue;

      try {
        const html = buildCpEvidenceHtml(cpDir, result);
        fs.writeFileSync(path.join(cpDir, 'evidence.html'), html, 'utf8');
        count++;
      } catch { /* un CP no debe bloquear los demás */ }
    }
  }

  return count;
}

// ─── EXTRACT FRS ─────────────────────────────────────────────────────────────
function extractFRS(md) {
  if (!md) return null;
  const m = md.match(/Functional Readiness Score[:\s*]+(\d+(?:\.\d+)?)%/i)
    || md.match(/FRS Global[:\s*]+(\d+(?:\.\d+)?)%/i)
    || md.match(/\*\*FRS[:\s*]+\*\*\s*(\d+(?:\.\d+)?)%/i)
    || md.match(/\*\*FRS:\*\*\s*(\d+(?:\.\d+)?)%/i)
    || md.match(/(\d+(?:\.\d+)?)%/);
  return m ? parseInt(m[1]) : null;
}

// ─── PIPELINE STATUS INFERENCE ────────────────────────────────────────────────
/**
 * Infiere el estado del pipeline a partir de los artefactos existentes en el run.
 * Si existe pipeline_progress.json (escrito por el Orchestrator), lo usa como
 * fuente primaria. De lo contrario, infiere desde la presencia de archivos.
 */
function inferPipelineStatus(runDir) {
  // Fuente primaria: archivo explícito del Orchestrator
  const progressFile = path.join(runDir, 'pipeline_progress.json');
  const explicit = readJSON(progressFile);
  if (explicit && explicit.phases) {
    const hasExplicitPending = Object.values(explicit.phases).some(v => v === 'pending');
    return {
      status:        hasExplicitPending ? 'partial' : 'complete',
      current_phase: explicit.current_phase || null,
      phases:        explicit.phases,
      last_updated:  explicit.last_updated || new Date().toISOString(),
    };
  }

  // Fallback: inferir desde artefactos en disco
  const has = (rel) => {
    const full = path.join(runDir, rel);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        try { return fs.readdirSync(full).length > 0; } catch { return false; }
      }
      return true;
    }
    return false;
  };
  const hasGlob = (dir, prefix, ext) => {
    return findFiles(path.join(runDir, dir), n => n.startsWith(prefix) && n.endsWith(ext)).length > 0;
  };

  const fase_0  = has('diagnostics/base_pruebas.md');
  const fase_1  = has('strategy/execution_plan.json');
  const fase_1c = hasGlob('design', 'cp_modulo_', '.json');
  const fase_1d = has('screen_coverage.json');
  const fase_2c = findFiles(path.join(runDir, 'execution'), n => n === 'module_result.json').length > 0;
  // Consolidación: se infiere por existencia de report.html ya generado previamente
  const consolidation = has('report.html');

  // Leer session_context.json para pipeline switches (fases desactivadas → "skipped")
  const ctx = readJSON(path.join(runDir, 'session_context.json'));
  const switchOf = (key, fallback) => {
    if (!ctx) return fallback;
    // Buscar en formato plano, ctx.pipeline.fase_X, o ctx.pipeline_switches
    const base = key.replace(/_on$/, '');
    const v = ctx[key] ?? ctx.pipeline?.[key]
      ?? ctx.pipeline_switches?.[key] ?? ctx.pipeline_switches?.[base];
    if (v === false || v === 'false' || v === 'OFF') return 'skipped';
    return fallback;
  };

  const stateOf = (done, switchKey) => {
    const skip = switchOf(switchKey, null);
    if (skip === 'skipped') return 'skipped';
    return done ? 'done' : 'pending';
  };

  const phases = {
    fase_0:        stateOf(fase_0,  'fase_0_on'),
    fase_1:        stateOf(fase_1,  'fase_1_on'),
    fase_1c:       stateOf(fase_1c, 'fase_1c_on'),
    fase_1d:       fase_1c ? (fase_1d ? 'done' : 'pending') : 'pending',
    fase_2c:       stateOf(fase_2c, 'fase_2c_on'),
    consolidation: consolidation ? 'done' : 'pending',
  };

  // Determinar current_phase: la primera fase "pending" en orden
  const order = ['fase_0','fase_1','fase_1c','fase_1d','fase_2c','consolidation'];
  let current = null;
  for (const p of order) {
    if (phases[p] === 'pending') { current = p; break; }
  }

  // Estado del pipeline: 'complete' si todas las fases activas terminaron,
  // 'partial' si hay fases activas aún pendientes
  const hasActivePending = order.some(p => phases[p] === 'pending');
  const computedStatus = hasActivePending ? 'partial' : 'complete';

  return {
    status:        computedStatus,
    current_phase: current,
    phases,
    last_updated:  new Date().toISOString(),
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
function main(runId) {
  const runDir = path.join(OUTPUT_BASE, runId);

  if (!fs.existsSync(runDir)) {
    console.error(`\n❌  No se encontró el run: ${runDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(DASHBOARD_TEMPLATE)) {
    console.error(`\n❌  No se encontró dashboard.html: ${DASHBOARD_TEMPLATE}`);
    process.exit(1);
  }

  console.log(`\n⬡  ATF Report Generator v2`);
  console.log(`   run_id : ${runId}`);
  console.log(`   source : ${runDir}\n`);

  const data = { '__run_id': runId };
  let found = 0;

  function ingest(key, content) {
    if (content === null || content === undefined) return;
    data[key] = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    console.log(`   ✓  ${key}`);
    found++;
  }

  function ingestFile(key, relPath) {
    const full = path.join(runDir, relPath);
    const content = readText(full);
    if (content) ingest(key, content);
    else console.log(`   ·  ${relPath}  (no disponible)`);
  }

  // ── PASO 2: session_context.json ─────────────────────────────────────────
  const ctx = readJSON(path.join(runDir, 'session_context.json'));
  if (ctx) { ingest('session_context.json', JSON.stringify(ctx, null, 2)); }
  else console.log('   ·  session_context.json  (no disponible)');

  // ── PASO 3: artefactos fijos con alias ───────────────────────────────────
  // Mapeo dual : base_pruebas.md se ingiere también bajo su nombre
  // real para que renderBasePruebasByHu() lo encuentre. El alias legacy
  // (testability_score.md) preserva renderTestability() y parseINVESTTable().
  ingestFile('testability_score.md', 'diagnostics/base_pruebas.md');
  ingestFile('base_pruebas.md',       'diagnostics/base_pruebas.md');
  // Prefijar metadatos de sesión al testability_score.md para que renderTestability()
  // pueda mostrar Fecha, Ambiente, Analista y Run ID
  if (data['testability_score.md'] && ctx) {
    const ts = ctx.pipeline_start_time || ctx.date || ctx.timestamp || '';
    const dateStr = ts
      ? new Date(ts).toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })
      : '—';
    const metaHeader = [
      `**Fecha:** ${dateStr}`,
      `**Ambiente:** ${ctx.app?.environment || ctx.app_environment || '—'}`,
      `**Analista:** ${ctx.analyst || ctx.analista || ctx.qa_analyst || 'ATF Automático'}`,
      `**Run ID:** ${runId}`,
      '',
    ].join('\n');
    data['testability_score.md'] = metaHeader + data['testability_score.md'];
  }
  // Generar tabla INVEST por HU desde testability_score.md
  const investData = parseINVESTTable(data['testability_score.md']);
  if (investData) ingest('invest_table.json', JSON.stringify(investData, null, 2));

  ingestFile('assumptions.md',        'diagnostics/assumptions.md');
  ingestFile('preguntas_cliente.md',  'diagnostics/preguntas_cliente.md');
  ingestFile('material_references.json', 'diagnostics/material_references.json');
  ingestFile('data_needs_summary.json', 'diagnostics/data_needs_summary.json');
  const rmRaw = readJSON(path.join(runDir, 'strategy', 'risk_matrix.json'));
  const rmNorm = normalizeRiskMatrix(rmRaw);
  if (rmNorm) { ingest('risk_matrix.json', JSON.stringify(rmNorm, null, 2)); }
  else console.log('   ·  strategy/risk_matrix.json  (no disponible)');
  ingestFile('test_strategy.md',     'strategy/hu_priority.md');
  ingestFile('execution_plan.json',  'strategy/execution_plan.json');

  // Visual + UX + A11y (producido por /asdd:qa-web-visual-ux-a11y → tools/aggregate-vua-results.js)
  // Vive en root del run (no en sub-carpeta) — consumido por renderUX() en dashboard.html.
  // Si no existe, autoHideTabs() del dashboard oculta el tab automáticamente.
  ingestFile('visual_ux_a11y_results.json', 'visual_ux_a11y_results.json');

  // Performance / Core Web Vitals (producido por /asdd:qa-web-perf → tools/lh-aggregate-results.js)
  // Vive en root del run (no en sub-carpeta) — consumido por renderPerf() en dashboard.html.
  // Si no existe, autoHideTabs() del dashboard oculta el tab automáticamente.
  ingestFile('performance_results.json', 'performance_results.json');

  // Responsive config (producido por preflight-continuation.js / knowledge-excerpt.js).
  // Vive en .tmp/exec_context.json — solo se ingesta el bloque responsive para no
  // saturar ATF_DATA con cp_targets_resolved[] (puede ser grande).
  // Si no existe o responsive.enabled=false, autoHideTabs() oculta el tab.
  const execCtxRaw = readJSON(path.join(runDir, '.tmp', 'exec_context.json'));
  if (execCtxRaw?.responsive?.enabled) {
    const rCfg = execCtxRaw.responsive;
    ingest('responsive_config.json', JSON.stringify({
      enabled:        rCfg.enabled,
      execution_mode: rCfg.execution_mode,
      result_policy:  rCfg.result_policy,
      mcp_capability: rCfg.mcp_capability,
      viewports:      rCfg.viewports,
    }, null, 2));
  } else {
    console.log('   ·  responsive_config.json  (no disponible o deshabilitado)');
  }

  // ── Advertencias: archivos críticos faltantes ─────────────────────────────
  const criticalChecks = [
    ['session_context.json', 'session_context.json'],
    ['testability_score.md', 'diagnostics/base_pruebas.md'],
    ['execution_plan.json',  'strategy/execution_plan.json'],
  ];
  criticalChecks.forEach(([key, relPath]) => {
    if (!data[key]) console.warn(`   ⚠  CRÍTICO: ${relPath} no encontrado — sección del dashboard quedará vacía`);
  });

  // ── PASO 4: appweb.yaml sintético desde session_context ─────────────────────
  const appYaml = synthesizeAppYaml(ctx);
  if (appYaml) ingest('appweb.yaml', appYaml);

  // ── PASO 5: flow_map.json sintético desde execution_plan ─────────────────
  const ep = readJSON(path.join(runDir, 'strategy', 'execution_plan.json'));
  const basePruebasPath = path.join(runDir, 'diagnostics', 'base_pruebas.md');
  const flowMap = synthesizeFlowMap(ep, basePruebasPath);
  if (flowMap?.flows?.length) {
    const flowMapJson = JSON.stringify(flowMap, null, 2);
    ingest('flow_map.json', flowMapJson);
    // P85a: persistir como artefacto auditable en strategy/.
    // Antes solo vivía en memoria embebido en window.ATF_DATA. Ahora
    // consumidores externos (validators, /asdd:qa-web-exec, dashboard externo) pueden
    // leerlo sin reconstruir desde execution_plan.
    const strategyDir = path.join(runDir, 'strategy');
    if (fs.existsSync(strategyDir)) {
      try {
        const fmPath = path.join(strategyDir, 'flow_map.json');
        const tmpPath = fmPath + '.tmp';
        fs.writeFileSync(tmpPath, flowMapJson);
        fs.renameSync(tmpPath, fmPath);
      } catch (e) {
        process.stderr.write(`[warn] No se pudo persistir flow_map.json: ${e.message}\n`);
      }
    }
  }

  // ── PASO 6: cp_modulo_*.json → inyección directa como JSON ──────────────
  // (matrix_format=gnp: CPs en formato matriz tabular, no Gherkin .feature)
  const cpFiles = findFiles(
    path.join(runDir, 'design'),
    n => n.startsWith('cp_modulo_') && n.endsWith('.json')
  );
  for (const f of cpFiles) {
    const cp = readJSON(f);
    if (!cp) continue;
    const key = `cp_modulo_${cp.module_id || path.basename(f, '.json').replace('cp_modulo_','')}.json`;
    ingest(key, JSON.stringify(cp, null, 2));
  }

  // ── PASO 6b: exportar CPs a Excel tabular si hay cp_modulo_*.json ───────
  if (cpFiles.length > 0) {
    const xlsxOut = path.join(runDir, 'design', `${runId}_Matriz_CPs.xlsx`);
    const exportScript = path.join(__dirname, '..', 'tools', 'export-cp-to-xlsx.js');
    if (fs.existsSync(exportScript)) {
      try {
        require('child_process').execSync(
          `node "${exportScript}" "${path.join(runDir, 'design')}" "${xlsxOut}"`,
          { timeout: 60000, stdio: 'pipe' }
        );
        const relPath = `design/${runId}_Matriz_CPs.xlsx`;
        ingest('cp_export_xlsx_path', relPath);
        console.log(`   ✓  Excel tabular exportado: ${relPath}`);
      } catch (e) {
        console.warn(`   ⚠  export-cp-to-xlsx falló: ${e.message}`);
      }
    }
  }

  // PASO 10/10.5 (Removidos: ya no hay archivos BUG-*.md. La info del bug
  // vive dentro del result.json del CP (campo bug_candidate) y se renderiza en el
  // evidence.html del CP mediante evidence_cp.tmpl.html cuando status=FAIL.

  // ── PASO 10.6: generar/regenerar evidence.html por cada CP ejecutado ──────
  const cpEvidenceCount = generateCpEvidenceFiles(runDir);
  if (cpEvidenceCount > 0) console.log(`   ✓  ${cpEvidenceCount} CP evidence HTML files generados (o regenerados)`);

  // ── PASO 11: execution/*/module_result.json → {module_id}_result.json ─────
  //    Enriquece con array results[] desde CP-level result.json para que el
  //    dashboard pueda construir evidenceMap (links a evidence.html por CP).
  const moduleResultFiles = findFiles(
    path.join(runDir, 'execution'),
    n => n === 'module_result.json'
  );
  for (const f of moduleResultFiles) {
    const moduleId = path.basename(path.dirname(f)); // execution/{module_id}/
    const content = readText(f);
    if (content) {
      try {
        const parsed   = JSON.parse(content);
        const moduleDir = path.dirname(f);
        // Si module_result.json no tiene results[], construirlo desde CP result.json.
        // EXCLUIR carpetas `*_rerun*/` — son archivos históricos, no el estado actual.
        // DEDUPLICAR por cp_id (quedarse con el result.json más reciente por mtime).
        if (!parsed.results && !parsed.test_cases) {
          const RERUN_FOLDER_RE = /_rerun\d+$/i;
          const cpResultFiles = findFiles(moduleDir, (name, fullPath) => {
            if (name !== 'result.json') return false;
            const folder = path.basename(path.dirname(fullPath));
            if (folder === moduleId) return false;
            if (RERUN_FOLDER_RE.test(folder)) return false; // saltar archivados
            // Omitir viewport-level result.json (REGLA 28/31): son sub-resultados de un
            // CP responsive, no CPs independientes. Detectados por profundidad > 1 desde moduleDir.
            if (path.dirname(path.dirname(fullPath)) !== moduleDir) return false;
            return true;
          });
          // Deduplicar por cp_id — si hay colisión, ganar el de mtime más reciente
          const byCpId = new Map();
          for (const cpFile of cpResultFiles) {
            const cpData = readJSON(cpFile);
            if (!cpData || !cpData.cp_id) continue;
            let mtimeMs = 0;
            try { mtimeMs = fs.statSync(cpFile).mtimeMs; } catch { /* ignore */ }
            const existing = byCpId.get(cpData.cp_id);
            if (!existing || mtimeMs > existing.mtimeMs) {
              byCpId.set(cpData.cp_id, { cpData, cpFile, mtimeMs });
            }
          }
          // Lazy-load design para backfill de source_id si los result.json no lo traen
          let designById = null;
          const ensureDesignById = () => {
            if (designById !== null) return designById;
            designById = new Map();
            const designFile = path.join(runDir, 'design', `cp_modulo_${moduleId}.json`);
            const designData = readJSON(designFile);
            const list = (designData?.test_cases || designData?.cps || designData?.cases || []);
            for (const c of list) {
              if (c && c.cp_id) designById.set(c.cp_id, c);
            }
            return designById;
          };
          const results = [];
          for (const { cpData, cpFile } of byCpId.values()) {
            const cpFolder = path.basename(path.dirname(cpFile));
            const resolvedSourceId = cpData.source_id
              || ensureDesignById().get(cpData.cp_id)?.source_id
              || null;
            results.push({
              cp_id: cpData.cp_id,
              source_id: resolvedSourceId,
              status: cpData.status || 'UNKNOWN',
              duration_ms: cpData.duration_ms || null,
              failed_step: cpData.failed_step || null,
              error_message: cpData.error_message || null,
              // Para CPs responsive (steps[] vacío — REGLA 31), usar cpData.steps_total/steps_passed
              // que aggregate-responsive-cp.js calcula como suma de todos los viewports.
              steps_total:  cpData.steps_total  != null ? cpData.steps_total  : (Array.isArray(cpData.steps) ? cpData.steps.length : 0),
              steps_passed: cpData.steps_passed != null ? cpData.steps_passed : (Array.isArray(cpData.steps) ? cpData.steps.filter(s => s.status === 'PASS').length : 0),
              executed_at: cpData.executed_at || null,
              evidence_dir: `execution/${moduleId}/${cpFolder}/`,
              // Responsive: viewport_results[] propaga datos de la matriz al dashboard (renderResponsive).
              // Solo se incluye si el CP es responsive para no inflar {moduleId}_result.json innecesariamente.
              responsive: cpData.responsive === true ? true : undefined,
              viewport_results: cpData.responsive === true ? (cpData.viewport_results || null) : undefined
            });
          }
          if (results.length > 0) {
            parsed.results = results;
            ingest(`${moduleId}_result.json`, JSON.stringify(parsed));
            continue; // ya ingestado con results[]
          }
        } else {
          // results[] existe → enriquecer con `evidence_dir` y `source_id` si faltan.
          // Resuelve la convención de slug inspeccionando el FS:
          //   1) {moduleId}/{cpIdToFolder(cp_id)}/evidence.html  (slug canónico)
          //   2) {moduleId}/{cp_id}/evidence.html                 (cp_id raw — legacy)
          //   3) {moduleId}/{result_path_basename}/evidence.html  (si el executor populó result_path)
          // El primero que exista gana. Si ninguno existe, no se popula (dashboard no mostrará link).
          // source_id: se lee del diseño (cp_modulo_{M}.json) cuando el entry no lo trae —
          // el dashboard usa cpKey(cp_id, source_id) como llave compuesta y sin source_id
          // el CP aparece como "Pendiente" aunque tenga result.json.
          const resultsArr = parsed.results || parsed.test_cases || [];
          let enriched = false;
          // Cache del design del módulo (lazy) para backfill de source_id
          let designById = null;
          const ensureDesignById = () => {
            if (designById !== null) return designById;
            designById = new Map();
            const designFile = path.join(runDir, 'design', `cp_modulo_${moduleId}.json`);
            const designData = readJSON(designFile);
            const list = (designData?.test_cases || designData?.cps || designData?.cases || []);
            for (const c of list) {
              if (c && c.cp_id) designById.set(c.cp_id, c);
            }
            return designById;
          };
          // Patrón canónico esperado: "execution/{moduleId}/{slug}/" (relativo al runDir)
          const canonicalPattern = new RegExp(`^execution/${moduleId}/[^/]+/?$`);
          for (const r of resultsArr) {
            if (r.cp_id) {
              // Backfill source_id desde el diseño si falta
              if (!r.source_id) {
                const designedCp = ensureDesignById().get(r.cp_id);
                if (designedCp?.source_id) {
                  r.source_id = designedCp.source_id;
                  enriched = true;
                }
              }
              // Normalizar evidence_dir:
              //   - Si falta → resolver por FS
              //   - Si NO matchea el patrón canónico (viene absoluto o legacy) → re-resolver por FS
              // Esto cubre el caso donde el executor escribió un path absoluto.
              const needsResolve = !r.evidence_dir || !canonicalPattern.test(r.evidence_dir.replace(/\\/g, '/'));
              if (needsResolve) {
                const candidates = [];
                try {
                  // P103: probar primero slug con known modules (módulos multi-palabra)
                  const knownMods = loadKnownModulesForRun(runDir);
                  const slugFromKnown = cpIdToFolderFromKnownModules(r.cp_id, knownMods);
                  if (slugFromKnown) candidates.push(slugFromKnown);
                  // Fallback: slug heurístico (compat con runs históricos)
                  const canonicalSlug = cpIdToFolder(r.cp_id);
                  if (canonicalSlug && canonicalSlug !== slugFromKnown) candidates.push(canonicalSlug);
                } catch { /* cp-slug lib no disponible — seguir */ }
                candidates.push(r.cp_id);
                if (r.result_path) {
                  const fromResultPath = path.dirname(r.result_path).split(/[\\/]/).pop();
                  if (fromResultPath && fromResultPath !== '.') candidates.push(fromResultPath);
                }
                // Si evidence_dir venía poblado, extraer el basename como último candidato
                if (r.evidence_dir) {
                  const existingBasename = r.evidence_dir
                    .replace(/\\/g, '/')
                    .replace(/\/$/, '')
                    .split('/')
                    .pop();
                  if (existingBasename) candidates.push(existingBasename);
                }
                const seen = new Set();
                const unique = candidates.filter(c => !seen.has(c) && seen.add(c));
                for (const folder of unique) {
                  if (fs.existsSync(path.join(moduleDir, folder, 'evidence.html'))) {
                    r.evidence_dir = `execution/${moduleId}/${folder}/`;
                    enriched = true;
                    break;
                  }
                }
              }

              // executed_at: leer del result.json del CP si falta
              if (!r.executed_at && r.evidence_dir) {
                const cpResultPath = path.join(runDir, r.evidence_dir, 'result.json');
                const cpData = readJSON(cpResultPath);
                if (cpData?.executed_at) {
                  r.executed_at = cpData.executed_at;
                  enriched = true;
                }
              }
            }
          }
          if (enriched) {
            ingest(`${moduleId}_result.json`, JSON.stringify(parsed));
            continue;
          }
        }
      } catch (e) { /* fallback: ingestar contenido original */ }
      ingest(`${moduleId}_result.json`, content);
    }
  }

  // ── PASO 12: resumen mínimo de ejecución ─────────────────────────────────
  // FPY (First-Pass Yield) = passed / executed. NO es cobertura.
  // Coverage = executed / designed. Respuesta a la distinción evita
  // que "FPY 100%" se lea como "módulo completo" cuando solo se ejecutó 1 de N CPs.
  const execFilesForSummary = Object.keys(data).filter(k => k.endsWith('_result.json'));
  let fpyPct = null, coveragePct = null;
  let totalPassed = 0, totalExec = 0, totalFailed = 0, totalBlocked = 0, totalDesigned = 0;
  for (const k of execFilesForSummary) {
    try {
      const r = JSON.parse(data[k]);
      const p = r.summary?.passed ?? r.passed ?? 0;
      const f = r.summary?.failed ?? r.failed ?? 0;
      const b = r.summary?.blocked ?? r.blocked ?? 0;
      const e = r.summary?.executed ?? r.executed ?? (p + f);
      const d = r.summary?.total_cps ?? r.total_cps ?? e;
      totalPassed += p;
      totalFailed += f;
      totalBlocked += b;
      totalExec += e;
      totalDesigned += d;
    } catch { /* skip */ }
  }
  if (totalExec > 0) fpyPct = Math.round((totalPassed / totalExec) * 100);
  if (totalDesigned > 0) coveragePct = Math.round((totalExec / totalDesigned) * 100);
  const qaReport = {
    fpy: fpyPct,
    coverage_pct: coveragePct,
    total_executed: totalExec,
    total_designed: totalDesigned,
    total_passed: totalPassed,
    total_failed: totalFailed,
    total_blocked: totalBlocked,
  };
  ingest('qa_report.json', JSON.stringify(qaReport, null, 2));

  // ── PASO 12.2: enriquecer ATF_DATA con campos contextuales para UX ────────

  // evidence_mode
  const evidenceMode = ctx?.test_run?.evidence_mode || ctx?.evidence_mode || 'failures_only';
  data['__evidence_mode'] = evidenceMode;

  // Enriquecer defects con blocks_release + release_note
  if (data['defects_classified.json']) {
    try {
      const defs = JSON.parse(data['defects_classified.json']);
      const p2Total = defs.defects?.filter(d => d.severity === 'P2').length || 0;
      const MAX_P2  = 3;
      defs.defects = (defs.defects || []).map(d => {
        const sev = d.severity || 'P3';
        let blocks_release, release_note;
        if (sev === 'P1') {
          blocks_release = true;
          release_note = '🔴 BLOQUEA RELEASE — un P1 activo impide el veredicto GO. SLA de resolución: 4h.';
        } else if (sev === 'P2') {
          blocks_release = p2Total > MAX_P2;
          release_note = `⚠️ DEBE RESOLVERSE — se tienen ${p2Total} de ${MAX_P2} P2 permitidos. SLA: 24h.`;
        } else if (sev === 'P3') {
          blocks_release = false;
          release_note = 'ℹ️ No bloquea release. Incluir en próximo sprint. SLA: 72h.';
        } else {
          blocks_release = false;
          release_note = '✅ Cosmético — no impacta funcionalidad. SLA: 7d.';
        }
        return { ...d, blocks_release, release_note };
      });
      data['defects_classified.json'] = JSON.stringify(defs, null, 2);
    } catch { /* skip */ }
  }

  // Agregar performance.thresholds
  if (data['performance_results.json']) {
    try {
      const perf = JSON.parse(data['performance_results.json']);
      perf.thresholds = {
        lcp:         { good: 2500, poor: 4000, unit: 'ms', label: 'LCP — Largest Contentful Paint' },
        cls:         { good: 0.1,  poor: 0.25, unit: '',   label: 'CLS — Cumulative Layout Shift' },
        fcp:         { good: 1800, poor: 3000, unit: 'ms', label: 'FCP — First Contentful Paint' },
        inp:         { good: 200,  poor: 500,  unit: 'ms', label: 'INP — Interaction to Next Paint' },
        tbt:         { good: 200,  poor: 600,  unit: 'ms', label: 'TBT — Total Blocking Time' },
        speed_index: { good: 3400, poor: 5800, unit: 'ms', label: 'SI — Speed Index' },
      };
      data['performance_results.json'] = JSON.stringify(perf, null, 2);
    } catch { /* skip */ }
  }

  // Agregar a11y.breakdown
  if (data['a11y_results.json']) {
    try {
      const a11y = JSON.parse(data['a11y_results.json']);
      const crit   = a11y.critical_count || 0;
      const ser    = a11y.serious_count  || 0;
      const minor  = Math.max(0, (a11y.total_violations || 0) - crit - ser);
      const critPts  = crit  * 5;
      const serPts   = ser   * 3;
      const minorPts = minor * 1;
      a11y.breakdown = {
        critical_count: crit,    serious_count: ser,    minor_count: minor,
        critical_pts:   critPts, serious_pts:   serPts, minor_pts:  minorPts,
        total_penalty:  critPts + serPts + minorPts,
        min_score:      90,
      };
      data['a11y_results.json'] = JSON.stringify(a11y, null, 2);
    } catch { /* skip */ }
  }

  // ── PASO 12.5: inferir estado del pipeline ────────────────────────────────
  const pipelineStatus = inferPipelineStatus(runDir);
  data['__pipeline_status'] = JSON.stringify(pipelineStatus);
  console.log(`   ℹ  pipeline status: ${pipelineStatus.status}${pipelineStatus.current_phase ? ' → ' + pipelineStatus.current_phase : ''}`);

  // ── PASO 12.7: actualizar runs_index.json (persistente, fuera del report) ──
  // Mantenido para reprocess.js y vista standalone runs_index.html.
  // Tabs Historia/Tendencia eliminados del report individual — el JSON ya NO se
  // inyecta en ATF_DATA ni se computa run-delta.
  const frs = extractFRS(data['testability_score.md']);
  updateRunsIndex(runDir, runId, data, { qaReport, frs, ctx });

  // ── PASO 13: inyectar en template y escribir report.html ─────────────────
  let html = fs.readFileSync(DASHBOARD_TEMPLATE, 'utf-8');

  // Escapar </script> dentro del JSON para evitar que el parser HTML cierre el tag prematuramente
  const safeJson = JSON.stringify(data, null, 2).replace(/<\/script>/gi, '<\\/script>');
  const injection = `\n<script>\nwindow.ATF_DATA = ${safeJson};\n</script>\n`;
  html = html.replace('</head>', () => injection + '</head>');

  // Actualizar título
  html = html.replace(
    /<title>ATF[^<]*<\/title>/,
    `<title>ATF · ${runId}</title>`
  );

  const outPath = path.join(runDir, 'report.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);

  const partial = '';

  console.log(`\n   Artefactos ingestados: ${found}`);
  console.log(`   FRS            : ${frs !== null ? frs + '%' : '—'}`);
  console.log(`   FPY            : ${qaReport.fpy ?? '—'}% (${qaReport.total_passed}/${qaReport.total_executed} ejecutados)${partial}`);
  console.log(`   Coverage       : ${qaReport.coverage_pct ?? '—'}% (${qaReport.total_executed}/${qaReport.total_designed} diseñados)`);
  console.log(`\n✅  report.html generado`);
  console.log(`   ${outPath}`);
  console.log(`   Tamaño: ${sizeKB} KB`);
  console.log(`\n   Abre el archivo en cualquier navegador para ver el dashboard.\n`);

}

// ─── RUNS INDEX UPDATER v2 (schema enriquecido) ───────────────────────────────
/**
 * Agrega o actualiza la entrada de este run en runs_index.json.
 * Extrae datos ricos desde data{} (artefactos ya ingestados).
 * Retorna { entry, index } para inyección en ATF_DATA.
 */
function updateRunsIndex(runDir, runId, data, { qaReport, frs, ctx }) {
  const indexPath = path.join(OUTPUT_BASE, 'runs_index.json');

  let index = { _schema: 'atf-runs-index-v2', app: {}, runs: [] };
  if (fs.existsSync(indexPath)) {
    try { index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch { /* start fresh */ }
  }
  if (!Array.isArray(index.runs)) index.runs = [];

  // ── Helper: parsear JSON desde data{} sin explotar ────────────────────────
  const safeJ = k => { try { return JSON.parse(data[k] || 'null'); } catch { return null; } };

  // t0: mtime del centinela pipeline_start.json (escrito por el orquestador al inicio real
  // del run via Write tool — su mtime OS es el timestamp más fiable disponible).
  // Fallback en orden: session_context.json → base_pruebas.md → null
  const _t0Candidates = [
    path.join(runDir, 'pipeline_start.json'),
    path.join(runDir, 'session_context.json'),
    path.join(runDir, 'diagnostics', 'base_pruebas.md'),
  ];
  const _t0File = _t0Candidates.find(f => fs.existsSync(f));
  const _t0ms   = _t0File ? fs.statSync(_t0File).mtimeMs : null;
  const started_at  = _t0ms ? new Date(_t0ms).toISOString() : null;
  const completed_at = new Date().toISOString();

  // ── CPs desde module_result files ────────────────────────────────────────
  let totalCps = 0, passed = 0, failed = 0, blocked = 0;
  for (const k of Object.keys(data).filter(k => k.endsWith('_result.json'))) {
    const r = safeJ(k); if (!r) continue;
    const s = r.summary || {};
    const exec = s.executed ?? ((s.passed ?? s.pass ?? 0) + (s.failed ?? s.fail ?? 0) + (s.blocked ?? 0));
    totalCps += exec; passed += s.passed ?? s.pass ?? 0; failed += s.failed ?? s.fail ?? 0; blocked += s.blocked ?? 0;
  }
  // Fallback: contar desde cp_modulo_*.json de diseño (ciclos sin ejecución)
  if (totalCps === 0) {
    const cpFiles = findFiles(path.join(runDir, 'design'), n => n.startsWith('cp_modulo_') && n.endsWith('.json'));
    for (const f of cpFiles) {
      const cp = readJSON(f);
      if (!cp) continue;
      totalCps += cp.total_cases || cp.test_cases?.length || 0;
    }
  }

  // ── Duración: mtime-based ─────────────────────────────────────────────────────────
  // t0 = mtime del archivo centinela más temprano (ya calculado arriba),
  // t1 = mtime del artefacto más reciente en todo el run_folder.
  const _t1ms = (() => {
    const allFiles = findFiles(runDir, () => true);
    if (allFiles.length === 0) return Date.now();
    return Math.max(...allFiles.map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }));
  })();
  const effectiveDuration = (_t0ms && _t1ms > _t0ms) ? Math.max(0, _t1ms - _t0ms) : 0;

  // ── Bugs por severidad ────────────────────────────────────────────────────
  const defData = safeJ('defects_classified.json');
  const defList  = defData?.defects || [];
  const p1_bugs  = defList.filter(d => d.severity === 'P1').length;
  const p2_bugs  = defList.filter(d => d.severity === 'P2').length;
  const p3_bugs  = defList.filter(d => d.severity === 'P3').length;
  const p4_bugs  = defList.filter(d => d.severity === 'P4').length;

  // ── Metadatos de app ──────────────────────────────────────────────────────
  const appName   = ctx?.app?.name || ctx?.app_name || runId.split('-v')[0] || '';
  const appVersion = ctx?.app?.version || ctx?.app_version || '';
  const passRate   = totalCps > 0 ? Math.round(passed / totalCps * 100) : null;

  const entry = {
    run_id:           runId,
    app_name:         appName,
    app_version:      appVersion,
    started_at,
    completed_at,
    duration_ms:      effectiveDuration,
    frs_pct:          frs,
    total_cps:        totalCps,
    passed,
    failed,
    blocked,
    pass_rate_pct:    passRate,
    fpy_pct:          qaReport.fpy,
    p1_bugs,
    p2_bugs,
    p3_bugs,
    p4_bugs,
    report_path:              `${runId}/report.html`,
    report_regenerated_at:    new Date().toISOString(),
    report_template_version:  REPORT_TEMPLATE_VERSION,
  };

  // ── Actualizar o insertar ─────────────────────────────────────────────────
  const idx = index.runs.findIndex(r => r.run_id === runId);
  if (idx >= 0) {
    index.runs[idx] = entry;
  } else {
    index.runs.unshift(entry);
  }

  if (appName) index.app = { ...index.app, name: appName };

  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    console.log(`   ✓  runs_index.json actualizado (${index.runs.length} run${index.runs.length !== 1 ? 's' : ''} registrados)`);
  } catch (e) {
    console.warn(`   ⚠  No se pudo actualizar runs_index.json: ${e.message}`);
  }

  return { entry, index };
}

// ─── DELTA CALCULATOR ─────────────────────────────────────────────────────────
/**
 * Calcula el delta del run actual vs el anterior del mismo tipo.
 * Retorna null si no hay run anterior.
 */
// ─── ALL-RUNS INDEX GENERATOR ────────────────────────────────────────────────
/**
 * --all-runs: genera output/index.html con vista multi-run del proyecto.
 * Lee runs_index.json y produce un HTML autocontenido con tabla + enlaces.
 */
function generateAllRunsIndex() {
  const indexPath = path.join(OUTPUT_BASE, 'runs_index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('❌  runs_index.json no encontrado. Ejecuta al menos un run primero.');
    process.exit(1);
  }
  let idx;
  try { idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8')); } catch (e) {
    console.error('❌  Error leyendo runs_index.json:', e.message);
    process.exit(1);
  }
  const runs = idx.runs || [];
  const appName = idx.app?.name || 'ATF';
  const durH = ms => { if (!ms) return '—'; const m = Math.round(ms/60000); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`; };
  const dateStr = iso => { try { return new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}); } catch { return iso||'—'; } };

  const rows = runs.map(r => `
    <tr>
      <td style="font-family:monospace;font-size:11px">${r.run_id}</td>
      <td>${dateStr(r.completed_at||r.started_at)}</td>
      <td>${r.pass_rate_pct != null ? r.pass_rate_pct+'%' : (r.pass_rate||'—')}</td>
      <td>${r.fpy_pct != null ? r.fpy_pct+'%' : '—'}</td>
      <td>${r.total_cps??'—'}</td>
      <td style="${(r.p1_bugs||0)+(r.p2_bugs||0)>0?'color:#D42020;font-weight:700':'color:#1A8A3E'}">${(r.p1_bugs||0)+(r.p2_bugs||0)}</td>
      <td>${durH(r.duration_ms)}</td>
      <td>${r.report_path ? `<a href="${r.report_path}" style="color:#D46800">↗ reporte</a>` : '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATF · ${appName} · Historial de Runs</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#F7F5F2;color:#1A1A18}
header{background:#1A1A18;color:#fff;padding:20px 32px;display:flex;align-items:center;gap:16px;border-bottom:3px solid #D46800}
h1{font-size:18px;font-weight:800;font-family:sans-serif;letter-spacing:-.02em}
.sub{font-size:11px;color:rgba(255,255,255,.5);margin-top:2px}
main{max-width:1100px;margin:32px auto;padding:0 20px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07)}
th{text-align:left;padding:9px 12px;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#D46800;font-weight:800;background:#F0EDE8;border-bottom:1px solid #DDD8D0}
td{padding:10px 12px;border-bottom:1px solid #DDD8D0;color:#4A4640;vertical-align:middle}
tr:hover td{background:#F7F5F2}
a{color:#D46800;text-decoration:none}
a:hover{text-decoration:underline}
footer{text-align:center;font-size:10px;color:#8A8478;margin:32px 0 16px}
</style>
</head>
<body>
<header>
  <div>
    <h1>ATF · ${appName}</h1>
    <div class="sub">Historial de ejecuciones · ${runs.length} run${runs.length!==1?'s':''} registrados</div>
  </div>
</header>
<main>
<table>
  <thead><tr>
    <th>Run ID</th><th>Fecha</th><th>Pass Rate</th><th>FPY</th>
    <th>CPs</th><th>Bugs P1+P2</th><th>Duración</th><th>Reporte</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</main>
<footer>Generado por ATF · ${new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'})}</footer>
</body></html>`;

  const outPath = path.join(OUTPUT_BASE, 'index.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\n✅  index.html generado (${runs.length} runs · ${sizeKB} KB)`);
  console.log(`   ${outPath}\n`);
}


// ─── EVIDENCE-ONLY MODE ──────────────────────────────────────────────────────
/**
 * Modo quirúrgico para el fast-path (`agent_exec.prompt.md`). Regenera
 * solo evidence.html por CP — sin re-ingest de artefactos, sin regenerar
 * report.html global, sin actualizar runs_index.
 *
 * Uso:
 *   node generate-report.js <run_id> --evidence-only --cp-ids='["CP-M1-001"]'
 *
 * Sin --cp-ids → regenera evidence.html de TODOS los CPs del run.
 * Con --cp-ids → filtra por los CP-IDs pasados (convertidos a slug internamente).
 */
function runEvidenceOnly(runId, cpIds) {
  const runDir = path.join(OUTPUT_BASE, runId);
  if (!fs.existsSync(runDir)) {
    console.error(`❌  Run no encontrado: ${runDir}`);
    process.exit(1);
  }

  // #4 — preferir slug canónico (known-modules-aware). Heurístico solo
  // como fallback cuando la carpeta canónica no existe en disco (compat con runs
  // legacy). Esto evita regenerar evidence.html en carpetas duplicadas (canónica
  // + legacy coexistentes).
  const knownMods = loadKnownModulesForRun(runDir);
  const executionDir = path.join(runDir, 'execution');
  function pickSlug(id) {
    const fromKnown = cpIdToFolderFromKnownModules(id, knownMods);
    const heuristic = cpIdToFolder(id);
    if (fromKnown === heuristic) return [fromKnown];
    // Cuando difieren: preferir el canónico SI existe en disco; si no, heurístico
    // (run legacy puro). Detección por existencia de cualquier carpeta {module}/{slug}/
    // bajo execution/ con result.json — una pasada barata.
    const moduleId = (require('../tools/lib/cp-slug').extractModuleIdFromKnownModules(id, knownMods)) || (require('../tools/lib/cp-slug').extractModuleId(id));
    if (moduleId) {
      const canonicalPath = path.join(executionDir, moduleId, fromKnown, 'result.json');
      if (fs.existsSync(canonicalPath)) return [fromKnown];
      const legacyPath = path.join(executionDir, moduleId, heuristic, 'result.json');
      if (fs.existsSync(legacyPath)) return [heuristic];
    }
    // Ninguno existe en disco: fallback al canónico (el script reportará "vacío")
    return [fromKnown];
  }
  const filterSlugs = Array.isArray(cpIds) && cpIds.length > 0
    ? cpIds.flatMap(pickSlug)
    : null;

  const label = filterSlugs ? `${filterSlugs.length} CP(s) filtrados` : 'todos los CPs';
  console.log(`\n⬡  ATF evidence-only — ${runId}`);
  console.log(`   scope  : ${label}`);
  if (filterSlugs) console.log(`   slugs  : ${filterSlugs.join(', ')}\n`);

  const t0 = Date.now();
  const count = generateCpEvidenceFiles(runDir, filterSlugs);
  const elapsed = Date.now() - t0;

  console.log(`\n✅  evidence.html regenerado (${count} archivos · ${elapsed} ms)`);
  if (filterSlugs && count === 0) {
    console.log(`   ⚠  0 evidence.html escritos — verifica que los slugs coincidan con carpetas reales.`);
  }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isAllRuns     = args.includes('--all-runs');
const isEvidenceOnly = args.includes('--evidence-only');

// Parse --cp-ids='["CP-M1-001","CP-M1-002"]' (acepta --cp-ids=VALUE o --cp-ids VALUE)
function parseCpIdsArg() {
  const eq = args.find(a => a.startsWith('--cp-ids='));
  if (eq) return eq.slice('--cp-ids='.length);
  const idx = args.indexOf('--cp-ids');
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

const runIdArg = args.find(a => !a.startsWith('--') && !isJsonLike(a));
function isJsonLike(s) { return typeof s === 'string' && (s.startsWith('[') || s.startsWith('{')); }

if (isEvidenceOnly) {
  if (!runIdArg) {
    console.error('❌  --evidence-only requiere un run_id. Uso: node generate-report.js <run_id> --evidence-only [--cp-ids=\'["CP-M1-001"]\']');
    process.exit(1);
  }
  const cpIdsRaw = parseCpIdsArg();
  let cpIds = null;
  if (cpIdsRaw) {
    try { cpIds = JSON.parse(cpIdsRaw); }
    catch (e) {
      console.error(`❌  --cp-ids JSON inválido: ${e.message}`);
      process.exit(1);
    }
  }
  runEvidenceOnly(runIdArg, cpIds);
} else if (isAllRuns) {
  generateAllRunsIndex();
} else if (!runIdArg) {
  if (!fs.existsSync(OUTPUT_BASE)) {
    console.error(`❌  No existe la carpeta de outputs: ${OUTPUT_BASE}`);
    process.exit(1);
  }
  const runs = fs.readdirSync(OUTPUT_BASE)
    .filter(d => {
      try { return fs.statSync(path.join(OUTPUT_BASE, d)).isDirectory(); } catch { return false; }
    })
    .sort()
    .reverse();

  if (!runs.length) {
    console.error('❌  No se encontró ningún run en', OUTPUT_BASE);
    console.error('    Uso: node .claude/dashboard/generate-report.js <run_id>');
    process.exit(1);
  }
  console.log(`ℹ️  run_id no especificado. Usando el más reciente: ${runs[0]}`);
  main(runs[0]);
} else {
  main(runIdArg);
}
