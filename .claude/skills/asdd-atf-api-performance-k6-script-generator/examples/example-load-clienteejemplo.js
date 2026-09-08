// k6 script — load de POST /osf/api/v1/pending-billing-quotas
// Generado por asdd-atf-api-performance-k6-script-generator
// Run ID: PruebaAPIClienteEjemplo-v1.0-20260521-1030
//
// Correr:
//   K6_BASE_URL=https://api-qa.clienteejemplo.example.com/v1 k6 run --out json=results.json load-post-pending-billing-quotas.js
//
// Reporte esperado en:
//   docs/output/PruebaAPIClienteEjemplo-v1.0-20260521-1030/performance/results/load-summary.json

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('custom_error_rate');
const customDuration = new Trend('custom_duration_ms', true);
const successCount = new Counter('custom_success_count');

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '6m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    custom_error_rate: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.K6_BASE_URL ?? 'https://api-qa.clienteejemplo.example.com/v1';

export default function () {
  // Variar distributorId por VU para evitar collision de unicidad y caché
  const payload = JSON.stringify({
    cycle: '2026-05',
    distributorId: `DIST-LOAD-${__VU}-${__ITER}`,
    billingPeriod: '2026-05',
    periodProcessDate: new Date().toISOString().slice(0, 10),
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'POST /pending-billing-quotas', scenario: 'load' },
  };

  const res = http.post(`${BASE_URL}/osf/api/v1/pending-billing-quotas`, payload, params);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'has requestId': (r) => {
      try { return r.json('requestId') !== undefined; } catch { return false; }
    },
    'status is PENDING': (r) => {
      try { return r.json('status') === 'PENDING'; } catch { return false; }
    },
  });

  errorRate.add(!ok);
  customDuration.add(res.timings.duration);
  if (ok) successCount.add(1);

  sleep(1);
}

// Cleanup post-test: en este escenario los registros creados se purgan
// automáticamente por el batch nocturno del entorno QA. Si se necesita cleanup
// manual, ejecutar el endpoint DELETE de admin (no documentado en este contrato).
export function teardown() {
  console.log('Load test completed. Cleanup will happen via nightly batch.');
}
