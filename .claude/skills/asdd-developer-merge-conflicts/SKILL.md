---
name: asdd-developer-merge-conflicts
description: Resuelve conflictos de merge preservando funcionalidad de ambas ramas. Nunca descarta código ni usa -X ours/theirs.
---

# Merge Conflicts — Integración Funcional sin Pérdida

> Resuelve conflictos de merge integrando AMBOS lados. Cero "ours vs theirs" — la regla es "ours + theirs integrados, sin perder funcionalidad de ninguna rama".

## Rol

Operador de resolución de conflictos de merge. Lee los marcadores `<<<<<<<` / `=======` / `>>>>>>>`, entiende qué aportó cada rama, integra ambos lados manualmente y deja el archivo en estado coherente. No decide estrategia de merge ni reescribe historia — actúa sobre conflictos ya materializados por un `git merge`.

## Cuándo activar

Señales:
- Un `git merge --no-ff` dejó archivos en estado conflictuado (`git status` muestra `both modified`)
- El usuario pide "resolver los conflictos", "integrar las dos ramas", "el merge dejó archivos rotos"
- Llega derivado por el orquestador tras detectar conflicto en ORC-011-D (`asdd-orchestration-worktree.md`)

Fase ASDD: **Construir** (estabilización del merge). Aplica también durante sincronización GS-007 (merge `origin/{base}` → feature branch) y en handoff de worktrees (ORC-011-D) cuando aparecen colisiones reales en disco.

## Cuándo NO invocar

- No hay conflicto activo (`git diff --name-only --diff-filter=U` vacío) — no hay nada que resolver.
- La estrategia decidida fue `rebase` — prohibido por GS-007. Volver al orquestador y usar `merge --no-ff`.
- El conflicto está en una migración de base de datos — STOP, escalar al usuario; no se resuelve automáticamente (orden de migraciones requiere decisión humana).
- El orquestador está ejecutando ORC-011-D y necesita un merge **secuencial** del worktree branch — ese paso es responsabilidad del orquestador, no de este skill. Este skill resuelve conflictos a nivel de archivo cuando ya existen; el orquestador decide cuándo mergear.
- La rama destino tiene divergencia arquitectónica real (el otro lado borró módulos enteros que este lado sigue usando) — escalar a `asdd-solution-architect`.

## Proceso

### Paso 0 — PRE-FLIGHT (bloqueante)

Verificar rama dedicada (GS-001 de `asdd-git-safety.md` + `asdd-skill-preflight.md`):

```bash
protected="${ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO: estás en '$branch'. Resolver conflictos en rama dedicada únicamente."
    exit 1
  fi
done
echo "Rama OK: $branch"
```

Si falla → STOP. Conflictos en ramas protegidas son siempre indicador de proceso roto — no continuar.

### Paso 1 — Diagnóstico del estado del merge

```bash
git status
git diff --name-only --diff-filter=U
git rev-parse HEAD MERGE_HEAD 2>/dev/null
```

Publicar en chat:

```
Estado del merge:
- Rama actual (OURS): {branch}
- Rama entrante (THEIRS): {MERGE_HEAD descripción}
- Archivos en conflicto: N
- Lista: [archivos]
```

Si `MERGE_HEAD` no existe → no hay merge activo; este skill no aplica. STOP.

### Paso 2 — Clasificar archivos en conflicto

Categorizar cada archivo según su tipo y aplicar la estrategia correspondiente:

| Tipo de archivo | Estrategia |
|---|---|
| Código de producción (lenguaje del stack) | Integrar imports, declaraciones, funciones, métodos de AMBOS lados |
| Tests | Mantener TODOS los tests de ambos lados; renombrar duplicados con nombres distintos |
| Configuración (yaml, json, properties, toml, env) | Mantener TODAS las propiedades; si la MISMA key tiene valor diferente → STOP y preguntar |
| Migraciones de base de datos | NUNCA resolver automáticamente → STOP y escalar al usuario |
| Documentación | Integrar ambos lados respetando estructura del documento |
| Archivos binarios | STOP — pedir al usuario que decida qué versión queda |

### Paso 3 — Análisis por archivo (antes de tocar nada)

Para CADA archivo en conflicto:

#### 3.1 Leer el archivo completo con los marcadores

Usar `Read` sobre el archivo conflictuado. No saltar este paso aunque el archivo "parezca simple" — el contexto completo es lo que evita pérdidas.

#### 3.2 Entender qué hizo cada rama

```bash
# Commits que OURS aportó al archivo desde el merge-base
git log --oneline $(git merge-base HEAD MERGE_HEAD)..HEAD -- <archivo>

# Commits que THEIRS aportó al archivo desde el merge-base
git log --oneline $(git merge-base HEAD MERGE_HEAD)..MERGE_HEAD -- <archivo>

# Versión BASE (antes de ambas ramas)
git show $(git merge-base HEAD MERGE_HEAD):<archivo>
```

La versión BASE es la referencia para entender qué AGREGÓ cada rama frente al punto común — no qué tiene cada rama "ahora".

#### 3.3 Inventario funcional por bloque de conflicto

Para cada bloque `<<<<<<< ... ======= ... >>>>>>>`, documentar en chat:

| # | Archivo | Línea | OURS (HEAD) aporta | THEIRS aporta | Estrategia |
|---|---|---|---|---|---|
| 1 | `service.{ext}` | 12 | Import de `ValidatorA` | Import de `LoggerB` | Mantener ambos imports |
| 2 | `service.{ext}` | 48 | Validación al inicio del método | Logging al final del método | Integrar: validación al inicio + logging al final |

Reglas:
- Si un lado agrega funcionalidad que el otro no tiene → INCLUIRLA.
- Si ambos lados modifican la misma función → integrar ambas modificaciones respetando la intención de cada una.
- Si hay contradicción lógica real (no textual) → STOP y preguntar al usuario.

### Paso 4 — Resolver con `Edit` por bloque

Por cada bloque de conflicto, reemplazar la región completa (marcadores incluidos) con la versión integrada.

#### Reglas de resolución por tipo de cambio

**Imports / requires / use statements:**
- Mantener TODOS los imports de ambos lados.
- Eliminar duplicados exactos.
- Ordenar según convención del proyecto (`docs/tech/` o `CLAUDE.md` del módulo).

**Declaraciones de dependencias (constructor injection, DI containers, hooks):**
- Mantener TODAS las dependencias de ambos lados en el constructor / factoría / hook.
- Verificar que cada dependencia inyectada SE USA en algún método del archivo (cero dead code).

**Funciones / métodos nuevos:**
- Si OURS agrega `funcA()` y THEIRS agrega `funcB()` → mantener AMBOS.
- Si ambos agregan función con MISMO nombre pero diferente implementación → integrar la lógica de ambos en una sola función coherente.

**Funciones / métodos modificados (mismo símbolo, distintos cambios):**
- Leer la versión BASE para identificar qué agregó cada lado.
- Integrar AMBOS conjuntos de cambios sobre el BASE.
- Si hay contradicción lógica real → STOP y preguntar.

**Interfaces / types / contratos:**
- Mantener TODOS los campos de ambos lados.
- Si un campo cambió de tipo entre OURS y THEIRS → STOP y preguntar.

**Configuración:**
- Mantener TODAS las claves de ambos lados.
- Misma clave con valor distinto → STOP y preguntar.

**Migraciones SQL / scripts de datos:**
- NUNCA resolver automáticamente → STOP y escalar al usuario.

#### Lo que está prohibido (no negociable)

- `git checkout --ours <archivo>` / `git checkout --theirs <archivo>` — descarta un lado.
- `git merge -X ours` / `git merge -X theirs` — descarta un lado.
- `git reset --hard` — destruye trabajo (GS-002).
- Aceptar "Accept Current" o "Accept Incoming" de un IDE sin haber leído el contexto.

### Paso 5 — Verificación post-resolución

#### 5.1 Cero marcadores residuales

```bash
git diff --name-only --diff-filter=U
grep -rnE "^(<{7}|={7}|>{7}) " . --include="*" 2>/dev/null | grep -v ".git/"
```

Ambos comandos deben quedar vacíos. Si aparece algún marcador en un archivo no listado en `--diff-filter=U` → revisar manualmente, puede ser un literal legítimo (raro pero posible).

#### 5.2 Compilación y tests del módulo afectado

Resolver `{build_command}` y `{test_command}` desde `.asdd/testing-capabilities.yaml` (ORC-009 de `asdd-orchestration-tdd.md`). No hardcodear comandos.

```bash
# Lectura del runner del proyecto
cat .asdd/testing-capabilities.yaml 2>/dev/null | head -40
# Ejecutar {build_command} y {test_command} sobre los módulos tocados
```

Publicar resultado:

```
Verificación post-resolución:
- Compilación: ✅/❌
- Tests del módulo: X passed, Y failed
- Marcadores residuales: 0
```

Si compilación o tests fallan → revisar el archivo afectado, NO marcar el merge como resuelto. Aplica la política "Tests fallando — NO aceptar como preexistente" de `asdd-system-integrity.md`.

#### 5.3 Dependent Module Testing

Si la resolución tocó interfaces / contratos públicos, ejecutar los tests de los módulos consumidores (regla de `asdd-system-integrity.md`). Detectar consumidores:

```bash
rg "ClaseTocada|funcionTocada" src/ -l
```

### Paso 6 — Inventario de Funcionalidad Esperada (IFE)

Antes de invocar al validador, generar el IFE — lo que SE ESPERA que esté presente en la resolución:

```markdown
## IFE — Inventario de Funcionalidad Esperada

### OURS (HEAD) — {rama}
Commits incluidos al archivo:
- {hash} {mensaje}
Funcionalidad aportada:
1. [archivo:línea] {descripción funcional}

### THEIRS (incoming) — {rama o MERGE_HEAD}
Commits incluidos al archivo:
- {hash} {mensaje}
Funcionalidad aportada:
1. [archivo:línea] {descripción funcional}
```

El IFE no es opcional. Es la entrada que consume el code review del Paso 7 para auditar pérdidas.

### Paso 7 — Validación obligatoria por `asdd-tech-lead-code-review`

Tras resolver y verificar técnicamente, invocar a `asdd-tech-lead-code-review` con:

- Lista de archivos resueltos
- IFE del Paso 6
- Diff completo (`git diff --staged` tras `git add` de los archivos resueltos)

Tarea del reviewer:
1. Para CADA ítem del IFE, verificar que existe en el código resuelto.
2. Verificar coherencia: cero dead code (imports/dependencias sin uso), flujo lógico sin contradicciones, tests cubren ambos lados.
3. Emitir veredicto:
   - **PASS** — toda funcionalidad de ambas ramas preservada.
   - **FAIL** — listar exactamente QUÉ falta y de QUÉ rama.

Si el veredicto es FAIL → loop de corrección (máximo 2 ciclos según AL-001 de `asdd-anti-loops.md`):

1. Reviewer reporta funcionalidad faltante con `archivo:línea` específico.
2. Corregir el archivo con `Edit`.
3. Re-invocar al reviewer SOLO sobre los ítems que fallaron.
4. Si después de 2 ciclos persiste → STOP y escalar al usuario.

Regla absoluta: el merge no se declara resuelto hasta que el reviewer emita PASS.

### Paso 8 — Cierre

- No ejecutar `git commit` desde este skill (GS-003: commits requieren autorización explícita del usuario).
- Publicar el reporte final (siguiente sección) y devolver el control.
- Si el flujo viene de ORC-011-D (handoff de worktree), retornar al orquestador para que continúe el merge secuencial.

## Outputs

- Archivos en conflicto resueltos en disco.
- Reporte de resolución:

```markdown
## Merge Conflict Resolution Report

### Estado del Merge
- Rama actual (OURS): {branch}
- Rama entrante (THEIRS): {referencia}
- Archivos en conflicto: N

### Resolución por archivo
| Archivo | Bloques | Estrategia | Compilación | Tests del módulo |
|---|---|---|---|---|
| `path/a.{ext}` | 3 | Integración completa | ✅ | ✅ |

### IFE — Funcionalidad preservada
| Archivo | De OURS | De THEIRS | Integrado |
|---|---|---|---|
| `path/a.{ext}` | {descripción} | {descripción} | ✅ |

### Validación `asdd-tech-lead-code-review`
- Veredicto: ✅ PASS / ❌ FAIL
- Ciclos de corrección: 0–2

### Decisiones manuales escaladas al usuario
| Archivo | Línea | Razón |
|---|---|---|

### Verificación final
- [ ] Cero marcadores residuales
- [ ] {build_command} verde
- [ ] {test_command} verde
- [ ] Dependent Module Testing ejecutado
- [ ] Code review PASS

### Resultado: ✅ RESUELTO — funcionalidad preservada / ⚠ REQUIERE DECISIÓN MANUAL
```

- Sin commits, sin push, sin MR — siguientes pasos quedan a cargo del usuario o de `asdd-tech-lead-create-mr`.

## Relación con skills y reglas existentes

- `asdd-orchestration-worktree.md` (ORC-011-A, ORC-011-D) → el orquestador decide **cuándo** y **en qué orden** mergear worktrees, y aplica `merge --no-ff`. Este skill es la herramienta que se invoca **dentro** de ese flujo cuando el merge deja conflictos a nivel de archivo. ORC-011 es coordinación de merges; este skill es resolución manual de conflictos. No se solapan.
- `asdd-git-safety.md` (GS-007) → prohíbe rebase; obliga a `merge --no-ff`. Este skill nace de esa decisión y nunca cambia la estrategia de merge.
- `asdd-git-safety.md` (GS-001) → ramas protegidas bloqueadas. PRE-FLIGHT del Paso 0 lo verifica.
- `asdd-git-safety.md` (GS-002) → prohíbe `reset --hard` y similares durante la resolución.
- `asdd-git-safety.md` (GS-003) → este skill nunca commitea; el commit es decisión del usuario.
- `asdd-tech-lead-code-review` → valida el IFE en el Paso 7. Es bloqueante: sin PASS no se declara resuelto.
- `asdd-system-integrity.md` → exige compilación y tests verdes; Dependent Module Testing al tocar interfaces; "tests fallando NO se aceptan como preexistentes".
- `asdd-anti-loops.md` (AL-001) → máximo 2 ciclos de corrección con el reviewer antes de escalar.
- `asdd-orchestration-tdd.md` (ORC-009) → resolución de `{build_command}` y `{test_command}` vía `.asdd/testing-capabilities.yaml`.
- `asdd-skill-preflight.md` → bloque Paso 0 obligatorio.
- `asdd-developer-bug-fix`, `asdd-developer-feature` → son flujos de implementación; este skill es flujo de integración post-merge. No se invocan entre sí, pero pueden encadenarse si la resolución revela bugs reales (en cuyo caso el usuario decide abrir un fix aparte).
- `asdd-tech-lead-create-mr` → genera el MR cuando el merge ya quedó limpio. Este skill no crea MRs.

## Anti-patterns

- **Elegir un lado descartando el otro** — "Accept Current" / "Accept Incoming" / `-X ours` / `-X theirs` sin leer ambos cambios. Prohibido por la regla central del skill y GS-007.
- **Resolver por similitud textual sin entender funcionalidad** — el diff textual engaña: dos líneas parecidas pueden representar intenciones distintas. Leer ambos commits es obligatorio.
- **Perder imports / dependencias / declaraciones** — cada side aporta lo suyo; integrar TODO o documentar por qué se descarta uno específico.
- **Resolver y no compilar** — sin verificación técnica el merge queda en "parece bien". Compilar + tests del módulo es bloqueante (Paso 5).
- **Resolver migraciones SQL automáticamente** — el orden de migraciones es decisión humana. STOP y escalar.
- **Saltar el code review** — el Paso 7 es la salvaguarda contra pérdida de funcionalidad. Sin PASS del `asdd-tech-lead-code-review`, el merge no está resuelto.
- **Loop infinito con el reviewer** — máximo 2 ciclos (AL-001). Tercer FAIL → escalar al usuario, no insistir.
- **Commitear desde el skill** — GS-003 exige autorización explícita del usuario. Este skill resuelve y reporta; el commit es decisión humana.
