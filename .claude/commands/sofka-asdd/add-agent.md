---
description: Agrega un agente al template con el ecosistema actualizado (lock, evals), naming estándar y frontmatter oficial.
allowed-tools: [Read, Write, Edit, Bash]
---

Agregar un nuevo agente ASDD de forma controlada. Actualiza TODOS los puntos del ecosistema y valida al final.

## Parámetros

```
/sofka-asdd:add-agent {nombre} "{descripción}" [tools=Read,Glob,Grep] [model=sonnet]
```

- `{nombre}` — slug en kebab-case, sin el prefijo `sofka-asdd-` (el comando lo agrega). Ej: `marketing-specialist`
- `"{descripción}"` — descripción corta con triggers explícitos. Ej: `"Especialista en marketing. Invocarlo para estrategias de contenido y posicionamiento"`
- `tools` (opcional) — lista de tools oficiales separadas por coma. Default: `Read,Glob,Grep`
- `model` (opcional) — alias de modelo: `opus | sonnet | haiku`. Default: `sonnet`

## Validaciones previas (ABORT si falla alguna)

1. **Naming**: `{nombre}` debe ser kebab-case (`[a-z0-9-]+`). Si ya tiene el prefijo `sofka-asdd-`, removerlo antes de continuar.
2. **No existe**: verificar que `.claude/agents/sofka-asdd-{nombre}.md` NO existe. Si existe, abortar con error explícito.
3. **Tools válidas**: cada tool declarada debe ser una tool oficial de Claude Code. Las oficiales son: `Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task, TodoRead, TodoWrite, NotebookRead, NotebookEdit`. Rechazar cualquier otra.
4. **Modelo válido**: `opus`, `sonnet` o `haiku`. Rechazar cualquier otro valor (nunca IDs con versiones concretas — aprendizaje #3466).

## Pasos de ejecución

### 1. Crear el archivo del agente

Crear `.claude/agents/sofka-asdd-{nombre}.md` con este template exacto:

```markdown
---
name: sofka-asdd-{nombre}
description: {descripción}
model: {model}
tools: [{tools separadas por coma y espacio}]
maxTurns: 50
memory: project
skills: []
mcpServers: []
---

Referente en {nombre}. {Una oración de contexto del rol}.

## Cuándo invocar

{Descripción de triggers — cuándo el orquestador debe delegar a este agente}

## Cuándo NO invocar

{Al menos un caso de exclusión explícito}

## Checklist de salida (Definition of Done)

Antes de retornar resultado, verificar:

- [ ] {criterio específico del agente}
- [ ] El output es accionable (no solo análisis, sino recomendación concreta)
```

**Campos prohibidos** (no agregar bajo ninguna circunstancia):
- `effort:` — no es campo oficial de Claude Code
- `rules:` — no es campo oficial de Claude Code
- `model_strategy_note:` — no es campo oficial
- Ningún ID de modelo concreto (ej. `claude-sonnet-4-6`) — usar solo el alias

### 2. Crear stub de eval

Crear el directorio y archivo:
- Directorio: `.claude/evals/2-agents/{nombre}/` (sin prefijo `sofka-asdd-`)
- Archivo: `.claude/evals/2-agents/{nombre}/agent-{nombre}.yaml`

Contenido del stub:

```yaml
description: "sofka-asdd-{nombre}: {descripción corta de 1 línea}"

providers:
  - id: anthropic:messages
    label: claude-sonnet-4-6
    config:
      model: claude-sonnet-4-6
      apiKey: ${ANTHROPIC_API_KEY}
      system: "file://../../prompts/system-agent-{nombre}.txt"

prompts:
  - "{{input}}"

tests:
  - description: "PROCESO: Respeta el flujo ASDD y no actúa fuera de su rol"
    vars:
      input: |
        {Prompt de prueba relevante para el dominio del agente — invocar algo que debería rechazar}
    assert:
      - type: llm-rubric
        value: |
          El agente debe {comportamiento esperado de rechazo o redirección}.
          No debe {comportamiento que violaría su rol}.
```

### 3. Actualizar el lock

Leer `.sofka-asdd/sofka-asdd.lock`, incrementar `manifest.variants.claude.agents` en 1 y escribir el archivo.

### 4. NO tocar CLAUDE.md

`CLAUDE.md` **no lleva catálogo de agentes**: el runtime ya inyecta el nombre y la
descripción de cada uno en toda sesión, y duplicarlo en prosa se paga dos veces por
turno. El agente se descubre por su propia `description`, que por eso tiene que
discriminar en ≤260 chars — rol, dominio y frontera contra el agente vecino
(`NO para X → usar Y`). El límite lo valida el check `skill-description-budget`.

Si el agente nuevo tiene skills propias, declararlas en
`.sofka-asdd/capability-loading.json` (`capabilities[]`, `max_eager_skills: 0`,
`max_dependencies: 1`) y agregarle la sección `## Carga bajo demanda de capacidades`
en el cuerpo — es lo que exige el check `conditional-capability-loading`.

### 5. Validar

Ejecutar:
```bash
node .claude/scripts/validate-template.mjs
```

Si el resultado NO es `Summary: N ok, 0 warn, 0 error`:
- Reportar el error exacto
- NO declarar éxito
- Guiar al usuario en la corrección

### 6. Reportar resultado

```
✅ Agente sofka-asdd-{nombre} creado correctamente

Archivos creados:
  - .claude/agents/sofka-asdd-{nombre}.md
  - .claude/evals/2-agents/{nombre}/agent-{nombre}.yaml

Ecosistema actualizado:
  - sofka-asdd.lock: agents {N} → {N+1}

Validador: {N} ok, 0 warn, 0 error ✅

Próximos pasos:
  1. Completar el body del agente con sub-roles y responsabilidades específicas
  2. Completar los tests del eval con casos reales del dominio
  3. Si el agente tiene skills, crearlos con /sofka-asdd:add-skill {nombre} {skill} "{descripción}"
```

## Cuándo NO invocar

- El agente ya existe en `.claude/agents/` — verificar primero con `ls .claude/agents/ | grep {nombre}`
- El nombre no corresponde a un rol real del proyecto — los agentes ASDD cubren roles de ingeniería de software; no crear agentes genéricos sin responsabilidad clara
- Se quiere modificar un agente existente — editar directamente su archivo
