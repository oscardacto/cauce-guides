# Diagnóstico de outputs de agentes — Patrones

Catálogo extendido de síntomas, causas probables y acciones. Usado por el
skill `meta-platform` cuando el orquestador reporta que un agente
produjo un output malo o inesperado.

## Tabla síntoma → causa → acción

| Síntoma | Causa probable | Acción recomendada |
|---|---|---|
| Output genérico, sin contexto del proyecto | Agente no leyó CLAUDE.md / spec | Re-invocar con prompt que referencia explícitamente archivos del proyecto |
| Agente ignora una regla documentada | CLAUDE.md demasiado largo (> 200 líneas) | Dividir en archivos referenciados; mover reglas pesadas a skills |
| Skill no se activa cuando debería | `description` del skill no matchea semánticamente la tarea | Ajustar description — incluir keywords de la tarea |
| Skill se activa cuando no debería | `description` demasiado amplia | Acotar description con condiciones específicas |
| MCP tool falla | MCP server caído o mal configurado en `.mcp.json` | Verificar logs del MCP; validar config |
| Auto-compact inesperado | Contexto creció más rápido de lo esperado | Revisar agente culpable; ajustar su budget estimado |
| Agente repite trabajo ya hecho | No leyó outputs previos | Asegurar que el prompt incluye referencias a artefactos ya generados |
| Output contradice ADR aprobado | ADRs no cargados en contexto | Incluir `Lee docs/architecture/decisions/` en el prompt del orquestador |
| ADR generado sin alternativas | Prompt de invocación no pedía trade-offs | Reforzar en el prompt: "incluir mínimo 2 alternativas con trade-offs" |
| Tests generados mockean todo | Falta regla explícita "integration con DB real" | Agregar en CLAUDE.md o memoria: incidente X → siempre integration con DB real |
| Developer escribe fuera del spec | `ASDD_SPEC_GUARD_ENABLED` en `false` | Activar hook spec-check |
| Agente invoca otro agente sin Task tool | Agente sin `Task` en allowed-tools | Agregar `Task` en frontmatter del agente orquestador |
| Respuesta tarda y se queda "pensando" | `maxTurns` muy alto para la tarea | Bajar `maxTurns` en el frontmatter del agente |
| Output incompleto — se cortó | maxTurns insuficiente | Subir maxTurns o partir la tarea |

## Patrones compuestos

### Skill carga contexto pero no lo aplica
- **Pista**: el agente menciona que leyó el skill pero ignora sus reglas.
- **Causa**: SKILL.md > 200 líneas; la instrucción se pierde.
- **Acción**: progressive disclosure → mover ejemplos a `reference/` y dejar
  reglas core en SKILL.md.

### Agentes entran en loop de clarificación
- **Pista**: 2+ turnos pidiendo contexto básico.
- **Causa**: prompt de invocación sin contexto mínimo; CLAUDE.md sin claridad
  del stack.
- **Acción**: [DIAGNOSTICO] orquestador debe enriquecer prompts con: stack,
  fase actual, artefactos disponibles.

### Post /clear el contexto crítico se perdió
- **Pista**: agente pregunta por decisiones ya tomadas.
- **Causa**: `/clear` eliminó ADRs y spec en curso.
- **Acción**: [DIAGNOSTICO] Re-cargar:
  1. ADRs activos.
  2. Spec en curso.
  3. Quality gate status.
  4. `MEMORY.md` y memorias relevantes.
