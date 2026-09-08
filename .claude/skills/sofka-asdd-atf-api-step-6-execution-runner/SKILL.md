---
name: sofka-asdd-atf-api-step-6-execution-runner
description: Ejecuta los .spec.ts, captura evidencia y re-corre cada fallo una vez para detectar flaky. NO clasifica defectos.
used_by:
  - sofka-asdd-atf-api-step-6-execution
---

## Propósito

Correr la suite de tests automatizados de forma controlada y producir el `execution-results.json` con todos los resultados normalizados. Es el primer skill de la Fase 5 (Execute) por WI.

**Principio:** este skill solo **ejecuta y observa** — NO decide si un fallo es bug, env_issue o flaky. Esa decisión la toma `failure-classifier`.

## Cuándo invocar

Tras Step 5 completo (specs generados). Una invocación por corrida — internamente itera sobre WIs en orden topológico definido por el `dependency-map`.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `run_id` | string | Run ID |
| `automation_path` | string | Path a `docs/testing/atf/{run_id}/automation/` |
| `dependency_map` | object | Para orden de ejecución entre WIs |
| `test_run` | object | De session_config: `mode`, `custom_tags`, `custom_flow_scope` |
| `regression_baseline_results` | object | (opcional) Resultados del baseline para comparación |

## Filtro de suite según `test_run.mode`

| Mode | Filtro Playwright |
|---|---|
| `smoke` | `--grep @smoke` |
| `regression` | `--grep "@smoke|@regression"` |
| `critical` | `--grep @critical-flow` |
| `full` | sin filtro (toda la suite) |
| `custom` | `--grep` con `custom_tags` concatenados con `|` |

## Proceso

1. **Validación previa.** Verificar que `automation/specs/` tiene `.spec.ts` para los WIs esperados. Si faltan → `EXEC-001`.

2. **Instalación de dependencias.** Si `node_modules/` no existe en `automation/`, ejecutar `bun install`.

3. **Ejecución por WI** (orden topológico):
   - Por cada WI, correr `playwright test` con filtro de mode.
   - Capturar `playwright-results.json` (formato estándar Playwright).
   - Convertir a formato canónico ATF.

4. **Re-ejecución de fallos (flaky detection).**
   - Cada test con `status: failed` se re-ejecuta exactamente 1 vez.
   - Si la 2da ejecución pasa → marcar como `flaky` (NO promueve al backlog, solo se reporta).
   - Si vuelve a fallar → mantener `failed` (queda para `failure-classifier`).
   - Solo 1 retry — NO entrar en loop.

5. **Captura de evidencias.** Cada test (pass, fail, flaky) tiene evidencia capturada por el helper `evidence-helper.ts` (que invoca `shared-evidence-collector`).

6. **Agregación de resultados.** Producir `execution-results.json` canónico.

7. **Checkpoint.** Invocar `shared-checkpoint-manager → mark_step_complete(step_6_execution, artifacts_paths)`.

## Output

```json
{
  "run_id": "{run_id}",
  "test_run_mode": "full",
  "started_at": "{ISO 8601}",
  "completed_at": "{ISO 8601}",
  "duration_seconds": 540,
  "execution_environment": {
    "node_version": "20.x",
    "bun_version": "1.1.x",
    "playwright_version": "1.50.x",
    "platform": "win32|linux|darwin",
    "ci": false
  },
  "wis_executed": ["wi-001", "wi-002", "wi-003"],
  "summary": {
    "total_cps": 27,
    "passed": 19,
    "failed_first_run": 8,
    "passed_on_retry_flaky": 2,
    "failed_after_retry": 6,
    "flaky_rate_pct": 7.4,
    "by_priority": {"critical": {"total": 0}, "high": {"total": 18, "passed": 14, "failed": 4}, "medium": {"total": 9, "passed": 5, "failed": 2, "flaky": 2}},
    "by_wi": {"wi-001": {"total": 9, "passed": 7, "failed": 2}, "...": "..."}
  },
  "results_per_cp": [
    {
      "cp_id": "CP-001",
      "wi_id": "wi-001",
      "status": "passed | failed | flaky",
      "first_run_status": "passed | failed",
      "retry_run_status": "passed | failed | not_executed",
      "duration_ms": 134,
      "evidence_path": "docs/testing/atf/{run_id}/execution/evidence/CP-001/",
      "failure_details": {
        "assertion_failed": "{si aplica}",
        "actual": "{si aplica}",
        "expected": "{si aplica}",
        "stack_trace_redacted": "{si aplica}"
      },
      "tags": ["@happy-path", "@critical-flow"],
      "rules_covered": ["RN-001", "RN-008"]
    }
  ],
  "regression_delta_vs_baseline": null,
  "next_step": "sofka-asdd-atf-api-step-6-failure-classifier"
}
```

Para `regression`:

```json
"regression_delta_vs_baseline": {
  "baseline_run_id": "{run_id_baseline}",
  "new_failures_vs_baseline": ["CP-007"],
  "fixed_vs_baseline": ["CP-002"],
  "still_failing": ["CP-014"],
  "still_passing": 16
}
```

## Reglas duras

1. **Máximo 1 retry por fallo.** Loops infinitos están prohibidos.
2. **Evidencia para todos los CPs** (pass también, no solo fail). Sin excepciones.
3. **No clasificar defectos.** Si un test falla, queda `status: failed` y se pasa a `failure-classifier`.
4. **No ejecutar entre WIs en paralelo si hay dependencia topológica.** Respetar el orden del `dependency_map`.
5. **No correr en producción.** Validar `session_config.app.environment !== 'production'` antes de arrancar — si es prod, abortar con `EXEC-002` y exigir confirmación explícita del usuario.

## Errores comunes

| Código | Causa |
|---|---|
| `EXEC-001` | Specs faltantes para WIs declarados |
| `EXEC-002` | Intento de ejecución contra `environment: production` sin override explícito |
| `EXEC-003` | `bun install` falla — credenciales NPM o red sin acceso |
| `EXEC-004` | Test crash (no fail, sino excepción de Playwright) — registrar como `error` distinto a `failed` |

## Cuándo NO invocar

- `retest` que cubre solo 1 CP — invocar con `cp_filter` específico, no la suite completa
- Cuando ya hay resultados frescos y se quiere consultar — leer `execution-results.json`

## Anti-patterns

- **Retries múltiples** (>1) para "estabilizar" tests flaky. Flaky es señal que se reporta, no se oculta.
- **Saltar tests "porque seguramente fallan".** Si no se ejecutan, no se sabe.
- **Mezclar resultados de modes distintos** en el mismo archivo. Una corrida = un mode.
- **Continuar la ejecución cuando el `automation/` está corrupto.** Si las specs no compilan, abortar.

## Referencias

- Template: `templates/execution-results.template.json`
- Ejemplo: `examples/example-execution-results-clienteejemplo.json`
