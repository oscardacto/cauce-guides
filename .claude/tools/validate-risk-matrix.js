#!/usr/bin/env node
/**
 * validate-risk-matrix.js
 * Validador post-emisión del strategist.
 *
 * Verifica consistencia entre `risks[]` (autoritativo) y `summary.*` del
 * `risk_matrix.json`. Si encuentra mismatch:
 *   - Recomputa los counters desde risks[] (fuente de verdad).
 *   - Re-escribe el summary corrigiéndolo (auto-heal).
 *   - Emite warnings explícitos al stdout.
 *
 * Doctrina prosa-vs-código: el agente strategist puede equivocarse al copiar
 * counters; aquí el script determinístico garantiza la integridad del summary
 * sin depender de razonamiento LLM.
 *
 * Uso:
 *   node validate-risk-matrix.js --run-id=<id>
 *   node validate-risk-matrix.js --file=<absolute_path>
 *
 * Exit:
 *   0 OK (sin diferencias O auto-heal aplicado)
 *   1 Error fatal (archivo no existe, JSON inválido, schema irrecuperable)
 *   2 Mismatch detectado pero NO auto-heal solicitado (--dry-run)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { runId: null, file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--run-id=')) out.runId = a.split('=')[1];
    else if (a === '--run-id') out.runId = argv[++i];
    else if (a.startsWith('--file=')) out.file = a.split('=')[1];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write('validate-risk-matrix.js --run-id=<id> | --file=<path> [--dry-run]\n');
      process.exit(0);
    }
  }
  if (!out.runId && !out.file) {
    process.stderr.write('ERROR: --run-id o --file requerido.\n');
    process.exit(1);
  }
  return out;
}

function resolveTarget(args) {
  if (args.file) return args.file;
  return path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web', args.runId, 'strategy', 'risk_matrix.json');
}

const VALID_LEVELS = ['critical', 'high', 'medium', 'low'];
const VALID_SOURCES = ['hu_literal', 'compliance_mandatory', 'cross_cutting_inferred'];

function recomputeSummary(risks) {
  const out = {
    total_hus_analyzed: 0,
    total_risks_identified: risks.length,
    risks_by_level: { critical: 0, high: 0, medium: 0, low: 0 },
    risks_by_category: {},
    risks_by_source: { hu_literal: 0, compliance_mandatory: 0, cross_cutting_inferred: 0 },
    critical_hus: [],
    requires_po_validation_count: 0,
    risks_unclassified: 0
  };
  const huSet = new Set();
  for (const r of risks) {
    if (r.hu_id) huSet.add(r.hu_id);
    const lvl = (r.risk_level || '').toLowerCase();
    if (out.risks_by_level[lvl] !== undefined) out.risks_by_level[lvl]++;
    const cat = r.risk_category || 'unknown';
    out.risks_by_category[cat] = (out.risks_by_category[cat] || 0) + 1;
    const src = r.source || null;
    if (src && out.risks_by_source[src] !== undefined) {
      out.risks_by_source[src]++;
    } else {
      out.risks_unclassified++;
    }
    if (Array.isArray(r.tags) && r.tags.includes('@requiere-validacion')) {
      out.requires_po_validation_count++;
    } else if (src === 'cross_cutting_inferred') {
      // Tag faltante pero source indica cross_cutting → contar igual
      out.requires_po_validation_count++;
    }
    if (lvl === 'critical' && r.hu_id && !out.critical_hus.includes(r.hu_id)) {
      out.critical_hus.push(r.hu_id);
    }
  }
  out.total_hus_analyzed = huSet.size;
  return out;
}

function diffSummary(emitted, computed) {
  const diffs = [];
  function compareLeaf(pathStr, a, b) {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) diffs.push({ path: pathStr, emitted: a, computed: b });
  }
  if (!emitted) {
    diffs.push({ path: 'summary', emitted: null, computed: '<computed>' });
    return diffs;
  }
  compareLeaf('total_risks_identified', emitted.total_risks_identified, computed.total_risks_identified);
  compareLeaf('risks_by_level', emitted.risks_by_level, computed.risks_by_level);
  compareLeaf('risks_by_source', emitted.risks_by_source, computed.risks_by_source);
  compareLeaf('requires_po_validation_count', emitted.requires_po_validation_count, computed.requires_po_validation_count);
  return diffs;
}

function validateRiskShapes(risks) {
  const issues = [];
  risks.forEach((r, i) => {
    if (!r.risk_id) issues.push({ idx: i, kind: 'missing_risk_id' });
    if (!r.source) issues.push({ idx: i, risk_id: r.risk_id, kind: 'missing_source' });
    else if (!VALID_SOURCES.includes(r.source)) issues.push({ idx: i, risk_id: r.risk_id, kind: 'invalid_source', value: r.source });
    if (r.source === 'hu_literal' && (r.evidence === null || r.evidence === undefined || r.evidence === '')) {
      issues.push({ idx: i, risk_id: r.risk_id, kind: 'missing_evidence_for_hu_literal' });
    }
    if (r.source === 'compliance_mandatory' && (r.evidence === null || r.evidence === undefined || r.evidence === '')) {
      issues.push({ idx: i, risk_id: r.risk_id, kind: 'missing_evidence_for_compliance' });
    }
    if (r.source === 'cross_cutting_inferred' && Array.isArray(r.tags) && !r.tags.includes('@requiere-validacion')) {
      issues.push({ idx: i, risk_id: r.risk_id, kind: 'missing_tag_requiere_validacion' });
    }
  });
  return issues;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);

  if (!fs.existsSync(target)) {
    process.stderr.write(`ERROR: archivo no existe: ${target}\n`);
    process.exit(1);
  }

  let data;
  try { data = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch (e) {
    process.stderr.write(`ERROR: JSON inválido: ${e.message}\n`);
    process.exit(1);
  }

  const risks = Array.isArray(data.risks) ? data.risks : [];
  if (!risks.length) {
    process.stdout.write(JSON.stringify({ ok: true, target, total_risks: 0, action: 'noop' }, null, 2) + '\n');
    process.exit(0);
  }

  const computed = recomputeSummary(risks);
  const emittedSummary = data.summary || null;
  const diffs = diffSummary(emittedSummary, computed);
  const shapeIssues = validateRiskShapes(risks);

  const action = diffs.length === 0 ? 'consistent' : (args.dryRun ? 'mismatch_dry_run' : 'auto_healed');

  if (diffs.length > 0 && !args.dryRun) {
    // Auto-heal: preservar campos extra del summary y sobreescribir los recomputados
    const newSummary = { ...(emittedSummary || {}) };
    newSummary.total_risks_identified = computed.total_risks_identified;
    newSummary.risks_by_level = computed.risks_by_level;
    newSummary.risks_by_source = computed.risks_by_source;
    newSummary.risks_by_category = computed.risks_by_category;
    newSummary.requires_po_validation_count = computed.requires_po_validation_count;
    if (computed.critical_hus.length && !newSummary.critical_hus) newSummary.critical_hus = computed.critical_hus;
    if (!newSummary.cross_cutting_mode_applied) newSummary.cross_cutting_mode_applied = (data.cross_cutting_mode || 'literal');
    if (computed.risks_unclassified > 0) newSummary.risks_unclassified = computed.risks_unclassified;
    newSummary._validator = {
      validated_at: new Date().toISOString(),
      diffs_corrected: diffs.length,
      shape_issues: shapeIssues.length
    };
    data.summary = newSummary;
    fs.writeFileSync(target, JSON.stringify(data, null, 2));
  }

  const report = {
    ok: true,
    target,
    total_risks: risks.length,
    action,
    diffs_count: diffs.length,
    diffs: diffs.slice(0, 10),
    shape_issues_count: shapeIssues.length,
    shape_issues: shapeIssues.slice(0, 10),
    computed_summary: {
      risks_by_source: computed.risks_by_source,
      risks_by_level: computed.risks_by_level,
      requires_po_validation_count: computed.requires_po_validation_count,
      risks_unclassified: computed.risks_unclassified
    }
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(args.dryRun && diffs.length > 0 ? 2 : 0);
}

main();
