---
name: asdd-developer-refactoring-execute
description: Ejecuta el plan de refactoring del Tech Lead — mejora la estructura sin cambiar el comportamiento observable.
---

## Rol

Ejecutor de refactoring. Aplica mejoras estructurales al código siguiendo el plan del Tech Lead, garantizando que el comportamiento observable no cambia.

## Cuándo activar

- Existe un refactoring plan aprobado en `docs/tech/refactoring-plan-{area}.md`
- El Tech Lead indica que una zona del código debe ser mejorada antes de agregar una feature
- Fase: **Construir**

## Precondición crítica

**Los tests existentes deben pasar antes de empezar.** Si no hay tests sobre el código a refactorizar, escribir los tests primero (`developer-unit-test`) para tener una red de seguridad.

## Proceso

1. Leer el refactoring plan y entender el alcance
2. Verificar que los tests actuales pasan (`bash: ejecutar suite de tests`)
3. Aplicar un cambio a la vez — pequeños pasos verificables
4. Correr los tests después de cada cambio
5. Si los tests fallan: revertir el último cambio, analizar la causa

## Técnicas de refactoring por tipo de deuda

| Tipo de deuda | Técnica |
|---|---|
| Función larga | Extract Function — extraer subfunciones con nombre descriptivo |
| Duplicación | Extract / DRY — mover lógica común a una función o módulo compartido |
| Nombre confuso | Rename — nombre que revela intención |
| Condicional complejo | Replace Conditional with Polymorphism / Guard Clauses |
| Acoplamiento | Introduce Interface / Dependency Injection |
| Clase con muchas responsabilidades | Extract Class — separar responsabilidades |

## Reglas durante el refactoring

- **Un cambio a la vez** — no mezclar refactoring con features nuevas
- **No cambiar comportamiento** — si el resultado del código cambia, es un bug
- **Tests en verde en todo momento** — si se rompen, revertir
- **Sin scope creep** — seguir el plan, no agregar mejoras no planificadas

## Outputs

- Código mejorado en la zona indicada por el plan
- Tests pasando en verde antes y después del refactoring
- Sin cambios de comportamiento observable

## Cuándo NO invocar

- No existe `refactoring-plan-{area}.md` aprobado por el Tech Lead — primero invocar `tech-lead-refactoring-plan`.
- El código a refactorizar no tiene tests — antes de tocarlo, escribir red de seguridad con `developer-unit-test`.
- El cambio es agregar funcionalidad nueva — usar `developer-feature`. Refactoring NO cambia comportamiento.


## Anti-patterns

- **Refactoring + feature en el mismo commit** — si los tests fallan, no se sabe si fue por la mejora estructural o por el cambio funcional. Siempre separar en commits/PRs distintos.
- **Cambios grandes sin commits intermedios** — una sesión de 4 horas refactorizando con un solo commit final no se puede revertir parcialmente. Hacer pequeños commits verificados con tests verdes después de cada paso.
- **Renombrar masivamente sin verificar referencias** — IDE rename funciona en código pero no en strings, configs YAML, archivos de migración SQL. Buscar `grep` el nombre completo antes y después.
- **Optimizar sin medición previa** — "este loop es lento" sin profiler primero. Refactoring por estética sin métricas no justifica el riesgo.

