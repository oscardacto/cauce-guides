---
name: asdd-tech-lead-commit
description: Commits conventional con verificación de rama protegida (GS-001) y autorización explícita del usuario (GS-003).
---

# asdd-tech-lead-commit

> Prepara el mensaje del commit, verifica salvaguardas git y ejecuta `git commit` solo tras aprobación explícita del usuario. Auto-detecta si la rama tiene una spec ASDD asociada y enriquece el mensaje con trazabilidad de fases.

## Rol

Preparador y ejecutor de commits. No escribe código de producción — produce el artefacto de historia git con mensaje convencional, trazable y limpio.

## Cuándo activar

- El usuario pide "commit", "haz el commit", "prepara el commit", "commitea los cambios"
- Al cerrar un paso de implementación dentro de una feature, fix o refactor
- Antes de pedir un MR/PR (la skill `asdd-tech-lead-create-mr` requiere commits previos)
- Fases ASDD: **Construir** (commits incrementales), **Verificar** (commits de ajustes post-QA), **Documentar** (commits de docs)

## Diferenciación con skills hermanas

- `asdd-tech-lead-commit` (esta): prepara y ejecuta **el commit** (mensaje convencional + autorización GS-003)
- `asdd-tech-lead-create-mr`: crea el **MR/PR** una vez que hay commits y rama lista para review

Una skill cierra el ciclo del commit, la otra cierra el ciclo de entrega. No se sustituyen ni se invocan juntas en el mismo turno.

## Paso 0 — PRE-FLIGHT (obligatorio antes de cualquier acción)

Verificación de rama protegida según `asdd-skill-preflight.md` y `asdd-git-safety.md` (GS-001):

```bash
protected="${ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO (GS-001): estás en '$branch'. Crear rama dedicada antes de commitear."
    echo "Sugerencia: git checkout -b feat/<descripción>"
    exit 1
  fi
done
echo "Rama OK: $branch"
```

Validación adicional de naming (GS-004): la rama debe llevar prefijo GitFlow válido (`feature/`, `fix/`, `hotfix/`, `chore/`, `refactor/`, `test/`, `docs/`). Si la rama está bien creada pero el prefijo no aparece, avisar al usuario antes de continuar.

## Reglas comunes (modo simple y extendido)

- **NUNCA** ejecutar `git push` — eso lo decide el usuario (GS-008 maneja el gate pre-push).
- **NUNCA** `--no-verify`, `--amend` ni saltarse hooks (GS-003).
- **NUNCA** incluir `.env*`, `credentials`, claves o tokens en el diff. Si aparecen → abortar y avisar.
- **Privacidad** (`asdd-memory-privacy.md`): si el diff contiene PII, identidades reales, hosts de producción o tokens → abortar.
- Preferir `git add` específico sobre `git add .` o `git add -A`.
- Si un pre-commit hook falla → corregir y crear un commit **nuevo**, no `--amend`.
- **Autorización EXPLÍCITA** del usuario es bloqueante (GS-003), y llega por uno de dos caminos:
  - **Ya está vigente** cuando el usuario ordenó el commit en su propio mensaje (modo `intent`). El hook lo anuncia con el recordatorio `GS-003 — Autorización de commit YA vigente`. Ahí **no emitas challenge ni pidas un `ok` adicional**: el usuario ya lo ordenó, y volver a preguntar es exactamente la fricción que ese modo elimina.
  - **Hay que pedirla** en cualquier otro caso: emitís el challenge y esperás. Vale cualquier afirmación explícita — el runtime clasifica por raíz, no contra una lista cerrada de palabras (`.claude/scripts/lib/asdd-approval-intent-lib.mjs`, ORC-010-E). Una corrección ("ok pero…") no es una aprobación.
- En **ambos** casos seguís obligado a mostrar el mensaje completo y la lista exacta de archivos antes de ejecutar: el modo `intent` elimina la espera, no la transparencia.
- Idioma: subject y cuerpo en español (`.claude/docs/clean-code-solid.md`). Los tipos `feat`/`fix`/`refactor`/etc. permanecen en inglés por ser keywords de conventional-commits (GS-005).
- **PROHIBIDO** incluir `Co-Authored-By: Claude` ni cualquier atribución a herramientas de IA (alineado con `asdd-tech-lead-create-mr`).

## Subject convencional (GS-005)

Formato: `<type>(<scope>): <subject imperativo en español ≤72 chars>`

Tipos válidos: `feat`, `fix`, `refactor`, `test`, `style`, `chore`, `docs`, `ci`, `perf`, `revert`.

Ejemplos válidos:

- `feat(auth): agregar verificación de token expirado`
- `fix(payments): corregir cálculo de comisión negativa`
- `refactor(domain): extraer regla de descuento a value object`
- `chore(claude): actualizar reglas de routing ASDD`

Ejemplos inválidos:

- `feat(auth): add expired token check` — subject en inglés
- `Update files` — sin tipo convencional
- `feat: cambios` — subject genérico, sin valor para el reviewer

## Proceso (modo simple — sin spec ASDD asociada)

Aplica a commits intermedios, fix puntual, ajuste de tests, cambio de configuración o documentación.

1. Ejecutar `git status` y `git diff --staged` (o `git diff` si no hay staged).
2. Si no hay nada en staged → mostrar unstaged y preguntar qué incluir.
3. Verificar diff contra reglas comunes (secrets, PII, archivos sospechosos).
4. Construir mensaje:

   ```text
   <type>(<scope>): <subject>

   <Cuerpo opcional 1-3 líneas explicando el "por qué" si no es obvio del subject>
   ```

5. Mostrar al usuario:
   - Archivos a incluir (lista explícita)
   - Mensaje propuesto completo
   - Avisos detectados (si aplica)
6. **Autorización**: si el modo `intent` ya la dejó vigente, seguí de largo. Si no, esperar aprobación explícita.
7. Ejecutar con HEREDOC:

   ```bash
   git commit -m "$(cat <<'EOF'
   <mensaje completo>
   EOF
   )"
   ```

## Proceso (modo extendido — con spec ASDD)

Aplica al commit que cierra un paso significativo trazable a una spec en `docs/specs/{feature}-{NNN}.md` o a una fase ASDD registrada en `.asdd-run.json`.

### Detección

1. `git branch --show-current` → rama actual.
2. `Glob` sobre `docs/specs/*<feature>*.md` y `docs/specs/brief-*.md` buscando coincidencia con el nombre de rama o el WI referenciado.
3. Si existe `.asdd-run.json` → leerlo para identificar fase actual, run_id y artefactos producidos.
4. Si nada coincide → caer a modo simple.

### Recolección selectiva de contexto

De la spec (con `Grep` por sección, no leer el archivo completo):

- Problema o necesidad atendida
- Criterios de aceptación tocados (IDs `AC-NNN`)
- Reglas de negocio implicadas (IDs `RN-NNN`)
- Casos de uso afectados (IDs `CU-NNN`)

De la conversación actual (no re-ejecutar comandos):

- Resultado del test runner del proyecto (referenciar `{test_command}` registrado en `.asdd/testing-capabilities.yaml`, ORC-009)
- Veredicto de quality gate previo si hubo (`docs/tech/quality-gate-*.md`)
- Veredicto de code review (`docs/tech/review-*.md`)
- Hallazgos surgidos durante la revisión que se commitean en la misma rama (GS-006)

De `git`:

- `git diff --stat <base>...HEAD` → tabla de archivos modificados
- `git log <base>..HEAD --oneline` → listado de commits intermedios si la rama tiene historia previa

### Plantilla del mensaje extendido

```text
<type>(<scope>): <subject ≤72 chars>

Spec: docs/specs/<archivo>.md | Fase ASDD: <Construir|Verificar|Documentar> | Riesgo regresión: <low|medium|high>

## Contexto
<2-5 líneas: problema o necesidad atendida, extraído de la spec>

## Root cause
<2-4 líneas técnicas — incluir SOLO si type=fix>

## Cambios aplicados
1. <cambio 1>
2. <cambio 2>
...

## Archivos modificados
| Archivo | Cambio |
|---|---|
<una fila por archivo del diff --stat>

## Validaciones ejecutadas
- [x] {test_command} pasa sin regresiones
- [x] Build limpio
- [x] Linter sin errores nuevos
- [x] Quality gate del proyecto cumplido (si aplica)

## Trazabilidad
- Criterios de aceptación cubiertos: <AC-NNN, ...>
- Reglas de negocio aplicadas: <RN-NNN, ...>
- Casos de uso: <CU-NNN, ...>

## Tareas de seguimiento (NO en este commit)
- [ ] <follow-up 1>

## Compatibilidad
- Contratos API: <sin cambios | detalle>
- Migraciones / datos: <sin cambios | detalle>
- Auth / PII: <sin cambios | detalle>

## Commits intermedios en la rama
- <hash> <subject>
```

### Reglas del modo extendido

- **Riesgo de regresión** se infiere de la matriz de impacto:
  - `low` — 1 módulo, ≤3 archivos, sin cambios de contrato
  - `medium` — 2-3 módulos o cambios en código compartido
  - `high` — cambios cross-cutting, migraciones, auth, contratos públicos
- **Validaciones**: solo marcar `[x]` lo que se ejecutó realmente en esta sesión. Si no se corrió, omitir la línea (no inventar).
- **Trazabilidad**: si la spec tiene criterios de aceptación y el commit no cubre ninguno → avisar al usuario, no commitear hasta resolver.
- **Follow-ups**: extraer de hallazgos del code review o quality gate que se posponen explícitamente.
- **No inventar números**: si un dato no está disponible, omitir la línea correspondiente.

### Ejecución modo extendido

1. Detectar spec + fase ASDD activa.
2. Recolectar contexto vía Grep selectivo + estado de la conversación + git.
3. Construir mensaje con la plantilla.
4. Mostrar el mensaje completo al usuario en el chat (no solo el subject).
5. Listar archivos a incluir y avisos.
6. **Autorización**: vigente por modo `intent` → seguir; si no, esperar aprobación EXPLÍCITA.
7. Ejecutar con HEREDOC.
8. Tras commit exitoso: `git status` para confirmar y recordar: el push se hace cuando el usuario lo autorice, no automáticamente (GS-008).

## Verificación de seguridad git aplicada

| Regla | Verificación en el flujo |
|---|---|
| GS-001 ramas protegidas | Paso 0 PRE-FLIGHT bloquea antes de empezar |
| GS-003 commits requieren autorización | Autorización explícita vigente antes del HEREDOC: emitida por el challenge, o ya presente si el usuario ordenó el commit (modo `intent`) |
| GS-004 naming GitFlow | Aviso si la rama no tiene prefijo válido |
| GS-005 conventional commits | Subject forzado a tipo + scope + descripción imperativa |
| GS-006 una rama por ciclo | El commit se hace en la rama actual; no se crean ramas paralelas |

## Outputs

- Un commit con mensaje convencional aplicado a la rama actual
- Mensaje del commit visible al usuario antes y después de la ejecución
- Confirmación de `git status` post-commit con el siguiente paso sugerido (push o continuar trabajo)

## Relación con skills y reglas existentes

- `asdd-tech-lead-create-mr`: se invoca **después** de uno o varios commits para abrir el MR/PR
- `asdd-tech-lead-code-review`: produce el reporte de review que el modo extendido cita como "veredicto"
- `asdd-tech-lead-quality-gate`: produce el quality gate que el modo extendido cita como validación
- Regla `asdd-git-safety.md`: define GS-001 a GS-009; esta skill aplica GS-001, GS-003, GS-004, GS-005, GS-006
- Regla `.claude/docs/clean-code-solid.md`: define idioma de commits (subject + cuerpo en español)
- Regla `asdd-skill-preflight.md`: provee el bloque PRE-FLIGHT del Paso 0

## Cuándo NO invocar

- Estás en rama protegida (GS-001) → PRE-FLIGHT aborta; crear feature branch primero.
- No hay cambios en el working tree (`git status` limpio) → no hay nada que commitear.
- El usuario pidió crear el MR/PR sin haber commiteado → invocar `asdd-tech-lead-create-mr` falla porque no hay commits; commitear primero.
- El cambio contiene secrets o datos sensibles → abortar y reportar; no es escenario de commit.

## Anti-patterns

- **Commit sin mostrar mensaje al usuario** — la autorización GS-003 exige que el usuario vea exactamente qué se va a commitear antes de aprobar.
- **Inventar resultados de validaciones** — marcar `[x] tests pasan` sin haber ejecutado el test runner en la sesión. Si no se corrió, se omite la línea.
- **Mensaje en inglés** — `feat(auth): add token validation`. El subject va en español; solo el tipo es keyword en inglés.
- **`git add .` indiscriminado** — incluye archivos no relacionados con el cambio. Preferir lista explícita.
- **Atribución de IA** — `Co-Authored-By: Claude` o variantes. Prohibido en commits, igual que en MRs (alineado con `asdd-tech-lead-create-mr`).
- **Saltarse el PRE-FLIGHT** — "es un cambio chiquito, commiteo directo en main". GS-001 no admite excepciones.
- **Subject genérico** — `chore: cambios varios` o `fix: ajustes`. Cada commit debe ser trazable a un cambio concreto.
