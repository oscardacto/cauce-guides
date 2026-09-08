# ASDD Phases — núcleo always-on

Agentes primarios por fase (`*` = primario en esa fase; `Meta` no tiene agentes
de fase, es transversal):

```
Especificar → producto* · domain-expert*
Analizar    → producto* · researcher*
Diseñar     → architect* · ux* · ui* · cloud-architect* · atf-api-qa-engineer*
Construir   → developer* · ui* · atf-api-qa-engineer*
Verificar   → atf-api-qa-engineer* · atf-reporting-qa-engineer* · security*
Documentar  → ux* · ui* · atf-reporting-qa-engineer* · tech-lead* · architect*
Meta        → meta (governance · token budget · contexto)
```

Las fases aplican solo en ruta **FULL**; en LIGHT se delega a un agente sin
activar el workflow. Los agentes de Smart Data (**ADR-002**) no figuran acá por
diseño: su routing D0-D7 se compone con la fase ORC, primero fase y después Data.

## Carga condicional obligatoria

Antes de armar un plan de ruta FULL o elegir agentes de soporte, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-phases-reference` y leé **COMPLETO**
`.claude/references/rules/asdd-phases-reference.md`. Si el resolver o la lectura fallan: STOP, sin fijar el reparto de agentes.
