# Context Footprint Criterion — Principio de mantenimiento

> **Principio guía** para decidir si una regla va en `always-loaded` (`.claude/rules/`)
> o en `on-demand` (cuerpo de agente en `.claude/agents/*.md`).
>
> Establecido en WI #3671 — Context Footprint Optimization (v2.24.0).

## Criterio (NO negociable)

**Always-loaded = SOLO el conjunto mínimo para operar correcta Y seguramente desde la acción 0.**

Una regla pertenece a `always-loaded` si responde SÍ a AL MENOS UNA de estas preguntas:

1. **¿La necesita el orquestador para enrutar o coordinar desde el primer turno?**
   (routing, clasificación LIGHT/FULL, selección de agentes, plan-gate, checkpoints)

2. **¿Protege cualquier acción desde el turno 0, antes de que haya invocado cualquier agente?**
   (guardrails de seguridad/privacidad/integridad del sistema)

3. **¿La requiere el hook `session-start.mjs` para inyectar contexto inicial?**

Si la respuesta a todas es NO → va on-demand (cuerpo de agente).

## Categorías always-loaded (invariantes)

| Categoría | Archivos |
|---|---|
| Routing del orquestador | `routing-heuristics.md`, `routing-heuristics-size.md` |
| Núcleo de orquestación | `orchestration.md`, `orchestration-ops.md`, `orchestration-plan-gate.md`, `orchestration-routing.md`, `orchestration-tdd.md`, `orchestration-worktree.md`, `checkpoint-resume.md` |
| Fases y agentes | `workflow.md`, `workflow-build.md`, `phases-reference.md` |
| Guardrails de seguridad/privacidad | `git-safety.md`, `data-boundary.md`, `system-integrity.md`, `memory-hygiene.md`, `memory-privacy.md`, `anti-loops.md` |
| Soporte transversal | `skill-preflight.md`, `claude-md-maintenance.md`, `spanish-orthography.md`, `data-events-integrity.md`, `ephemeral-artifacts.md` |

## Candidatos on-demand (regla de ejemplo)

Reglas **agent-specific** que solo aplican cuando ese agente está activo:
- Protocolo de tests del developer → `.claude/docs/developer-test-protocol.md`
- Principios Clean Code/SOLID → `.claude/docs/clean-code-solid.md`
- Reglas de estabilización/bugfix → `.claude/docs/stabilization-bug-rules.md`
- DDD Universal → cuerpo de `sofka-asdd-solution-architect.md`
- UX Universal → cuerpo de `sofka-asdd-ux.md`
- ISTQB, orchestration ATF, checkpoint, defect-classification → cuerpo de `sofka-asdd-atf-api-qa-engineer.md`
- Invariantes del executor web → cuerpo de `sofka-asdd-atf-web-qa-engineer.md`

## Test rápido antes de agregar una regla nueva

> _¿El orquestador la necesita para enrutar, o protege acciones desde el turno 0?_
> - SÍ → `always-loaded` (`.claude/rules/`)
> - NO → `on-demand` (cuerpo del agente en `.claude/agents/*.md`)

## Histórico

| Versión | Acción | Reglas always-loaded |
|---|---|---|
| v2.22.x | Baseline | 36 |
| v2.24.0 | WI #3671 — movidas 13 reglas agent-specific a cuerpos de agentes | 23 |

