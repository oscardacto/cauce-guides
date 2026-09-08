---
name: sofka-asdd-atf-web-rate-limit-handler
description: Detecta agotamiento de la ventana de tokens, preserva checkpoint y ofrece opciones de reanudación.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

# sofka-asdd-atf-web-rate-limit-handler

## Señales de rate limit

Cualquiera de estos patrones en la respuesta de una tool invocada por el orchestrator:

- Texto `"Límite alcanzado"`
- Texto `"Rate limit exceeded"`
- Código HTTP `429`
- Texto `"overloaded"`
- Tool call que retorna error y no produce el output esperado

---

## Modo DETECT-AND-PAUSE

Invocar como:
```
[SKILL: sofka-asdd-atf-web-rate-limit-handler | mode: detect-and-pause
  | run_id: {run_id}
  | run_folder: {path}
  | current_phase: {phase_in_progress}
  | last_completed_phase: {phase}
  | pipeline_start: {ISO}
  | key_facts: {compact_summary_string}
  | next_action: {resume_instruction_string}
]
```

### Secuencia interna

**1. NO reintentar la acción que disparó el rate limit.** Cualquier retry inmediato consume más tokens sin garantía.

**2. Persistir checkpoint** con el estado actual (fase actual como `current_phase`, último completado como `last_phase`):
```
[SKILL: sofka-asdd-atf-web-checkpoint-writer | mode: write
  | run_id: {run_id}
  | run_folder: {path}
  | last_phase: {last_completed_phase}
  | pipeline_start: {pipeline_start}]
```

**3. Generar context_summary.json:**
```
[SKILL: sofka-asdd-atf-web-context-manager | mode: write
  | run_folder: {path}
  | run_id: {run_id}
  | summary_for_phase: {current_phase}
  | phases_completed: [array derivado del checkpoint]
  | key_facts: "{key_facts}"
  | next_action: "{next_action}"]
```

**4. Mostrar al usuario el banner de pausa:**

```
⏸️  RATE LIMIT DETECTADO — PIPELINE PAUSADO
    ────────────────────────────────────────────
    Último checkpoint    : {last_completed_phase}
    Fase en curso        : {current_phase}
    checkpoint.json      : escrito ✅
    context_summary.json : escrito ✅

    La ventana de tokens puede estar parcialmente agotada.
    Reintentar inmediatamente consumirá más tokens sin garantía de éxito.

    Opciones recomendadas:
      A) Esperar 15-30 min → continuar en ESTE chat (recuperación parcial)
      B) Esperar 3-5 horas → abrir NUEVO chat (ventana completa — consumo óptimo)
      C) Continuar ahora (sin espera — riesgo de nuevo rate limit inmediato)

    Para reanudar en nuevo chat:
      @.claude/commands/sofka-asdd/qa-web-run.md
      (el checkpoint se detecta automáticamente)
    ────────────────────────────────────────────
    → Esperando confirmación del usuario (A / B / C)
```

**5. Esperar confirmación del usuario antes de cualquier acción adicional.** No retomar la fase sin input explícito.

### Comportamiento por opción del usuario

| Opción | Acción del orchestrator |
|---|---|
| **A** | Esperar turno del usuario, reanudar desde el último checkpoint en el mismo chat |
| **B** | Salir del pipeline — el usuario abrirá nuevo chat y relanzará `/sofka-asdd:qa-web-run`; el checkpoint será detectado |
| **C** | Reintentar la fase que falló, asumiendo el riesgo |
