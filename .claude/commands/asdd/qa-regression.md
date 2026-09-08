---
description: Regresión ATF API contra un baseline_run_id — ejecuta solo las fases afectadas por el delta del contrato.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar un ciclo de **Regresión**.

## Prerrequisitos

En `docs/testing/atf/config/appapi.yaml`:

- `cycle.type: regression`
- `cycle.baseline_run_id: "{run_id-anterior}"`
- `app.version` apuntando a la versión nueva

## Instrucciones

1. Invocar `@asdd-atf-api-qa-engineer` (entra por **Fase 0 — Intake & Routing**; el `cycle.type` activa la lógica de regresión).
2. El pipeline:
   - Lee el baseline en `docs/output/{baseline_run_id}/`
   - Compara contrato actual vs baseline (`step-2-contract-delta-detector`)
   - Si `delta_status: unchanged` → sugerir `/asdd:qa-fast-track` en lugar de regresión completa
   - Si `delta_status: minor` → ejecutar Fase 2 + Fase 3B + Fase 5 (omite plan completo, re-genera casos afectados)
   - Si `delta_status: major` → ejecutar pipeline completo + plan-gate humano (ORC-010)
3. Reutilizar `functional-spec` del baseline si no cambió.
4. Reportar **delta de resultados** vs baseline (regresiones, fixes, casos nuevos) en el handoff a Reporting.

## Artefactos esperados

Mismo set que pipeline completo + `docs/qa/atf/{run_id}/regression-delta.md` con comparación contra baseline (generado por el agente de Reporting).

## Siguiente paso

`/asdd:qa-report`
