# ADR-015 — Enforce autorización de lote en lanzamiento y operaciones

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: ADR-011, run `2026-07-17-002`, ORC-010, GS-003

## Contexto

ADR-011 definió que una aprobación quedaba ligada a hash, agente, scope y
comandos. La implementación conservó esos campos, pero
`asdd-plan-gate.mjs` llamó `consumeAuthorization(agent)` solo con
`subagent_type`. En consecuencia, la prueba E2E permitió que el trabajo real
fuera hacia un archivo distinto del presentado al usuario.

El hook `Agent` recibe el tipo de agente a lanzar. Los eventos de herramientas
de subagente usados por los guards existentes incluyen `agent_id`, `agent_type`,
`tool_name` y `tool_input`; por ello el enforcement de paths y comandos debe
ocurrir en esos eventos, no fingirse en el hook de lanzamiento.

## Decisión

1. El plan normalizado rechaza tipos de agente duplicados. Una entrada de lote
   representa una única ejecución de un tipo de agente.
2. Se separa el consumo de lanzamiento de la autorización de operaciones:
   - el hook `Agent` verifica tipo exacto y marca `launch_used_at` una vez;
   - el hook de operaciones verifica `agent_id` + `agent_type`, expiración y el
     path/comando de cada operación sensible contra la misma entrada.
3. La primera operación sensible reclama de forma atómica `agent_id`. Una
   identidad distinta no puede reutilizar una entrada ya reclamada.
4. `Write`/`Edit` permiten solo rutas dentro del scope canonizado. Un scope sin
   `/` final es un archivo exacto; un scope terminado en `/` es un directorio.
   Se rechazan paths absolutos fuera de raíz, `..` y escapes por symlink.
5. Bash mutante o compuesto permite solo un comando canónico declarado. Los
   separadores, redirecciones, sustituciones y comandos adicionales no son
   equivalentes a un comando aprobado. Las lecturas locales allow-listed de
   subagentes siguen libres para preservar discovery.
6. Si existe una autorización ASDD aplicable pero no coincide, falla cerrado con
   `deny`. Solo la ausencia total de una autorización ASDD conserva el `ask`
   nativo para flujos no formalizados.
7. No se incorporan HMAC al store, cambios de TTL ni un token adicional de UX en
   este ADR. Son decisiones independientes y no corrigen por sí mismas la falta
   de enforcement.

## Justificación

La autorización se valida en el último punto que conoce el objetivo real de la
operación. Esto evita que la metadata sea decorativa y conserva una única
aprobación para el lote legítimo, sin ampliar la autoridad a una variación de
scope o comando.

## Alternativas consideradas

- **Comparar scope/comando solo en `plan-gate`:** rechazada; el evento `Agent`
  no contiene las futuras rutas ni comandos.
- **Confiar en que el prompt del subagente respetará el scope:** rechazada; no
  es enforcement mecánico.
- **Pedir confirmación nativa ante cada mismatch:** rechazada; convierte un
  desvío de seguridad en una autorización fuera del plan. Debe exigir plan
  nuevo.
- **Firmar el store primero:** diferida; protege integridad local, pero no hace
  que scope/comando se comparen al ejecutar.

## Consecuencias

**Habilita:** auditoría de mismatches y protección efectiva de archivos y
comandos aprobados.  
**Cambia:** un plan con dos entradas del mismo tipo debe dividirlas o usar tipos
distintos; un mismatch se deniega, no abre un permiso genérico.  
**Riesgo residual:** las operaciones no observables por hooks de Claude Code no
pueden cubrirse; la implementación debe documentar tal límite y no anunciar una
garantía mayor.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Evidencia E2E de scope drift frente al contrato ADR-011. |
