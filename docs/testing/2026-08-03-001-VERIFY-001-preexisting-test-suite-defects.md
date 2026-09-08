# Defectos preexistentes en suites de test — análisis y recomendación

**Tipo de documento**: Reporte de defectos preexistentes (fase Verificar)
**Run ID**: `2026-08-03-001` · feature `os-compatibility`
**Autor**: `sofka-asdd-tech-lead` (skill `sofka-asdd-tech-lead-new-bug`)
**Fecha**: 2026-08-03
**Rama de detección**: `fix/os-compatibility`
**Plataforma de ejecución**: Windows 11 Pro 10.0.26200 · Node.js · Git Bash
**Estado**: Abierto — ninguna suite fue modificada por este documento

## Nota de alcance

Se ejecutó un baseline completo de las 45 suites `.claude/scripts/test-*.mjs` en
Windows: **27 pasan, 18 fallan**. De esas 18, **16 fallan por portabilidad
Windows** (separador de ruta, CRLF, BOM, `/tmp`, sintaxis POSIX) y están siendo
corregidas en una remediación cross-OS en curso.

Este documento cubre las **3 suites restantes**, cuyas causas raíz son **ajenas a
la remediación de portabilidad**. Su propósito es triple:

1. Que nadie las confunda con fallos de portabilidad ni las incluya en ese lote.
2. Que no se "arreglen" bajando expectativas (ver sección *Cómo NO arreglarlas*).
3. Que queden con dueño, causa raíz evidenciada y solución evaluada.

> **Adición 2026-08-03 (hallazgo B de la remediación cross-OS).** Se agrega una
> tercera suite, `test-pretool-dispatcher-prototype.mjs`, cuya portabilidad ya
> fue corregida por la Fase 5b de esa remediación (antes moría con
> `SyntaxError: Bad escaped character in JSON` al parsear rutas Windows; hoy
> parsea y corre), pero que sigue en `exit 1` por una causa raíz distinta y
> preexistente, documentada en la sección 3. Ver también la nota de corrección
> dentro de esa sección: el diagnóstico inicial que motivó esta adición
> ("el spike solo adapta 2 de 12 guards") resultó **incompleto** — la evidencia
> verificada apunta a una causa distinta y más profunda.

> **Corrección relevante al alcance (hallazgo nuevo de este análisis).** La
> evidencia de entrada afirmaba que los 12 fallos de `test-git-guards-cwd.mjs`
> tenían una única causa (GS-003) y que todos eran independientes de plataforma.
> Se verificó que **11 son GS-003 e independientes de plataforma**, pero **1
> (`F0.9`) es un defecto de portabilidad Windows en código de producción** —
> `.claude/hooks/sofka-asdd-pre-push-gate.mjs`. Ese caso **pertenece al lote de
> portabilidad**, no a este documento, y se detalla en §2.4 para que sea
> reasignado.

## Resumen

| # | Suite | Resultado actual | Causa raíz (una línea) | Severidad | Prioridad | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | `.claude/scripts/test-orc-tier-c-hooks.mjs` | `0 PASS / 15 FAIL`, exit 1 | Apunta a 4 hooks que fueron **movidos** a `.claude/scripts/legacy-hooks/` y consolidados en `sofka-asdd-session-start-dispatcher.mjs` (commit `59975b2`, 2026-07-17) | MEDIUM | P1 | 3–4 h (reescritura) |
| 2 | `.claude/scripts/test-git-guards-cwd.mjs` | `53 pasaron, 12 fallaron`, exit 1 · **82 s** | 11 casos "commit permitido" nunca emiten la autorización GS-003, así que el guard bloquea antes de que la resolución de cwd se evalúe. (+1 caso `F0.9` de causa distinta → §2.4) | MEDIUM | P1 | 2–3 h |
| 3 | `.claude/scripts/test-pretool-dispatcher-prototype.mjs` | `9/11 fixtures FAIL`, exit 1 | El adaptador del spike (`loadLegacyGuard`) exige que cada hook legacy termine en `main();` incondicional; los 10 hooks que carga dinámicamente ya usan el patrón `if (process.argv[1] && …) main();` (necesario para que sus propios tests los importen sin ejecutar el proceso) → el spike lanza excepción no capturada en el primer hook cargado y el proceso crashea con exit 1 para casi todo evento bien formado | LOW | P3 | No aplica — spike congelado, ver recomendación §3.5 |

Las tres son `script_issue` en la taxonomía `DEF-001` (defecto en la suite o en
el artefacto de medición que envuelve, no en el producto de producción bajo
prueba), con la excepción de `F0.9`, que es `bug` de producción.

---

## 1. `test-orc-tier-c-hooks.mjs` — suite apuntando a hooks retirados del runtime

**Archivo**: `.claude/scripts/test-orc-tier-c-hooks.mjs` (298 líneas)
**Categoría preliminar**: `script_issue`
**Severidad**: MEDIUM · **Prioridad**: P1

### 1.1 Síntoma observable

Salida literal al ejecutar la suite:

```
=== Resultado Ola 2: 0 PASS / 15 FAIL ===
```

Exit code 1. Los 15 asserts (`T11`–`T25`, enumerados en el encabezado del
archivo, líneas 6–21) fallan sin excepción.

### 1.2 Causa raíz con evidencia

La suite resuelve el directorio de hooks en `test-orc-tier-c-hooks.mjs:32`:

```js
const hooksDir  = join(__dirname, "..", "hooks");
```

y construye cuatro rutas de hook a partir de él:

| Línea | Constante | Hook referenciado |
|---|---|---|
| `test-orc-tier-c-hooks.mjs:87` | `codesizeHook` | `sofka-asdd-codebase-size.mjs` |
| `test-orc-tier-c-hooks.mjs:142` | `modelHook` | `sofka-asdd-model-strategy.mjs` |
| `test-orc-tier-c-hooks.mjs:186` | `tddHook` | `sofka-asdd-tdd-state.mjs` |
| `test-orc-tier-c-hooks.mjs:227` | `stateHook` | `sofka-asdd-state-freshness.mjs` |

Los cuatro archivos **no existen** en `.claude/hooks/`, pero **sí existen** en
`.claude/scripts/legacy-hooks/`. Es decir: **fueron movidos, no eliminados**.
Contenido actual de `.claude/scripts/legacy-hooks/`:

```
sofka-asdd-codebase-size.mjs      (128 líneas)
sofka-asdd-model-strategy.mjs     ( 84 líneas)
sofka-asdd-session-start.mjs      ( 67 líneas)
sofka-asdd-state-freshness.mjs    ( 84 líneas)
sofka-asdd-tdd-state.mjs          (102 líneas)
```

> **Corrección de un análisis previo.** Si en algún reporte anterior se afirmó
> que estos hooks "no existen" o "fueron eliminados", es incorrecto: están
> archivados bajo `legacy-hooks/` con su contenido intacto (el commit los
> registra como renames puros, 0 líneas modificadas — ver §1.3).

**Mecanismo del fallo**: `runHook()` / `runHookInDir()`
(`test-orc-tier-c-hooks.mjs:47-65`) invocan `spawnSync("node", [hookFile])` sobre
una ruta inexistente. Node falla al resolver el módulo, `stdout` queda vacío y
los 15 asserts —que verifican contenido de `stdout`— fallan en bloque.

**Ninguno de los 4 hooks está registrado en el runtime.** Verificado: 0
coincidencias por nombre en `.claude/settings.json`. El único hook registrado en
`SessionStart` es el dispatcher consolidado (`.claude/settings.json:92-98`):

```json
"SessionStart": [
    {
        "hooks": [
            {
                "type": "command",
                "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/sofka-asdd-session-start-dispatcher.mjs"
            },
```

### 1.3 Fechado del movimiento — evidencia de intención

`git log --follow` sobre los archivos movidos y `--diff-filter=A` sobre el
dispatcher apuntan al **mismo commit**:

```
59975b2257b92ea08714e4cbb5c32f856a62e763
2026-07-17
perf(hooks): consolidate session start guards
Autor: Andrés Mauricio Jiménez Peñaranda <andres.jimenez@sofka.com.co>
```

`git show --stat 59975b2` (extracto):

```
 .../hooks/sofka-asdd-session-start-dispatcher.mjs  |  35 +++++
 .../legacy-hooks}/sofka-asdd-codebase-size.mjs     |   0
 .../legacy-hooks}/sofka-asdd-model-strategy.mjs    |   0
 .../legacy-hooks}/sofka-asdd-session-start.mjs     |   0
 .../legacy-hooks}/sofka-asdd-state-freshness.mjs   |   0
 .../legacy-hooks}/sofka-asdd-tdd-state.mjs         |   0
 .claude/scripts/test-session-start-hook.mjs        | 168 +--------------------
 .claude/settings.json                              |  20 +--
 13 files changed, 54 insertions(+), 188 deletions(-)
```

Lectura: **retiro deliberado por rendimiento** (5 procesos Node en SessionStart →
1 dispatcher). El commit actualizó `settings.json`, `ADR-001` y
`sofka-asdd-orchestration.md`, pero **no tocó `test-orc-tier-c-hooks.mjs`** — de
ahí que la suite quedara huérfana. Fue una mudanza a medias en el plano de tests,
no un retiro accidental del código.

### 1.4 Por qué es independiente de plataforma

El fallo es una ruta que no existe en ningún sistema operativo: los archivos
están en otro directorio del repo, no es un problema de separador (`join()` ya
normaliza), CRLF, BOM ni `/tmp`. La suite falla igual en Linux y macOS.

### 1.5 Impacto real — qué cobertura se perdió

Este es el punto decisivo, y la respuesta **no** es "ninguna".

El commit `59975b2` **reemplazó** los tests de comportamiento por un test
estático: `test-session-start-hook.mjs` pasó de ~168 líneas a 9
(`7 insertions(+), 161 deletions(-)`). La suite que hoy pasa (exit 0) es esta,
completa (`test-session-start-hook.mjs:8`):

```js
const checks=[['dispatcher exists',source.includes('Consolidated SessionStart dispatcher')],['reads Git once',source.includes('rev-parse')],['emits routing core',source.includes('TRIVIAL/LIGHT/MEDIUM/FULL')],['includes model state',source.includes('ORC-002-B')],['includes run freshness',source.includes('ORC-007')]];
```

Son **5 verificaciones de inclusión de strings sobre el código fuente**
(`readFileSync` en `test-session-start-hook.mjs:7`). **Nunca ejecuta el
dispatcher**: no hay `spawnSync`, no hay fixtures, no hay assertions sobre
`stdout`. Es un contrato estático, no una prueba de comportamiento.

Mapa de los 15 asserts contra el comportamiento vivo del dispatcher:

| Assert | Comportamiento | ¿Vive en el dispatcher? | Evidencia |
|---|---|---|---|
| `T11`,`T15`,`T18`,`T21` | Escape hatch → `stdout` vacío | **Semántica cambiada** | El dispatcher suprime solo *su sección* (`dispatcher:19,23,27,31`); el bloque de sesión sigue emitiéndose (`dispatcher:13-18`). El assert `stdout.trim()===""` ya no aplica sin desactivar también `SOFKA_ASDD_SESSION_START_DISABLE` |
| `T12`,`T13` | Lock override `maturity=large\|small` | **Sí** | `dispatcher:20-21` emite `codebase_size: ${maturity} (lock override)` |
| `T14` | **Auto-detección** emite `large\|small` | **NO — comportamiento ausente** | El dispatcher solo lee el override del lock (`dispatcher:20-21`). No hay detección 2-de-3 |
| `T16` | Sin lock → sin output | **Semántica cambiada** | Igual que los escape hatches: el core de sesión se emite siempre |
| `T17` | Tabla de fases con modelos | **Sí (formato distinto)** | `dispatcher:23-26` emite `## ORC-002-B — modelos: specify=…`; el assert espera el literal `"Model Strategy"` |
| `T19` | `strict_tdd=false` → sin output | **Semántica cambiada** | `dispatcher:27-30` no emite sección; el core sí |
| `T20` | `STRICT TDD MODE ACTIVO` **+ test runner** | **Parcial** | `dispatcher:29` emite `## ORC-009 — STRICT TDD MODE ACTIVO` pero **omite el comando del runner**. El legacy sí lo emitía (`legacy-hooks/sofka-asdd-tdd-state.mjs:81,85`: `Test runner: ${testCommand}`) |
| `T22`,`T23`,`T24`,`T25` | Freshness ORC-007 | **Sí** | `dispatcher:31-34` emite `## ORC-007 — run ${run_id}: ${status} / ${phase}` y omite cuando `status==="complete"` |

**Conclusión de cobertura**: 6 asserts (`T12`,`T13`,`T17`,`T22`–`T25`) cubren
comportamiento vivo y hoy **no tienen ninguna verificación de ejecución**;
5 asserts requieren re-especificación por el cambio de semántica de los escape
hatches; 2 asserts (`T14` y la mitad de `T20`) prueban comportamiento que **ya no
existe**.

Además hay dos deltas funcionales que la pérdida de estos tests dejó invisibles:

1. **Auto-detección de `codebase_size` no implementada en el dispatcher.**
   `ORC-001-D` sigue vigente y define la cadena de precedencia: override del lock
   → cache del run → detección 2-de-3
   (`.claude/references/rules/sofka-asdd-orchestration-routing.md:23-70`). El
   lock actual tiene `"maturity": null` (`.sofka-asdd/sofka-asdd.lock:88`) y
   conserva `detection_thresholds` (`.sofka-asdd/sofka-asdd.lock:71`), así que
   hoy el dispatcher **no emite nada** sobre `codebase_size`. El hook legacy sí
   implementaba el algoritmo (`legacy-hooks/sofka-asdd-codebase-size.mjs:44`
   `detectSize()`, emisión en `:110`).
2. **Deriva documental en ADR-001.** El commit actualizó el nombre del hook pero
   conservó la afirmación de que el dispatcher
   `"Computa: codebase_size, model_strategy, tdd_state, freshness"`
   (`docs/architecture/decisions/ADR-001-orc-enforcement-3-tiers.md`, sección del
   diagrama SessionStart). Para `codebase_size` eso ya no es exacto.

> **HIPÓTESIS — REQUIERE VALIDACIÓN**: que la eliminación de la auto-detección
> 2-de-3 haya sido una decisión consciente y no un descuido de la consolidación.
> A favor del descuido: el mensaje del commit es solo `perf(hooks)`, no menciona
> retirar la detección, y ADR-001 sigue afirmando que se computa. A favor de que
> sea aceptable: `ORC-001-D` asigna la resolución al **orquestador**, no
> necesariamente al hook — el hook era una ayuda de inyección de contexto.
> **Cómo cerrarlo**: confirmar con el autor del commit `59975b2` (Andrés Jiménez)
> si la detección debe reaparecer en el dispatcher o si el orquestador la asume.

### 1.6 Opciones de solución evaluadas

**(A) Reapuntar `hooksDir` a `legacy-hooks/`** (`test-orc-tier-c-hooks.mjs:32`).
Trade-off: es un cambio de una línea y la suite volvería a verde, pero pondría a
prueba **código archivado y no registrado en `settings.json`** — es decir, código
muerto que ningún flujo ejecuta. Verde sin valor de protección: un cambio que
rompiera el dispatcher real seguiría pasando inadvertido. Agravante: la
auto-detección del hook legacy depende de `find … | wc -l`
(`legacy-hooks/sofka-asdd-codebase-size.mjs:55-56,66`), sintaxis POSIX que
**tampoco funciona en Windows**, así que la opción reintroduciría fallos de
portabilidad en el lote que se está limpiando. **Descartada.**

**(B) Retirar la suite** (borrar el archivo). Trade-off: legítimo solo si
`test-session-start-hook.mjs` cubriera el comportamiento equivalente — y **no lo
cubre**: son 5 `source.includes` que nunca ejecutan el hook
(`test-session-start-hook.mjs:8`). Lo que se perdería exactamente: toda
verificación de ejecución sobre el override del lock (`T12`,`T13`), la tabla de
modelos (`T17`), los cuatro casos de freshness ORC-007 (`T22`–`T25`) y el
comportamiento de los cuatro escape hatches. Quedaría un dispatcher que gobierna
la inyección de contexto de **cada sesión** sin un solo test que lo corra.
**Descartada.**

**(C) Reescribir la suite contra el dispatcher.** Trade-off: es la opción más
costosa (3–4 h) pero la única que produce cobertura real de código vivo.
Asserts a portar, con su adaptación:

- `T12`,`T13` → directos, esperando el literal `(lock override)` (`dispatcher:21`).
- `T17` → adaptar el literal esperado a `ORC-002-B — modelos:` (`dispatcher:25`).
- `T19` → verificar **ausencia de la línea ORC-009**, no `stdout` vacío.
- `T20` → verificar `STRICT TDD MODE ACTIVO`; **no** aseverar el runner
  (`dispatcher:29` no lo emite) y abrir un ítem aparte si se decide restaurarlo.
- `T22`,`T23` → verificar ausencia de la línea `ORC-007`, no `stdout` vacío.
- `T24`,`T25` → directos, esperando `ORC-007 — run … : {status}` (`dispatcher:33`).
- `T11`,`T15`,`T18`,`T21` → reescribir como *supresión por sección*: activar el
  `*_DISABLE` correspondiente y verificar que desaparece **esa** línea mientras el
  core de sesión permanece.
- `T14` → **no portar** hasta resolver la hipótesis de §1.5. Si la detección debe
  volver, el assert se escribe contra la nueva implementación; si no, se elimina
  con nota en ADR-001.
- **Assert nuevo sugerido**: `SOFKA_ASDD_SESSION_START_DISABLE=1` + los otros
  cuatro `*_DISABLE` → `stdout` vacío (`dispatcher:35` solo escribe si
  `lines.length`).

Renombrar el archivo a algo como `test-session-start-dispatcher-behavior.mjs`
evita confusión con el contrato estático existente. *Propuesta a validar, no
decisión cerrada.*

### 1.7 Recomendación

**Opción (C) — reescribir contra el dispatcher.** Es la única que no produce un
falso verde: hay comportamiento vivo (override del lock, tabla de modelos,
freshness ORC-007, escape hatches) cuya única "cobertura" actual es un test que
no ejecuta el hook. (A) testearía código muerto y reintroduciría dependencias
POSIX; (B) consolidaría la pérdida de cobertura. Debe resolverse antes la
hipótesis de la auto-detección para decidir el destino de `T14`.

---

## 2. `test-git-guards-cwd.mjs` — casos "commit permitido" bloqueados por GS-003

**Archivo**: `.claude/scripts/test-git-guards-cwd.mjs` (1 201 líneas)
**Categoría preliminar**: `script_issue` (11 casos) · `bug` (1 caso — §2.4)
**Severidad**: MEDIUM · **Prioridad**: P1

### 2.1 Síntoma observable

```
--- Resultado: 53 pasaron, 12 fallaron ---
```

Exit code 1. Duración medida: **82 segundos** (ver §6). Fallo representativo,
literal:

```
FAIL F0.2 feature branch permite commit — exit 2, stderr: BLOQUEADO GS-003: este git commit no tiene autorización explícita vigente. Mostrá el comando exacto, emití el challenge con sofka-asdd-commit-authorization.mjs issue y esperá confirmación del usuario.
```

Los 12 casos que fallan, capturados de la corrida:

| Caso | Causa |
|---|---|
| `F0.2 feature branch permite commit` | GS-003 |
| `F0.9 fast-track config/docs permite push sin marcador` | **distinta — ver §2.4** |
| `B6.1 cd nested && git commit (raíz dev, nested feature) → permite` | GS-003 |
| `B6.2 git -C nested commit (raíz dev, nested feature) → permite` | GS-003 |
| `R3b.1b legítimo — ambos repos en feature (ninguno protegido) → permite` | GS-003 |
| `R3b.4 legítimo — cd nested && git commit (un solo git) → permite` | GS-003 |
| `R3c.11 legítimo simple: cd feature && git commit → permite` | GS-003 |
| `R3c.12 legítimo: cd feature && git commit && git -C otherfeature push → permite` | GS-003 |
| `R3c.13 legítimo: mono-repo en feature → permite` | GS-003 |
| `R3c.15 no sobre-bloquea: paréntesis/pipe dentro de comillas dobles → permite` | GS-003 |
| `R3d.6 legítimo: pushd feature && git commit (no protegida) → permite` | GS-003 |
| `R3d.10 legítimo: cd "feature" (comillas, feature real no protegida) → permite` | GS-003 |

`R3b.4` muestra solo `exit 2` sin `stderr` porque su assert imprime únicamente el
status (`test-git-guards-cwd.mjs:572`: `` `exit ${r.status}` ``); su causa es la
misma GS-003.

### 2.2 Causa raíz con evidencia (los 11 casos GS-003)

En `.claude/hooks/sofka-asdd-guard-branch.mjs:157-168`, incluso cuando la rama
**no** es protegida, el guard devuelve `allow` con un efecto que exige
autorización explícita:

```js
  // GS-003: aun en ramas no protegidas un commit requiere challenge explícito,
  // ligado al comando y consumible una sola vez. Nunca reutiliza el plan-gate.
  return {
    decision: "allow",
    effects: [{
      type: "consume-commit-authorization",
      execute: () => consumeCommitAuthorization({ branch, command }),
      failureReason:
        "BLOQUEADO GS-003: este git commit no tiene autorización explícita vigente. " +
        "Mostrá el comando exacto, emití el challenge con sofka-asdd-commit-authorization.mjs issue y esperá confirmación del usuario.",
    }],
  };
```

`main()` ejecuta el efecto y, si lanza, escribe `failureReason` en `stderr` y sale
con **exit 2** (`sofka-asdd-guard-branch.mjs:176`):

```js
    try { effect.execute(); } catch { process.stderr.write(`${effect.failureReason}\n`); process.exit(2); }
```

**La suite nunca emite una autorización de commit.** Verificado: 0 coincidencias
de `commit-authorization|commitAuthorization|challenge|issue` en las 1 201 líneas
de `test-git-guards-cwd.mjs`. Por lo tanto `consumeCommitAuthorization` siempre
lanza y todo caso que espere `status === 0` para un `git commit` falla por
construcción.

### 2.3 El punto crítico — qué dejó de medirse

La suite se llama `git-guards-cwd`. Lo que mide es la **resolución del repositorio
efectivo** frente a `cd`, `pushd`, `git -C`, repos anidados, mono-repo, comillas y
rutas con espacios (importa `resolveEffectiveCwd` desde
`../hooks/_lib/git-command-cwd.mjs`, `test-git-guards-cwd.mjs:27`). Los casos
"commit permitido" son el **vehículo** para observar esa resolución: si el guard
resolvió bien el repo efectivo y la rama de destino no es protegida, el resultado
esperado es `allow`.

Como GS-003 bloquea **antes** de que el resultado de la resolución de cwd se
manifieste en el exit code, esos 11 casos **dejaron de medir lo que fueron
escritos para medir**. Hoy solo confirman que GS-003 está activo — algo que ya
cubre `test-commit-authorization.mjs`. La cobertura perdida es la del vector
GS-001 más sensible: que un `cd`/`-C`/`pushd` hacia una rama protegida no se
cuele, y su contraparte, que un destino legítimo no se sobre-bloquee.

### 2.4 `F0.9` — causa distinta: portabilidad Windows en código de producción

**Este caso no es GS-003 y no es independiente de plataforma. Debe reasignarse al
lote de portabilidad cross-OS.**

Síntoma literal:

```
FAIL F0.9 fast-track config/docs permite push sin marcador — exit 2, stderr: BLOQUEADO (pre-push-gate): no existe .claude/.prepush-validated.
```

El caso (`test-git-guards-cwd.mjs:223-235`) crea un repo con un único cambio
`docs/nota.md` en la rama `docs/actualiza-readme` y espera que el fast-track de
config/docs permita el push sin marcador. El fast-track se decide en
`.claude/hooks/sofka-asdd-pre-push-gate.mjs:190-194` a partir de `isConfigOnly()`,
definida en `sofka-asdd-pre-push-gate.mjs:132-138`:

```js
    const raw = execSync(
      "git diff --name-only @{u} 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || true",
      { cwd, encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (!raw) return false; // sin cambios detectados → no fast-track
```

El comando usa sintaxis POSIX (`2>/dev/null`, `|| true`). En Windows, `execSync`
usa `cmd.exe` como shell por defecto, donde esa sintaxis no se interpreta:
`raw` queda vacío, `isConfigOnly` devuelve `false` (fail-closed intencional) y el
gate exige el marcador.

Verificado empíricamente en un repo fixture equivalente (2 commits, cambio único
`docs/nota.md`), ejecutando el mismo comando con dos shells:

```
shell=default cmd.exe                        RAW=[]
shell=C:/Program Files/Git/usr/bin/sh.exe    RAW=[docs/nota.md]
```

Con shell POSIX el fast-track sí aplica y el caso pasaría. **Consecuencia
funcional más allá del test**: en Windows el fast-track de GS-008 para cambios
solo-config/docs está inoperante — todo push exige marcador. Falla cerrado (no
abre un hueco de seguridad), pero degrada el flujo y el defecto está en el **hook
de producción**, no en la suite.

> **HIPÓTESIS — REQUIERE VALIDACIÓN**: que en Linux/macOS este caso pase.
> El razonamiento es sólido (con `sh` el comando devuelve el archivo esperado y
> `.md` no está en `SOURCE_EXTS_DEFAULT`, `sofka-asdd-pre-push-gate.mjs:36`), pero
> la verificación se hizo emulando el shell POSIX en Windows, **no** en una
> corrida real sobre Linux/macOS. **Cómo cerrarlo**: ejecutar la suite en CI Linux.

### 2.5 Por qué los 11 casos GS-003 son independientes de plataforma

La rama `allow` + `consume-commit-authorization` de
`sofka-asdd-guard-branch.mjs:157-168` no tiene ninguna condición por sistema
operativo, y la biblioteca de autorización opera sobre JSON y `sha256` sin
invocar shell (`.claude/scripts/lib/sofka-asdd-commit-authorization-lib.mjs`). La
ausencia de emisión de autorización en la suite es estructural. Fallan igual en
Linux y macOS.

### 2.6 Fix correcto — emitir la autorización en el setup

Hay que emitir la autorización antes de cada caso que espere `allow`, para que el
gate deje pasar y **el assert de resolución de cwd vuelva a ser el que decide**.

**Cómo se emite** (`.claude/scripts/lib/sofka-asdd-commit-authorization-lib.mjs`):

| Paso | Función | Línea | Efecto |
|---|---|---|---|
| 1 | `issueCommitChallenge({branch, command, ttl_seconds})` | `:10-14` | Escribe `challenge.json`; exige que `command` matchee `/\bgit\s+commit\b/`; TTL acotado a 1–900 s (default 300); borra cualquier autorización previa |
| 2 | `approveActiveCommitChallenge()` | `:15-18` | Promueve el challenge a `authorization.json` (falla si está vencido) y borra el challenge |
| 3 | `consumeCommitAuthorization({branch, command})` | `:19-23` | Lo que ejecuta el guard: valida `schema_version`, que `used_at` esté vacío, TTL, `branch` exacta y `command_hash`; luego marca `used_at` |

Qué liga la autorización, exactamente (`lib:12` y `lib:21`):

- **Rama**: `branch` normalizada (`trim` + colapso de espacios) — comparación por
  igualdad estricta.
- **Comando**: `command_hash = sha256(comando normalizado)` — no un prefijo ni un
  patrón: el comando debe coincidir carácter a carácter tras normalizar espacios.
- **Un solo uso**: `used_at` se sella al consumir; un segundo consumo lanza
  `no valid explicit authorization for this commit` (`lib:21`).
- **Ubicación del estado**: `.runtime/commit-authorization/` resuelto **relativo a
  la biblioteca** (`lib:6`: `resolve(here,"..","..",".runtime",…)`), es decir el
  repo del template — **no** el repo fixture temporal.

**Patrón reusable ya existente.** Sí: `test-commit-authorization.mjs` (pasa,
exit 0) tiene el setup exacto en **`.claude/scripts/test-commit-authorization.mjs:6`**:

```js
issueCommitChallenge({branch:'feature/demo',command,ttl_seconds:60});approveActiveCommitChallenge();consumeCommitAuthorization({branch:'feature/demo',command});
```

Los 11 casos pueden copiar las **dos primeras llamadas** (el consumo lo hace el
guard bajo prueba). El import está en `test-commit-authorization.mjs:3`.

Implicaciones que el fix debe respetar:

1. **Una emisión por caso**, inmediatamente antes de `runHook(GUARD_BRANCH, …)`,
   por el carácter de un solo uso.
2. **La rama a autorizar es la del repo efectivo**, no la del cwd base. Ejemplo:
   en `R3b.4` el comando es `cd nested && git commit -m x`
   (`test-git-guards-cwd.mjs:570`) con la raíz en `dev` y el anidado en
   `feature/algo` → hay que emitir con `branch: "feature/algo"`. Emitir con la
   rama equivocada mantiene el bloqueo y, peor, lo haría por la razón errónea.
3. **El `command` debe ser el string exacto** que recibe el hook en
   `tool_input.command`, incluidos `cd`, comillas y encadenamientos.
4. **Limpieza entre casos**: `test-commit-authorization.mjs:4,8` usa
   `rmSync(dir,{recursive:true,force:true})` sobre `dir` exportado por la lib.
   Conviene el mismo saneo para no arrastrar estado, teniendo en cuenta que el
   directorio es global al repo del template.

> **HIPÓTESIS — REQUIERE VALIDACIÓN**: que el estado compartido en
> `.runtime/commit-authorization/` no genere interferencia si dos suites que
> emiten autorizaciones corren en paralelo (hoy `test-git-guards-cwd` es serial).
> **Cómo cerrarlo**: revisar si el runner de tests paraleliza suites; si lo hace,
> aislar vía variable de entorno o serializar las suites que tocan ese directorio.

### 2.7 Recomendación

**Emitir `issueCommitChallenge` + `approveActiveCommitChallenge` en el setup de
los 11 casos GS-003**, copiando el patrón de `test-commit-authorization.mjs:6`,
con la rama del repo efectivo y el comando exacto. **`F0.9` se excluye de este
fix** y se reasigna al lote de portabilidad cross-OS, donde corresponde corregir
`sofka-asdd-pre-push-gate.mjs:134-137` para no depender de sintaxis POSIX.

---

## 3. `test-pretool-dispatcher-prototype.mjs` — el adaptador del spike crashea contra hooks que ya migraron su patrón de invocación

**Archivo bajo prueba**: `.claude/scripts/sofka-asdd-pre-tool-dispatcher-prototype.mjs`
(spike, no registrado en runtime) · **Test**: `.claude/scripts/test-pretool-dispatcher-prototype.mjs`
**Categoría preliminar**: `script_issue` (defecto en el adaptador del spike, no
en los hooks de producción que carga) · **Severidad**: LOW · **Prioridad**: P3

### 3.1 Corrección de diagnóstico — el hallazgo de entrada estaba incompleto

La evidencia de entrada de esta tarea afirmaba que la causa era una brecha de
paridad deliberada: "el spike solo adapta 2 de los 12 guards de producción
(`plan-authorization-operation`, `orchestrator-guard`), importados de forma
estática (`sofka-asdd-pre-tool-dispatcher-prototype.mjs:9-10`)". Eso describe
correctamente los **2 `import` estáticos** del archivo, pero omite que el mismo
archivo también carga **dinámicamente los 10 hooks restantes** vía
`loadLegacyGuard()` (`sofka-asdd-pre-tool-dispatcher-prototype.mjs:42-59,61-74`):

```js
const legacyFiles = [
  "sofka-asdd-pre-tool-use-dangerous-bash.mjs",
  "sofka-asdd-guard-branch.mjs",
  "sofka-asdd-pre-push-gate.mjs",
  "sofka-asdd-pre-pr-gate.mjs",
  "sofka-asdd-pre-tool-use-spec-check.mjs",
  "sofka-asdd-pre-tool-use-dep-check.mjs",
  "sofka-asdd-pre-tool-use-analyze-guard.mjs",
  "sofka-asdd-pre-tool-use-artifact-name-guard.mjs",
  "sofka-asdd-pre-tool-use-design-guard.mjs",
  "sofka-asdd-pre-tool-use-coauthorship-guard.mjs",
];
const legacy = await Promise.all(legacyFiles.map(loadLegacyGuard));
```

10 dinámicos + 2 estáticos = **12**, el mismo total que
`.claude/hooks/sofka-asdd-pre-tool-dispatcher.mjs` importa
(verificado: 14 líneas de `import`, de las cuales 2 son módulos nativos de
Node — `node:fs`, `node:url` — y 12 son guards). **El spike sí intenta
adaptar los 12.** La brecha real no es de cobertura declarada, es de
**ejecución**: el adaptador dinámico está roto.

### 3.2 Causa raíz con evidencia

`loadLegacyGuard()` reescribe cada hook legacy en memoria para poder
`import()`-arlo como módulo de datos (`sofka-asdd-pre-tool-dispatcher-prototype.mjs:42-58`)
y exige que el archivo termine en una llamada **incondicional** a `main()`:

```js
const mainCall = /\nmain\(\);\s*$/;
if (!mainCall.test(source)) {
  throw new Error("prototype adapter cannot find unconditional main() in " + file);
}
source = source.replace(mainCall, "\nexport { main as __asddMain };\n");
```

Los **10 hooks legacy** que `loadLegacyGuard` carga ya no terminan así. Todos
usan el patrón guardado que permite que el propio hook sea importado por su
test de regresión sin ejecutar el proceso — por ejemplo, la última línea de
`.claude/hooks/sofka-asdd-pre-tool-use-dangerous-bash.mjs`:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

Verificado con `tail -1` sobre los 10 archivos de `legacyFiles`: **los 10**
terminan con esa misma forma guardada (ninguno con `main();` incondicional).
El mismo patrón ya existe en los 2 guards que el spike importa estáticamente
(`orchestrator-guard.mjs:337`, `plan-authorization-operation.mjs` equivalente) —
es la convención vigente del repo, no una excepción aislada.

**Reproducido de forma aislada**, invocando el spike directamente con un evento
`Edit` válido (fuera de la suite, sin tocar ningún archivo):

```
$ node .claude/scripts/sofka-asdd-pre-tool-dispatcher-prototype.mjs < evento-edit.json
file:///…/.claude/scripts/sofka-asdd-pre-tool-dispatcher-prototype.mjs:53
    throw new Error("prototype adapter cannot find unconditional main() in " + file);
Error: prototype adapter cannot find unconditional main() in sofka-asdd-pre-tool-use-dangerous-bash.mjs
    at loadLegacyGuard (…/sofka-asdd-pre-tool-dispatcher-prototype.mjs:53:11)
Node.js v24.18.0
```

`sofka-asdd-pre-tool-use-dangerous-bash.mjs` es el **primer** elemento de
`legacyFiles` (línea 62), así que la excepción ocurre en el primer `Promise.all`
(línea 74), **antes** de que el dispatcher llegue a evaluar ningún guard, para
prácticamente cualquier evento con JSON bien formado.

### 3.3 Por qué el harness reporta "allow" en vez de mostrar el crash

`decisionOf()` en el test (`test-pretool-dispatcher-prototype.mjs:62-80`)
solo interpreta dos formas de salida del proceso hijo: `exitCode === 2` → deny
con la razón de `stderr`; cualquier otro código distinto de `0` → **allow, sin
razones** (línea 66: `if (result.exitCode !== 0) return { decision: "allow",
reasons: [], source: result.command };`). Un crash por excepción no capturada
sale con **exit 1**, así que el harness lo confunde con una decisión legítima
de "allow" — de ahí que la salida real de la suite sea:

```
FAIL bash-dangerous-reset: deny -> allow (reasons 1/0)
FAIL bash-dangerous-reset-quoted: deny -> allow (reasons 1/0)
FAIL bash-dangerous-reset-git-c: deny -> allow (reasons 1/0)
FAIL bash-authorization-control: deny -> allow (reasons 1/0)
FAIL bash-ai-coauthorship: deny -> allow (reasons 2/0)
FAIL edit-multiple-denies: deny -> allow (reasons 2/0)
FAIL write-invalid-artifact-multiple-denies: deny -> allow (reasons 2/0)
FAIL edit-path-with-spaces: deny -> allow (reasons 1/0)
FAIL edit-windows-style-path: deny -> allow (reasons 1/0)
PASS bash-allow-fast-path: allow -> allow (reasons 0/0)
PASS malformed-json: deny -> deny (reasons 1/1)
```

**9 de los 11 fixtures fallan**, no solo los dos casos de portabilidad de
rutas Windows que motivaron esta tarea. `malformed-json` pasa únicamente
porque el `JSON.parse` del propio spike (líneas 16-21) falla y sale con
`exit 2` **antes** de llegar a `loadLegacyGuard` (línea 74) — es la única ruta
de código que nunca toca el adaptador roto. `bash-allow-fast-path` pasa porque
tanto el "antes" (dispatcher real) como el "después" (spike crasheado)
coinciden en "allow", por razones opuestas: uno porque de verdad nada lo
deniega, el otro porque el proceso crasheó.

### 3.4 Por qué el spike quedó desalineado — drift documentado, no regresión de esta rama

El patrón guardado (`if (process.argv[1] && …) main();`) ya existía en
`.claude/hooks/sofka-asdd-pre-tool-use-dangerous-bash.mjs` en el commit
`65fa180` ("feat(perf): consolidate pretool guards", 2026-07-18), y el spike
(`sofka-asdd-pre-tool-dispatcher-prototype.mjs` + su test) se creó **después**,
en el commit `d843534` ("docs(perf): validate single-process hook dispatcher",
mismo día). Es decir: el adaptador nació ya incompatible con la forma real de
los hooks que dice adaptar. Confirmado que ninguno de los 26 archivos tocados
por esta remediación cross-OS (`fix/os-compatibility`) modificó el spike, su
test, los 10 hooks legacy ni el fixture corpus — el commit `65fa180` y
`d843534` están en `dev` (`git merge-base HEAD dev` = `661cfab`, y `65fa180`
es ancestro de ese merge-base). **No es una regresión de esta rama.**

El baseline congelado (`docs/baselines/2026-07-18-001-spike-1r-dispatcher-prototype.json`)
registra `"differential": {"fixtures": 7, "passed": 7, "failed": 0}` sobre
`source.branch: "feature/asdd-runtime-efficiency-v2"`,
`source.base_commit: "a941930"` — una rama y un commit **distintos** de los
que hoy contiene `dev`/`fix/os-compatibility`, y con **7** fixtures, mientras
que el corpus vigente (`.claude/scripts/fixtures/sofka-asdd-pretool-dispatcher-s1.json`)
tiene **11**. El baseline es una fotografía válida de *ese* momento — no es
falso — pero mide un estado del repositorio (hooks + corpus) que ya no existe.

> **HIPÓTESIS — REQUIERE VALIDACIÓN**: que el commit exacto que migró los 10
> hooks legacy al patrón guardado sea el mismo `65fa180`, y no uno posterior.
> Se verificó que `65fa180` ya contenía el patrón guardado en
> `sofka-asdd-pre-tool-use-dangerous-bash.mjs` (`git show 65fa180:… | tail -3`),
> y que el spike se creó después (`d843534`, mismo día) — pero no se recorrió
> el historial completo de los 9 hooks legacy restantes commit a commit.
> **Cómo cerrarlo**: `git log --follow -p` sobre cada uno de los 10 archivos de
> `legacyFiles` acotado a la ventana `65fa180..d843534`.

### 3.5 Opciones de solución evaluadas

**(A) Acotar los asserts del test a lo que el spike realmente adapta.** Tal
como estaba formulada en la evidencia de entrada ("son solo 2 guards, recortar
el corpus a esos 2"), esta opción **no aplica** una vez corregido el
diagnóstico: el spike intenta adaptar los 12, no 2 — recortar a 2 ocultaría
que el adaptador dinámico (10 de los 12) está completamente roto, produciendo
exactamente el antipatrón que la sección 4.2 de este documento condena
("bajar expectativas para acomodar el estado actual"). **Descartada bajo la
causa raíz corregida.**

**(B) Retirar spike + test.** ADR-018 ya concluyó con la decisión de
consolidar en un único dispatcher de producción (`sofka-asdd-pre-tool-dispatcher.mjs`,
registrado y en uso), y ese dispatcher ya tiene su propia cobertura viva
(`test-pretool-dispatcher-registration.mjs`, `PASS` — verificado en esta
misma sesión: *"PASS registration: exactly one production ASDD dispatcher
process"*, *"PASS implementation: 12 explicit imports and no dispatcher
child_process"*, *"PASS rollback: legacy -> dispatcher round-trip preserves
PostToolUse"*). El riesgo señalado en la evidencia de entrada —que
`benchmark-pretool-hooks.mjs` todavía referencia el prototipo
(`.claude/scripts/benchmark-pretool-hooks.mjs:67`)— se verificó: **sigue
siendo así**, pero ese benchmark **no está enganchado a ningún flujo vivo**:
0 coincidencias en `package.json`, `.claude/settings.json` o
`.claude/scripts/validate-template.mjs`; sus únicas referencias fuera del
propio script son documentales (`docs/baselines/…`, `docs/runs/…`,
`docs/tech/2026-07-18-001-DESIGN-009-runtime-efficiency-spike-1r.md`). Es
decir, `benchmark-pretool-hooks.mjs` ya es, en la práctica, un artefacto
histórico manual, no una dependencia activa.

**(C) Agregar los guards faltantes / arreglar el adaptador del spike.**
**Descartada explícitamente** por instrucción directa de esta tarea: tocar
`sofka-asdd-pre-tool-dispatcher-prototype.mjs` (sea para actualizar
`loadLegacyGuard` al patrón guardado, sea para "agregar" guards que en
realidad ya intenta cargar) invalidaría la medición de rendimiento congelada
en el baseline — el valor del spike es justamente que quedó fijo en el tiempo.

### 3.6 Recomendación

**Ninguna de (A)/(B)/(C) tal como fueron planteadas se sostiene intacta tras
corregir el diagnóstico.** La recomendación es una variante acotada de (B):
**no modificar ni retirar ningún archivo**, y en su lugar **documentar
formalmente esta suite como un tercer defecto preexistente y no bloqueante**
— exactamente el tratamiento que este mismo documento ya da a las otras dos
(§1, §2): permanece roja, con dueño, causa raíz evidenciada y sin falso verde.
Motivo para no ir más allá de documentar:

- El spike ya cumplió su propósito (medir, informar ADR-018) y su baseline
  está congelado por diseño — no debe "mantenerse verde" indefinidamente.
- El dispatcher de producción real tiene su propia suite viva y en verde
  (`test-pretool-dispatcher-registration.mjs`), que es la que protege el
  comportamiento que de verdad corre en cada sesión.
- Retirar el archivo (opción B pura) rompería `benchmark-pretool-hooks.mjs`
  por una referencia de path, aunque ese benchmark en sí ya sea de uso manual
  — retirar algo que aún tiene un consumidor directo, por histórico que sea,
  no es una decisión de esta tarea (documentar, no arreglar).
- Arreglar el adaptador (`loadLegacyGuard`) para que reconozca el patrón
  guardado técnicamente **no** movería el número de la medición congelada
  (solo cambiaría cómo se extrae `main` para re-ejecutar los mismos hooks),
  pero **sigue fuera de scope**: esta tarea es documentar, no tocar el spike,
  y la decisión de si vale la pena mantenerlo ejecutable corresponde a quien
  sea dueño de ADR-018, no a este documento.

> **HIPÓTESIS — REQUIERE VALIDACIÓN**: que nadie dependa de que
> `test-pretool-dispatcher-prototype.mjs` pase en verde como parte de un gate
> — hoy no está en `package.json` ni en `validate-template.mjs`, así que no
> bloquea `npm run validate` ni ningún check numerado. **Cómo cerrarlo**:
> confirmar con el dueño de ADR-018 si existe algún pipeline externo al
> template que invoque esta suite por nombre.

---

## 4. Cómo NO arreglarlas

Esta sección es la razón de ser del documento. Los tres antipatrones siguientes
ponen las suites en verde **sin restaurar ninguna verificación** — producen un
falso verde, que es peor que el fallo visible actual: el fallo avisa, el falso
verde silencia.

### 4.1 Cambiar el assert a "esperar deny" en los 11 casos GS-003

**La peor opción de todas.** Reemplazar `r.status === 0` por `r.status === 2` en
los casos "permite commit" los pondría verdes de inmediato y de forma
permanente. Pero como GS-003 bloquea **antes** de que la resolución de cwd
influya en el resultado, el assert pasaría **con independencia de si la
resolución del repo efectivo funciona o está completamente rota**. La suite
reportaría éxito sin volver a probar nunca `cd`, `pushd`, `git -C`, repos
anidados ni rutas con comillas. Se perdería la cobertura del vector GS-001 más
sensible, y nadie lo notaría, porque el tablero estaría verde.

### 4.2 Bajar expectativas para acomodar el estado actual

Aflojar los asserts —esperar `stdout` no vacío en vez del literal esperado,
aceptar `status !== 1`, envolver casos en `try/catch` que traguen el fallo, o
marcar los casos como skip sin ticket— convierte la suite en un test de humo que
solo verifica que el proceso arranca. En `test-orc-tier-c-hooks.mjs` esto es
especialmente tentador porque **los 15** asserts fallan a la vez y la tentación
es "bajar el listón hasta que pase". El resultado sería exactamente el estado que
ya tenemos en `test-session-start-hook.mjs:8`: verificaciones de string sobre el
fuente que nunca ejecutan el hook, y que por construcción no pueden detectar una
regresión de comportamiento.

### 4.3 Reapuntar a código muerto

Cambiar `hooksDir` (`test-orc-tier-c-hooks.mjs:32`) hacia
`.claude/scripts/legacy-hooks/` es un cambio de una línea que da verde
instantáneo. Es un falso verde de la variedad más engañosa: los tests **pasan de
verdad**, pero sobre código que **ningún flujo ejecuta** —los 4 hooks tienen 0
referencias en `.claude/settings.json`, cuyo único hook `SessionStart` es el
dispatcher (`.claude/settings.json:92-98`). Una regresión en el dispatcher real
—el que corre en cada sesión— pasaría inadvertida mientras la suite celebra 15
PASS sobre archivos archivados. Agravante ya señalado en §1.6: el legacy depende
de `find … | wc -l`, sintaxis POSIX que reintroduciría fallos de portabilidad en
Windows.

### 4.4 Regla general

Un fix de test es válido solo si, después de aplicarlo, **el assert vuelve a
fallar cuando se rompe el comportamiento que el test fue escrito para proteger**.
Si el test pasaría igual con el comportamiento roto, el fix es un falso verde y
debe rechazarse en code review.

### 4.5 Arreglar el adaptador del spike para que vuelva a pasar

Agregar los guards faltantes al spike, o "arreglar" `loadLegacyGuard()` para que
el adaptador vuelva a cargar los hooks, con el único objetivo de que el test
pase, es el mismo antipatrón aplicado a la preexistencia de §3. Por qué es un
falso verde: el valor del spike es que su medición quedó **congelada** en
`docs/baselines/2026-07-18-001-spike-1r-dispatcher-prototype.json` y referenciada
por `ADR-018`. Modificar el artefacto medido invalida la medición que justifica
conservarlo, y produce un verde real sobre un artefacto cuya utilidad depende
precisamente de que no cambie.

---

## 5. Nota sobre clasificación

Al triagear el baseline de 45 suites, estas tres **no** deben incluirse en el
lote de portabilidad: sus causas raíz son un directorio de hooks obsoleto, una
precondición de autorización ausente y un adaptador de spike que crashea al
cargar hooks legacy que ya migraron a otro patrón de invocación. Corregir
separadores de ruta, CRLF, BOM o `/tmp` no las mueve.

La excepción es **`F0.9`**, que sí es portabilidad y sí pertenece a ese lote
(§2.4): 12 fallos de `test-git-guards-cwd.mjs` = 11 preexistentes + 1 de
portabilidad. El conteo global del baseline, corregido, queda en **17 fallos de
portabilidad y 3 suites con defectos preexistentes**: 15 asserts en
`test-orc-tier-c-hooks.mjs` (§1), 11 casos en `test-git-guards-cwd.mjs` (§2) y
9 de 11 fixtures en `test-pretool-dispatcher-prototype.mjs` (§3).

## 6. Restricción operativa para el runner de tests

`test-git-guards-cwd.mjs` tarda **82 segundos** en Windows (medido en esta
corrida, `fix/os-compatibility`). No es un cuelgue: es el costo de inicializar los
repositorios de fixture **en serie**. Conteo estático sobre el archivo:

| Operación | Ocurrencias |
|---|---|
| `gitInit(` | 62 |
| `makeTmpDir(` | 37 |
| `commitFile(` | 74 |

Es decir ~62 `git init` más ~74 commits, cada uno con sus `git config` y
`git add` (`test-git-guards-cwd.mjs:60` usa `mkdtempSync`). En Windows `git init`
es notablemente más lento que en Linux por la creación de árboles de directorios
y el antivirus en tiempo real.

**Implicación**: cualquier runner de tests o pipeline de CI necesita un timeout
de **≥150 s** para esta suite en Windows (margen ~1.8× sobre los 82 s medidos).
Con un timeout de 60 s —valor común por defecto— la suite se aborta y se reporta
**falsamente como cuelgue o fallo de infraestructura**, enmascarando los 11
fallos reales de GS-003 documentados aquí. Si el runner aplica un timeout global
por suite, debe permitir un override por suite para este caso.

Nota adicional para quien optimice: paralelizar la creación de fixtures reduciría
el tiempo, pero debe considerarse el estado compartido en
`.runtime/commit-authorization/` señalado en §2.6 (hipótesis abierta).

## 7. Nota de alcance final

**Qué se hizo en este documento:**

- Lectura y validación de la evidencia de entrada sobre ambas suites.
- Una ejecución de `test-git-guards-cwd.mjs` para capturar la lista exacta de
  fallos y medir su duración real.
- Una reproducción aislada de `isConfigOnly()` en un repo fixture temporal
  (`mktemp -d`, fuera del repo del proyecto) para determinar la causa raíz de
  `F0.9`.
- Consultas `git log` / `git show` de solo lectura para fechar el commit `59975b2`
  y su intención.
- Lectura del dispatcher, los hooks legacy, `settings.json`, el lock, `ORC-001-D`,
  `ADR-001`, el guard de rama, el gate de pre-push y las utilidades de
  autorización de commit.

**Qué NO se hizo:**

- **No se modificó ninguna suite de test** ni ningún hook, script, regla o
  configuración. Este documento es el único archivo escrito.
- **No se ejecutó ningún comando git de escritura**: sin `commit`, `push`,
  `merge`, `checkout`, `branch`, `stash` ni `reset`. Solo `log`, `show` y
  `rev-parse`.
- No se propusieron cambios fuera del alcance de estas 3 suites, salvo la
  reasignación de `F0.9` y la corrección puntual señalada en
  `sofka-asdd-pre-push-gate.mjs:134-137`, que el lote de portabilidad debe evaluar.
- No se verificó el comportamiento en Linux/macOS (ver hipótesis abiertas en
  §1.5, §2.4 y §2.6).
- No se implementó ningún fix. Todas las propuestas de las secciones §1.6, §1.7,
  §2.6 y §2.7 son **propuestas a validar**, no decisiones cerradas.
