---
description: ATF Web visual, UX y accesibilidad — escaneo con Playwright y axe-core de las pantallas del plan, con findings por arista. Independiente del flujo CP-by-CP.
mode: 'agent'
---

## PROPÓSITO

Auditar la calidad UX/A11y de la app sin pasar por CPs — recorre **flujos E2E** producidos por el strategist y, por cada pantalla única, ejecuta las **3 aristas siempre**:

- **Visual** — ortografía, anglicismos, microcopy, tipografía, layout, lang/idioma, texto-código en UI
- **Usabilidad** — 10 heurísticas de Jakob Nielsen
- **Accesibilidad** — WCAG 2.1 AA via axe-core 4.11.4 con locale `es`

**Casos de uso:**
- Auditoría QA pre-release sobre un run que ya tiene `execution_plan.json`
- Demo de calidad UX integral para PO / cliente
- Discovery de hallazgos que los CPs funcionales no detectan

**NO usar para:** ejecutar CPs, validar comportamiento funcional, generar veredicto PASS/FAIL del run.

---

## ARQUITECTURA — delegación a scripts atómicos

> **Decisión arquitectónica clave:** este comando NO ejecuta el bucle de pantallas via MCP `browser_evaluate` ni delega a sub-agente `Agent:Executor`. En su lugar, invoca **scripts Node + Playwright directos** (excepción doctrinal documentada en [SKILL del validador](../skills/sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md#excepciones-doctrinales-leer-antes-de-modificar)).
>
> **Razón:** dos intentos previos colapsaron:
> 1. El executor de tipo `general-purpose` retornaba `tool_uses: 0` (planning mode, fabricaba la respuesta).
> 2. Bucle MCP `browser_evaluate` inflaba el transcript con 589 KB del bundle axe-core por pantalla y reinventaba lógica que ya vive en helpers compartidos.
>
> **Solución actual:** el comando es un orquestador de ~5 invocaciones bash. La lógica completa (auth, scan, build, aggregate) vive en scripts:
>
> | Paso | Script | Tiempo aprox |
> |---|---|---|
> | scan auth | [vua-scan-pages-direct.js](../tools/vua-scan-pages-direct.js) | ~9 min para 13 pantallas |
> | re-scan login anon | [vua-scan-single-anon.js](../tools/vua-scan-single-anon.js) | ~30 s |
> | build findings | [vua-build-findings.js](../tools/vua-build-findings.js) | <1 s |
> | aggregate | [aggregate-vua-results.js](../tools/aggregate-vua-results.js) | <1 s |
> | regenerate report | [generate-report.js](../../dashboard/generate-report.js) | <2 s |
>
> **Total wall-clock:** ~10 min para un run de 13 pantallas. Costo en transcript: ~5-6 tool calls bash (no 250).

---

## PROHIBICIONES (INVIOLABLES)

⛔ **NO ejecutar el bucle de pantallas con MCP `browser_evaluate` inline.** Hay scripts atómicos para eso. Reinventarlos paga 250+ tool calls y reinventa el wheel.
⛔ **NO contaminar `docs/testing/atf-web/{run}/execution/`.** El comando escribe SOLO en `docs/testing/atf-web/{run}/visual-ux-a11y/`.
⛔ **NO modificar `result.json` por CP.** El modo VUA no se asocia a CPs individuales.
⛔ **NO emitir veredicto PASS/FAIL del run.** Esto es trabajo de `/sofka-asdd:qa-web-exec` o `/sofka-asdd:qa-web-run`. VUA solo reporta findings.
⛔ **NO saltar fases ni aristas.** Las 3 aristas (visual + usabilidad + accesibilidad) ejecutan SIEMPRE — sin flags de opt-out por arista.
⛔ **NO delegar a sub-agente.** El comando ejecuta inline en el contexto primario invocando bash.

---

## RENDIMIENTO

⛔ **NO usar `TodoWrite` para tracking del comando.** El progreso se reporta vía banners de texto al final de cada PASO.
⛔ **NO hacer reads exploratorios** sobre `docs/testing/atf-web/{run}/`. Las rutas vienen de `vua_context.json` (preflight).
⛔ **NO leer el `axe_runtime_snippet` del vua_context.json** (~589 KB). El bundle vive en `node_modules/axe-core/axe.min.js` y los scripts lo cargan desde disco directamente. Solo se necesita la metadata del context (URL, auth, pages).

---

## FLAGS DEL COMANDO

| Flag | Default | Descripción |
|---|---|---|
| `--run-id={X}` | requerido | Run existente con execution_plan + e2e_flows. |
| `--flows={...,...}` | todos | Subset de flows a auditar (filtrado en preflight). |
| `--app-language={...}` | de appweb.yaml | Override del idioma esperado. |
| `--deep-llm` | OFF | Activa **PASO 6.5 (revisión LLM cross-pantallas)** que detecta defectos de copy/UX writing que las reglas determinísticas no atrapan. Costo: ~1 turno LLM con snapshot consolidado de textos. |
| `--role={X}` | `admin` | Rol de credentials.yaml para login (cuando `requires_auth: true`). |
| `--headed` | OFF | Ejecuta Chromium con UI visible (debug). Default headless. |

---

## PASO 0 — Preflight con auto-trigger del strategist

### 0.1 — Invocar preflight

```bash
node .claude/tools/exec-preflight-vua.js \
  --run-id={run_id} \
  [--flows={E2E-001,E2E-003}] \
  [--app-language={es-CO}]
```

**stdout esperado** (JSON):

```json
{
  "ok": true,
  "needs_strategist": false | true,
  "needs_diagnostics": false | true,
  "flows_planned": ["E2E-001", "E2E-003"],
  "pages_planned_count": N,
  "pages_to_skip_count": N,
  "vua_context_path": "docs/testing/atf-web/{run_id}/.tmp/vua_context.json",
  "warnings": []
}
```

### 0.2 — Dispatch según preflight

- **`ok: true, needs_strategist: false`** → continuar a PASO 1.
- **`needs_strategist: true, needs_diagnostics: false`** → invocar `/sofka-asdd:qa-web-strategize` agent, esperar `.done`, re-ejecutar preflight. Si sigue `needs_strategist: true` después → ABORT.
- **`needs_strategist: true, needs_diagnostics: true`** → ABORT con mensaje: `"Falta diagnóstico previo. Ejecutar /sofka-asdd:qa-web-diagnose y /sofka-asdd:qa-web-strategize primero."`
- **`ok: false`** o exit 1 → propagar error (típicamente `visual_ux_a11y.enabled: false`).

### 0.3 — Banner pre-fase

```
🎨 [VUA] Fase Visual + UX + A11y (delegación a scripts atómicos)
   Run: {run_id}
   Flows planificados: {flows_planned} ({N})
   Pantallas a analizar: {pages_planned_count - pages_to_skip_count} (skip resume: {pages_to_skip_count})
   Output base: docs/testing/atf-web/{run_id}/visual-ux-a11y/
```

### 0.4 — Si `pages_to_skip_count == pages_planned_count`

TODAS las pantallas tienen findings.json válidos del schema actual → **modo resume puro**:
- Saltar PASOS 1-3 (no re-escanear).
- Ejecutar solo PASO 4 (build findings — barato), PASO 6 (aggregate), PASO 7 (regenerate).
- Banner final declara `(modo resume)`.

---

## PASO 1 — Scan multi-página con auth (delegado a script)

> Este PASO sustituye lo que en versiones previas era un bucle MCP `browser_evaluate` por pantalla. La lógica vive completa en `vua-scan-pages-direct.js`: launch Chromium, login al app_url, iterar las pantallas planificadas, inyectar axe-core inline (CSP-safe via `new Function(src)()`) con locale `es`, capturar screenshot + `page_scan_phase_a.json` por pantalla.

### 1.1 — Invocar scanner

```bash
node .claude/tools/vua-scan-pages-direct.js \
  --run-id={run_id} \
  --vua-context=docs/testing/atf-web/{run_id}/.tmp/vua_context.json \
  [--role=admin] \
  [--headed]
```

**Eventos esperados** (stdout, una línea JSON por evento):

```json
{"event":"login_start","app_url":"..."}
{"event":"login_ok"}
{"event":"page_start","index":1,"url":"..."}
{"event":"page_done","index":1,"slug":"...","violations":N,"by_impact":{"critical":N,...}}
...
{"event":"all_pages_done","stats":{"pages_completed":N,"pages_aborted":N,...}}
```

### 1.2 — Validar output

Por cada `page` en `vua_context.pages` (sin `skip_reason`), debe existir:

- `page.output_dir/page_scan_phase_a.json` — output crudo del scan
- `page.output_dir/screenshot_clean.png` — captura sin overlays

Si alguna pantalla aborta (browser crash, navegación falla, axe no carga) → `page_blocked.json` con `{ reason, error, timestamp, page_url }`. El comando NO aborta — continúa con las siguientes pantallas.

### 1.3 — Banner

```
✅ [VUA-1] Scan auth completado: {pages_completed}/{pages_planned} pantallas, {pages_aborted} abortadas
```

---

## PASO 2 — Re-scan login en estado anónimo (auth_state)

> Razón: la sesión persistente del PASO 1 hace que `/auth/login` redirija a `/dashboard` y enmascare la pantalla real de login. Para auditarla limpia se necesita un browser context nuevo sin cookies.

### 2.1 — Identificar pantalla de login

Buscar en `vua_context.pages[]` la entrada cuya `page_url` matchee `/auth/login`. Tomar su `output_dir`, `flow_refs[]`, `page_index`, `page_slug`.

Si no hay pantalla de login en el plan → SKIP a PASO 3.

### 2.2 — Invocar scanner anon

```bash
node .claude/tools/vua-scan-single-anon.js \
  --url={login_page_url} \
  --out-dir={login_page_output_dir} \
  --vua-context=docs/testing/atf-web/{run_id}/.tmp/vua_context.json \
  --flow-refs={E2E-001,E2E-002,E2E-003,E2E-004,E2E-005} \
  --page-index={N} \
  --page-slug={slug}
```

Sobrescribe `page_scan_phase_a.json` y `screenshot_clean.png` de esa pantalla con la versión anon (`auth_state: "anonymous"`).

### 2.3 — Banner

```
✅ [VUA-2] Login re-escaneado en estado anónimo
```

---

## PASO 3 — (Opcional, NO en versión actual) Captura dinámica

> **Estado:** NO implementado en la versión actual. El preflight + dedup cross-flow ya cubre las pantallas con `entry_url` distintos en `execution_sequence`. Si una app futura tiene flows con modales/drawers no descubiertos via URL, aquí se agregaría un script `vua-discover-dynamic.js` que itere `execution_sequence` y dispare `vua-scan-pages-direct` sobre los URLs nuevos.
>
> Por ahora: SKIP. El banner final declara `Pantallas dinámicas descubiertas: 0`.

---

## PASO 4 — Build findings (Fase B determinística)

> Aplica las reglas determinísticas de las 3 aristas a cada `page_scan_phase_a.json` y produce el `findings.json` consumido por el aggregator.
>
> Cobertura aplicada: ver [SKILL del validador § Cobertura por arista](../skills/sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md#cobertura-por-arista-versión-actual).

### 4.1 — Invocar builder

```bash
node .claude/tools/vua-build-findings.js \
  --vua-context=docs/testing/atf-web/{run_id}/.tmp/vua_context.json
```

**Output:** un `findings.json` por pantalla con shape:

```json
{
  "flow_refs": ["E2E-001", ...],
  "page_url": "...",
  "page_slug": "...",
  "scanned_at": "ISO",
  "scan_status": "completed",
  "fase_a_complete": true,
  "fase_b_complete": true,
  "axe_version": "4.11.4",
  "axe_locale": "es",
  "stability_strategy": "networkidle | fixed_timeout",
  "auth_state": "authenticated | anonymous",
  "page_type": "login | logout | form | list | dashboard | unknown",
  "findings": [...],
  "summary": { ... }
}
```

### 4.2 — Validar

Por cada `page` con `page_scan_phase_a.json` debe existir el `findings.json` correspondiente con `scan_status: "completed"`.

### 4.3 — Banner

```
✅ [VUA-4] Findings construidos: {pages_built} pantallas, {total_findings} findings (pre-dedup)
```

---

## PASO 5 — Escribir `vua_summary.json`

```bash
node -e "
require('fs').writeFileSync(
  'docs/testing/atf-web/{run_id}/visual-ux-a11y/vua_summary.json',
  JSON.stringify({
    run_id: '{run_id}',
    mode: 'visual_ux_a11y',
    delegated_to_scripts: true,
    started_at: '{vuaStartedAt}',
    ended_at: new Date().toISOString(),
    pages_planned: {pages_planned_count},
    pages_completed: {pages_completed},
    pages_aborted: {pages_aborted},
    pages_skipped_resume: {pages_to_skip_count},
    flows_processed: {flows_planned}
  }, null, 2)
);"
```

---

## PASO 6 — Agregación cross-pantallas

```bash
node .claude/tools/aggregate-vua-results.js --run-id={run_id}
```

stdout: `{ ok, output_path, flows_scanned, pages_total, pages_with_findings, pages_aborted, total_findings, phase_status }`.

El aggregator deduplica findings cross-pantalla con `normalizeSelector()` (colapsa selectores Vue scoped, data-IDs numéricos, `:nth-child(N)`).

---

## PASO 6.5 — Revisión LLM cross-pantallas (SOLO si `--deep-llm`)

> Este paso EXISTE y se ejecuta UNICAMENTE si el QA invocó el comando con
> `--deep-llm`. Sin el flag → saltar a PASO 7.

### 6.5.1 — Preparar input consolidado

```bash
node .claude/tools/vua-deep-llm-bridge.js --mode=prepare \
  --run-id={run_id} \
  --output=docs/testing/atf-web/{run_id}/.tmp/vua_deep_llm_input.json
```

Lee todas las `page_scan_phase_a.json` y emite un JSON con `pages[].texts_sample`,
`cta_labels`, `headings`, `instructions` y `expected_output_shape`.

### 6.5.2 — Turno LLM (contexto primario)

El contexto primario lee el archivo y genera el análisis con el siguiente prompt:

```
Eres un revisor experto de UX writing en {app_language}. Lee el JSON
adjunto (vua_deep_llm_input.json) y, siguiendo `instructions`, produce
EXACTAMENTE un objeto JSON con shape:

{
  "findings": [
    {
      "page_slug": "...",                  // de pages[].page_slug
      "agrupador": "visual" | "usabilidad",
      "rule_id": "kebab-case-corto",       // ej: copy-microcopy-ambiguo
      "severity": "critical|serious|moderate|minor",
      "nielsen": <int 1..10> | null,
      "message": "qué encontraste, citando texto",
      "recommendation": "cómo corregirlo",
      "confidence": "high|medium|low"
    }
  ]
}

REGLAS:
- NO repitas hallazgos que reglas determinísticas ya cubren (axe-core,
  ortografía regex, jerga técnica obvia, anglicismos comunes).
- Solo `critical` para textos que engañan o bloquean al usuario.
- Si no encuentras nada nuevo en una pantalla, omitirla del array.
- Output JSON estricto, sin texto envolvente.
```

Persistir la respuesta:

```bash
# El contexto primario escribe el JSON crudo retornado por el LLM:
node -e "require('fs').writeFileSync(
  'docs/testing/atf-web/{run_id}/.tmp/vua_deep_llm_findings.json',
  JSON.stringify({findings: <array_emitido_por_llm>}, null, 2)
)"
```

### 6.5.3 — Merge al agregado

```bash
node .claude/tools/vua-deep-llm-bridge.js --mode=merge \
  --run-id={run_id} \
  --findings-file=docs/testing/atf-web/{run_id}/.tmp/vua_deep_llm_findings.json
```

stdout: `{ ok, accepted, rejected, duplicated, rejection_reasons }`.

El bridge:
- Valida shape de cada finding (page_slug existente, severity válida, etc.).
- Deduplica contra findings determinísticos por (agrupador, rule_id, page_slug).
- Mergea `accepted` al `visual_ux_a11y_results.json` con `source: "deep-llm"`.
- Marca `agg.deep_llm = { executed: true, ...stats }`.

Banner:

```
🤖 [VUA-deep-llm] Findings agregados: {accepted} (rechazados: {rejected}, dup: {duplicated})
```

---

## PASO 7 — Regenerar reporte

```bash
node .claude/dashboard/generate-report.js {run_id}
```

El tab "Visual + UX + A11y" se activa automáticamente.

---

## PASO 8 — Banner final

```
✅ FASE VISUAL + UX + A11Y COMPLETADA
   Run: {run_id}
   Flujos analizados: {flows_scanned}
   Pantallas estáticas: {pages_completed_static}/{pages_planned_static}
   Pantallas dinámicas descubiertas: 0 (no implementado en versión actual)
   Hallazgos totales: {total_findings} ({by_agrupador} · {by_severity})
   Phase status: {phase_status}

   📊 Reporte: docs/testing/atf-web/{run_id}/report.html (tab "Visual + UX + A11y")
   📁 Detalle por pantalla: docs/testing/atf-web/{run_id}/visual-ux-a11y/_pages/{NN}_{slug}/findings.json
```

Si `phase_status !== "completed"`:
```
⚠ Fase {partial|aborted}: {pages_aborted} pantallas no se pudieron analizar.
```

---

## REFERENCIAS

- Skill validador (cobertura completa por arista): [`.claude/skills/sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md`](../skills/sofka-asdd-atf-web-visual-ux-a11y-validator/SKILL.md)
- Preflight: [`.claude/tools/exec-preflight-vua.js`](../tools/exec-preflight-vua.js)
- Scanner multi-página: [`.claude/tools/vua-scan-pages-direct.js`](../tools/vua-scan-pages-direct.js)
- Scanner login anon: [`.claude/tools/vua-scan-single-anon.js`](../tools/vua-scan-single-anon.js)
- Builder de findings (10 Nielsen + tipografía + ortografía): [`.claude/tools/vua-build-findings.js`](../tools/vua-build-findings.js)
- Helpers compartidos: [`.claude/tools/lib/vua-scan-helpers.js`](../tools/lib/vua-scan-helpers.js), [`.claude/tools/lib/vua-spelling-rules.js`](../tools/lib/vua-spelling-rules.js)
- Aggregator: [`.claude/tools/aggregate-vua-results.js`](../tools/aggregate-vua-results.js)
- Bridge LLM (--deep-llm): [`.claude/tools/vua-deep-llm-bridge.js`](../tools/vua-deep-llm-bridge.js)
- Config bloque: `appweb.yaml → visual_ux_a11y` (default OFF)
- Render: tab `Visual + UX + A11y` en `.claude/dashboard/dashboard.html` (`renderUX()`) consumiendo `docs/testing/atf-web/{run_id}/visual_ux_a11y_results.json`

---

## NOTA HISTÓRICA — POR QUÉ NO USA SUB-AGENTE NI BUCLE MCP INLINE

Versión inicial del comando delegaba al `Agent:Executor` (executor de tipo `general-purpose`). El sub-agente colapsaba en "planning mode" y retornaba con `tool_uses: 0` — fabricaba la respuesta sin ejecutar tool calls reales (run de 2026-05-06 con exit `VUA_DIR_MISSING` post-ejecución).

**Fix v1 (2026-05-06):** ejecución inline en contexto primario via MCP `browser_evaluate` en bucle por pantalla. Funcionó pero pagaba ~250 tool calls por run + 589 KB del bundle axe-core inflados en cada `browser_evaluate` + reinventaba lógica.

**Fix v2 (2026-05-06, vigente):** delegación a scripts atómicos Node + Playwright directo. ~5-6 tool calls bash por run completo. La lógica vive en `tools/*.js` reutilizables. Mantiene auditabilidad (cada bash retorna eventos JSON línea-por-línea).

**Excepción doctrinal:** los scripts usan `require('playwright')` directo en vez de MCP `browser_*`. Esto cruza el principio "MCP black-box" del framework, pero está acotado a esta fase y documentado como **excepción justificada** en el SKILL del validador (axe-core 589 KB en `browser_evaluate` es prohibitivo). `/sofka-asdd:qa-web-exec` y `/sofka-asdd:qa-web-run` mantienen MCP-only intacto.
