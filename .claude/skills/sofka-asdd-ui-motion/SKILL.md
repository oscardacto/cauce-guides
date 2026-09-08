---
name: sofka-asdd-ui-motion
description: Motion con propósito — transiciones, easing y duraciones, framework Emil Kowalski sobre Tailwind v4 y React.
---

## Rol

Definir y auditar el sistema de motion: cuándo animar, qué animar, con qué easing, qué duración. **"Motion con propósito"** — cada animación responde a frecuencia de uso, claridad de estado, o feedback. Sin propósito = ruido. Eliminar.

## Propósitos válidos
Consistencia espacial · Indicación de estado · Feedback de acción · Suavizado de cambios · Explicación.

## Decisión #1 — Frecuencia define si animar

| Uso | Decisión |
|---|---|
| 100+/día (atajos teclado, toggles, copy/paste) | **SIN animación** |
| Decenas/día (hovers, nav, dropdowns frecuentes) | <100ms o quitar |
| Ocasional (modales, drawers, toasts) | 150–300ms estándar |
| Raro (onboarding, celebración) | 300–500ms con delight |

**Regla absoluta:** NUNCA animar acciones iniciadas por teclado (Cmd+K, Esc, Enter). Raycast tiene 0ms de open/close por esto.

## Decisión #2 — Easing por rol

- Entrando / saliendo → `ease-out`
- Movimiento o morph → `ease-in-out`
- Hover / cambio de color → `ease`
- Motion constante (marquee) → `linear`

**NUNCA `ease-in` en UI** — retrasa el feedback inicial, se siente más lento aunque tenga la misma duración.

**Curvas custom obligatorias** (más expresivas que defaults CSS):
```css
@theme {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## Decisión #3 — Duración por componente

| Componente | Duración |
|---|---|
| Press feedback botón | 100–160ms |
| Tooltip, small popover | 125–200ms |
| Dropdown, select | 150–250ms |
| Modal, drawer, dialog | 200–300ms |
| Toast enter | 200–400ms |
| Toast exit (más rápido que enter) | 150–200ms |
| Onboarding / explicativo | 300–500ms |

**Regla absoluta:** UI animations <300ms. Si necesitás más, probablemente la animación no es necesaria.

**Asymmetric timing:** lo que el usuario controla puede ser lento (hold-to-delete 2s). Lo que el sistema responde debe ser rápido (release 200ms).

## Patrones obligatorios

- **Botón press feedback:** `transition-transform duration-150 ease-out active:scale-[0.97]`. Aplica a TODOS los botones.
- **Entry modal/drawer/dropdown:** desde `scale(0.95) + opacity:0` — NUNCA desde `scale(0)` (viola física).
- **Popover transform-origin:** desde el trigger position, no `center` (excepción: modales centrados).
- **Stagger en listas:** 30–80ms entre elementos. Nunca bloquear interacción durante stagger (decorativo, no funcional).
- **Toast:** enter desde el borde donde aparece. Exit más rápido que enter. Pausar auto-dismiss en `document.hidden`.

## Performance — solo `transform` + `opacity`

GPU-aceleradas (skip layout + paint): `transform`, `opacity`, `filter`.
Triggerean layout (LENTAS): `width`, `height`, `padding`, `margin`, `top/left/right/bottom`.

```jsx
// ❌ Lento
<div style={{ left: dragOffset }}>
// ✅ Rápido
<div style={{ transform: `translateX(${dragOffset}px)` }}>
```

**Framer Motion gotcha:** shorthand (`x`, `y`) NO acelera. Usar `transform: "translateX(100px)"` para GPU.

## Transitions vs Keyframes

- **CSS transitions** → UI rápidamente triggereable (toggle, modal). Retomable mid-animation.
- **Keyframes** → animación one-shot lineal (loader, marquee). Restart desde frame 0.

## Accesibilidad

```css
@media (prefers-reduced-motion: reduce) {
  /* Mantener: opacity, color. Quitar: position, scale, movement */
  .modal { animation: none; opacity: 1; transform: none; }
}

@media (hover: hover) and (pointer: fine) {
  /* Hover solo en dispositivos con pointer fino */
  .card:hover { transform: scale(1.02); }
}
```

Sin estos media queries, touch devices generan false hover (stuck states).

## Anti-patterns críticos (audit checklist)

| Issue | Fix |
|---|---|
| `transition: all` | Especificar propiedad: `transition: transform 200ms ease-out` |
| `ease-in` en UI | `ease-out` o curva custom |
| `scale(0)` entry | `scale(0.95) + opacity:0` |
| Duración >300ms en UI | Reducir a 150–250ms |
| Animación en acción de teclado | Quitar entirely |
| Hover sin media query | `@media (hover: hover) and (pointer: fine)` |
| Keyframes en triggers rápidos | CSS transitions (retomables) |
| Framer `x`/`y` bajo carga | `transform: "translateX()"` (hardware accel) |
| Sin press feedback en botones | `active:scale-[0.97]` con duration 100–160ms |
| Popover con `transform-origin: center` | Origin desde trigger |
| Animar `padding`/`margin`/`width` | Usar `transform` + `opacity` |
| Aparición simultánea de N elementos | Stagger 30–80ms |

## Niveles de severidad

- **Crítica:** animación en acción de teclado, `scale(0)`, `transition: all`, animar layout properties
- **Alta:** `ease-in` en UI, duración >300ms, sin prefers-reduced-motion
- **Media:** sin press feedback en botones, sin stagger en listas, mismo timing enter/exit
- **Baja:** curva default en lugar de custom

## Outputs

### Fase Construir
Sin archivos propios — provee guía a `hifi-builder` durante construcción. El hifi-builder debe consultar este skill al definir motion de cada componente.

### Fase Verificar
`docs/ui/motion-audit-{vista}.md` con resumen (componentes auditados, easing usado, duración promedio, anti-patterns encontrados) y hallazgos en formato `[severidad] componente — archivo:línea — fix sugerido`.

## Cuándo NO invocar

- Crear componentes → `hifi-builder` (consulta motion al definir cada uno)
- Tokens de duración/easing → `design-tokens`
- Accesibilidad teclado/screen reader → `accessibility`
- Contraste / jerarquía visual → `design-audit`

## Créditos

Destilado del trabajo publicado de **Emil Kowalski** (Sonner, Vaul, animations.dev), adaptado al stack Tailwind v4 + React del agente sofka-asdd-ui.
