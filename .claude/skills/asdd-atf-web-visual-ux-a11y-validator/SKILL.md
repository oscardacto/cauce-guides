---
name: asdd-atf-web-visual-ux-a11y-validator
description: Audita pantallas — accesibilidad, heurísticas Nielsen, tipografía, layout y ortografía ES. Invocado por /asdd:qa-web-visual-ux-a11y.
used_by:
  - command_visual-ux-a11y
---

## Cobertura por arista (versión actual)

| Arista | Cobertura determinística | Cobertura LLM (`--deep-llm`) |
|---|---|---|
| **Accesibilidad** | axe-core 4.11.4 con locale **es** aplicado nativamente — ~90 reglas WCAG 2.1 AA. Mensajes y descripciones en español. | — (axe ya es estándar de industria) |
| **Usabilidad** | **10 heurísticas Nielsen completas** (N1-N10) detectadas por patrones URL + DOM + cta_labels + affordances + layout. Incluye: ausencia heading, breadcrumbs, jerga técnica en CTAs, falta de cancel/undo, CTAs inconsistentes/mezcla idiomática, credenciales en login, inputs sin label/placeholder, sin atajos de teclado en forms extensos, overflow horizontal, touch targets <24×24px, mensajes de error genéricos, ausencia de affordances de ayuda. | Microcopy ambigua, mensajes no accionables, tono inconsistente, CTAs poco claras (verbo abstracto). |
| **Visual** | lang-mismatch / atributo lang ausente, predominio idioma incorrecto, texto-código en UI, **inconsistencia de familias tipográficas**, **jerarquía rota en headings (h1 vs h2 size)**, **diccionario regex de errores ortográficos ES** (haver/iba/tildes interrogativas/diacrítico está/más/aún/conjunción y-e), **anglicismos comunes** (link/password/username/login/logout/search/update), **microcopy genérica** (doble espacio, puntuación con espacio antes, comillas duplicadas, tres puntos ASCII, mayúsculas sostenidas, jerga técnica leak — `null`/`undefined`/`HTTP 5xx`/stack trace, error code sin explicación). | Errores ortográficos sutiles que el regex no atrapa (concordancia, conjugación en contexto), tono inconsistente cross-página. |

**No cubierto** (review humano o LLM):
- ❌ Contraste de elementos NO-text (iconos, separadores) — fuera de axe-core
- ❌ Layout pixel-perfect (alineación visual, espaciado decorativo) — requiere visual diff
- ❌ Animaciones / transiciones / motion sickness — requiere observación temporal
- ❌ Multi-viewport (mobile, tablet) — viewport actual es 1366×900 fijo

---

## Excepciones doctrinales (leer ANTES de modificar)

Esta skill cruza dos líneas que el resto del framework respeta. Las excepciones son acotadas, justificadas y se documentan aquí como SSoT — modificarlas requiere revalidación contra principios rectores.

### Excepción 1 — Playwright Node directo (no MCP black-box)

El plan original prescribía `mcp__playwright__browser_evaluate` para inyectar axe-core. La implementación real usa `require('playwright')` directo en [vua-scan-pages-direct.js](../../tools/vua-scan-pages-direct.js) y [vua-scan-single-anon.js](../../tools/vua-scan-single-anon.js).

**Razón:** axe-core 4.11.4 son ~589 KB de JS minificado. Inyectarlos vía `browser_evaluate` por cada `page_url` (×13 pantallas en OrangeHRM) inflaba el transcript del LLM en ~7.6 MB de payload literal — inviable. La alternativa CDN está bloqueada por CSP `script-src` de la app real.

**Acotación de la excepción:**
- ✅ Solo aplica a la fase `/asdd:qa-web-visual-ux-a11y`. `/asdd:qa-web-exec` y `/asdd:qa-web-run` siguen MCP-only por REGLA 6.
- ✅ Los scripts `vua-scan-*` viven en `.claude/tools/` (no en `agents/`) — son herramientas determinísticas invocadas por el comando, no agentes.
- ✅ Usan el mismo Chromium del `node_modules/playwright`. No requieren MCP server adicional.
- ❌ **PROHIBIDO** replicar este patrón en cualquier flujo de ejecución de CPs. Si alguien plantea "usar Playwright directo en /asdd:qa-web-exec porque es más rápido" → violación de REGLA 6 documentada en `asdd-atf-web-executor-invariants.md`.

### Excepción 2 — Fase B determinística por default + Fase C LLM opt-in

El plan original prescribía LLM por pantalla. La implementación actual divide la responsabilidad:

- **Fase B = determinística (default ON):** 10 heurísticas Nielsen + reglas tipográficas + diccionario de ortografía/anglicismos/microcopy ES codificadas en [vua-build-findings.js](../../tools/vua-build-findings.js) + [lib/vua-spelling-rules.js](../../tools/lib/vua-spelling-rules.js).
- **Fase C = LLM cross-pantallas (opt-in `--deep-llm`):** UN turno LLM con snapshot consolidado de todas las pantallas, dedicado a defectos semánticos que el regex no atrapa. Bridge de validación + dedup en [vua-deep-llm-bridge.js](../../tools/vua-deep-llm-bridge.js).

**Razón de la división:**
- **Reproducibilidad** del baseline: la mayoría de errores (ortografía común, tildes, anglicismos, jerga técnica, layout, tipografía) son detectables determinísticamente. Mismo input → mismo output. Auditable para compliance.
- **Costo controlado:** Fase B no consume tokens LLM. Fase C consume ~1 turno por run, no por pantalla.
- **Doctrina prosa-vs-código (CLAUDE.md):** reglas determinísticas son código; reasoning semántico es LLM. La división respeta el principio.
- **Proactividad:** Fase B ya emite hallazgos antes del review humano. Fase C amplifica el alcance sin ser obligatoria.

**Cobertura residual (NO cubierta ni siquiera con Fase C):**
- ❌ Contraste de elementos no-text (iconos) — fuera de axe-core.
- ❌ Layout pixel-perfect / alineación visual — requiere visual diff.
- ❌ Animaciones / motion sickness — requiere observación temporal.
- ❌ Multi-viewport — viewport actual fijo 1366×900.

Estos requieren review humano explícito. El reporte HTML los declara via banner de cobertura.

---

## Inputs (resueltos por el comando /asdd:qa-web-visual-ux-a11y)

| Campo | Origen | Descripción |
|-------|--------|-------------|
| `vua_context.json` | `exec-preflight-vua.js` | Contexto consolidado: `app_url`, `auth.requires_auth`, `auth.default_role`, `pages[]` con `flow_refs[]` deduplicados, `a11y_config`, `app_language`, `ui_terminology_glossary`. |
| `credentials.yaml` | `docs/testing/atf-web/config/` | Credenciales del rol (regex parsing en `loadCredentials()`, no se loguea). |
| `node_modules/axe-core/axe.min.js` | npm | Bundle axe-core 4.11.4 cargado inline para bypass CSP. |
| `pages[].flow_refs[]` | preflight | IDs de flows E2E que comparten esa pantalla (resultado del dedup cross-flow). |

---

## Outputs

Por cada pantalla escaneada (1 invocación de `vua-scan-pages-direct.js` cubre todas):

```
docs/testing/atf-web/{run_id}/visual-ux-a11y/_pages/{NN}_{slug}/
├── page_scan_phase_a.json    # output crudo de Fase A (axe + visual + dom sample)
├── findings.json             # 3 aristas unificadas (Fase A + Fase B determinística)
├── screenshot_clean.png      # captura sin overlays
└── page_blocked.json         # SOLO si scan_status="aborted" (browser crash, axe no carga, etc.)
```

Si la pantalla aborta:
- NO se escribe `findings.json` ni `page_scan_phase_a.json`.
- SÍ se escribe `page_blocked.json` con `{ reason, error, timestamp, page_url }`.
- El comando continúa con la siguiente pantalla (no detiene fase entera).

Agregado final (1 archivo por run):
```
docs/testing/atf-web/{run_id}/visual_ux_a11y_results.json   # consumido por dashboard tab "Visual + UX + A11y"
```

---

## REGLAS

1. **3 aristas SIEMPRE.** Visual + Usabilidad + Accesibilidad cubiertas en cada pantalla. Sin flags de opt-out por arista (decisión KISS de primera versión).
2. **Fase A antes de Fase B.** Si Fase A aborta el browser de una pantalla, Fase B ni se intenta para esa pantalla (las otras siguen).
3. **Findings sin selector → tipo `recomendacion`.** Sucede en Fase B determinística (ej. `form_sin_h1`, `logout_sin_confirm`) — patrón general por tipo de pantalla, sin selector específico.
4. **`screenshot_clean.png` opcional.** Si la captura falla → registrar warning, los findings siguen siendo válidos (selector + descripción son suficientes para reproducir).
5. **PROHIBIDO inventar selectores.** Si un finding determinístico no puede aislar selector observable, marcar `selector: null` + `evidence_status: "general_observation"` + `tipo: "recomendacion"`.
6. **Excepciones doctrinales documentadas.** Antes de modificar Fase A (Playwright Node) o Fase B (sin LLM) → leer sección "Excepciones doctrinales" arriba.

---

## Arquitectura de ejecución

El comando `/asdd:qa-web-visual-ux-a11y` invoca esta cadena de scripts atómicos en contexto primario (no sub-agente — ver nota histórica al final):

```
vua-scan-pages-direct.js   →  page_scan_phase_a.json (×N pantallas auth)
vua-scan-single-anon.js    →  page_scan_phase_a.json (re-scan login anónimo)
vua-build-findings.js      →  findings.json (×N) — Fase B determinística + merge
aggregate-vua-results.js   →  visual_ux_a11y_results.json (dedup + summary global)
generate-report.js         →  report.html con tab "Visual + UX + A11y"
```

Helpers compartidos: [lib/vua-scan-helpers.js](../../tools/lib/vua-scan-helpers.js) — carga axe inline, inyección CSP-safe, scan unificado, persistencia atómica.

---

## PASO 1 — Fase A: Determinística (Playwright Node)

`vua-scan-pages-direct.js` ejecuta:

1. **Login persistente.** `loginOrangeHRM(page, app_url, creds)` con credenciales del rol resueltas via regex de `credentials.yaml`. Sesión se reutiliza entre pantallas en el mismo browser context.
2. **Por cada `page` en `vua_context.pages[]`** (filtrando `skip_reason`):
   - `page.goto(page_url, { waitUntil: 'domcontentloaded', timeout: 25000 })` + wait 1.5s.
   - `helpers.scanCurrentPage(page, axeSource, standards)`:
     - Inyecta bundle inline via `new Function(axeSrc)()` (bypass CSP).
     - `axe.run(document, { runOnly: { type: 'tag', values: standards } })`.
     - Extrae `visual.code_in_ui[]` (regex `f(...)` o `obj.method(`).
     - Extrae `dom.texts[]` (≤200 textos visibles únicos), `dom.headings[]` (h1-h4).
   - Si `scan.ok=false` → `page_blocked.json` + continuar.
   - Si OK → `persistPageArtifacts()`: screenshot + `page_scan_phase_a.json`.
3. **Login page re-scan anónimo.** `vua-scan-single-anon.js` con `--url=.../auth/login --out-dir=.../01_web_indexphp_auth_login` para evitar enmascaramiento por sesión activa.

**Output Fase A** (`page_scan_phase_a.json`):

```json
{
  "flow_refs": ["E2E-001", "E2E-002"],
  "page_index": 3,
  "page_url": "https://app.example.com/admin/...",
  "page_slug": "...",
  "scanned_at": "ISO",
  "axe_version": "4.11.4",
  "axe_standards": ["wcag2a", "wcag2aa"],
  "auth_state": "authenticated | anonymous",
  "violations_count": N,
  "violations_by_impact": { "critical": N, "serious": N, ... },
  "violations": [ /* axe violations con nodes[] mapeados */ ],
  "incomplete_count": N,
  "passes_count": N,
  "visual": { "lang_attr": "...", "page_title": "...", "code_in_ui": [...] },
  "dom": { "texts": [...], "headings": [...], "page_title": "..." }
}
```

---

## PASO 2 — Fase B: Determinística (heurísticas codificadas)

`vua-build-findings.js` consume cada `page_scan_phase_a.json` y produce `findings.json` con las 3 aristas unificadas.

### 2.1 — Mapeo de violations axe → findings accesibilidad

Por cada `violations[i].nodes[j]`:
- Severity: `axe.impact` literal (`critical | serious | moderate | minor`).
- WCAG: derivar de `tags[]` que matchea `wcag\d+` (ej. `wcag412` → `wcag412`).
- Tipo: `critical|serious` → `hallazgo`; `moderate|minor` → `hallazgo` (default; sin LLM-confidence para reclasificar).

```json
{
  "id": "F-NNN",
  "agrupador": "accesibilidad",
  "tipo": "hallazgo",
  "rule_id": "{axe.id}",
  "wcag": "{wcag tag}",
  "nielsen": null,
  "severity": "...",
  "selector": "{node.target.join(' ')}",
  "message": "{axe.help}",
  "recommendation": "{axe.description}",
  "evidence_status": "captured",
  "evidence_file": "screenshot_clean.png",
  "confidence": "high",
  "source": "axe-core"
}
```

### 2.2 — Heurísticas determinísticas Nielsen / visual

Reglas codificadas en `vua-build-findings.js` (no LLM):

| Patrón disparador | Finding | Agrupador | Severity | Nielsen / WCAG |
|---|---|---|---|---|
| `visual.lang_attr === ''` | `lang-attribute-missing` | visual | serious | (visual) |
| `lang_attr.split('-')[0] !== app_language.split('-')[0]` Y `dom.texts` predominio inglés | `lang-mismatch` / `ui-language-mismatch` | visual | serious / moderate | (visual) |
| Pantalla de tipo `form` (URL `/save`, `/edit`) sin `dom.headings` con h1-h4 | `form_sin_encabezado_jerarquico` | usabilidad | moderate | N1 (Visibilidad estado) |
| Pantalla de tipo `login` con credenciales de prueba visibles en DOM | `credenciales_demo_visibles` | usabilidad | serious | N5 (Prevención errores) |
| Pantalla `form` sin botón `Cancel` o `Atrás` cerca del botón submit | `form_sin_cancel_visible` | usabilidad | minor | N5 (Prevención errores) |
| Pantalla `logout` que redirige sin mensaje "Sesión cerrada" | `logout_sin_confirmacion_visible` | usabilidad | minor | N1 (Visibilidad estado) |
| `axe violations[].id === 'label'` Y agrupador=accesibilidad | Correlación → finding adicional `inputs_sin_label_dificulta_errores` | usabilidad | serious | N9 (Ayuda con errores) |
| `code_in_ui[]` no vacío (post-filtro `ui_terminology_glossary`) | `code_text_in_ui` | visual | moderate | (visual) |

**Reclasificación tipo:**
- `severity in [critical, serious]` → `hallazgo`
- `severity in [moderate, minor]` Y `selector !== null` → `hallazgo`
- `severity in [moderate, minor]` Y `selector === null` → `recomendacion`

### 2.3 — Construir findings.json final

```json
{
  "flow_refs": ["E2E-001", "E2E-002"],
  "page_url": "...",
  "page_slug": "...",
  "scanned_at": "ISO",
  "scan_status": "completed",
  "fase_a_complete": true,
  "fase_b_complete": true,
  "axe_version": "4.11.4",
  "auth_state": "authenticated | anonymous",
  "findings": [ /* array unificado: accesibilidad + usabilidad + visual */ ],
  "summary": {
    "total": N,
    "by_agrupador": { "accesibilidad": N, "usabilidad": N, "visual": N },
    "by_tipo": { "hallazgo": N, "recomendacion": N },
    "by_severity": { "critical": N, "serious": N, "moderate": N, "minor": N, "info": N }
  }
}
```

---

## PASO 3 — Agregación cross-pantallas

`aggregate-vua-results.js` consume todos los `findings.json` bajo `_pages/` y produce `visual_ux_a11y_results.json` con:

- **Dedup semántico:** clave `agrupador||rule_id||selector` para findings con selector. Si selector ausente, fallback a `agrupador||rule_id||first_50_chars(message)`.
- **Consolidación cross-flow:** un finding visto en N pantallas se reporta UNA vez con `seen_in_pages: [{ flow_refs[], page_slug, page_url, evidence_file }]`.
- **Summary global:** `total_findings`, `by_agrupador`, `by_severity`, `top_wcag[]`, `top_nielsen[]`.
- **Phase status:** `completed | partial | aborted` según ratio `pages_with_findings / pages_total`.

---

## Nota histórica — POR QUÉ NO USA SUB-AGENTE

El plan original (2026-05-04) delegaba la ejecución a un sub-agente vía `Agent:Executor` con `mode: "visual_ux_a11y"`. Tres runs reales (2026-05-05/06) confirmaron:

- Sub-agente `general-purpose` colapsa en "planning mode" para tareas long-loop con 13+ pantallas + decisiones repetidas.
- En el último run aborto: retornó con `tool_uses: 0` (fabricó toda la respuesta sin llamadas reales). Verificado: `VUA_DIR_MISSING` en disco.

**Decisión:** ejecutar la cadena en contexto primario. Trade-off: ~250 tool calls reales en la sesión activa (alto pero auditable) vs sub-agente que fabrica. El comando `/asdd:qa-web-visual-ux-a11y` documenta esto explícitamente en su PASO 0.

La sección "MODO `visual_ux_a11y`" de `atf-web-steps/execute.md` queda como **referencia conceptual NO canon de invocación**.

---

## Referencias

- `axe-core` — https://www.deque.com/axe/core-documentation/api-documentation/
- WCAG 2.1 AA criteria — https://www.w3.org/WAI/WCAG21/quickref/
- Jakob Nielsen 10 Usability Heuristics — https://www.nngroup.com/articles/ten-usability-heuristics/
- Doctrina prosa-vs-código: `CLAUDE.md` § "Doctrina de implementación"
- REGLA 6 (executor): `.claude/reference/atf-web/asdd-atf-web-executor-invariants.md` — la excepción Playwright Node de esta skill NO altera REGLA 6 para flujos de CPs
