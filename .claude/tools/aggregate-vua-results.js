#!/usr/bin/env node
/**
 * aggregate-vua-results.js — agrega los `findings.json` y `page_blocked.json`
 * generados por el skill visual-ux-a11y-validator (uno por pantalla) en un
 * único `docs/testing/atf-web/{run_id}/visual_ux_a11y_results.json` consumido por el
 * dashboard.
 *
 * Lectura:
 *   output/{run_id}/visual-ux-a11y/{flow_id}/{NN}_{slug}/findings.json
 *   output/{run_id}/visual-ux-a11y/{flow_id}/{NN}_{slug}/page_blocked.json
 *
 * Escritura:
 *   output/{run_id}/visual_ux_a11y_results.json
 *
 * Detecta duplicados (mismo selector+rule_id en múltiples pantallas) y los
 * consolida con `seen_in_pages: [{ flow_id, page_slug, evidence_file }]`.
 *
 * Uso:
 *   node aggregate-vua-results.js --run-id=<id> [--output=<path>]
 *
 * stdout: JSON con stats + path del archivo escrito.
 * exit:   0 OK · 1 fatal (run inexistente, no hay output/visual-ux-a11y/)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { runId: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--run-id='))      out.runId = a.split('=')[1];
    else if (a === '--run-id')          out.runId = argv[++i];
    else if (a.startsWith('--output=')) out.output = a.split('=')[1];
    else if (a === '--output')          out.output = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write('aggregate-vua-results.js --run-id=<id> [--output=<path>]\n');
      process.exit(0);
    }
  }
  if (!out.runId) {
    process.stderr.write('[aggregate-vua] ERROR: --run-id requerido\n');
    process.exit(1);
  }
  return out;
}

function listSubdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

/**
 * Normaliza selectores con identificadores volátiles (Vue/React/Angular)
 * para que un mismo elemento renderizado en builds distintos colapse al
 * mismo dedup key. Patrones eliminados:
 *
 *   [data-v-957b4417=""]      → []
 *   [data-test-id="cp-12"]    → [data-test-id="*"]   (id numérico volátil)
 *   :nth-child(N)             → :nth-child(*)
 *   #generated-id-N           → #*
 *   :nth-of-type(N)           → :nth-of-type(*)
 *
 * El espacio entre combinators se colapsa para evitar diferencias triviales.
 */
function normalizeSelector(sel) {
  if (!sel || typeof sel !== 'string') return sel;
  let out = sel;
  // Vue scoped attrs: [data-v-XXX=""] | [data-v-XXX]
  out = out.replace(/\[data-v-[0-9a-fA-F]+(?:="[^"]*")?\]/g, '');
  // Numeric ids dentro de atributos data-* (volátil entre runs)
  out = out.replace(/(\[data-[a-z-]+(?:-id|id)?=)"[^"]*\d+[^"]*"\]/g, '$1"*"]');
  // :nth-child(N) y :nth-of-type(N) → :nth-child(*) (estructural diff entre runs por orden)
  out = out.replace(/:nth-child\(\d+\)/g, ':nth-child(*)');
  out = out.replace(/:nth-of-type\(\d+\)/g, ':nth-of-type(*)');
  // IDs auto-generados con sufijo numérico
  out = out.replace(/#[a-zA-Z]+-?\d{4,}/g, '#*');
  // Whitespace cleanup
  out = out.replace(/\s+/g, ' ').trim();
  // Doble combinator residual tras strip
  out = out.replace(/>\s*>/g, '>').trim();
  return out || sel;
}

function dedupKey(f) {
  // Detecta duplicados cross-page con selector NORMALIZADO:
  //  - Con selector: agrupador + rule_id + normalizeSelector.
  //    Esto garantiza que findings con `[data-v-957b4417=""]` y
  //    `[data-v-9af23bc8=""]` colapsen al mismo key (Vue scoped attrs).
  //  - Sin selector: agrupador + rule_id + first_50_chars(message).
  const ag = f.agrupador || '?';
  const rule = f.rule_id || '?';
  if (f.selector) {
    const norm = normalizeSelector(f.selector);
    return [ag, rule, norm].join('||');
  }
  const msg = (f.message || '').slice(0, 50).trim().toLowerCase();
  if (!msg) return null;
  return [ag, rule, 'msg:' + msg].join('||');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
  if (!fs.existsSync(runFolder)) {
    process.stderr.write(`[aggregate-vua] ERROR: run folder no existe: ${runFolder}\n`);
    process.exit(1);
  }

  const vuaRoot = path.join(runFolder, 'visual-ux-a11y');
  if (!fs.existsSync(vuaRoot)) {
    process.stderr.write(`[aggregate-vua] ERROR: no hay output/{run}/visual-ux-a11y/. Ejecutar /asdd:qa-web-visual-ux-a11y primero.\n`);
    process.exit(1);
  }

  const flowsScanned = new Set();
  const pagesAnalyzed = []; // {flow_refs[], page_slug, scan_status, output_dir}
  const findings = []; // todos los findings con metadata
  let pagesAborted = 0;
  let pagesWithFindings = 0;

  // Recorrer todas las carpetas que contengan findings.json o page_blocked.json.
  // Soporta ambos layouts:
  //   Nuevo (post-F1): visual-ux-a11y/_pages/{NN}_{slug}/findings.json (flow_refs[] dentro)
  //   Legacy:          visual-ux-a11y/{flow_id}/{NN}_{slug}/findings.json
  // El flow ownership viene de:
  //   Layout nuevo → findings.json.flow_refs[]
  //   Layout legacy → directorio padre del findings.json
  const topDirs = listSubdirs(vuaRoot);
  for (const topName of topDirs) {
    const topDir = path.join(vuaRoot, topName);
    const isPagesContainer = topName === '_pages';
    const pageDirs = listSubdirs(topDir);

    for (const pageDirName of pageDirs) {
      const pageDir = path.join(topDir, pageDirName);
      const m = pageDirName.match(/^\d+_(.+)$/);
      const pageSlug = m ? m[1] : pageDirName;

      const blockedPath = path.join(pageDir, 'page_blocked.json');
      const findingsPath = path.join(pageDir, 'findings.json');

      // Determinar flow_refs según layout
      let flowRefs = [];
      const blockedData = fs.existsSync(blockedPath) ? safeReadJson(blockedPath) : null;
      const findingsData = fs.existsSync(findingsPath) ? safeReadJson(findingsPath) : null;
      const sourceData = findingsData || blockedData;
      if (isPagesContainer) {
        // Layout nuevo: flow_refs viene del JSON
        flowRefs = (sourceData && Array.isArray(sourceData.flow_refs)) ? sourceData.flow_refs.slice() : [];
      } else {
        // Layout legacy: el topName ES el flow_id
        flowRefs = [topName];
      }
      flowRefs.forEach(f => flowsScanned.add(f));

      if (blockedData) {
        pagesAborted++;
        pagesAnalyzed.push({
          flow_refs: flowRefs,
          page_slug: pageSlug,
          scan_status: 'aborted',
          reason: blockedData.reason || 'unknown',
          error: blockedData.error || null,
          output_dir: pageDir
        });
        continue;
      }

      if (!findingsData) {
        // Pantalla sin findings.json ni page_blocked.json — pendiente
        pagesAnalyzed.push({
          flow_refs: flowRefs,
          page_slug: pageSlug,
          scan_status: 'pending',
          output_dir: pageDir
        });
        continue;
      }

      const localFindings = Array.isArray(findingsData.findings) ? findingsData.findings : [];
      if (localFindings.length > 0) pagesWithFindings++;
      pagesAnalyzed.push({
        flow_refs: flowRefs,
        page_slug: pageSlug,
        scan_status: findingsData.scan_status || 'completed',
        page_url: findingsData.page_url,
        findings_count: localFindings.length,
        output_dir: pageDir
      });

      for (const f of localFindings) {
        findings.push({
          ...f,
          _flow_refs: flowRefs.length ? flowRefs : ['unknown'],
          _page_slug: pageSlug,
          _page_url: findingsData.page_url,
          _evidence_dir: pageDir
        });
      }
    }
  }

  // Dedup cross-page por dedupKey. seen_in_pages[].flow_refs[] expande todos
  // los flows que comparten esa pantalla (resultado de F1 — dedup pantallas).
  function buildPageEntry(f) {
    return {
      flow_refs: f._flow_refs || ['unknown'],
      page_slug: f._page_slug,
      page_url: f._page_url,
      evidence_file: f.evidence_file || null
    };
  }
  const dedupMap = new Map();
  const finalFindings = [];
  for (const f of findings) {
    const key = dedupKey(f);
    if (!key) {
      finalFindings.push({
        id: f.id,
        agrupador: f.agrupador,
        tipo: f.tipo,
        rule_id: f.rule_id,
        wcag: f.wcag || null,
        nielsen: f.nielsen || null,
        severity: f.severity,
        selector: f.selector || null,
        message: f.message,
        recommendation: f.recommendation || null,
        evidence_status: f.evidence_status || 'general_observation',
        confidence: f.confidence || null,
        seen_in_pages: [buildPageEntry(f)]
      });
      continue;
    }
    if (dedupMap.has(key)) {
      dedupMap.get(key).seen_in_pages.push(buildPageEntry(f));
    } else {
      const consolidated = {
        id: f.id,
        agrupador: f.agrupador,
        tipo: f.tipo,
        rule_id: f.rule_id,
        wcag: f.wcag || null,
        nielsen: f.nielsen || null,
        severity: f.severity,
        selector: f.selector,
        message: f.message,
        recommendation: f.recommendation || null,
        evidence_status: f.evidence_status || 'captured',
        confidence: f.confidence || null,
        seen_in_pages: [buildPageEntry(f)]
      };
      dedupMap.set(key, consolidated);
      finalFindings.push(consolidated);
    }
  }

  // Calcular summary
  const byAgrupador = { visual: 0, usabilidad: 0, accesibilidad: 0 };
  const byTipo = { hallazgo: 0, recomendacion: 0 };
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 };
  const wcagCounts = {};
  const nielsenCounts = {};

  for (const f of finalFindings) {
    if (f.agrupador && byAgrupador[f.agrupador] !== undefined) byAgrupador[f.agrupador]++;
    if (f.tipo && byTipo[f.tipo] !== undefined) byTipo[f.tipo]++;
    if (f.severity && bySeverity[f.severity] !== undefined) bySeverity[f.severity]++;
    if (f.wcag) wcagCounts[f.wcag] = (wcagCounts[f.wcag] || 0) + 1;
    if (typeof f.nielsen === 'number') nielsenCounts[f.nielsen] = (nielsenCounts[f.nielsen] || 0) + 1;
  }
  const topWcag = Object.entries(wcagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([wcag, count]) => ({ wcag, count }));
  const nielsenTitles = {
    1: 'Visibilidad del estado del sistema',
    2: 'Correspondencia con el mundo real',
    3: 'Control y libertad del usuario',
    4: 'Consistencia y estándares',
    5: 'Prevención de errores',
    6: 'Reconocimiento sobre recuerdo',
    7: 'Flexibilidad y eficiencia',
    8: 'Diseño minimalista',
    9: 'Ayuda con errores',
    10: 'Ayuda y documentación'
  };
  const topNielsen = Object.entries(nielsenCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, count]) => ({
    n: parseInt(n, 10),
    title: nielsenTitles[parseInt(n, 10)] || 'Heurística desconocida',
    count
  }));

  // Phase status
  const completedPages = pagesAnalyzed.filter(p => p.scan_status === 'completed').length;
  const totalPages = pagesAnalyzed.length;
  let phaseStatus;
  if (totalPages === 0) phaseStatus = 'aborted';
  else if (pagesAborted === totalPages) phaseStatus = 'aborted';
  else if (pagesAborted === 0 && completedPages === totalPages) phaseStatus = 'completed';
  else phaseStatus = 'partial';

  const phaseBlocked = phaseStatus !== 'completed'
    ? {
        pages_aborted: pagesAborted,
        pages_pending: pagesAnalyzed.filter(p => p.scan_status === 'pending').length,
        details: pagesAnalyzed
          .filter(p => p.scan_status !== 'completed')
          .map(p => ({ flow_id: p.flow_id, page_slug: p.page_slug, status: p.scan_status, reason: p.reason || null }))
      }
    : null;

  const flowsScannedArr = Array.from(flowsScanned).sort();
  const output = {
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    scope: {
      flows_scanned: flowsScannedArr,
      pages_total: totalPages,
      pages_with_findings: pagesWithFindings,
      pages_aborted: pagesAborted
    },
    summary: {
      total_findings: finalFindings.length,
      by_agrupador: byAgrupador,
      by_tipo: byTipo,
      by_severity: bySeverity,
      top_wcag: topWcag,
      top_nielsen: topNielsen
    },
    findings: finalFindings,
    phase_status: phaseStatus,
    phase_blocked: phaseBlocked
  };

  const outPath = args.output || path.join(runFolder, 'visual_ux_a11y_results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  process.stdout.write(JSON.stringify({
    ok: true,
    output_path: outPath,
    flows_scanned: flowsScannedArr.length,
    pages_total: totalPages,
    pages_with_findings: pagesWithFindings,
    pages_aborted: pagesAborted,
    total_findings: finalFindings.length,
    phase_status: phaseStatus
  }, null, 2) + '\n');
  process.exit(0);
}

main();
