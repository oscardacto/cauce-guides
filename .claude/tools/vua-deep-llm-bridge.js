#!/usr/bin/env node
/**
 * vua-deep-llm-bridge.js
 *
 * Puente entre el comando /sofka-asdd:qa-web-visual-ux-a11y --deep-llm (que ejecuta el turno
 * LLM en contexto primario) y los artefactos en disco. Tiene dos modos:
 *
 *   --mode=prepare → lee todas las page_scan_phase_a.json del run y emite
 *     a stdout un JSON consolidado con textos visibles + CTAs + URL por
 *     pantalla. Pensado para ser pegado en el prompt del LLM.
 *
 *   --mode=merge   → recibe vía --findings-file un JSON con findings
 *     emitidos por el LLM y los integra al visual_ux_a11y_results.json
 *     existente, deduplicando contra los findings determinísticos previos.
 *
 * Filosofía KISS: el LLM no escribe disco directamente — emite JSON, que
 * este script valida (shape estricto) y persiste. El bridge garantiza que
 * findings LLM cumplan el mismo contrato que findings determinísticos.
 *
 * Uso:
 *   node vua-deep-llm-bridge.js --mode=prepare --run-id=<id>
 *   node vua-deep-llm-bridge.js --mode=merge   --run-id=<id> --findings-file=<path>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { mode: null, runId: null, findingsFile: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--mode='))           out.mode = a.split('=')[1];
    else if (a === '--mode')               out.mode = argv[++i];
    else if (a.startsWith('--run-id='))    out.runId = a.split('=')[1];
    else if (a === '--run-id')             out.runId = argv[++i];
    else if (a.startsWith('--findings-file=')) out.findingsFile = a.split('=')[1];
    else if (a === '--findings-file')      out.findingsFile = argv[++i];
    else if (a.startsWith('--output='))    out.output = a.split('=')[1];
    else if (a === '--output')             out.output = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write('vua-deep-llm-bridge.js --mode=prepare|merge --run-id=<id> [--findings-file=<path>]\n');
      process.exit(0);
    }
  }
  if (!out.mode || !out.runId) {
    process.stderr.write('ERROR: --mode y --run-id requeridos.\n');
    process.exit(1);
  }
  if (out.mode === 'merge' && !out.findingsFile) {
    process.stderr.write('ERROR: --mode=merge requiere --findings-file=<path>.\n');
    process.exit(1);
  }
  return out;
}

function listPagesDir(runFolder) {
  const dir = path.join(runFolder, 'visual-ux-a11y', '_pages');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name));
}

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ────────────────────────────────────────────────────────────────────────────
// Modo PREPARE
// ────────────────────────────────────────────────────────────────────────────

function modePrepare(args) {
  const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
  if (!fs.existsSync(runFolder)) {
    process.stderr.write(`ERROR: run no existe: ${runFolder}\n`);
    process.exit(1);
  }

  // Cargar app_language desde vua_context.json si existe
  const ctxPath = path.join(runFolder, '.tmp', 'vua_context.json');
  const ctx = safeReadJson(ctxPath) || {};
  const appLanguage = ctx.app_language ||
    (ctx.a11y_config && ctx.a11y_config.app_language) ||
    'es-CO';
  const glossary = (ctx.a11y_config && ctx.a11y_config.ui_terminology_glossary) ||
    ctx.ui_terminology_glossary || [];

  const pageDirs = listPagesDir(runFolder);
  const pages = [];
  for (const pageDir of pageDirs) {
    const phaseAPath = path.join(pageDir, 'page_scan_phase_a.json');
    const phaseA = safeReadJson(phaseAPath);
    if (!phaseA) continue;
    pages.push({
      page_slug: phaseA.page_slug,
      page_url: phaseA.page_url,
      flow_refs: phaseA.flow_refs || [],
      page_title: (phaseA.dom && phaseA.dom.page_title) || null,
      headings: (phaseA.dom && phaseA.dom.headings) || [],
      cta_labels: ((phaseA.dom && phaseA.dom.cta_labels) || []).slice(0, 25),
      // Limitar cantidad de textos para mantener prompt compacto
      texts_sample: ((phaseA.dom && phaseA.dom.texts) || []).slice(0, 80)
    });
  }

  const out = {
    run_id: args.runId,
    app_language: appLanguage,
    ui_terminology_glossary: glossary,
    instructions: [
      'Analiza los textos visibles de cada pantalla y reporta SOLO defectos de calidad de copy/UX writing que un revisor humano experto detectaría.',
      'NO repitas hallazgos que ya cubre el escaneo determinístico (axe-core, ortografía regex, jerga técnica obvia, anglicismos comunes).',
      'Foco recomendado:',
      '  - Errores ortográficos sutiles (concordancia, conjugación, tildes en contexto)',
      '  - Microcopy ambiguo o que requiere conocimiento previo del usuario',
      '  - Mensajes de error no accionables (Nielsen H9)',
      '  - Tono inconsistente entre pantallas (formal vs informal)',
      '  - CTAs poco claras (verbo abstracto en vez de acción concreta)',
      '  - Headings que no comunican el contenido de la sección',
      '  - Placeholders usados como labels (anti-patrón)',
      `Idioma esperado: ${appLanguage}.`,
      `Glosario de términos válidos (no marcar como error): ${glossary.length ? glossary.join(', ') : '(ninguno)'}.`
    ],
    expected_output_shape: {
      findings: [{
        page_slug: 'string — debe coincidir con uno de pages[].page_slug',
        agrupador: 'visual | usabilidad — para errores de copy usar visual; para microcopy/CTA inconsistente usar usabilidad',
        rule_id: 'string corto kebab-case — ej: copy-microcopy-ambiguo, copy-tono-inconsistente, copy-cta-abstracta',
        severity: 'critical | serious | moderate | minor — usar critical solo para texto que bloquea o engaña al usuario',
        nielsen: 'number 1-10 cuando agrupador=usabilidad, null si agrupador=visual',
        message: 'string — qué encontraste exactamente, citando el texto problemático',
        recommendation: 'string — sugerencia accionable de cómo corregirlo',
        confidence: 'high | medium | low — qué tan seguro estás del finding'
      }]
    },
    pages
  };

  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(out, null, 2));
    process.stdout.write(JSON.stringify({ ok: true, output_path: args.output, pages_count: pages.length }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(out, null, 2));
  }
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// Modo MERGE
// ────────────────────────────────────────────────────────────────────────────

function validateLlmFinding(f, validSlugs) {
  if (!f || typeof f !== 'object') return 'not_object';
  if (!validSlugs.has(f.page_slug)) return `unknown_page_slug: ${f.page_slug}`;
  if (!['visual', 'usabilidad'].includes(f.agrupador)) return `bad_agrupador: ${f.agrupador}`;
  if (!f.rule_id || typeof f.rule_id !== 'string') return 'missing_rule_id';
  if (!['critical', 'serious', 'moderate', 'minor', 'info'].includes(f.severity)) return `bad_severity: ${f.severity}`;
  if (!f.message || typeof f.message !== 'string') return 'missing_message';
  return null;
}

function modeMerge(args) {
  const runFolder = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId);
  const aggPath = path.join(runFolder, 'visual_ux_a11y_results.json');
  if (!fs.existsSync(aggPath)) {
    process.stderr.write(`ERROR: agregado no existe: ${aggPath}. Ejecutar /sofka-asdd:qa-web-visual-ux-a11y antes de --deep-llm merge.\n`);
    process.exit(1);
  }
  const agg = safeReadJson(aggPath);
  if (!agg) {
    process.stderr.write('ERROR: visual_ux_a11y_results.json corrupto.\n');
    process.exit(1);
  }

  const llmRaw = safeReadJson(args.findingsFile);
  if (!llmRaw || !Array.isArray(llmRaw.findings)) {
    process.stderr.write('ERROR: findings-file inválido. Esperado: { findings: [...] }.\n');
    process.exit(1);
  }

  // Construir set de slugs válidos desde scope
  const validSlugs = new Set();
  for (const p of (agg.findings || [])) {
    for (const sip of (p.seen_in_pages || [])) {
      if (sip.page_slug) validSlugs.add(sip.page_slug);
    }
  }
  // Fallback: leer también de _pages/ por si agg no tiene findings previos
  for (const dir of listPagesDir(runFolder)) {
    const phaseA = safeReadJson(path.join(dir, 'page_scan_phase_a.json'));
    if (phaseA && phaseA.page_slug) validSlugs.add(phaseA.page_slug);
  }

  const accepted = [];
  const rejected = [];
  for (const f of llmRaw.findings) {
    const err = validateLlmFinding(f, validSlugs);
    if (err) {
      rejected.push({ rule_id: f.rule_id, page_slug: f.page_slug, error: err });
      continue;
    }
    accepted.push({
      id: `F-LLM-${String(accepted.length + 1).padStart(3, '0')}`,
      agrupador: f.agrupador,
      tipo: ['critical', 'serious'].includes(f.severity) ? 'hallazgo' : 'recomendacion',
      rule_id: f.rule_id,
      wcag: null,
      nielsen: typeof f.nielsen === 'number' ? f.nielsen : null,
      severity: f.severity,
      selector: null,
      message: f.message,
      recommendation: f.recommendation || null,
      evidence_status: 'general_observation',
      confidence: f.confidence || 'medium',
      source: 'deep-llm',
      seen_in_pages: [{
        flow_refs: [],
        page_slug: f.page_slug,
        page_url: null,
        evidence_file: null
      }]
    });
  }

  // Dedup contra findings determinísticos por (agrupador, rule_id, page_slug)
  const existingKeys = new Set();
  for (const f of (agg.findings || [])) {
    for (const sip of (f.seen_in_pages || [])) {
      existingKeys.add([f.agrupador, f.rule_id, sip.page_slug].join('||'));
    }
  }
  const dedupedAccepted = accepted.filter((f) => {
    const slug = (f.seen_in_pages[0] && f.seen_in_pages[0].page_slug) || '';
    return !existingKeys.has([f.agrupador, f.rule_id, slug].join('||'));
  });

  agg.findings = (agg.findings || []).concat(dedupedAccepted);

  // Recalcular summary
  const byAgrupador = { visual: 0, usabilidad: 0, accesibilidad: 0 };
  const byTipo = { hallazgo: 0, recomendacion: 0 };
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 };
  const wcagCounts = {};
  const nielsenCounts = {};
  for (const f of agg.findings) {
    if (f.agrupador && byAgrupador[f.agrupador] !== undefined) byAgrupador[f.agrupador]++;
    if (f.tipo && byTipo[f.tipo] !== undefined) byTipo[f.tipo]++;
    if (f.severity && bySeverity[f.severity] !== undefined) bySeverity[f.severity]++;
    if (f.wcag) wcagCounts[f.wcag] = (wcagCounts[f.wcag] || 0) + 1;
    if (typeof f.nielsen === 'number') nielsenCounts[f.nielsen] = (nielsenCounts[f.nielsen] || 0) + 1;
  }
  if (!agg.summary) agg.summary = {};
  agg.summary.total_findings = agg.findings.length;
  agg.summary.by_agrupador = byAgrupador;
  agg.summary.by_tipo = byTipo;
  agg.summary.by_severity = bySeverity;
  agg.summary.top_wcag = Object.entries(wcagCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([wcag, count]) => ({ wcag, count }));

  // Marcar que se ejecutó deep-llm
  agg.deep_llm = {
    executed: true,
    findings_added: dedupedAccepted.length,
    findings_rejected: rejected.length,
    findings_duplicated: accepted.length - dedupedAccepted.length,
    merged_at: new Date().toISOString()
  };

  fs.writeFileSync(aggPath, JSON.stringify(agg, null, 2));

  process.stdout.write(JSON.stringify({
    ok: true,
    output_path: aggPath,
    accepted: dedupedAccepted.length,
    rejected: rejected.length,
    duplicated: accepted.length - dedupedAccepted.length,
    rejection_reasons: rejected.slice(0, 10)
  }, null, 2) + '\n');
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// Entry
// ────────────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'prepare') return modePrepare(args);
  if (args.mode === 'merge')   return modeMerge(args);
  process.stderr.write(`ERROR: mode desconocido: ${args.mode}\n`);
  process.exit(1);
}

main();
