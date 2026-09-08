# ADR-011 — Adoptar aprobación de lote vinculada al plan

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: diagnóstico de fricción 2026-07-14; spec de seguridad runtime-hardening

## Contexto

ORC-010 vuelve a preguntar por agentes o pasos ya incluidos en un plan aprobado. Esto genera la mayor fricción reportada. A la vez, el marker textual actual es reutilizable y no está vinculado mecánicamente al plan.

## Decisión

Una confirmación aprueba el lote completo declarado. El runtime genera autorizaciones internas de uso único vinculadas al hash, agente, scope y comandos. Solo un plan update o una pregunta genuina de conocimiento interrumpe el flujo. `git commit` conserva autorización explícita GS-003.

## Justificación

Se elimina permiso redundante sin convertir contenido externo en autoridad y sin relajar la operación Git sensible cuya inconsistencia aún debe investigarse.

## Alternativas consideradas

- **Confirmación por paso:** rechazada por fricción acumulativa.
- **TTL global basado en `ok`:** rechazada por falta de binding y reutilización.
- **Cero confirmaciones:** rechazada por excesiva agencia.

## Consecuencias

**Habilita:** ejecución continua y corrección en caliente.  
**Cierra:** re-confirmación como mecanismo de supervisión paso a paso.  
**Deuda asumida:** migración temporal desde `APROBACIÓN_ORQUESTADOR` y compatibilidad de hooks.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Feedback de usuario + hardening de autorización |
