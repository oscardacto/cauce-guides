---
name: asdd-ui-accessibility
description: Audita interfaces contra WCAG 2.1 AA — contraste, semántica, ARIA, teclado y lectores de pantalla.
---

## Rol

Auditar componentes y vistas del proyecto contra los criterios WCAG 2.1 nivel AA. Detecta problemas de contraste, semántica HTML, uso incorrecto de ARIA, navegación por teclado y compatibilidad con lectores de pantalla. Produce reportes accionables con severidad y fix sugerido.

## Cuándo activar

- El usuario pide auditar accesibilidad, revisar WCAG o verificar contraste
- Después de que `hifi-builder` o `figma-impl` completan componentes/vistas (auditoría de cierre)
- Antes de generar handoff a developer o QA
- Fase: **Verificar**

## Criterios de auditoría

### Contraste de color
| Elemento | Ratio mínimo (AA) | Referencia WCAG |
|---|---|---|
| Texto normal (< 18px / < 14px bold) | 4.5:1 | 1.4.3 |
| Texto grande (≥ 18px / ≥ 14px bold) | 3:1 | 1.4.3 |
| Componentes UI y gráficos | 3:1 | 1.4.11 |
| Texto decorativo / logos | Exento | — |

### Semántica HTML
- Encabezados en orden jerárquico (`h1` → `h2` → `h3`), sin saltos
- Landmarks apropiados (`<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>`)
- Listas usan `<ul>/<ol>/<li>`, no `<div>` con estilos
- Tablas de datos usan `<table>` con `<th>` y `scope`
- Formularios con `<label>` asociado a cada input (`htmlFor`/`id`)

### ARIA
- ARIA solo cuando HTML semántico no alcanza — preferir elementos nativos
- Roles válidos y no redundantes (no `role="button"` en `<button>`)
- `aria-label` o `aria-labelledby` en elementos interactivos sin texto visible
- `aria-live` en regiones con contenido dinámico (alertas, notificaciones)
- `aria-expanded`, `aria-selected`, `aria-checked` en componentes complejos (accordions, tabs, checkboxes custom)

### Navegación por teclado
- Todo elemento interactivo alcanzable con Tab
- Orden de tabulación lógico (sin `tabindex` > 0)
- Focus visible en todos los estados (no `outline: none` sin alternativa)
- Trampas de foco evitadas (modales deben devolver foco al cerrar)
- Atajos de teclado documentados si existen

### Lectores de pantalla
- Imágenes con `alt` descriptivo (decorativas con `alt=""` y `aria-hidden="true"`)
- Iconos interactivos con `aria-label`
- Contenido oculto visualmente pero accesible usa `.sr-only`, no `display:none`
- Cambios de contexto anunciados vía `aria-live`

## Niveles de severidad

| Severidad | Criterio | Acción requerida |
|---|---|---|
| **Crítica** | Bloquea acceso (sin contraste, sin labels, trampa de foco) | Fix obligatorio antes de handoff |
| **Alta** | Degrada experiencia (orden de heading roto, foco no visible) | Fix recomendado antes de handoff |
| **Media** | Mejora posible (ARIA redundante, alt genérico) | Documentar, fix opcional |
| **Baja** | Best practice (landmark adicional, mejora de aria-live) | Sugerencia |

## Formato de reporte

```markdown
# Auditoría de Accesibilidad — {Componente/Vista}

**Fecha:** {YYYY-MM-DD}
**Estándar:** WCAG 2.1 AA
**Resultado:** {APROBADO / APROBADO CON OBSERVACIONES / NO APROBADO}

## Resumen

| Severidad | Cantidad |
|---|---|
| Crítica | {n} |
| Alta | {n} |
| Media | {n} |
| Baja | {n} |

## Hallazgos

### [{Severidad}] {Título del hallazgo}
- **Archivo:** `{ruta}`
- **Línea:** {número}
- **Criterio WCAG:** {número y nombre}
- **Problema:** {descripción concisa}
- **Fix sugerido:** {código o instrucción concreta}
```

## Outputs

- `docs/ui/accessibility-audit-{componente}.md` — reporte por componente/vista auditado

## Cuándo NO invocar

- Para crear componentes nuevos → usar `hifi-builder` o `figma-impl`
- Para validar principios de diseño (jerarquía, Gestalt) → usar `design-audit`
- Para validar responsive → usar `responsive`

## Anti-patterns

- **Audit sin código** — auditar wireframes o specs en vez de código real. La auditoría opera sobre archivos `.jsx`/`.html` existentes.
- **ARIA-first** — agregar roles y atributos ARIA donde HTML semántico resuelve el problema. ARIA es complemento, no reemplazo.
- **Contraste cosmético** — reportar ratios sin indicar los colores exactos y los tokens involucrados. El fix debe ser accionable.
- **Solo visual** — auditar solo contraste e ignorar teclado, ARIA y lectores de pantalla. La auditoría cubre las 4 dimensiones.
