---
name: sofka-asdd-atf-api-performance-perf-threshold-evaluator
description: Evalúa results de k6 contra thresholds y produce perf-report.md con veredicto por escenario y regresiones.
used_by:
  - sofka-asdd-atf-api-performance
---

## Propósito

Convertir los **outputs crudos de k6** (`summary.json`, `metrics.json`) en un **reporte interpretable** con veredicto explícito por escenario y guía de remediation cuando algún threshold se incumple.

**Principio:** un threshold incumplido no significa "fallar el release" — significa "decidir conscientemente". El reporte da los datos y recomendaciones; la decisión queda al equipo.

## Cuándo invocar

Tras ejecución de los scripts k6 (manual por el equipo o vía CI). Segundo y último skill del módulo de Performance por corrida.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `run_id` | string | Run ID |
| `k6_results_path` | string | Path a `docs/testing/atf/{run_id}/performance/results/` |
| `script_generator_metadata` | object | Output del `k6-script-generator` con thresholds aplicados |
| `baseline_perf_results` | object | (opcional) Resultados del baseline para comparación |

## Proceso

1. Para cada escenario ejecutado, leer el `summary.json` correspondiente.
2. Extraer métricas clave:
   - `http_req_duration` (avg, p50, p95, p99)
   - `http_req_failed` (rate)
   - `iterations` (total + rate)
   - `vus_max`
3. Comparar contra thresholds definidos en el script (visibles en `script_generator_metadata`).
4. Para cada threshold:
   - `pass` si métrica respeta el threshold
   - `fail` si lo viola
   - `marginal` si está dentro del 5% del threshold (alerta sin fail)
5. Si hay baseline, calcular delta:
   - `improvement` si la métrica mejoró ≥ 10%
   - `regression` si empeoró ≥ 10%
   - `stable` en otros casos
6. Generar `perf-report.md` con tabla por escenario + recomendaciones.

## Output

### `perf-evaluation.json`

```json
{
  "run_id": "{run_id}",
  "evaluated_at": "{ISO 8601}",
  "scenarios": [
    {
      "name": "load",
      "endpoint": "POST /pending-billing-quotas",
      "duration_min": 10,
      "vus_max": 50,
      "iterations_total": 5247,
      "metrics": {
        "http_req_duration_avg_ms": 234,
        "http_req_duration_p50_ms": 187,
        "http_req_duration_p95_ms": 678,
        "http_req_duration_p99_ms": 1234,
        "http_req_failed_rate_pct": 0.3,
        "throughput_rps": 8.7
      },
      "thresholds_evaluation": [
        {"metric": "http_req_duration_p95", "threshold": "< 1000ms", "observed": "678ms", "result": "pass"},
        {"metric": "http_req_duration_p99", "threshold": "< 2000ms", "observed": "1234ms", "result": "pass"},
        {"metric": "http_req_failed", "threshold": "< 1%", "observed": "0.3%", "result": "pass"}
      ],
      "verdict": "PASS",
      "baseline_comparison": {"has_baseline": true, "p95_change_pct": -3, "verdict": "stable"}
    },
    {
      "name": "stress",
      "endpoint": "POST /pending-billing-quotas",
      "verdict": "FAIL",
      "thresholds_evaluation": [
        {"metric": "http_req_duration_p95", "threshold": "< 2000ms", "observed": "3450ms", "result": "fail"},
        {"metric": "http_req_failed", "threshold": "< 5%", "observed": "7.8%", "result": "fail"}
      ],
      "breaking_point_vus": 150,
      "recommendations": [
        "El endpoint degrada notablemente sobre 150 VUs concurrentes. Revisar pool de conexiones BD (actual probable: 20-50).",
        "p95 supera 2s en stress — investigar query a t_billing_request (sospecha de tabla scan sin índice en cycle+distributorId).",
        "Considerar implementar caché Redis para validaciones de distributorId (lookup frecuente)."
      ]
    }
  ],
  "summary": {
    "scenarios_passed": 3,
    "scenarios_failed": 2,
    "regressions_vs_baseline": 0,
    "recommendations_total": 4
  }
}
```

### `perf-report.md`

```markdown
# Performance Report — {run_id}

**Endpoint principal:** POST /osf/api/v1/pending-billing-quotas
**Fecha:** {YYYY-MM-DD}

## Resumen por escenario

| Escenario | VUs | Duración | p95 | Error rate | Veredicto |
|---|---|---|---|---|---|
| Smoke | 1 | 1 min | 134ms | 0% | 🟢 PASS |
| Load | 50 | 10 min | 678ms | 0.3% | 🟢 PASS |
| Stress | 200 | 15 min | 3450ms | 7.8% | 🔴 FAIL |
| Spike | 1→300 | 5 min | 4890ms | 12.4% | 🔴 FAIL |
| Soak | 30 | 60 min | 712ms | 0.5% | 🟢 PASS |

## Hallazgos clave

1. **Punto de quiebre:** ~ 150 VUs concurrentes
2. **Stress degrada** p95 a 3.4s — fuera de threshold
3. **Spike no se recupera** rápido — p95 sigue >2s tras 1min de retorno a baja carga
4. **Soak estable** sin signos de memory leak ni degradación gradual

## Recomendaciones

(...)

## Comparación vs baseline

(...)
```

## Reglas duras

1. **Veredicto binario por escenario.** PASS o FAIL — sin "casi pass".
2. **Recomendaciones específicas.** Pueden incluir nombres de queries, recursos, configs.
3. **Sin métricas inventadas.** Solo lo que k6 reportó en el `summary.json`.
4. **Comparación con baseline marca regresión** solo con delta ≥ 10% — ruido estadístico ignorado.
5. **Performance no bloquea Step 7** por defecto — produce hallazgos visibles, no veto.

## Cuándo NO invocar

- No hay resultados k6 disponibles (scripts no se ejecutaron) — devolver `status: pending_execution`
- `optional_pipelines.performance: false` — skipped

## Anti-patterns

- **Comparar contra baseline de hace 6 meses.** Usar baseline reciente (última corrida `completed`).
- **Reportar p95 sin contexto de VUs y duración.** Una métrica sin contexto es ruido.
- **Recomendaciones genéricas** ("optimizar"). Cada recomendación apunta a algo concreto (query X, índice Y, caché Z).
- **Veredicto verde con regresión severa pero dentro de threshold.** Si p95 subió 40% pero sigue bajo threshold, mencionar como `marginal_regression`.

## Referencias

- Template: `templates/perf-evaluation.template.json`
- Ejemplo: `examples/example-perf-evaluation-clienteejemplo.json`
