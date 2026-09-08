# Token Budget — Tablas completas

Contexto para el skill `meta-platform`. Usar cuando la consulta del
orquestador requiera estimar cabida de agentes en la ventana o diagnosticar
consumo elevado.

## Presupuesto en ventana de 200k tokens (Sonnet 4.6)

| Bloque | Tokens |
|---|---|
| System prompt Claude Code | ~2.000 |
| CLAUDE.md proyecto | ~1.480 |
| Skills metadata (11 agentes × 40) | ~440 |
| Auto-memory | ~40 |
| **Contexto fijo total** | **~3.960** |
| Buffer reservado | ~33.000 |
| **Disponible para agentes** | **~163.040** |

## Presupuesto por agente

| Agente | Budget | Nivel |
|---|---|---|
| developer | ~60–80k | alto |
| architect | ~30–40k | medio |
| atf-api-qa-engineer | ~30–40k | medio |
| tech-lead | ~15–25k | bajo |
| producto | ~10–15k | bajo |
| security | ~10–20k | bajo |
| ui | ~10–15k | bajo |
| devops-engineer | ~15–25k | bajo |
| researcher | ~20–30k | medio |
| domain-expert | ~5–10k | mínimo |
| meta | ~3–5k | ligero |

> Los presupuestos se auto-ajustan con datos reales de la Observability API
> cuando está disponible.

## Cálculo de cabida — Agent Teams

Fórmula rápida para N agentes simultáneos:

```
contexto_disponible = 163.040 - contexto_actual
suma_budgets = Σ budget(agente_i)
cabe = suma_budgets < contexto_disponible
```

Ejemplo:

```
[DIVIDIR] budget Dev (~70k) + QA (~35k) = ~105k sobre 89k disponibles.
Ejecuta Dev primero (Construir), luego QA en sesión nueva (Verificar).
```

## Heurísticas para decidir /compact vs nueva sesión

| Condición | Recomendación |
|---|---|
| Contexto > 80% y tareas relacionadas | `[COMPACT]` |
| Contexto > 80% y cambio de tema | `[NUEVA-SESION]` |
| Muchas lecturas de archivos grandes | `[COMPACT]` conservando plan |
| Muchos spawns de agentes pesados | `[NUEVA-SESION]` agrupando por fase |
