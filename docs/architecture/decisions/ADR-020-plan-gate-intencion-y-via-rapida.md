# ADR-020 — Plan gate: intención de respuesta y vía rápida

Fecha: 2026-08-19 | Estado: Aceptada
Deciders: Maintainers ASDD
Relacionado con: ADR-001, ADR-011, ADR-015, ORC-010, GS-003/GS-008/GS-009, `docs/testing/2026-08-03-001-VERIFY-003-framework-governance-gaps.md`

## Contexto

El plan gate ORC-010 tenía tres defectos observados en uso real.

**1. Reconocía una sola palabra.** El único punto donde se parseaba la respuesta del
usuario era un regex de vocabulario cerrado, anclado a string completo:

```js
const APPROVAL_RE = /^\s*(ok|dale|listo|s[ií]|aprobado|adelante|confirmo|go|proceed|continue|continua|continuemos)\s*[!.]*\s*$/i;
```

Fallaba con `"ok, dale"`, `"sí, procede"`, `"perfecto"`, `"de acuerdo"`, `"hazlo"`,
`"apruebo"`, `"ok 👍"`. Y las skills documentaban palabras que el regex **no** contenía
—`asdd-tech-lead-commit/SKILL.md` prometía aceptar `"procede"`, que no estaba—:
el usuario tipeaba lo documentado, el challenge no se consumía y el orquestador quedaba
colgado o intentaba ejecutar `plan-authorization.mjs approve`, que el propio reminder le
prohibía.

**2. Solo tenía la rama "aprobó".** No había tratamiento de rechazo ni de aprobación con
corrección. El challenge quedaba vivo hasta expirar (900s) y una afirmación posterior
fuera de contexto podía aprobarlo — limitación admitida en un comentario del hook.
Además, la regla 5 del gate mandaba **re-presentar el plan** ante cualquier corrección,
aunque la corrección no tocara nada de lo que el challenge realmente ata.

**3. Se interponía donde no autoriza nada.** El gate exigía autorización de lote para
toda invocación de la tool `Agent`. Como CORE-009 obliga a delegar, pedir un commit
producía: plan-gate ask → plan + challenge + confirmación → y **después** el challenge
GS-003 con su propia confirmación. Dos ceremonias para una operación. Y `issueChallenge()`
rechaza explícitamente `git commit` dentro de `commands[]` por GS-003, así que el lote
ORC-010 no autorizaba nada de la operación: era fricción pura. La ruta determinista
declaraba `requires_plan: false` y el hook pedía plan igual — contradicción router ↔ gate.

**4. Deuda auditada.** `VERIFY-003` §Hueco 1 (major, bloqueante): la autorización heredaba
el `expires_at` del challenge, así que el tiempo de lectura del plan se descontaba del
tiempo de ejecución de los agentes. El gate castigaba pensar antes de aprobar.

## Decisión

### 1. Reconocimiento por raíz, no por lista (ORC-010-E)

`.claude/scripts/lib/asdd-approval-intent-lib.mjs` clasifica por **raíz morfológica**.
Una lista cerrada más larga reproduce el mismo bug: `"obvio"`, `"de una"`, `"joya"`, `"va"`
quedarían afuera igual. Una raíz (`aprob*`) cubre todas sus flexiones sin enumerarlas.

Cuatro intenciones: `approval`, `rejection`, `modification`, `none`.

La asimetría que gobierna el diseño: **un falso negativo cuesta un turno de fricción; un
falso positivo ejecuta un plan que el usuario no aprobó.** Por eso el reconocimiento es
generoso ante afirmaciones cortas y puras, y estricto apenas aparece negación, condición o
instrucción nueva. Se conserva la propiedad clave del regex anterior: un prompt con trabajo
nuevo jamás aprueba.

### 2. Cola larga por elegibilidad, no por más vocabulario

Una afirmación que no matchea ninguna raíz (`"brutal"`, `"va"`, `"impecable"`) deja el turno
**elegible**: el hook no aprueba, habilita. El orquestador ejecuta
`plan-authorization.mjs approve --challenge-id <id>` solo si interpreta que hubo aprobación.

El juicio semántico lo aporta el modelo; el binding lo sigue aportando el hook: challenge
activo y vigente, `challenge_id` exacto, marcador de un solo uso que no sobrevive al turno.
El orquestador no puede auto-aprobar en un turno que el hook no marcó elegible. El guard del
orquestador admite esta forma del comando con gramática cerrada; `approve` sin argumentos,
`status` y `--help` siguen denegados.

### 3. Una corrección enmienda; no reinicia la ceremonia

`"ok pero usá tabs"` deja el challenge **emitido pero enmendado**: `approveActiveChallenge()`
falla mientras `amended_at` esté seteado. El orquestador resuelve una de tres salidas:

1. La corrección **no** cambia agentes, `scope[]`, `commands[]` ni budget →
   `amend --challenge-id <id> --confirm-unchanged` y ejecuta el lote original, propagando la
   corrección en el prompt del agente. **No vuelve a presentar el plan.**
2. La corrección **sí** cambia el envelope → challenge nuevo con el delta incorporado, y le
   pregunta al usuario si quiere ver el plan revisado o que proceda directo.
3. No puede determinarlo → pregunta.

Un hook determinista no puede saber si "usá tabs" toca el scope; el orquestador sí. `amend`
no amplía permisos: aprueba el lote **que el usuario ya vio**. Si el orquestador se equivoca,
el peor caso es que la corrección se aplique parcialmente, nunca un scope mayor — y el hook
de operaciones sigue bloqueando cualquier salida de `scope[]`.

Solo el rechazo explícito **revoca** el challenge, para que no quede un plan pendiente que una
afirmación posterior y descontextualizada pueda aprobar.

### 4. Vía rápida ORC-010-F

No pagan la ceremonia del plan gate:

| Caso | Por qué | Gate que sí aplica |
|---|---|---|
| Operación git (commit, push, MR/PR, branch, stash, rebase) | El lote ORC-010 no puede declarar `git commit`; la ceremonia no autoriza nada de la operación | GS-001/GS-003, GS-008, GS-009 — muestran el comando exacto antes de confirmar |
| Cambio LIGHT con scope exacto resoluble (hasta 3 archivos; mover/renombrar incluye el destino si su carpeta padre existe) | El scope lo determina el prompt; no hay nada que el usuario deba elegir | Hook de operaciones contra `scope[]` |

El token de git ops se emite con `scope: []` y `commands: []`: habilita **solo el lanzamiento**
del agente. No autoriza ni un `Write`, ni un `Edit`, ni un Bash sensible.

Force push, `reset --hard` y reescritura de historia quedan fuera de la vía rápida y fuerzan
`requires_confirmation: true`.

### 5. La aprobación abre ventana nueva de TTL

`approveActiveChallenge()` calcula `expires_at = aprobación + ttl_seconds` en vez de heredar el
remanente del challenge. El TTL del challenge sigue acotando la deliberación; el de la
autorización arranca al aprobar. Cierra `VERIFY-003` §Hueco 1.

## Alternativas descartadas

**Ampliar el regex con más palabras.** Es el bug con una lista más larga. Cualquier afirmativa
no prevista sigue fallando, y la lista diverge de lo que documentan las skills — que es
exactamente cómo se originó el defecto.

**Llamar a un LLM desde el hook.** El hook es un proceso Node sincrónico sin red garantizada.
La elegibilidad consigue el mismo juicio semántico moviéndolo al orquestador, que ya está en el
turno, sin aflojar el binding.

**Revocar el challenge ante cualquier corrección.** Es lo que hacía la regla 5 y es la fuente de
fricción reportada: obliga a rehacer plan + challenge + confirmación por un cambio de estilo que
no altera el lote.

**Exceptuar solo `git commit`.** Deja `push` y `MR/PR` pagando doble confirmación con el mismo
argumento estructural en contra.

**Dejar que la vía rápida autorice comandos git.** Duplicaría la política de GS-003/008/009 en un
segundo lugar. El token habilita el lanzamiento y nada más.

## Consecuencias

**Positivas**
- La respuesta del usuario deja de ser una contraseña.
- Una corrección menor cuesta un comando, no una ceremonia.
- Un commit pide una confirmación, con el comando exacto a la vista, no dos.
- Deliberar sobre el plan ya no descuenta tiempo de ejecución.
- El voseo (`mové`, `renombrá`, `actualizá`) enruta correctamente: antes caía a TRIVIAL por baja
  confianza y perdía la vía rápida.

**Negativas / riesgos aceptados**
- La elegibilidad y `amend` mueven juicio al modelo. Mitigación: ambos exigen challenge activo,
  `challenge_id` exacto y un solo uso; ninguno puede ampliar scope, agentes ni comandos.
- La superficie del CLI crece en dos subcomandos acotados. Mitigación: gramática cerrada en el
  guard del orquestador; el resto del CLI sigue denegado.
- `MAX_ATOMIC_SCOPES = 3` es un techo arbitrario. Se eligió bajo a propósito: la vía rápida cubre
  cambios acotados, no lotes.

## Verificación

- `.claude/scripts/test-approval-intent.mjs` — 100 casos de clasificación, incluidas flexiones que
  no están enumeradas en el código.
- `.claude/scripts/test-challenge-amendment.mjs` — enmienda, elegibilidad y ventana de TTL.
- `.claude/scripts/test-direct-light-authorization.mjs` — vía rápida git y scopes de mover/renombrar.
- `.claude/scripts/test-subagent-budget-routing.mjs` — routing de operaciones git y force push.
- `.claude/scripts/test-orc-enforcement-hooks.mjs` — reminders de las cuatro intenciones.
- `.claude/evals/1-orchestrator/orc-010-plan-gate.yaml` — comportamiento del orquestador.
