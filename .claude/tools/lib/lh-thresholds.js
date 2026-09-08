'use strict';
/**
 * lh-thresholds.js — SSoT de clasificación Core Web Vitals para la fase performance.
 * Consumido por lh-aggregate-results.js. Sin dependencias.
 *
 * classify(metric, value, thresholds) → 'good' | 'needs_improvement' | 'poor' | 'no_data'
 * performanceScore(ratings)           → 0-100 (promedio de LCP,CLS,FCP,INP) | null
 * verdict(score)                      → 'PASS' | 'WARNING' | 'FAIL' | 'NO_DATA'
 *
 * INP medido pasivamente (sin interacción simulada) llega como null → rating
 * 'no_data' → excluido del promedio del score (no infla con un falso 'good').
 *
 * Self-test: node lh-thresholds.js
 */

const DEFAULT_THRESHOLDS = {
  lcp:  { good: 2500, needs: 4000 },
  cls:  { good: 0.10, needs: 0.25 },
  fcp:  { good: 1800, needs: 3000 },
  inp:  { good: 200,  needs: 500 },
  ttfb: { good: 800,  needs: 1800 }
};

const RATING_POINTS = { good: 100, needs_improvement: 60, poor: 0 };
const SCORED_METRICS = ['lcp', 'cls', 'fcp', 'inp']; // TTFB se reporta pero no puntúa (doctrina del agente)

function classify(metric, value, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds[metric];
  if (!t || value == null || Number.isNaN(value)) return 'no_data';
  if (value <= t.good) return 'good';
  if (value <= t.needs) return 'needs_improvement';
  return 'poor';
}

function performanceScore(ratings) {
  const pts = SCORED_METRICS
    .map(k => RATING_POINTS[ratings[k]])
    .filter(v => v !== undefined && v !== null);
  if (pts.length === 0) return null;
  return Math.round(pts.reduce((a, b) => a + b, 0) / pts.length);
}

function verdict(score) {
  if (score == null) return 'NO_DATA';
  if (score >= 80) return 'PASS';
  if (score >= 60) return 'WARNING';
  return 'FAIL';
}

// Mezcla overrides de config.yaml → performance.thresholds sobre los defaults.
function mergeThresholds(override) {
  const out = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
  if (override && typeof override === 'object') {
    for (const k of Object.keys(out)) {
      if (override[k] && typeof override[k] === 'object') {
        if (override[k].good  != null) out[k].good  = Number(override[k].good);
        if (override[k].needs != null) out[k].needs = Number(override[k].needs);
      }
    }
  }
  return out;
}

module.exports = { DEFAULT_THRESHOLDS, RATING_POINTS, SCORED_METRICS, classify, performanceScore, verdict, mergeThresholds };

// ─── Self-test ───
if (require.main === module) {
  const assert = require('assert');
  assert.strictEqual(classify('lcp', 1850), 'good');
  assert.strictEqual(classify('lcp', 3000), 'needs_improvement');
  assert.strictEqual(classify('lcp', 5000), 'poor');
  assert.strictEqual(classify('cls', 0.05), 'good');
  assert.strictEqual(classify('cls', 0.20), 'needs_improvement');
  assert.strictEqual(classify('lcp', null), 'no_data');
  assert.strictEqual(classify('inp', null), 'no_data');
  // INP no_data excluido → score sobre LCP,CLS,FCP
  assert.strictEqual(performanceScore({ lcp: 'good', cls: 'good', fcp: 'good', inp: 'no_data' }), 100);
  assert.strictEqual(performanceScore({ lcp: 'good', cls: 'good', fcp: 'good', inp: 'good' }), 100);
  assert.strictEqual(performanceScore({ lcp: 'good', cls: 'good', fcp: 'needs_improvement', inp: 'poor' }), 65);
  assert.strictEqual(performanceScore({ lcp: 'no_data', cls: 'no_data', fcp: 'no_data', inp: 'no_data' }), null);
  assert.strictEqual(verdict(85), 'PASS');
  assert.strictEqual(verdict(70), 'WARNING');
  assert.strictEqual(verdict(40), 'FAIL');
  assert.strictEqual(verdict(null), 'NO_DATA');
  // mergeThresholds
  const m = mergeThresholds({ lcp: { good: 2000 } });
  assert.strictEqual(m.lcp.good, 2000);
  assert.strictEqual(m.lcp.needs, 4000);
  assert.strictEqual(m.cls.good, 0.10);
  console.log('lh-thresholds self-test OK');
}
