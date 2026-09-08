# ATF Web — MODO `visual_ux_a11y` (referencia conceptual)

> Extraído de `.claude/atf-web-steps/execute.md` para sacarlo del piso de contexto
> que el executor paga en cada batch. **No es spec invocable**: la lógica vigente del
> modo VUA vive inline en `.claude/commands/asdd/qa-web-visual-ux-a11y.md`.
> Se conserva como referencia del flujo conceptual.

## MODO `visual_ux_a11y` (REFERENCIA CONCEPTUAL — NO canon de invocación)

> **⚠ NO INVOCAR ESTE MODO COMO SUB-AGENTE.** El comando `/asdd:qa-web-visual-ux-a11y` ejecuta su flujo INLINE en el contexto primario, NO delegando a `Agent:Executor`.
>
> **Por qué:** runs reales (2026-05-06) confirmaron que el sub-agente `general-purpose` colapsa en "planning mode" cuando recibe tareas con bucles largos + decisiones contextuales. Retorna con `tool_uses: 0`, fabricando la respuesta sin ejecutar tool calls reales. Resultado: `docs/testing/atf-web/{run_id}/visual-ux-a11y/` queda vacío.
>
> **Doctrina vigente:** la lógica del modo VUA (auth, bucle de pantallas, captura dinámica, agregación) vive INLINE en `.claude/commands/asdd/qa-web-visual-ux-a11y.md`. Esta sección permanece como **referencia conceptual** del flujo, NO como spec invocable de sub-agente.
>
> **Si en el futuro se prueba que un sub-agente sí ejecuta tool calls correctamente para esta tarea**, esta sección puede re-elevarse a spec canónica de invocación. Por ahora, es solo referencia.

NO afecta el flujo CP-by-CP normal (modo default `cp_targets`).

### Activación

El executor detecta el modo leyendo el primer campo de su contexto recibido. Si `mode === "visual_ux_a11y"`:

- **NO** lee `cp_targets[]`, `cp_modulo_*.json`, `result.json` por CP, `headless_results.json`, ni invoca `db-validator` ni `nav-learning` durante el bucle.
- Lee `vua_context.json` (path en `--vua-context-path`) que trae:
  - `flows[]` con metadata
  - `pages[]` array ordenado: `{ flow_id, page_index, page_url, page_slug, output_dir, skip_reason? }`
  - `axe_runtime_snippet` y `axe_call_snippet` pre-compilados
  - `a11y_config` (sub-objeto consolidado de appweb.yaml)
  - `app_language`, `auth` (requires_auth + role + mfa_type)
  - `output_base_dir`

### Doctrina

- 1 invocación del skill `visual-ux-a11y-validator` por pantalla (NO por step ni por flow).
- Browser MCP abierto UNA vez al inicio del modo, cerrado UNA vez al final. Sin abrir/cerrar por pantalla.
- `auth-handler` se invoca UNA vez al inicio si `vua_context.auth.requires_auth === true`.
- Las 3 aristas (visual + usabilidad + accesibilidad) ejecutan SIEMPRE — sin flags de opt-out.
- Pantallas con `skip_reason === "findings_already_exist"` se omiten silenciosamente (resume).
- Errores por pantalla NO detienen la fase entera — escribir `page_blocked.json` y continuar con la siguiente.

### Flujo

**PASO V1 — Browser open + auth (una vez)**

```
[TOOL: mcp__playwright__browser_navigate]
url: "about:blank"
```
Si `vua_context.auth.requires_auth === true`:
```
[SKILL: asdd-atf-web-auth-handler]
credentials_role: vua_context.auth.default_role
mfa_type: vua_context.auth.mfa_type
session_state_file: vua_context.auth.session_state_file
app_url: vua_context.app_url o flows[0].entry_url
```
Si auth falla → escribir `output_base_dir/phase_blocked.json` con `reason: "auth_failed"` y DETENER.

**PASO V2 — Inject axe-core (una vez por dominio principal)**

```
[TOOL: mcp__playwright__browser_evaluate]
function: vua_context.axe_runtime_snippet
```
Si retorna `installed: false` → escribir `phase_blocked.json` con `reason: "axe_runtime_failed"` y DETENER.

> Nota: en navegaciones cross-origin axe puede necesitar re-inject. El skill `visual-ux-a11y-validator` re-invoca el snippet por pantalla si detecta `window.__atfA11yScan` ausente — idempotente.

**PASO V3 — Análisis estático: pantallas pre-planificadas (cross-flow dedup)**

Las `vua_context.pages[]` vienen del preflight tras dedup cross-flow (F1). Cada `page` tiene `flow_refs[]` con todos los flows que la comparten — la pantalla se analiza UNA sola vez aunque sea entry de múltiples flows.

POR cada `page` en `vua_context.pages` (filtrar `page.skip_reason` si presente):

```
1. browser_navigate(page.page_url)
2. browser_wait_for(time: 1.5)
3. [SKILL: asdd-atf-web-visual-ux-a11y-validator]
     flow_refs: page.flow_refs                  # array, NO string único
     page_url: page.page_url
     page_slug: page.page_slug
     output_dir: page.output_dir                # ej: visual-ux-a11y/_pages/01_login/
     a11y_config: vua_context.a11y_config
     app_language: vua_context.app_language
     ui_terminology_glossary: vua_context.a11y_config.ui_terminology_glossary
     axe_runtime_snippet: vua_context.axe_runtime_snippet
     axe_call_snippet: vua_context.axe_call_snippet
4. Marcar URL canónica como analyzed → set global `analyzedUrls`.
5. Imprimir progreso:
   🎨 [VUA-static] {page.flow_refs.join(',')} · {page.page_slug} → {scan_status} · {findings_count} findings
```

Mantener `analyzedUrls = Set<string>` global del run, inicializado con `canonicalUrl(page.page_url)` para cada `page` ya analizada en V3 (incluyendo pantallas con `findings.json` previo del resume).

**PASO V4 — Captura dinámica: recorrido de flows con descubrimiento de pantallas (F2)**

Esta fase ejecuta los `execution_sequence[]` de cada flow para descubrir pantallas que el preflight NO conoce estáticamente (modales, drawers, pantallas post-login, redirects).

POR cada `flow` en `vua_context.flows[]`:

1. **Re-navegar al entry** del flow:
   ```
   browser_navigate(flow.entry_url)
   browser_wait_for(time: 1.5)
   ```
   La sesión auth de PASO V1 sigue activa (storage state restaurado).

2. **Verificar URL post-navigate**:
   ```
   url0 = browser_evaluate(() => window.location.href)
   ```
   Si `canonicalUrl(url0)` NO está en `analyzedUrls` Y la pantalla no tiene `findings.json` previo:
   - Construir `output_dir = visual-ux-a11y/_pages/{NN}_{slug-from-url}/` (NN incremental).
   - Invocar skill VUA con `flow_refs: [flow.e2e_id]` (descubierta dinámicamente; el aggregator agregará otros flows si descubren la misma URL).
   - Agregar a `analyzedUrls`.

3. **POR cada `step` en `flow.execution_sequence[]`**:

   a. Interpretar `step.action` y ejecutarlo (similar al modo CP-by-CP, pero con tolerancia a fallos):
      - Si `action` empieza con `Navegar a /xxx` o contiene URL absoluta → `browser_navigate(url)`.
      - Si `action` describe click/input → usar role/text matching de Playwright MCP. Si el elemento NO se encuentra en 2 reintentos → registrar warning + saltar a siguiente step (NO abortar el flow).
      - Si `action` es verificación pasiva ("Validar X") → solo `browser_wait_for(time: 0.5)` y continuar.

   b. Capturar URL post-step:
      ```
      urlN = browser_evaluate(() => window.location.href)
      ```

   c. Si `canonicalUrl(urlN) !== canonicalUrl(url_anterior)` Y NO está en `analyzedUrls`:
      - Verificar `analyzedUrls.size < pages_per_flow_max * flows_count` (anti-runaway global).
      - Construir `output_dir = visual-ux-a11y/_pages/{NN}_{slug-from-url}/`.
      - Invocar skill VUA con `flow_refs: [flow.e2e_id]`.
      - Agregar a `analyzedUrls`.
      - Imprimir: `🎨 [VUA-dyn] {flow.e2e_id} · descubierto: {page_slug} → {scan_status}`

   d. Actualizar `url_anterior = urlN` para próxima comparación.

4. **Tras el último step del flow**, opcionalmente capturar URL final si cambió respecto al penúltimo análisis.

> **Tolerancia a fallos:** si un step falla la interpretación (selector ambiguo, elemento ausente), el executor NO detiene el flow — emite warning y continúa con el siguiente step. La meta es DESCUBRIR pantallas, no completar el flow funcionalmente. Si la mayoría de steps fallan, el flow simplemente descubre pocas pantallas — lo cual es un signal honesto del estado del flow.

> **Anti-runaway:** el descubrimiento dinámico se detiene si `analyzedUrls.size >= pages_per_flow_max * flows.length`. Esto es un guardrail global por si un flow descubre dozenas de URLs (lazy loading, navegación profunda).

**PASO V5 — Cleanup**

```
[TOOL: mcp__playwright__browser_close]
```

Escribir `output_base_dir/vua_summary.json` para auditoría del executor (NO es el agregado final — eso lo hace `aggregate-vua-results.js` post-fase):

```json
{
  "run_id": "...",
  "started_at": "...",
  "ended_at": "...",
  "pages_planned_static": N,
  "pages_completed_static": N,
  "pages_discovered_dynamic": N,
  "pages_aborted": N,
  "pages_skipped": N,
  "analyzed_urls": ["url1", "url2", "..."],
  "total_findings_aggregated": N
}
```

> `pages_planned_static` = pantallas pre-planificadas por preflight (post-dedup cross-flow).
> `pages_discovered_dynamic` = pantallas descubiertas durante el recorrido del flow en PASO V4.
> Métrica de cobertura efectiva = `pages_completed_static + pages_discovered_dynamic` vs flows × pantallas teóricas.

### Reglas inviolables del modo

1. **NO leer `cp_modulo_*.json` ni `result.json` por CP.** El modo opera sobre pantallas, no CPs.
2. **NO escribir en `execution/{module_id}/`.** El modo escribe SOLO en `docs/testing/atf-web/{run_id}/visual-ux-a11y/`.
3. **NO invocar db-validator ni nav-learning.** Esos son del modo CP-by-CP.
4. **NO emitir veredicto PASS/FAIL.** El modo VUA reporta findings; el veredicto del run sale del modo CP-by-CP normal.
5. **NO marcar fail por pantalla aborted.** El comando recibe `phase_status` agregado (completed | partial | aborted) — la decisión de bloquear release la toma el QA / PO leyendo el reporte.
6. **Resume idempotente.** Si una pantalla ya tiene `findings.json`, saltarla. Si tiene `page_blocked.json` → re-ejecutar (puede haber sido blocker transitorio).
