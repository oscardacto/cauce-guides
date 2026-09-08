---
description: Ruta LIGHT de ATF API — delega una tarea puntual a UN skill, sin activar el pipeline completo.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task]
argument-hint: "{descripción de la tarea entre comillas}"
---

Ejecutar una tarea **LIGHT** (un solo skill, sin pipeline).

## Cuándo usar este comando

Tareas puntuales que NO requieren bootstrap, work items ni checkpoint formal. Ej:

- `/sofka-asdd:qa-do "regenera el hash del contrato actual"`
- `/sofka-asdd:qa-do "reclasifica el defecto D-007 como env_issue, evidencia: timeout de red"`
- `/sofka-asdd:qa-do "muestra los CPs del endpoint POST /quotas"`
- `/sofka-asdd:qa-do "valida la estructura del Swagger sin generar casos"`
- `/sofka-asdd:qa-do "regenera solo el script k6 stress del endpoint nuevo"`

## Instrucciones

1. Invocar `@sofka-asdd-atf-api-qa-engineer` (entra por **Fase 0 — Intake & Routing**).
2. El pipeline clasifica la tarea según `sofka-asdd-atf-api-qa-engineer.md (embedded: ATF API Routing LIGHT vs FULL)`:
   - Si califica como LIGHT → identificar el skill único que cubre la tarea y delegar con scope acotado (sin entrar al playbook completo)
   - Si NO califica como LIGHT (toca múltiples skills, hard_exclusion, ambigüedad) → escalar a FULL y sugerir el slash command apropiado
3. El skill ejecuta la tarea y retorna resultado.
4. Si el pipeline detecta complejidad oculta durante la ejecución → escala a FULL (`ORC-001-C`).

## Garantías LIGHT

- No crea `run_id` ni `checkpoint.json` formal
- No escribe en `runs_index.json`
- Si genera artefactos, los escribe bajo `docs/output/light-ops/{timestamp}/` (no contamina runs formales)

## Fail-safe

Ante duda sobre si la tarea es LIGHT → el pipeline escala a FULL y sugiere el `/sofka-asdd:qa-{fase}` correspondiente.
