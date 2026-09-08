---
name: sofka-asdd-tech-lead-gitflow
description: Abre el ciclo de cambio en GitFlow — naming GS-004, working tree limpio, sync por merge y una rama por ciclo.
---

# sofka-asdd-tech-lead-gitflow

> Crea la rama de trabajo aplicando las convenciones GitFlow del proyecto antes de tocar código. Valida naming, estado limpio del working tree y reutilización de rama del ciclo activo. No escribe código — prepara el terreno git de la implementación.

## Rol

Operador de las convenciones GitFlow. Aplica los principios de `sofka-asdd-git-safety.md` a la apertura del ciclo de cambio: una rama por ciclo, naming consistente, sincronización por merge.

## Cuándo activar

- Antes de empezar una historia, feature, fix, refactor o chore — siempre que se vaya a tocar código.
- El usuario pide "crear rama", "abrir feature", "branch para esta HU", "start gitflow".
- Al retomar trabajo de una rama existente y validar que es la correcta para el ciclo en curso.
- Fases ASDD: **Construir** (apertura del ciclo), **Verificar** (apertura de rama para fixes post-QA), y cualquier hotfix fuera del ciclo principal.

## Diferenciación con la regla normativa

- `sofka-asdd-git-safety.md` define el **qué y el porqué** (GS-001 a GS-009).
- Esta skill es el **cómo operativo**: comandos, secuencia, validaciones, mensajes al usuario.
- La regla manda; la skill ejecuta. Si entran en conflicto, gana la regla.

## Paso 0 — PRE-FLIGHT (ligero, lectura del estado git)

Esta skill no crea código fuente; el PRE-FLIGHT se limita a confirmar contexto git. Aun así sigue el espíritu de `sofka-asdd-skill-preflight.md`: no actuar sobre rama protegida.

```bash
# Confirmar que el cwd es un repo git válido
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "No es un repo git"; exit 1; }

# Rama actual (puede ser una protegida — el flujo decide qué hacer en cada paso)
current=$(git rev-parse --abbrev-ref HEAD)
echo "Rama actual: $current"

# Listado de remotos
git remote -v
```

Si el usuario está ya en una rama feature válida del ciclo en curso, la skill puede confirmarla en lugar de crear una nueva (GS-006 — una rama por ciclo).

## Convención de naming (GS-004)

Formato: `{tipo}/{descripción-en-kebab-case}` — máximo 60 caracteres, solo minúsculas, números y guiones.

| Tipo de trabajo | Prefijo | Ejemplo |
|---|---|---|
| Feature / historia | `feature/` | `feature/3608-evaluation-endpoint` |
| Change request | `feature/` | `feature/change-tariff-calculation` |
| Bug fix | `fix/` | `fix/login-token-expiry` |
| Hotfix (producción) | `hotfix/` | `hotfix/jwt-validation-error` |
| Tarea / chore | `chore/` | `chore/update-deps` |
| Refactor | `refactor/` | `refactor/extract-port-interfaces` |
| Tests | `test/` | `test/add-pricing-service-tests` |
| Documentación | `docs/` | `docs/update-api-annotations` |

Reglas adicionales:

- Si hay número de WI/HU/ticket → incluirlo al inicio del slug (`feature/3608-...`).
- Solo `[a-z0-9-]` en el slug. Sin tildes ni espacios.
- Si el proyecto define prefijos adicionales en `SOFKA_ASDD_GITFLOW_PREFIXES` (CSV) → aceptarlos también.

## Proceso

### Paso 1 — Verificar estado limpio (BLOQUEANTE si hay cambios sin commitear)

```bash
git status --porcelain
git stash list
```

| Resultado | Acción |
|---|---|
| Working tree limpio | Continuar al Paso 2 |
| Hay cambios sin commitear | STOP — listar archivos y pedir decisión al usuario (commit, stash o descartar). No decidir por él (GS-002). |
| Hay stashes previos | Avisar antes de continuar; el usuario decide si aplica alguno o sigue limpio |

### Paso 2 — Verificar si ya existe rama del ciclo activo (GS-006)

```bash
git branch --list "feature/*" "fix/*" "hotfix/*" "chore/*" "refactor/*" "test/*" "docs/*" | head -20
```

Reglas:

- Si existe una rama del ciclo en curso para el mismo WI/HU/tema → **presentar la lista al usuario** y proponer reutilizarla. No crear una nueva (GS-006).
- Si el usuario confirma reutilización → saltar al Paso 4 con la rama existente.
- Si el ciclo afecta varios repos → una rama por repo, pero nunca varias ramas por repo en el mismo ciclo.

### Paso 3 — Sincronizar con la rama base por merge (GS-007)

Determinar la rama base del proyecto (por defecto `main`, `master`, `develop` o `dev` según el flujo del equipo). Si el lock o el `CLAUDE.md` del proyecto define otra base, respetarla.

```bash
# Resolver la rama de INTEGRACIÓN (de la que sale/a la que vuelve la feature). NUNCA asumir main.
# El equipo declara su integración con SOFKA_ASDD_BASE_BRANCH; si no, se prefiere dev/develop sobre main.
base="${SOFKA_ASDD_BASE_BRANCH:-}"
if [ -z "$base" ]; then
  for b in dev develop main master; do
    git rev-parse --verify "origin/$b" >/dev/null 2>&1 && { base="$b"; break; }
  done
  base="${base:-main}"
fi
git fetch origin "$base"
```

Reglas de sincronización:

- **Merge, NUNCA rebase** (GS-007). El rebase re-aplica commits y abre la puerta a perder código de compañeros en conflictos.
- Si se necesita actualizar la rama base local antes de derivar la nueva:

  ```bash
  git checkout "$base"
  git pull --ff-only origin "$base"
  ```

- Si más adelante hace falta refrescar la feature branch con la base, se hace **desde la feature** con merge explícito:

  ```bash
  git fetch origin "$base"
  git merge --no-ff "origin/$base"
  ```

- Conflictos en merge → resolverlos manualmente revisando ambos lados. Nunca `-X ours` / `-X theirs` ni `git checkout --ours/--theirs` automáticos.

### Paso 4 — Crear o confirmar la rama

Si es rama nueva:

```bash
git checkout -b "{tipo}/{descripción-kebab-case}"
```

Validar inmediatamente el naming antes de continuar:

```bash
branch=$(git rev-parse --abbrev-ref HEAD)
prefijos="${SOFKA_ASDD_GITFLOW_PREFIXES:-feature,fix,hotfix,chore,refactor,test,docs}"
ok=0
IFS=',' read -ra PREFIX_LIST <<< "$prefijos"
for p in "${PREFIX_LIST[@]}"; do
  [[ "$branch" == "$p/"* ]] && ok=1
done
if [[ $ok -eq 0 ]]; then
  echo "Naming inválido (GS-004): '$branch' no tiene prefijo GitFlow."
  exit 1
fi
[[ ${#branch} -le 60 ]] || { echo "Naming inválido (GS-004): nombre >60 chars"; exit 1; }
echo "Rama OK: $branch"
```

### Paso 5 — Confirmar contexto al usuario

Mostrar de forma compacta:

- Rama creada o reutilizada.
- Base usada y si quedó sincronizada con `origin/{base}`.
- Próximo paso esperado según la fase ASDD: implementación (Construir), corrección (Verificar) o documentación.
- Recordatorio: el push se hace cuando el usuario lo autorice — GS-008 mantiene el gate pre-push y `sofka-asdd-tech-lead-create-mr` se invoca solo cuando haya commits listos para revisión.

### Paso 6 — Cleanup post-integración (invocar TRAS confirmar que el PR se mergeó)

Este paso generaliza el cleanup que `ORC-011-E` hace para worktrees al caso de PRs/MRs normales — referenciá `sofka-asdd-orchestration-worktree.md` (ORC-011-E) para el caso de worktrees; este paso cubre el flujo de feature branch estándar.

**Cuándo ejecutarlo**: solo después de que el PR/MR fue mergeado en la rama base en el remoto. No antes.

Secuencia:

1. Volver a la rama base:

   ```bash
   # Resolver la rama de INTEGRACIÓN (de la que sale/a la que vuelve la feature). NUNCA asumir main.
   # El equipo declara su integración con SOFKA_ASDD_BASE_BRANCH; si no, se prefiere dev/develop sobre main.
   base="${SOFKA_ASDD_BASE_BRANCH:-}"
   if [ -z "$base" ]; then
     for b in dev develop main master; do
       git rev-parse --verify "origin/$b" >/dev/null 2>&1 && { base="$b"; break; }
     done
     base="${base:-main}"
   fi
   git checkout "$base"
   ```

2. Sincronizar la base local con el remoto (solo fast-forward — si falla, investigar antes de continuar):

   ```bash
   git pull --ff-only origin "$base"
   ```

3. Validar que la feature branch está mergeada en `origin/{base}` **antes de borrarla**:

   ```bash
   feature="<nombre-de-la-rama-feature>"
   if git branch -r --merged "origin/$base" | grep -q "origin/$feature"; then
     echo "Rama '$feature' ya mergeada en origin/$base — seguro borrar."
   else
     echo "STOP: '$feature' NO aparece como mergeada en origin/$base. No borrar."
     exit 1
   fi
   ```

   Si la validación falla → **STOP**. No borrar la rama. Verificar en el remoto que el merge se completó correctamente y reportar al usuario.

4. Borrar la feature branch local (solo si la validación del paso 3 fue exitosa):

   ```bash
   git branch -d "$feature"
   ```

   Se usa `-d` (safe delete) — si hubiera commits no mergeados, git lo rechaza. **NUNCA** usar `-D` sin autorización explícita del usuario.

**Nota sobre la rama remota**: borrar la rama remota (`git push origin --delete {feature}`) es decisión del equipo o se configura en el remoto con "delete branch on merge". Esta skill no la borra automáticamente — reportar al usuario qué queda pendiente si aplica.

## Reglas comunes del ciclo (GS-002, GS-006, GS-007)

- **NUNCA** trabajar directamente sobre rama protegida (GS-001) — el hook `sofka-asdd-guard-branch` ya lo enforza, esta skill además lo verifica al inicio.
- **NUNCA** `git push --force`, `git reset --hard` sin autorización explícita, ni `git clean -f` sin investigar antes (GS-002).
- **Una rama por ciclo de cambio** (GS-006). Hallazgos tardíos del mismo ciclo se commitean en la misma rama, no en una nueva.
- **Sincronización por merge** (GS-007), nunca rebase. Excepción: si el usuario lo pide explícitamente, advertir el riesgo de pérdida de código en conflictos antes de ejecutar.
- **Atribución de IA prohibida** en commits y MRs — alineado con `sofka-asdd-tech-lead-commit` y `sofka-asdd-tech-lead-create-mr`.

## Conventional commits — referencia rápida (GS-005)

Esta skill no ejecuta commits, pero deja al usuario listo para que `sofka-asdd-tech-lead-commit` los prepare. Forma esperada:

```text
<type>(<scope>): <subject imperativo en español ≤72 chars>
```

Tipos válidos: `feat`, `fix`, `refactor`, `test`, `style`, `chore`, `docs`, `ci`, `perf`, `revert`. Idioma: subject + cuerpo en español; los tipos quedan en inglés por ser keywords de conventional-commits.

## Outputs

- Rama de trabajo creada o reutilizada con naming válido (GS-004).
- Working tree limpio o decisión documentada del usuario sobre cambios previos.
- Confirmación de sincronización con la rama base por merge (GS-007).
- Anuncio del próximo paso en el flujo ASDD (commit, implementación, etc.).

## Relación con skills y reglas existentes

- `sofka-asdd-git-safety.md` — regla normativa que esta skill aplica: GS-001 (protegidas), GS-002 (historia inmutable), GS-004 (naming), GS-006 (una rama por ciclo), GS-007 (merge no rebase), referencia a GS-008/GS-009 para gates posteriores.
- `sofka-asdd-skill-preflight.md` — provee el espíritu del Paso 0 PRE-FLIGHT; aquí se aplica en variante ligera porque no se crea código fuente.
- `sofka-asdd-tech-lead-commit` — siguiente skill típica del flujo: una vez creada la rama y con cambios staged, prepara y ejecuta el commit con autorización GS-003.
- `sofka-asdd-tech-lead-create-mr` — se invoca al final del ciclo, cuando hay commits y la rama está lista para review.
- `.claude/docs/stabilization-bug-rules.md` — en fase de estabilización exige Scope Declaration antes de tocar archivos; esta skill prepara la rama donde ese scope va a vivir.

## Cuándo NO invocar

- Ya estás en la rama correcta del ciclo en curso y el working tree está limpio — no se crea otra (GS-006). Confirmar y seguir.
- Lo que se necesita es preparar y ejecutar el commit — usar `sofka-asdd-tech-lead-commit`.
- Lo que se necesita es abrir el MR/PR — usar `sofka-asdd-tech-lead-create-mr`.
- El usuario pide "rebase sobre develop" para limpiar historia — la skill rechaza ese pedido y deriva a `sofka-asdd-git-safety.md` (GS-007). Si el usuario insiste, advertir el riesgo antes de ejecutar.

## Anti-patterns

- **Crear rama paralela para el mismo ciclo** — violación directa de GS-006. Hallazgos tardíos van en la misma rama; los reviewers revisan un PR coherente.
- **Saltarse la verificación de working tree limpio** — perder cambios no commiteados al hacer `checkout`. STOP antes y pedir decisión al usuario.
- **Rebase para "limpiar historia"** — abre la puerta a perder código de compañeros en cada conflicto resuelto. GS-007 lo prohíbe explícitamente; usar merge `--no-ff`.
- **Naming sin prefijo o con tildes** — `mi-rama-de-pruebas`, `feature/Configuración`. El validador GS-004 (y el hook de pre-PR GS-009) lo rechazan.
- **Crear rama directamente desde `main`/`develop` sin pull previo** — la rama nace desincronizada y arrastra conflictos. Sincronizar la base antes de derivar.
- **Push automático tras crear la rama** — el push lo decide el usuario (GS-008). Esta skill nunca ejecuta `git push`.
