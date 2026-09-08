---
name: asdd-atf-web-playwright-navigator
description: Navegación black-box en Snapshot Mode via MCP — click, fill, select, hover, detección de SPA y loop detection.
used_by:
  - asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `app_url` | string | URL base de la aplicación |
| `target_path` | string | Path relativo (ej. `/login`, `/dashboard`) |
| `action_sequence` | array | Acciones a ejecutar en orden |
| `timeout_ms` | number | Timeout por acción en ms (default: 10000) |
| `viewport` | object | `{width, height}` — default: `{width: 1440, height: 900}` |

**Estructura de acción:**
```json
{ "type": "click|fill|select|submit|hover|wait|navigate",
  "selector": "texto visible, label, o descripción del elemento",
  "value": "valor a ingresar (solo para fill/select)",
  "description": "descripción legible de la acción" }
```

---

## PASO 1 — Inicializar

1. Configurar viewport (default 1440×900)
2. Navegar a `app_url` + `target_path`
3. Esperar estado interactivo (red idle o DOM estable)
4. Tomar snapshot inicial del DOM (UNA sola vez — el snapshot es caro)

## PASO 2 — Detectar tipo de aplicación

- Snapshot no cambia tras interacción pero URL sí → **SPA**: esperar re-render antes de cualquier verificación
- Iframes relevantes → documentar su existencia (no inspeccionar internamente)
- Overlays o modales activos → registrarlos antes de continuar

## PASO 3 — Ejecutar acciones

Por cada acción en `action_sequence`:
1. Localizar elemento: texto visible → label → placeholder → rol aria → posición relativa
2. Verificar interactuable (visible, habilitado, no cubierto) — usar `browser_evaluate` si el elemento ya fue ubicado antes
3. Ejecutar según `type`
4. Esperar estabilidad del DOM (máx `timeout_ms`)
5. **Verificación selectiva post-acción** (no snapshot completo):
   - Si la acción declara `verify: { url_contains: "..." }` → `browser_evaluate: () => location.href.includes("...")`.
   - Si declara `verify: { selector_visible: "..." }` → `browser_evaluate: (s) => !!document.querySelector(s)`.
   - Si declara `verify: { text_contains: "..." }` → `browser_evaluate: (t) => document.body.innerText.includes(t)`.
   - Si declara `verify: "snapshot"` explícitamente → `browser_snapshot` (legacy, solo si es imprescindible).
   - Si no declara `verify` → confiar en que el click/fill retornó OK; no verificar nada.
6. Registrar: `{action_index, description, selector_found, result, verify_result}` — sin `snapshot_ref` a menos que se haya pedido snapshot completo.

## PASO 4 — Loop detection

Mismo snapshot (misma URL + mismo estado DOM) 3 veces consecutivas → cortar navegación.
Registrar: `{loop_detected: true, stuck_at: url, reason: "pantalla repetida x3"}`
Retornar parcial con `is_complete: false`.

## PASO 5 — Manejo de errores

| Condición | Acción |
|-----------|--------|
| Timeout en acción | Reintentar ×1 con timeout × 1.5; si falla → registrar y continuar |
| Elemento no encontrado | Registrar `selector_not_found` con snapshot; continuar siguiente acción |
| Página no carga | Esperar 3s y reintentar; si falla → `page_load_failed` |
| Error 4xx/5xx visible | Registrar `http_error_detected` con código y continuar |
| Pop-up / alerta JS | Aceptar automáticamente; registrar presencia |

---

## Output

```json
{ "navigation_id": "nav_001", "target_url": "https://app.example.com/dashboard",
  "viewport": { "width": 1440, "height": 900 },
  "is_complete": true, "loop_detected": false,
  "actions_executed": [
    { "action_index": 1, "description": "Click en botón Login",
      "selector_found": "button[text='Login']", "result": "success", "snapshot_ref": "snap_001.png" }
  ],
  "final_url": "https://app.example.com/dashboard",
  "final_snapshot_ref": "snap_005.png", "errors": [] }
```

---

## Modo: navigation_graph

Construye el grafo completo de páginas alcanzables desde `app_url` hasta un tope
configurable, retornando la lista de URLs únicas encontradas.

```
[SKILL: asdd-atf-web-playwright-navigator]
mode: navigation_graph
app_url: {app_url}
max_pages: 50   ← default si no se especifica
```

---

## Modo: navigation_graph
1. Nodo inicial: `app_url` como raíz
2. Por cada página: extraer clickeables que lleven a otra URL (`<a href>`, botones con `onClick→navigate`, formularios con `action`)
3. Solo seguir URLs del mismo dominio exacto (`window.location.hostname`). Ignorar: subdominios distintos, URLs externas, `mailto:`, `tel:`, `javascript:void(0)`
4. Páginas en `critical_flows` se visitan primero
5. Detenerse al alcanzar `max_pages`. Log: `"max_pages alcanzado — {N} páginas no exploradas"`

**Output del grafo:**
```json
{ "navigation_graph": {
    "total_pages": 12, "max_pages_reached": false,
    "nodes": [
      { "id": "p01", "url": "/", "title": "Home", "nav_depth": 0 },
      { "id": "p02", "url": "/inventory.html", "title": "Products", "nav_depth": 1 }
    ],
    "edges": [
      { "from": "p01", "to": "p02", "trigger": "a.nav-link[text='Products']" }
    ],
    "critical_flow_pages": ["/cart.html", "/checkout-step-one.html"]
  } }
```