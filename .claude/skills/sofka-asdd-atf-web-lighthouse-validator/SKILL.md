---
name: sofka-asdd-atf-web-lighthouse-validator
description: Mide Core Web Vitals por flujo con Playwright y los clasifica contra los umbrales de config. Invocado por /sofka-asdd:qa-web-perf.
used_by:
  - command_qa-web-perf
---

## Propósito

Medir performance real (no funcional) sobre los flujos E2E del `execution_plan.json`,
de forma **independiente al flujo CP-by-CP**. NO emite el veredicto funcional del run
(eso es de `/sofka-asdd:qa-web-exec`) — reporta score y verdict de performance por flujo.

## Métricas y clasificación

| Métrica | Good | Needs Improvement | Poor |
|---|---|---|---|
| LCP  | ≤ 2500ms | 2501–4000ms | > 4000ms |
| CLS  | ≤ 0.10 | 0.11–0.25 | > 0.25 |
| FCP  | ≤ 1800ms | 1801–3000ms | > 3000ms |
| INP  | ≤ 200ms | 201–500ms | > 500ms |
| TTFB | ≤ 800ms | 801–1800ms | > 1800ms |

- **Score por flujo** = promedio(puntos LCP, CLS, FCP, INP) con `good=100 · needs_improvement=60 · poor=0`.
- **Verdict:** `PASS` ≥80 · `WARNING` 60-79 · `FAIL` <60 · `NO_DATA` sin medición.
- Override de umbrales → `config.yaml → performance.thresholds`. TTFB se reporta pero NO puntúa.

## Excepciones doctrinales (leer ANTES de modificar)

### Excepción 1 — Playwright Node directo (no MCP black-box)

La medición usa `require('playwright')` directo en [lh-measure-flows.js](../../tools/lh-measure-flows.js),
NO `mcp__playwright__browser_*`. **Misma excepción acotada que VUA** (ver
[sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md](../sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md#excepciones-doctrinales-leer-antes-de-modificar)).

**Razón:**
- Inyectar PerformanceObservers + 3 reps × N flujos vía MCP `browser_evaluate` inflaría el
  transcript (mismo fracaso documentado de VUA con axe-core).
- Un sub-agente `general-purpose` colapsa en *planning mode* (`tool_uses: 0`) en loops largos.

**Acotación:**
- ✅ Solo aplica a `/sofka-asdd:qa-web-perf`. `/sofka-asdd:qa-web-exec` y `/sofka-asdd:qa-web-run` siguen MCP-only (REGLA 6).
- ✅ Los scripts `lh-*` viven en `.claude/tools/` — herramientas determinísticas invocadas por el comando, no agentes.
- ✅ Usan el mismo Chromium de `node_modules/playwright`. Sin MCP server adicional.
- ❌ **PROHIBIDO** replicar este patrón en flujos de ejecución de CPs (violación de REGLA 6 — ver `sofka-asdd-atf-web-executor-invariants.md`).

### Excepción 2 — Limitaciones de medición (declaradas en el reporte)

- **INP pasivo:** sin interacción real simulada no hay entradas `event`, así que INP llega como
  `null` → rating `no_data` → **excluido del score** (no infla con un falso `good`). El reporte
  declara INP como "no medido". Para INP real haría falta simular interacciones (mejora futura opt-in).
- **Caché:** cada repetición usa una página nueva en el MISMO browser context (sesión reutilizada,
  caché parcialmente caliente). No es first-visit puro.
- **Single-viewport** 1366×900, sin throttling de red.

## Inputs (resueltos por el comando /sofka-asdd:qa-web-perf)

| Campo | Origen | Descripción |
|---|---|---|
| `perf_context.json` | `exec-preflight-perf.js` | `app_url`, `auth` (cascada login), `perf_config` (umbrales/reps/wait), `flows[]` con `entry_url`. |
| `credentials.yaml` | `docs/testing/atf-web/config/` | Credenciales del rol (regex `loadCredentials()`, no se loguea). |
| `execution_plan.json → e2e_flows[]` | strategist | Fuente de `critical_flows` (filtrados por `flow_scope`). |
| `session_state_file` (opcional) | `save-session.js` | `storageState` pre-capturado para login no estándar/SSO/MFA. |

## Outputs

```
docs/testing/atf-web/{run_id}/performance/
├── .raw/{e2e_id}.json          # mediciones crudas (N reps) — intermedio
├── lighthouse_{flow_id}.json   # OUTPUT PRIMARIO por flujo (score + verdict + metrics)
└── summary.md                  # tabla resumen de todos los flujos
docs/testing/atf-web/{run_id}/performance_results.json   # consumido por dashboard tab "Performance"
```

Sin mediciones exitosas para un flujo → `lighthouse_{flow_id}.json` con `verdict: "NO_DATA"` y `performance_score: null`.

## Arquitectura de ejecución

El comando `/sofka-asdd:qa-web-perf` invoca esta cadena de scripts atómicos en contexto primario
(no sub-agente — misma doctrina que VUA):

```
exec-preflight-perf.js  → perf_context.json (+auto-trigger strategist si falta execution_plan)
lh-measure-flows.js     → .raw/{e2e_id}.json (Chromium + login cascada, N flujos × reps)
lh-aggregate-results.js → lighthouse_{flow_id}.json + summary.md + performance_results.json
generate-report.js      → report.html tab "Performance"
```

### Cascada de autenticación (cliente-agnóstica)

`lh-measure-flows.js` resuelve el login en 3 niveles:
1. `requires_auth: false` → sin login.
2. `session_state_file` presente → `storageState` (cualquier login: estándar / SSO / MFA — REGLA 8).
3. `login_selectors` de `appweb.yaml` (o genéricos `username|email` + `password` + `submit`) → login por formulario.

Si el Nivel 3 falla → error accionable: configurar `auth.login_selectors` o pre-capturar sesión con `save-session.js`.

## REGLAS

1. **SIEMPRE N mediciones** (`config.yaml → performance.repetitions`, default 3), promediar, clasificar. Nunca 1 sola.
2. **PROHIBIDO inferir/sintetizar** métricas no medidas → `NO_DATA`.
3. **Output primario = `lighthouse_{flow_id}.json`.** Sin él, el dashboard queda vacío.
4. Escribe SOLO en `performance/` y `performance_results.json`. **NO contamina `execution/`.**
5. **NO emite veredicto PASS/FAIL del run** — solo performance por flujo.
6. **Excepciones doctrinales documentadas** arriba — leer antes de modificar la medición.

## KNOWLEDGE ACCESS CONTRACT

> Sigue la doctrina de [`reference/atf-web/sofka-asdd-atf-web-knowledge-access-contract.md`](../../reference/atf-web/sofka-asdd-atf-web-knowledge-access-contract.md). La tabla lista los archivos específicos de este skill.

| Modo | Archivo |
|---|---|
| Read | `docs/testing/atf-web/{run_id}/.tmp/perf_context.json` |
| Read | `docs/testing/atf-web/{run_id}/strategy/execution_plan.json` |
| Read | `docs/testing/atf-web/config/credentials.yaml` |
| Read | `docs/testing/atf-web/config/config.yaml` (excerpt: performance) |
| Read | `docs/testing/atf-web/config/appweb.yaml` (excerpt: performance, app, auth) |
| Read (opcional) | `{session_state_file}` (storageState pre-capturado) |
| Write | `docs/testing/atf-web/{run_id}/performance/lighthouse_{flow_id}.json` |
| Write | `docs/testing/atf-web/{run_id}/performance/summary.md` |
| Write | `docs/testing/atf-web/{run_id}/performance/.raw/{e2e_id}.json` |
| Write | `docs/testing/atf-web/{run_id}/performance_results.json` |

## Referencias

- Core Web Vitals — https://web.dev/articles/vitals
- PerformanceObserver API — https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver
- REGLA 6 (executor): `.claude/reference/atf-web/sofka-asdd-atf-web-executor-invariants.md` — la excepción Playwright Node de este skill NO altera REGLA 6 para flujos de CPs.
- Excepción doctrinal análoga: `.claude/skills/sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md`.
