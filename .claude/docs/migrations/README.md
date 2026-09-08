# Guías de migración ASDD

Este directorio contiene las acciones necesarias para actualizar proyectos
consumidores cuando cambia el contrato observable del template.

| Migración | Tipo | Guía |
|---|---|---|
| 2.25.x → 2.26.0 | MINOR | [`2.25-to-2.26.md`](./2.25-to-2.26.md) |
| 2.x → 3.0.0 | MAJOR | [`2-to-3.md`](./2-to-3.md) |

Una guía MAJOR debe identificar breaking changes, pasos de actualización,
validación, compatibilidad de artefactos y rollback. Los proyectos consumidores
deben aplicar las guías secuencialmente cuando saltan más de una versión mayor.
