---
description: ATF API fase Analyze — revisión funcional y contexto técnico por WI. Produce functional-spec y api-context con delta.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar la fase **Analyze** del workflow ATF API.

## Prerrequisito

`run-manifest.md` con WIs definidos (output de `/sofka-asdd:qa-bootstrap`).

## Instrucciones

1. Invocar `@sofka-asdd-atf-api-qa-engineer` con scope **Fase 2 (Analyze)**.
2. El pipeline ejecuta por cada WI **en paralelo**:
   - **Sub-fase 2A — Funcional:** `step-1-hu-parser` → `step-1-acceptance-criteria-normalizer` → `step-1-gap-detector`. Produce `functional-spec` con RN numeradas, criterios Given/When/Then y gaps `Q-NNN`.
   - **Sub-fase 2B — Técnica:** `step-2-openapi-parser` → `step-2-contract-hasher` → `step-2-contract-delta-detector`. Produce `api-context` con `contract_hash` (SHA-256) y `delta_status`.
3. **Gate de salida (ORC-010):** si `delta_status: major` (>30% cambio vs baseline) → detener y solicitar plan-gate humano. Documentar aprobación en `run-manifest.md → plan_gate_approved_by`.
4. Actualizar checkpoint: `steps_completed += [step_1, step_2]`.
5. Escribir `context_summary.json` post-Fase 2.

## Artefactos esperados por WI

- `docs/testing/atf/{run_id}/functional-spec/wi-{N}-functional-spec.md`
- `docs/testing/atf/{run_id}/api-context/wi-{N}-api-context.json`

## Siguiente paso

`/sofka-asdd:qa-design`
