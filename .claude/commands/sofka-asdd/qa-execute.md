---
description: ATF API fase Execute — corre los specs con evidencias, re-ejecuta fallos para detectar flaky y clasifica defectos.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task]
---

Ejecutar la fase **Execute** del workflow ATF API.

## Prerrequisito

`automation-manifest.json` con `.spec.ts` generados (output de `/sofka-asdd:qa-automate`).

## Instrucciones

1. **Plan-gate (ORC-010):** si aplica.
2. Invocar `@sofka-asdd-atf-api-qa-engineer` con scope **Fase 5 (Execute)**.
3. El pipeline ejecuta:
   - `step-6-execution-runner` → corre la suite filtrada por `test_run.mode` (smoke/regression/critical/full/custom), re-ejecuta cada fallo 1 vez para detectar `flaky`
   - `shared-evidence-collector` → captura request/response/headers/timings con secretos redactados por cada CP
   - `step-6-failure-classifier` → clasifica cada defecto según `sofka-asdd-atf-api-qa-engineer.md (embedded: ATF API Defect Classification)` (`bug` / `precondition` / `env_issue` / `script_issue` / `flaky`)
4. **Cierre del pipeline:** actualizar `checkpoint.json → status: "ready_for_report"` y persistir conocimiento incremental vía `shared-knowledge-base-writer`.
5. Escribir `context_summary.json` post-Fase 5.

## Artefactos esperados

- `docs/testing/atf/{run_id}/execution/execution-results.json`
- `docs/testing/atf/{run_id}/execution/defects/D-NNN.json` por cada defecto
- `docs/testing/atf/{run_id}/execution/evidence/D-NNN/` con evidencias redactadas

## Siguiente paso

`/sofka-asdd:qa-report` — invoca al agente de Reporting (separado para reutilización cross-ATF).
