---
description: ATF API fase Design — plan ISTQB y diseño de casos. Produce test-plan, test-cases.json y vista Gherkin.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar la fase **Design** del workflow ATF API.

## Prerrequisito

`functional-spec` y `api-context` aprobados (output de `/asdd:qa-analyze`).

## Instrucciones

1. Invocar `@asdd-atf-api-qa-engineer` con scope **Fase 3 (Design)**.
2. El pipeline ejecuta por cada WI:
   - **Sub-fase 3A — Test Plan:** `step-3-istqb-test-techniques` (técnicas BVA/EP/DT/ST justificadas por endpoint) → `step-3-risk-scorer-api` (matriz probabilidad × impacto). Produce `test-plan` con técnicas seleccionadas y criterios entry/exit ISTQB.
   - **Sub-fase 3B — Test Cases:** `step-4-test-case-designer` (CPs concretos por WI) → `step-4-test-data-generator-api` (fixtures válidas/inválidas) → `step-4-gherkin-writer-api` (vista `.feature`). Cada CP es atómico, trazable a RN y AC, con request/response esperados explícitos.
3. **Sub-fase 3A debe completarse antes de Sub-fase 3B** (los CPs dependen del catálogo de técnicas y del scoring de riesgo).
4. Actualizar checkpoint: `steps_completed += [step_3, step_4]`.
5. Escribir `context_summary.json` post-Fase 3.

## Artefactos esperados por WI

- `docs/testing/atf/{run_id}/test-plan/wi-{N}-test-plan.md`
- `docs/testing/atf/{run_id}/test-cases/wi-{N}-test-cases.json`
- `docs/testing/atf/{run_id}/test-cases/wi-{N}-test-cases.feature`

## Siguiente paso

`/asdd:qa-automate`
