# Resume — {run_id}

La corrida se interrumpió el **{interrupted_at}** por **{reason}**.

## Estado al momento de la interrupción

- **Status:** `{status}` (rate_limited | partial | blocked)
- **Fase actual:** `{current_phase}`
- **Step en curso:** `{current_step}`
- **Próximo step:** `{next_step}`
- **WI en progreso:** `{wi_in_progress}` (si aplica)

## Progreso

| Step | Estado |
|---|---|
| step_0_orchestrator | ✅ Completado |
| step_1_requirement_review | ✅ Completado |
| step_2_api_context | ✅ Completado |
| step_3_test_plan | ✅ Completado |
| step_4_test_cases | ⚠️ Parcial — completados: CP-001, CP-002; pendientes: CP-003 a CP-005 |
| step_5_automation | ⏸️ Pendiente |
| step_6_execution | ⏸️ Pendiente |
| step_7_reporting | ⏸️ Pendiente |

## Artefactos generados hasta ahora

- `docs/testing/atf/{run_id}/run-manifest.md`
- `docs/testing/atf/{run_id}/functional-spec/`
- `docs/testing/atf/{run_id}/api-context/`
- `docs/testing/atf/{run_id}/test-plan/`
- `docs/testing/atf/{run_id}/test-cases/wi-002-test-cases.json` (parcial)

## Para reanudar

1. Abrir un chat nuevo en este proyecto.
2. Asegurarse de que `docs/testing/atf/config/appapi.yaml → run_id` apunte a `{run_id}`.
3. Ejecutar: `/sofka-asdd:qa-resume`

El pipeline (`sofka-asdd-atf-api-qa-engineer`) detectará el checkpoint en Fase 0 (Intake & Routing), leerá este resume-prompt y el context_summary, y retomará desde **{next_step}** sin re-ejecutar lo completado.

## Si la corrida no debe continuar

- Para iniciar una corrida nueva (descartando esta) → cambiar `run_id` en `appapi.yaml` y ejecutar `/sofka-asdd:qa-bootstrap`.
- Para inspeccionar y decidir → leer `checkpoint.json` y los artefactos parciales antes de actuar.

---
*Generado automáticamente por `sofka-asdd-atf-api-shared-checkpoint-manager` el {generated_at}.*
