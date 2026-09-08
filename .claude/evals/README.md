# ASDD Framework — Promptfoo Eval Suite

Suite de evaluaciones automatizadas para el framework ASDD (Agentic Spec Driven Development).

## Objetivo

Detectar inconsistencias en el comportamiento de los agentes ASDD tanto en el **proceso**
(¿sigue los pasos correctos?) como en el **output** (¿el artefacto tiene el formato correcto?).

Es la red de regresión del template: correrla **antes de cada release** y comparar
contra el baseline vigente (ver `BASELINE-2.11.0.md`).

## Estructura

Cada YAML bajo las carpetas de categoría es un **config promptfoo standalone**
(providers + prompts + tests). El `promptfooconfig.yaml` raíz es solo documentación
— la suite se ejecuta con `run-suite.mjs`.

```
.claude/evals/
├── promptfooconfig.yaml          # Stub documental (NO orquesta la suite)
├── run-suite.mjs                 # Runner de la suite completa (cross-OS, sin deps)
├── BASELINE-2.11.0.md            # Baseline de referencia (resultados + triage)
├── prompts/                      # System prompts para agentes y skills
│   ├── system-orchestrator.txt
│   ├── system-agent-{nombre}.txt
│   └── system-skill-{nombre}.txt
├── 1-orchestrator/               # 10 archivos / 33 tests — reglas ORC-000 a ORC-010
├── 2-agents/                     # 12 archivos / 61 tests — agentes
├── 3-skills/                     # 11 archivos / 47 tests — agrupados por agente
├── 4-workflow/                   # 6 archivos / 19 tests — fases WF-001 a WF-006
├── 5-commands/                   # 9 archivos / 10 tests — comandos /sofka-asdd:*
└── 6-rules/                      # 15 archivos / 58 tests — reglas transversales
```

**Total: 63 archivos / 228 tests**

## Dimensiones de evaluación

| Dimensión | Qué verifica | Assertion type |
|---|---|---|
| **PROCESO** | ¿El agente sigue los pasos correctos? | `llm-rubric` + `contains` |
| **OUTPUT** | ¿El artefacto tiene el formato correcto? | `llm-rubric` + `icontains` |

Los `llm-rubric` usan por defecto el mismo provider del test como grader, por lo
que cada test consume ~2 llamadas a la API (generación + calificación).

## Requisitos

```bash
npm install -g promptfoo        # o usar npx (el runner usa npx)
export ANTHROPIC_API_KEY="sk-ant-api..."   # API key de console.anthropic.com
```

> ⚠️ La key de API es del **Claude Developer Platform** (créditos prepagados,
> console.anthropic.com). La suscripción Claude Pro/Max NO genera esta key.

## Ejecución

```bash
cd .claude/evals

# Suite completa (63 configs, ~228 llamadas API)
node run-suite.mjs

# Solo una categoría o archivo (filtro por substring de ruta)
node run-suite.mjs --filter 1-orchestrator
node run-suite.mjs --filter agent-developer

# Un solo config directo con promptfoo
npx promptfoo eval -c 1-orchestrator/orc-000-pure-delegation.yaml

# Explorar resultados en UI
npx promptfoo view
```

Resultados por archivo en `.results/*.json` (gitignored — el baseline consolidado
se documenta en `BASELINE-2.11.0.md`).

## Política de ejecución

- **Obligatorio**: antes de cada release del template (bump de versión en el lock).
- **Recomendado**: tras modificar cualquier system prompt de `prompts/`, agente o regla
  que un eval cubra.
- Comparar siempre contra el baseline vigente: un test que pasaba y ahora falla es
  **regresión**; un test que fallaba en baseline sigue siendo deuda conocida (ver triage).

## Interpretar resultados

- **Pass rate >= 90%**: el agente/skill sigue el comportamiento esperado
- **Pass rate 70-89%**: revisar los tests fallidos — puede haber drift
- **Pass rate < 70%**: el agente necesita actualización en su system prompt o skill

Ante un FAIL, triar: ¿test mal diseñado (rubric exige algo que el prompt no pide)?
¿drift real del prompt? ¿flakiness del grader? Registrar el veredicto en el baseline.

## Multi-provider

La suite está diseñada para poder comparar el mismo ASDD en varios providers.
Los configs traen solo el provider Anthropic; para comparar, agregar providers por CLI:

```bash
npx promptfoo eval -c <archivo>.yaml --providers anthropic:messages:claude-sonnet-4-6 openai:gpt-4o
# requiere OPENAI_API_KEY / GOOGLE_API_KEY según el provider agregado
```

- **Claude Code** (Anthropic) — `anthropic:messages:claude-sonnet-4-6`
- **GitHub Copilot** — `openai:gpt-4o`
- **Gemini Agents** — `google:gemini-1.5-pro`

## Historial de fixes relevantes

- **2026-06-10 (#3519)**: la suite nunca había corrido. Tres defectos de nacimiento
  corregidos: (1) provider id `anthropic:messages` sin modelo en el id →
  `"Anthropic model name is not set"`; (2) `config.system` no es una opción soportada
  por promptfoo → los evals corrían **sin system prompt**; se migró al patrón
  chat-format JSON con var `{{system_prompt}}` (verificado `hasSystem: true`);
  (3) la key `testFiles` del config raíz no existe en promptfoo → `promptfoo eval`
  desde la raíz ejecutaba 0 tests. Ver `BASELINE-2.11.0.md`.
