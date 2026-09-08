---
description: Agrega un skill a un agente existente, actualiza lock y frontmatter, y aplica la estructura canónica del SKILL.md.
allowed-tools: [Read, Write, Edit, Bash]
---

Agregar un nuevo skill a un agente ASDD existente de forma controlada. Actualiza TODOS los puntos del ecosistema y valida al final.

## Parámetros

```
/sofka-asdd:add-skill {agente} {nombre-skill} "{descripción}" [tools=Read,Glob,Grep]
```

- `{agente}` — slug del agente padre sin el prefijo `sofka-asdd-`. Ej: `tech-lead`, `developer`, `security`
- `{nombre-skill}` — slug del skill en kebab-case. Ej: `create-mr`, `code-review`, `dependency-audit`
- `"{descripción}"` — descripción corta del skill con contexto de activación
- `tools` (opcional) — lista de tools oficiales separadas por coma. Default: `Read,Glob,Grep`

El skill resultante se llamará `sofka-asdd-{agente}-{nombre-skill}`.

## Validaciones previas (ABORT si falla alguna)

1. **Agente padre existe**: verificar que `.claude/agents/sofka-asdd-{agente}.md` existe. Si no existe, abortar con error y sugerir `/sofka-asdd:add-agent {agente} "..."` primero.
2. **Naming del skill**: `{nombre-skill}` debe ser kebab-case (`[a-z0-9-]+`).
3. **No existe**: verificar que `.claude/skills/sofka-asdd-{agente}-{nombre-skill}/SKILL.md` NO existe. Si existe, abortar.
4. **Tools válidas**: las tools oficiales son `Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task, TodoRead, TodoWrite, NotebookRead, NotebookEdit`. Rechazar cualquier otra.
5. **Budget de tamaño**: advertir al usuario que el SKILL.md no debe superar 150 líneas (`validation.rules_size_max` del lock). El template que crea este comando tiene ~60 líneas — hay margen para completar.

## Pasos de ejecución

### 1. Crear el SKILL.md

Crear `.claude/skills/sofka-asdd-{agente}-{nombre-skill}/SKILL.md`:

```markdown
---
name: sofka-asdd-{agente}-{nombre-skill}
description: {descripción}
allowed-tools: [{tools separadas por coma y espacio}]
---

## Rol

{1-2 oraciones: qué hace este skill y cuál es su responsabilidad}

## Cuándo activar

- {trigger principal — señal en el prompt o contexto}
- {trigger secundario si aplica}
- Fases: **{fase ASDD donde aplica}**

## Proceso

1. {Paso 1}
2. {Paso 2}
3. {Paso 3}

## Outputs

- {Artefacto que produce — archivo o resultado}

## Cuándo NO invocar

- {Caso de exclusión explícito — qué skill alternativo usar si aplica}

## Anti-patterns

- **{Anti-pattern 1}** — {por qué es incorrecto y qué hacer en su lugar}
- **{Anti-pattern 2}** — {ídem}
```

### 2. Actualizar el frontmatter del agente padre

Leer `.claude/agents/sofka-asdd-{agente}.md` y agregar `sofka-asdd-{agente}-{nombre-skill}` a la lista `skills:` del frontmatter.

Si `skills: []` → convertir en `skills: [sofka-asdd-{agente}-{nombre-skill}]`.
Si `skills: [existente1, existente2]` → agregar al final: `skills: [existente1, existente2, sofka-asdd-{agente}-{nombre-skill}]`.

### 3. Actualizar el lock

Leer `.sofka-asdd/sofka-asdd.lock`, incrementar `manifest.variants.claude.skills` en 1 y escribir el archivo.

### 4. Validar

Ejecutar:
```bash
node .claude/scripts/validate-template.mjs
```

Si el resultado NO es `Summary: N ok, 0 warn, 0 error`:
- Reportar el error exacto
- NO declarar éxito
- Guiar al usuario en la corrección

### 5. Reportar resultado

```
✅ Skill sofka-asdd-{agente}-{nombre-skill} creado correctamente

Archivos creados:
  - .claude/skills/sofka-asdd-{agente}-{nombre-skill}/SKILL.md

Ecosistema actualizado:
  - sofka-asdd.lock: skills {N} → {N+1}
  - .claude/agents/sofka-asdd-{agente}.md: skills: [..., sofka-asdd-{agente}-{nombre-skill}]

Validador: {N} ok, 0 warn, 0 error ✅

Próximos pasos:
  1. Completar el SKILL.md: Proceso detallado, Outputs concretos y Anti-patterns reales
  2. El skill tiene {N} líneas — budget restante: {150-N} líneas
  3. Invocar el skill con: "{trigger}" en el contexto del agente sofka-asdd-{agente}
```

## Cuándo NO invocar

- El agente padre no existe — crear primero con `/sofka-asdd:add-agent`
- El skill ya existe — editar directamente su `SKILL.md`
- Se quiere crear un skill sin agente padre claro — todos los skills ASDD pertenecen a un agente específico
