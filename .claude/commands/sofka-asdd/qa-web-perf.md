---
description: ATF Web performance — mide Core Web Vitals con Playwright sobre los flujos críticos y los clasifica contra config. Independiente del flujo CP-by-CP.
mode: 'agent'
---

## PROPÓSITO

Medir performance real de los flujos críticos sin pasar por CPs — recorre los `e2e_flows`
del `execution_plan.json`, mide Core Web Vitals reales con Playwright Node + PerformanceObserver,
y produce score + verdict (PASS/WARNING/FAIL/NO_DATA) por flujo + tab "Performance" en el dashboard.

**Casos de uso:**
- Auditoría de performance pre-release sobre un run con `execution_plan.json`.
- Línea base de Core Web Vitals para PO / cliente.
- Detección de regresiones de velocidad que los CPs funcionales no capturan.

**NO usar para:** validar comportamiento funcional, ejecutar CPs, ni emitir el veredicto PASS/FAIL del run.

---

## ARQUITECTURA — delegación a scripts atómicos

> **Decisión arquitectónica (igual que VUA):** este comando NO delega a sub-agente ni ejecuta
> el bucle de medición vía MCP `browser_evaluate`. Invoca **scripts Node + Playwright directos**
> (excepción doctrinal acotada — ver [SKILL del validador](../../skills/sofka-asdd-atf-web-lighthouse-validator/SKILL.md#excepciones-doctrinales-leer-antes-de-modificar)).
>
> **Razón:** `general-purpose` como sub-agente colapsa en *planning mode* (`tool_uses: 0`) en loops
> largos; el bucle MCP inflaría el transcript. La lógica vive en scripts reutilizables.

| Paso | Script |
|---|---|
| preflight | [exec-preflight-perf.js](../../tools/exec-preflight-perf.js) |
| medición | [lh-measure-flows.js](../../tools/lh-measure-flows.js) |
| agregación | [lh-aggregate-results.js](../../tools/lh-aggregate-results.js) |
| reporte | [generate-report.js](../../../dashboard/generate-report.js) |

---

## PROHIBICIONES (INVIOLABLES)

⛔ **NO medir con MCP `browser_evaluate` inline** — hay script atómico para eso.
⛔ **NO contaminar `docs/testing/atf-web/{run}/execution/`.** Escribir SOLO en `performance/` y `performance_results.json`.
⛔ **NO emitir veredicto PASS/FAIL del run.** Eso es de `/sofka-asdd:qa-web-exec` o `/sofka-asdd:qa-web-run`.
⛔ **NO inferir/sintetizar métricas no medidas** → `NO_DATA`.
⛔ **NO usar `TodoWrite`.** El progreso se reporta vía banners de texto al final de cada PASO.
⛔ **NO delegar a sub-agente.** El comando ejecuta inline en contexto primario invocando bash.

---

## FLAGS DEL COMANDO

| Flag | Default | Descripción |
|---|---|---|
| `--run-id={X}` | requerido | Run existente con `execution_plan.json` + `e2e_flows[]`. |
| `--flows={...,...}` | de config | Subset de `e2e_id` a medir (override de `flow_scope`/`performance.flows`). |
| `--role={X}` | `admin` | Rol de `credentials.yaml` para login (cuando aplica Nivel 3). |
| `--headed` | OFF | Ejecuta Chromium con UI visible (debug). Default headless. |

---

## PASO 0 — Preflight con auto-trigger del strategist

```bash
node .claude/tools/exec-preflight-perf.js --run-id={run_id} [--flows=E2E-001,E2E-003]
```

**Dispatch según output:**

- **`ok:true, needs_strategist:false`** → continuar a PASO 1.
- **`needs_strategist:true, needs_diagnostics:false`** → invocar `/sofka-asdd:qa-web-strategize` agent, esperar `.done`, re-ejecutar preflight. Si sigue `needs_strategist:true` → ABORT.
- **`needs_strategist:true, needs_diagnostics:true`** → ABORT: `"Falta diagnóstico previo. Ejecutar /sofka-asdd:qa-web-diagnose y /sofka-asdd:qa-web-strategize primero."`
- **`ok:false`** o exit 1 → propagar error (típico: `performance.enabled: false` en appweb.yaml).

**Banner pre-fase:**
```
⚡ [PERF] Fase Performance (Core Web Vitals)
   Run: {run_id} | Flujos: {flows_planned} ({N}) | Skip (ya medidos): {flows_to_skip_count}
   Output: docs/testing/atf-web/{run_id}/performance/
```

Si el preflight devuelve `warnings[]` sobre auth (sin `session_state_file` ni `login_selectors`),
mostrarlos: la medición intentará login genérico y, si falla, marcará los flujos como error.

---

## PASO 1 — Medición (delegado a script)

```bash
node .claude/tools/lh-measure-flows.js --run-id={run_id} \
  --perf-context=docs/testing/atf-web/{run_id}/.tmp/perf_context.json [--role=admin] [--headed]
```

**Eventos esperados** (stdout, una línea JSON por evento):
```json
{"event":"auth_start","requires_auth":true}
{"event":"auth_ok","auth_mode":"storage_state|form_login|none"}
{"event":"flow_start","e2e_id":"E2E-001","url":"...","reps":3}
{"event":"rep_done","e2e_id":"E2E-001","rep":1,"lcp":1820,"fcp":950}
{"event":"flow_done","e2e_id":"E2E-001","successful_reps":3}
{"event":"all_flows_done","stats":{...}}
```

Si un flujo falla todas sus reps (navegación/login) → sus mediciones quedan con `error` y el
agregador lo marcará `NO_DATA`. El comando NO aborta — continúa con los demás flujos.

**Banner:** `✅ [PERF-1] Medición: {flows_measured} flujos OK, {flows_failed} fallidos (auth_mode: {auth_mode})`

---

## PASO 2 — Agregación (promedio + clasificación)

```bash
node .claude/tools/lh-aggregate-results.js --run-id={run_id} \
  --perf-context=docs/testing/atf-web/{run_id}/.tmp/perf_context.json
```

Escribe `performance/lighthouse_{flow_id}.json` (×N) + `performance/summary.md` + `performance_results.json`.
stdout: `{ ok, output_path, flows_total, by_verdict, avg_score }`.

**Banner:** `✅ [PERF-2] Agregación: {flows_total} flujos · {by_verdict} · score promedio {avg_score}`

---

## PASO 3 — Regenerar reporte

```bash
node .claude/dashboard/generate-report.js {run_id}
```

El tab "Performance" se activa automáticamente (si `performance_results.json` existe).

---

## PASO 4 — Banner final

```
✅ FASE PERFORMANCE COMPLETADA
   Run: {run_id} | Flujos: {N} | PASS:{n} WARNING:{n} FAIL:{n} NO_DATA:{n}
   Score promedio: {avg_score}
   📊 Reporte: docs/testing/atf-web/{run_id}/report.html (tab "Performance")
   📁 Detalle: docs/testing/atf-web/{run_id}/performance/lighthouse_{flow_id}.json
```

Si hubo flujos `NO_DATA`:
```
⚠ {n} flujo(s) sin datos (login/navegación fallida). Ver perf_context.json + warnings del preflight.
```

---

## REFERENCIAS

- Skill validador: [`.claude/skills/sofka-asdd-atf-web-lighthouse-validator/SKILL.md`](../../skills/sofka-asdd-atf-web-lighthouse-validator/SKILL.md)
- Preflight: [`.claude/tools/exec-preflight-perf.js`](../../tools/exec-preflight-perf.js)
- Medición: [`.claude/tools/lh-measure-flows.js`](../../tools/lh-measure-flows.js)
- Agregación: [`.claude/tools/lh-aggregate-results.js`](../../tools/lh-aggregate-results.js)
- Umbrales: `config.yaml → performance` · Toggle por app: `appweb.yaml → performance.enabled`
- Pre-captura de sesión (login no estándar/MFA): `node .claude/tools/save-session.js --env <env>`
