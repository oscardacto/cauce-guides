---
description: Ciclo rápido ATF API cuando el contrato no cambió — reutiliza plan y specs del baseline y salta diseño y automatización.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar un ciclo **Fast-Track**.

## Prerrequisitos

En `docs/testing/atf/config/appapi.yaml`:

- `cycle.type: fast-track`
- `cycle.baseline_run_id: "{run_id-anterior}"`

## Validación de elegibilidad

Fast-track **solo es válido** si:

- `step-2-contract-delta-detector` reporta `delta_status: unchanged` (mismo `contract_hash`)
- El baseline tiene Fases 3 y 4 completas y aprobadas

Si la validación falla → escalar a `/asdd:qa-regression`.

## Instrucciones

1. Invocar `@asdd-atf-api-qa-engineer` (entra por **Fase 0 — Intake & Routing**; `cycle.type: fast-track` activa la lógica).
2. El pipeline:
   - Verifica elegibilidad (hash idéntico al baseline)
   - Reutiliza `test-plan`, `test-cases` y `automation` del baseline
   - Activa solo Fases 1, 2 (revisión funcional ligera + validación de contrato) y Fase 5 (ejecución)
3. El reporte indica explícitamente "Fast-track desde `{baseline_run_id}`" (generado por el agente de Reporting).

## Artefactos esperados

- `run-manifest.md`, `functional-spec` (opcionalmente reutilizada), `api-context` (validado igual)
- `execution-results.json`, `final-report.md`
- **No genera** test-plan ni test-cases nuevos (reutiliza baseline)

## Siguiente paso

`/asdd:qa-report`
