# ADR-014 — Materializar resultados completos sin reintentar agentes

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: ADR-012; ADR-013; `fix/spdd-optimization`; spec runtime-hardening

## Contexto

Cuando un subagente devuelve un artefacto completo pero no puede escribirlo por restricciones del entorno, re-invocarlo para repetir `Write` vuelve a pagar carga, lectura y razonamiento. El historial de SPDD documenta este loop en plan mode y lo elimina materializando el primer resultado.

## Decisión

Si el primer retorno contiene un artefacto completo y materializable, el orquestador lo persiste con transformación mínima y ejecuta el gate determinista correspondiente. No re-spawnea, no reexplora y no solicita reautoría. Solo puede reintentar al agente si el retorno no contiene un resultado materializable. Un fallo posterior se corrige quirúrgicamente in-place.

La capacidad de materializar debe declararse en el plan y limitarse a la ruta de salida esperada. No concede permiso para commits, comandos destructivos ni cambios fuera del scope.

## Justificación

Elimina ciclos conocidos que duplican latencia y tokens, conservando calidad mediante validación independiente del actor que escribió el archivo.

## Alternativas consideradas

- **Re-spawn hasta que el agente escriba:** rechazada por repetir trabajo ante una restricción estable.
- **Aceptar el resultado sin gate:** rechazada por degradar integridad y formato.
- **Permitir al orquestador editar cualquier archivo:** rechazada por ampliar privilegios innecesariamente.

## Consecuencias

**Habilita:** recuperación de primer retorno y correcciones puntuales.  
**Cierra:** loops de reintento para evadir plan mode/sandbox.  
**Deuda asumida:** contrato de resultado materializable, allowlist de rutas y gates por tipo de artefacto.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Patrón comprobado en optimizaciones SPDD y aplicable al runtime ASDD |
