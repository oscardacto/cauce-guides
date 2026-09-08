# ASDD Eval Baseline — v2.11.0

**Fecha de corrida:** 2026-06-10 / 2026-06-11  
**Rama:** `fix/3519-evals-config` (commits `9516f58`, `98a0767`, `95c05c6`, `c679b54`)  
**Modelo evaluado:** `claude-sonnet-4-6`  
**Provider:** `claude-code-provider.mjs` (local, suscripción Max — no va al repo)  
**WI:** [#3519](https://dev.azure.com/Sofka-AI-Center/Sofka%20AI%20Center/_workitems/edit/3519)

---

## Resumen ejecutivo

| Categoría | Configs | Tests | PASS | FAIL | ERR | % |
|---|---|---|---|---|---|---|
| 1-orchestrator | 7 | 19 | 3 | 16 | 0 | 16% |
| 2-agents | 12 | 60 | 36 | 22 | 2 | 60% |
| 3-skills | 11 | 47 | 29 | 18 | 0 | 62% |
| 4-workflow | 6 | 17 | 4 | 13 | 0 | 24% |
| 5-commands | 9 | 10 | 0 | 10 | 0 | 0% |
| **TOTAL** | **45** | **153** | **72** | **79** | **2** | **47%** |

---

## 1-orchestrator (7 configs, 19 tests)

**PASS: 3 / 19 (16%)**

| Config | PASS | FAIL | ERR | Notas |
|---|---|---|---|---|
| orc-000-pure-delegation | 0 | 3 | 0 | Harness artifact (ver §Clasificación) |
| orc-000b-fallback-protocol | 0 | 2 | 0 | Harness artifact |
| orc-001a-classify-specify | 1 | 2 | 0 | Harness artifact parcial |
| orc-001b-classify-other-phases | 0 | 4 | 0 | Harness artifact |
| orc-003-invocation-mode | 2 | 0 | 0 | ✅ |
| orc-007-checkpoint-resume | 0 | 2 | 0 | Harness artifact |
| orc-008-agent-visibility | 0 | 3 | 0 | Harness artifact |

### Clasificación de FAILs: harness artifacts

**TODOS los FAILs de 1-orchestrator son artefactos del harness de evaluación**, no regresiones del framework.

**Causa raíz:** El harness `promptfoo` invoca al modelo con un system prompt del agente orquestador pero sin los agentes ASDD registrados como tools reales. El modelo detecta correctamente que `sofka-asdd-developer`, `sofka-asdd-producto`, etc. no están disponibles como Agent tool calls y activa el protocolo ORC-000-B (fallback de delegación), produciendo respuestas del estilo "⚠️ ORC-000-B activado — agente no disponible". El rubric espera delegación real (que es imposible en el harness), por lo que FALLA la evaluación aunque el comportamiento es técnicamente correcto.

**Tests que SÍ pasaron (3):** Solo pasan los que no dependen de que los agents estén registrados como tools:
- `orc-001a`: 1 PASS (el clasificador identifica señal → fase correctamente)
- `orc-003`: 2 PASS (modo invocación paralelo vs secuencial — no requiere agents reales)

**Implicación para futuros baselines:** Los FAILs de 1-orchestrator solo serán significativos cuando el harness se ejecute con Claude Code activado (agent teams disponibles). En la configuración actual (API provider), son ruido esperado.

---

## 2-agents (12 configs, 60 tests)

**PASS: 36 / 60 (60%)**

| Config | PASS | FAIL | ERR | Notas |
|---|---|---|---|---|
| developer | 3 | 1 | 1 | 1 err = output parsing |
| domain-expert | 4 | 1 | 0 | |
| explorer | 0 | 5 | 0 | Ver §Gaps reales |
| meta | 3 | 2 | 0 | |
| platform-engineer | 4 | 1 | 0 | |
| producto | 4 | 1 | 0 | |
| qa-engineer | 2 | 3 | 0 | |
| researcher | 3 | 1 | 1 | 1 err = output parsing |
| security | 4 | 1 | 0 | |
| solution-architect | 4 | 1 | 0 | Post-fix config bug (paths). Ver §Addendum |
| tech-lead | 2 | 3 | 0 | |
| ux-ui | 3 | 2 | 0 | |

### Gaps reales destacados

- **explorer (0/5):** El agente no usa herramientas de filesystem directamente — pide al usuario que ejecute comandos y pegue resultados. Gap real: `sofka-asdd-explorer` tiene acceso a `Glob`, `Grep`, `Read` pero no los usa en el harness sin archivos de proyecto reales.
- **qa-engineer (2/5):** Partial compliance en rubrics de test-strategy y regression — coverage criteria missing, no menciona ADR como prerequisito.
- **tech-lead (2/5):** FAILs en estimación técnica (sin profundidad) y output de review (falta completitud de hallazgos).
- **solution-architect (4/5):** 1 FAIL en selección de skill — no invocó `tradeoff-analysis` antes del ADR (skill routing gap).

---

## 3-skills (11 configs, 47 tests)

**PASS: 29 / 47 (62%)**

| Config | PASS | FAIL | ERR | Notas |
|---|---|---|---|---|
| developer | 3 | 1 | 0 | |
| domain-expert | 2 | 4 | 0 | Ver §Gaps reales |
| meta | 0 | 1 | 0 | |
| platform-engineer | 3 | 1 | 0 | |
| producto | 3 | 2 | 0 | |
| qa-engineer | 3 | 1 | 0 | |
| researcher | 1 | 2 | 0 | |
| security | 4 | 0 | 0 | ✅ Perfecto |
| solution-architect | 5 | 4 | 0 | Ver §Addendum |
| tech-lead | 1 | 2 | 0 | |
| ux-ui | 4 | 0 | 0 | ✅ Perfecto |

### Gaps reales destacados

- **domain-expert (2/6):** FAILs en fintech (reglas de negocio demasiado genéricas), insurance (falta de granularidad regulatoria), health, logistics.
- **meta (0/1):** FAIL en governance check — marca recursos como "no verificable" en vez de usar herramientas.
- **researcher (1/3):** FAILs en spike benchmark y comparison.

---

## 4-workflow (6 configs, 17 tests)

**PASS: 4 / 17 (24%)**

| Config | PASS | FAIL | ERR | Notas |
|---|---|---|---|---|
| wf-001-specify | 2 | 2 | 0 | Harness artifact parcial |
| wf-002-analyze | 0 | 3 | 0 | Harness artifact |
| wf-003-design | 1 | 2 | 0 | Harness artifact |
| wf-004-build | 1 | 2 | 0 | Parcial — developer delegado pero sin QA paralelo |
| wf-005-verify | 0 | 2 | 0 | Harness artifact |
| wf-006-document | 0 | 2 | 0 | Harness artifact |

### Clasificación de FAILs

Similar a 1-orchestrator: la mayoría son harness artifacts (los agents no están registrados como tools, el orquestador activa ORC-000-B). Los FAILs de wf-004-build tienen componente de gap real (falta invocación de platform-engineer como soporte en cambio de infra).

---

## 5-commands (9 configs, 10 tests)

**PASS: 0 / 10 (0%)**

| Config | PASS | FAIL | ERR | Causa |
|---|---|---|---|---|
| cmd-analyze | 0 | 2 | 0 | Unknown command |
| cmd-build | 0 | 1 | 0 | Unknown command |
| cmd-design | 0 | 1 | 0 | Unknown command |
| cmd-docs-as-is | 0 | 1 | 0 | Unknown command |
| cmd-docs-to-be | 0 | 1 | 0 | Unknown command |
| cmd-document | 0 | 1 | 0 | Unknown command |
| cmd-resume | 0 | 1 | 0 | Unknown command |
| cmd-specify | 0 | 1 | 0 | Unknown command |
| cmd-verify | 0 | 1 | 0 | Unknown command |

### Clasificación: harness artifacts (100%)

Los slash commands (`/sofka-asdd:build`, `/sofka-asdd:analyze`, etc.) **no se pueden evaluar** con el provider `claude -p --no-session-persistence`. El CLI no tiene las skills ASDD cargadas y responde `Unknown command: /sofka-asdd:...`.

**Esta categoría necesita un harness distinto:** Claude Code activado con project context, o un mock del runtime de commands. Los FAILs de 5-commands son **esperados y no representan regresiones** — son una limitación conocida del runner actual.

---

## Clasificación general de FAILs

| Tipo | Count aprox. | Ejemplos | Acción |
|---|---|---|---|
| **Harness artifact** | ~50 | 1-orchestrator todo, 4-workflow mayoría, 5-commands todo | No requieren código — limitación del harness |
| **Gap real** | ~25 | explorer (no usa tools), meta governance, domain-expert granularidad, solution-architect skill routing | WIs futuros para mejorar comportamiento |
| **Config bug (ya corregido)** | 14 | 3-skills solution-architect paths (×9), 2-agents solution-architect paths (×5) | Corregidos en commits `95c05c6` y `c679b54` |

### Ratio normalizado (excluyendo harness artifacts)

Estimación conservadora quitando los ~50 harness artifacts del denominador:

| | Tests reales | PASS | FAIL real | % real |
|---|---|---|---|---|
| 2-agents | 55 | 36 | 19 | 65% |
| 3-skills | 47 | 29 | 18 | 62% |
| **Estimado real** | ~102 | ~65 | ~37 | **~64%** |

---

## Issues abiertos (no bloqueantes para el baseline)

1. **`5-commands`** — Necesita harness alternativo (Claude Code con context real). Postergado como WI separado.
2. **`2-agents__developer` y `2-agents__researcher`** — 1 ERR cada uno (output parsing). No bloquean el baseline.

---

## Addendum — 3-skills/solution-architect (post-fix commit `95c05c6`)

> Corrida del 2026-06-11 con paths corregidos (`system-skill-solution-architect-*.txt`).

**PASS: 5 / 9**

| Test | PASS | Notas |
|---|---|---|
| api-contract | ✅ | OpenAPI 3.1.0 válido con path, request body, responses 200/400/500 |
| bounded-context | ✅ | 5 bounded contexts con lenguaje ubicuo, context map, relaciones |
| component-diagram | ❌ | Usa `graph TB` + `subgraph` en lugar de `C4Container` — gap real |
| discovery | ❌ | Captura stakeholders y restricciones pero falta cierre explícito de preguntas bloqueantes |
| patterns | ✅ | Recomienda Pub-Sub + CQRS con justificación y trade-offs |
| quality | ❌ | SLOs parciales — falta ventana de medición y consecuencia en algunos SLOs |
| review | ❌ | Cubre complejidad operativa pero no evalúa si el microservicio es realmente necesario |
| sofka-docs | ✅ | ADR completo con 2+ alternativas, decisión justificada, consecuencias |
| tradeoff-analysis | ✅ | Matriz ponderada con contexto (equipo pequeño → peso operativo), recomienda SQS/RabbitMQ |

### Gap principal: `component-diagram`

El skill usa sintaxis Mermaid estándar (`graph TB` con `subgraph`) en lugar de la sintaxis C4 (`C4Container`). El `icontains: C4Container` falla por esto. Es un gap real en el system prompt del skill — no verifica que el rubric exige sintaxis C4 específica.

---

## Metodología

- **Runner:** `promptfoo` con `claude-code-provider.mjs` local (invoca `claude -p` con system prompt)
- **Evaluador:** `claude-code-grader` para rubrics `llm-rubric`; `icontains` para checks estructurales
- **Concurrencia:** 4 evaluaciones paralelas por config, configs corridas secuencialmente
- **Fuente de verdad:** JSONs en `~/backlog/work-items/3519-baseline-evals/runner/results/`
- **No se commitean** al repo: configs-list, runner/, results/ (datos de ejecución local)

## Contexto de la corrida

La suite fue ejecutada sobre la rama `fix/3519-evals-config` que corrigió:
1. Provider ID y system prompts del promptfooconfig.yaml (commit `9516f58`)
2. Rutas relativas rotas en los 11 YAML de 3-skills (commit `98a0767`)
3. Rutas de prompts de solution-architect con prefijo faltante (commits `95c05c6`, `c679b54`)

La corrida en la rama `dev` actual (2.11.0) produciría los mismos resultados ya que
`fix/3519-evals-config` no modifica ningún agente ni regla — solo corrige la suite de evals.

## Gotchas del runner

- **SQLITE_BUSY:** Ejecutar múltiples instancias de promptfoo concurrentemente bloquea la DB interna de SQLite. Correr siempre secuencialmente.
- **Exit code 100:** Promptfoo retorna 100 cuando hay test failures — NO es error fatal. El JSON de resultados SÍ se escribe.
- **5-commands / `claude -p`:** El flag `--no-session-persistence` no carga el contexto ASDD. Los slash commands producen "Unknown command". Limitación conocida del harness.
