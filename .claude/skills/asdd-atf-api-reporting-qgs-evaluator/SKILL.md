---
name: asdd-atf-api-reporting-qgs-evaluator
description: Evalúa el Quality Gate Score contra umbrales y emite veredicto PASS o FAIL. Bloquea el cierre si quedan defectos sin clasificar.
used_by:
  - asdd-atf-reporting-qa-engineer
---

## Propósito

Decidir, con criterios objetivos y públicos, si la corrida pasa el quality gate. El veredicto es **binario** (PASS o FAIL) — sin "PASS con observaciones" o "casi-PASS". Si hay duda, es FAIL.

## Cuándo invocar

Tras `failure-classifier`. Primer skill del agente de Reporting por corrida.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `execution_results` | object | Output del `execution-runner` |
| `defects_summary` | object | Output del `failure-classifier` |
| `defects[]` | array | Defectos D-NNN individuales |
| `session_config` | object | Para `cycle.type` (umbrales más estrictos en regression) |

## Umbrales del QGS

Implementan `DEF-007` de la regla de clasificación, con thresholds aplicables por `cycle.type`:

| Métrica | Threshold (baseline) | Threshold (regression/fast-track) | Bloqueante |
|---|---|---|---|
| Pass rate global | ≥ 70% | ≥ 90% | sí |
| Pass rate de CPs `critical` | 100% | 100% | sí |
| Pass rate de CPs `high` | ≥ 80% | ≥ 95% | sí |
| Flaky rate | ≤ 10% | ≤ 5% | sí |
| Defectos sin clasificar | 0 | 0 | sí |
| Bugs `critical` sin promover | 0 | 0 | sí |
| Bugs `high` sin promover | 0 | 0 | sí |
| Regresiones nuevas vs baseline | n/a | ≤ 0 | sí (solo regression/fast-track) |

## Proceso

1. Calcular cada métrica del `execution_results` y `defects_summary`.
2. Comparar contra el threshold aplicable según `cycle.type`.
3. Para cada métrica, registrar:
   - Valor observado
   - Threshold
   - Resultado: `pass` | `fail`
4. Si **alguna** métrica bloqueante falla → veredicto global `FAIL`.
5. Si todas pasan → veredicto global `PASS`.
6. Producir `qgs-evaluation.json`.

## Output

```json
{
  "run_id": "{run_id}",
  "cycle_type": "baseline",
  "verdict": "PASS | FAIL",
  "evaluated_at": "{ISO 8601}",
  "metrics": [
    {
      "metric": "pass_rate_global",
      "observed": 70.4,
      "unit": "pct",
      "threshold": 70.0,
      "threshold_operator": ">=",
      "result": "pass",
      "blocking": true
    },
    {
      "metric": "pass_rate_critical",
      "observed": 100.0,
      "unit": "pct",
      "threshold": 100.0,
      "threshold_operator": ">=",
      "result": "pass",
      "blocking": true,
      "_note": "0 CPs critical en esta corrida — pasa por defecto"
    },
    {
      "metric": "pass_rate_high",
      "observed": 77.8,
      "unit": "pct",
      "threshold": 80.0,
      "threshold_operator": ">=",
      "result": "fail",
      "blocking": true
    },
    {
      "metric": "flaky_rate",
      "observed": 7.4,
      "unit": "pct",
      "threshold": 10.0,
      "threshold_operator": "<=",
      "result": "pass",
      "blocking": true
    },
    {
      "metric": "defects_unclassified",
      "observed": 0,
      "unit": "count",
      "threshold": 0,
      "threshold_operator": "==",
      "result": "pass",
      "blocking": true
    },
    {
      "metric": "bugs_high_not_promoted",
      "observed": 4,
      "unit": "count",
      "threshold": 0,
      "threshold_operator": "==",
      "result": "fail",
      "blocking": true,
      "_note": "el pipeline clasificó 4 bugs high pero ninguno fue promovido aún — el backlog-sync los procesará"
    }
  ],
  "blocking_failures": [
    "pass_rate_high observado 77.8% < threshold 80%",
    "bugs_high_not_promoted observado 4 > threshold 0 (pendientes de promoción via backlog-sync)"
  ],
  "non_blocking_observations": [
    "Flaky rate 7.4% — cerca del umbral pero dentro de tolerancia. Investigar tendencia en próximas corridas."
  ],
  "next_action": "El cierre del Step 7 está bloqueado hasta que: (1) los 4 bugs high sean promovidos por backlog-sync, (2) se decida si el pass rate de 77.8% es aceptable (requiere fix o ajuste de prioridades)."
}
```

## Reglas duras

1. **Veredicto binario.** PASS o FAIL — sin valores intermedios.
2. **Threshold aplicable según cycle.type.** Regression es más estricto que baseline.
3. **Métricas sin opinar.** El skill no interpreta — solo compara observado vs threshold.
4. **Observaciones no bloqueantes** se registran pero no afectan el veredicto.
5. **Si `cycle.type: baseline` y `flaky_rate > 10%`** → FAIL automático (señal de problemas sistémicos).

## Cuándo NO invocar

- No hay defectos clasificados (`failure-classifier` no completado) — abortar
- Tarea LIGHT — el QGS no se evalúa para acciones puntuales

## Anti-patterns

- **PASS condicional** ("PASS si se corrige X"). Si requiere acción, es FAIL.
- **Subir thresholds para "que pase"**. Los thresholds se ajustan estratégicamente entre corridas, no para forzar un PASS.
- **Ignorar observaciones recurrentes.** Si flaky rate aparece cerca del umbral 3 corridas seguidas → escalar.
- **PASS sin promover bugs.** El backlog-sync corre después; si hay bugs sin promover, el QGS los detecta y bloquea.

## Referencias

- Template: `templates/qgs-evaluation.template.json`
- Ejemplo: `examples/example-qgs-fail.json`
- Regla relacionada: `.claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Defect Classification) → DEF-007`
