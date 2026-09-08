# sofka-asdd-ba-specification-lead — Protocolo de Actualización de Metadatos en Iteración

Regla de gobernanza transversal. Aplica a `sofka-asdd-ba-specification-lead` cada vez
que modifica una SPEC existente (corrección post-evaluación, actualización post-UAT)
en cualquier estado excepto `APROBADA`.

> Para SPECs en estado `APROBADA`: primero completar el proceso CR definido en
> `sofka-asdd-spec-guard.md` (SPG-001). Este protocolo se aplica **después** del
> CR, no en lugar de él. El motivo en `Última modificación` de § Metadatos usa el
> formato `CR-NNN: {motivo}` en ese caso.

## CMI-001: Campos que se actualizan antes de editar el contenido

Antes del primer `Edit` o `Write` sobre el cuerpo de la SPEC,
`sofka-asdd-ba-specification-lead` DEBE actualizar estos campos en un solo edit atómico:

| Campo | Sección | Qué registrar |
|---|---|---|
| `Última modificación` | § 0 — Metadatos | Fecha actual en formato `AAAA-MM-DD` |
| `Última modificación` | § 3 — Trazabilidad | Fecha actual + motivo en una línea. Correcciones post-evaluación: `"Corrección post-evaluación: {motivo}"`. Correcciones post-CR sobre APROBADA: `"CR-NNN: {motivo}"` |
| `Estado en ciclo` | § 3 — Trazabilidad | Solo si el estado del ciclo efectivamente cambió (ej. `"En especificación"` → `"En diseño"`) |

> **Naming BA standalone (Layout B):** el artefacto funcional vive en
> `docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md`. La lectura en CMI-003
> paso 1 aplica a esa ruta. Ver `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`
> para la convención completa.

## CMI-002: Campos invariantes — no tocar en iteración

| Campo | Razón |
|---|---|
| `Versión` en § Metadatos | Solo se incrementa al cerrar un CR sobre SPEC `APROBADA` (SPG-001) |
| `Fecha de creación` en § Metadatos | Invariante desde la creación inicial |
| `Fecha del artefacto fuente` en § Trazabilidad | Invariante — refleja cuándo se creó el artefacto de negocio que originó el requerimiento |
| `Fecha de registro de trazabilidad` en § Trazabilidad | Invariante — refleja cuándo el AF formalizó el vínculo |

## CMI-003: Orden de operaciones en iteración

1. Leer la spec-funcional existente completa (Read sobre su ruta ART-001 en `docs/specs/`)
2. Actualizar los campos CMI-001 — un edit atómico sobre § Metadatos y § Trazabilidad
3. Aplicar los cambios de contenido en las secciones correspondientes
4. Activar `sofka-asdd-ba-change-log` con el tipo que corresponde a las secciones modificadas (ver `sofka-asdd-ba-change-log-contract.md`)

El paso 2 es prerrequisito del paso 3. Sin él, los metadatos quedan desactualizados
y la trazabilidad del documento se rompe.
