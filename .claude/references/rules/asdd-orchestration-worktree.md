# ASDD Orchestration — Worktree Handoff

Regla **ORC-011**: handoff de resultados de `asdd-developer-frontend` y `asdd-developer-backend` cuando corren con
`isolation: worktree`. Complementa `asdd-orchestration-ops.md`.

## Activación opt-in (ADR-010)

Worktree **no es el modo por defecto**. El developer trabaja sobre la rama de
trabajo actual salvo uno de estos triggers:

1. El usuario solicita explícitamente aislamiento por worktree.
2. El orquestador lanzará **2 o más developers en paralelo** y ORC-011-A
   demuestra que sus scopes son disjuntos.

Un solo developer, o varios developers ejecutados secuencialmente, no activan
worktree automáticamente. Los guards GS-001 y GS-008 siguen aplicando sobre la
rama actual.

## Por qué existe ORC-011

Cuando un developer es invocado explícitamente con `isolation: worktree` y termina
**con un commit**, el Agent tool devuelve `{path, branch}` en el
resultado. **Sin commit, el worktree se destruye automáticamente** y los cambios se
pierden sin aviso. El orquestador tiene la responsabilidad exclusiva del handoff:
verificar que el commit ocurrió, validar, mergear y limpiar.

---

## ORC-011-A: Task Partitioning (PRE-CONDICIÓN para paralelismo)

Antes de lanzar N developers en paralelo con `isolation: worktree` (N ≥ 2), el orquestador
**verifica que sus scopes de archivos no se solapan**:

1. Extraer del spec/design/tasks el conjunto de archivos de cada tarea.
2. Construir mapa de scope: `{ tarea_i: [archivos], tarea_j: [archivos] }`.
3. Verificar intersección entre TODOS los pares `(i, j)`.
4. Si hay intersección → **STOP**: reportar conflicto al usuario, convertir en lotes secuenciales.
5. Solo si intersección = 0 → lanzar en paralelo.

**Autorización del commit de cierre (GS-003, modo `branch`).** Antes de lanzar,
el orquestador emite un challenge de lote por las ramas de worktree y espera el
`ok` del usuario:

```bash
printf '%s' '{"branches":["wt/tarea-1","wt/tarea-2"],"max_uses":1}' | \
  node .claude/scripts/asdd-commit-authorization.mjs issue-worktree
```

Sin esto, el commit de cierre que ORC-011-B exige queda bloqueado por GS-003 —
que pide un challenge ligado al comando exacto, imposible de emitir de antemano
porque el mensaje lo redacta el developer. Ver «Modo `branch`» en
`asdd-git-safety.md`.

Publicar en chat antes de lanzar (obligatorio):

```
Scope Map (ORC-011-A):
  Tarea 1 (@asdd-developer-frontend): [src/a.ts, src/a.test.ts]
  Tarea 2 (@asdd-developer-backend): [src/b.ts, src/b.test.ts]
  Intersección: ninguna ✓ — lanzando en paralelo
```

```
Scope Map (ORC-011-A):
  Tarea 1: [src/service.ts, src/service.test.ts]
  Tarea 2: [src/service.ts, src/helper.ts]
  Intersección: src/service.ts ✗ — ejecutando en lotes secuenciales (Tarea 1 → Tarea 2)
```

---

## ORC-011-B: Detectar resultado de worktree

Al recibir el resultado de `asdd-developer-frontend` o `asdd-developer-backend`, buscar los tres campos
obligatorios que el agente debe incluir en su output:

```
WORKTREE COMMIT: {sha7}
Files: {lista de archivos}
Branch: {nombre-exacto-de-la-rama}
```

| Situación | Acción |
|---|---|
| Los tres campos presentes | Continuar con ORC-011-C (validación pre-merge) |
| Campos ausentes | Worktree destruido — cambios perdidos. Reportar al usuario y reinvocar |

Mensaje al usuario cuando faltan campos:
`⚠ Developer no hizo commit — worktree destruido, cambios perdidos. Reinvocar con instrucción explícita de commit.`

---

## ORC-011-C: Validación pre-merge

Antes de mergear, ejecutar los tests sobre la rama del worktree:

```bash
cd {path} && {test_command}
```

`{test_command}` proviene de `.asdd/testing-capabilities.yaml` (ORC-009).
Si el archivo no existe → omitir validación y documentarlo explícitamente en el anuncio del merge.

Si los tests fallan → **STOP**: reportar fallo al usuario, no mergear.
El worktree permanece activo para diagnóstico (`git worktree list`).

---

## ORC-011-D: Merge secuencial con `--no-ff`

Tras validación exitosa, mergear el worktree branch a la rama de trabajo:

```bash
git fetch . {branch}:{branch}     # traer la rama del worktree al repo principal
git merge --no-ff {branch}        # ejecutado desde la rama de trabajo
```

**Reglas absolutas:**

- NUNCA `--ff`, `--squash` ni `rebase` — la historia debe preservar el worktree branch (GS-007).
- Conflicto detectado → **STOP inmediato**: reportar al usuario los archivos en conflicto.
  NUNCA usar `-X ours`, `-X theirs`, `git checkout --ours/--theirs` de forma automática.

**Para N developers en paralelo** (todos con commit y tests verdes):

- Mergear en orden **estrictamente secuencial** — un merge completo antes del siguiente.
- Orden preferido: por dependencia declarada en tasks; sin dependencia → alfabético por branch name.
- Entre merges: verificar que los tests siguen verdes antes del siguiente.

---

## ORC-011-E: Limpieza post-merge

```bash
git branch -d {branch}           # eliminar rama del worktree (ya mergeada)
git worktree remove {path}        # eliminar directorio del worktree
```

Anunciar en chat:

```
✓ Merge completado: {branch} → {rama-de-trabajo}
  Archivos: {lista}
  SHA: {sha7}
  Worktree limpiado: {path}
```

---

## ORC-011-F: Tabla de recuperación ante errores

| Situación | Acción |
|---|---|
| Resultado sin `WORKTREE COMMIT` | Reportar pérdida de cambios, reinvocar developer |
| Tests fallan pre-merge | STOP — worktree activo para diagnóstico |
| Conflicto de merge | STOP — reportar archivos en conflicto, pedir decisión al usuario |
| Tests rompen post-merge | STOP — `git revert {sha7}` solo si el usuario lo autoriza |
| Worktree huérfano (sesión interrumpida) | `git worktree remove --force {path}` — verificar con `git worktree list` al final de sesión |
