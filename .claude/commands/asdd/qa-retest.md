---
description: Re-ejecución dirigida de UN defecto ATF API, sin correr la suite completa.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task]
---

Ejecutar un ciclo **Retest** de un defecto.

## Prerrequisitos

En `docs/testing/atf/config/appapi.yaml`:

- `cycle.type: retest`
- `cycle.baseline_run_id: "{run_id-anterior}"`
- `cycle.defect_id: "D-NNN"`

## Instrucciones

1. Invocar `@asdd-atf-api-qa-engineer` (entra por **Fase 0 — Intake & Routing**; `cycle.type: retest` activa la lógica acotada).
2. El pipeline:
   - Localiza `docs/output/{baseline_run_id}/execution/defects/D-NNN.json`
   - Identifica el CP asociado al defecto
   - Activa solo **Fase 5 (Execute)** con scope acotado al spec correspondiente vía `step-6-execution-runner`
   - Captura nueva evidencia vía `shared-evidence-collector`
   - Reporta:
     - Si pasa ahora → marca el defecto como `resolved` y referencia el nuevo `run_id` en `defects_history[]`
     - Si sigue fallando → re-clasifica vía `step-6-failure-classifier` si la naturaleza del fallo cambió
3. Genera mini-reporte de retest.

## Artefactos esperados

- `docs/testing/atf/{run_id}/retest/retest-D-NNN-result.json`
- Actualización del defecto en el baseline con `defects_history[]`
