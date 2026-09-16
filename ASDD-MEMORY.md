# MEMORY — Contexto persistente del proyecto

Índice de memorias persistentes del proyecto. Cada fila es una línea corta
que apunta a un archivo en `.claude/memory/` con el contenido completo.
Claude Code carga este índice en cada sesión; los archivos se leen bajo
demanda cuando la descripción coincide con la tarea.

**No escribir contenido extenso aquí** — usa `.claude/memory/{nombre}.md`.
Formato de fila: `| tipo | fecha | título corto | notas |`.

## Tabla de memorias

| Tipo | Fecha | Memoria | Notas |
|---|---|---|---|
| `reference` | 2026-09-15 | [Run único activo + naming en docs/](.claude/memory/asdd-single-active-run-limitation.md) | No hay suspensión de run ni naming legado para escritura nueva: un ADR de gobernanza queda sin ruta de archivo. |
| `feedback` | 2026-09-15 | [No borrar artefactos de verificación](.claude/memory/feedback-no-borrar-artefactos-verificacion.md) | Lighthouse/screenshots/logs quedan en disco siempre; sin evidencia no hay sign-off auditable. |

> Las lecciones transversales del ASDD **no** viven acá: son reglas de
> `.claude/rules/` (por ejemplo GS-006 y GS-007 en `asdd-git-safety.md`, o el
> enforcement ORC en `asdd-orchestration.md`). Esta tabla es para el contexto
> propio de **este** proyecto: lo que no se deriva leyendo el código.

## Tipos válidos

| Tipo | Cuándo guardar | Ejemplo |
|---|---|---|
| `user` | Preferencias del developer o rol dominante del equipo | "Equipo prefiere TypeScript estricto, nada de `any`" |
| `feedback` | Corrección o validación explícita sobre un enfoque | "Tests de integración siempre contra DB real — incidente 2026-01" |
| `project` | Decisiones arquitectónicas, initiatives, incidentes | "Migración a event-driven aprobada en ADR-012 — no proponer REST nuevos" |
| `reference` | Puntero a sistemas externos (Jira, Grafana, Confluence) | "Bugs de pipeline en Linear project INGEST" |

## Qué NO guardar

- Estructura del código, convenciones, paths → se derivan leyendo el repo.
- Historia git → `git log` es autoritativo.
- Detalles de tareas en curso → usa plan/tasks del propio Claude Code.
- Todo lo que ya está en `CLAUDE.md` → duplicación que confunde.

## Cómo agregar una memoria

1. Crear archivo en `.claude/memory/{slug}.md` con frontmatter:
   ```markdown
   ---
   name: slug-descriptivo
   description: una línea precisa — define cuándo Claude Code debe cargarla
   type: user | feedback | project | reference
   ---

   Contenido de la memoria. Para feedback y project, estructurar como:
   **Regla / hecho:** ...
   **Why:** motivo o incidente que lo justifica.
   **How to apply:** cuándo aplicarla en futuras tareas.
   ```
2. Agregar fila en la tabla de arriba apuntando al archivo.
3. Revisar cada trimestre: memorias obsoletas o contradictorias deben
   actualizarse o eliminarse.
