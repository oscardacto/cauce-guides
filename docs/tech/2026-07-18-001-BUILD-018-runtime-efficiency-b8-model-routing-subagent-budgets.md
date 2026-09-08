# B8 — Default Sonnet y budgets de subagentes

## Objetivo

Aplicar ADR-019 sin confiar solo en instrucciones: Sonnet pasa a ser el default
del orquestador y cada challenge queda ligado a ruta, fase, riesgo, modelo,
fan-out, turnos y retries antes de lanzar un Agent.

## Configuración versionada

`.asdd/subagent-budget.json` es la fuente autoritativa:

| Ruta | Agentes / concurrentes | Turnos | Retries |
|---|---:|---:|---:|
| TRIVIAL | 0 | — | 0 |
| LIGHT | 1 | 10–20 | 1 |
| MEDIUM | 2 | 20–35 | 1 |
| FULL | 3 | 30–50 | 1 |

`.claude/settings.json` cambia de `claude-opus-4-8` a
`claude-sonnet-4-6`. El lock declara `orchestrator_default: sonnet`, fija a
Explorer en Haiku y conserva la precedencia:

`skill override > agent pinning > phase default > agent frontmatter`.

Riesgo alto o escalamiento justificado resuelve Opus antes de tools. El modelo
económico nunca reduce seguridad.

## Enforcement

El challenge ORC-010 requiere `budget_policy_version`, ruta, fase, riesgo,
confianza y concurrencia. Cada agente declara modelo lógico, `max_turns`,
`retries` y motivo de escalamiento cuando aplica.

La autorización store v3 conserva esos campos. `asdd-plan-gate.mjs`
compara el modelo del Agent y exige en su prompt el marcador exacto:

```text
[ASDD-BUDGET route=... phase=... model=... max_turns=... retries=...]
```

Un mismatch consume y bloquea la autorización; se necesita plan/challenge
nuevo. Los 14 agentes que superaban el cap absoluto bajaron a `maxTurns: 50`.
ATF continúa por batches independientes con checkpoint, no con una invocación
de 120 turnos.

## Telemetría y privacidad

El launch registra metadata local en
`.claude/agent-memory/subagent-invocations.jsonl`: ruta, fase, modelo, agente,
capability, budget, retry, motivo y resultado. `SubagentStop` completa duración
y turnos cuando el runtime los entrega. Prompt, output, command y tool input se
rechazan antes de persistir. El audit log histórico conserva solo tamaño, no
contenido.

## Evidencia

- `test-subagent-budget-routing.mjs`: routing/modelos, casos adversariales,
  binding de launch, privacidad, cap estático y 25 configs Sonnet.
- Suites ORC-010 conservan 24/24 y 22/22 contratos previos.
- `validate-template` añade `subagent-budget` como error.
- Microbenchmark de 1.000 muestras: routing p95 `0,0018 ms`; validación de
  budget p95 `0,0164 ms`.

| Métrica | Antes | B8 | Cambio |
|---|---:|---:|---:|
| Default orquestador | Opus | Sonnet | menor coste esperado |
| Suma `maxTurns` de 24 agentes | 1.450 | 1.050 | -27,59 % |
| Máximo por agente | 120 | 50 | -58,33 % |
| Fan-out TRIVIAL | textual | 0 bloqueante | cerrado |
| Budget fuera de rango | no ligado | bloquea challenge | cerrado |

El recordatorio always-on aumenta 38 palabras (`5.825→5.863`) para entregar el
budget en SessionStart; el mayor contexto efectivo sube en las mismas 38
palabras (`19.121→19.159`) y los warnings permanecen en 9.

La suite promptfoo online no se ejecutó porque este entorno no dispone de
`ANTHROPIC_API_KEY`; sus 25 configs de orquestador/workflow/commands ya usan
Sonnet y B9 hará la comparación real de latencia/costo/calidad.

## Rollback

Restaurar el modelo de settings y los `maxTurns`; retirar el budget ref y la
política; volver plan authorization/store a schema v2 y plan-gate a
`consumeLaunchAuthorization`. El rollback es atómico porque challenges v1 y
stores v1/v2 siguen siendo legibles, aunque nuevos challenges requieren budget.

## Resultado

B8 cumple ADR-019: default económico, Explorer/Haiku acotado, high-risk/Opus,
fan-out proporcional, cap de turnos, retry limitado, launch fail-closed y
telemetría sin contenido sensible. Siguiente slice: B9.
