---
name: asdd-atf-api-shared-rate-limit-protocol
description: Pausa ordenada ante señales de rate limit, persistiendo el estado parcial antes de detenerse.
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

Detener ordenadamente cualquier agente que detecte señales de rate limit, **garantizando no perder el trabajo parcial** y dejando todo listo para reanudar en un chat nuevo. Implementa los 5 sub-protocolos `RL-001` a `RL-005` definidos en `.claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Rate Limit Protocol)`.

Ningún agente "improvisa" su propio manejo de rate limit — todos delegan en este skill.

## Cuándo invocar

Inmediatamente al detectar cualquiera de estas señales (`RL-001`):

- Mensaje del sistema indicando `tokens approaching limit`
- Respuesta `429` o `rate_limit_exceeded` de la API de Claude
- El agente detecta internamente que su próxima operación superará un umbral seguro
- El usuario lo solicita explícitamente (`pausa la corrida`)

## Operación: `pause(agent_name, run_id, current_step, completed_units, pending_units, partial_artifact_content)`

Ejecuta el protocolo completo de pausa en 5 fases.

### Fase 1 — Escribir artefacto parcial

Persiste lo trabajado hasta el momento con header de interrupción:

```json
{
  "status": "partial",
  "interrupted_at": "{ISO 8601}",
  "interrupted_by": "{agent_name}",
  "reason": "rate_limit_signal | user_requested | internal_threshold",
  "completed_units": ["{ID-1}", "{ID-2}"],
  "pending_units": ["{ID-3}", "{ID-4}", "{ID-5}"],
  "...resto del contenido del artefacto..."
}
```

Path: el que iba a escribir el agente normalmente, sin sufijo. La presencia de `status: partial` lo identifica.

### Fase 2 — Actualizar checkpoint

Invocar `asdd-atf-api-shared-checkpoint-manager → transition(run_id, "in_progress" → "rate_limited", by=agent_name, reason="token_limit_signal")`.

Adicionalmente registra en `step_history[]` el step parcial con `completed_units` y `pending_units`.

### Fase 3 — Escribir `resume-prompt.md`

Invocar `asdd-atf-api-shared-checkpoint-manager → write_resume_prompt(run_id)`.

El resume-prompt explica al usuario en lenguaje claro qué pasó, qué quedó hecho y cómo continuar.

### Fase 4 — Notificar al orquestador

Emitir mensaje estructurado al orquestador (sesión principal):

```text
→ **@{agent_name}** — RATE LIMIT DETECTADO
   Run ID            : {run_id}
   Step interrumpido : {current_step}
   Unidades hechas   : {completed_units.length} de {total}
   Artefacto parcial : {path}
   Checkpoint        : status=rate_limited
   Resume prompt     : docs/testing/atf/{run_id}/resume-prompt.md
   Acción sugerida   : el usuario debe abrir un chat nuevo y ejecutar /asdd:qa-resume
```

### Fase 5 — Detenerse

El agente **NO** intenta:
- Continuar procesando unidades pendientes
- Re-intentar la operación que falló
- Limpiar artefactos parciales
- Notificar al usuario (eso lo hace el orquestador con el mensaje anterior)

Simplemente retorna `{status: paused, resume_point: ...}` al orquestador y termina su ejecución.

## Operación: `resume(agent_name, run_id)`

Reanuda el trabajo parcial del agente. Llamado por el orquestador cuando recupera de checkpoint.

1. Leer el artefacto parcial (`status: partial`)
2. Validar coherencia `completed_units[]` + `pending_units[]`
3. Procesar **solo `pending_units[]`**
4. Al completar, sobreescribir el artefacto con la versión final:
   ```json
   {
     "status": "complete",
     "completed_at": "{ISO 8601}",
     "interrupted_at": "2026-05-21T11:02:30-05:00",
     "resumed_at": "2026-05-21T11:15:00-05:00",
     "completed_units_history": ["pre-interruption: CP-001, CP-002", "post-resume: CP-003, CP-004, CP-005"]
   }
   ```
5. Invocar checkpoint-manager → `transition(run_id, "rate_limited" → "in_progress")` y `mark_step_complete(...)`

## Garantías

- **No pérdida:** ninguna unidad procesada antes de la pausa se pierde
- **No duplicación:** unidades en `completed_units[]` nunca se re-procesan al reanudar
- **No corrupción:** todas las escrituras usan write-and-rename del checkpoint-manager
- **Trazabilidad:** la transición queda registrada con timestamp + agente responsable

## Errores comunes

| Código | Mensaje | Causa |
|---|---|---|
| `RL-001` | `Cannot pause: no current_step` | Llamada a `pause` sin step activo |
| `RL-002` | `Partial artifact has no pending_units` | Pausa sin trabajo pendiente — no debería ocurrir |
| `RL-003` | `Resume failed: partial artifact malformed` | Artefacto parcial sin `completed_units`/`pending_units` válidos |
| `RL-004` | `Checkpoint transition rejected` | Transición inválida — investigar estado del checkpoint |

## Cuándo NO invocar

- Errores funcionales del agente (no rate-limit) — no usar este skill; reportar error y dejar que el orquestador decida
- Pausa solicitada en LIGHT ops via `/asdd:qa-do` — LIGHT no usa checkpoint formal, se aborta directamente
- Reanudación automática en el mismo chat — el protocolo está diseñado para retomar en chat NUEVO

## Anti-patterns

- **Reintentar en loop** ante una señal de rate limit. Pausar y notificar.
- **Descartar trabajo parcial** porque "se va a regenerar". Siempre persistir.
- **Cambiar de step durante la interrupción**. La reanudación retoma el mismo step.
- **Borrar el resume-prompt al reanudar.** Renombrarlo a `resume-prompt.{timestamp}.archived.md` para historial.
- **Pausar sin notificar al orquestador.** El usuario quedaría sin saber que la corrida está pausada.

## Referencias

- Templates: `templates/partial-artifact-header.template.json`
- Ejemplos: `examples/partial-test-cases.json`
- Regla relacionada: `.claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Rate Limit Protocol)`
- Skill colaborador: `asdd-atf-api-shared-checkpoint-manager`
