---
description: Retoma el workflow ASDD desde .asdd-run.json sin reprocesar lo completado. Usar tras compact, clear o corte de sesión.
allowed-tools: [Read, Glob, Grep, Task]
---

Retomar el workflow ASDD desde el último checkpoint guardado en `.asdd-run.json`.

## Paso 1 — Leer estado actual

Leer `.asdd-run.json` en la raíz del proyecto.

- **No existe** → informar: "No hay workflow en curso. Comenzar con `/sofka-asdd:specify`." Detener.
- **`status = "complete"`** → informar: "El workflow [run_id] está completo. ¿Iniciamos uno nuevo con `/sofka-asdd:specify`?" Detener.
- **`status = "in_progress"` o `"blocked"`** → continuar con Paso 2.

## Paso 2 — Reconstruir contexto mínimo (sin reprocesar)

Para cada fase con `status: "complete"`:
- Leer **solo** los archivos listados en su campo `artifacts` — no explorar el proyecto completo
- No reinvocar los agentes de esas fases

Para la fase con `status: "in_progress"`:
- Leer artefactos producidos hasta ahora
- Identificar `pending_steps`

Para fases `pending`: no cargar nada todavía.

## Paso 3 — Presentar resumen al developer

```
## Retomando workflow — [run_id]
**Feature:** [feature]
**Último checkpoint:** [last_checkpoint]

| Fase        | Estado        | Artefactos clave              |
|-------------|---------------|-------------------------------|
| Especificar | ✅ Complete   | docs/specs/brief-{x}.md       |
| Analizar    | ✅ Complete   | docs/specs/requirements-{x}.md|
| Diseñar     | 🔄 En progreso| ADR-001 ✅ · diagram ⏳       |
| Construir   | ⏳ Pendiente  | —                             |
| Verificar   | ⏳ Pendiente  | —                             |
| Documentar  | ⏳ Pendiente  | —                             |

**Contexto clave:** [context_summary]
**Próximo paso:** [resume_hint]
```

Confirmar con el developer antes de continuar.

## Paso 4 — Gestión de contexto pre-resume

Si cargar los artefactos de fases completas supera el 50% del contexto disponible:
- Consultar `sofka-asdd-meta`: "Post-resume. ¿Qué artefactos priorizar para continuar: [resume_hint]?"
- Cargar solo lo que el meta-agente indique — no cargar todo

## Paso 5 — Continuar el workflow

Invocar el agente correspondiente para continuar desde `resume_hint`.
Aplicar ORC-007: no reprocesar fases `complete`, no releer archivos ya cargados.
Escribir checkpoint tras cada paso completado antes de pasar al siguiente.
