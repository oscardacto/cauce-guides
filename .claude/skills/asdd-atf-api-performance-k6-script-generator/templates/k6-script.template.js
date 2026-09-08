// k6 script — {scenario_name} de {endpoint}
// Generado por asdd-atf-api-performance-k6-script-generator
// Run ID: {run_id}
//
// Correr:
//   K6_BASE_URL=https://api-qa.example.com/v1 k6 run --out json=results.json {filename}
//
// Reportes esperados en:
//   docs/testing/atf/{run_id}/performance/results/{scenario}-summary.json

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('custom_error_rate');
const customDuration = new Trend('custom_duration_ms', true);
const successCount = new Counter('custom_success_count');

export const options = {
  scenarios: {
    {scenario_name}: {
      executor: '{executor}',
      // Ajustar según escenario:
      // - smoke: constant-vus, vus: 1, duration: '1m'
      // - load: ramping-vus, stages: [{ duration: '2m', target: 50 }, { duration: '6m', target: 50 }, { duration: '2m', target: 0 }]
      // - stress: ramping-vus, stages: [{ duration: '3m', target: 50 }, { duration: '3m', target: 100 }, { duration: '5m', target: 200 }, { duration: '4m', target: 0 }]
      // - spike: ramping-vus, stages: [{ duration: '30s', target: 1 }, { duration: '30s', target: 300 }, { duration: '2m', target: 300 }, { duration: '30s', target: 1 }, { duration: '1m', target: 1 }]
      // - soak: constant-vus, vus: 30, duration: '60m'
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<{p95_threshold_ms}', 'p(99)<{p99_threshold_ms}'],
    http_req_failed: ['rate<{error_rate_threshold}'],
    custom_error_rate: ['rate<{error_rate_threshold}'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.K6_BASE_URL ?? '{app_url_snapshot}';

export default function () {
  // Variar payload por VU para evitar caché backend
  const payload = JSON.stringify({
    // campos del request body con __VU/__ITER para variabilidad
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: '{endpoint_label}', scenario: '{scenario_name}' },
  };

  const res = http.{http_method}(`${BASE_URL}{path}`, payload, params);

  const ok = check(res, {
    'status is {expected_status}': (r) => r.status === {expected_status},
    // assertions adicionales por endpoint
  });

  errorRate.add(!ok);
  customDuration.add(res.timings.duration);
  if (ok) successCount.add(1);

  sleep({sleep_seconds_between_iterations});
}

// Función opcional para cleanup post-test (si el escenario crea datos)
export function teardown() {
  // Eliminar registros creados durante el load test si aplica
}
