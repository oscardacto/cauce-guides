# Huecos de gobernanza del framework ASDD — hallazgos de operación intensiva

| Campo | Valor |
|---|---|
| **Tipo de documento** | Reporte de huecos de gobernanza (fase Verificar) |
| **Autor** | `sofka-asdd-solution-architect` — capability `sofka-asdd-solution-architect-sofka-docs` |
| **Fecha** | 2026-08-03 |
| **Rama** | `fix/os-compatibility` |
| **`run_id`** | `2026-08-03-001` |
| **Fase** | VERIFY |
| **Audiencia** | Mantenedor del template ASDD |
| **Alcance auditado** | `.claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs`, `.claude/scripts/lib/sofka-asdd-subagent-budget-lib.mjs`, `.claude/scripts/lib/sofka-asdd-run-reconciliation-lib.mjs`, `.claude/scripts/lib/sofka-asdd-proportional-router-lib.mjs`, `.claude/hooks/sofka-asdd-plan-gate.mjs`, `.claude/hooks/sofka-asdd-user-prompt-submit.mjs`, `.claude/hooks/_lib/run-phase-resolver.mjs`, `.claude/scripts/sofka-asdd-run-bootstrap.mjs`, `.claude/scripts/test-proportional-router.mjs`, `.claude/scripts/test-subagent-budget-routing.mjs`, `.sofka-asdd/asdd-run.schema.json` |
| **Estado** | Abierto — ningún hueco se corrige en este documento. El residuo del hueco 3 se cierra de forma circunstancial el 2026-08-04 (ver su sección); el modelo que lo causa sigue sin cambiar |

## Nota de alcance (leer antes que el resto)

Los cuatro huecos documentados aquí **no se encontraron leyendo el framework, sino operándolo**.
Cada uno se manifestó durante la remediación cross-OS de este ciclo, en el propio acto de
gobernar el trabajo: emitir un challenge, aprobarlo, lanzar agentes, correr el validador y
—el cuarto— simplemente pegar la salida de ese validador en el chat para preguntar por ella.
Ninguno aparece si solo se lee el código con la pregunta "¿está bien escrito?"; los cuatro
aparecen al preguntar "¿qué pasa cuando esto se usa de verdad, con un humano en el medio y
dos agentes opus que tardan minutos?".

**Ninguno de los cuatro es un defecto de seguridad.** Los tres gates de los huecos 1 a 3 hacen
lo que prometen: ninguno deja pasar una operación no autorizada, ninguno falla abierto, ninguno
amplía scope. Lo que fallan es en **ergonomía y completitud del modelo de gobernanza** — el costo
que le cobran al operador legítimo, y las categorías de trabajo real que el modelo no contempla.
El hueco 4 no es un gate sino un **clasificador**, y su modo de falla es el opuesto al peligroso:
sobre-dispara. No deja pasar nada indebido; enruta hacia arriba trabajo que no lo necesita, y con
eso gasta el crédito de atención que las inyecciones del hook necesitan para servir de algo.

Este documento **no corrige nada**. Documenta con evidencia verificada para que el mantenedor
decida y priorice. Cada hueco presenta opciones con trade-offs y **sin recomendación cerrada**
en los puntos donde la decisión es de política, no técnica.

## Resumen

| # | Hueco | Severidad | ¿Bloquea o solo fricciona? | Owner propuesto | Prioridad |
|---|---|---|---|---|---|
| **1** | La autorización de plan hereda el `expires_at` del challenge: el tiempo de deliberación del humano se descuenta del tiempo de ejecución de los agentes | **major** | **Bloquea** — dos lanzamientos abortados en este ciclo con `authorization-expired` | Template | 1 |
| **2** | Un launch rechazado por formato del prompt consume la autorización de un solo uso: ningún agente arranca, pero la autorización queda quemada | **major** | **Bloquea** — obliga a un ciclo completo de challenge nuevo por un error sintáctico | Template | 1 |
| **3** | `run-bootstrap` abre runs en fases que la reconciliación considera inválidas: no existe la categoría de run de mantenimiento o remediación | **major** | **Fricciona con residuo** — deja el validador en `error` permanente sin salida correcta (cerrado circunstancialmente el 2026-08-04; el modelo sigue igual) | Template + `sofka-asdd-solution-architect` (ADR) | 2 |
| **4** | El clasificador de routing decide profundidad y dominio por **coincidencia léxica sobre el prompt completo**, bloques de salida pegados incluidos: una consulta de lectura se enrutó como `depth=FULL; domain=data; reason=new_feature` con `confidence=0.95` | **major** | **Fricciona y erosiona la señal** — fuerza plan y challenge para una lectura, nombra agentes del dominio equivocado y entrena al operador a desatender las inyecciones del hook | Template + `sofka-asdd-solution-architect` (ADR) | 2 |

Los huecos 1 y 2 son del **mismo subsistema** (`sofka-asdd-plan-authorization-lib.mjs`) y se
componen en el peor caso: un launch rechazado por formato quema la autorización (hueco 2), y la
autorización nueva nace con una ventana ya recortada por la deliberación previa (hueco 1). El
hueco 3 es independiente y de naturaleza distinta: no es un defecto de implementación sino una
**categoría ausente en el modelo de datos**.

El hueco 4 se compone con el 1 en una cadena que vale explicitar: un falso positivo hacia FULL
obliga a un plan con challenge (`requires_confirmation=true`), y ese challenge arranca el reloj de
900 s que el hueco 1 hace irrenovable. Es decir, **el clasificador puede imponer el costo del
hueco 1 a trabajo que no necesitaba plan en absoluto**. Los cuatro comparten, además, la misma
forma: un control cuyo **alcance de medición** está mal definido — los guards de contención
comparaban rutas con el separador equivocado, el TTL mide dos relojes con uno solo, y el
clasificador mide intención con léxico.

---

## Hueco 1 — La autorización de plan hereda el TTL del challenge

**Severidad: major. Bloquea. Owner: Template.**

### Evidencia en código

`.claude/scripts/lib/sofka-asdd-plan-authorization-lib.mjs:12` fija el techo del TTL:

```js
const DEFAULT_TTL_SECONDS = 900;
```

`issueChallenge()` (`:167-193`) lo aplica como **techo duro**, no como default. Líneas `:172-173`:

```js
  const ttl = Number(input.ttl_seconds ?? DEFAULT_TTL_SECONDS);
  const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, DEFAULT_TTL_SECONDS) : DEFAULT_TTL_SECONDS;
```

El `Math.min` impide pedir más de 900 s incluso explícitamente. El vencimiento se calcula desde
el instante de emisión del challenge (`:183`):

```js
    expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
```

`approveActiveChallenge()` (`:195-234`) construye la autorización con un `issued_at` **nuevo**
(`:220`) pero **copia el `expires_at` del challenge** (`:221`):

```js
    issued_at: now.toISOString(),
    expires_at: challenge.expires_at,
```

Ese es el hueco en una línea: la aprobación **no abre una ventana nueva**, hereda la que ya
estaba corriendo. Los consumidores de ese campo son `isExpired()` (`:255-257`) y
`findAuthorization()` (`:272-274`), que lanza `authorization-expired`.

### Evidencia empírica — el propio lote que produjo este documento

`.claude/.runtime/plan-authorization/authorizations.json` **en el momento de la primera redacción**
contenía las dos autorizaciones de aquel lote (hoy ya no: ver punto 3 de la sección siguiente).
Ambas compartían estos valores:

```
issued_at:   2026-08-04T13:10:21.307Z
expires_at:  2026-08-04T13:25:21.134Z
```

La **firma de milisegundos es la prueba directa de la herencia**: el `expires_at` termina en
`.134` mientras el `issued_at` de la autorización termina en `.307`. Es decir, el vencimiento
se derivó del instante de emisión del *challenge* (`13:10:21.134` + 900 s), no del instante de
aprobación (`13:10:21.307`). La diferencia efectiva entre aprobación y vencimiento fue de
**899,827 s** — prácticamente los 900 s completos.

Y eso ocurre porque este lote **ya aplica el workaround**: challenge, aprobación y lanzamiento
se ejecutaron en la misma vuelta, con 173 ms entre emisión y aprobación. La ventana no se
recortó porque no hubo deliberación humana en el medio. Los datos confirman el **mecanismo**;
no muestran el daño, porque el daño ya se estaba evitando a mano.

> **HIPÓTESIS — REQUIERE VALIDACIÓN (alcance reducido el 2026-08-04).** Las mediciones del
> incidente **anterior** a la redacción de este documento — dos lanzamientos abortados con
> `authorization-expired`, uno de ellos vencido **por 24 segundos** mientras se construían los
> prompts — fueron reportadas por el orquestador y **no son verificables desde el estado actual
> del repositorio**: el store de autorizaciones se sobrescribe con cada lote (`writeAtomic` en
> `:231`), así que los registros de esos intentos ya no existen. Esa cifra concreta sigue siendo
> hipótesis. Lo que **ya no es hipótesis** es que el hueco aborta trabajo real: la sección
> siguiente documenta un vencimiento medido, ocurrido durante la producción de este mismo
> documento. **Cómo cerrar el resto**: instrumentar `authorization-expired` en la telemetría de
> invocaciones (`appendInvocationTelemetry`, `.claude/hooks/sofka-asdd-plan-gate.mjs:107`) para que
> todo vencimiento por deliberación quede medido y no dependa del relato de una sesión.

### Evidencia empírica del daño — el hueco 1 abortó la redacción de este documento

**Medición, no anécdota.** El lote que produjo la primera versión de este documento se abortó por
la causa exacta que el documento estaba describiendo. Es el caso más limpio posible de evidencia
en vivo: el defecto interrumpió el acto de documentarlo.

| Instante | Valor | Fuente |
|---|---|---|
| Emisión del challenge | `2026-08-04T13:10:21.134Z` | derivado de `expires_at − 900 s` (firma de ms `.134`) |
| Emisión de la autorización | `2026-08-04T13:10:21.307Z` | `issued_at`, leído del store cuando estaba vivo |
| Vencimiento | `2026-08-04T13:25:21.134Z` | `expires_at`, **heredado del challenge** |
| Lanzamiento efectivo del agente | `2026-08-04T13:12:33` aprox. | **reportado por el orquestador** — no verificable desde el store |
| Ventana real de ejecución | **≈ 12 min 48 s** | `13:25:21 − 13:12:33` |
| Presupuesto declarado del lote | `model=opus`, `max_turns=30` | envelope del plan |

La aritmética es la del gate, con números reales: de los 900 s nominales, la construcción de los
prompts del lote consumió ≈ 132 s **antes** de que el primer agente arrancara. El agente recibió
**≈ 12,8 min** para un presupuesto de 30 turnos en opus. Se le acabaron a mitad de la segunda
edición: la nota de actualización de la ADR quedó escrita, y el `Edit` siguiente se rechazó con
`authorization-expired`. **Dos ediciones de un archivo no cupieron en la ventana.**

El costo de recuperación también está medido, y esta parte **sí es verificable en el store actual**:

```
Autorización vencida  → expira 2026-08-04T13:25:21.134Z   (ya no existe en el store)
Autorización nueva    → authorization_id 760c5daf-8bc1-4c0c-916f-8afaf4260cb2
                        issued_at        2026-08-04T13:27:44.610Z
                        expires_at       2026-08-04T13:42:44.442Z
                        launch_used_at   2026-08-04T13:28:21.121Z
```

Tres hechos que se leen directamente de ahí:

1. **Ciclo completo de recuperación: ≈ 2 min 23 s** entre el vencimiento y la autorización nueva —
   plan nuevo, challenge nuevo, aprobación nueva, prompt nuevo, para terminar dos ediciones.
2. **La herencia del TTL se reconfirma de forma independiente.** `issued_at` termina en `.610` y
   `expires_at` en `.442`: el vencimiento se derivó del challenge (`13:27:44.442` + 900 s), no de
   la aprobación. Es la segunda observación del mismo mecanismo, en un lote distinto.
3. **El `writeAtomic` de `:231` se confirma como destructivo para la auditoría.** El store contiene
   hoy **una sola** autorización; las dos del lote anterior —incluida la que venció— desaparecieron.
   Por eso la instrumentación en telemetría no es un lujo: sin ella, cada vencimiento se borra a sí
   mismo y el hueco solo se puede narrar, no medir.

**Lo que esta medición agrega al hueco 1:** la sección anterior demostró el *mecanismo* con la
firma de milisegundos, pero mostró el daño *invisible* porque el workaround estaba en uso. Esta
medición muestra el **daño consumado** en un lote donde el workaround no alcanzó: aun emitiendo,
aprobando y lanzando en la misma vuelta, los ≈ 132 s de construcción de prompts más la ejecución
de un agente opus con 30 turnos no caben en 900 s. Es decir: **el workaround del hueco 1 no es
suficiente para lotes de agente único con presupuesto alto** — reduce la pérdida por deliberación
a cero, pero no crea tiempo de ejecución. El techo de 900 s de `DEFAULT_TTL_SECONDS` está
dimensionado por debajo del trabajo que el propio framework autoriza en su tabla de budgets
(FULL: 3 agentes / 30-50 turnos).

Eso reordena las opciones de abajo: **A** (ventana nueva al aprobar) habría dado 900 s completos
desde la aprobación y probablemente habría bastado aquí, pero no resuelve el caso de un lote FULL
de 3 agentes; **B** (dos TTL separados) es la única que permite dimensionar la ventana de ejecución
por el presupuesto real del lote — `max_turns` y cantidad de agentes ya están en el envelope del
plan, así que el dato para calcularla **ya existe**.

### Por qué importa — la aritmética del gate

El TTL de 900 s tiene que cubrir, en secuencia:

1. La deliberación del usuario frente al challenge (variable, minutos).
2. La construcción de los prompts de los agentes por el orquestador.
3. La **ejecución completa** de los agentes del lote.

Un lote de 2 agentes opus con `max_turns: 30` cada uno —exactamente el de este documento—
puede consumir 15 a 20 minutos solo en el punto 3. Si el punto 1 se lleva 5 minutos, el punto 3
arranca con 10 y muere a mitad de camino. **El tiempo de reflexión del humano se descuenta del
tiempo de trabajo de la máquina**, que es justo la inversión de lo que un gate de aprobación
debería incentivar: el gate castiga pensar antes de aprobar.

### El workaround que tuvimos que adoptar

Emitir el challenge, aprobarlo y lanzar los agentes **en la misma vuelta**, apoyándose en que el
usuario ya había aprobado en lenguaje natural en la vuelta anterior. Funciona y es lo que
produjo la evidencia de arriba. Pero **invierte el orden natural del gate**: la ceremonia formal
(challenge → `ok`) pasa a ejecutarse *después* de la aprobación real, como un trámite de
registro, en lugar de ser el mecanismo que la solicita. ORC-010-A sigue cumpliéndose al pie de
la letra —el challenge existe, está ligado y es de un solo uso— pero su función de *pedir*
autorización queda degradada a *documentar* una autorización previa.

### Opciones evaluadas

| Opción | Trade-off | Consideración de seguridad |
|---|---|---|
| **A. Ventana nueva al aprobar** — `expires_at = approvalTime + TTL` en `:221` | Cambio de una línea. Resuelve el problema por completo: la deliberación deja de consumir presupuesto de ejecución. El techo de 900 s sigue acotando la vida total del permiso | La ventana **absoluta** desde la aprobación no crece (sigue ≤ 900 s), pero la ventana desde la **emisión** sí: un challenge deliberado 10 min y aprobado tendría permiso hasta 25 min después de emitirse. Superficie mayor para que un plan aprobado se reutilice en un contexto que ya cambió |
| **B. Dos TTL separados** — `challenge_ttl` (corto, p. ej. 900 s para deliberar) y `authorization_ttl` (independiente, dimensionado a la ejecución) | Expresa la intención real: son dos relojes que miden cosas distintas. Permite acotar la deliberación *más* que la ejecución, o al revés, según el riesgo del lote | Es la opción más precisa y por eso la más auditable: cada ventana se justifica por separado. Costo: dos parámetros nuevos en el contrato del plan y en el schema de autorización |
| **C. Renovación explícita** — un comando que extiende la autorización viva sin reemitir el challenge | No toca la semántica del TTL. Útil para lotes largos legítimos | Introduce una operación nueva que **extiende un permiso existente**, que es exactamente la primitiva que un atacante querría. Exigiría su propio challenge para no ser un bypass, con lo cual el costo vuelve al punto de partida |
| **D. Subir `DEFAULT_TTL_SECONDS`** | Cero cambio estructural | No distingue deliberación de ejecución: alarga **ambas**. Es la opción que más superficie agrega por menos precisión. Trata el síntoma |

**No se emite recomendación cerrada.** La elección entre A y B es una decisión de política de
seguridad del mantenedor: A es barata e inmediata; B es correcta y más costosa. Lo que sí es
verificable es que **D no resuelve el problema** (no separa los dos relojes) y que **C tiene el
peor perfil de riesgo por unidad de beneficio**.

---

## Hueco 2 — Un launch rechazado por formato consume la autorización de un solo uso

**Severidad: major. Bloquea. Owner: Template.**
**Clasificación revisada (2026-08-04): defecto conocido con workaround en el propio harness de
tests** — no es fricción no advertida. La suite `test-subagent-budget-routing.mjs` **convive con
el comportamiento reemitiendo la autorización antes de cada assert de formato**, en vez de que el
comportamiento esté corregido. Ver "Corroboración independiente" más abajo.

### Evidencia en código — el orden es explícito y verificable

`consumeBudgetedLaunchAuthorization()`, mismo archivo (`:299-306`), completo:

```js
export function consumeBudgetedLaunchAuthorization(agent, toolInput, now = new Date()) {
  const authorization = consumeLaunchAuthorization(agent, now);
  try {
    return assertBudgetedLaunch(authorization, toolInput);
  } catch (error) {
    throw authorizationError("launch-budget-mismatch", error.message);
  }
}
```

**El consumo (`:300`) precede a la validación de formato (`:302`).** No es una ambigüedad de
lectura: son dos sentencias consecutivas en ese orden.

Y el consumo **se persiste a disco** antes de que la validación corra.
`consumeLaunchAuthorization()` (`:278-291`):

```js
  if (authorization.launch_used_at ?? authorization.used_at) {
    throw authorizationError("authorization-replay", `authorization already consumed for agent ${agentType}`);
  }
  const consumedAt = now.toISOString();
  authorization.launch_used_at = consumedAt;
  authorization.used_at = consumedAt;
  writeAtomic(AUTHORIZATIONS_PATH, store);
```

El `writeAtomic` de `:289` sella `launch_used_at` en el store. Cuando `assertBudgetedLaunch`
falla dos líneas después, **no hay rollback**: la marca ya está en disco.

### Qué valida `assertBudgetedLaunch` — y por qué podría correr antes

`.claude/scripts/lib/sofka-asdd-subagent-budget-lib.mjs:89-101`:

```js
export function assertBudgetedLaunch(authorization, toolInput = {}) {
  const model = logicalModel(toolInput.model);
  if (model !== authorization.model) throw new Error(`launch model ${model} does not match authorized ${authorization.model}`);
  const marker = launchMarker(authorization);
  if (!String(toolInput.prompt ?? "").includes(marker)) throw new Error(`launch prompt missing exact budget marker ${marker}`);
  if (authorization.capability) {
    const loader = `node .claude/scripts/sofka-asdd-load-capability.mjs ${authorization.capability}`;
    if (!String(toolInput.prompt ?? "").includes(loader)) {
      throw new Error(`launch prompt missing primary capability loader ${loader}`);
    }
  }
  return authorization;
}
```

Es una **función pura de `(authorization, toolInput)`**: compara el modelo, busca el marcador
literal en el prompt y busca la línea del cargador de capability. **No muta nada** y **no
necesita que la autorización esté consumida** — solo necesita el objeto para leer sus campos.
`findAuthorization()` (`:263-276`) ya lo obtiene sin marcar nada.

Es decir: la validación de formato **puede ejecutarse antes del consumo** sin cambiar su
semántica. Eso hace del orden actual una decisión de implementación reversible, no una
restricción del diseño.

Son **tres** chequeos de formato los que hoy corren post-consumo: modelo (`:91`), marcador de
budget (`:93`) y cargador de capability (`:96-98`).

### El sitio de invocación confirma que no hay pre-validación

`.claude/hooks/sofka-asdd-plan-gate.mjs` es el único consumidor en runtime, con dos call sites:

- `:90` — camino normal del lote aprobado.
- `:101` — fallback de `LIGHT atomic_scoped_change`, después de sintetizar un plan directo.

Ninguno de los dos hace una pasada previa de validación del prompt. El intento de launch llega
directo a `consumeBudgetedLaunchAuthorization`, que consume primero.

### Corroboración independiente — el propio harness codifica el defecto y lo compensa

`.claude/scripts/test-subagent-budget-routing.mjs:81-90`. La estructura completa, verificada línea
por línea, es la prueba más fuerte de este hueco:

```js
issueChallenge(plan); approveActiveChallenge();                                   // :81  ceremonia inicial
// ...
assert.equal(consumeBudgetedLaunchAuthorization(..., { model: "sonnet", prompt: `${marker}\n${loader}\nact` }).model, "sonnet");  // :84  happy path — consume
clean(); issueChallenge(plan); approveActiveChallenge();                           // :85  REEMISIÓN
assert.throws(() => consumeBudgetedLaunchAuthorization(..., { model: "opus", prompt: marker }), ...);          // :86  modelo no coincide
clean(); issueChallenge(plan); approveActiveChallenge();                           // :87  REEMISIÓN
assert.throws(() => consumeBudgetedLaunchAuthorization(..., { model: "sonnet", prompt: "missing" }), ...);     // :88  falta el marcador
clean(); issueChallenge(plan); approveActiveChallenge();                           // :89  REEMISIÓN
assert.throws(() => consumeBudgetedLaunchAuthorization(..., { model: "sonnet", prompt: `${marker} act` }), ...); // :90  falta el cargador de capability
```

Los **tres** asserts de fallo (`:86`, `:88`, `:90`) cubren exactamente los tres chequeos de formato
de `assertBudgetedLaunch` (modelo `:91`, marcador `:93`, cargador `:96-98`) — y **cada uno exige un
`clean(); issueChallenge(); approveActiveChallenge()` inmediatamente antes** (`:85`, `:87`, `:89`).

Eso es lo que eleva la clasificación de este hueco. No es que el defecto pase inadvertido: **la
suite de tests ya convive con él, reemitiendo la autorización, en vez de que el defecto esté
arreglado.** Si un rechazo por formato no consumiera, los tres asserts correrían sobre la misma
autorización viva y las líneas `:85`, `:87` y `:89` serían innecesarias. Su presencia demuestra
que el comportamiento **se conocía a nivel de test** —alguien lo encontró al escribir el harness—
y que se trabajó alrededor en vez de corregirlo.

Consecuencias de esa lectura:

- El hueco **no es un hallazgo nuevo**: es un comportamiento observado, encapsulado en un
  workaround, y nunca escalado a decisión. Su severidad efectiva es *defecto conocido*, no
  *fricción no advertida*.
- Cualquier corrección (opción A, reordenar) **rompe la necesidad** de `:85`, `:87` y `:89`, pero no
  los asserts: seguirían pasando sobre una autorización no consumida. Es decir, el arreglo es
  compatible con la suite actual y además la simplifica — el test se convierte en la verificación
  natural de la corrección.
- Refuerza el argumento de la opción **D** ("dejarlo y documentar el marcador") como la más débil:
  el costo ya se está pagando dentro del propio repositorio, en código de test, desde antes de este
  ciclo.

### Consecuencia operativa

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** La secuencia concreta observada en este ciclo —primer
> lanzamiento rechazado con `launch-budget-mismatch — launch prompt missing exact budget marker`,
> y el reintento con el marcador corregido rechazado con `authorization-replay — authorization
> already consumed`— fue reportada por el orquestador y **no es reconstruible desde el estado
> actual**: `launch_used_at` es un campo único y el store se sobrescribe por lote. El mecanismo
> está verificado en código arriba y es suficiente para explicarla. **Cómo cerrarlo**: registrar
> en telemetría el par (`launch-budget-mismatch`, `authorization-replay`) sobre el mismo
> `authorization_id` para contar cuántas veces ocurre en la práctica.

El hallazgo, independientemente del relato: **un fallo de validación de formato no debería
tener el mismo costo que una ejecución real.** Hoy lo tiene. Ningún agente arranca —el prompt
ni se envía— pero la autorización queda quemada y el operador paga un ciclo completo de
challenge nuevo, con la ventana ya recortada del hueco 1, por un error puramente sintáctico en
un marcador que el propio framework genera de forma determinística (`launchMarker`, `:85-87`).

### Opciones evaluadas

| Opción | Trade-off | Consideración de seguridad |
|---|---|---|
| **A. Reordenar: validar formato antes de consumir** — `findAuthorization` → `assertBudgetedLaunch` → sellar `launch_used_at` | Alineado con lo que el código ya permite: `assertBudgetedLaunch` es pura. Un rechazo por formato deja de costar la autorización | Requiere cuidado: la validación previa **no debe** convertirse en un oráculo que permita sondear el contenido de una autorización viva sin consumirla. Los mensajes de error ya revelan el marcador esperado, así que la superficie no cambia respecto de hoy — pero conviene decidirlo explícitamente, no por omisión |
| **B. Consumo transaccional con rollback** — revertir `launch_used_at` si la validación falla | No cambia el orden, agrega compensación. Más código y una escritura extra | Un rollback es una primitiva que **desmarca** una autorización usada. Si alguna vez se alcanza por otra ruta, es un bypass de replay. Peor perfil que A por el mismo beneficio |
| **C. Presupuesto de intentos de formato** — N rechazos sintácticos permitidos antes de quemar | Tolera el error humano/del orquestador sin reordenar nada | Introduce un contador mutable en el store y una ventana en la que la autorización sigue viva tras un rechazo. Complica el razonamiento sobre "un solo uso", que hoy es binario y auditable |
| **D. Dejarlo como está y documentar el marcador** | Costo nulo. El marcador es determinístico y el mensaje de error lo imprime completo | Traslada el costo al operador de forma permanente. Aceptable solo si la frecuencia medida es cerca de cero — y en este ciclo no lo fue |

**No se emite recomendación cerrada**, pero la asimetría es verificable: **A** es la única
opción que reduce el costo del error sin agregar una primitiva nueva al modelo de autorización
(ni rollback, ni contador de intentos). Las tres alternativas restantes agregan estado o
trasladan el costo.

---

## Hueco 3 — `run-bootstrap` abre runs en fases que la reconciliación considera inválidas

**Severidad: major. Fricciona con residuo permanente. Owner: Template + ADR.**

### Evidencia en código — las dos mitades no se hablan

`.claude/scripts/lib/sofka-asdd-run-reconciliation-lib.mjs:12-21`, completo:

```js
function indexRequirement(state) {
  const active = resolveActivePhase(state);
  const analyzeStatus = state.phases?.analyze?.status;
  const activeOrder = active ? VALID_PHASES.indexOf(active) : -1;
  if (analyzeStatus === "complete" || activeOrder >= VALID_PHASES.indexOf("design")) {
    return { required: true, active_phase: active, reason: "analyze-complete-or-later" };
  }
  if (active === "analyze") return { required: false, active_phase: active, reason: "analyze-in-progress" };
  return { required: false, active_phase: active, reason: "before-analyze-complete" };
}
```

La condición de `:16` exige el INDEX cuando la fase activa es `design` **o posterior** (según el
orden de `VALID_PHASES` en `.claude/hooks/_lib/run-phase-resolver.mjs:15-22`), o cuando
`analyze.status === "complete"`. `resolveIndex()` (`:23-39`) impone además que el puntero exista
y apunte a `docs/specs/*-index.md` (`:34`, `:37`), y emite `build.index_ref — falta o no existe`
cuando el campo está vacío (`:25`).

Del otro lado, `.claude/scripts/sofka-asdd-run-bootstrap.mjs` **acepta cualquiera de las seis
fases sin condición** (`:149-150`):

```js
  const phase = String(args.phase ?? "").toLowerCase();
  if (!PHASES.includes(phase)) throw new Error(`--phase inválida: ${phase}`);
```

Y `newRun()` (`:78-98`) no genera `index_ref` en ninguna forma: construye `phases` con la fase
pedida en `in_progress` y las demás en `pending`, más `manifest_path`, `artifact_seq` y
`artifact_naming`. **Verificado: cero ocurrencias de `index_ref` en el archivo.**

Resultado: `run-bootstrap --phase verify` produce, sin ninguna advertencia, un estado que la
reconciliación considera inválido de forma inmediata y permanente.

### Evidencia del ciclo — el error que no tenía forma correcta de cerrarse

`.asdd-run.json` de este ciclo:

```
run_id:         2026-08-03-001
feature:        os-compatibility
current_phase:  verify
phases.analyze.status: pending
```

Con `current_phase: "verify"`, `resolveActivePhase()` devuelve `verify`, cuyo índice en
`VALID_PHASES` es 4, mayor que el de `design` (2) → `required: true`, razón
`analyze-complete-or-later`. Y como no hay `build.index_ref`, el validador queda con el `error`:

```
asdd-run-reconciliation — build.index_ref — falta o no existe
```

El run se abrió en `verify` porque el trabajo era una **remediación de tooling cross-OS**: no
tiene specs, no tiene HUs, no tiene slices. No es que le falte el INDEX; es que el INDEX no
significa nada para ese trabajo.

Las dos salidas disponibles eran ambas incorrectas:

- **Crear un INDEX vacío en `docs/specs/`** para satisfacer el check. Sería exactamente el falso
  verde que el check existe para impedir — un puntero a un artefacto sin slices reales, que
  además `parseIndex()` (`:41-60`) rechazaría con `INDEX has no planned slices` (`:57`).
- **Relajar el requisito** en `indexRequirement()`. Debilitaría el gate para los runs de feature
  reales, donde el INDEX gobierna slices y dependencias y su ausencia es un defecto genuino.

### El hueco de modelo

El framework asume que **todo run que llega a `design` o después pasó por un Analyze completo
con INDEX**. La asunción está escrita en dos lugares y es coherente entre ellos: la condición de
`indexRequirement():16` y la descripción del schema
(`.sofka-asdd/asdd-run.schema.json:80-83`), que dice literalmente que `index_ref` *"es
obligatorio desde Analyze complete o cualquier fase posterior"*.

La asunción es correcta para el trabajo que el ciclo ASDD fue diseñado para gobernar. Lo que no
contempla es que **existe trabajo legítimo que entra por el medio del ciclo**: remediación,
mantenimiento de tooling, portabilidad, corrección de deuda. Ese trabajo tiene fases (se
verifica, se documenta) pero no tiene backlog descomponible.

**Verificado contra el schema, como se me pidió: no existe ningún campo que distinga tipos de
run.** El inventario completo de propiedades de primer nivel de `.sofka-asdd/asdd-run.schema.json`
es: `run_id`, `feature`, `project`, `started_at`, `last_checkpoint`, `status`, `current_phase`,
`phases`, `context_summary`, `resume_hint`, `reconciliation`, `artifact_seq`, `manifest_path`,
`artifact_naming`, `blocking_issue`, `escalations`, `auto_detected`. Ninguno es una categoría de
run. Lo más cercano es `feature` (`:22-25`), texto libre sin enum y sin consumidor que lo
interprete: en este ciclo vale `"os-compatibility"`, que describe el trabajo pero no lo
clasifica. **La afirmación del encargo es correcta: no existe la categoría de run de
mantenimiento o remediación.**

### Cómo se resolvió en la práctica — y por qué no es una solución

El run `2026-08-03-001` **se descarta al restaurar el run parkeado** `2026-07-28-001`
(`.asdd-run.2026-07-28-001.parked.json`), cuyo estado es:

```
run_id:         2026-07-28-001
feature:        functional-agents-producto-integration
current_phase:  analyze
status:         in_progress
```

Con fase activa `analyze`, `indexRequirement()` toma la rama de `:19` y devuelve
`required: false`, razón `analyze-in-progress`. El error del validador desaparece **sin tocar
una línea de código**.

Es una **salida circunstancial, no una solución**: el error se va porque el run que lo provocaba
deja de ser el activo, no porque el modelo haya aprendido a representar el trabajo que se hizo.
Cualquier run de mantenimiento futuro que se abra en `design` o posterior choca con exactamente
lo mismo. Y el patrón es probable: la remediación de tooling es trabajo recurrente en un
template.

**Estado al 2026-08-04 — el residuo está cerrado, el hueco no.** La restauración del run parkeado
se ejecutó en este mismo ciclo, de modo que `build.index_ref` deja de reportarse y el validador
vuelve a `0 error`. Durante la ventana de la restauración el conteo de `error` oscila entre 1 y 0
según el instante de la corrida: **las dos salidas son correctas** y ninguna es una regresión. La
única lectura válida de ese check mientras el run cambia de manos es "¿hay algún `error` distinto
de `asdd-run-reconciliation`?" — y no hubo ninguno.

Lo que **sigue abierto** es el hueco: el trabajo de este ciclo —remediación de portabilidad, sin
specs ni slices— quedó registrado como un run de feature en fase `verify` y solo dejó de romper el
validador al ser desalojado del puesto de run activo. El modelo nunca lo representó. El siguiente
run de mantenimiento reproduce el error idéntico, y la decisión entre las opciones A y C sigue
pendiente de ADR.

### Opciones evaluadas

| Opción | Trade-off |
|---|---|
| **A. Campo de tipo de run en el schema** (p. ej. `run_kind: "feature" \| "maintenance"`), con `indexRequirement()` exigiendo INDEX solo para `feature` | Nombra la categoría que falta, que es el hueco real. El gate sigue duro donde importa y desaparece donde no aplica. Costo: campo nuevo en el schema, en `run-bootstrap`, en la reconciliación y en el validador; y un punto de decisión nuevo para el orquestador —que puede equivocarse o abusar de `maintenance` para saltarse el INDEX de un feature real. Mitigable exigiendo que `maintenance` no admita slices ni `index_ref`, de modo que la etiqueta sea verificable por sus consecuencias y no solo declarativa |
| **B. Exención cuando Analyze nunca se abrió** — si `analyze.status === "pending"` y no hay artefactos en `specify`/`analyze`, no exigir INDEX | Cero campos nuevos: se deduce del estado que ya existe. Un run que pasó por Analyze y lo completó sigue obligado. Costo: es **inferencia**, no declaración — un run de feature mal abierto directamente en `design` quedaría exento por accidente, que es precisamente el caso que el gate debería atrapar. Cambia un falso positivo por un falso negativo |
| **C. Que `run-bootstrap` rechace abrir en `design` o posterior sin INDEX** — fallar temprano, con mensaje claro | La más simple y la más honesta con el modelo actual: si el framework asume que no existen runs que entren por el medio, hacer que esa asunción se cumpla en la puerta en vez de dejar el validador en rojo. Convierte un error difuso y tardío en un error inmediato y accionable. Costo: **no habilita** el trabajo de mantenimiento — lo prohíbe. Habría que abrir esos runs en `specify` y avanzarlos, o aceptar que no se registran como runs |
| **D. Dejarlo como está** | Cada run de mantenimiento deja un `error` permanente en el validador. Erosiona la señal del propio validador: un error crónico que "ya sabemos que no importa" entrena al equipo a ignorar la salida del gate, que es el mecanismo por el que un error real pasa inadvertido |

**No se emite recomendación cerrada.** A y C responden preguntas distintas y el mantenedor debe
elegir cuál quiere responder: **A** acepta que el trabajo de mantenimiento es de primera clase y
lo modela; **C** sostiene que el ciclo ASDD es solo para features y hace cumplir esa frontera de
forma temprana. **B** parece la más barata y es la que más riesgo de falso negativo introduce.
**D** es la única con costo compuesto: degrada la credibilidad del validador. Por CORE-005, la
elección entre A y C es una decisión arquitectónica y **amerita ADR propio**.

---

## Hueco 4 — El clasificador de routing decide por coincidencia de substring sobre el prompt completo

**Severidad: major. Fricciona y erosiona la señal del hook. Owner: Template + ADR.**

### Qué se observó, textual

El pedido del usuario, citado íntegro:

> Procede con la verificación de la paridad. Indicame también si el problema del index que tenías
> introducido desde las primeras fases está pendiente de resolución o cuál es el estado

Acompañado de ~200 líneas de salida de consola pegada (`npm run validate` y `npm test`, ya visibles
en pantalla). El trabajo pedido era **comparar dos salidas que ya estaban en el chat y reportar el
estado de un check del validador**: lectura pura, sin escritura, sin herramientas necesarias.

El hook `UserPromptSubmit` respondió con:

```
depth=FULL; domain=data; risk=medium; confidence=0.95; requires_plan=true; requires_confirmation=true
capabilities=specify,design,build,verify; reason=new_feature
```

más **dos bloques de enforcement**: uno de seguridad exigiendo ruta FULL con `sofka-asdd-security` y
`sofka-asdd-developer-backend` **antes de cualquier `Read`/`Grep`/`Bash`**, y otro de
`ORC-000 / WF-003-B` declarando *señal de plataforma de datos analíticos detectada* y ordenando
enrutar a `sofka-asdd-data-architect`, con la instrucción explícita de **no** usar
`sofka-asdd-solution-architect`.

No había feature nueva, ni plataforma de datos, ni data lake, ni Databricks, ni Medallion.

### Punto 1 — qué produjo `domain=data`

`domain` sale de `detectDomain()`, `sofka-asdd-proportional-router-lib.mjs:28-34`. La rama de datos
es una sola línea (`:29`) y su vocabulario es cerrado:

```js
  if (/\b(data lake|lakehouse|medallion|databricks|etl|elt|warehouse)\b/i.test(text)) return "data";
```

**Verificación negativa primero, porque descarta las hipótesis del encargo:** `index` **no está** en
ese vocabulario, y `estado` tampoco. Ninguna de las dos puede haber producido `domain=data`. Lo
mismo vale para `catalog` aislado: el patrón del hook exige `unity catalog` completo. Las dos
hipótesis del encargo quedan **refutadas por lectura del código**, no por juicio.

Hay que separar además **dos clasificadores independientes** que en este incidente dispararon a la
vez y que es fácil confundir:

| Clasificador | Dónde | Qué produjo |
|---|---|---|
| `detectDomain()` del router | `sofka-asdd-proportional-router-lib.mjs:29` | el campo `domain=data` de la línea de ruta |
| `DATA_DOMAIN_RE` del hook | `sofka-asdd-user-prompt-submit.mjs:52`, vía `getDomainRouting()` (`:60-63`) y `getPromptInjectionProfile()` (`:92-94`) | el bloque imperativo `ORC-000 / WF-003-B` (`:226-236`) |

Son **vocabularios distintos y parcialmente solapados**. El del hook es más largo (agrega
`bigquery`, `snowflake`, `redshift`, `glue`, `athena`, `unity catalog`, `auto loader`, `star schema`,
`pipeline de datos`, `bronze|silver|gold + layer|tier|capa`) pero exige `data warehouse` completo
donde el router acepta `warehouse` solo. La **intersección** es exactamente
`{data lake, lakehouse, medallion, databricks, etl, elt}`.

De ahí se deduce, sin ver el texto pegado: si un **único** token disparó las dos cosas, pertenece a
esa intersección de seis. Y como el bloque inyectado fue el de `data` y no el de
`data-software-ambiguity` (`:247-256`), se sabe también que `SOFTWARE_ARCH_RE` (`:58`) **no** matcheó
— no había `base de datos`, ni `escalabilidad`, ni `stack`, ni `api rest` en el prompt completo.

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** *Cuál* de los seis tokens matcheó. El texto pegado no se
> conserva en ningún artefacto del repositorio, así que no es recuperable desde el estado actual.
> Los candidatos con más superficie son `etl` y `elt`: son tokens de **tres letras** delimitados por
> `\b`, y en JavaScript `\b` trata `-`, `/`, `.` y los espacios como frontera, de modo que
> `ETL`, `.etl`, `x/etl/y` o `-elt-` matchean igual. **Cómo cerrarlo**: ejecutar
> `node .claude/scripts/sofka-asdd-route-request.mjs` con el prompt exacto y ver el `domain`, o
> registrar en telemetría el token que disparó la clasificación —hoy la salida informa el
> resultado (`domain=data`) pero **nunca qué lo causó**, que es justo el dato que haría auditable al
> clasificador.

Un detalle verificable y de la misma familia que los defectos de este ciclo: la **única** mitigación
que existe hoy contra el ruido léxico es la máscara de rutas de `:85`,
`detectDomain(text.replace(PATH_TOKEN, " "))`, con el comentario correcto al lado (`:83-84`: "los
nombres de archivo son scope, no señales de dominio"). Pero `PATH_TOKEN` (`:9`) es
`(?:^|\s)(?:[\w.-]+\/)+[\w.-]+` — **solo reconoce `/`**. Una ruta Windows con `\` no se enmascara, así
que el mismo path contamina o no el dominio según el separador con que la consola lo haya impreso.
Es el mismo error de alcance que los guards de contención de este ciclo, en otro archivo.

### Punto 2 — qué produjo `reason=new_feature`

`NEW_FEATURE`, `sofka-asdd-proportional-router-lib.mjs:6`:

```js
const NEW_FEATURE = /\b(nueva? funcionalidad|nuevo módulo|feature|implementar .+ (sistema|módulo|servicio|flujo)|crear .+ (api|servicio|módulo))\b/i;
```

La tercera alternativa es **la palabra inglesa `feature`, suelta**. Cualquier aparición de ese token
en cualquier parte del prompt hace `feature = true` (`:44`) y entra en la **primera** rama de la
cadena de decisión (`:52-54`):

```js
  if (options.always_full || feature || (sensitive && write)) {
    depth = "FULL"; confidence = 0.95;
    reasons.push(options.always_full ? "policy_always_full" : feature ? "new_feature" : "sensitive_write");
```

Dos consecuencias verificables del **orden** de esa cadena:

1. La rama de `feature` está **antes** de `explicitReadOnly` (`:55-58`) y de `query` (`:59-60`). Un
   prompt que declare "modo estrictamente de lectura, sin modificar archivos" y que además contenga
   la palabra `feature` se clasifica FULL: el léxico gana a la declaración explícita de intención.
2. `confidence` queda en 0.95, lo que impide cualquier reevaluación posterior (ver punto 4).

Y hay una ironía estructural que conviene registrar: `feature` **es vocabulario propio del
framework**. `.asdd-run.json` tiene un campo `feature` de primer nivel
(`.sofka-asdd/asdd-run.schema.json:22-25`, ya inventariado en el hueco 3), la reconciliación lo lee y
el trabajo de este ciclo vale literalmente `feature: os-compatibility`. Es decir: **la salida de las
propias herramientas del framework contiene el token que fuerza a su clasificador a FULL**. Nota
menor pero útil para quien escriba el fix: el plural `features` **no** matchea, porque la `s` rompe
el `\b` de cierre.

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** Que el token `feature` haya venido específicamente de una
> línea `feature: os-compatibility` de la salida pegada. El mecanismo está verificado; la
> procedencia exacta no, por la misma razón que arriba. **Cómo cerrarlo**: igual que el punto 1,
> reejecutando el router con el prompt exacto.

### Punto 3 — sí: se clasifica todo el prompt, bloques pegados incluidos

Este es el punto importante y **está verificado, no es hipótesis**:

- El hook lee el prompt y lo pasa entero: `:144` solo trunca
  (`String(event.prompt ?? event.user_prompt ?? "").slice(0, 50000)`), y `:87` vuelve a truncar en
  `getPromptInjectionProfile`. **No hay ninguna otra transformación.**
- `routeRequest()` recibe el prompt crudo (`:169`, y otra vez en `:105` dentro de
  `getDeterministicRouteReminder`) y en `:37` hace
  `unwrapPromptDocument(raw).trim().slice(0, 50_000)`.
- `unwrapPromptDocument()` (`:17-22`) es **la única** lógica del sistema consciente de bloques de
  código, y hace lo **inverso** de filtrar: solo actúa si el prompt contiene el encabezado literal
  `## Prompt para copiar`, y en ese caso **extrae** el contenido de la primera cerca ```` ``` ````
  descartando el resto. Fuera de ese caso exacto, cero manejo de cercas.
- La única máscara es `PATH_TOKEN` y se aplica **solo** al cálculo de `domain` (`:85`). La detección
  de `feature`, de `WRITE`, de `BUG_SYMPTOM` y de `SENSITIVE` corre sobre el texto sin enmascarar.
- El hook **no** llama a `unwrapPromptDocument`: `getPromptInjectionProfile` clasifica el texto
  crudo. Ante un prompt con `## Prompt para copiar`, los dos clasificadores ven **textos distintos**
  y pueden discrepar por construcción.

De ahí se deriva la medición central de este hueco. Aplicando la cadena de `routeRequest()` a **solo
la oración del pedido** citada arriba: `NEW_FEATURE` no matchea; `QUERY` (`:4`) no matchea porque
exige que el prompt *empiece* con un interrogativo y este empieza con "Procede"; `WRITE` (`:5`) no
matchea (ni "procede", ni "indicame", ni "resolución" están en su lista); `BUG_SYMPTOM` (`:7`)
tampoco, porque "problema" **no** figura en él; `SENSITIVE` (`:2`) tampoco. Todas las banderas en
falso llevan a la rama final (`:69-71`): `depth = TRIVIAL`, `confidence = 0.55`, razón
`uncertain_read_or_conversation`; y como 0.55 < 0.7, el escalamiento de `:73-78` la sube exactamente
un nivel a **LIGHT**, con `domain=general`, `requires_plan=false` y **cero bloques de inyección**
(`profile.signals` vacío → `mode: "none"`, `:99`).

Es decir: **el 100 % de la diferencia entre `LIGHT/general/0.55/lectura` y el
`FULL/data/0.95/new_feature` observado proviene de texto que el usuario no escribió como pedido,
sino que pegó como evidencia.** (Premisa explícita de esa derivación: que la oración citada sea el
pedido completo en lenguaje natural y el resto fuera salida de consola. Es lo que reporta el
encargo; la derivación es del código, no de la ejecución.)

El bloque de seguridad lo corrobora de forma independiente.
`isAuthorizationSecurityChange()` (`:81-84`) exige `CHANGE_VERB_RE` **y**
(`ACCESS_CONTROL_RE` **o** `AUTHORIZATION_RISK_RE`). `CHANGE_VERB_RE` (`:68`) es
`corrige|corregir|implementa|implementar|cambia|cambiar|modifica|modificar|endurece|endurecer|asegura|asegurar`:
**ninguno** aparece en la oración del pedido ("verificación" no está en la lista). Y
`ACCESS_CONTROL_RE` (`:73`) incluye `challenge` y `plan-authorization`, tokens que abundan en la
salida de un ciclo dedicado a autorizaciones. La inyección de seguridad, entonces, **solo pudo
originarse fuera de la oración del pedido** — que es la tesis de este punto.

La consecuencia práctica es la que hay que llevarse: **cualquier log, diff, traza de error o extracto
de documentación que se pegue en el chat reenruta el turno completo** si contiene uno de estos
tokens, y la lista de tokens contaminantes es amplia y cotidiana en un repositorio de plataforma:
`feature`, `etl`, `spec`, `adr`, `pipeline`, `challenge`, `compliance`, `cloud`, `stack`. Y el efecto
es simétrico en la dirección opuesta: el `slice(0, 50000)` puede **enterrar** una señal legítima que
caiga después del corte en un prompt con mucho texto pegado.

### Punto 4 — de dónde sale `confidence=0.95`

De un literal. `sofka-asdd-proportional-router-lib.mjs:53`: `depth = "FULL"; confidence = 0.95;`.
Cada rama de la cadena asigna su propio número fijo (0.96, 0.95, 0.9, 0.82, 0.62, 0.55). **La
confianza es una constante por rama, no una medida de la fuerza de la evidencia**: no depende de
cuántas señales matchearon, ni de cuán específicas eran, ni de dónde aparecieron. Su único
consumidor es la comparación con el umbral de `:73-78`, cuya función es escalar la profundidad
cuando la rama elegida es intrínsecamente ambigua.

Traducción honesta del `0.95`: **"esta rama es determinística"**, no "esta clasificación es
probablemente correcta". Una coincidencia de substring de siete letras (`feature`) produce el mismo
0.95 que un pedido explícito de implementar un módulo nuevo.

Y ese número no viaja solo. Del mismo `depth=FULL` se derivan mecánicamente `risk=medium` (`:86`,
por ser FULL — no por ninguna señal de riesgo, ya que `sensitive` era falso) y
`requires_confirmation=true` (`:89`), más `capabilities=specify,design,build,verify` (`:90`). **Un
match léxico se propaga a cinco campos que en la salida se leen todos como si hubieran sido
medidos.**

### Corroboración independiente — el defecto ya se encontró una vez y se cerró en un solo caso

Igual que el hueco 2 tiene su workaround dentro del harness, el hueco 4 tiene su antecedente dentro
del propio router. El comentario de `:14-16` es explícito:

```js
// Los documentos de prueba pueden envolver el request real en una sección
// "Prompt para copiar". Enrutar el wrapper completo introduce falsos positivos
// desde sus criterios de aceptación (por ejemplo `cloud` o `ADR`).
```

Eso es **exactamente** este hueco: texto que no es el pedido (criterios de aceptación) contaminando
la clasificación por coincidencia léxica. Y `test-proportional-router.mjs:27-39` fija ese caso con un
assert que exige `domain === "general"` para un wrapper cuyo cuerpo es un pedido read-only.

La lectura que importa: **la clase de defecto era conocida y se resolvió con un allowlist de un solo
encabezado** (`## Prompt para copiar`) en lugar de con una regla general sobre qué parte del prompt
es el pedido. Cualquier otra forma de texto no-pedido —una salida de consola pegada, un fragmento de
diff, una cita de documentación— sigue entrando completa al clasificador.

Cobertura de tests, verificada: hay un test negativo para el vocabulario de software
(`test-orc-enforcement-hooks.mjs:28`, `T05c3`: "a bare backend mention does not force
solution-architect routing") y otro para el wrapper de auditoría. **No hay ningún test negativo para
el vocabulario de datos ni para la alternativa `feature` de `NEW_FEATURE`**: los nueve casos de
`test-proportional-router.mjs:4-14` y los asserts de `test-conditional-orc-injection.mjs:30-32`
afirman todos la dirección positiva (un prompt que *sí* es de data lake enruta a data). La dirección
del falso positivo no está afirmada por ninguna prueba.

### Por qué importa — la asimetría del falso positivo

Este hueco es de la **misma familia que los 22 defectos que cerró este ciclo**: un control cuyo
**alcance está mal medido**. Los guards de contención comparaban rutas con el separador equivocado;
este clasifica intención por coincidencia léxica. En los dos casos el control **corre, no falla, y
produce una decisión incorrecta con apariencia de certeza**. No hay excepción, no hay `error`, no hay
nada que un test de "¿pasa?" pueda detectar: la salida es bien formada y está mal.

Un falso positivo hacia FULL parece "conservador", pero **no es gratis** y conviene enumerar el
costo:

1. **Impone la ceremonia completa a una lectura.** Plan, challenge, espera de `ok` — y con ello el
   reloj de 900 s del hueco 1, para un trabajo que no escribe nada.
2. **Nombra agentes del dominio equivocado.** La inyección ordenó `sofka-asdd-data-architect` para
   comparar dos salidas de consola. Ese agente tiene un scope check recíproco y habría devuelto
   `fuera_de_dominio`; el resultado de obedecer no era una respuesta peor, era **un rebote**.
3. **Y sobre todo: entrena al operador a ignorar las inyecciones del hook.** Este es el riesgo de
   fondo. Un guard que grita seguido se desatiende. Cuando el hook acierte —una señal real de Figma,
   un cambio real de autorización— el bloque imperativo va a llegar con el crédito ya gastado, y ahí
   sí se pierde el caso que el mecanismo existía para atrapar. **El costo del falso positivo no lo
   paga el turno en que ocurre; lo paga el turno en que la inyección era correcta.**

Vale además cuantificar el falso negativo de la dirección opuesta, porque es el argumento con el que
se defiende el estado actual: si el vocabulario se afina y un pedido real de plataforma de datos
—formulado de forma oblicua, sin ninguno de los tokens— se enruta a `sofka-asdd-solution-architect`,
**existe una segunda línea de defensa y está implementada**: el scope check recíproco de la Capa 3
(ADR-002) obliga a ese agente a devolver `ESCALAMIENTO REQUERIDO / fuera_de_dominio` y a recomendar
`sofka-asdd-data-architect`. El costo de un falso negativo es, entonces, **un rebote recuperable y
observable**. El del falso positivo **no lo detecta ningún control**: nadie reporta "este turno se
enrutó a FULL sin motivo". Eso hace que afinar el clasificador hacia la precisión sea más barato de
lo que parece — pero es una decisión de política, y no se decide en este documento.

### Nota de honestidad — el orquestador no siguió la ruta inyectada

**Qué pasó.** El orquestador **desobedeció** las dos inyecciones. Clasificó el pedido como lectura
con inventario cerrado, lo resolvió por ORC-000 sin subagentes, y **declaró el desvío al usuario** en
la misma respuesta.

**Qué dice el texto que ignoró.** No es un detalle menor: la propia línea de ruta que el hook imprime
incluye la instrucción `"No sustituyas esta ruta por una clasificación manual"`
(`sofka-asdd-user-prompt-submit.mjs:112`), y el encabezado del hook explica por qué existe
(`:8-13`): la causa raíz del bug original era que *"el enforcement de delegación vivía SOLO como
regla en el prompt y el modelo NO infería las señales… Reforzar texto no alcanza"*. El mecanismo se
construyó **precisamente** para sacarle al modelo la decisión que el modelo acaba de retomar.

**Mi juicio, y es un juicio, no una justificación.** El desvío estuvo **bien en este turno y no
constituye un procedimiento**:

- A favor, y verificable: la ruta inyectada era **factualmente incorrecta**. La derivación del punto
  3 muestra que el pedido, por sí solo, clasifica LIGHT/`general`. Obedecer no habría producido un
  resultado más seguro sino un rebote por `fuera_de_dominio` (punto 2 de la sección anterior), más el
  costo de un challenge para una lectura.
- A favor: el desvío **se declaró**, que es lo que ORC-000-B exige de una excepción. Un desvío
  declarado deja al usuario la última palabra; un desvío silencioso, no. La diferencia es toda la
  diferencia.
- A favor: la operación era read-only, con inventario cerrado y sin herramientas de dominio, que es
  exactamente el caso que ORC-000 autoriza a resolver directo.
- **En contra, y es serio:** el orquestador es el **peor árbitro posible** de "el clasificador
  determinístico se equivocó", porque esa inferencia es justo la que el hook existe para eliminar. Si
  la regla operativa termina siendo "obedecé la inyección salvo cuando te parezca un falso positivo",
  el hook vuelve a ser texto persuasivo y se pierde la propiedad mecánica que lo justificaba.
- **En contra:** el precedente no tiene límite escrito. Nada distingue este desvío de otro peor.

**Lo que convierte al desvío en el menor de dos males, y es el hallazgo de esta sección:** el
framework **no tiene un canal para registrar que el hook se equivocó**. El único escape hatch que
existe es la variable de entorno `SOFKA_ASDD_DELEGATION_INJECT_DISABLE=1` (`:25`, aplicada en
`:138-140`), que es **todo o nada y silenciosa**: apaga *todas* las inyecciones de la sesión, sin
dejar registro de qué se apagó ni por qué. Frente a una inyección incorrecta, las dos únicas salidas
sancionadas son **obedecerla** o **desactivar el mecanismo completo**. No existe "esta inyección es
un falso positivo, queda anotado, sigo". Mientras eso siga así, cada falso positivo se resuelve con
un desvío ad hoc que no deja huella — y la frecuencia real del hueco 4 seguirá siendo inmedible,
igual que los vencimientos del hueco 1 antes de instrumentar la telemetría.

### Opciones evaluadas

| Opción | Trade-off | Costo del falso negativo |
|---|---|---|
| **A. Excluir del texto clasificado los bloques pegados** — cercas ```` ``` ````, bloques indentados, líneas con forma de log — antes de correr los patrones | Ataca la causa medida en el punto 3 y es la de mejor relación beneficio/costo: no toca ningún vocabulario ni ninguna rama de decisión. Debe **componerse** con `unwrapPromptDocument` (`:17-22`), que hace lo contrario en su caso especial; son dos mecanismos opuestos y hay que decidir la precedencia explícitamente, no dejarla al orden de las llamadas | Un usuario que pegue una spec o una HU **dentro** de una cerca y pida implementarla pierde las señales del contenido. Mitigación: la oración fuera de la cerca casi siempre lleva el verbo de intención, que es lo que la opción B propone exigir de todos modos |
| **B. Exigir señal de intención, no solo léxico** — combinar el vocabulario de dominio con un verbo de diseño/cambio en proximidad. El patrón **ya existe en el archivo**: `AUTHORIZATION_RISK_RE` (`:74`) usa ventanas `[\s\S]{0,100}` e `isAuthorizationSecurityChange` (`:83`) exige verbo + objeto | Es la corrección conceptualmente correcta: el clasificador dice medir *intención* y hoy mide *presencia de palabras*. Reutiliza una técnica ya validada en el mismo archivo. Costo: los patrones se vuelven más largos y más frágiles de mantener | Pierde prompts telegráficos legítimos ("¿Medallion o Star schema?", "data lake en Databricks — opciones"), que hoy enrutan bien. Es un falso negativo real y frecuente en conversación exploratoria |
| **C. Separar la confianza del clasificador de la severidad de la inyección** — emitir una confianza derivada de la evidencia (cuántas señales, cuán específicas, si aparecieron en bloque pegado) y modular con ella el **tono** del bloque inyectado: imperativo con evidencia fuerte, informativo con evidencia débil | Ataca la apariencia de certeza, que es el mecanismo por el que el hueco erosiona la señal (punto 4). Permite que el hook siga hablando siempre, pero dejando de gritar cuando tiene poco. Costo: es el cambio más grande, obliga a definir qué cuenta como evidencia y toca el contrato de salida del router que otros consumidores leen (`sofka-asdd-route-request.mjs`, `test-proportional-router.mjs`, `benchmark-subagent-budget.mjs`) | Bajo por sí solo: no cambia qué se detecta, solo cómo se presenta. Riesgo distinto: una señal fuerte presentada con tono suave puede desatenderse igual, y el problema se muda al calibrado del tono |
| **D. Que la inyección de dominio sea sugerencia y no orden** — bajar "DEBES enrutar a X" a "considerá X; si no aplica, declaralo con motivo" | Es el cambio más barato y **describe lo que ya está pasando de hecho**: la orden se está desobedeciendo, en silencio y sin registro. Formalizarlo como sugerencia con declaración obligatoria convierte una desobediencia tácita en un desvío auditable. Costo: devuelve al modelo exactamente la decisión que el hook fue creado para quitarle (`:8-13`), con el riesgo de reincidir en la clase de bug que originó el mecanismo | Alto y difícil de acotar: ante una señal **correcta** de Figma o de datos, un modelo que puede "declarar el desvío" tiene una salida barata para no delegar. Es la opción con el peor perfil si se aplica **sola**; es razonable como complemento de A o B, cuando el falso positivo ya sea raro |
| **E. Escape hatch granular con registro** — permitir marcar una inyección puntual como falso positivo, dejando traza, en vez del `SOFKA_ASDD_DELEGATION_INJECT_DISABLE=1` todo-o-nada de `:25` | No corrige la clasificación: hace **medible** su tasa de error, que hoy es desconocida. Es el prerrequisito para saber si A, B o C valen la pena y para verificar después que funcionaron | No aplica: no cambia ninguna decisión de routing. Su costo es estado nuevo y la tentación de usar el registro como bypass rutinario en lugar de arreglar el clasificador |

**No se emite recomendación cerrada.** Lo que sí es verificable y acota la decisión del mantenedor:

- **A y B atacan la medición** (qué texto y qué evidencia se clasifican); **C ataca la presentación
  de la certeza**; **D solo cambia el tono de la orden** sin corregir nada de lo anterior; **E no
  corrige, instrumenta**.
- **D aplicada sola es la más riesgosa**: deja intacta la clasificación incorrecta y además debilita
  el enforcement para los casos correctos.
- **E es la única que no requiere decidir nada más**: hoy la frecuencia del hueco es desconocida, y
  las opciones A a C se justifican o se descartan con ese número. Es también la que apagaría el
  argumento de fondo de esta sección —que el operador se desentienda— porque un desvío registrado no
  es un desvío perdido.
- Por CORE-005, cambiar cómo se clasifica la intención del usuario o cómo se presenta un bloque de
  enforcement **modifica el contrato de gobernanza** y amerita ADR, igual que el hueco 3.

---

## Causa raíz compartida — un movimiento de código sin barrido de referencias

Este ciclo dejó una segunda evidencia del mismo patrón, y vale registrarla junto a los tres
huecos porque explica cómo se degrada la gobernanza sin que nadie tome una mala decisión.

El commit `59975b2` (2026-07-17, *"perf(hooks): consolidate session start guards"*) movió cinco
hooks de `SessionStart` a `.claude/scripts/legacy-hooks/` y los consolidó en
`.claude/hooks/sofka-asdd-session-start-dispatcher.mjs`. Verificado en este ciclo:
`.claude/scripts/legacy-hooks/` contiene los cinco archivos
(`sofka-asdd-codebase-size.mjs`, `sofka-asdd-model-strategy.mjs`, `sofka-asdd-session-start.mjs`,
`sofka-asdd-state-freshness.mjs`, `sofka-asdd-tdd-state.mjs`) y ninguno de ellos existe en
`.claude/hooks/`.

El commit actualizó `settings.json`, pero **dejó atrás dos consumidores de esas rutas**:

| Artefacto huérfano | Síntoma |
|---|---|
| `.claude/scripts/test-orc-tier-c-hooks.mjs` | `0 PASS / 15 FAIL`. `spawnSync` sobre rutas inexistentes deja `stdout` vacío y los asserts `T11`–`T25` caen en bloque. Documentado en detalle en `docs/testing/2026-08-03-001-VERIFY-001-preexisting-test-suite-defects.md` §1 |
| `docs/architecture/decisions/ADR-001-orc-enforcement-3-tiers.md` | Referenciaba los cuatro hooks en `.claude/hooks/` y describía un mecanismo que el dispatcher no implementa. **Corregido en este ciclo** con nota de actualización fechada |

El patrón que vale registrar: **un movimiento de código sin barrido de referencias produce a la
vez un test roto y documentación falsa**. Los dos fallan en silencio y de formas distintas — el
test grita pero nadie lo corre, la ADR calla y se lee como verdad. El runner nuevo (`npm test`)
es lo que ahora haría visible la mitad de test; para la mitad documental no hay gate
equivalente.

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** Que no existan otras referencias colgantes del mismo
> commit más allá de estas dos. Se verificó la ausencia de los cuatro hooks en `.claude/hooks/`
> y su presencia en `legacy-hooks/`, pero **no se hizo un barrido exhaustivo** de menciones por
> nombre en todo el árbol (reglas, skills, agentes, commands, docs). **Cómo cerrarlo**: un grep
> por los cinco basenames sobre el repositorio completo, y considerar un check de validador que
> detecte referencias a rutas de hook inexistentes.

---

## Evidencia de paridad cross-OS — lo que cierra el ciclo

Esta sección no documenta un hueco: registra la **evidencia que cierra la remediación** de este
ciclo. El usuario ejecutó el validador y las 45 suites en **WSL Fedora**; los resultados de Windows
se verificaron desde este host. Los números de Linux son **reportados por el usuario y no
reproducibles desde aquí** — se atribuyen como tales, no se presentan como medición propia.

| Evidencia | Windows | Linux (WSL Fedora, reportado) | Lectura |
|---|---|---|---|
| `npm run validate` | 35 ok · 2 warn · 1 error | 35 ok · 2 warn · 1 error | **Idéntico, check por check** |
| `hash-eol-normalization` | 17 sitios | 17 sitios | Mismo resultado |
| `hook-command-shape` | 6 hooks | 6 hooks | Mismo resultado |
| `path-separator-safety` | 105 fuentes, allowlist de 5 | 105 fuentes, allowlist de 5 | Mismo resultado |
| `npm test` | 42 PASS · 3 fallos conocidos · 0 nuevos · 0 desvíos de modo · 0 baseline obsoleto · exit 0 | igual | Mismo resultado |
| `hooks-executable` | **saltado** (NTFS no tiene bit de ejecución) | `18 hook(s) are executable` — **pasó** | Ver nota abajo |
| `test-git-guards-cwd` | 54 pasaron · 11 fallaron | 54 pasaron · 11 fallaron | Mismo conteo, **mismos 11 casos** |

**Nota sobre el momento de la medición.** La fila de `npm run validate` registra el estado **anterior**
a la restauración del run parkeado: el único `error` de las dos plataformas era
`asdd-run-reconciliation — build.index_ref`, es decir el residuo del hueco 3. Verificado desde este
host **después** de la restauración, el mismo comando reporta **36 ok · 2 warn · 0 error**: el conteo
de `ok` sube en uno porque ese mismo check pasa de `error` a `ok`
(`run 2026-07-28-001: analyze-in-progress — skipped`). Las dos salidas son correctas y describen el
mismo repositorio en dos instantes; ninguna es una regresión. La paridad cross-OS se afirma sobre la
primera, que es la que ambas plataformas midieron con el mismo run activo.

Tres lecturas que valen más que la tabla:

1. **`hooks-executable` solo tiene dientes en Linux, y está verde.** El check se saltea en Windows
   porque NTFS no expone bit de ejecución, así que su resultado en Windows no aporta información. La
   paridad de este check no es "mismo resultado en ambas" sino **"verificado donde es verificable"**,
   y ahí pasó con los 18 hooks.
2. **Los 11 casos fallidos de `test-git-guards-cwd` son idénticos en las dos plataformas.** Mismo
   conteo y mismos casos. Eso confirma —según el reporte del usuario— que los 3 fallos baselineados
   son `script_issue` **independientes de plataforma**, no defectos de portabilidad: si fueran de
   portabilidad, el conteo tendría que divergir entre NTFS y ext4.
3. **El rendimiento no tiene paridad, y no es un defecto.**

| Medición | Linux | Windows | Factor |
|---|---|---|---|
| 45 suites completas | 65,2 s | 187–458 s | hasta ~7× |
| `test-git-guards-cwd` sola | 7,8 s | 78–180 s | hasta **23×** |

La causa es el **costo de spawn de procesos en Windows** con ~62 repos git fixture: la suite crea y
destruye procesos en volumen, y ahí Windows paga un sobrecosto estructural. **No es un defecto: es
una propiedad de plataforma.** Pero es un dato necesario, y por dos razones concretas:

- **Cualquier timeout dimensionado con los números de Linux es un generador de flakiness en
  Windows.** Un margen que en Fedora sobra por 8× en `test-git-guards-cwd` queda por debajo del
  tiempo real en Windows. Y por `sofka-asdd-system-integrity.md`, un timeout intermitente no se
  tolera como ruido: se investiga. Conviene entonces no crear la condición.
- **Es el mismo error de calibración que el hueco 1.** Los 900 s fijos de `DEFAULT_TTL_SECONDS` y un
  timeout de tests calibrado en una sola plataforma son la misma clase de defecto: **un presupuesto
  temporal constante para un trabajo cuya duración varía por un orden de magnitud** según el
  presupuesto del lote o según el sistema operativo. Si el mantenedor toca uno de los dos números,
  vale mirar el otro con el mismo criterio.

**Conclusión de la sección:** la paridad se cumple **en resultados** —que es lo que la remediación
prometía— y **no** en tiempos, que nunca prometió. Los 22 defectos de portabilidad cerrados por el
ciclo se verifican con la primera tabla; la segunda es el dato de operación que hay que recordar
antes de escribir cualquier `timeout` nuevo.

---

## Qué NO hacer

### 1. Subir `DEFAULT_TTL_SECONDS` para "arreglar" el hueco 1

Alarga la ventana de deliberación **y** la de ejecución con el mismo número, sin separar los dos
relojes. El síntoma desaparece a costa de más superficie de reuso para todo permiso emitido,
incluidos los lotes cortos que no tenían el problema. Si la respuesta es "más tiempo", la
pregunta correcta es "¿más tiempo para qué de las dos cosas?".

### 2. Normalizar el workaround del hueco 1 como si fuera el diseño

Emitir challenge, aprobar y lanzar en la misma vuelta funciona, y es lo que este ciclo hizo. Pero
si se documenta como el procedimiento estándar, ORC-010-A queda convertido en un registro
*a posteriori* de una aprobación en lenguaje natural, en vez del mecanismo que la solicita. El
gate seguiría existiendo y pasando sus propias validaciones —ligado, de un solo uso, con
challenge— mientras pierde la propiedad que lo justifica: que el usuario vea el plan exacto
*antes* de que exista permiso para ejecutarlo.

### 3. Resolver el hueco 2 con un rollback de `launch_used_at`

Es la opción B de esa sección y parece la más conservadora porque no reordena nada. Introduce
una primitiva que **desmarca una autorización ya consumida**. El invariante de un solo uso hoy
es binario y auditable (`launch_used_at` está o no está); una función de rollback lo vuelve
condicional, y cualquier ruta futura que la alcance es un bypass de replay. Reordenar dos
sentencias —opción A— consigue el mismo beneficio sin tocar el invariante.

### 4. Crear un INDEX vacío para silenciar el error del hueco 3

Es el falso verde exacto que el check existe para impedir: un `build.index_ref` que apunta a un
archivo sin slices. `parseIndex()` lo rechazaría con `INDEX has no planned slices`
(`sofka-asdd-run-reconciliation-lib.mjs:57`), así que además no funcionaría — pero la tentación
de forzarlo hasta que el validador calle es real, y el resultado sería un puntero que miente
sobre la existencia de un backlog.

### 5. Relajar `indexRequirement()` sin nombrar la categoría que falta

Bajar la condición de `:16` pone el validador en verde para todos los runs, incluidos los de
feature abiertos incorrectamente en `design` sin haber pasado por Analyze. El INDEX gobierna
slices y dependencias: dejar de exigirlo donde sí aplica cambia un error visible y molesto por
un hueco silencioso en el gate que gobierna el trabajo más caro del ciclo.

### 6. Tratar estos cuatro huecos como defectos de seguridad

No lo son, y clasificarlos así distorsiona su prioridad en ambos sentidos. Ninguno permite
ejecutar una operación no autorizada; los tres gates fallan cerrado y el clasificador del hueco 4
sobre-dispara en lugar de dejar pasar. Etiquetarlos de seguridad los haría competir con hallazgos
que sí exponen superficie, y —peor— invitaría a "arreglarlos" endureciendo aún más el gate, que es
justo lo contrario de lo que necesitan: los cuatro se cierran haciendo el control **más preciso**,
no más estricto.

### 7. Cerrar cualquiera de los cuatro sin registrar la decisión

Los cuatro modifican el contrato de gobernanza: cuánto vive un permiso, qué cuesta un rechazo de
formato, qué categorías de trabajo el modelo reconoce y cómo se infiere la intención del usuario.
Por CORE-005 cada una es una decisión arquitectónica. Aplicar el parche sin ADR reproduce el patrón
de la sección anterior: código cambiado, documentación que sigue describiendo el mecanismo viejo.

### 8. Arreglar el hueco 4 borrando tokens del vocabulario

La tentación inmediata es quitar `feature` de `NEW_FEATURE` y `etl|elt` de la rama de datos, porque
son los candidatos con más superficie. Eso silencia **este** incidente y deja el mecanismo intacto:
el problema no es el conjunto de palabras, es que **se clasifica intención por presencia de palabras
sobre un texto que incluye evidencia pegada**. Con el vocabulario recortado, el siguiente log que
mencione `pipeline`, `spec`, `adr`, `cloud` o `compliance` reproduce el mismo turno, y además se
habrán perdido detecciones legítimas. Si se recorta vocabulario, que sea **después** de decidir qué
texto se clasifica (opción A) o qué cuenta como señal de intención (opción B), no en lugar de eso.

### 9. Dar por bueno el falso positivo hacia FULL porque "es conservador"

Es el argumento que mantiene abierto el hueco 4 y no resiste el detalle: forzar plan y challenge
para una consulta de lectura le impone a ese turno el reloj de 900 s del hueco 1, enruta a un agente
que va a devolver `fuera_de_dominio`, y **gasta la credibilidad de la inyección**. El costo no lo
paga el turno en que el hook se equivoca: lo paga el turno en que el hook tiene razón y el operador
ya aprendió a saltear el bloque. Un guard que grita seguido se desatiende, y ahí sí se pierde el
caso real.

---

## Cuadro de cierre

| # | Hueco | Severidad | ¿Bloquea o fricciona? | ¿Defecto de seguridad? | Owner propuesto | Prioridad |
|---|---|---|---|:-:|---|:-:|
| 1 | Autorización hereda el `expires_at` del challenge | major | **Bloquea** — aborta lanzamientos en curso | No | Template | **1** |
| 2 | Rechazo por formato consume la autorización de un solo uso | major | **Bloquea** — obliga a reemitir el challenge | No | Template | **1** |
| 3 | Sin categoría de run de mantenimiento; `run-bootstrap` abre en fases que la reconciliación invalida | major | **Fricciona con residuo** — `error` permanente en el validador; residuo cerrado el 2026-08-04, modelo sin cambiar | No | Template + ADR (`sofka-asdd-solution-architect`) | **2** |
| 4 | El clasificador de routing decide profundidad y dominio por coincidencia léxica sobre el prompt completo, evidencia pegada incluida | major | **Fricciona y erosiona la señal** — ceremonia FULL para una lectura, agentes del dominio equivocado, inyecciones que se aprenden a ignorar | No — sobre-dispara, no deja pasar | Template + ADR (`sofka-asdd-solution-architect`) | **2** |

**Los cuatro son de ergonomía y completitud del modelo de gobernanza, no de seguridad.** Ningún
gate falla abierto, ninguno amplía scope, ninguno deja pasar una operación no autorizada. Lo que
cobran es fricción al operador legítimo (1 y 2), una categoría ausente en el modelo de datos (3) y
una decisión de routing incorrecta con apariencia de certeza (4).

**Y los cuatro se manifestaron solo al operar el framework de forma intensiva.** Ese es el patrón
que vale registrar, más que los huecos individuales:

- El hueco 1 requiere que un humano **se tome su tiempo** para aprobar y que los agentes tarden
  minutos en ejecutar. Con un lote trivial aprobado al instante, el defecto es invisible.
  **Actualización 2026-08-04:** dejó de ser invisible del todo — abortó la redacción de este
  documento con el workaround ya en uso, con ventana efectiva medida de ≈ 12,8 min y ≈ 2,4 min de
  ciclo de recuperación. El defecto no necesita deliberación humana para morder: basta un lote de
  un agente opus con `max_turns: 30`.
- El hueco 2 requiere **equivocarse en el formato del prompt** y reintentar. Un orquestador que
  nunca falla el marcador no lo encuentra nunca. **Actualización 2026-08-04:** ya se había
  encontrado — el harness `test-subagent-budget-routing.mjs:85-89` reemite la autorización antes de
  cada assert de formato, o sea que el comportamiento se conocía y se compensó en código de test.
- El hueco 3 requiere abrir un run para un trabajo que **el ciclo de features no contempla**.
  Todo run de feature bien formado pasa por Analyze y nunca toca el borde.
- El hueco 4 requiere que el usuario **pegue evidencia en el chat** para preguntar por ella. Con
  prompts cortos y escritos a mano el clasificador acierta, y sus nueve casos de prueba
  (`test-proportional-router.mjs:4-14`) son exactamente eso. El defecto aparece cuando el chat se usa
  como lo usa un mantenedor de plataforma: pegando salidas de sus propias herramientas, que contienen
  el vocabulario de su propio framework.

Ninguno de los cuatro tiene un test que **afirme el comportamiento deseado** —porque los cuatro son
sobre lo que el sistema le cuesta a su operador, no sobre lo que el sistema computa. Dos matices
importan:

- El hueco 2 sí tiene un test que **lo codifica**, reemitiendo la autorización para poder seguir; un
  test que convive con el defecto en lugar de fallar por él.
- El hueco 4 es el único **parcialmente** detectable por revisión de código —la regex está a la
  vista— y precisamente por eso muestra el límite de esa revisión: leer un patrón no dice **qué texto
  se le va a alimentar**. La prueba es que el mantenedor ya encontró una instancia de esta clase
  (`sofka-asdd-proportional-router-lib.mjs:14-16`, contaminación desde criterios de aceptación) y la
  cerró para ese caso concreto, no para el mecanismo.

Es el argumento operativo para que el mantenedor **use el framework en trabajo real,
periódicamente**, como parte del mantenimiento: es la única prueba que encuentra esta clase de
hueco. El hueco 4 agrega un corolario más incómodo: **hay que usarlo como se usa de verdad**, con
logs pegados y preguntas de seguimiento, no solo con prompts limpios de una sola frase.

---

## Nota de alcance final

### Qué se hizo en este documento

- Se verificó **en código, línea por línea**, el mecanismo de los cuatro huecos: herencia de
  `expires_at` (`sofka-asdd-plan-authorization-lib.mjs:221`), consumo previo a la validación de
  formato (`:299-306`), la asimetría entre `indexRequirement()`
  (`sofka-asdd-run-reconciliation-lib.mjs:12-21`) y `run-bootstrap.mjs:78-98,149-150`, y la
  clasificación léxica del router (`sofka-asdd-proportional-router-lib.mjs:6,29,37,44,52-53,73-78,85-90`)
  junto con las dos inyecciones del hook (`sofka-asdd-user-prompt-submit.mjs:52,68-84,86-102,104-125,226-236`).
- Se corrigieron todos los números de línea aproximados del encargo contra los archivos reales y
  se usaron los exactos.
- Se obtuvo **evidencia empírica** de la herencia del TTL en el store vivo de autorizaciones, con
  la firma de milisegundos como prueba directa.
- Se encontró **corroboración independiente** del hueco 2 en
  `test-subagent-budget-routing.mjs:81-90`, cuyo patrón de reemisión codifica el comportamiento.
  **Ampliado el 2026-08-04:** los tres asserts de fallo (`:86`, `:88`, `:90`) exigen cada uno un
  `clean(); issueChallenge(); approveActiveChallenge()` previo (`:85`, `:87`, `:89`), y cubren los
  tres chequeos de formato de `assertBudgetedLaunch`. El harness **convive** con el defecto en vez
  de fallar por él; la clasificación del hueco 2 subió de *fricción* a **defecto conocido con
  workaround en el propio harness**.
- Se obtuvo **evidencia empírica del daño** del hueco 1, ausente en la primera versión: el lote que
  produjo este documento se abortó con `authorization-expired` a mitad de la segunda edición, con
  ventana efectiva de ≈ 12 min 48 s para un lote `opus`/`max_turns: 30` y ≈ 2 min 23 s de ciclo de
  recuperación. La autorización de reemisión (`760c5daf…`, `issued_at 13:27:44.610Z` /
  `expires_at 13:42:44.442Z`) **reconfirma la herencia del TTL de forma independiente** por la misma
  firma de milisegundos, y su presencia como única entrada del store confirma que `writeAtomic`
  destruye la evidencia de los lotes previos.
- Se **redujo el alcance** de la hipótesis del hueco 1: el vencimiento como fenómeno queda medido y
  fechado; solo la cifra del incidente anterior (dos abortos, uno por 24 s) sigue marcada como no
  verificable. Las hipótesis de los huecos 2 y de la sección de causa raíz **se mantienen**: la
  secuencia `launch-budget-mismatch` → `authorization-replay` sigue no siendo reconstruible desde el
  store, y el barrido exhaustivo de referencias colgantes de `59975b2` sigue sin hacerse.
- Se verificó contra `.sofka-asdd/asdd-run.schema.json` que **no existe** ningún campo de tipo de
  run, confirmando la afirmación del encargo.
- Se registró la causa raíz compartida con el fallo baselineado de `test-orc-tier-c-hooks.mjs`.
- **Agregado el 2026-08-04 — hueco 4.** Se documentó la clasificación incorrecta de una consulta de
  lectura como `depth=FULL; domain=data; reason=new_feature; confidence=0.95`, con cuatro
  verificaciones en código: (a) el vocabulario de `detectDomain():29` **descarta** `index` y `estado`
  como causas, y la intersección con `DATA_DOMAIN_RE` del hook acota el token a seis candidatos;
  (b) `reason=new_feature` proviene de la alternativa **`feature` suelta** de `NEW_FEATURE:6`, en la
  primera rama de la cadena, por delante de la declaración explícita de read-only; (c) **los patrones
  se evalúan sobre el prompt completo**, con `unwrapPromptDocument:17-22` como única lógica
  consciente de cercas y en sentido inverso, de modo que la oración del pedido por sí sola habría dado
  `LIGHT/general/0.55` sin ninguna inyección; (d) `confidence` es un **literal por rama** (`:53`) y
  `risk`/`requires_confirmation` se derivan de `depth` (`:86`, `:89`), no de evidencia medida.
- Se encontró **corroboración independiente** del hueco 4 en el propio router
  (`sofka-asdd-proportional-router-lib.mjs:14-16` y `test-proportional-router.mjs:27-39`): la clase de
  defecto ya se había encontrado y se cerró con un allowlist de un encabezado, no con una regla
  general. Se verificó también que existen tests negativos para el vocabulario de software
  (`test-orc-enforcement-hooks.mjs:28`) pero **ninguno** para el de datos ni para `feature`.
- Se documentó que el orquestador **desvió** las dos inyecciones del hook, con su justificación y sus
  contraargumentos, y se identificó que el único escape hatch existente
  (`SOFKA_ASDD_DELEGATION_INJECT_DISABLE=1`, `sofka-asdd-user-prompt-submit.mjs:25,138-140`) es
  **todo-o-nada y silencioso**, lo que deja al desvío ad hoc como la única alternativa a obedecer.
- Se registró la **evidencia de paridad cross-OS** que cierra el ciclo, separando lo verificado en
  Windows de lo reportado por el usuario en WSL Fedora, e incluyendo la brecha de rendimiento
  (hasta ~23× en `test-git-guards-cwd`) como propiedad de plataforma y no como defecto.
- Se actualizó el **estado del hueco 3**: el residuo del validador se cierra con la restauración del
  run parkeado ejecutada el 2026-08-04, y se explicitó que la categoría ausente en el modelo sigue
  abierta y pendiente de ADR.
- Se evaluaron opciones con trade-offs por hueco, incluida la dimensión de seguridad de cada una y —en
  el hueco 4— el costo explícito del falso **negativo** en la dirección opuesta, **sin decidir** por
  el mantenedor.

### Qué NO se hizo

- **No se corrigió ningún hueco.** No se tocó `sofka-asdd-plan-authorization-lib.mjs`,
  `sofka-asdd-subagent-budget-lib.mjs`, `sofka-asdd-run-reconciliation-lib.mjs`,
  `sofka-asdd-run-bootstrap.mjs`, `asdd-run.schema.json`, `sofka-asdd-plan-gate.mjs`,
  `sofka-asdd-user-prompt-submit.mjs` ni `sofka-asdd-proportional-router-lib.mjs`. Tampoco se tocó
  `.asdd-run.json` ni `sofka-asdd-test-baseline.json`, que estaban fuera del alcance autorizado.
- **No se reejecutó el clasificador con el prompt exacto del incidente del hueco 4.** El texto pegado
  no se conserva en ningún artefacto del repositorio, así que la identificación del token concreto
  queda como hipótesis; el mecanismo, en cambio, está verificado en código.
- **No se verificaron desde este host los números de Linux** de la sección de paridad: se ejecutó
  `npm run validate` en Windows y los resultados de WSL Fedora se atribuyen al reporte del usuario.
- **No se ejecutó ningún comando git de escritura.**
- **No se reprodujeron los incidentes operativos** de los huecos 1 y 2: hacerlo exigiría emitir
  autorizaciones y provocar rechazos deliberados, fuera del alcance autorizado. Las mediciones
  concretas de esos incidentes quedan marcadas como hipótesis.
- **No se hizo un barrido exhaustivo** de referencias colgantes del commit `59975b2` más allá de
  los dos consumidores conocidos (ver hipótesis de esa sección).
- No se evaluó el impacto de ninguna de las opciones sobre el CLI de distribución ni sobre
  proyectos consumidores.

### Reglas aplicadas

ART-001 (nombre de artefacto run-trazable, ruta reservada por el orquestador) · ART-002 (ruta
exacta usada literalmente, sin recalcular `run_id`/`PHASE`/`SEQ`) · ART-003 (capability cargada
como primera operación) · ART-004 (afirmaciones no verificables marcadas como hipótesis, sin
convertir el relato de sesión en hecho; incluye el token que disparó `domain=data` y los números
reportados de Linux) · CORE-005 (deuda de ADR señalada en los huecos 3 y 4) ·
ORC-000-B (el desvío del orquestador frente a la inyección del hook queda declarado, no implícito) ·
GS-001 (rama no protegida verificada) · GS-003 (sin commit) ·
`sofka-asdd-spanish-orthography.md`.
