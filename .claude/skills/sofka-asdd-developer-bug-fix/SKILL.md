---
name: sofka-asdd-developer-bug-fix
description: Corrección quirúrgica de bugs — diagnóstico con evidencia archivo:línea, test que falla primero, fix mínimo, sin regresiones.
---

# Bug Fix — Flujo Quirúrgico de Estabilización

> Orquesta el ciclo completo de un bug acotado: diagnóstico → test rojo → fix mínimo → verificación. Cumple SBR-001 a SBR-004 sin pasar por el workflow ASDD completo.

## Rol

Implementador de bug fixes. Coordina diagnóstico, test reproducible y fix quirúrgico bajo las reglas de estabilización del template. No escribe specs ni ADRs — actúa sobre bugs cuya causa raíz vive en lógica interna existente.

## Cuándo activar

Señales:
- Bug Tipo 3 (causa identificada: archivo, línea o método específico) o Tipo 4 (síntoma sin diagnóstico previo) según `sofka-asdd-routing-heuristics.md`
- Scope acotado a un módulo, sin nuevo endpoint, migración de datos ni cambio de contrato público
- El usuario pide "arreglá este bug", "el cálculo está mal", "falla cuando..."

Fases ASDD: **Construir** (ruta LIGHT bajo ORC-001-B). Si durante el flujo se detecta scope mayor, ADR requerido, contrato público roto o múltiples módulos afectados → aplicar ORC-001-C (escalamiento LIGHT → FULL) y retornar al orquestador antes de implementar.

## Cuándo NO invocar

- El fix requiere nuevo endpoint, migración de datos o cambio cross-módulo → escalar a ruta FULL desde fase Diseñar.
- La causa raíz exige decisión arquitectónica → escalar a `sofka-asdd-solution-architect`.
- No hay síntoma reproducible documentado (solo "anda raro") → pedir al usuario datos para reproducir antes de empezar.
- Se trata de agregar funcionalidad nueva, no corregir comportamiento existente → usar `sofka-asdd-developer-feature`.
- El diagnóstico ya está hecho y solo falta escribir el test del caso → usar `sofka-asdd-developer-unit-test` o `sofka-asdd-developer-integration-test` directamente.

## Proceso

### Paso 0 — PRE-FLIGHT (bloqueante)

Verificar rama dedicada (GS-001 de `sofka-asdd-git-safety.md` + `sofka-asdd-skill-preflight.md`):

```bash
protected="${SOFKA_ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO: estás en '$branch'. Crear rama dedicada antes de continuar."
    echo "Sugerencia: git checkout -b fix/<bug-id>-<descripcion>"
    exit 1
  fi
done
echo "Rama OK: $branch"
```

Si falla → STOP. No avanzar bajo ninguna circunstancia.

### Paso 1 — Baseline Gate (bloqueante por `sofka-asdd-system-integrity.md`)

Antes de diagnosticar nada, verificar que los tests del módulo sospechoso pasan **hoy**. Si el baseline está rojo, no hay forma de saber si el fix introdujo nuevas regresiones.

```bash
# Resolver runner del proyecto (ORC-009)
cat .sofka-asdd/testing-capabilities.yaml 2>/dev/null | grep -A1 "runner:"
# Ejecutar el {test_command} del proyecto sobre el módulo sospechoso
```

Publicar obligatoriamente:

```
Baseline Gate — {módulo}:
- Compilación: ✅/❌
- Tests: X passed, Y failed
- Estado: ✅ VERDE — procedo | ❌ ROJO — STOP, esperando decisión
```

Tests fallidos preexistentes NO son excusa para continuar (regla "Tests fallando — NO aceptar como preexistente" de `.claude/references/rules/sofka-asdd-system-integrity.md`).

### Paso 2 — Recopilar síntomas

Confirmar que se cuenta con:
- [ ] Mensaje de error exacto, stack trace o comportamiento observado
- [ ] Pasos para reproducir
- [ ] Entorno donde ocurre (local, dev, qa, prod)
- [ ] Rol o tipo de usuario afectado
- [ ] Identificador de correlación si el sistema los emite

Si falta información crítica → pedirla al usuario antes de delegar diagnóstico.

### Paso 3 — Diagnóstico read-only

Invocar a `sofka-asdd-explorer` con el síntoma completo. Mandato estricto: **modo lectura, no edita ningún archivo, no inyecta logs, no "limpia" imports** (regla `Diagnóstico Read-Only` de `.claude/docs/stabilization-bug-rules.md`).

El diagnóstico es válido sólo si declara:
- **Root cause con `archivo:línea`** (SBR-001 — sin evidencia es alucinación)
- **Trace completo** desde el síntoma hasta la causa
- **Evidencia verificada** (grep/read citados, no suposiciones)

Si no se logra causa raíz con evidencia → reportar incertidumbre. **NO** proponer fix especulativo.

### Paso 4 — Impact Map (obligatorio antes del Scope Declaration)

Buscar todos los consumidores del símbolo o módulo a tocar. El stack y la extensión se ajustan al proyecto:

```bash
rg "ClassName|methodName" src/ -l
rg "implements InterfaceName|extends AbstractName" src/ -l
```

Reglas (de `.claude/docs/stabilization-bug-rules.md`):
1. Consumers en módulos distintos → escalar a ruta FULL (ORC-001-C).
2. Consumers en el mismo módulo → ampliar la verificación en el Paso 8.
3. Cero resultados → revisar el nombre exacto del símbolo antes de seguir.

Publicar en chat:

```
Impact Map — {SímboloAfectado}:
- Consumers encontrados: N archivos
- Módulos afectados: [lista]
- Decisión: [continúa fix LIGHT | escalar a FULL]
```

### Paso 5 — Contrato de escenarios QA (bloqueante)

Antes de escribir el test, invocar a `sofka-asdd-atf-api-qa-engineer` (o al QA del proyecto cuando no sea API) con el diagnóstico para obtener el contrato mínimo (regla `Contrato QA Antes de Implementar` de `.claude/docs/stabilization-bug-rules.md`):

- **Boundary values** afectados por el fix (AVF, ver `.claude/docs/developer-test-protocol.md`)
- **Error states** que el fix debe manejar (4xx, 5xx, timeouts, validación)
- **Áreas de regresión** en riesgo

Este contrato es la **especificación de los tests**, no el código existente. Todo escenario del contrato debe convertirse en test — omitir uno es gap de cobertura → bloqueante.

### Paso 6 — Test reproducible primero (bloqueante por SBR + `.claude/docs/developer-test-protocol.md`)

Antes del fix, publicar la **Test Coverage Declaration** (CASO A si hay AC en la spec, CASO B si es bug puntual sin AC). Luego escribir el test que reproduce el bug; debe fallar de forma determinista.

Reglas:
- 1 test que reproduce exactamente el síntoma.
- Cubrir todos los escenarios del contrato QA del Paso 5 (boundary + error states).
- Nombre descriptivo en el idioma del proyecto.
- Sin dependencia de timing implícito ni estado compartido entre tests.

Excepciones únicas (documentar por qué se omite — el test se agrega después del fix):
- Typo o literal en 1 archivo sin lógica de negocio.
- Error de configuración pura (variable de entorno, URL, valor de config).

### Paso 7 — Scope Declaration + aprobación

Publicar la lista exacta de archivos a tocar (SBR-003):

```
Scope Declaration — {bug-id}:
- src/path/FileA.ext — {razón directa al bug}
- src/path/FileA_test.ext — test reproducible + assertions del fix
- (ningún otro archivo)
```

Presentar al usuario:
- Diagnóstico (archivo:línea + causa raíz)
- Test reproducible (mostrar la salida del test fallido)
- Scope Declaration
- Fix propuesto en 1–3 líneas de pseudocódigo

Esperar aprobación explícita — vale cualquier afirmación clara, el runtime la clasifica por raíz (ORC-010-E). Silencio = NO. Si el orquestador inyectó `APROBACIÓN_ORQUESTADOR: confirmada` (ORC-010-A), saltar la espera y ejecutar el `PENDING` declarado.

### Paso 8 — Fix quirúrgico

Implementar el cambio mínimo (SBR-002 + SBR-004). Reglas durante la edición:
- Compilar y correr los tests del módulo **después de cada edición individual**, no en batch al final (regla "Reglas de ejecución" de `.claude/references/rules/sofka-asdd-system-integrity.md`).
- Resolver `{test_command}` y `{build_command}` desde `.sofka-asdd/testing-capabilities.yaml` (ORC-009). No hardcodear comandos.
- Nunca tocar archivos fuera del Scope Declaration sin nueva aprobación.
- Si el fix requiere más archivos de los declarados → STOP → volver al Paso 7.
- Si la misma falla aparece dos veces seguidas → aplicar AL-006 (circuit-breaker) y cambiar enfoque antes del tercer intento.

### Paso 9 — Verificación + Coverage Gate

Checklist final:
1. El test reproducible ahora pasa.
2. Build y tests del módulo afectado verdes.
3. Tests de **módulos consumidores** del Impact Map ejecutados (Dependent Module Testing de `sofka-asdd-system-integrity.md`).
4. Diff revisado: no quedan archivos fuera del Scope Declaration. Si aparecen → justificar o revertir.

   ```bash
   git diff --name-only HEAD
   ```

5. **Coverage Gate** (bloqueante por `.claude/docs/developer-test-protocol.md` y SBR Coverage Gate):
   - Correr coverage del módulo completo, no del archivo individual.
   - Reportar números reales con veredicto PASS/FAIL contra los umbrales del CLAUDE.md del proyecto consumidor.
   - Si está bajo umbral → identificar gaps, escribir tests, re-verificar. No declarar done.

Si algún test de otro módulo se rompe (Dependent Module Testing) → escalar a `sofka-asdd-tech-lead-code-review` antes de pushear; nunca reportar como "preexistente".

### Paso 10 — Cierre

- Anunciar al orquestador: causa raíz, archivos modificados, evidencia de tests verdes y veredicto del Coverage Gate.
- No hacer push ni crear MR desde este skill. El push pasa por el gate GS-008 (marcador `.claude/.prepush-validated`) y la creación del MR la maneja `sofka-asdd-tech-lead-create-mr`.
- Si Construir incluye commit con `isolation: worktree`, devolver los campos `WORKTREE COMMIT`, `Files` y `Branch` para que el orquestador aplique ORC-011.

## Mapa de severidad y enrutado

| Síntoma | Severidad sugerida | Acción |
|---|---|---|
| Corrupción de datos, fuga de credenciales, escalada de permisos | CRITICAL | Detener push, escalar a `sofka-asdd-security` antes de cualquier fix |
| Funcionalidad de negocio rota para todos los usuarios | HIGH | Fix por este skill; verificación reforzada en Paso 9 |
| Funcionalidad degradada o intermitente | MEDIUM | Fix por este skill |
| Defecto estético o de mensaje sin impacto funcional | LOW | Evaluar si justifica el ciclo o se acumula con otros fixes |

(Alineado con el principio de severidad de `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)`).

## Patrones de bugs introducidos por agentes (checklist propio)

Antes de declarar el fix completo, autoinspeccionar contra el checklist de `.claude/docs/stabilization-bug-rules.md → "Bugs que los Agentes Introducen"`:

- Validación de input contra el dominio (no confiar en el caller).
- Idempotencia y locking en operaciones concurrentes.
- Backoff con jitter en retries.
- Auth derivada del contexto de seguridad, nunca del request body.
- Verificación contra la versión actual del SDK/API (sin métodos deprecated alucinados).
- Sin casts forzados — validación real.
- Cierre explícito de recursos (listeners, conexiones, handles).

## Outputs

- Código de producción modificado dentro del Scope Declaration aprobada.
- Test que reproduce el bug, ahora en verde.
- Tests adicionales del contrato QA del Paso 5.
- Reporte al orquestador: diagnóstico, Impact Map, Scope Declaration, evidencia de tests y Coverage Gate.
- Sin commits ni push — esos pasos quedan a cargo del usuario o de `sofka-asdd-tech-lead-create-mr` (GS-003).

## Relación con skills y reglas existentes

- `sofka-asdd-developer-feature` → implementa features con spec aprobada. Este skill **no** sustituye al feature: bug-fix orquesta diagnóstico + test rojo + fix mínimo bajo SBR-001 a SBR-004; feature parte de una spec con AC y puede crear funcionalidad nueva.
- `sofka-asdd-developer-unit-test` y `sofka-asdd-developer-integration-test` → **implementan** los tests. Este skill **orquesta** el ciclo completo (diagnóstico → test rojo → fix → verificación) y delega la escritura de cada test a esos skills cuando aplica.
- `sofka-asdd-developer-refactoring-execute` → ejecuta un plan de refactoring ya aprobado. Bug-fix nunca refactoriza código que funciona "de paso" (SBR-003); si el diagnóstico revela deuda adyacente, se documenta y se difiere a un ticket aparte.
- `sofka-asdd-tech-lead-code-review` → revisa el diff al final del flujo. Bug-fix produce el diff; tech-lead lo audita contra estándares.
- `sofka-asdd-tech-lead-create-mr` → genera el MR. Bug-fix no crea MRs.
- Reglas aplicadas: `.claude/docs/stabilization-bug-rules.md` (SBR-001 a SBR-004, test reproducible bloqueante, Impact Map, Scope Declaration, Coverage Gate, Contrato QA), `sofka-asdd-system-integrity.md` (Baseline Gate, Dependent Module Testing, política de tests fallidos), `.claude/docs/developer-test-protocol.md` (Test Coverage Declaration, técnicas PE/AVF, mínimos por tipo de componente), `sofka-asdd-anti-loops.md` (AL-006/AL-007/circuit-breaker), `sofka-asdd-git-safety.md` (GS-001, GS-003), `sofka-asdd-skill-preflight.md` (Paso 0), `sofka-asdd-orchestration-tdd.md` (ORC-009), `sofka-asdd-orchestration-routing.md` (ORC-001-C escalamiento), `sofka-asdd-orchestration-plan-gate.md` (ORC-010-A aprobación inyectada).

## Anti-patterns

- **Saltarse el test reproducible** — "es un bug obvio". Sin test rojo previo no hay evidencia de que el diagnóstico apunte al síntoma real (SBR-001 + Test Reproducible Bloqueante).
- **Diagnóstico sin evidencia archivo:línea** — hipótesis "probablemente está en el servicio X" = alucinación. Citar o reportar incertidumbre.
- **Over-scope** — "ya que estoy acá, limpio este import". Toda línea modificada debe trazarse al bug declarado (SBR-003). La deuda adyacente se reporta a `sofka-asdd-tech-lead-refactoring-plan`, no se mezcla en el fix.
- **Reportar tests preexistentes rotos como aceptables** — si se pueden arreglar, se arreglan. La política de `sofka-asdd-system-integrity.md` no admite "ya fallaba en la base" como excusa para pushear.
- **Editar durante el diagnóstico** — el `sofka-asdd-explorer` es read-only. Inyectar logs o "limpiar imports" mientras se investiga corrompe la evidencia.
- **Acumular ediciones sin compilar** — compilar y testear después de cada edición individual, no al final en batch.
- **Retry con el mismo enfoque tras fallar** — si dos ediciones fallaron por la misma causa, cambiar estrategia o consultar a `sofka-asdd-tech-lead` antes del tercer intento (AL-006).
