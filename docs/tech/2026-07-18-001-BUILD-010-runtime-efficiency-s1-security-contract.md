# S1 — Contrato de seguridad y diferencial del dispatcher PreToolUse

Fecha: 2026-07-18  
Run: `2026-07-18-001`  
Estado: `done`  
Decisión: ADR-018 aceptada

## Objetivo y alcance

Congelar antes de B3 la semántica observable de los guards ASDD registrados
para `Bash|Write|Edit`: aplicabilidad, decisión, razones ganadoras, efectos y
degradación. Este slice no registra el prototipo ni reemplaza hooks en
`.claude/settings.json`. Collector y `PostToolUse` siguen fuera del dispatcher.

## Threat model

### Activos y fronteras

| Activo | Entrada no confiable | Propiedad protegida |
|---|---|---|
| Evento PreToolUse | JSON, aliases, command, paths y contenido | Schema único, clasificación conservadora y fail-closed |
| Estado Git/run/spec | cwd, root, symlinks, archivos y caches | Provenance por root y carga lazy sin ampliar autoridad |
| Autorizaciones | identidad, challenge, command, scope y TTL | Consumo exacto y de un solo uso |
| Resultados de guards | decisión, reason y effects | Precedencia y orden deterministas |
| Telemetría externa | hook global collector | Un Pre por intento; Post solo si la tool se ejecuta |

### Amenazas y controles obligatorios

| ID | Amenaza | Control verificable | Evidencia S1 |
|---|---|---|---|
| T-01 | JSON vacío/malformado toma allow | Parser único; error estable `deny` | fixture `malformed-json` |
| T-02 | Quoting u opciones globales evaden comando peligroso | Clasificación normalizada, sin ejecutar shell | fixtures `*-quoted`, `*-git-c` |
| T-03 | Short-circuit tras primer deny omite hermanos | Ejecutar todos los aplicables | oracle `completeness` |
| T-04 | Se pierde una de varias razones deny | Conservar razones ganadoras en orden de guards | dos fixtures multi-deny + oracle |
| T-05 | Excepción/resultado inválido produce allow | `guard-error:<id>:<kind>` y deny | oracle `fail-closed` |
| T-06 | Effects se duplican, reordenan u omiten | Declarar y centralizar; orden de guards | oracle `effects` |
| T-07 | Dispatcher absorbe collector/PostToolUse | Procesos y lifecycle independientes | test de coexistencia 2/2 |
| T-08 | Path no portable altera routing | Strings POSIX con espacios y Windows | dos fixtures de portabilidad |
| T-09 | Cache comparte autoridad o root | Cache sin autoridad y key por provenance | requerido para B3/B9; no implementado en S1 |

## Inventario contractual

Orden de evaluación para B3:

1. schema/payload y dangerous operation;
2. root/path/symlink;
3. branch, pre-push y pre-PR;
4. autorización de operación;
5. spec, dependencias, analyze, naming y design;
6. coautoría;
7. política de orquestador.

Todos los guards aplicables se ejecutan aunque exista un ganador anticipado.
La precedencia interna es `deny > defer > ask > allow`. Solo las razones de la
decisión ganadora llegan a `permissionDecisionReason`, separadas de forma
estable y en orden de evaluación.

Los efectos conocidos que B3 debe extraer y ejecutar centralmente son:

- consumo de autorización de commit en branch guard;
- consumo de autorización de operación;
- invalidación del marker `.claude/.prepush-validated`;
- mensajes auditables por stderr que no sean decisión.

El corpus diferencial no debe reutilizar stores mutables entre ejecución
anterior y candidata: cada lado recibe un clon del repo/estado o un fixture de
store independiente. Comparar en cada caso:

```text
decision + winning reasons + declared effects + resulting state
```

Exit code/stdout/stderr crudos se conservan como evidencia, pero se comparan
después de normalizar el protocolo: la cadena histórica usa tanto exit `2`
como JSON; el dispatcher emite un único resultado Claude Code válido.

## Corpus versionado

Fuente:
`.claude/scripts/fixtures/asdd-pretool-dispatcher-s1.json`.

- 11 fixtures deterministas, sin red;
- allow fast path y denies de dangerous/auth/coauthor/artifact/orchestrator;
- dos escenarios con múltiples razones ganadoras;
- quoting, opción `git -C`, paths con espacios, path Windows y JSON inválido;
- token `$ROOT` para no persistir rutas absolutas.

El caso de schema inválido admite una razón nueva y estable del dispatcher: no
es posible determinar guards aplicables antes de parsear. La decisión debe
seguir siendo deny y no debe filtrar el payload ni mensajes internos.

## Hallazgos y diferencias autorizadas

### S1-COR-001 — evasión de dangerous-bash por quoting

Baseline observado: `git 'reset' --hard` y `git -C . reset --hard` retornaban
exit `0`. Se añadió normalización estática conservadora antes de clasificar;
ambos retornan exit `2`, igual que `git reset --hard`. No se expande ni ejecuta
contenido del comando. Esta corrección implementa AB-002 de la spec de
seguridad y es deliberadamente una mejora de seguridad, no equivalencia con el
bug previo.

### DFX-001 — protocolo legacy `decision:block`

`spec-check` y `dep-check` todavía escriben `{decision:"block"}` con exit `0`.
Sus propios comentarios documentan que esa forma no bloquea en el protocolo
confirmado. El harness de SPIKE la interpretaba como allow y por eso podía
ocultar la intención del guard.

B3 **no debe perpetuar** esa salida: al extraer ambos módulos debe retornar
`deny` estándar. Se considera corrección de seguridad ya exigida por los
invariantes fail-closed; debe tener fixtures focalizados y quedar listada como
diferencia aprobada respecto del comportamiento accidental, sin escape hatch.

## Rollback

- S1-COR-001 se revierte aislando el commit de este slice.
- El corpus y oracle son aditivos y no se registran como hooks.
- B3 conservará temporalmente la cadena histórica seleccionable por flag de
  rollback; el flag se elimina después del E2E B9.
- Collector nunca forma parte de ese flag ni del rollback ASDD.

## Evidencia de aceptación

| Check | Resultado |
|---|---|
| Oracle de merge/efectos/fail-closed | 5/5 PASS |
| Corpus diferencial actual vs prototipo | 11/11 PASS |
| Coexistencia collector | 2/2 PASS |
| Dangerous quoting focalizado | 3/3 deny (`reset`, quoted, `git -C`) |
| Registro del prototipo en settings | ausente |

S1 queda cerrado. B1 y B2 pueden avanzar; B3 debe consumir este contrato y
cerrar DFX-001 antes de sustituir la cadena registrada.
