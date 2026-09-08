---
name: sofka-asdd-atf-api-performance-k6-script-generator
description: Genera scripts k6 con 5 escenarios (smoke, load, stress, spike, soak) y thresholds por endpoint crítico.
used_by:
  - sofka-asdd-atf-api-performance
---

## Propósito

Producir el paquete de scripts k6 que permite al equipo ejecutar pruebas de carga sobre la API sin escribir el código manualmente. Los 5 escenarios estándar son **fijos por diseño** — el equipo no decide qué generar, decide qué ejecutar.

## Cuándo invocar

- Tras Step 2 si `optional_pipelines.performance: true`
- Vía `/sofka-asdd:qa-do` para regenerar 1 script puntual

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_contracts` | array | Endpoints a evaluar |
| `risk_matrix` | object | Para priorizar qué endpoints incluir y con qué intensidad |
| `session_config` | object | Para `app.url`, validar `environment` |
| `endpoints_to_test` | array | (opcional) Subset; default = endpoints `critical` y `high` del risk_matrix |

## Catálogo de escenarios

| Escenario | VUs | Duración | Patrón | Propósito |
|---|---|---|---|---|
| **smoke** | 1 | 1 min | constante | Validar que el endpoint responde bajo carga mínima |
| **load** | 50 | 10 min | rampa 2 min → meseta 6 min → rampa 2 min | Comportamiento bajo carga normal esperada |
| **stress** | 200 | 15 min | rampa progresiva | Encontrar el punto de quiebre |
| **spike** | 1 → 300 → 1 | 5 min | spike abrupto | Recuperación tras pico súbito |
| **soak** | 30 | 60 min | constante | Memory leaks, degradación gradual |

## Thresholds por escenario

| Métrica | smoke | load | stress | spike | soak |
|---|---|---|---|---|---|
| `http_req_duration p95` | < 500ms | < 1s | < 2s | < 5s | < 1s |
| `http_req_failed` | < 1% | < 1% | < 5% | < 10% | < 1% |
| `http_reqs (target)` | ~ 60 | ~ 5000 | ~ 10000 | variable | ~ 18000 |
| `iteration_duration p99` | < 800ms | < 1.5s | < 3s | < 7s | < 1.5s |

Thresholds son configurables si el endpoint tiene SLAs documentados en RN.

## Estructura del script k6

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('custom_error_rate');
const customDuration = new Trend('custom_duration_ms');

export const options = {
  scenarios: {
    {scenario_name}: {
      executor: 'ramping-vus',
      startVUs: {start},
      stages: [
        { duration: '2m', target: {target_vus} },
        { duration: '6m', target: {target_vus} },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    custom_error_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.K6_BASE_URL ?? '{app.url-snapshot}';

export default function () {
  const payload = JSON.stringify({
    cycle: '2026-05',
    distributorId: `DIST-LOAD-${__VU}`,
    billingPeriod: '2026-05',
    periodProcessDate: new Date().toISOString().slice(0, 10),
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'POST /pending-billing-quotas' },
  };

  const res = http.post(`${BASE_URL}/osf/api/v1/pending-billing-quotas`, payload, params);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'has requestId': (r) => r.json('requestId') !== undefined,
  });

  errorRate.add(!ok);
  customDuration.add(res.timings.duration);

  sleep(1);
}
```

## Proceso

1. Validar `app.environment !== 'production'`.
2. Por cada endpoint en `endpoints_to_test`:
   2.1. Por cada escenario (smoke, load, stress, spike, soak):
        - Renderizar script desde template
        - Inyectar thresholds según RN y riesgo
        - Variar el payload por VU para evitar caché del backend
3. Generar README con instrucciones de ejecución.
4. Producir `setup-result.json`.

## Output

```text
docs/testing/atf/{run_id}/performance/scripts/
├── smoke-{endpoint-slug}.js
├── load-{endpoint-slug}.js
├── stress-{endpoint-slug}.js
├── spike-{endpoint-slug}.js
├── soak-{endpoint-slug}.js
└── README.md
```

Y un metadata:

```json
{
  "run_id": "{run_id}",
  "scripts_path": "docs/testing/atf/{run_id}/performance/scripts/",
  "endpoints_covered": ["POST /osf/api/v1/pending-billing-quotas"],
  "scripts_generated": [
    {"file": "smoke-post-pending-billing-quotas.js", "scenario": "smoke", "estimated_duration_min": 1},
    {"file": "load-post-pending-billing-quotas.js", "scenario": "load", "estimated_duration_min": 10},
    {"file": "stress-post-pending-billing-quotas.js", "scenario": "stress", "estimated_duration_min": 15},
    {"file": "spike-post-pending-billing-quotas.js", "scenario": "spike", "estimated_duration_min": 5},
    {"file": "soak-post-pending-billing-quotas.js", "scenario": "soak", "estimated_duration_min": 60}
  ],
  "thresholds_summary": {"...": "..."},
  "next_step": "Ejecutar scripts con `k6 run` y procesar resultados con sofka-asdd-atf-api-performance-perf-threshold-evaluator"
}
```

## Reglas duras

1. **Nunca contra producción.** Verificar `environment` antes de generar.
2. **Payloads únicos por VU.** Usar `__VU` y `__ITER` para variar datos y evitar caché.
3. **No cargar credenciales en el script.** Vienen por env var en runtime.
4. **Cleanup post-load.** Si los scripts crean datos, documentar cómo limpiar (script de cleanup separado o nota explicit en README).
5. **Soak ≥ 30 min.** Soak corto no detecta leaks.

## Cuándo NO invocar

- `optional_pipelines.performance: false`
- `app.environment: production` — abortar
- Endpoints solo `low` priority — no vale la pena el setup; usar `endpoints_to_test` filtrado

## Anti-patterns

- **Soak de 5 minutos.** No detecta degradación. Mínimo 30 min, ideal 1-4 horas.
- **Thresholds genéricos para todos.** Un GET de health y un POST de creación tienen SLAs distintos.
- **VUs sin warm-up.** Comenzar en 200 directo sin rampa distorsiona los percentiles iniciales.
- **Datos idénticos en todas las iteraciones.** Backend hace caché y resultados son irreales.

## Referencias

- Template: `templates/k6-script.template.js`
- Ejemplo: `examples/example-load-clienteejemplo.js`
