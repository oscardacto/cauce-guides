---
name: asdd-ui-responsive
description: Estrategia responsive — breakpoints, fluid typography y comportamiento en mobile, tablet y desktop.
---

## Rol

Definir la estrategia responsive del proyecto y validar que componentes y vistas se adapten correctamente a múltiples viewports. Audita breakpoints, fluid typography, imágenes adaptativas y patrones de layout en los 3 viewports mínimos: mobile, tablet y desktop.

## Cuándo activar

- El usuario pide validar responsive, breakpoints o comportamiento mobile
- Después de que `hifi-builder` o `figma-impl` completan vistas (auditoría de cierre)
- Al definir la estrategia responsive del proyecto (inicio de proyecto)
- Fase: **Verificar**

## Breakpoints estándar

| Nombre | Ancho mínimo | Tailwind prefix | Dispositivo típico |
|---|---|---|---|
| `mobile` | 0px (default) | — | Smartphone portrait |
| `sm` | 640px | `sm:` | Smartphone landscape |
| `md` | 768px | `md:` | Tablet portrait |
| `lg` | 1024px | `lg:` | Tablet landscape / Laptop |
| `xl` | 1280px | `xl:` | Desktop |
| `2xl` | 1536px | `2xl:` | Monitor grande |

**Enfoque:** Mobile-first. El CSS base aplica a mobile; media queries agregan complejidad hacia arriba.

## Criterios de auditoría

### Layout
- Contenedores usan `max-w-*` para limitar ancho en pantallas grandes
- Grids colapsan columnas apropiadamente (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Sidebars se convierten en drawer/bottom-sheet en mobile
- No hay overflow horizontal en ningún viewport
- Elementos no se solapan ni se cortan al redimensionar

### Tipografía
- Tamaños de texto se adaptan por viewport (`text-sm md:text-base lg:text-lg`) o usan fluid typography con `clamp()`
- Line-height ajustado para legibilidad en mobile (mínimo 1.5 para body)
- Headings no exceden el ancho del viewport en mobile

### Imágenes y media
- Imágenes usan `max-w-full` y `h-auto`
- Aspect ratios preservados con `aspect-ratio` o `object-fit`
- Videos y embeds son responsive (`aspect-video` o wrapper con padding-trick)
- Lazy loading en imágenes below-the-fold (`loading="lazy"`)

### Touch targets
- Elementos interactivos mínimo 44x44px en mobile (WCAG 2.5.5)
- Spacing entre targets touch mínimo 8px
- No hay hover-only interactions sin fallback para touch

### Navegación
- Menú principal se transforma en hamburger/drawer en mobile
- Breadcrumbs se truncan o se ocultan parcialmente en mobile
- Tabs horizontales permiten scroll horizontal o se apilan en mobile

## Viewports de validación obligatoria

| Viewport | Ancho | Representa |
|---|---|---|
| Mobile | 375px | iPhone SE / Android compact |
| Tablet | 768px | iPad portrait |
| Desktop | 1280px | Laptop estándar |

Mínimo estos 3. Agregar 1536px si el diseño tiene layout ultra-wide.

## Formato de reporte

```markdown
# Auditoría Responsive — {Vista/Componente}

**Fecha:** {YYYY-MM-DD}
**Viewports validados:** {375px, 768px, 1280px}
**Resultado:** {APROBADO / APROBADO CON OBSERVACIONES / NO APROBADO}

## Resumen por viewport

| Viewport | Layout | Tipografía | Touch | Navegación | Estado |
|---|---|---|---|---|---|
| 375px | {✓/✗} | {✓/✗} | {✓/✗} | {✓/✗} | {OK/FAIL} |
| 768px | {✓/✗} | {✓/✗} | {✓/✗} | {✓/✗} | {OK/FAIL} |
| 1280px | {✓/✗} | {✓/✗} | {✓/✗} | {✓/✗} | {OK/FAIL} |

## Hallazgos

### [{Viewport}] {Título}
- **Archivo:** `{ruta}`
- **Problema:** {descripción}
- **Fix sugerido:** {código concreto}
```

## Outputs

- `docs/ui/responsive-audit-{vista}.md` — reporte por vista auditada

## Cuándo NO invocar

- Para crear componentes → usar `hifi-builder` o `figma-impl`
- Para auditar accesibilidad (contraste, ARIA) → usar `accessibility`
- Para validar principios de diseño visual → usar `design-audit`

## Anti-patterns

- **Desktop-first** — escribir CSS para desktop y luego "arreglar" mobile con overrides. Siempre mobile-first.
- **Hide everything** — ocultar contenido en mobile con `hidden md:block` en vez de reorganizarlo. El contenido mobile debe ser completo.
- **Fixed widths** — usar `width: 400px` en vez de porcentajes, fracciones de grid o `max-w-*`. Los anchos fijos rompen en viewports menores.
- **Zoom disabled** — agregar `maximum-scale=1` o `user-scalable=no` en el meta viewport. Viola WCAG 1.4.4.
- **Solo 2 viewports** — validar solo mobile y desktop ignorando tablet. Los breakpoints intermedios revelan problemas de layout que los extremos ocultan.
