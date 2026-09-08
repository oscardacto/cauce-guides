# ADR-007 — Git guards de repos anidados: reencuadre de threat model y re-enfoque de enforcement

> **Hogar canónico: `docs/adoption/`.** `docs/architecture/decisions/` no se distribuye a los proyectos consumidores (no aparece en `distribution[]` de `.asdd/cli-contract.json`). Este ADR es referenciado por `asdd-git-safety.md` (regla distribuida vía `.claude/rules/`), así que debe llegar al consumidor — igual que ADR-002/ADR-003/ADR-005, que por el mismo motivo también viven en `docs/adoption/`. Un ADR sin regla distribuida que lo cite (ej. ADR-001, ADR-004) puede quedarse en `docs/architecture/decisions/` sin romper trazabilidad para el consumidor.

- **Estado:** **Aceptada**
- **Fecha:** 2026-07-08
- **Deciders:** Andrés Jiménez (maintainer del template) — aprobación explícita al cerrar R3 (MR #225).
- **Autor:** asdd-solution-architect (skill guide-docs)
- **Rama de trabajo:** `fix/bug-b-git-guards-nested-repos-r3`
- **Relacionados:** BUG-B (`docs/tech/2026-07-07-001-BUILD-006-bug-b-git-guards-nested-repos.md`), `asdd-git-safety.md` (GS-001, GS-008, GS-009), ADR-005 (lección `bcdab3f`: no degradar enforcement a fail-open). Complementario — no sustituye a ninguno.
- **Convención de numeración:** ADR-001…ADR-005 existen en el árbol principal; ADR-006 está en vuelo en un worktree (`agent-a605e92078e015cbc`, integración capa BA/AF). Este es el siguiente secuencial libre → **ADR-007**.

---

## 1. Contexto y problema

### 1.1 El bug de campo (BUG-B)

Los 3 guards de git del template son hooks `PreToolUse:Bash`:

- `asdd-guard-branch.mjs` (GS-001) — bloquea `git commit` en rama protegida.
- `asdd-pre-push-gate.mjs` (GS-008) — exige marcador de validación antes de `git push`.
- `asdd-pre-pr-gate.mjs` (GS-009) — valida rama fuente/base antes de `gh pr create` / `glab mr create`.

Los tres reciben el **string del comando** (`tool_input.command`) y deben adivinar **en qué repositorio correrá git** para evaluar rama / diff / marcador en el repo correcto. En proyectos con **repos anidados** (config-repo raíz + `projects/{iac,db,drive-sync}/` como sub-repos independientes, cada uno en su propia rama), la suposición histórica "git corre siempre sobre `CLAUDE_PROJECT_DIR`" se rompe: el guard leía la rama del repo raíz (`develop`, protegida) y bloqueaba **el 100% de los commits legítimos** en los sub-repos. La única salida era desactivar los guards por sesión — se perdía la salvaguarda entera por un bug de parseo.

### 1.2 Por qué el parseo estático fracasó — 4 clases de bypass

El fix se intentó en 4 iteraciones sobre `.claude/hooks/_lib/git-command-cwd.mjs`. **Cada auditoría adversarial encontró una clase de bypass nueva:**

| Iteración | Vector encontrado | Causa raíz |
|---|---|---|
| **R3** | Un regex `-C` **global** capturaba el `-C` de **otra** invocación git no relacionada (`cd nested && git commit && git -C other push`) → resolvía el repo equivocado. | Correlación incorrecta entre el `-C` y la invocación que el guard realmente valida. |
| **R3b** | Solo `&&`/`;` como separadores de segmento → bypass por **newline** (`cd nested\ngit commit`) y **subshell** (`(cd nested && git commit)`). | El parser no entendía todos los separadores de nivel superior de bash. |
| **R3c** | Se agregaron newline, subshell, brace-group, command-substitution, backtick, eval, pipe → fail-closed para construcciones no parseables. Seguía habiendo huecos. | Perseguir separadores uno por uno reabre el hueco con la siguiente construcción no soportada. |
| **R3d** | Fail-closed ante fallo de resolución + strip de comillas + `pushd`/`popd`. La 4ª auditoría encontró **`git --git-dir=X --work-tree=Y commit`**: apunta git a **otro repo sin cambiar el cwd** — el helper consume esos flags como prefijo pero nunca los usa para relocalizar el repo. Confirmado empíricamente con un commit real en rama protegida. |  El repo efectivo de git **no** se define solo por el cwd: `--git-dir`/`--work-tree`, `GIT_DIR`/`GIT_WORK_TREE` (env), symlinks y `$VAR` sin resolver lo redefinen en runtime. |

**Conclusión probada empíricamente: parsear shell arbitrario de forma estática para determinar el repo efectivo de git NO tiene fondo.** Cada fix revela el siguiente vector. La razón es estructural, no de implementación:

1. **El repo efectivo de git es una función del entorno de ejecución en runtime** (cwd tras `cd`/`pushd`/`popd`, flags `--git-dir`/`--work-tree`, variables `GIT_DIR`/`GIT_WORK_TREE`, symlinks, alias de git). Un parser estático del string nunca tiene esa información completa.
2. **Restricción dura del modelo de hooks:** el payload `PreToolUse:Bash` expone `input.cwd` = el cwd de la **sesión ANTES** del comando. Un `cd X &&` inline **no** se refleja ahí. El hook corre en un proceso Node distinto del shell que ejecutará el comando; el prefijo inline (`VAR=1 comando`, `cd X &&`) se aplica al shell del comando bajo prueba, **nunca** al proceso del hook. Por diseño, el hook no puede conocer el cwd post-`cd` sin re-parsear el string — y ese parseo es incompleto por (1).
3. **El costo acumulado es real:** el helper pasó de ~40 líneas conceptuales a **~490 líneas** de heurísticas de parseo de shell (enmascarado de comillas, detección de 7 construcciones "unsafe", scan laxo global, `forceBlock`, best-effort de candidatos). Alta superficie de mantenimiento, y el "fail-closed ante construcción no parseable" **sobre-bloquea** comandos compuestos legítimos pero exóticos. Y **sigue** siendo evadible (R3d).

---

## 2. Reencuadre del threat model (el corazón de la decisión)

Antes de elegir enfoque hay que responder honestamente **para qué sirven estos guards**. Hay dos threat models posibles:

| Threat model | Actor | ¿Qué exige? |
|---|---|---|
| **Safety-net** (red de seguridad) | Un agente o dev que **sin querer** commitea/pushea en rama protegida (no se dio cuenta de en qué rama estaba, hizo `cd` a un sub-repo por error). | Atrapar el caso **común y accidental**. Un residual explotable solo con construcciones deliberadas es aceptable. |
| **Barrera** (contra evasión deliberada) | Un humano que **activamente quiere** saltarse el guard. | Ser inevadible. Cero bypass. |

**Análisis honesto:**

- Ya existe un **escape hatch documentado y auditable**: `ASDD_GUARD_{BRANCH,PUSH,PR}_DISABLE=1`. Cualquiera que quiera evadir deliberadamente **solo setea la variable** — no necesita `--git-dir` ni subshells. Por lo tanto, **contra evasión deliberada estos hooks nunca fueron la herramienta correcta**, y perseguir cada bypass exótico (R3b→R3d) fue esfuerzo mal dirigido: cerraba puertas laterales de una casa cuya puerta principal está abierta por diseño.
- Los bypass que las auditorías encontraron (`git --git-dir=X`, `(cd X && …)`, `eval`, pipes, `cd $VAR`) **no ocurren por accidente**. Nadie escribe `git --git-dir=X --work-tree=Y commit` sin querer. Un commit accidental en rama protegida se ve como `git commit -m "..."` o `cd sub && git commit` — exactamente el caso que el parser **común** ya resuelve bien.
- La **barrera real** contra evasión deliberada que llega al remoto **no es un hook local** — es **branch protection server-side** (GitLab/GitHub protected branches + reglas de MR) y el CI. Eso es inevadible por `--no-verify` o por variables de entorno locales, porque corre en el servidor. Un hook local, sea `PreToolUse` o git nativo, siempre es evadible localmente.

**Conclusión del reencuadre (decisión de diseño):** estos guards son un **safety-net**, no una barrera. El nivel de garantía razonable a exigirles es *"atrapar el error accidental común, fail-closed ante ambigüedad simple, y no pretender ser inevadible"*. La barrera contra evasión deliberada vive en **branch protection server-side**, fuera del alcance de este ADR pero que debe recomendarse al consumidor como capa complementaria.

Este reencuadre es lo que hace viable y **honesta** la Opción C, y lo que quita presión a la carrera armamentista del parser.

---

## 3. Opciones de re-enfoque

### Opción A — Git hooks nativos por repo (`.git/hooks` / `core.hooksPath`)

Instalar `pre-commit` y `pre-push` nativos en cada repo. Corren **en runtime, en el cwd ya resuelto por el shell** — sin parseo del string.

- **Cobertura de repos anidados:** ✅ estructural. El hook corre en el repo donde git **realmente** opera (post-`cd`, respetando `--git-dir`/`--work-tree` porque git ya los aplicó). El bug de BUG-B **desaparece de raíz**, no se mitiga.
- **Complejidad del código:** ✅ trivial — `git symbolic-ref --short HEAD` en el cwd del hook, sin helper de 490 líneas. Se puede retirar casi todo `git-command-cwd.mjs`.
- **Instalación / distribución:** ❌ el punto débil. `.git/hooks/` **no se versiona** ni se comparte. Opciones: (a) `git config core.hooksPath .asdd/githooks` (directorio versionado) por repo; (b) un instalador que copie/symlinkee los hooks a `.git/hooks` de cada repo. En repos **anidados** hay que configurar **cada sub-repo** — el instalador del template debe recorrer el árbol y detectar cada `.git`. Fricción de adopción real.
- **Bypasseabilidad:** `git commit --no-verify` / `git push --no-verify` saltean los hooks nativos por completo → mismo gap que el escape hatch. **Aceptable** bajo el threat model safety-net.
- **Cobertura GS-009 (PR gate):** ❌ **no existe hook git nativo para `gh pr create`/`glab mr create`** — no son operaciones git. El PR gate **debe** quedar como hook de Claude Code o moverse a CI. Riesgo bajo: commit/push ya están gateados aguas arriba.
- **Efecto colateral:** los hooks nativos corren para **todo** uso de git (no solo Claude Code). Puede ser deseable (enforcement consistente para devs) o molesto (fricción fuera del flujo agéntico).
- **Encaje con el modelo de hooks del template:** medio — introduce un segundo mecanismo de enforcement (git nativo) que hoy el template no gestiona; requiere un paso de instalación nuevo.

### Opción B — Wrapper / shim de git (alias o script en PATH que intercepta git)

- **Cobertura de repos anidados:** parcial — un shim corre **antes** de que git resuelva `-C`/`--git-dir`, así que tendría que **re-implementar el parseo de argumentos de git** para saber el repo efectivo → **el mismo problema estructural** que el parseo estático, ahora en el hot path de cada llamada a git.
- **Bypasseabilidad:** alta (invocar `/usr/bin/git` directo salta el shim).
- **Invasividad / portabilidad:** ❌ severa — modifica PATH o el rc del shell, frágil entre bash/zsh/fish, se rompe en shells no interactivos y en CI, degrada performance de cada `git`.
- **Veredicto:** peor que A en todos los ejes. **Descartada.**

### Opción C — Best-effort estático + fail-closed endurecido (estado R3d actual), residuales documentados

Mantener lo construido como safety-net y **documentar** `--git-dir`/`--work-tree`, `$VAR` sin resolver, symlinks, `GIT_DIR`/`GIT_WORK_TREE` env, subshell/eval/pipe como **fuera-de-alcance-by-design**, dado que el escape hatch ya permite evasión deliberada.

- **Cobertura de repos anidados:** ✅ para el caso común (`cd sub && git commit`, `git -C sub commit`). ❌ para vectores exóticos (documentados como no-objetivo).
- **Complejidad / mantenimiento:** ❌ hereda el helper de ~490 líneas y el sobre-bloqueo de construcciones exóticas legítimas. Deuda técnica viva.
- **Bypasseabilidad:** exótica, aceptable bajo threat model safety-net.
- **Instalación:** ✅ cero cambios — ya está en el modelo de hooks del template.
- **Costo:** casi nulo (ya construido). **Honesto** si — y solo si — se acompaña del reencuadre de threat model en la doc y se **detiene** la carrera armamentista del parser.

### Opción D — Híbrido: best-effort estático (UX rápida) + git hooks nativos (backstop real)

- **Capa estática (Claude Code hook):** feedback **instantáneo** en la UX — bloquea antes de que el Bash tool corra, con mensaje accionable. Se **simplifica** al caso común (se revierten las gimnasias R3b/R3c/R3d) porque ya no carga el peso del enforcement.
- **Capa nativa (git hooks):** enforcement real en runtime, cierra el hueco de repos anidados estructuralmente.
- **Cobertura:** ✅ mejor de ambos mundos.
- **Complejidad:** media — dos mecanismos, pero cada uno **más simple** que el R3d actual (el estático adelgaza; el nativo es trivial).
- **Instalación:** hereda la fricción de A (instalar hooks nativos en cada repo, incluidos anidados).
- **Encaje:** el estático encaja perfecto (ya existe); el nativo agrega el paso de instalación de A.

### Opción E (complementaria, no excluyente) — Branch protection server-side + CI

No es un reemplazo de los hooks locales sino **la capa que realmente cumple el threat model "barrera"**. Protected branches en GitLab/GitHub + reglas de MR + un job de CI que rechace pushes directos a rama protegida. Inevadible por `--no-verify` o env vars locales. **Recomendada como capa complementaria** en la guía de adopción, independientemente de qué opción local se elija.

---

## 4. Recomendación

**Adoptar la Opción D (híbrido), en dos fases, con el reencuadre de threat model de la §2 como premisa explícita, y E como recomendación de adopción complementaria.**

Justificación por criterio:

- **Cobertura del bug de campo (criterio primario):** solo A y D lo resuelven **estructuralmente** (runtime cwd real). C solo lo mitiga para el caso común. Dado que BUG-B es un falso-positivo que bloquea el 100% de commits legítimos en la arquitectura donde el guard más se necesita, la resolución estructural importa.
- **Complejidad / mantenimiento:** D permite **adelgazar** el helper de 490 líneas (la capa nativa asume el enforcement; la estática vuelve a ser común-caso). Reduce deuda en lugar de acumularla.
- **Honestidad del contrato:** D + reencuadre deja de pretender que un hook local es una barrera. Cada capa hace lo que sabe hacer: estática = UX, nativa = enforcement local runtime, server-side = barrera real.
- **Riesgo de regresión (lección `bcdab3f` / ADR-005):** el fail-closed se preserva en la capa estática durante la transición; la capa nativa se agrega **antes** de simplificar la estática (nunca al revés) — sin ventana de fail-open.

**Trade-off que se acepta conscientemente:** D introduce la fricción de instalación de git hooks nativos en cada repo (incluidos anidados). Si esa fricción resulta inaceptable en el entorno del consumidor (ver decisión abierta OD-2), el fallback honesto es **quedarse en C** (safety-net común-caso, residuales documentados) — nunca volver a invertir en endurecer el parser estático.

### Sketch de implementación (Opción D)

**Fase 1 — Interim safety-net (inmediato, sin instalación nueva):**

1. Mergear R3d como safety-net (ver §5).
2. Editar `asdd-git-safety.md` (GS-001): agregar el reencuadre de threat model (safety-net, no barrera) y una lista explícita de **residuales fuera-de-alcance-by-design**: `--git-dir`/`--work-tree`, `GIT_DIR`/`GIT_WORK_TREE` env, `$VAR` sin resolver, symlinks, subshell/eval/pipe. Referenciar este ADR.
3. Agregar a la guía de adopción la recomendación de branch protection server-side (Opción E).

**Fase 2 — Backstop nativo (target):**

4. Crear `.asdd/githooks/pre-commit` y `.asdd/githooks/pre-push` (directorio **versionado**), lógica trivial: `git symbolic-ref --short HEAD` en cwd → si ∈ protegidas → `exit 1` con mensaje GS-001/GS-008. Sin parseo de string.
5. Instalador `.claude/scripts/asdd-install-githooks.mjs`: recorre el árbol desde `CLAUDE_PROJECT_DIR`, detecta cada `.git` (raíz + sub-repos anidados), setea `git config core.hooksPath` (relativo a cada repo) o copia los hooks. Idempotente. Documentar en la guía de adopción.
6. PR gate (GS-009): **permanece** como hook de Claude Code (no hay equivalente git nativo). Opcionalmente moverlo/duplicarlo a CI (Opción E).
7. Una vez probado en un consumidor real con repos anidados: **simplificar** la capa estática — revertir R3b/R3c/R3d (scan laxo, `forceBlock`, detección de construcciones unsafe, `pushd`/`popd`), dejando solo la resolución común-caso (B1: `cd X &&`, `git -C X`, `input.cwd`) con fail-closed ante ambigüedad simple. El helper baja de ~490 a ~120 líneas. Actualizar la red de tests `test-git-guards-cwd.mjs` retirando los casos R3b/c/d que ya no apliquen y agregando cobertura de los hooks nativos.

**Archivos afectados:** `.claude/rules/asdd-git-safety.md`, `.claude/hooks/_lib/git-command-cwd.mjs` (adelgaza en Fase 2), `.claude/hooks/asdd-{guard-branch,pre-push-gate,pre-pr-gate}.mjs` (simplifican consumo en Fase 2), nuevos `.asdd/githooks/*` + instalador, `.claude/scripts/test-git-guards-cwd.mjs`, guía de adopción.

---

## 5. Qué hacer con la rama held R3 (`fix/bug-b-git-guards-nested-repos-r3`)

**Recomendación: SALVAR como interim safety-net — mergear R3d, con dos condiciones no negociables.**

Razones:

- R3d **resuelve el falso-positivo de campo para el caso común** (`cd sub && git commit`, `git -C sub commit`), que es exactamente el patrón accidental que el safety-net debe atrapar. Descartarla dejaría al consumidor sin salvaguarda (o desactivándola por sesión) hasta que la Fase 2 esté lista.
- El código y su red de tests están construidos y probados. Descartar tira valor real.

**Condiciones para el merge (evitan re-caer en la carrera armamentista):**

1. **Reencuadre en la doc (Fase 1, pasos 2-3):** el merge **incluye** la actualización de GS-001 con el threat model safety-net y los residuales fuera-de-alcance-by-design. Sin esto, se estaría mergeando código que **pretende** ser barrera y no lo es — deshonesto y engañoso para el consumidor.
2. **Congelar la inversión en el parser estático:** ningún fix adicional sobre `git-command-cwd.mjs` para perseguir bypasses exóticos. Los residuales quedan documentados, no perseguidos. La próxima inversión va a la Fase 2 (nativo), no a un R3e.

**Qué se reusa vs. se descarta a futuro:**

- **Se reusa ahora:** todo R3d (helper + guards + tests) como capa estática interim.
- **Se descarta/adelgaza en Fase 2:** las gimnasias R3b/R3c/R3d (scan laxo global, `forceBlock`, `detectUnsafeConstruct`, `pushd`/`popd`, enmascarado de comillas) **una vez** los hooks nativos sean el enforcement real. Hasta entonces se mantienen (fail-closed durante la transición — lección `bcdab3f`).

Si Andrés decide **no** ir a Fase 2 (OD-2/OD-3), entonces R3d mergeado **es** la solución final (Opción C pura): safety-net común-caso con residuales documentados. En ese escenario también aplica la condición 2 (congelar el parser).

---

## 6. Decisiones abiertas para Andrés

| # | Decisión | Por qué requiere su criterio |
|---|---|---|
| **OD-1** | ¿Se acepta el threat model **safety-net** (atrapar el accidente común) en lugar de exigir **barrera** (inevadible)? | Es la premisa de todo el ADR. Un `PreToolUse` local + escape hatch documentado **no puede** ser barrera; la barrera real es server-side (OD-5). Si Andrés exige barrera local, hay que discutir que es técnicamente inalcanzable con el modelo de hooks actual. |
| **OD-2** | ¿Se acepta el **modelo de instalación de git hooks nativos** (Fase 2): `core.hooksPath` o copia, con un instalador que recorra repos anidados? ¿Enforcement también para git usado fuera de Claude Code? | Introduce un paso de setup nuevo y afecta a devs que usan git directo. Decisión de adopción/UX, no puramente técnica. |
| **OD-3** | ¿**Mergear R3d ahora** como interim safety-net (con reencuadre de doc), o **hold** de la rama hasta que la Fase 2 esté lista? | Trade-off entre cerrar el falso-positivo de campo ya vs. evitar mantener dos capas durante la transición. |
| **OD-4** | ¿**Simplificar** (revertir R3b/c/d) una vez existan hooks nativos, o **mantener ambas capas a full-strength**? | Menos código y menos sobre-bloqueo vs. defensa en profundidad redundante. |
| **OD-5** | ¿Se adopta **branch protection server-side + CI** (Opción E) como capa complementaria, y el PR gate (GS-009) se mueve/duplica a CI? | Es la única barrera real contra evasión deliberada que llega al remoto. Depende del acceso del consumidor a la config del remoto (GitLab/GitHub). |

---

## 7. Preguntas de capacidad de Claude Code — SIN VERIFICAR

> Estas afirmaciones **no fueron verificadas** en esta sesión. Se listan como ítems a confirmar con la documentación de Claude Code antes de comprometer la Fase 2. No se inventó comportamiento.

- **PV-1 (crítica para todo el ADR):** ¿Claude Code expone algún hook que dispare **después** de resolver el cwd, o que entregue el **cwd de ejecución real** de un comando Bash (post-`cd`)? *Presunción no verificada:* **no** — `PreToolUse:Bash` dispara antes de ejecutar con el `input.cwd` de la sesión; no hay un hook "post-resolución de cwd". Si existiera, cambiaría el análisis (haría innecesarios los hooks nativos). **Verificar.**
- **PV-2:** ¿El payload `PreToolUse:Bash` incluye algún campo — más allá de `input.cwd` — que refleje un `cd` inline dentro del comando? *Presunción:* no. **Verificar.**
- **PV-3:** ¿Existe un hook `PostToolUse:Bash` con semántica útil para **detectar** (no prevenir) que un commit aterrizó en rama protegida y advertir/revertir? *Presunción:* `PostToolUse` existe, pero revertir es destructivo y llega tarde. **Verificar semántica y viabilidad.**
- **PV-4:** ¿El flujo de instalación del template puede configurar `git config core.hooksPath` (o copiar hooks) de forma soportada y multi-OS, incluyendo sub-repos anidados, sin romper el guard `guard-branch` durante su propia ejecución? *Presunción:* sí vía script Node + `git config`, pero requiere probar en el entorno multi-repo del consumidor. **Verificar.**
- **PV-5:** ¿Los hooks nativos de git y los `PreToolUse` de Claude Code pueden coexistir sin doble-bloqueo confuso (dos mensajes de error para el mismo commit)? *Presunción:* sí, pero la UX de mensajes debe diseñarse (la capa estática avisa "revisá", la nativa es el corte duro). **Verificar en integración.**

---

## Resumen (recomendación principal)

Los git guards son un **safety-net contra errores accidentales**, no una barrera contra evasión deliberada — el escape hatch documentado ya lo demuestra, y parsear shell estáticamente para hallar el repo efectivo de git **no tiene fondo** (4 auditorías, 4 clases de bypass). Recomiendo **Opción D (híbrido)**: mergear R3d **ya** como safety-net interim (Fase 1) reencuadrando la doc con residuales fuera-de-alcance-by-design, y luego agregar **git hooks nativos por repo** (Fase 2) que resuelven los repos anidados en runtime sin parseo, para después **adelgazar** la capa estática. La barrera real contra evasión deliberada es **branch protection server-side + CI** (Opción E), que debe recomendarse al consumidor por separado. Decisiones que necesitan a Andrés: aceptar el threat model safety-net (OD-1), el modelo de instalación de hooks nativos (OD-2) y si mergear R3d ahora (OD-3).
