# ASDD Workflow — núcleo always-on

El ciclo canónico es `Specify → Analyze → Design → Build → Verify → Document`.
**WF-001/WF-002/WF-003** gobiernan Specify, Analyze y Design; las fases
posteriores conservan el mismo orden y sus gates especializados.
No saltear fases ni reabrir una marcada `complete`; priorizar la fase más
temprana pendiente. Brief precede specs; specs aprobadas preceden diseño; ADRs
aceptadas preceden implementación cuando aplican. El INDEX es obligatorio desde
el cierre de Analyze y gobierna slices/dependencias. `.asdd-run.json` es el
checkpoint operativo y debe reconciliarse con el INDEX.

## Carga condicional obligatoria

Antes de iniciar, cerrar o cambiar de fase, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-workflow` y leé **COMPLETO**
`.claude/references/rules/asdd-workflow.md`. Para Build cargá además
`asdd-workflow-build`; para agentes por fase consultá
`asdd-phases-reference.md`. Si falta una referencia: STOP.
