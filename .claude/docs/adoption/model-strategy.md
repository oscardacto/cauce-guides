# Model Strategy — Asignación de modelo por fase

ASDD permite configurar qué modelo LLM usa cada sub-agente según la fase del
workflow. El orquestador aplica la resolución en cada invocación (ORC-002-B).

## Cadena de precedencia

De mayor a menor prioridad:

```
skill_override  >  agent_pinning  >  phase_default  >  frontmatter (fallback)
```

## Defaults Sofka

| Fase | Modelo | Razón |
|---|---|---|
| Especificar | `sonnet` | Texto estructurado — sonnet es suficiente |
| Analizar | `sonnet` | Extracción de requisitos — sonnet es suficiente |
| Diseñar | `opus` | ADRs y trade-offs — costo de error alto |
| Construir | `sonnet` | Sigue spec aprobada, error contenible con tests |
| Verificar | `opus` | QA + Security — falsos negativos en prod son caros |
| Documentar | `haiku` | Consolidación de info ya existente |

## Configuración en `.sofka-asdd/sofka-asdd.lock`

### Solo phase_default (caso más común)

```json
"model_strategy": {
  "phase_default": {
    "specify":  "sonnet",
    "analyze":  "sonnet",
    "design":   "opus",
    "build":    "sonnet",
    "verify":   "opus",
    "document": "haiku"
  },
  "agent_pinning": {},
  "skill_override": {}
}
```

### Con agent_pinning (fijar modelo a un agente específico)

Útil cuando un agente siempre debe usar un modelo concreto sin importar la fase:

```json
"agent_pinning": {
  "sofka-asdd-security": "opus"
}
```

### Con skill_override (máxima granularidad)

Útil cuando un skill concreto necesita más o menos capacidad que su fase:

```json
"skill_override": {
  "sofka-asdd-researcher.benchmark": "sonnet",
  "sofka-asdd-solution-architect.tradeoff-analysis": "opus"
}
```

## Restricciones del validador

El check `model-strategy` en `validate-template.mjs` bloquea:

- `haiku` en fases `design` o `verify` — riesgo de razonamiento insuficiente
- Modelos inválidos (solo `haiku`, `sonnet`, `opus` son valores aceptados)
- Agentes en `agent_pinning` que no existan en `.claude/agents/`
- Keys en `skill_override` sin formato `{agente}.{skill}`

## Cómo verificar la resolución activa

El orquestador anuncia el modelo resuelto en cada invocación (ORC-008):

```
→ **@sofka-asdd-solution-architect** (model: opus) — diseñando ADR para autenticación
```

El modelo también queda registrado en `.asdd-run.json` bajo `phases.{fase}.models_used`.

## Backwards compatibility

Si `model_strategy` no está en el lock, el orquestador usa el `model:` del
frontmatter de cada agente (comportamiento anterior). No hay cambios de
comportamiento para proyectos que no configuren este bloque.
