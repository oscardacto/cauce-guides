---
description: Memory hygiene, session handoff, agent context declaration — token saving
globs: "*"
---

# Memory Hygiene — MEMORY.md ≤30 líneas activas

## Sistema de dos capas

| Capa | Ubicación | Tipo de memoria | Compartido |
|---|---|---|---|
| **Equipo** | `.claude/memory/` (git-committed) | `feedback`, `reference` perennes | ✅ Git — todo el equipo |
| **Personal** | `~/.claude/projects/{project}/memory/` | `project` efímeras, `user`, sensibles | ❌ Solo local |

- **Feedback validado** (convenciones confirmadas, anti-patrones documentados) → equipo
- **Estado de sesión** (sprint en curso, rama, último paso) → personal
- **Datos sensibles del dominio** → NUNCA en equipo (ver `sofka-asdd-memory-privacy.md`)

## Protocolo de promoción — personal → equipo

Una lección en memoria personal se **promueve** a `.claude/memory/` del equipo cuando:
1. Se confirmó en **≥2 sesiones distintas** (el mismo error apareció de nuevo, o un compañero lo reportó)
2. No contiene datos sensibles (ver `sofka-asdd-memory-privacy.md`)
3. Aplica a futuras sesiones del mismo agente, no solo al sprint actual

**Cómo promover:**
1. Crear `{tipo}_{slug}.md` en `.claude/memory/` con el frontmatter estándar
2. Añadir puntero en `ASDD-MEMORY.md` (una línea ≤150 chars)
3. Si el anti-patrón es transversal (≥2 agentes lo padecen) → añadir nota destacada en el índice
4. Commit en el repo — todo el equipo hereda la lección

**Candidatos automáticos a promoción:**
- Feedback de tipo `correction` (el usuario corrigió algo no obvio) → siempre promover
- Feedback de tipo `confirmation` (el usuario aceptó una decisión no obvia sin pushback) → promover si aplica a futuras sesiones

## Cuándo archivar

| Tipo | Cuándo archivar |
|---|---|
| `project` sprint/onda completado o mergeado | Inmediatamente |
| `project` plan terminado | Al completar |
| `project` estado sin retomar >2 semanas | Archivar |
| `feedback` / `user` / `reference` | Nunca — perennes |

**Archivar** = eliminar la línea del índice en ASDD-MEMORY.md. El archivo .md queda en disco sin consumir contexto.

# Session Handoff

Al terminar con trabajo incompleto, guardar memoria `project`:

```
Estado: [en progreso | bloqueado | esperando review]
Rama: [nombre exacto]
Último paso: [conciso]
Próximo paso: [exacto, sin ambigüedad]
Archivos clave: [máx 5 rutas]
Bloqueadores: [o "ninguno"]
Worktrees: [o "ninguno"]
```

# Declaración de Contexto por Agente

Antes de leer archivos declarar: `Necesito: [archivo] para [razón]`. Leer SOLO esos archivos.
Si 2 greps con patrones distintos no encuentran lo buscado → reportar al usuario, no seguir explorando.
