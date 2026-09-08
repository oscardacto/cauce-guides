#!/usr/bin/env node
/**
 * lh-aggregate-results.js — promedia las mediciones crudas, clasifica vs umbrales,
 * calcula performance_score y verdict, y escribe los outputs canónicos.
 *
 * Lee:  {output_base_dir}/.raw/{e2e_id}.json   (de lh-measure-flows.js)
 *       {perf-context}                           (umbrales + lista de flujos)
 * Escribe:
 *       performance/lighthouse_{flow_id}.json   (1 por flujo — OUTPUT PRIMARIO)
 *       performance/summary.md                   (tabla resumen)
 *       performance_results.json (run root)      (consumido por dashboard tab "Performance")
 *
 * Sin mediciones exitosas para un flujo → verdict "NO_DATA", performance_score null.
 *
 * Uso: node lh-aggregate-results.js --run-id=<id> --perf-context=<path>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const lh = require('./lib/lh-thresholds.js');

function arg(k, d = null) {
  const a = process.argv.slice(2).find((x) => x === k || x.startsWith(k + '='));
  if (!a) return d;
  return a.includes('=') ? a.split('=').slice(1).join('=') : true;
}
function avg(nums) {
  const v = nums.filter((n) => n != null && !Number.isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function round(n, dec = 0) {
  if (n == null) return null;
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

const runId = arg('--run-id');
const ctxPath = arg('--perf-context');
if (!runId || !ctxPath) {
  console.error('USO: --run-id=<id> --perf-context=<path>');
  process.exit(2);
}

const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
const thresholds = lh.mergeThresholds(ctx.perf_config && ctx.perf_config.thresholds);
const perfDir = ctx.output_base_dir;
const rawDir = path.join(perfDir, '.raw');
fs.mkdirSync(perfDir, { recursive: true });

const METRICS = ['lcp', 'cls', 'fcp', 'inp', 'ttfb'];
const flowResults = [];

for (const flow of ctx.flows) {
  const rawPath = path.join(rawDir, `${flow.e2e_id}.json`);
  let raw = null;
  if (fs.existsSync(rawPath)) {
    try { raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')); } catch { /* raw queda null */ }
  }

  const good = raw ? raw.measurements.filter((m) => !m.error) : [];
  const metrics = {};
  const ratings = {};
  for (const k of METRICS) {
    const values = good.map((m) => m[k]).filter((v) => v != null);
    const a = avg(values);
    const rating = lh.classify(k, a, thresholds);
    ratings[k] = rating;
    if (k === 'cls') {
      metrics[k] = { avg: round(a, 3), values: values.map((v) => round(v, 3)), rating };
    } else {
      metrics[k] = { avg_ms: round(a, 0), values: values.map((v) => round(v, 0)), rating };
    }
  }
  const score = good.length ? lh.performanceScore(ratings) : null;
  const v = lh.verdict(score);

  const out = {
    flow_id: flow.e2e_id,
    flow_name: flow.name,
    entry_url: flow.entry_url,
    performance_score: score,
    verdict: v,
    measurements: {
      repetitions: raw ? raw.repetitions : 0,
      successful: good.length,
      metrics
    }
  };
  fs.writeFileSync(path.join(perfDir, `lighthouse_${flow.e2e_id}.json`), JSON.stringify(out, null, 2));
  flowResults.push(out);
  console.log(JSON.stringify({ event: 'flow_aggregated', e2e_id: flow.e2e_id, score, verdict: v }));
}

// ── summary.md ──
const rows = flowResults.map((f) => {
  const m = f.measurements.metrics;
  return `| ${f.flow_id} | ${f.flow_name} | ${f.performance_score != null ? f.performance_score : '—'} | ${f.verdict} | ${m.lcp.avg_ms != null ? m.lcp.avg_ms : '—'} | ${m.cls.avg != null ? m.cls.avg : '—'} | ${m.fcp.avg_ms != null ? m.fcp.avg_ms : '—'} | ${m.inp.avg_ms != null ? m.inp.avg_ms : '— (no medido)'} | ${m.ttfb.avg_ms != null ? m.ttfb.avg_ms : '—'} |`;
}).join('\n');
const summaryMd = `# Performance — Core Web Vitals · ${runId}

| Flujo | Nombre | Score | Verdict | LCP(ms) | CLS | FCP(ms) | INP(ms) | TTFB(ms) |
|---|---|---|---|---|---|---|---|---|
${rows}

> Generado: ${new Date().toISOString()} · Umbrales: config.yaml → performance
> INP medido pasivamente (sin interacción simulada): "no medido" = excluido del score.
`;
fs.writeFileSync(path.join(perfDir, 'summary.md'), summaryMd);

// ── performance_results.json (dashboard) ──
const byVerdict = flowResults.reduce((a, f) => { a[f.verdict] = (a[f.verdict] || 0) + 1; return a; }, {});
const scores = flowResults.map((f) => f.performance_score).filter((s) => s != null);
const results = {
  run_id: runId,
  mode: 'performance',
  generated_at: new Date().toISOString(),
  thresholds,
  summary: {
    total_flows: flowResults.length,
    by_verdict: byVerdict,
    avg_score: scores.length ? round(avg(scores), 0) : null
  },
  flows: flowResults
};
fs.writeFileSync(path.join(ctx.run_folder, 'performance_results.json'), JSON.stringify(results, null, 2));

console.log(JSON.stringify({
  ok: true,
  output_path: path.join(ctx.run_folder, 'performance_results.json'),
  flows_total: flowResults.length,
  by_verdict: byVerdict,
  avg_score: results.summary.avg_score
}));
