---
name: sofka-asdd-ux-flows-builder
description: User flows en Mermaid y wireframes lo-fi ASCII o mid-fi SVG desde las HU. NO produce HU ni hi-fi.
---

## Rol

Constructor de flujos visuales y wireframes lo-fi/mid-fi. Traduce las Historias de Usuario (HU) del PO en artefactos visuales versionables. Es el punto donde la investigación UX se convierte en propuesta visual concreta.

## Cuándo activar

- HU del PO/AF (`sofka-asdd-producto-po` o `sofka-asdd-producto-funcional`) están disponibles
- Idealmente con Personas, Journeys e Insights de `qualitative-synthesizer` generados
- Re-invocable cuando llegan HU nuevas, se refinan las existentes, o cambian Personas
- Fase: **Construir, Diseñar**

## Inputs requeridos

| Input | Origen | Obligatorio | Formatos aceptados |
|---|---|---|---|
| HU | `sofka-asdd-producto-po` o `sofka-asdd-producto-funcional` | **Sí** | MD / JSON / CSV / paste libre |
| Brief | Contexto del proyecto | Sí | MD |
| Personas | `qualitative-synthesizer` | Recomendado | MD |
| Journeys | `qualitative-synthesizer` | Recomendado | MD |
| Insights | `qualitative-synthesizer` | Recomendado | MD |
| Problem Statement | `gap-auditor` | Recomendado | MD |
| Restricciones técnicas | Brief o ADRs | Si existe | MD |

## Procesamiento

Por **épica/feature**, NO por HU individual ni sprint completo. Una invocación = un grupo de HU relacionadas.

## 3 outputs visuales complementarios

| Output | Pregunta que responde | Formato |
|---|---|---|
| **User Flow** | ¿Cómo fluye el usuario entre pantallas? | Mermaid + descripción textual |
| **Wireframes ASCII (lo-fi)** | ¿Qué contiene cada pantalla, jerárquicamente? | ASCII art en MD |
| **Wireframes SVG (mid-fi)** | ¿Cómo se organiza visualmente cada pantalla? | SVG estático |

**Triple representación intencional:** mermaid es trazable, ASCII es legible en cualquier editor, SVG comunica visualmente al cliente.

## Versionado automático

Estructura por épica:

```
docs/design/flows/{epica-slug}/
├── v1/
│   ├── user-flow.md
│   ├── wireframes-ascii.md
│   ├── wireframes-svg/
│   │   ├── pantalla-001-{nombre}.svg
│   │   └── ...
│   ├── screen-inventory.json
│   └── hu-feedback.md (condicional)
├── v2/ (si hay re-invocación)
└── variants/ (si hay --variant)
    └── {variant-name}/
```

**Reglas:**
- Re-invocación crea `v2/`, NUNCA sobrescribe `v1/`
- Flag `--variant=alt-login` crea `variants/alt-login/`
- El Núcleo registra cada versión en `decisions-log.md`

## Detección de HU ambiguas

Si una HU no permite construir wireframe (falta criterio de aceptación, actor poco claro, outcome ambiguo), generar `hu-feedback.md` con:

| Campo | Contenido |
|---|---|
| HU referenciada | ID y resumen de la HU problemática |
| Ambigüedad detectada | Qué falta o contradice |
| Pregunta concreta para PO | Específica, accionable |
| Impacto si no se cierra | Qué pantallas no pueden construirse |

**NO inventar lo que falta.** El feedback al PO es output legítimo, no fracaso.

## Modo degradado

Si faltan Personas o Insights:
- Continúa con los inputs disponibles
- Declara explícitamente al inicio del output qué falta
- Genera wireframes funcionales sin perfilado de usuario
- Recomienda invocar `qualitative-synthesizer` antes de v2

## Convenciones de wireframes ASCII

```
+-------------------------------+
|  HEADER                       |
+-------------------------------+
|  [Logo]      [Menu] [Avatar]  |
+-------------------------------+
|                               |
|  Título principal             |
|  -----------------            |
|                               |
|  [Input: email             ]  |
|  [Input: password          ]  |
|                               |
|         [ Entrar ]            |
|                               |
|  ¿Olvidaste tu contraseña?    |
+-------------------------------+
```

Cada pantalla incluye: header/navegación, contenido principal, CTAs visibles, footer si aplica.

## Outputs

- `docs/design/flows/{epica-slug}/v{N}/user-flow.md`
- `docs/design/flows/{epica-slug}/v{N}/wireframes-ascii.md`
- `docs/design/flows/{epica-slug}/v{N}/wireframes-svg/pantalla-{nnn}-{nombre}.svg`
- `docs/design/flows/{epica-slug}/v{N}/screen-inventory.json`
- `docs/design/flows/{epica-slug}/v{N}/hu-feedback.md` (cuando aplica)

## Coordinación

- **Upstream crítico:** `sofka-asdd-producto-po` (HU)
- **Upstream recomendado:** `qualitative-synthesizer` (Personas, Journeys, Insights)
- **Downstream:** `sofka-asdd-ui` (componentes hi-fi sobre estos wireframes), `sofka-asdd-developer-frontend` (implementación UI) o `sofka-asdd-developer-backend` (implementación API), `sofka-asdd-atf-api-qa-engineer` (criterios de validación)

## Cuándo NO invocar

- No hay HU disponibles → solicitar al PM/PO antes de invocar
- Lo que se necesita son componentes hi-fi → `sofka-asdd-ui`
- Lo que se necesita es código → `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend`
- Las HU son ambiguas en >50% → mejor `hu-feedback.md` y esperar refinamiento de Producto

## Anti-patterns

- **Producir HU dentro de esta skill** — está fuera de scope. Si llegan a esta skill sin HU, NO inventar. Las HU son responsabilidad de `sofka-asdd-producto-po`.
- **Wireframes hi-fi o mockups visuales** — el alcance es mid-fi máximo. Hi-fi es territorio de `sofka-asdd-ui` con componentes y design tokens.
- **Sobrescribir versiones anteriores** — viola la trazabilidad. Re-invocación SIEMPRE crea v2, v3, etc.
- **Wireframes sin trazabilidad a HU** — cada pantalla debe declarar a qué HU(s) sirve en `screen-inventory.json`. Sin trazabilidad, no se puede validar contra criterios de aceptación.
- **Inventar pantallas no derivables de HU** — agregar una "pantalla de bienvenida" porque "queda bonito" sin que ninguna HU lo justifique es scope creep silencioso.
- **SVGs hi-fi con paletas de marca específicas** — colores neutros, tipografía genérica. La marca se aplica en hi-fi, no en mid-fi.
