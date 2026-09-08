---
name: asdd-atf-web-highlight-injector
description: Inyecta resaltado verde PASS / rojo FAIL en el DOM antes del screenshot, con scroll-into-view y auto-cleanup.
used_by:
  - asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `selector` | string | Selector CSS del elemento a resaltar |
| `color` | `"green"` \| `"red"` | Verde = PASS, Rojo = FAIL |
| `screenshot_path` | string | Ruta de salida del screenshot PNG |
| `mode` | `"inject"` \| `"capture"` \| `"full"` | Fase individual o ciclo completo |
| `cleanup_ms` | number (opcional) | Tiempo antes del auto-cleanup. Default: **30000 ms** (30 seg). Cubre latencia MCP roundtrip (~16-19 seg entre inject y screenshot). Bajar a 5000 solo si se confirma baja latencia. |
| `click_after_capture` | boolean (opcional) | Si `true`, el setTimeout dispara `el.click()` tras limpiar los estilos — consolida highlight+screenshot+click en 2 calls. Ver modo click-atómico abajo. Default: `false`. |

---

## Protocolo (2 calls por step)

## Patrón recomendado — generación via CLI

### Modo optimizado: inject-once + call-only

**Preferir este modo.** Instala el runtime UNA VEZ por page load, luego invoca
sin bash spawn en cada step. Ahorra ~8-10s de Node.js spawn por step en Windows.

**Paso A — Instalar runtime (1 vez por page):**
```bash
RUNTIME=$(node .claude/tools/snippets/highlight.js --inject-runtime)
```
`browser_evaluate` con `$RUNTIME` → instala `window.__atfHighlight(sel, col, cleanupMs, clickAfter)`.
Repetir solo tras `browser_navigate` a nueva URL.

**Paso B — Invocar por step (sin bash):**
Opción 1 (con bash, ~1 línea de output):
```bash
CALL=$(node .claude/tools/snippets/highlight.js --call-only --selector '<sel>' --color green)
```
Opción 2 (sin bash, directo en evaluate):
```
() => window.__atfHighlight("<selector>", "green", 30000, false)
```
Ambas opciones son válidas — la función canónica ya fue instalada via Paso A.

**Protocolo por step:**
1. `[TOOL: browser_evaluate]` con call-only snippet o invocación directa
2. `[TOOL: browser_take_screenshot]` → PNG

2 calls/step (vs 3 del modo legacy). En un CP de 7 steps: 1 bash (runtime) + 7×2 evaluate+screenshot = **15 calls** vs 25 del modo legacy.

### Modo legacy: snippet completo por step

**Usar solo como fallback** si `window.__atfHighlight` no está disponible
(ej: navegación intermedia no detectada que recargó la página).

```bash
node .claude/tools/snippets/highlight.js \
  --selector '<selector canónico>' \
  --color <green|red> \
  --cleanup <ms> \
  --click-after <true|false>
```

El stdout del CLI es el snippet JS listo para pasar directo como `code` a
`browser_evaluate`. El sub-agente hace:

1. `[TOOL: Bash]` → captura el snippet en una variable
2. `[TOOL: browser_evaluate]` con el snippet capturado
3. `[TOOL: browser_take_screenshot]` → PNG

Eso preserva el protocolo de 2 calls para el browser (lo que cuenta para
latencia) + 1 Bash (~200ms-10s según OS) que ahorra la regeneración mental del IIFE.

**Cuando NO usar el CLI:**
- Apps sin Bash disponible (poco probable en ATF — Bash siempre está).
- Experimentación iterativa donde quieres modificar parámetros del IIFE —
  entonces usa `--raw` para obtener solo el cuerpo de la función y lo llamas
  manualmente con tus argumentos.

---

## Regla dura — PROHIBICIÓN de cleanup manual

**PROHIBIDO invocar `browser_evaluate` extra para limpiar los estilos
(`el.style.outline=''`, etc.) después del screenshot.**

El cleanup va **SIEMPRE** en el `setTimeout` interno del inject (PASO 1). Si
detectas un escenario donde el cleanup debe ocurrir antes (ej: el outline
visible entre steps confunde al usuario), **NO agregues una tool call extra** —
reduce `cleanup_ms` al mínimo necesario (1500-2000 ms).

Si el screenshot no se capturó dentro de la ventana (evidence_status = "capture_failed"
porque los estilos ya se limpiaron), **aumenta `cleanup_ms`** — no agregues
cleanups manuales que duplican el costo.

---

## Estilos CSS por color

```
green:
  outline:       3px solid #18A34A
  outlineOffset: 2px
  boxShadow:     0 0 12px rgba(24,163,74,0.5)

red:
  outline:       3px solid #E02020
  outlineOffset: 2px
  boxShadow:     0 0 12px rgba(224,32,32,0.5)
```

---

## PASO 1 — Inject con auto-cleanup inline (1 call)

Inyecta estilos, guarda los originales y programa el cleanup automático.
No requiere `browser_wait_for` — el screenshot se captura inmediatamente tras este call.

> ⛔ **El JS de inyección NO se reproduce aquí.** Usar exclusivamente `exec_context.highlight_runtime_snippet` (precargado por `knowledge-excerpt.js` al inicio del executor). Ese campo contiene el IIFE completo listo para pasar a `browser_evaluate`.
>
> ```
> RUNTIME ← exec_context.highlight_runtime_snippet   # JS ya en memoria — NO generar inline
> browser_evaluate(RUNTIME)                           # instala window.__atfHighlight() en el DOM
> ```
>
> Si `exec_context.highlight_runtime_snippet` es null o undefined → fallback bash:
> ```bash
> RUNTIME=$(node .claude/tools/snippets/highlight.js --inject-runtime)
> browser_evaluate(RUNTIME)
> ```
>
> **NUNCA reproducir el JS de `window.__atfHighlight` de memoria o desde este spec.** El modelo no puede garantizar que su versión "de memoria" sea idéntica al runtime canónico compilado por `highlight.js`. Reproducirlo manually anula el cache, consume tokens innecesariamente y puede diferir del runtime real.

El runtime instalado expone: `window.__atfHighlight(selector, color, cleanupMs, clickAfterCapture)`.
- `color`: `"green"` (PASS) o `"red"` (FAIL)
- `cleanupMs`: default `30000` — NO reducir (latencia MCP ~16-19 seg)
- `clickAfterCapture`: `false` por defecto; `true` solo en modo click-atómico

Retorna `{ injected, in_viewport, in_iframe, cleanup_scheduled_ms, click_scheduled }`.
Si `injected: false` con `reason: 'selector_not_found'` → continuar sin highlight (no bloquear el CP).

---

## PASO 2 — Capture (protocolo resiliente — REGLA 18 del executor)

Dispara **inmediatamente** después de PASO 1 — sin `browser_wait_for` intermedio.
El screenshot debe completarse antes de que el `setTimeout` de PASO 1 limpie
los estilos y (opcionalmente) dispare el click.
> **NOTA LATENCIA MCP:** El roundtrip entre `browser_evaluate` (inject) y
> `browser_take_screenshot` (capture) tarda ~16-19 seg en Claude Code. El
> `cleanup_ms` DEBE ser mayor que esta latencia. Default: 30000 ms. Con
> 2000 ms los highlights se auto-limpian ~14 seg ANTES del screenshot.
**Fase 1 — Captura:**
```
[TOOL: browser_take_screenshot] → {data}
```

**Fase 2 — Escritura atómica:**
Si `data` válido (longitud > 100):
```bash
node -e "const b=Buffer.from('{data}','base64');require('fs').writeFileSync('{screenshot_path}',b);const s=require('fs').statSync('{screenshot_path}');if(s.size<100)throw new Error('PNG too small: '+s.size)"
```
- Exit 0 → `evidence_status: "captured"`
- Exit != 0 → Fase 3

**Fase 3 — Registro de fallo (no bloquea):**
```json
{ "evidence_status": "capture_failed", "evidence_error": "{motivo}" }
```
No detener el CP. No marcar paso como FAIL por fallo de screenshot.

---

## mode: "full" — Ciclo completo (2 calls)

Ejecuta PASO 1 → PASO 2 en secuencia. El cleanup es automático vía setTimeout
dentro de PASO 1. No hay PASO 3 (wait) ni PASO 4 (clean) en este protocolo.

---

## mode: "inject" / "capture" — Legacy manual

Para agentes que necesiten control manual del ciclo (caso raro, normalmente
solo `full` se usa). `mode: inject` ejecuta solo PASO 1; `mode: capture`
ejecuta solo PASO 2. El cleanup siempre es automático — no existe `mode: "clean"`.

---

## Modo click-atómico (OPT-IN por step)

Cuando el step del CP consolida "resalta + captura + haz click" en una sola
acción (ej: CP-M5-001 step 5 de SauceDemo — click X del menú tras capturar),
usar `click_after_capture: true`. El setTimeout interno del inject dispara
`el.click()` DESPUÉS de limpiar estilos — aprovecha el mismo tool call que
ya iba a ocurrir para cleanup.

**Cuándo usarlo:**
- Step tipo "click y verifica estado cerrado/modificado" donde el click NO
  necesita su propia tool call separada.
- App con click handlers estándar (React con `.click()` JS también funciona —
  el snippet usa `el.click()` directo).

**Cuándo NO usarlo:**
- Apps enterprise con page loads lentos donde la ventana de `cleanup_ms` (~2 s)
  puede cerrarse antes de que la acción termine de procesar. En esos casos:
  capturar primero, clickear después con una tool call explícita.
- Cualquier step donde el CP declara verificación post-click que requiere
  timing preciso.
- Cualquier step cuyo click necesita fill previo o encadena múltiples
  acciones — el click atómico es para un solo click sin dependencias.

**Default: `false`.** El executor decide activarlo por step, no el skill lo
asume. Si no se pasa → comportamiento idéntico al modo 2-calls puro.

**Output adicional:** cuando `click_scheduled: true`, el agente invocador sabe
que el click ya fue disparado por el setTimeout — NO debe invocar su propio
click tras este skill. Verificar estado post-acción con `browser_evaluate`
dirigido (REGLA 22 del executor).

---

## Heurística de activación automática

> **Motivación:** un step terminal con click puede usar 4 tool calls (highlight
> pre-click + click + highlight post-click + screenshot). Con click-atómico
> activado, ese mismo step se resuelve en 2 calls (highlight+screenshot+click
> consolidado). Para CPs de 7-8 steps con varios clicks terminales: ahorro de
> 4-8 tool calls por CP, equivalente a 8-16 segundos de roundtrip MCP.

El executor DEBE activar `click_after_capture: true` automáticamente cuando se
cumplen TODAS estas condiciones:

1. El verbo del step (extraído de `step.text` o `steps_raw` línea N) coincide
   con un **click puro**: `clic`, `click`, `pulsar`, `presionar`, `seleccionar`
   (botón/enlace/opción), `hacer clic`.
2. El step **NO** tiene texto de fill previo en el mismo step (`ingresar`,
   `escribir`, `digitar`, `completar campo`).
3. El **siguiente** step NO declara verificación con timing crítico
   (`verificar inmediatamente`, `confirmar antes de`, `assert que ... < N ms`).
   Si el siguiente step empieza con `verificar`/`confirmar` SIN cualificadores
   de timing → SÍ se puede usar click-atómico (la verificación llega después
   del cleanup natural).
4. El selector resuelto es un elemento "clickable estándar":
   `button`, `a[href]`, `input[type=submit|button]`, `[role=button]`,
   `[data-test=*-button]`, `[data-test=submit-*]`.

**Cuando se cumplen las 4 condiciones**, el executor pasa
`click_after_capture: true` al skill y NO emite un `browser_click` separado.
El click ocurre automáticamente tras cleanup del highlight.

**Cuando NO se cumplen** (cualquier condición fallida) → comportamiento default
(`click_after_capture: false`) y el executor emite `browser_click` por separado.

**Verificación post-click:** sigue rigiendo la REGLA 22 del executor — el
agente DEBE confirmar el efecto del click con un `browser_evaluate` dirigido
o snapshot diff antes de marcar el step como ✅. La heurística solo elimina
calls REDUNDANTES, no las verificaciones legítimas.

**Override por configuración:** si `appweb.yaml → test_run.disable_atomic_click: true`,
la heurística se desactiva globalmente para esa app (útil en apps enterprise
con event loops lentos donde el click atómico es frágil).

---

## Output

```json
{
  "injected": true,
  "color": "green|red",
  "selector": "{selector}",
  "in_iframe": false,
  "cleanup_scheduled_ms": 2000,
  "click_scheduled": false,
  "evidence_status": "captured|capture_failed|not_captured",
  "evidence_error": null,
  "screenshot_path": "{screenshot_path}"
}
```

El agente que invoca registra `verification.highlight_selector` y `verification.highlight_color`
en el step del result.json con los valores devueltos. Si `in_iframe: true`, también
registrar `verification.highlight_iframe: true` — útil para debug de navegación nested.
Si `click_scheduled: true`, el agente NO invoca su propio click tras este skill —
verifica estado directamente.
