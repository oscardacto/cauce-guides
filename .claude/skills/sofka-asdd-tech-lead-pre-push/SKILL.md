---
name: sofka-asdd-tech-lead-pre-push
description: Gate pre-push — sync con la base, build limpio y tests verdes; produce el marcador GS-008 que habilita el push.
---

# sofka-asdd-tech-lead-pre-push

> Valida que la rama está sincronizada con su base, que la compilación es limpia y que los tests del proyecto pasan. Si todo va verde, escribe el marcador `.claude/.prepush-validated` que el hook `sofka-asdd-pre-push-gate.mjs` consume para permitir el push (GS-008). No ejecuta el push, no crea el MR, no commitea.

## Rol

Guardián del gate pre-push. Aplica las reglas de integridad del sistema (`sofka-asdd-system-integrity.md`) y de seguridad git (GS-001, GS-007, GS-008) antes de habilitar el push de una rama de trabajo. Es de uso transversal — el runner de build/test viene del proyecto consumidor vía `.sofka-asdd/testing-capabilities.yaml`, no se hardcodea.

## Cuándo activar

- El usuario pide "valida antes de pushear", "corre el pre-push", "habilita el marcador GS-008".
- Al cerrar una iteración de implementación o de ajustes post-review y antes de invocar `sofka-asdd-tech-lead-create-mr`.
- Tras resolver hallazgos del code review (`sofka-asdd-tech-lead-code-review`) o del quality gate (`sofka-asdd-tech-lead-quality-gate`) en la misma rama.
- Fases ASDD: **Construir** (cierre de tareas), **Verificar** (cierre de ajustes post-QA).

## Diferenciación con skills hermanas

- `sofka-asdd-tech-lead-pre-push` (esta): valida build + tests + produce el marcador GS-008. No commitea, no pushea, no crea MR.
- `sofka-asdd-tech-lead-commit`: prepara y ejecuta el commit con autorización GS-003.
- `sofka-asdd-tech-lead-create-mr`: crea el MR/PR una vez que la rama está pusheada.
- El hook `sofka-asdd-pre-push-gate.mjs` (GS-008) **consume** el marcador que esta skill produce; no lo crea por sí solo.

## Paso 0 — PRE-FLIGHT (obligatorio)

Verificación de rama protegida según `sofka-asdd-skill-preflight.md` y `sofka-asdd-git-safety.md` (GS-001). La skill no escribe código fuente, pero sí ejecuta merge contra la base y escribe el marcador — corresponde validar la rama antes de cualquier operación:

```bash
protected="${SOFKA_ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO (GS-001): estás en '$branch'. Crear rama dedicada antes del pre-push."
    echo "Sugerencia: git checkout -b feat/<descripción>"
    exit 1
  fi
done
echo "Rama OK: $branch"
```

## Detección inicial (un solo Bash call)

Identificar rama, base, archivos modificados y si los cambios son solo de configuración/documentación (fast-track GS-008):

```bash
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
# Resolver la rama de INTEGRACIÓN (de la que sale/a la que vuelve la feature). NUNCA asumir main.
# El equipo declara su integración con SOFKA_ASDD_BASE_BRANCH; si no, se prefiere dev/develop sobre main.
base="${SOFKA_ASDD_BASE_BRANCH:-}"
if [ -z "$base" ]; then
  for b in dev develop main master; do
    git rev-parse --verify "origin/$b" >/dev/null 2>&1 && { base="$b"; break; }
  done
  base="${base:-main}"
fi

uncommitted=$(git status --porcelain 2>/dev/null | head -5)
behind=$(git rev-list --count "HEAD..origin/$base" 2>/dev/null || echo "0")
ahead=$(git rev-list --count "origin/$base..HEAD" 2>/dev/null || echo "0")
changed=$(git diff --name-only "origin/$base...HEAD" 2>/dev/null || echo "")

# Extensiones de código fuente — alineadas con GS-008 (SOFKA_ASDD_SOURCE_EXTS)
source_exts="${SOFKA_ASDD_SOURCE_EXTS:-ts,tsx,js,jsx,py,java,go,rb,kt,cs,php,rs,scala,swift,c,cc,cpp,h,hpp}"
type="config-only"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ext="${f##*.}"
  if [[ ",$source_exts," == *",$ext,"* ]]; then type="code"; break; fi
done <<< "$changed"

echo "---DETECTION---"
echo "branch=$branch"
echo "base=$base"
echo "behind=$behind"
echo "ahead=$ahead"
echo "uncommitted=${uncommitted:-none}"
echo "type=$type"
echo "---FILES---"
echo "$changed"
echo "---END---"
```

Interpretación inmediata:

- `branch` coincide con una rama protegida → ya bloqueó el PRE-FLIGHT (GS-001).
- `uncommitted` distinto de `none` → avisar al usuario; el push solo sube lo commiteado. Decidir si commitear (vía `sofka-asdd-tech-lead-commit`) antes de seguir.
- `ahead == 0` → no hay commits que pushear; STOP.
- `behind > 0` → la base avanzó; pasar a "Sincronización con base".
- `type == config-only` → fast-track (sin build ni tests, alineado con GS-008).
- `type == code` → ejecutar build + tests.

## Sincronización con la base (solo si `behind > 0`)

Regla absoluta GS-007: **merge, nunca rebase**. El rebase ha causado pérdida de código en ramas con conflictos por commit; el merge resuelve los conflictos en un solo punto y preserva la historia auditable.

```bash
git fetch origin "$base" 2>&1 | tail -5
git merge --no-ff "origin/$base" 2>&1 | tail -30
```

Resultados:

- **Merge limpio** → continuar a la siguiente fase.
- **Conflictos** (`CONFLICT (...)` o `Automatic merge failed`):
  1. **STOP**. No ejecutar `git merge --abort` automáticamente.
  2. Listar archivos: `git diff --name-only --diff-filter=U`.
  3. Reportar al usuario los archivos en conflicto y pedir resolución manual.
  4. Prohibido `-X ours`, `-X theirs`, `git checkout --ours/--theirs` automáticos (GS-007).
  5. Tras resolver y commitear el merge, re-invocar la skill desde el inicio.

Tras un merge exitoso, recomputar `changed` desde `origin/$base...HEAD` — si nuevos módulos entran al diff por código que venía de la base, deben validarse igual (`sofka-asdd-system-integrity.md`: tests de módulos consumidores).

## Fast-track config-only (solo si `type == config-only` y sync OK)

Cambios exclusivamente fuera de extensiones de código fuente (configuración, documentación, assets). GS-008 lo permite sin build ni tests:

- Emitir reporte fast-track (ver sección "Reporte").
- Saltar a "Escritura del marcador GS-008".

## Validación de build y tests (si `type == code`)

Resolver runner desde `.sofka-asdd/testing-capabilities.yaml` (ORC-009). La skill no asume stack — lee `{test_command}`, `{build_command}` y el campo opcional `{scoped_command}` declarados por el proyecto consumidor.

```bash
caps=".sofka-asdd/testing-capabilities.yaml"
if [ ! -f "$caps" ]; then
  echo "BLOQUEADO: falta $caps. El proyecto debe declarar testing-capabilities antes del pre-push."
  exit 1
fi

# Extraer comandos sin depender de un parser YAML específico
build_cmd=$(grep -E '^[[:space:]]*build_command:' "$caps" | head -1 | sed -E 's/^[^:]+:[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/')
test_cmd=$(grep -E '^[[:space:]]*test_command:' "$caps"  | head -1 | sed -E 's/^[^:]+:[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/')
scoped_cmd=$(grep -E '^[[:space:]]*scoped_command:' "$caps" | head -1 | sed -E 's/^[^:]+:[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/')
echo "build_command=$build_cmd"
echo "test_command=$test_cmd"
echo "scoped_command=${scoped_cmd:-<no definido>}"
```

### Ejecución de tests: scoped vs. suite completa

Si `scoped_command` está definido y no vacío en `testing-capabilities.yaml`, la skill ejecuta solo la suite del módulo afectado (modo scoped). Pasos:

1. Derivar el conjunto de módulos tocados desde el diff:

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
   # Tomar los 1-2 primeros segmentos de path de los archivos modificados como módulo
   module=$(git diff --name-only "origin/$base...HEAD" 2>/dev/null \
     | grep -v '^$' \
     | sed -E 's|^([^/]+/[^/]+)/.*|\1|; s|^([^/]+)$|\1|' \
     | sort -u | tr '\n' ' ' | xargs)
   echo "module=$module"
   ```

   Limitación conocida: la derivación de módulo usa los primeros 1-2 segmentos del path. Es una heurística simple suficiente para monorepos con estructura `{capa}/{módulo}/`. Para proyectos con layouts distintos, ajustar o usar el `command` completo configurando `scoped_command` vacío.

2. Interpolar `{module}` en `scoped_command` y ejecutar:

   ```bash
   effective_test_cmd="${scoped_cmd//\{module\}/$module}"
   echo "Ejecutando suite scoped: $effective_test_cmd"
   eval "$effective_test_cmd" 2>&1 | tail -60
   ```

3. **Fallback automático**: si `scoped_command` está ausente o vacío, ejecutar la suite completa con `{test_command}`. Sin cambios de comportamiento respecto al estado anterior.

   ```bash
   # Fallback: scoped_cmd vacío → suite completa
   echo "scoped_command no definido — ejecutando suite completa"
   eval "$test_cmd" 2>&1 | tail -60
   ```

### Build limpio (`sofka-asdd-system-integrity.md`)

Ejecutar antes de los tests. Si el proyecto declara `build_command` no vacío:

```bash
eval "$build_cmd" 2>&1 | tail -40
```

- Build con errores → **BLOQUEADO**. Reportar archivos:línea de los errores; corregir y re-invocar la skill.
- Sin `build_command` declarado → omitir y anotarlo en el reporte.

### Tests verdes

Ver la sección anterior "Ejecución de tests: scoped vs. suite completa". El comando efectivo es el resultado de la lógica scoped (o el fallback completo). En ambos casos:

- Cualquier test fallido → **BLOQUEADO**. Regla `sofka-asdd-system-integrity.md`: tests fallidos no se aceptan como "preexistentes" — se arreglan. Si el fix excede el alcance, escalar a `sofka-asdd-tech-lead` con skill `code-review` o `refactoring-plan`.
- Tests flaky confirmados → documentar, escalar; no producir marcador hasta acordar excepción explícita con el usuario.

### Anti-loop (`sofka-asdd-anti-loops.md`)

- Tests se ejecutan **una sola vez** por iteración (AL-005).
- Si build falla dos veces seguidas con el mismo error → STOP y analizar causa raíz (AL-006).
- Máximo 2 intentos de corrección por iteración; al tercero, escalar al usuario (AL-001).

## Reporte

Reporte completo (build + tests):

```markdown
## Pre-Push Validation Report

Rama: `{branch}` → base: `origin/{base}`
Commits pendientes de push: {ahead}

### Sync con base
| Check | Estado | Detalles |
|---|---|---|
| Fetch + estado | ✅ | behind={N}, ahead={M} |
| Merge --no-ff origin/{base} | ✅ / N/A | {conflicts si los hubo} |

### Build
| Check | Estado | Detalles |
|---|---|---|
| {build_command} | ✅ / ❌ / N/A | {resumen} |

### Tests
| Check | Estado | Detalles |
|---|---|---|
| {test_command} | ✅ / ❌ | {X passed, Y failed} |

Resultado: ✅ READY (marcador GS-008 escrito) | ❌ BLOCKED — FIX REQUIRED
```

Reporte fast-track (config-only):

```markdown
## Pre-Push Validation Report — Fast Track (config-only)

Rama: `{branch}` → base: `origin/{base}`
Commits pendientes de push: {ahead}

| Check | Estado |
|---|---|
| Sin archivos de código fuente modificados | ✅ |
| Sync con base | ✅ / N/A |

Resultado: ✅ READY (marcador GS-008 escrito, fast-track) — el hook GS-008 lo aceptará sin build/tests.
```

## Escritura del marcador GS-008

Solo si el resultado es `READY`. **Ubicación estable (B5 — Bug B, repos anidados)**:
el marcador se escribe SIEMPRE en `CLAUDE_PROJECT_DIR/.claude/`, nunca en
`process.cwd()` de la skill. Razón: el hook `sofka-asdd-pre-push-gate.mjs`
resuelve el repo EFECTIVO del comando `git push` (parseando `cd X &&` / `git -C X`)
para evaluar rama y diff, pero busca el marcador en `CLAUDE_PROJECT_DIR/.claude/`
porque un sub-repo anidado puede no tener su propio directorio `.claude/`.
Si la skill escribiera el marcador en `process.cwd()` de un sub-repo, el hook
nunca lo encontraría — desalineación silenciosa documentada en el bug.

El marcador se escribe **atado al commit validado**: `{ ts, head }`. Un marcador
con formato legado (solo timestamp) sigue siendo aceptado por compatibilidad,
pero no puede atarse a un commit, así que un marcador vigente habilitaría el
push de un commit posterior que nadie validó.

```bash
node -e "
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const marker = path.join(root, '.claude', '.prepush-validated');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
fs.mkdirSync(path.dirname(marker), { recursive: true });
fs.writeFileSync(marker, JSON.stringify({ ts: Math.floor(Date.now() / 1000), head }));
console.log('Marker written:', marker, 'head:', head.slice(0, 8));
"
```

Notas operativas alineadas con GS-008:

- El marcador vale para **ese** commit. Si se commitea algo más después de
  validar, hay que re-invocar la skill: el hook nativo `pre-push` compara el
  `head` del marcador con el commit que se está pusheando y bloquea si difieren.
- Si el proyecto declara `testing.runner.command` en
  `.sofka-asdd/testing-capabilities.yaml`, exportar `SOFKA_ASDD_PREPUSH_RUN_TESTS=1`
  hace que el hook nativo **corra la suite él mismo** en vez de confiar en el
  marcador. Es la única forma de que GS-008 deje de ser una declaración del
  agente y pase a ser una verificación.

- El marcador caduca según `SOFKA_ASDD_PUSH_GATE_TTL` (default 10 minutos). Si pasa más tiempo entre validación y push, re-invocar la skill.
- El hook `sofka-asdd-pre-push-gate.mjs` **consume** el marcador (no se reutiliza entre pushes). Cada push requiere una validación nueva.
- Si el push falla en el hook (TTL vencido o marcador ausente) → re-invocar esta skill, no usar el escape hatch `SOFKA_ASDD_GUARD_PUSH_DISABLE=1` sin autorización explícita del maintainer.
- En arquitecturas multi-repo (root-config + sub-repos anidados), esta skill debe correr con `CLAUDE_PROJECT_DIR` apuntando al repo de configuración estable — no al sub-repo donde el usuario trabaja — para que el marcador termine en la misma ubicación que el hook consulta.

## Cierre y siguientes pasos

Tras escribir el marcador, anunciar:

```markdown
## ✅ Marcador GS-008 escrito

- Rama: `{branch}`
- Validaciones: build {OK/N/A}, tests {OK/N/A}, sync {OK/N/A}
- TTL del marcador: respeta `SOFKA_ASDD_PUSH_GATE_TTL`

### Siguiente paso (manual)
- El usuario ejecuta `git push -u origin {branch}` cuando lo decida.
- El hook GS-008 consume el marcador automáticamente.
- La skill `sofka-asdd-tech-lead-pre-push` **no** ejecuta el push (separación de responsabilidades: producir el marcador vs. emitir el push).
```

## Verificación de reglas aplicadas

| Regla | Verificación en el flujo |
|---|---|
| GS-001 ramas protegidas | PRE-FLIGHT bloquea si la rama es protegida |
| GS-007 merge, nunca rebase | Sync con base siempre usa `git merge --no-ff` |
| GS-008 marcador + TTL + fast-track | La skill produce el marcador con la ruta y formato exactos |
| `sofka-asdd-system-integrity.md` | Build limpio + tests verdes antes del marcador |
| ORC-009 (TDD forwarding) | El runner viene de `.sofka-asdd/testing-capabilities.yaml`, sin hardcodear stack |
| AL-001 / AL-005 / AL-006 (anti-loops) | Tests una sola vez; máx 2 intentos; escalar si persiste |

## Outputs

- Reporte de validación en el chat (formato completo o fast-track).
- Marcador `.claude/.prepush-validated` con timestamp Unix, solo si el resultado es READY.
- Estado de la rama: sincronizada con la base (si aplicó merge) y lista para push manual.

## Relación con skills y reglas existentes

- `sofka-asdd-tech-lead-commit`: precede a esta skill — los cambios deben estar commiteados antes de validar el pre-push.
- `sofka-asdd-tech-lead-create-mr`: sucede a esta skill — una vez el push manual termina, el MR se crea sobre la rama pusheada.
- `sofka-asdd-tech-lead-code-review` / `sofka-asdd-tech-lead-quality-gate`: producen hallazgos que se commitean en la misma rama (GS-006) antes de re-invocar el pre-push.
- Reglas: `sofka-asdd-git-safety.md` (GS-001, GS-007, GS-008), `sofka-asdd-system-integrity.md`, `sofka-asdd-anti-loops.md` (AL-001, AL-005, AL-006), `sofka-asdd-skill-preflight.md`, ORC-009 (`sofka-asdd-orchestration-tdd.md`).

## Cuándo NO invocar

- La rama actual es protegida (GS-001) → el PRE-FLIGHT aborta; crear una feature branch primero.
- No hay commits propios (`ahead == 0`) → no hay nada que validar; revisar si falta commitear.
- El usuario quiere validar **sin** producir el marcador (auditoría exploratoria) → ejecutar build/tests con `sofka-asdd-tech-lead-quality-gate`; no escribir el marcador.
- El proyecto no declara `testing-capabilities.yaml` → STOP y pedir a `sofka-asdd-devops-engineer` (skill `pipeline` o `testing`) que lo configure (ORC-009).
- El push debe forzarse (`--force` / `--force-with-lease`) por una razón válida → la skill no cubre force push; escalar al maintainer (GS-002).

## Anti-patterns

- **Saltarse el sync con la base** — "voy a pushear directo, después resuelvo conflictos en el remoto". GS-007 exige merge local; los conflictos en el remoto suelen terminar en pérdida de código.
- **Rebase para sincronizar** — `git pull --rebase` o `git rebase origin/{base}`. Prohibido por GS-007; usar siempre `git merge --no-ff`.
- **Marcador sin tests verdes** — escribir `.claude/.prepush-validated` cuando los tests fallan. El hook GS-008 lo aceptará, pero rompe `sofka-asdd-system-integrity.md` y daña al equipo.
- **Hardcodear el runner** — escribir comandos literales del stack del proyecto (gestor de paquetes, framework de tests) dentro de la skill. El runner se lee de `testing-capabilities.yaml` (ORC-009); cada proyecto consumidor declara el suyo.
- **Tests fallidos reportados como "preexistentes"** — `sofka-asdd-system-integrity.md` lo prohíbe. Se arreglan en la misma rama o se escala explícitamente, nunca se pushean.
- **Force push automático tras fallo** — si el push no es fast-forward, STOP y reportar; nunca aplicar `--force` ni `--force-with-lease` sin autorización (GS-002).
- **Producir el marcador y luego pushear desde la skill** — la skill **solo** produce el marcador. El push es decisión del usuario; mezclar ambos viola la separación de responsabilidades entre las skills hermanas.
- **Reutilizar un marcador vencido** — el TTL existe por algo. Si pasaron más minutos que el TTL entre validación y push, re-validar; no extender el TTL para "ahorrar tiempo".
