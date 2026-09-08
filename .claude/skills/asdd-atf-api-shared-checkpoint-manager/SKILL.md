---
name: asdd-atf-api-shared-checkpoint-manager
description: Ciclo de vida de checkpoint.json y context_summary.json en ATF API — escritura atómica, transiciones y resume-prompt.
used_by:
  - asdd-atf-api-orchestrator
  - asdd-atf-api-step-1-requirement-review
  - asdd-atf-api-step-2-api-context
  - asdd-atf-api-step-3-test-plan
  - asdd-atf-api-step-4-test-cases
  - asdd-atf-api-step-5-automation
  - asdd-atf-api-step-6-execution
  - asdd-atf-reporting-qa-engineer
  - asdd-atf-api-security
  - asdd-atf-api-performance
---

## Propósito

Garantizar que **toda transición de estado del pipeline** se persista en disco de forma atómica antes de avanzar. Implementa los 7 sub-protocolos `CHKPT-001` a `CHKPT-007` definidos en `.claude/rules/asdd-atf-api-qa-engineer.md (sección: ATF API Checkpoint & Resume)`.

Ningún agente escribe directamente sobre `checkpoint.json` — todos invocan operaciones de este skill.

## Cuándo invocar

| Evento | Operación |
|---|---|
| Inicio de corrida nueva | `create` |
| Reanudar corrida existente | `read` + `transition` |
| Inicio de step | `start_step` |
| Fin de step exitoso | `mark_step_complete` |
| Fin de WI | `mark_wi_complete` |
| Señal de rate limit | `mark_rate_limited` + `write_partial` |
| Pregunta crítica sin respuesta | `mark_blocked` |
| Post-step-2 / post-step-4 / post-step-6 | `write_context_summary` |
| Final del Step 7 | `mark_completed` |

## Operaciones

### `create(run_id, initial_state)`

Crea un nuevo `checkpoint.json` para una corrida que inicia.

**Inputs:** `run_id`, `app_url`, `cycle_type`, `baseline_run_id` (si aplica), `work_items[]`

**Output:** path al checkpoint creado.

**Falla si:** ya existe `checkpoint.json` para ese `run_id` y `status: in_progress` — en ese caso, devuelve error y sugiere `read` para reanudar.

### `read(run_id)`

Lee y valida `checkpoint.json`. Si no existe, retorna `null`.

**Output:** objeto checkpoint completo (ver schema en `templates/checkpoint.template.json`).

### `transition(run_id, from, to, by, reason)`

Cambia `status` y registra la transición en `state_transitions[]`.

**Transiciones válidas:**

```text
null               → in_progress       (crear)
in_progress        → rate_limited      (señal de rate limit)
in_progress        → blocked           (pregunta crítica)
in_progress        → completed         (Step 7 OK)
in_progress        → partial           (artefacto interrumpido)
rate_limited       → in_progress       (reanudar)
blocked            → in_progress       (bloqueo resuelto)
partial            → in_progress       (artefacto retomado)
```

**Transiciones inválidas:** retornar error `CHKPT-INVALID-TRANSITION`.

### `start_step(run_id, step_id)`

Actualiza `current_phase`, `next_step` y registra timestamp de inicio en `step_history[]`.

### `mark_step_complete(run_id, step_id, artifacts_paths[])`

Mueve el step a `steps_completed`, actualiza `next_step`, registra `artifacts_paths[]` para trazabilidad.

### `mark_wi_complete(run_id, wi_id)`

Mueve el WI de `work_items.pending[]` a `work_items.completed[]`.

### `mark_rate_limited(run_id, by, reason)`

Equivale a `transition(in_progress → rate_limited)` + invoca `write_resume_prompt`.

### `write_partial(run_id, step_id, completed_units[], pending_units[], artifact_path)`

Escribe un artefacto en estado `partial` con header de interrupción. Llamado por `asdd-atf-api-shared-rate-limit-protocol`.

### `mark_blocked(run_id, blocker_id, blocker_description)`

Cambia `status: blocked` y registra en `blockers[]`.

### `mark_completed(run_id, summary_metrics)`

Cambia `status: completed`, registra `completed_at`, escribe entrada en `docs/testing/atf/runs_index.json`.

### `write_context_summary(run_id, summary_at_step, payload)`

Escribe `context_summary.json` (versión comprimida del estado, útil al retomar en chat nuevo).

### `write_resume_prompt(run_id)`

Genera `resume-prompt.md` con instrucciones explícitas para retomar la corrida en un nuevo chat.

## Garantías de atomicidad

Toda escritura sigue el patrón **write-and-rename**:

```text
1. Escribir contenido a {path}.tmp
2. fsync (forzar flush a disco)
3. Renombrar {path}.tmp → {path}  (atómico a nivel de filesystem)
```

Si el proceso muere entre 1 y 3, queda el archivo viejo intacto. Nunca queda un checkpoint corrupto a medio escribir.

## Idempotencia

- `read(run_id)` 2 veces → mismo resultado
- `mark_step_complete(step_id)` 2 veces → 2da llamada es no-op (step ya está en `steps_completed`)
- `transition(...)` repetida con mismos parámetros → registra una sola entrada en `state_transitions[]` (dedup por `from + to + by + at` con resolución de minuto)

## Errores comunes

| Código | Mensaje | Causa |
|---|---|---|
| `CHKPT-001` | `Run already in progress` | Intento de `create` sobre `run_id` con `status: in_progress` |
| `CHKPT-002` | `Run not found` | `read` sobre `run_id` sin checkpoint |
| `CHKPT-INVALID-TRANSITION` | `Transition {from}→{to} not allowed` | Transición fuera del grafo válido |
| `CHKPT-005` | `Concurrent write detected` | Otro proceso modificó el archivo entre lectura y escritura — reintentar |

## Cuándo NO invocar

- Tarea LIGHT vía `/asdd:qa-do` — no se crea checkpoint formal (ver `routing-light-vs-full.md`)
- Consulta de progreso → leer `checkpoint.json` directo con `Read`, no necesita pasar por el skill
- Inspección histórica de runs viejos → leer `docs/testing/atf/runs_index.json`

## Anti-patterns

- **Escribir `checkpoint.json` sin write-and-rename** — riesgo de corrupción si el proceso muere
- **Saltar `mark_step_complete`** — si no se persiste, al reanudar se re-ejecuta el step
- **Mutar `state_transitions[]` borrando entradas** — el historial es append-only para trazabilidad
- **Mezclar context_summary con checkpoint** — checkpoint es estado operativo; summary es contexto comprimido para retomar
- **Re-escribir `runs_index.json` completo** — usar append/merge, no overwrite

## Referencias

- Templates: `templates/checkpoint.template.json`, `templates/context-summary.template.json`, `templates/resume-prompt.template.md`
- Ejemplos: `examples/checkpoint-in-progress.json`, `examples/checkpoint-rate-limited.json`
- Regla relacionada: `.claude/rules/asdd-atf-api-qa-engineer.md (sección: ATF API Checkpoint & Resume)`
