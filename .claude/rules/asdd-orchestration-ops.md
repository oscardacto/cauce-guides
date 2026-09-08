# ASDD Orchestration Ops — núcleo always-on

- **ORC-002/002-B:** seleccionar el agente por dominio/fase y el modelo por
  complejidad/riesgo; Sonnet es default del orquestador y alto riesgo escala a
  Opus antes de tools. Nunca usar modelo máximo para compensar contexto.
- **ORC-002-C:** aplicar el budget bloqueante de ruta: TRIVIAL 0 agentes;
  LIGHT 1/10–20 turnos; MEDIUM 2/20–35; FULL 3/30–50; máximo un retry.
  Son techos, no cuotas: LIGHT read-only acotado puede usar 0 agentes; un
  `LIGHT atomic_scoped_change` delega con scope exacto autoautorizado.
- **ORC-003:** usar invocación bloqueante o paralela según dependencia real.
- **ORC-004:** consultar meta solo para descubrir capacidad, no como sustituto
  del agente propietario.
- **ORC-005:** sintetizar resultados sin ocultar fallos ni decisiones.
- **ORC-007:** leer/checkpoint `.asdd-run.json`; tras compactación recuperar
  estado y no reinvocar fases completas.
- **ORC-008:** anunciar `@agente`, modelo, capability y tarea antes de invocar.
- El built-in `Explore` no sustituye `asdd-explorer`.

## Carga condicional obligatoria

Antes de seleccionar/invocar agentes, resolver modelos/budgets, reanudar o sintetizar
un lote, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-orchestration-ops`
y leé **COMPLETO**
`.claude/references/rules/asdd-orchestration-ops.md`. Sin lectura, no
invoques el lote.
