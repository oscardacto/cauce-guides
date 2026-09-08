# ADR-022 — GS-003 por intención explícita y vía rápida git operativa

Fecha: 2026-08-28 | Estado: Aceptada
Deciders: Maintainers ASDD
Relacionado con: ADR-015, ADR-018, ADR-020 (supersede parcialmente §4), ORC-010-F,
GS-001/GS-003, GS-008, GS-009, GS-010

## Contexto

Reporte de uso real: pedir «commiteá, pusheá y creá el MR» tardaba muchísimo o no
terminaba, **aun cuando el usuario lo ordenaba explícitamente**.

Medir primero descartó la hipótesis obvia: el dispatcher PreToolUse resuelve en
0,33–0,43 s por llamada. El costo no estaba en los hooks. Estaba en que la cadena
de enforcement obligaba a tres o cuatro turnos de usuario, arrancaba subagentes
opus que después descartaba, y en dos puntos se contradecía a sí misma hasta el
bloqueo duro.

La evidencia estaba en el propio repositorio. `.claude/.runtime/git-audit.jsonl`
registraba 5 `decision:"block"` y 6 usos de escape hatch, uno de ellos con el
detalle `SOFKA_ASDD_GUARD_PUSH_DISABLE=1 · evitó 0 bloqueo(s)`: el equipo ya
apagaba los guards a ciegas, antes de saber si iban a bloquear. Cuando el camino
correcto no funciona, el bypass deja de ser una excepción y pasa a ser el
procedimiento.

Los defectos, en orden de costo:

**1. GS-003 era insatisfacible en el turno en que el usuario lo ordena.**
`consumeCommitAuthorization` exige un `authorization.json` que solo nace de
`approveActiveCommitChallenge()`, que solo corre cuando `classifyApprovalIntent`
devuelve `approval` **y ya existe un challenge**. En el turno en que el usuario
ordena el commit no hay challenge todavía, y una orden imperativa nunca
clasifica como aprobación: «commiteá y pusheá y creá el MR» son seis tokens,
ninguno afirmativo, y supera el techo de elegibilidad de cuatro. Una orden
explícita costaba siempre un turno extra, por diseño.

**2. La vía rápida git bloqueaba los comandos git que decía habilitar.**
ADR-020 §4 decidió emitir el token con `scope: []` y `commands: []` porque «los
gates GS-003/008/009 gobiernan el comando». Pero `assertAuthorizedOperation`
(ADR-015) trata `commands[]` como allow-list cerrada: con el arreglo vacío, todo
`git commit`, `git push` y `glab mr create` del subagente moría en
`command-mismatch` **antes** de que GS-003 llegara a evaluarse. Y no había salida
por el camino normal, porque `issueChallenge` rechaza explícitamente cualquier
lote que declare `git commit` (GS-003). Deadlock cerrado, y el hook de
operaciones no tiene escape hatch. El commit solo funcionaba cuando **no** había
autorización activa —`no-active-authorization` se ignora—, es decir, cuando la
vía rápida fallaba. La optimización empeoraba el caso que venía a arreglar.

**3. El marcador GS-008 nunca se leía.** El skill `tech-lead-pre-push` escribe
`{ ts, head }` y el githook nativo lo parsea como JSON; el gate PreToolUse hacía
solo `parseInt`. Verificado contra el archivo real del repo: `parseInt` sobre ese
JSON devuelve `NaN`, el gate concluía «no existe .claude/.prepush-validated», y
correr el gate completo —build y tests, minutos— no habilitaba el push.

**4. Un token de uso único para un pedido de tres operaciones.** El token
direct-light se marcaba `used_at` en el primer consumo; el segundo lanzamiento
moría en `authorization-replay`, que el plan-gate convierte en `deny` duro, no en
`ask`.

## Decisión

### 1. GS-003 modo `intent`: la orden del usuario ES la autorización

Los modos `command` y `branch` comparten un supuesto: la intención de commitear
nace del agente y el humano la aprueba después. Cuando el humano **es** quien la
escribe, el supuesto se invierte y la ceremonia deja de proteger algo — no hay
una decisión ajena que validar, la decisión ya está en el turno.

`UserPromptSubmit` emite una autorización directa cuando se cumplen **todas**
estas condiciones: la ruta determinista resolvió `fast_lane: "git_ops"` (que ya
excluyó `DANGEROUS_GIT`), el prompt ordena commitear, el turno lo escribió el
usuario y no la máquina, y la rama no es protegida.

Lo que se conserva: decisión humana explícita, binding de rama, cupo, TTL de
900 s, y auditoría en `git-audit.jsonl` con `decision: "intent-preauth"`, rama,
`authorization_id` y hash del prompt. El agente sigue obligado a mostrar el
comando exacto y los archivos. **Lo único que se elimina es el turno de ida y
vuelta.**

Si la emisión falla por cualquier motivo, no se degrada a permitir: se cae al
challenge clásico.

### 2. La vía rápida reconoce sus propios comandos (supersede ADR-020 §4)

ADR-020 §4 descartó «dejar que la vía rápida autorice comandos git» para no
duplicar la política de GS-003/008/009 en un segundo lugar. La intención era
correcta; la implementación no podía cumplirla, porque `commands[]` no es una
declaración de intención sino una allow-list cerrada, y un arreglo vacío deniega.

La autorización lleva ahora un sello `fast_lane`, y `assertAuthorizedOperation`
reconoce bajo ese sello una lista cerrada de verbos git de escritura. **No se
duplica política**: la decisión sigue siendo de `guard-branch`, `pre-push-gate` y
`pre-pr-gate`, que corren en la misma pasada del dispatcher (ADR-018). Lo que se
elimina es el bloqueo por partida doble.

El sello no se puede declarar en un `--plan-json`: `normalizePlan` lo descartaría
igual, y el único llamador de `markAuthorizationFastLane` es la rama direct-light
del plan-gate, cuyo token nace del routing determinista del prompt del usuario.
El orquestador no puede auto-otorgárselo.

Quedan fuera del sello, siempre: force push, `--force-with-lease`,
`reset --hard`, `filter-branch`/`filter-repo`, `--no-verify`, borrado de ramas
remotas, `branch -D`, `checkout -- .` y `git restore`.

### 3. El cupo del token sale de las operaciones pedidas

El token de la vía git declara `max_uses` según las familias de operación
presentes en el prompt (commit, push, MR), con tope 3, y se libera recién al
agotarse. El TTL sube de 300 s a 900 s: antes de tocar un comando, la regla
obliga a leer completa la referencia de git-safety, y el token vencía en medio de
esa lectura obligatoria.

**No se tocó el presupuesto de subagentes.** Se verificó empíricamente que
`LIGHT.max_agents = 1` no es obstáculo: cada lanzamiento sintetiza su propio lote
de un agente. El defecto era el token, no el techo — y el caso queda fijado en
`test-gs003-intent-and-git-fastlane.mjs` para que nadie «arregle» el presupuesto
creyendo que era eso.

### 4. Las dos capas leen el mismo marcador y las mismas extensiones

El gate PreToolUse parsea `{ ts, head }` con fallback al formato legado, y valida
el `head` contra el commit que se pushea, igual que el githook nativo. Las
extensiones de código fuente se leen de `.sofka-asdd/source-exts.json`, fuente
única para ambas capas. El fast-track config-only se evalúa contra el upstream o,
si no existe, contra la rama de integración — nunca contra `HEAD~1`.

## Hallazgos colaterales

### El store de autorizaciones fallaba de forma intermitente en Windows

La primera versión del sello escribía `authorizations.json` por separado, justo
después de la escritura que consume el lanzamiento. Con eso,
`test-runtime-efficiency-consumer-e2e` empezó a fallar en dos de cada tres
corridas completas —siempre verde en aislamiento— con `EPERM` en el `renameSync`.

La causa no era el segundo write en sí: en Windows, `renameSync` sobre un destino
existente devuelve `EPERM`/`EBUSY` transitorio cuando otro proceso todavía tiene
el archivo abierto (antivirus o indexador, típicamente, justo después de una
escritura previa). El segundo write solo hacía esa ventana mucho más probable.

Se corrigieron las dos cosas: el sello viaja ahora en la MISMA escritura que
consume el lanzamiento, y `writeAtomic` reintenta el rename con backoff acotado
ante códigos transitorios. Sin el reintento, el error crudo se filtraba a los
guards, que lo reportaban como si fuera una denegación de autorización — un fallo
de infraestructura disfrazado de decisión de seguridad. Tres corridas completas
consecutivas quedan limpias.

### `git branch -D` pasaba como lectura para los subagentes

Escribir las pruebas de la vía rápida destapó un agujero **preexistente e
independiente**: `SAFE_GIT_READ_RE` en `plan-authorization-lib` aceptaba
cualquier `git branch` como lectura, así que **cualquier subagente bajo cualquier
lote** podía ejecutar `git branch -D <rama>` sin declararlo — justo lo que GS-010
prohíbe sin autorización explícita. El guard del orquestador ya distinguía
consulta de mutación para el hilo principal; la capa que cubre a los subagentes,
no.

## Convergencia con el refactor de control-plane

Al integrar `dev`, dos de las correcciones de este trabajo resultaron ya
resueltas —y mejor— por el refactor «clasificar por plano en vez de por
sintaxis» (`5113932`), que unificó el motor de comandos en
`.claude/hooks/_lib/sofka-asdd-command-plane.mjs`. Se descartaron las propias:

- **El agujero de `git branch`**: su `isReadOnlySegment` ya distingue consulta de
  mutación en la capa compartida, y además rechaza el nombre suelto que CREA la
  rama, caso que la corrección de este trabajo no contemplaba.
- **F5, el challenge de commit desde el orquestador**: dejó de ser una función en
  el guard y pasó a ser una entrada del manifiesto `CONTROL_PLANE`
  (`commit-authorization.mjs → issue`, callers `ORCH`). El resultado es más
  estricto que lo propuesto acá: `approve`, `status`, `--help` e
  `issue-worktree` se **deniegan** en vez de pedir confirmación, y el encadenado
  se evalúa por segmento, así que una lectura pura encadenada pasa y cualquier
  cosa peligrosa no.

La cobertura de F5 en `test-gs003-intent-and-git-fastlane.mjs` se reescribió
para fijar ese contrato del manifiesto en vez de probar código propio: lo que le
importa al flujo git es que el paso obligatorio de GS-003 no cueste un prompt,
venga de donde venga la implementación.

## Alternativas descartadas

**Escape hatch documentado para la orden explícita.** Es lo que el equipo ya hace
de hecho, y el audit log muestra por qué no sirve: `SOFKA_ASDD_GUARD_BRANCH_DISABLE=1`
apaga GS-001 además de GS-003, y se termina usando por reflejo, incluso cuando no
había ningún bloqueo que evitar. Un hatch usado a ciegas no es una excepción
auditable: es enforcement apagado.

**Quitar GS-003 en ramas no protegidas.** Más rápido y más simple, pero pierde la
trazabilidad por commit que la regla promete. El modo `intent` conserva el
registro y el binding; solo cambia de dónde viene la decisión.

**Una skill compuesta `git-delivery` que haga commit → push → MR en un agente.**
Colapsaría tres arranques de opus en uno y sería más barato. Se descartó para
esta iteración porque cambia la superficie de capacidades del tech-lead y su
manifiesto, mientras que el cupo del token arregla el bloqueo sin tocar nada de
eso. Sigue siendo una optimización válida a futuro, sobre una base que ya
funciona.

**Subir `LIGHT.max_agents`.** Habría sido arreglar el síntoma equivocado: la
medición mostró que el techo nunca se alcanzaba.

## Consecuencias

**Positivas**
- Una orden git explícita se ejecuta en el turno en que se da.
- La vía rápida deja de denegar los comandos que existe para habilitar.
- Validar el pre-push vuelve a habilitar el push, sin escape hatch.
- Las dos capas de enforcement dejan de discrepar sobre el mismo push.
- `git branch -D` deja de pasar como lectura para los subagentes.

**Negativas / riesgos aceptados**
- El modo `intent` afloja GS-003 en su caso más común. Mitigación: condiciones
  acumulativas y verificables, binding de rama, cupo, TTL, auditoría, y el
  comando siempre a la vista. La barrera real contra evasión deliberada sigue
  siendo server-side (protected branches, ADR-007) y no se toca.
- El sello `fast_lane` amplía lo que un subagente puede ejecutar bajo la vía
  rápida. Mitigación: lista cerrada de verbos, flags destructivos excluidos,
  sello inalcanzable desde el CLI, y los tres guards git corriendo igual.
- Corregir el marcador puede empezar a bloquear pushes que hoy «pasan». Es el
  comportamiento correcto: hoy pasan porque se usa el escape hatch. Conviene
  anunciarlo al equipo junto con el release.

## Verificación

- `.claude/scripts/test-gs003-intent-and-git-fastlane.mjs` — modo `intent`
  (binding, cupo, TTL, rama ajena, comando ajeno), el deadlock con y sin sello,
  los comandos que siguen denegados, el cupo del token, los tres lanzamientos por
  el plan-gate real, y la gramática del challenge en el guard del orquestador.
- `.claude/scripts/test-gs008-marker-format.mjs` — los cinco caminos del marcador
  y el fast-track sobre un repo git temporal, para no depender del estado de
  trabajo de quien corra la suite.
- Suites existentes de plan-authorization, plan-gate, commit-authorization,
  direct-light, orchestrator-guard, orc-enforcement, git-guards, githooks,
  pretool-dispatcher, subagent-budget y proportional-router: sin fallos nuevos.
