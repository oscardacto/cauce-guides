---
name: asdd-ba-spec-index
description: Único escritor del index de un nodo BA standalone — Mapa de dominios, Gate DOR y Registro de Implementación.
---

Gestiona el archivo `{codigo}-index.md` de un nodo EDT en BA standalone.
**Único escritor autorizado** de ese archivo. Ningún agente puede usar `Write` ni `Edit`
directamente sobre `{codigo}-index.md`.

**WRITE-PROTECTED:** Ver `.claude/reference/ba/asdd-ba-change-log-contract.md` para
la política de protección de artefactos BA.

## Header canónico (fijo — no modificar)

El `{codigo}-index.md` siempre comienza con:

```
# Index — {codigo}: {nombre}

<!-- WRITE-PROTECTED: modificar únicamente vía skill asdd-ba-spec-index -->
```

Este header es el ancla de operaciones. El skill lo conoce por contrato —
no necesita leerlo del disco en cada operación.

## Sentinel de la tabla de artefactos

La tabla de artefactos termina siempre con:

```
<!-- /ARTIFACTS -->
```

Anchor para inserción de nuevas filas.

## Operaciones

### create — Primera vez: crear el índice completo

Llamar cuando `asdd-ba-specification-lead` crea la primera spec de un nodo
(el Glob del Paso 0 confirmó que el archivo no existía).

**Inputs del agente activador:**
- `codigo`: código de nodo EDT (ej. `1.1.1`)
- `slug`: slug ASCII del nodo (ej. `busqueda-unificada`)
- `nombre`: nombre descriptivo del nodo
- `spec_funcional`: nombre del archivo spec funcional (ej. `1.1.1-funcional-busqueda-unificada.md`)
- `fecha`: fecha AAAA-MM-DD

**Ruta del archivo:** `docs/specs/{codigo}-{slug}/{codigo}-index.md`

**Acción:** `Write` con la plantilla completa (ver sección Plantilla abajo).

### update-artifact — Agregar o actualizar un artefacto en la tabla

Llamar cuando un agente BA produce un artefacto nuevo en la carpeta del nodo
(informe de auditoría, DVF, HU, informe SME) o cuando el estado de uno existente cambia.

**Inputs del agente activador:**
- `ruta_index`: ruta completa del index (ej. `docs/specs/1.1.1-busqueda-unificada/1.1.1-index.md`)
- `archivo`: nombre del archivo (ej. `1.1.1-informe-auditoria.md`)
- `tipo`: tipo del artefacto (ej. `Auditoría`, `DVF`, `HU`, `Informe SME`, `Spec funcional AF`)
- `estado`: estado actual (`BORRADOR`, `APROBADA`, `COMPLETADO`, `PENDIENTE`, etc.)
- `fecha`: fecha AAAA-MM-DD

**Proceso:**
1. `Grep` — patrón `{archivo}` en `{ruta_index}`:
   - **No encontrado** → fila nueva: `Edit` con `old_string = "\n<!-- /ARTIFACTS -->"` y
     `new_string = "\n| \`{archivo}\` | {tipo} | {estado} | {fecha} |\n<!-- /ARTIFACTS -->"`
   - **Encontrado** → obtener la fila exacta, `Edit` para reemplazarla con los valores actualizados.

### update-domain — Actualizar estado de un dominio en el Mapa

Llamar cuando el AF define si un dominio aplica o cuando un dominio responsable
cambia su estado de completitud.

**Inputs del agente activador:**
- `ruta_index`: ruta completa del index
- `dominio`: nombre exacto del dominio (ej. `Arquitectura`, `QA`, `UX`)
- `aplica`: `Sí`, `No` o `A confirmar`
- `estado`: `PENDIENTE`, `EN PROGRESO`, `COMPLETO` o `N/A`

**Proceso:**
1. `Grep` — patrón `\| {dominio} \|` en `{ruta_index}` → obtener la fila actual exacta.
2. `Edit` — reemplazar con `| {dominio} | {aplica} | {estado} |`.

### update-dor — Marcar un ítem del Gate DOR

Llamar cuando un dominio confirma que su aporte está listo.

**Inputs del agente activador:**
- `ruta_index`: ruta completa del index
- `dominio`: nombre del dominio (ej. `Funcional (AF)`, `Arquitectura`)
- `marcado`: `true` (marcar [x]) o `false` (desmarcar [ ])

**Proceso:**
1. `Grep` — patrón `\[ \] \*\*{dominio}` en `{ruta_index}` → obtener la línea exacta.
2. `Edit` — reemplazar `[ ]` por `[x]` (o viceversa).

### update-implementation — Actualizar fila del Registro de Implementación

Llamar cuando el developer AI lee o implementa una sección del spec.

**Inputs del agente activador:**
- `ruta_index`: ruta completa del index
- `seccion`: número de sección (ej. `6`, `0`, `14`)
- `estado`: `PENDIENTE`, `LEÍDO`, `✓ IMPLEMENTADO` o `N/A`
- `artefacto`: ruta o descripción del artefacto generado (usar `—` si no aplica)

**Proceso:**
1. `Grep` — patrón `^\| {seccion} \|` en `{ruta_index}` → obtener la fila exacta.
2. `Edit` — reemplazar con la fila actualizada.

## Plantilla completa (para operación create)

```markdown
# Index — {codigo}: {nombre}

<!-- WRITE-PROTECTED: modificar únicamente vía skill asdd-ba-spec-index -->

## Metadatos del nodo

| Campo | Valor |
|---|---|
| Código EDT | {codigo} |
| Nombre | {nombre} |
| Estado global | BORRADOR |

## Artefactos del nodo

| Archivo | Tipo | Estado | Fecha |
|---|---|---|---|
| `{codigo}-funcional-{slug}.md` | Spec funcional AF | BORRADOR | {fecha} |
<!-- /ARTIFACTS -->

## Mapa de dominios

| Dominio | Aplica | Estado |
|---|---|---|
| Funcional | Sí | PENDIENTE |
| Arquitectura | A confirmar | PENDIENTE |
| Developer | A confirmar | PENDIENTE |
| QA | A confirmar | PENDIENTE |
| DevOps | A confirmar | PENDIENTE |
| UX | A confirmar | PENDIENTE |
| UI | A confirmar | PENDIENTE |
| Seguridad | Sí (default) | PENDIENTE |
| Datos | A confirmar | PENDIENTE |

> Actualizar `Aplica` (Sí / No) cuando el AF defina el alcance del nodo.
> `Estado`: PENDIENTE → EN PROGRESO → COMPLETO (o N/A si Aplica = No).

## Gate DOR — Readiness para Construir

- [ ] **Funcional (AF)** — veredicto APROBADA o APROBADA CON OBSERVACIONES; §14 sin PENDIENTE
- [ ] **Arquitectura** — decisiones técnicas e integraciones definidas _(omitir si Aplica = No)_
- [ ] **Developer** — contrato técnico, máquina de estados y validaciones completas _(omitir si Aplica = No)_
- [ ] **UX** — wireframes mid-fi aprobados, user flows y arquetipos validados _(omitir si Aplica = No)_
- [ ] **UI** — componentes hi-fi, design tokens, WCAG y handoff disponibles _(omitir si Aplica = No; requiere UX completado)_
- [ ] **QA** — estrategia de pruebas y escenarios adicionales definidos _(omitir si Aplica = No)_
- [ ] **DevOps** — SLOs, pipeline y observabilidad definidos _(omitir si Aplica = No)_
- [ ] **Seguridad** — análisis completo (auth, secretos, datos sensibles, OWASP Top 10) _(opt-out requiere sign-off del Experto de Seguridad)_
- [ ] **Datos** — contexto, stakeholders, restricciones y fuentes definidos _(omitir si Aplica = No)_

> No avanzar a Construir con dominios requeridos sin marcar. Actualizar via skill `asdd-ba-spec-index`.

## ◎ Registro de Implementación — asdd-developer

> **Instrucción para el developer AI:** antes de escribir código, leer el spec funcional completo del nodo (`{codigo}-funcional-{slug}.md`) de principio a fin. Completar la tabla de contexto marcando cada sección como `LEÍDO`. A medida que se produce código, completar la tabla de implementación con el artefacto generado. Al cerrar el PR ninguna sección puede quedar en `PENDIENTE`.

### Secciones de contexto — leer y marcar LEÍDO

| Sección | Nombre | Estado |
|---|---|---|
| 0 | Metadatos del documento | PENDIENTE |
| 1 | User Story | PENDIENTE |
| 3 | Trazabilidad | PENDIENTE |
| 14 | Decisiones Requeridas y Gaps | PENDIENTE |
| 15 | Historial de Cambios Post-Aprobación | PENDIENTE |

> Estados válidos: `PENDIENTE` · `LEÍDO` · `N/A` (indicar motivo). §15 puede marcarse N/A si `Estado` en §0 es `BORRADOR` y la tabla de CRs está vacía.

**Versión SPEC al iniciar implementación:** {anotar el valor del campo Versión en §0 del spec funcional — si al retomar la implementación la versión difiere, leer §15 antes de continuar}

### Secciones de implementación — requieren artefacto de código

| Sección | Nombre | Estado | Artefacto / Nota |
|---|---|---|---|
| 2 | Actores y Permisos | PENDIENTE | — |
| 4 | Flujo de Negocio | PENDIENTE | — |
| 5 | Integraciones y Dependencias Externas | PENDIENTE | — |
| 6 | Reglas de Negocio | PENDIENTE | — |
| 7 | Requerimientos No Funcionales | PENDIENTE | — |
| 8 | Experiencia del Usuario — Vista Funcional | PENDIENTE | — |
| 9 | Validaciones de Campos | PENDIENTE | — |
| 10 | Criterios de Aceptación | PENDIENTE | — |
| 11 | Seguridad | PENDIENTE | — |
| 12 | Dominio de Datos | PENDIENTE | — |
| 13 | Controles y Auditoría | PENDIENTE | — |

> Estados válidos: `PENDIENTE` · `LEÍDO` · `✓ IMPLEMENTADO` (con artefacto en la columna) · `N/A` (indicar motivo).
```

## Anti-patterns

- **Editar `{codigo}-index.md` directamente** — cualquier agente que intente `Write` o `Edit` sobre
  `{codigo}-index.md` sin pasar por este skill viola el contrato de protección.
- **Crear el index con nombre incorrecto** — siempre `{codigo}-index.md` (ej. `1.1.1-index.md`),
  dentro de la carpeta `docs/specs/{codigo}-{slug}/`.
- **Actualizar el Mapa de dominios con valores sin confirmar** — `Aplica = A confirmar` es el
  estado inicial válido. No cambiar a Sí/No sin decisión explícita del AF.
- **Omitir `<!-- /ARTIFACTS -->`** al crear el index — sin el sentinel, las operaciones
  `update-artifact` (adición de nueva fila) no tienen ancla de inserción.
