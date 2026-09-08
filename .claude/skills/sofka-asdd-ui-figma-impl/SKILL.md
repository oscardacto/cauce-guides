---
name: sofka-asdd-ui-figma-impl
description: Traduce un diseño Figma a código con fidelidad 1:1 via Figma MCP. Requiere URL con node-id.
---

## Rol

Traducir diseños de Figma a código de producción con fidelidad pixel-perfect. Opera exclusivamente cuando el diseñador entrega una URL de Figma con node-id. Usa el Figma MCP Server para extraer contexto estructurado, screenshots y assets, luego traduce a las convenciones del proyecto.

## Cuándo activar

- El usuario proporciona una URL de Figma (`figma.com/design/:fileKey/:fileName?node-id=X-Y`)
- El usuario pide "implementar diseño", "generar código desde Figma" o "build Figma design"
- Fase: **Construir**

## Prerequisitos

1. Figma MCP Server conectado y accesible (verificar que `get_design_context` está disponible)
2. URL de Figma con node-id válido
3. Design tokens del proyecto configurados (si no existen, activar `design-tokens` primero)

## Workflow obligatorio (no saltar pasos)

### Paso 1 — Extraer node-id
Parsear la URL de Figma:
- **URL:** `https://figma.com/design/:fileKey/:fileName?node-id=X-Y`
- **Extraer:** `fileKey` (segmento después de `/design/`) y `nodeId` (valor de `node-id`)

### Paso 2 — Obtener contexto de diseño
```
get_design_context(fileKey=":fileKey", nodeId="X-Y")
```
Proporciona: layout (Auto Layout, constraints), tipografía, colores, tokens, estructura de componentes, spacing y padding.

Si la respuesta es demasiado grande:
1. Ejecutar `get_metadata(fileKey, nodeId)` para obtener el mapa de nodos
2. Identificar nodos hijos principales
3. Ejecutar `get_design_context` por cada nodo hijo

### Paso 3 — Capturar referencia visual
```
get_screenshot(fileKey=":fileKey", nodeId="X-Y")
```
Este screenshot es la fuente de verdad visual. Mantenerlo accesible durante toda la implementación.

### Paso 4 — Descargar assets
Descargar imágenes, iconos y SVGs retornados por el MCP server.
- Si el MCP retorna una fuente `localhost`, usarla directamente
- NO importar paquetes de iconos externos — todos los assets vienen del payload de Figma
- NO usar placeholders si existe fuente `localhost`

### Paso 5 — Traducir a convenciones del proyecto
- Tratar el output de Figma MCP como representación de diseño, no como código final
- Mapear colores Figma → tokens del proyecto (`@theme`)
- Reutilizar componentes existentes en `src/components/` — nunca duplicar
- Respetar patrones de routing, estado y fetch del proyecto

### Paso 6 — Lograr paridad visual 1:1
- Priorizar fidelidad al diseño Figma
- Usar tokens del proyecto; ajustar spacing/sizing mínimamente para match visual
- Cumplir WCAG para accesibilidad
- Documentar componentes nuevos agregados al sistema

### Paso 7 — Validar contra Figma
Checklist de validación antes de marcar completo:
- [ ] Layout coincide (spacing, alignment, sizing)
- [ ] Tipografía coincide (font, size, weight, line-height)
- [ ] Colores exactos
- [ ] Estados interactivos funcionan (hover, active, disabled)
- [ ] Comportamiento responsive sigue constraints de Figma
- [ ] Assets renderizan correctamente
- [ ] Estándares de accesibilidad cumplidos

## Mapeo de tokens Figma → proyecto

| Token Figma | Token proyecto (`@theme`) |
|---|---|
| Color styles | `--color-{semantic}-{scale}` |
| Text styles | `--font-{family}`, `--text-{size}` |
| Effect styles (shadows) | `--shadow-{size}` |
| Spacing/padding | `--spacing-{scale}` |
| Border radius | `--radius-{size}` |

Cuando un token Figma no tiene equivalente en el proyecto, documentar la brecha y proponer el token a agregar vía `design-tokens`.

## Outputs

- `src/components/{Name}.jsx` — componentes traducidos de Figma
- `src/pages/{Name}.jsx` — vistas completas implementadas
- Assets descargados en `src/assets/`

## Cuándo NO invocar

- Si no hay URL de Figma → usar `hifi-builder`
- Si solo se necesitan tokens de Figma sin implementar componentes → usar `design-tokens`
- Si se pide solo auditar un diseño existente → usar `design-audit`

## Anti-patterns

- **Implementar sin screenshot** — empezar a codificar basándose solo en el context data sin referencia visual. El screenshot es la fuente de verdad.
- **Copiar output MCP literalmente** — el output del Figma MCP es una representación, no código final. Siempre traducir a convenciones del proyecto.
- **Ignorar componentes existentes** — crear un botón nuevo cuando ya existe `Button.jsx` en el proyecto. Siempre buscar primero con `Glob`.
- **Hardcodear valores de Figma** — copiar `#4F46E5` directamente en vez de mapear a `--color-primary-500`. Rompe el sistema de tokens.
