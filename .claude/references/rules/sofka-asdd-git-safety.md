# Git Safety — Reglas críticas

Reglas de seguridad git **siempre activas, sin excepciones**. Aplican a todo
agente o sesión que ejecute comandos git en este proyecto. El cumplimiento de
GS-001 se refuerza mecánicamente con el hook `sofka-asdd-guard-branch.mjs`
(PreToolUse sobre Bash, bloqueante con `exit 2`).

## GS-001: Ramas protegidas

**NUNCA hacer commit directamente en una rama protegida.** Crear primero una
feature branch. Las ramas protegidas por defecto son `main`, `master`, `qa`,
`dev` y `develop` — **configurables por proyecto** vía la variable de entorno
`SOFKA_ASDD_PROTECTED_BRANCHES` (lista separada por comas, definible en el
bloque `env` de `.claude/settings.json` para que cada equipo la ajuste a los
estándares de su cliente).

Escape hatch auditable: `SOFKA_ASDD_GUARD_BRANCH_DISABLE=1` desactiva el hook
para la sesión. Su uso queda registrado en el output del hook — usarlo solo
para operaciones de release autorizadas explícitamente por el maintainer. El
escape hatch también puede pasarse **inline** como prefijo del propio comando
(`SOFKA_ASDD_GUARD_BRANCH_DISABLE=1 git commit ...`) — el hook lo detecta
parseando el string del comando, no solo `process.env`, porque el prefijo
inline nunca llega al proceso Node que ejecuta el hook (ver "Resolución de
repo efectivo" abajo).

### Resolución de repo efectivo (repos anidados, R3 v2.28.0)

Los 3 guards de git (`guard-branch.mjs`, `pre-push-gate.mjs`, `pre-pr-gate.mjs`)
resuelven el **repo efectivo** del comando bajo prueba antes de evaluar rama,
diff o el marcador GS-008 — no asumen que `git` opera siempre sobre
`CLAUDE_PROJECT_DIR`. La resolución vive en el helper compartido
`.claude/hooks/_lib/git-command-cwd.mjs` (`resolveEffectiveCwd`) y sigue esta
prioridad:

1. `git -C X` en el comando (mayor prioridad).
2. `cd X &&` / `cd X;` en el comando (soporta encadenados).
3. `input.cwd` del payload PreToolUse.
4. Fallback: `CLAUDE_PROJECT_DIR` / `process.cwd()`.

**Mitigación fail-closed obligatoria (ante parseo ambiguo)**: si el comando
tiene múltiples `cd`/`-C` encadenados o una ruta con variable de shell sin
resolver (`$VAR`, `${VAR}`), la resolución es **ambigua** — el helper devuelve
todos los candidatos posibles (repo raíz + mejor estimación) y el guard evalúa
**TODOS**, bloqueando si **cualquiera** está en rama protegida. Nunca se
degrada a fail-open ante ambigüedad — precedente: el revert de Smart-Data
(`bcdab3f`) mostró que lazy-loadear enforcement sin lector explícito rompe
garantías de seguridad.

**Ubicación del marcador GS-008 (decisión B3)**: el marcador
`.claude/.prepush-validated` vive SIEMPRE en `CLAUDE_PROJECT_DIR/.claude/`
— nunca en el repo efectivo resuelto — porque un sub-repo anidado puede no
tener su propio directorio `.claude/`, mientras que el repo de configuración
raíz siempre existe. La rama y el `git diff` (para el fast-track config-only
de GS-008) sí se evalúan sobre el repo efectivo. El skill
`sofka-asdd-tech-lead-pre-push` escribe el marcador en esa misma ubicación
estable para mantener la coherencia entre skill y hook.

Ver `docs/tech/2026-07-07-001-BUILD-006-bug-b-git-guards-nested-repos.md`
para el reporte completo del bug y su resolución (B1-B7).

### Fix R3b — bypass multi-git corregido (auditoría adversarial)

Una auditoría adversarial posterior a R3 confirmó con exploits reales que el
algoritmo B1-B7 tenía un **bypass explotable**: usaba un regex GLOBAL para
capturar *cualquier* `git -C X` en TODO el comando compuesto, sin correlacionar
ese `-C` con la invocación `git` que el guard realmente valida (commit / push
/ mr create). Si el comando contenía **otra** invocación `git` no relacionada
con un `-C` propio (ej. `cd nested && git commit && git -C other push`), el
helper devolvía un candidato único pero **incorrecto** (`other` en vez de
`nested`), saltándose el fail-closed — el commit corría en la rama protegida
sin que el guard lo detectara.

**Fix**: `resolveEffectiveCwd` acepta ahora un 3er parámetro `targetRe` (la
regex de la acción real que el guard valida — `GIT_COMMIT_RE`, `GIT_PUSH_RE`,
`MR_CREATE_RE`). El comando se segmenta por `&&`/`;` (respetando comillas) y
solo se resuelve el CWD del segmento que matchea `targetRe`, siguiendo el
encadenado de `cd` previo y el `-C` propio de ESE segmento — nunca el `-C`/`cd`
de otras invocaciones `git` no relacionadas. Los 3 guards pasan su propio
`targetRe` en la llamada. Sin este parámetro se preserva el algoritmo legado
(retrocompatibilidad de callers existentes). Ver
`.claude/hooks/_lib/git-command-cwd.mjs` y los tests `R3b.*` en
`.claude/scripts/test-git-guards-cwd.mjs`.

**Riesgo residual documentado (aceptado)**: un `cd`/`-C` con **variable de
shell sin resolver** (`$VAR`, `${VAR}`) no puede validarse en parse-time — el
valor real solo se conoce en tiempo de ejecución del shell. El guard evalúa
los candidatos resolubles (repo raíz + best-effort) de forma fail-closed, pero
**no puede garantizar** cuál será el destino real en runtime. Este riesgo
residual es aceptado conscientemente: la alternativa (bloquear siempre ante
cualquier variable de shell) rompería workflows legítimos con paths dinámicos
frecuentes en scripts de CI/CD.

### Fix R3c — bypass vía newline y subshell (auditoría adversarial post-R3b)

Una auditoría adversarial posterior a R3b confirmó con exploits reales que el
algoritmo por segmentos de R3b tenía un **bypass explotable**: `splitTopLevelSegments`
solo cortaba por `&&` y `;`. Dos construcciones de shell lo evadían sin que el
guard las detectara:

1. **Salto de línea** (`cd nested\ngit commit`): bash ejecuta cada línea de
   un comando multi-línea secuencialmente igual que si estuviera separada por
   `;`, pero el parser no veía el `cd` al no haber `&&`/`;` explícito —
   resolvía el CWD equivocado (la base, no `nested`).
2. **Subshell** (`(cd nested && git commit)`): bash aplica el `cd` dentro del
   subshell y el `git commit` corre allí también, pero el parser tampoco
   entendía `()` — mismo resultado: repo equivocado evaluado.

Ambos permitían que el commit/push/MR corriera efectivamente en un repo
protegido sin que el guard lo bloqueara.

**Principio de diseño de R3c**: no se puede parsear shell arbitrario con
certeza total — perseguir cada separador nuevo uno por uno reabre el hueco con
la siguiente construcción no soportada. El guard combina dos caminos:

- **Camino preciso** (comandos simples y seguros de parsear): `\n`/`\r\n` se
  suman como separador de nivel superior equivalente a `;` en
  `splitTopLevelSegments`, preservando el algoritmo R3b para el resto
  (`&&`, `;`, `cd X` / `git -C X` con paths literales).
- **Camino fail-closed** (para TODO lo demás): si el comando contiene
  cualquiera de estas construcciones — subshell `(...)`, brace group
  `{ ...; }`, command substitution `$(...)`, backticks `` `...` ``, `eval`,
  o pipe `|` — el helper **no intenta correlacionar el CWD exacto** del
  segmento objetivo. En cambio recolecta TODOS los candidatos de `cd`/`-C`
  que pueda extraer de todo el comando (scan global, sin garantía de
  orden/anidamiento) más el repo base, marca `unsafe: true` y `ambiguous: true`,
  y el guard evalúa TODOS bloqueando si CUALQUIERA está en rama protegida. Si
  el scan global no encuentra NINGÚN `cd`/`-C` (ej. `eval` que oculta el
  destino real sin dejar rastro textual, o un pipe con git sin cd visible) →
  `forceBlock: true`: el guard bloquea **siempre**, sin importar si el repo
  base está o no en rama protegida — no hay forma de confiar en que el
  comando corre ahí.

Las construcciones se detectan enmascarando el contenido de comillas antes de
evaluar los patrones: comillas simples siempre se enmascaran (inertes en
bash); comillas dobles se enmascaran solo para los checks de subshell/brace
group/eval/pipe (dentro de comillas dobles esos caracteres son texto literal,
ej. un mensaje de commit `"fix (bug)"`), pero se mantienen intactas para los
checks de `$(...)` y backtick (siguen "vivos" dentro de comillas dobles en
bash real).

**Trade-off explícito y aceptado**: este camino puede sobre-bloquear comandos
compuestos legítimos pero exóticos (ej. un subshell inofensivo sin relación
real con git). Es intencional — un guard de seguridad evadible es peor que uno
estricto. El workaround para el usuario es ejecutar la acción git de forma
simple y directa, sin composición compleja de shell. Ver
`.claude/hooks/_lib/git-command-cwd.mjs` y los tests `R3c.*` en
`.claude/scripts/test-git-guards-cwd.mjs`.

### Fix R3d — bypass por comillas y por `pushd` (3ª auditoría adversarial)

Una 3ª auditoría adversarial, posterior a R3c, confirmó con exploits reales
**2 bypasses adicionales** derivados de un principio de diseño incompleto:
los guards fallaban **abierto** (`if (!branch) process.exit(0)`) cada vez que
no podían determinar la rama del repo objetivo, en vez de tratar esa
imposibilidad como sospechosa.

1. **Comillas en el path** (`cd "nested"`, `cd 'nested'`,
   `git -C "nested"`): el helper capturaba el argumento CON las comillas
   literales incluidas, resolviendo a un path inexistente
   (`base + '/"nested"'`). `currentBranch()` fallaba con ENOENT y devolvía
   `null`, y los 3 guards permitían el commit/push/MR sin ningún log —
   bypass silencioso con la sintaxis MÁS común para referirse a un path.
2. **`pushd nested`**: no estaba reconocido como relocalización de cwd (solo
   `cd` lo estaba, ni en el algoritmo por segmentos ni en el scan global de
   candidatos), así que el guard resolvía sobre `base` con confianza alta —
   bypass.

**Fix — tres cambios en `.claude/hooks/_lib/git-command-cwd.mjs`:**

- **Strip de comillas**: toda captura de argumento de `cd`/`-C`/`pushd`
  (en el algoritmo por segmentos, en el algoritmo legado y en el scan global
  de candidatos fail-closed) pasa por `stripQuotes()`, que quita comillas
  simples o dobles envolventes cuando AMBOS extremos coinciden.
- **`pushd` reconocido como `cd`**: `pushd X` reubica el cwd exactamente
  igual que `cd X` a efectos de esta resolución — se trata como alias en
  todos los puntos de captura.
- **`popd` enruta por el camino fail-closed**: el destino de `popd` (tope de
  la pila de directorios empujada por `pushd` previos) no es determinable
  estáticamente sin rastrear toda la pila — se detecta como construcción no
  parseable (igual que subshell/eval/pipe) y fuerza bloqueo si no hay ningún
  `cd`/`-C`/`pushd` extraíble del resto del comando.

**Fix — principio fail-closed ante fallo de resolución de rama** (en los 3
guards, `sofka-asdd-guard-branch.mjs` y `sofka-asdd-pre-pr-gate.mjs`; el
`pre-push-gate` ya era fail-closed por diseño porque su fast-track depende de
`isConfigOnly()`, que retorna `false` — exige marcador — ante cualquier error
de resolución): cuando el guard no puede determinar la rama del repo objetivo
(`currentBranch()` retorna `null`), la resolución ahora distingue dos casos
usando el `base` (cwd original antes de cualquier `cd`/`-C`/`pushd`) que
`resolveEffectiveCwd()` expone en su retorno:

- **`resolved === base`** (el comando no relocalizó el cwd — mono-repo
  simple sin `cd`/`-C`): si tampoco resuelve rama, es porque el directorio
  base simplemente no es un repo git real — nada que proteger, se permite
  (comportamiento histórico, sin regresión).
- **`resolved !== base`** (el comando SÍ relocalizó el cwd hacia un destino
  específico y ese destino no resuelve a ninguna rama git): situación
  sospechosa — el destino puede ser un path malformado (comillas sin
  limpiar en una versión anterior, un typo, un directorio inexistente).
  **Bloqueo obligatorio (`exit 2`)**, nunca `exit 0` por no poder resolver.

**Verificación empírica**: los vectores `cd "nested"`, `cd 'nested'`,
`git -C "nested"`, `pushd nested`, `popd` (sin `cd`/`-C` extraíble) y un `cd`
hacia un directorio inexistente bloquean (`exit 2`) cuando el destino está
protegido o no resuelve; los casos legítimos equivalentes con comillas
(`cd "feature"` hacia una rama real no protegida) y `pushd feature` (no
protegida) siguen permitiendo (`exit 0`) — sin regresión sobre F0/B1-B7/R3b/R3c.
Ver los tests `R3d.*` en `.claude/scripts/test-git-guards-cwd.mjs`.

**Riesgo residual**: el strip de comillas solo cubre comillas balanceadas
simples (`"X"` o `'X'` en ambos extremos del token capturado por `\S+`);
paths con espacios internos entre comillas (`cd "mi carpeta"`) no son
capturables por el regex basado en `\S+` y caen en el comportamiento
existente para tokens con espacios (no matchean `CD_SEGMENT_RE`, tratados
como ausencia de `cd` en ese segmento). Este límite ya existía antes de R3d
y no se agrava con este fix.

### Reencuadre de threat model — safety-net, no barrera (ADR-007)

Tras 4 auditorías adversariales consecutivas (R3→R3d), cada una encontrando
una clase de bypass nueva, el ADR-007 «git guards threat model» (en el repositorio del template ASDD)
concluye — con evidencia empírica — que **parsear shell arbitrario de forma
estática para determinar el repo efectivo de git no tiene fondo**. Esto
exige aclarar honestamente para qué sirven estos 3 guards:

- **Los guards son un safety-net contra el error accidental común**
  (`cd sub && git commit`, un dev que olvida en qué rama está, un agente que
  se equivoca de sub-repo) — **no una barrera contra evasión deliberada**.
  Ya existe un escape hatch documentado y auditable
  (`SOFKA_ASDD_GUARD_{BRANCH,PUSH,PR}_DISABLE=1`): quien quiere evadir el
  guard a propósito solo necesita setear esa variable, no construir un
  `--git-dir` exótico. Perseguir cada bypass exótico del parser (R3b→R3d)
  cerraba puertas laterales de una casa cuya puerta principal ya está
  abierta por diseño.
- **La barrera real contra evasión deliberada que llega al remoto es
  server-side**: GitLab/GitHub **protected branches** rechazan pushes
  directos a `dev`/`qa`/`main` en el servidor, inevadible por
  `--no-verify` ni por variables de entorno locales (ningún hook local,
  ni siquiera un git hook nativo, puede serlo — corre en la máquina del
  usuario). Todo proyecto que adopte este template **debe** configurar
  protected branches en su remoto como la capa que efectivamente cumple
  el rol de barrera; los guards locales complementan esa capa dando
  feedback instantáneo antes del push, no la reemplazan.
- **Residuales conocidos y aceptados by-design** (no se cierran con más
  parseo estático — congelados tras R3d, ver ADR-007 §5 condición 2):
  `git --git-dir=X --work-tree=Y ...` (redefine el repo sin tocar el cwd),
  variables de shell sin resolver en `cd`/`-C` (`$VAR`, `${VAR}`), symlinks,
  y las variables de entorno `GIT_DIR`/`GIT_WORK_TREE`. Ninguno de estos
  vectores ocurre por accidente — requieren intención deliberada de evadir,
  fuera del alcance de un safety-net.
- **Follow-up opcional futuro (no comprometido)**: la Opción D del ADR-007
  propone agregar git hooks **nativos** por repo (`core.hooksPath` +
  instalador que recorra repos anidados) como backstop en runtime — cierra
  los residuales estructuralmente porque corren post-resolución de cwd, sin
  parseo de string. Requiere aprobación explícita de Andrés (decisiones
  abiertas OD-1 a OD-5 del ADR) antes de iniciar esa fase.

### Capa nativa — Fase 2 del ADR-007 (implementada)

La conclusión del ADR-007 fue que parsear shell estáticamente para determinar el
repo efectivo **no tiene fondo**, y su Opción D proponía git hooks nativos por
repo como backstop en runtime. Eso ya está en el template:

| Hook | Reglas que enforza | Por qué acá y no en PreToolUse |
|---|---|---|
| `pre-commit` | GS-001, ART-001 | ve la rama real y el índice real; ART-001 se aplica solo a archivos **nuevos**, como dice la norma, algo que la capa PreToolUse no puede distinguir porque solo ve una llamada a `Write` |
| `commit-msg` | GS-005, CORE-009 | es el único punto donde el mensaje existe: un heredoc o un `-F archivo` se le escapaban al parseo del comando |
| `pre-merge-commit` | GS-001 en merges | el guard de rama solo intercepta `git commit` |
| `pre-rebase` | GS-007 | `rebase` no tenía ningún enforcement mecánico |
| `pre-push` | GS-002, GS-008, integridad de reglas | detecta reescritura de historia comparando ancestros, sin leer flags; ata el marcador GS-008 al commit; verifica los hashes de `rule-loading.json` antes de que el cambio salga del equipo |
| `reference-transaction` | GS-004, GS-010 | ve la creación y el borrado de refs. Avisa por defecto; bloquea con `SOFKA_ASDD_GITHOOKS_STRICT_REFS=1` |

Instalación: `node .claude/scripts/sofka-asdd-install-githooks.mjs` (con
`--recurse` para repos anidados, `--check` para ver estado, `--uninstall` para
revertir). Configura `core.hooksPath`; no toca `.git/hooks/`.

**Auditoría real.** Cada bloqueo, aviso y uso de escape hatch queda en
`.claude/.runtime/git-audit.jsonl` con regla, hook, rama, detalle y usuario. La
capa PreToolUse escribe en el mismo archivo. Antes el registro era una línea a
stderr: la regla prometía trazabilidad y no había forma de reconstruir quién
desactivó un guard ni qué operación pasó por ahí.

**Límite explícito.** `--no-verify` salta los hooks nativos. El guard
`dangerous-bash` bloquea ese flag en `git commit|push|merge`, pero un shell
fuera de Claude Code puede usarlo: la única capa inevadible sigue siendo
server-side (Opción E, abajo).

## GS-002: Historia inmutable

- **NUNCA `git push --force` ni `git push -f`.** La historia no se reescribe.
- **NUNCA `git reset --hard` ni `git checkout -- .`** sin autorización
  explícita del usuario.
- **NUNCA `git clean -f`** — investigar los archivos sin trackear antes de
  borrar cualquier cosa.

## GS-003: Commits requieren autorización

**NUNCA ejecutar `git commit` sin autorización explícita del usuario.** El
agente prepara los cambios, muestra el comando exacto y emite un challenge
ligado a rama+comando antes de esperar confirmación:

```bash
printf '%s' '{"command":"git commit -m \"feat(scope): mensaje\""}' | \
  node .claude/scripts/sofka-asdd-commit-authorization.mjs issue
```

El `ok` del usuario solo consume el challenge activo. El guard Bash exige una
autorización vigente y de uso único para el mismo comando; una aprobación de
lote ORC-010 no sirve para commits. La autorización aplica a ese ciclo de
cambio concreto y no se hereda a tareas posteriores.

### Modo `branch` — commits de cierre en worktree (ORC-011)

ORC-011-B obliga al developer que corre con `isolation: worktree` a cerrar con
un commit: sin commit el worktree se destruye y los cambios se pierden. Pero el
orquestador no puede emitir un challenge por comando exacto, porque el mensaje
lo redacta el developer recién al terminar. Ese choque dejaba una sola salida
mecánica —el escape hatch— es decir, el diseño empujaba al bypass.

Antes de lanzar developers en worktree, el orquestador emite un challenge de
lote ligado a las **ramas**, no al comando:

```bash
printf '%s' '{"branches":["wt/refund-abc123","wt/audit-def456"],"max_uses":1}' | \
  node .claude/scripts/sofka-asdd-commit-authorization.mjs issue-worktree
```

El `ok` del usuario lo aprueba igual que cualquier challenge. Cada rama consume
su propio cupo (`max_uses`, tope 10), la autorización sigue viva mientras queden
cierres pendientes y se cierra al agotarse todas. El TTL mantiene el tope duro
de 900 s. Lo que **no** cambia: sigue habiendo aprobación humana explícita, sigue
siendo de uso acotado, y un comando que no sea `git commit` nunca pasa.

### Modo `intent` — la orden explícita del usuario ES la autorización

Los otros dos modos comparten un supuesto: la intención de commitear nace del
agente y el humano la aprueba después. Cuando el humano es quien la escribe
—«commiteá y pusheá»— el supuesto se invierte y la ceremonia deja de proteger
algo. En ese turno todavía no existe ningún challenge que aprobar, y el
clasificador de intención nunca marca una orden imperativa como aprobación
(«commiteá y pusheá y creá el MR» son seis tokens, ninguno afirmativo). El
efecto era estructural: **toda orden explícita del usuario costaba un turno
extra**, y el diseño empujaba al escape hatch — el propio `git-audit.jsonl`
registra usos de `SOFKA_ASDD_GUARD_BRANCH_DISABLE=1` sin un bloqueo que los
justifique.

El hook `UserPromptSubmit` emite la autorización cuando se cumplen **todas**
estas condiciones:

- la ruta determinista resolvió la vía rápida git (`fast_lane: "git_ops"`), que
  ya excluye `DANGEROUS_GIT`: force push, `reset --hard`, rebase, squash y
  reescritura de historia;
- el prompt **ordena commitear**, no solo menciona git;
- el turno lo escribió el usuario, no la máquina (`isAutomatedTurn`);
- la rama actual no es protegida — ahí manda GS-001 y no hay nada que autorizar.

Lo que **no** cambia: sigue habiendo una decisión humana explícita (la orden),
la autorización sigue ligada a la rama, sigue teniendo cupo y TTL, y su emisión
queda registrada en `.claude/.runtime/git-audit.jsonl` con
`decision: "intent-preauth"`, la rama, el `authorization_id` y el hash del
prompt que la originó. El agente **sigue obligado a mostrar el comando exacto y
los archivos incluidos** antes de ejecutarlo: se elimina la espera, no la
transparencia.

Si la pre-autorización no se puede emitir por cualquier motivo, **no** se degrada
a permitir: se cae al challenge clásico.

El modo por comando exacto sigue siendo el default y el más estricto: se usa
para todo commit que no sea un cierre de worktree ni una orden git explícita del
usuario en ese turno.

## GS-004: Naming de ramas (GitFlow)

Prefijos válidos: `feature/`, `fix/`, `hotfix/`, `chore/`, `refactor/`,
`test/`, `docs/` + descripción en kebab-case. Máximo 60 caracteres.

```
feature/3515-git-safety        ✓
fix/login-token-expiry         ✓
mi-rama-de-pruebas             ✗ (sin prefijo)
```

## GS-005: Conventional commits

Todo commit usa prefijo convencional: `feat:`, `fix:`, `refactor:`, `test:`,
`docs:`, `chore:`. Scope opcional entre paréntesis: `feat(auth): ...`.

## GS-006: Una rama por ciclo de cambio

TODO el trabajo de un mismo ciclo de cambio (feature, HU, spec) que toque el
mismo repo va en **UNA sola rama**. Hallazgos tardíos del mismo ciclo se
commitean en la MISMA rama. Un solo push al final, un solo PR/MR para
revisión.

- Antes de crear una rama nueva → verificar si ya existe una rama del ciclo
  en curso y reutilizarla (`git branch --show-current`).
- Si el ciclo afecta varios repos → 1 rama por repo, pero nunca varias ramas
  por repo en el mismo ciclo.
- Razón: el reviewer revisa UN PR/MR coherente, no fragmentos sueltos.

## GS-007: Sincronización con la rama base — merge, NUNCA rebase

Cuando una feature branch necesita los últimos cambios de su rama base:

- Obligatorio: `git fetch origin {base} && git merge --no-ff origin/{base}`
  (desde la feature branch).
- PROHIBIDO: `git rebase origin/{base}`, `git rebase {base}`,
  `git pull --rebase`.
- Razón: el rebase re-aplica N commits sobre la base; si hay conflictos en
  cada commit es fácil descartar accidentalmente código de cualquiera de los
  lados. Este anti-patrón ya causó pérdida de código de compañeros (ver
  memoria `git-rebase-perdida-codigo`). El merge resuelve conflictos en UN
  solo punto, preserva la historia completa y es auditable sin pérdida.
- Conflictos en merge → resolverlos manualmente revisando ambos lados. NUNCA
  `-X ours`/`-X theirs` ni `git checkout --ours/--theirs` automáticos.
- Excepción: si el usuario pide rebase explícitamente, confirmar advirtiendo
  el riesgo antes de ejecutar.

## GS-008: Gate pre-push con marcador y TTL

Antes de `git push` con cambios de código fuente, debe existir el marcador
`.claude/.prepush-validated` no vencido (TTL default: 10 min). El hook
`sofka-asdd-pre-push-gate.mjs` lo verifica y lo **consume** al usarlo (no se
reutiliza entre pushes).

**Formato del marcador**: JSON `{ ts, head }` — `ts` es el timestamp Unix de la
validación y `head` el commit validado. Las **dos** capas lo leen igual: el gate
PreToolUse y el githook nativo `pre-push`. Un marcador legado (timestamp suelto)
se sigue aceptando, pero no puede atarse a un commit, así que habilitaría el push
de un commit posterior que nadie validó.

> Esta paridad de formato no es un detalle. Mientras el gate PreToolUse hizo solo
> `parseInt`, sobre el JSON vigente devolvía NaN y concluía «no existe
> .claude/.prepush-validated»: correr el gate completo —build y tests, minutos—
> no habilitaba el push, y la única salida mecánica era el escape hatch. Si las
> dos capas leen formatos distintos, el marcador no significa nada.

**Fast-track**: si TODOS los archivos del diff son configuración o documentación,
el push se permite sin marcador. El diff se toma contra el upstream si existe y,
si no —rama nueva, el caso normal antes del primer push—, contra la rama de
integración (`SOFKA_ASDD_BASE_BRANCH`, si no `dev` → `develop` → `main` →
`master`). Nunca contra `HEAD~1`: eso decidiría mirando solo el último commit y
dejaría pasar una rama cuyo código está en commits anteriores. Si el diff no se
puede determinar, se exige marcador (fail-closed).

**Qué cuenta como código fuente**: la lista vive en `.sofka-asdd/source-exts.json`
y la leen las dos capas. Es fuente única a propósito — con listas separadas
discrepaban sobre si un mismo push necesitaba marcador.

**Crear el marcador** (tras validar manualmente o con un skill de validación):
```
node -e "const fs=require('fs'),{execFileSync}=require('child_process');fs.writeFileSync('.claude/.prepush-validated',JSON.stringify({ts:Math.floor(Date.now()/1000),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}))"
```

Escape hatch auditable: `SOFKA_ASDD_GUARD_PUSH_DISABLE=1`.
TTL configurable: `SOFKA_ASDD_PUSH_GATE_TTL` (segundos).
Extensiones de código fuente configurables: `SOFKA_ASDD_SOURCE_EXTS` (CSV,
override del manifiesto).

> **Repos anidados**: la rama y el diff (fast-track config-only) se evalúan
> sobre el repo EFECTIVO del comando `git push`, pero el marcador
> `.claude/.prepush-validated` siempre se busca/escribe en
> `CLAUDE_PROJECT_DIR/.claude/`. Ver "Resolución de repo efectivo" en GS-001.

## GS-009: Gate pre-PR/MR bloqueante

Antes de `glab mr create` o `gh pr create`, el hook `sofka-asdd-pre-pr-gate.mjs`
valida con `exit 2` (bloqueante real — corrige el gap de Humana que era cosmético):

1. La rama fuente **no es una rama protegida** (GS-001).
2. El nombre de la rama **cumple el prefijo GitFlow** (GS-004).
3. La rama tiene **al menos un commit** que no está en la rama base.

Escape hatch auditable: `SOFKA_ASDD_GUARD_PR_DISABLE=1`.
Prefijos GitFlow configurables: `SOFKA_ASDD_GITFLOW_PREFIXES` (CSV).

> **Repos anidados**: la rama fuente, la rama base y los commits ahead se
> evalúan sobre el repo EFECTIVO del comando `gh pr create`/`glab mr create`.
> Ante parseo ambiguo, el guard evalúa TODOS los candidatos y bloquea si
> cualquiera está en rama protegida (fail-closed). Ver "Resolución de repo
> efectivo" en GS-001.

**Cadena recomendada**: gate pre-push (GS-008) → gate pre-PR (GS-009) →
skill `sofka-asdd-tech-lead-create-mr` genera el MR con el template Sofka.

## GS-010: Cleanup post-integración

Tras confirmar que el PR/MR fue mergeado en el remoto, limpiar la feature
branch local siguiendo el Paso 6 del skill `sofka-asdd-tech-lead-gitflow`.

Secuencia mínima obligatoria:

1. `git checkout {base}` + `git pull --ff-only origin {base}` — sincronizar la base.
2. Verificar que la rama está mergeada: `git branch -r --merged origin/{base} | grep {feature}`.
   Si NO aparece → **STOP**, no borrar, reportar al usuario.
3. `git branch -d {feature}` — borrado safe (rechaza ramas con commits no mergeados).

**NUNCA** usar `git branch -D` sin autorización explícita del usuario. La rama
remota se borra según la política del equipo o la configuración del remoto —
no automáticamente.

Para worktrees creados por `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend`, el cleanup equivalente lo
gestiona `ORC-011-E` (`sofka-asdd-orchestration-worktree.md`). GS-010 cubre el
flujo de feature branch estándar (PR/MR normal).
