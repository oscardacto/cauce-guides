---
name: sofka-asdd-ui-design-tokens
description: Gestiona design tokens con Tailwind v4 @theme — importa, genera, valida y sincroniza entre Figma y código.
---

## Rol

Gestionar el ADN visual del proyecto como sistema de design tokens. Importa tokens desde Figma, entregables UX o guías de marca; los configura en Tailwind v4 `@theme`; y garantiza que ningún componente use valores hardcodeados. Es la primera skill en ejecutarse en cualquier flujo del agente UI.

## Cuándo activar

- El usuario pide configurar, exportar o importar design tokens
- Se inicia un proyecto nuevo (setup/scaffolding)
- Se reciben tokens base desde sofka-asdd-ux o archivo JSON/CSS externo
- Se detecta que el proyecto no tiene `@theme` configurado
- Fase: **Construir**

## Fuentes de tokens por flujo

| Flujo | Fuente | Acción |
|---|---|---|
| Flujo 1 (UX sync) | Entregables en `docs/ux/` o archivo de tokens del agente UX | Importar y mapear a `@theme` |
| Flujo 2 (Figma) | Figma MCP — variables y estilos extraídos vía `get_design_context` | Extraer y mapear a `@theme` |
| Flujo 3 (HU/Specs) | Guía de marca, HU o specs del diseñador/PO | Generar propuesta base; marcar `[PENDIENTE]` lo que falte |

## Taxonomía de tokens

| Categoría | Tokens mínimos | Ejemplo |
|---|---|---|
| **Color** | primary, secondary, accent, neutral, semantic (success, warning, error, info) | `--color-primary-500: #4F46E5` |
| **Tipografía** | font-family (display, body, mono), font-size (scale 6+), font-weight, line-height | `--font-display: 'Playfair Display', serif` |
| **Espaciado** | Escala base 4px (4, 8, 12, 16, 24, 32, 48, 64, 96) | `--spacing-4: 1rem` |
| **Bordes** | radius (sm, md, lg, full), border-width, border-color | `--radius-md: 8px` |
| **Sombras** | sm, md, lg, xl, 2xl (5 niveles de elevación) | `--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)` |
| **Superficies** | page, card, elevated, dark, accent | `--color-surface-card: #FFFFFF` |
| **Movimiento** | duration (fast, normal, slow), easing (ease-in, ease-out, spring) | `--duration-normal: 200ms` |

## Estructura de archivos de salida

```
src/styles/
├── theme.css          ← @theme con todos los tokens
├── tokens.json        ← tokens en formato JSON (para exportación a Figma)
└── README-tokens.md   ← documentación auto-generada del sistema
```

## Formato de theme.css

```css
@import "tailwindcss";

@theme {
  /* Color */
  --color-primary-50: #EEF2FF;
  --color-primary-500: #4F46E5;
  --color-primary-900: #312E81;
  /* ... */

  /* Typography */
  --font-display: 'Playfair Display', serif;
  --font-body: 'Source Sans 3', sans-serif;
  /* ... */

  /* Spacing — escala base 4px */
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  /* ... */

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Sistema de superficies (2-3 niveles mínimo, no todo blanco) */
  --color-surface-page: #F8FAFC;          /* fondo general de la app */
  --color-surface-card: #FFFFFF;           /* cards normales */
  --color-surface-elevated: #F1F5F9;       /* cards destacadas, hover states */
  --color-surface-dark: var(--color-primary-900);  /* hero card oscuro focal */
  --color-surface-accent: var(--color-accent-50);  /* card tintada con acento */

  /* Sistema de elevación con shadows (5 niveles) */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.15);
  /* ... */

  /* Motion */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 500ms;
}
```

## Reglas de validación

1. **Cero hardcoded:** ningún componente debe usar valores literales de color, tamaño o espaciado. Todo referencia a tokens.
2. **Completitud:** las 6 categorías de la taxonomía deben tener al menos los tokens mínimos definidos.
3. **Consistencia escala:** los espaciados deben seguir la escala base-4 (4, 8, 12, 16, 20, 24, 32, 48, 64, 96). Los tamaños tipográficos deben seguir una escala modular (ratio ~1.25 o ~1.333). Los saltos entre niveles de spacing deben aproximar ratio áureo (1.618) para proporciones armónicas.
3b. **Font import obligatorio:** toda fuente declarada en `--font-*` debe tener su `@import` o `<link>` correspondiente, y debe aplicarse en `@layer base { html { font-family: ... } }`. Sin esto, el browser usa system-ui y los pesos altos no se renderizan.
4. **Naming:** tokens usan kebab-case con prefijo de categoría (`--color-`, `--font-`, `--spacing-`, `--radius-`, `--shadow-`, `--duration-`).
5. **Modo degradado:** si la fuente no provee alguna categoría completa, generar valores razonables Y marcar con `/* [PENDIENTE] — sin definición de marca, valor estimado */`.
6. **Sistema de superficies obligatorio:** definir mínimo 3 niveles (`surface-page`, `surface-card`, `surface-elevated`) más al menos UN nivel focal (`surface-dark` o `surface-accent`). Sin esto, las vistas tienden a quedar "todo blanco plano" que el stakeholder describe como outdated.
7. **5 niveles de shadow obligatorios** (`sm`, `md`, `lg`, `xl`, `2xl`). Cada nivel debe ser perceptiblemente más fuerte que el anterior. `shadow-md` es el default para action cards (no `shadow-sm`).
8. **Proporción 85/10/5 respetada en tokens:** si la marca define proporción (ej. dominante 85% + secundario 10% + acento 5%), los tokens deben reflejarlo en su uso recomendado. Documentar en `README-tokens.md` qué token va a qué porcentaje del viewport.
9. **Pares bg+text válidos documentados explícitamente** para cada superficie y para active states. Sin esto, el agente improvisa y produce combinaciones como "cyan medio + texto blanco" que fallan WCAG AA. Ejemplo de documentación en `theme.css`:
   ```css
   /* PARES VÁLIDOS — copiar exactamente, no improvisar */
   /* Sidebar dark item normal: bg-brand-dark-500 + text-white (12.6:1) */
   /* Sidebar dark item ACTIVO: bg-brand-aqua-500 + text-brand-dark-500 (6.8:1) — NO usar white */
   /* CTA accent: bg-accent-500 + text-brand-dark-500 (~7:1) */
   /* Badge contador: bg-accent-100 + text-accent-900 */
   ```
   El agente debe leer estos pares antes de elegir bg+text en cualquier componente.

## Outputs

- `src/styles/theme.css` — archivo `@theme` de Tailwind v4
- `src/styles/tokens.json` — tokens en formato JSON para interoperabilidad
- `docs/ui/design-tokens-report.md` — reporte de tokens configurados y pendientes

## Cuándo NO invocar

- Para auditar accesibilidad de colores → usar `accessibility`
- Para crear componentes → usar `hifi-builder` o `figma-impl`
- Para validar responsive → usar `responsive`

## Anti-patterns

- **Token explosion** — crear tokens para cada valor único en vez de usar la escala. Genera un sistema imposible de mantener.
- **Hardcode disfrazado** — declarar un token que solo se usa en un lugar y tiene nombre no semántico (ej. `--color-card-header-bg`). Usar tokens semánticos.
- **Inventar la marca** — generar paleta completa sin input de marca y presentarla como definitiva. Siempre marcar `[PENDIENTE]`.
- **Sistema de superficies plano** — solo `surface-card: white` sin diferenciación. Produce UI "wireframe outdated". Definir mínimo 3 niveles + 1 focal.
- **Shadows uniformes** — usar `shadow-sm` para todo o `shadow-md` para todo. La diferenciación entre niveles es lo que crea jerarquía visual.
- **Accent sin par contrastante** — declarar `--color-accent-500` (verde lima) sin documentar qué color de texto debe ir sobre él. Lleva a "verde sobre verde" ilegible. Documentar pares válidos.
