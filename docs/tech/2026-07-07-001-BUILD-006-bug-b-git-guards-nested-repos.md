# BUG-B: Guards git ciegos a repos anidados

**Módulo**: `.claude/hooks/asdd-guard-branch.mjs` + `.claude/hooks/asdd-pre-push-gate.mjs` + `.claude/hooks/asdd-pre-pr-gate.mjs`
**Severidad**: CRITICAL
**Prioridad**: P0
**Categoría preliminar**: bug
**Reportado**: 2026-07-07
**Estado**: Abierto
**Release asignado**: R3 (v2.28.0)
**Run ASDD**: 2026-07-07-001

> **Nota sobre ubicación**: este reporte vive en `docs/tech/` en lugar de
> `docs/specs/bug-*.md` por el defecto A8 (analyze-guard) documentado en
> BUG-A. Se re-ubica con `git mv` una vez A8 esté implementado.

## Descripción

Los 3 guards git del template (`guard-branch`, `pre-push-gate`,
`pre-pr-gate`) enforzan las reglas GS-001, GS-008 y GS-009 asumiendo
que el comando `git` opera siempre sobre el repo raíz identificado por
`CLAUDE_PROJECT_DIR`. En proyectos con **repos anidados** (típico en
arquitecturas multi-repo con configuración compartida + proyectos como
sub-repos independientes), esta suposición se rompe: los guards leen la
rama y el estado del repo equivocado, produciendo **falsos positivos
reproducibles al 100% que bloquean todos los commits legítimos**. La
única salida hoy es desactivar los guards para toda la sesión — se
pierden las salvaguardas GS por un bug de parseo, no por decisión.

## Pasos para reproducir

1. Estructura de repo típica del consumidor:
   ```
   /root-config-repo/               (repo git propio — rama: develop)
     .claude/
     projects/
       iac/                         (repo git propio — rama: feature/xxx)
       db/                          (repo git propio — rama: feature/xxx)
       drive-sync/                  (repo git propio — rama: feature/xxx)
   ```
2. El usuario está trabajando en `projects/iac/` sobre una rama
   `feature/xxx`.
3. Un skill invoca Bash con `cd projects/iac && git commit -m "..."`.
4. El hook `guard-branch.mjs` recibe el payload del PreToolUse Bash.
5. Ejecuta `git symbolic-ref --short HEAD` **sin `cwd`**, así que corre
   en `CLAUDE_PROJECT_DIR` (el root-config-repo, rama `develop`).
6. La rama detectada es `develop` → coincide con el listado de ramas
   protegidas → bloquea con exit 2:
   `BLOQUEADO: estás en 'develop' — rama protegida (GS-001)`.
7. El commit legítimo en `projects/iac/feature/xxx` queda bloqueado.
   Reproducible al 100% en la arquitectura del consumidor.

## Comportamiento esperado

Los 3 guards deben resolver el **repo efectivo** desde el comando
(parseando `cd X &&`, `git -C X`, `parseInlineEnvVar` para prefijos
`VAR=1 comando`) o desde `input.cwd` del payload PreToolUse, y evaluar
la rama, el diff y el marcador `.claude/.prepush-validated` **en ese
repo**, no en el repo raíz.

## Comportamiento actual

- **`guard-branch.mjs:53`** y **`pre-pr-gate.mjs:81`** ejecutan
  `git symbolic-ref --short HEAD` sin `cwd`. El resultado se computa en
  el repo del proceso Node, que es `CLAUDE_PROJECT_DIR` por default.
- **`pre-push-gate.mjs:71-80`** llama a `projectRoot()` que devuelve
  `CLAUDE_PROJECT_DIR`. El diff y el lookup del marcador
  `.claude/.prepush-validated` ocurren en el repo raíz.
- Ninguno de los 3 hooks parsea `cd X &&`, `git -C X`, o
  `parseInlineEnvVar` — aunque una regex `GIT_COMMIT_RE` reconoce
  sintácticamente `-C` en otros contextos, ningún hook extrae el valor
  para usarlo como `cwd`.
- Ningún hook lee `input.cwd` del payload PreToolUse, **aunque 5 hooks
  del propio template registrados en el matcher `Write|Edit` sí lo
  hacen** — inconsistencia interna: unos hooks respetan `cwd`, otros no.
- **Escape hatch inline no funciona**: los hooks leen
  `process.env.ASDD_GUARD_*_DISABLE` desde el proceso del hook
  (`:73/:147/:160` según el hook), pero un prefijo `VAR=1 comando` que
  el usuario o el skill agregan **nunca llega al proceso del hook** —
  ese prefijo se aplica al shell del comando bajo prueba, no al Node
  que ejecuta el hook. El escape hatch existe pero es inutilizable en
  la práctica sin autorización global de sesión.
- **Gap extra en pre-push-gate**: `isConfigOnly` (:118-135) calcula
  `git diff` contra el repo raíz — si el usuario cambió código en
  `projects/iac/` pero el root-config-repo no tiene diff, el fast-track
  config-only se dispara incorrectamente y salta build/tests. El
  marcador `.claude/.prepush-validated` (:83-85) también se busca en la
  raíz, así que un skill que lo escribe en el repo efectivo produce un
  marcador que el hook no encuentra (y viceversa).

## Ambiente

- **Ambiente**: local (consumidor real, arquitectura multi-repo)
- **Versión / commit**: lock v2.27.0
- **Cliente**: Claude Code (orquestador ASDD)
- **Rol del usuario**: developer con feature branch en un sub-repo

## Evidencia

- **`guard-branch.mjs:53`**: `execSync('git symbolic-ref --short HEAD')` sin `{ cwd }`.
- **`pre-pr-gate.mjs:81`**: mismo patrón; sin `cwd`.
- **`pre-push-gate.mjs:71-80`**: `const rootDir = projectRoot()` → `CLAUDE_PROJECT_DIR`; toda la lógica subsiguiente usa `rootDir`.
- **`pre-push-gate.mjs:118-135` (`isConfigOnly`)**: `git diff --name-only ...` sobre `rootDir`.
- **`pre-push-gate.mjs:83-85`**: `path.join(rootDir, '.claude', '.prepush-validated')` — marcador en repo raíz, no efectivo.
- **Inconsistencia interna** — 5 hooks del template registrados en
  `Write|Edit` sí leen `input.cwd`; los 3 guards git no. Grep sugerido:
  `rg 'input\.cwd|toolInput\.cwd' .claude/hooks/` para el catálogo
  completo.
- **Reproducción**: proyecto de conciliación bancaria del consumidor;
  estructura raíz-config + `projects/{iac,db,drive-sync}/` como
  sub-repos.

## Análisis preliminar (SBR-001)

**Causa raíz**: los 3 guards git usan `CLAUDE_PROJECT_DIR` como CWD
implícito para toda operación `git`, sin resolver el repo efectivo del
comando bajo prueba. No hay helper compartido que parsee `cd X &&`,
`git -C X` o prefijos inline; cada hook duplica lógica ligeramente
distinta.

**Falso positivo estructural**: el consumidor no tiene forma de trabajar
con el template en su arquitectura multi-repo sin desactivar los
guards. Es un bug de UX del template, pero con severidad **crítica**
porque bloquea el 100% de commits legítimos en la única arquitectura
donde el guard es más necesario (repos con diferentes ramas de
integración).

**Áreas de regresión en riesgo tras el fix**:

- Cualquier hook o skill que asuma `CLAUDE_PROJECT_DIR` como CWD único
  (grep exhaustivo antes de tocar).
- El skill `asdd-tech-lead-pre-push` escribe el marcador en
  `process.cwd()`; si el CWD del skill difiere del CWD del hook, hay
  desalineación silenciosa.
- Los flujos donde el usuario efectivamente **está** en el root-config
  y no en un sub-repo — no regresionar el bloqueo legítimo GS-001 sobre
  la raíz.

## Fix sugerido (propuesta — validar en diagnóstico, ver R3 en el plan)

**Cambio propuesto (con red de tests F0 parcial ANTES de tocar código
de seguridad)**:

- **B0** — Red de tests de baseline sobre los 3 guards actuales. Cubrir
  el comportamiento actual (protegido, ambiguo, escape hatch) antes de
  refactorizar. Sin esta red, R3 no arranca — el riesgo de introducir
  fail-open silencioso en gates de seguridad es alto.
- **B1** — Helper compartido `.claude/hooks/_lib/git-command-cwd.mjs`
  (tras rename E2) con `resolveEffectiveCwd(command, inputCwd)` que
  parsea:
  - `cd X && ...` (soporta ruta relativa o absoluta, y `&&` o `;`).
  - `git -C X ...` (extrae el valor del flag `-C`).
  - `parseInlineEnvVar` para prefijos `VAR=1 comando` (aunque solo
    documenta el patrón, no cambia el CWD; sirve para detectar el
    escape hatch inline no funcional).
  - Fallback: `inputCwd` del payload PreToolUse si viene.
  - Fallback último: `CLAUDE_PROJECT_DIR`.
- **B2-B4** — Aplicar el helper en `guard-branch.mjs`,
  `pre-push-gate.mjs` (incluye recomputar `isConfigOnly` y el lookup
  del marcador en el repo efectivo) y `pre-pr-gate.mjs`.
- **B5** — El skill `asdd-tech-lead-pre-push` escribe el marcador
  en el mismo repo efectivo que resuelve el helper (unificar CWD entre
  skill y hook).
- **B6** — Tests con estructura de repos anidados reproduciendo
  exactamente el caso de campo: `root-config` + `projects/iac/db/drive-sync/`.
  Cubrir 3 casos por hook: (i) usuario en raíz, protegida detectada
  correctamente; (ii) usuario en sub-repo, rama feature aceptada;
  (iii) parseo ambiguo (`cd` con var), fail-closed.
- **B7** — Documentar el nuevo comportamiento en
  `asdd-git-safety.md` (GS-001, GS-008, GS-009), incluyendo la
  interacción con `input.cwd` y el prefijo inline.

**Mitigación de seguridad obligatoria (no negociable)**: cuando el
parseo del comando es ambiguo (por ejemplo, `cd` con variable no
resuelta, o comandos compuestos con múltiples `cd`), evaluar **tanto**
el repo resuelto **como** el repo raíz. Si **cualquiera** de los dos
está en rama protegida → bloquear. Fail-closed siempre; nunca degradar
a fail-open para resolver este bug. Precedente: el revert de
Smart-Data (`bcdab3f`) mostró que lazy-loadear enforcement sin lector
explícito rompe garantías; aquí el equivalente sería fail-open en el
parseo ambiguo.

**Archivos candidatos**:

- `.claude/hooks/_lib/git-command-cwd.mjs` (nuevo, tras E2).
- `.claude/hooks/asdd-guard-branch.mjs`.
- `.claude/hooks/asdd-pre-push-gate.mjs`.
- `.claude/hooks/asdd-pre-pr-gate.mjs`.
- `.claude/skills/asdd-tech-lead-pre-push/SKILL.md`.
- `.claude/rules/asdd-git-safety.md`.
- Directorio de tests de hooks (crear si no existe).

**Tests requeridos**:

- Fixture con repo raíz + sub-repos; cada uno en rama distinta.
- Comando `cd projects/iac && git commit ...` → guard resuelve rama de
  `projects/iac/`, no de la raíz.
- Comando `git -C projects/iac commit ...` → idem.
- Comando ambiguo `cd $UNRESOLVED && git commit ...` → fail-closed
  (evalúa raíz Y sub-repo, bloquea si cualquiera es protegida).
- `pre-push-gate` con diff solo en sub-repo → `isConfigOnly` decide
  correctamente basado en el sub-repo; marcador buscado en el sub-repo.
- Escape hatch `ASDD_GUARD_BRANCH_DISABLE=1` como variable de
  sesión (no inline) → funciona.

**Riesgo del fix**: **alto**. Guards de seguridad. Un error de parseo
puede transformar un fail-closed en fail-open sin que nadie lo note.
Por eso R3 exige F0 antes de B1 — sin baseline, no hay forma de
detectar regresión.

## Notas

- **Workaround temporal**: `ASDD_GUARD_BRANCH_DISABLE=1` +
  `ASDD_GUARD_PUSH_DISABLE=1` + `ASDD_GUARD_PR_DISABLE=1`
  como variables de sesión (auditable). Desactiva las salvaguardas —
  el equipo del consumidor tuvo que hacerlo para completar entregas.
- **Reproducción original (consumidor)**: proyecto de conciliación
  bancaria, arquitectura raíz-config + 3 sub-repos.
- **ADR aplicable**: ninguno vigente. El fix probablemente merece un
  ADR que documente la política de "repo efectivo" y la interacción
  con `input.cwd`.
- **Bugs relacionados**: BUG-A (`2026-07-07-001-BUILD-005`) y BUG-C
  (`2026-07-07-001-BUILD-007`) — los tres son manifestaciones del
  síntoma FLUJO documentado en el refactoring plan hermano.
