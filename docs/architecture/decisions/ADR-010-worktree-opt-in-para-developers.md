# ADR-010 — Adoptar worktree opt-in para developers

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: diagnóstico de fricción 2026-07-14; spec `asdd-runtime-hardening`

## Contexto

Los developers frontend/backend declaran `isolation: worktree` siempre. En sesiones reales esto ocultó cambios hasta el merge, impidió correcciones en caliente y añadió ceremonia aun con un único desarrollo. El aislamiento aporta valor cuando existe paralelismo real, no como costo fijo.

## Decisión

Trabajar sobre la rama actual por defecto. Activar worktree solo por pedido explícito o cuando existan al menos dos developers paralelos con scopes disjuntos verificados por ORC-011-A.

## Justificación

El umbral de dos captura el primer caso donde el aislamiento evita colisiones reales. GS-001 y GS-008 conservan protección de rama y pre-push.

## Alternativas consideradas

- **Worktree siempre:** rechazada por fricción y baja visibilidad.
- **Solo pedido explícito, nunca automático:** rechazada porque paralelismo disjunto sí se beneficia de activación mecánica.

## Consecuencias

**Habilita:** corrección en caliente y flujo simple para un developer.  
**Cierra:** aislamiento automático para tareas secuenciales.  
**Deuda asumida:** el working tree puede contener cambios parciales; se mitiga con rama dedicada, status visible y gates Git.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Instrucción de incorporar el diagnóstico e iniciar ajustes |
