# Contrato de Cierre Universal — asdd-ba-change-log

Regla transversal de la capa BA. Todo agente BA que **produce o modifica un
artefacto BA** (SPEC, EDT, DVF, decisión de alcance) DEBE cerrar su proceso
activando el skill `asdd-ba-change-log` directamente (sin invocar ningún
agente separado). La activación no es opcional ni depende de la memoria del
orquestador humano.

## Alcance (scope BA-only)

El sistema de bitácora registra cambios a **artefactos BA**, sin importar qué rol los
origina (AF, Cliente, u otro rol humano del equipo). El discriminante es el
*objeto* (artefacto BA), no el *autor*. No registra artefactos de otras capas
(código, ADRs, tests, pipelines) — esos viven en git, ADRs y `.asdd-run.json`.

## Inputs obligatorios al activar el skill

Todo agente que activa `asdd-ba-change-log` DEBE proveer:

| Campo | Cómo obtenerlo |
|---|---|
| `autor` | Prefijo del email del sistema (ej. `alejandro.lopez` de `alejandro.lopez@sofka.com.co`). Disponible en el contexto de sesión. Si no está disponible, solicitarlo al AF antes de activar el skill. |
| `fecha` | Fecha actual en formato `AAAA-MM-DD`. |
| `tipo` | Según la tabla canónica del skill. |
| + resto de campos de la plantilla | Ver `asdd-ba-change-log/SKILL.md`. |

El campo `autor` es necesario para construir el ID `BC-{fecha}-{autor}-{NNN}`, que elimina colisiones cuando varios miembros del equipo trabajan en paralelo y hacen merge.

## Agentes obligados y evento que disparan

| Agente | Skill activador | Evento | Tipo de cambio |
|---|---|---|---|
| `asdd-ba-functional-architect` | — (directo) | EDT creada o re-aprobada | `ESTADO` (artefacto EDT) |
| `asdd-ba-specification-lead` | `client-validation` | DVF aprobado o rechazado por el negocio | `ESTADO` |
| `asdd-ba-specification-lead` | — (directo) | SPEC creada (BORRADOR) y cada versión corregida | `ESTADO` al crear; `REGLA` / `FLUJO` / `ACTOR` / `CRITERIO` / `RNF` según la sección tocada en correcciones |
| `asdd-ba-specification-auditor` | — (directo) | Veredicto emitido (cambio de estado SPEC) | `ESTADO` |
| `asdd-ba-scope-manager` | `uat-classifier` | GAP-INTERNO que resulta en cambio a SPEC | `REGLA` / `FLUJO` / `CRITERIO` / `ACTOR` / `RNF` según sección tocada |
| `asdd-ba-scope-manager` | `scope-control` | Decisión INCLUIR / DIFERIR / RECHAZAR | `ALCANCE` |
| Cualquier agente que complete un CR en una SPEC aprobada | — | CR registrado en Historial de Cambios + versión incrementada | Tipo según sección afectada (ver tabla de tipos abajo) + incluir número CR en el campo descripción de la entrada |

> **Nota:** Los hallazgos UAT de tipo ALCANCE o GAP-EXTERNO se derivan a
> `asdd-ba-scope-manager` (skill `scope-control`) — es ese skill quien registra
> tipo `ALCANCE` en bitácora, no el skill `uat-classifier`.

## Eventos CR — Cambios Post-Aprobación

Cuando un CR se completa sobre una SPEC en estado `APROBADA`, el tipo de entrada
en bitácora se determina por la **sección modificada** (mismas reglas que siempre).
La diferencia es que la descripción de la entrada debe incluir el número de CR:

> Ejemplo: `CR-001 — RN-005 actualizada por hallazgo UAT-042: se agrega validación de rango superior`

Si el CR toca varias secciones → generar una entrada por sección, cada una con el número de CR.

## Agentes NO obligados

- **`asdd-ba-functional-sme`**: solo produce respuestas que alimentan a `asdd-ba-specification-lead`; no muta artefactos.
- **`asdd-ba-log-lessons-learned`**: opera sobre el repositorio de lecciones, no sobre artefactos BA. No dispara ni es disparado por `asdd-ba-change-log`.

## Regla de selección de tipo de cambio

La tabla canónica de tipos vive en el skill `asdd-ba-change-log`
(`.claude/skills/asdd-ba-change-log/SKILL.md`) — esa es la **fuente única
de verdad**. En caso de discrepancia, prevalece la del skill.

> **Nota de alineación (ADR-006, `docs/adoption/`):** los números de sección abajo
> corresponden a la numeración del super-spec corporativo (ADR-004 §6.3). Secciones
> 4, 6, 7, 14, 15 viven en el artefacto funcional (alcance de
> `asdd-ba-specification-lead`); Secciones 9, 10, 11, 12 viven en los
> `spec-{area}` de otros dominios (fuera del alcance de este bundle BA) — se listan
> aquí solo para completar la tabla de tipos heredada del material original.

Resumen de referencia rápida:

| Sección modificada | Tipo en bitácora |
|---|---|
| Reglas de negocio (Sección 6) | `REGLA` |
| Flujo de negocio (Sección 4) | `FLUJO` |
| Validaciones de Campos (Sección 9) | `REGLA` |
| Criterios de aceptación Gherkin (Sección 10) | `CRITERIO` |
| Actores y permisos (Sección 2) | `ACTOR` |
| Requerimientos no funcionales (Sección 7) | `RNF` |
| Cambio de estado del artefacto | `ESTADO` |
| Decisión de scope | `ALCANCE` |
| Seguridad (Sección 11) | `RNF` |
| Stakeholders del dominio de datos (Sección 12) | `ACTOR` |
| Fuentes de datos (Sección 12) | `REGLA` |
| Restricciones de datos (Sección 12) | `REGLA` |
| Contexto del proyecto de datos (Sección 12) | `REGLA` |

Si un cambio toca varias secciones → generar una entrada por sección, o una entrada
con varios tipos listados.

## Protección de escritura — change-log.md

`docs/specs/change-log.md` es **write-protected**. Ningún agente puede usar
`Write` ni `Edit` directamente sobre este archivo — hacerlo puede sobrescribir
o eliminar el historial de registros previos (incidente real documentado).

**Regla:** toda escritura ocurre exclusivamente a través del skill
`asdd-ba-change-log`, que garantiza prepend sin tocar el historial.

Si un agente está a punto de escribir directamente en `change-log.md`: detener
la acción, invocar el skill en su lugar.

## Regla de cierre

Ningún agente obligado puede marcar su `Checklist de salida` como completo
sin haber registrado el ítem de activación del skill `asdd-ba-change-log`.
