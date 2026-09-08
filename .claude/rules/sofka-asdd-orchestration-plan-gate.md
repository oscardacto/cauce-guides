# ASDD Orchestration — núcleo de plan gate

**ORC-010 es bloqueante.** Antes de invocar agentes o ejecutar operaciones no
triviales, el orquestador presenta un plan que declara agentes, artefactos,
scope y comandos `[R/W/D]`, valida V1–V5 y anuncia cada agente. FULL, CLI,
infra, cloud y cambios sensibles esperan aprobación explícita.

Antes de mostrar un plan que espera confirmación, **ORC-010-A** exige emitir exactamente el challenge
canónico con `sofka-asdd-plan-authorization.mjs issue --plan-json`. La
autorización queda ligada a agente, capability primaria, dependency explícita,
scope, comandos, ruta/fase, modelo, turnos, retries, TTL e identidad runtime; no se reutiliza ni se amplía. Un
mismatch exige plan/challenge nuevo.
Un agente **ya lanzado** conserva su autorización hasta su propio TTL aunque se
apruebe un lote nuevo: conservar un binding intacto no es reutilizarlo ni
ampliarlo. Solo lo reemplaza un lote nuevo que redeclare ese mismo agente.
TRIVIAL read-only no crea plan salvo política de mayor precedencia.

**ORC-010-E — la respuesta del usuario no es una palabra.** Vale cualquier afirmación explícita
(`ok`, `dale`, `procedé`, `aprobado`, `de acuerdo`, `tal cual`…): el hook clasifica por raíz, no
contra una lista cerrada. Un rechazo revoca el challenge. Una corrección lo deja **enmendado, no
aprobado**: si no cambia agentes, `scope[]`, `commands[]` ni budget, el orquestador ejecuta el lote
original con `amend --challenge-id <id> --confirm-unchanged` y propaga la corrección en el prompt
del agente — **no vuelve a presentar el plan**. Si cambia el envelope, emite un challenge nuevo con
el delta y le pregunta al usuario si quiere ver el plan revisado o que proceda directo.

**ORC-010-F — vía rápida.** No pagan la ceremonia del plan gate: las operaciones git (su gate es
GS-003 commit, GS-008 push, GS-009 MR/PR, que muestran el comando exacto antes de confirmar) y los
cambios LIGHT de scope exacto resoluble. Force push y reescritura de historia quedan fuera de la vía
rápida y exigen confirmación explícita.

Los helpers determinísticos `sofka-asdd-run-bootstrap.mjs` y
`sofka-asdd-artifact-name.mjs` son control-plane pre-plan: solo abren el estado
local y reservan scopes exactos. Se ejecutan antes del challenge y no requieren
una aprobación adicional. No autorizan agentes ni contenido.

## Carga condicional obligatoria

Antes de construir, validar, aprobar o ejecutar un lote, ejecutá
`node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-orchestration-plan-gate`
y leé **COMPLETO**
`.claude/references/rules/sofka-asdd-orchestration-plan-gate.md`.
Sin lectura íntegra no se presenta ni ejecuta el plan.
