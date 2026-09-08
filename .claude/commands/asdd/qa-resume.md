---
description: Reanuda una corrida ATF API interrumpida desde checkpoint.json y context_summary.json.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Reanudar una corrida ATF API interrumpida.

## Prerrequisito

`run_id` declarado en `docs/testing/atf/config/appapi.yaml` o pasado explícitamente. Debe existir `docs/testing/atf/{run_id}/checkpoint.json`.

## Instrucciones

1. Invocar `@asdd-atf-api-qa-engineer` (entra por **Fase 0 — Intake & Routing**).
2. El pipeline ejecuta el protocolo de reanudación (`CHKPT-006`):
   - Lee `checkpoint.json`
   - Si `status: completed` → notificar y ofrecer nueva corrida o ver reporte (`/asdd:qa-report` si aún no se generó)
   - Si `status: ready_for_report` → sugerir `/asdd:qa-report` (no es responsabilidad del pipeline)
   - Si `status: blocked` → mostrar bloqueo, preguntar resolución
   - Si `status: rate_limited | in_progress | partial`:
     - Lee `context_summary.json` para compactar contexto recuperado
     - Muestra al usuario: estado, fases completadas, próxima fase, WIs pendientes
     - Salta a `next_step` sin re-ejecutar lo completado
     - Actualiza `status: in_progress`, registra transición en `state_transitions[]`
3. Continúa el pipeline normalmente desde el punto recuperado.

## Sin riesgo

La reanudación es **idempotente** — ejecutar `/asdd:qa-resume` 2 veces produce el mismo resultado. Las unidades en `completed_units[]` nunca se re-procesan.

## Si no existe checkpoint

El pipeline notifica que no hay corrida que reanudar y sugiere `/asdd:qa-bootstrap` para iniciar una nueva.
