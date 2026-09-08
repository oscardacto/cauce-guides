---
name: sofka-asdd-tech-lead-delivery-report
description: Reporte de entrega previo al gate pre-push — qué se implementó, evidencia, cobertura, aprobaciones y veredicto.
---

# Delivery Report — Reporte de Entrega del Ciclo ASDD

> Resumen ejecutivo del ciclo de entrega: qué cambió, evidencia de tests y calidad, riesgos y checklist pre-MR. El usuario lo lee y decide si autoriza el push (GS-008) y la creación del MR (GS-009).

## Rol

Consolidador del ciclo de entrega. Reúne evidencia objetiva de Build y Verificar y produce un reporte que el reviewer humano puede auditar en una sola lectura. No emite veredicto de quality gate (eso lo hace `sofka-asdd-tech-lead-quality-gate`) ni crea el MR (eso lo hace `sofka-asdd-tech-lead-create-mr`).

## Cuándo activar

- Al cerrar una feature, bug fix o ciclo ASDD antes de marcar el gate pre-push (`GS-008`).
- Antes de invocar `sofka-asdd-tech-lead-create-mr` para que la descripción del MR cite el reporte.
- Cuando el usuario pide "resume la entrega", "genera el delivery report", "informe del ciclo".
- Fase ASDD: **Verificar** (cierre del ciclo, handoff a reviewer y QA).

## Proceso

### Paso 0 — PRE-FLIGHT ligero (read-only, ver `sofka-asdd-skill-preflight.md`)

Este skill **no crea código fuente**, solo un artefacto de documentación. Verificar:

1. Estar en una rama dedicada (no protegida). Si la rama actual aparece en `SOFKA_ASDD_PROTECTED_BRANCHES` → STOP por `GS-001`.
2. Confirmar que existen commits del ciclo en la rama actual. Sin commits → no hay nada que reportar.

### Paso 1 — Recopilar contexto del ciclo

```bash
# Rama y base de comparación (la base por defecto se toma de origin/HEAD o se pasa como parámetro)
git rev-parse --abbrev-ref HEAD
git log --oneline {base_branch}..HEAD | head -20

# Archivos modificados y estadística del cambio
git diff --name-status {base_branch}..HEAD | head -40
git diff --stat {base_branch}..HEAD | tail -5
```

### Paso 2 — Reunir artefactos ASDD del ciclo

Buscar y leer los artefactos producidos por el flujo ASDD asociados a esta entrega:

- Spec(s): `docs/specs/{feature}-{NNN}.md` y `docs/specs/gaps-{feature}-{NNN}.md` si existen (`WF-002`).
- ADRs nuevos o tocados: `docs/architecture/decisions/ADR-NNN-*.md` (`WF-003`).
- Estado del workflow: `.asdd-run.json` para extraer fases completadas, agentes invocados, escalamientos (`ORC-007`).
- Code reviews previos: `docs/tech/review-*.md` del ciclo.
- Quality gate: `docs/tech/quality-gate-{feature}.md` si ya se emitió.
- QA sign-off: `docs/qa/atf/{run_id}/qgs-evaluation.json` o `docs/qa/signoff-{feature}.md` según el tipo de pruebas (`CORE-008`).
- Security: reportes en `docs/security/` si aplicaron.
- TDD evidence (si `strict_tdd: true` en `.sofka-asdd/testing-capabilities.yaml`, `ORC-009`): buscar en `docs/testing/` artefactos con slug `tdd-evidence-{feature}` — el nombre exacto se derivó con el helper (D4, `naming-convention.md §3.7.1`); en proyectos pre-existentes puede ser `tdd-evidence-{feature}-{NNN}.md` (patrón legado).

### Paso 3 — Ejecutar el runner del proyecto y leer métricas

Comandos de build y test **no se hardcodean**. Resolver el runner desde `.sofka-asdd/testing-capabilities.yaml` (`ORC-009`) o desde el `CLAUDE.md` del proyecto consumidor. Ejecutar el `{test_command}` parametrizado y capturar:

- Cantidad de tests añadidos o modificados en el ciclo.
- Cobertura por capa según los umbrales del proyecto consumidor (líneas, branches, mutation si está configurado).
- Estado del último build.

Si no hay runner declarado → reportar el gap explícito (no inventar métricas).

### Paso 4 — Componer el reporte

Pedir el nombre del artefacto al helper y escribir en la ruta que devuelve —
ART-001 exige el patrón de artefacto de run y lo enforzan tanto el guard
`artifact-name-guard` como el hook nativo `pre-commit`:

```bash
node .claude/scripts/sofka-asdd-artifact-name.mjs --phase verify --slug delivery-report-{feature_or_pr_id}
```

El tema va en el `slug`, no en el prefijo del archivo. **Nunca** incluir
Co-Authored-By ni atribución a IA (alineado con `sofka-asdd-tech-lead-create-mr`).

## Formato del reporte

```markdown
# Delivery Report — {feature o ID del PR}

| Campo | Valor |
|---|---|
| Rama | {nombre de rama} |
| Base de comparación | {rama base} |
| Fecha | {YYYY-MM-DD HH:MM} |
| Ciclo ASDD | {ID del run de .asdd-run.json} |
| Spec(s) | {ruta(s) en docs/specs/} o "Sin spec — fix de configuración" |
| ADR(s) tocados | {lista} o "Ninguno" |

## 1. Qué se implementó

{Resumen funcional en 2-3 líneas sin jerga técnica}

**Archivos creados**
- `{ruta}` — {propósito}

**Archivos modificados**
- `{ruta}` — {qué cambió}

**Cambios estructurales**
- Migraciones de datos: {Sí — referencia | No}
- Endpoints/contratos nuevos: {Sí — lista | No}
- Eventos o mensajes nuevos: {Sí — lista | No}

## 2. Qué se logró — criterios de aceptación

Por cada AC en la(s) spec(s):

- AC-01 PASS — {descripción} — evidencia: `archivo:línea` o `test:nombre`
- AC-02 PASS — {descripción} — evidencia: ...
- AC-03 PARTIAL — {descripción} — falta: {qué resta}
- AC-04 FAIL — {descripción} — gap registrado en `docs/specs/gaps-{feature}-{NNN}.md`

Si no hay spec con AC (fix puntual): consignar objetivo y resultado verificable.

## 3. Testing

| Tipo | Cantidad nueva o modificada |
|---|---|
| Unitarios | {N} |
| Integración | {N} |
| E2E / contrato | {N} |

- Técnicas aplicadas: {PE, AVF, tabla de decisión, transición de estado, ...} (`.claude/docs/developer-test-protocol.md`)
- TDD: {RED → GREEN → REFACTOR confirmado | Estándar | N/A} — referencia a `strict_tdd` en `.sofka-asdd/testing-capabilities.yaml` si aplicó (`ORC-009`)
- Edge cases cubiertos: {N}

**Cobertura** (umbrales del proyecto consumidor):

| Capa / módulo | Valor | Umbral | Estado |
|---|---|---|---|
| {capa A} | {X}% | {umbral}% | PASS / FAIL |
| {capa B} | {X}% | {umbral}% | PASS / FAIL |

Si el runner del proyecto no está declarado → registrar "métricas no disponibles — falta `.sofka-asdd/testing-capabilities.yaml`" y NO inventar valores.

## 4. Aprobaciones de agentes ASDD

| Agente | Skill / sub-rol | Estado | Artefacto |
|---|---|---|---|
| `sofka-asdd-developer-frontend` / `sofka-asdd-developer-backend` | feature / unit-test / integration-test | PASS / FAIL / N/A | {ruta o commit} |
| `sofka-asdd-tech-lead` | code-review | PASS / FAIL / N/A | `docs/tech/review-{PR-id}.md` |
| `sofka-asdd-tech-lead` | quality-gate | PASS / FAIL / N/A | `docs/tech/quality-gate-{feature}.md` |
| `sofka-asdd-security` | code-scan / secrets-scan / dependency-audit | PASS / FAIL / N/A | `docs/security/...` |
| `sofka-asdd-atf-api-qa-engineer` | execute | PASS / FAIL / N/A | `docs/testing/atf/{run_id}/execution/` |
| `sofka-asdd-atf-reporting-qa-engineer` | QGS sign-off | PASS / FAIL / N/A | `docs/qa/atf/{run_id}/qgs-evaluation.json` |
| `sofka-asdd-producto` | acceptance criteria sign-off | PASS / FAIL / N/A | spec firmada |

Sin sign-off PASS de QA, el ciclo **no está hecho** (`CORE-008`).

## 5. Gates ASDD

| Gate | Estado | Evidencia |
|---|---|---|
| Spec aprobada (`CORE-001`) | PASS / FAIL | `docs/specs/...` |
| Sin desviaciones silenciosas (`CORE-006`) | PASS / FAIL | diff vs spec |
| Tests y cobertura (`sofka-asdd-system-integrity`) | PASS / FAIL | reporte del runner |
| Pre-push marker (`GS-008`) | PRE-PEND / DONE | `.claude/.prepush-validated` |
| Pre-PR (`GS-009`) | PRE-PEND / DONE | a verificar antes de `glab mr create` / `gh pr create` |
| Naming de rama (`GS-004`) | PASS / FAIL | nombre de rama |

## 6. Commits del ciclo

```
{hash corto} {tipo}({scope}): {mensaje}
{hash corto} {tipo}({scope}): {mensaje}
```

Todos los commits siguen `GS-005` (conventional commits).

## 7. Deuda técnica y pendientes

- Ninguno — entrega limpia. **o**
- `{archivo:línea}` — {descripción} — severidad: {low/medium/high} — ticket de seguimiento: {ID o "abrir"}
- Gaps registrados en `docs/specs/gaps-{feature}-{NNN}.md`: {lista}

## 8. Riesgos para release

- {Riesgo 1} — mitigación: {acción}
- {Riesgo 2} — mitigación: {acción}

Si no hay riesgos relevantes: "Sin riesgos adicionales identificados".

## 9. Checklist pre-MR

- [ ] Spec aprobada existe y el diff la respeta (`CORE-001`, `CORE-006`)
- [ ] Tests verdes en el runner del proyecto (`sofka-asdd-system-integrity`)
- [ ] Cobertura cumple los umbrales del proyecto consumidor
- [ ] Code review sin blockers abiertos
- [ ] Quality gate PASS si aplica (`sofka-asdd-tech-lead-quality-gate`)
- [ ] Security review PASS si aplica (`CORE-007`)
- [ ] QA sign-off (`CORE-008`)
- [ ] Marker pre-push generado (`GS-008`)
- [ ] Rama dedicada con naming GitFlow (`GS-001`, `GS-004`)
- [ ] Sin secretos, sin rutas absolutas de máquina personal
- [ ] Sin atribución de IA en commits ni en el MR

## 10. Veredicto

- **APROBADO** — todos los gates PASS, listo para `sofka-asdd-tech-lead-create-mr`.
- **APROBADO CON OBSERVACIONES** — entrega válida, pendientes documentados en sección 7 con ticket de seguimiento.
- **BLOQUEADO** — al menos un gate FAIL. Razón: {detalle}. Acción requerida: {qué resolver y con qué agente}.
```

## Reglas de completitud del reporte

1. **Sección 2 (AC)** — si existe spec con AC, cada uno aparece con PASS/PARTIAL/FAIL y evidencia. Sin excepción.
2. **Sección 4 (Agentes)** — todo agente invocado en `.asdd-run.json` aparece. `N/A` solo si el agente no aplicaba al tipo de cambio.
3. **Sección 5 (Gates)** — cada gate documentado en las reglas (`CORE-001`, `CORE-006`, `CORE-007`, `CORE-008`, `GS-008`, `GS-009`) aparece con estado explícito.
4. **Veredicto** — si cualquier gate marca FAIL, el veredicto es **BLOQUEADO**. Sin paliativos. Sin "aprobado con un FAIL pequeño".
5. **El reporte se genera una sola vez** por ciclo de entrega. Si tras emitirse cambia algo, se genera un nuevo reporte (no se edita el anterior).

## Outputs

- `docs/tech/{run_id}-{PHASE}-{SEQ}-delivery-report-{feature_or_pr_id}.md` — reporte completo, con el nombre que devuelve `sofka-asdd-artifact-name.mjs` (ART-001).
- Mensaje al usuario con el veredicto y la ruta del reporte.

## Relación con skills y reglas existentes

| Skill / regla | Diferencia |
|---|---|
| `sofka-asdd-tech-lead-create-mr` | `create-mr` **crea el MR/PR** y su descripción. `delivery-report` **resume el ciclo** y produce el insumo previo. El MR cita el delivery report en su descripción. |
| `sofka-asdd-tech-lead-quality-gate` | `quality-gate` **emite el veredicto** PASS/FAIL sobre métricas (`docs/tech/quality-gate-{feature}.md`). `delivery-report` **consume** ese veredicto y lo agrega al panorama del ciclo. |
| `sofka-asdd-tech-lead-code-review` | `code-review` revisa **un PR puntual**. `delivery-report` resume **el ciclo completo** incluyendo el resultado del review. |
| `sofka-asdd-tech-lead-commit` | `commit` produce commits convencionales en el ciclo. `delivery-report` los **agrupa** en la sección 6 del reporte. |
| `sofka-asdd-atf-reporting-qa-engineer` | El agente de Reporting QA emite el reporte de pruebas y QGS de la ATF API. `delivery-report` **referencia** ese reporte; no lo sustituye. |
| `GS-008` / `GS-009` | El delivery report es el **insumo para verificar** los gates pre-push y pre-PR. No los reemplaza. |
| `CORE-008` | El sign-off QA es **condición para PASS** del veredicto. |

## Cuándo NO invocar

- El ciclo aún no terminó — hay tests pendientes, código en progreso. El reporte es de cierre, no de WIP.
- No hay spec ni AC ni gates ejecutados — antes de reportar entrega hay que tener algo que reportar.
- Se busca emitir el veredicto de calidad — eso lo hace `sofka-asdd-tech-lead-quality-gate`.
- Se busca crear el MR — eso lo hace `sofka-asdd-tech-lead-create-mr`.
- Se busca el reporte de pruebas API — eso lo emite `sofka-asdd-atf-reporting-qa-engineer`.

## Anti-patterns

- **Reporte con métricas inventadas** — si el runner no está declarado en `.sofka-asdd/testing-capabilities.yaml`, registrar el gap; nunca inventar cobertura o tests.
- **Veredicto APROBADO con un FAIL** — si cualquier gate marca FAIL, el veredicto es BLOQUEADO. Sin matices.
- **Co-Authored-By o atribución a IA** — prohibido en cualquier parte del reporte y del MR posterior.
- **Reporte como acta decorativa** — sin evidencia archivada por sección, el reporte no sirve. Cada PASS cita ruta o test concreto.
- **Editar el reporte después de emitirlo** — si cambia algo, se genera un reporte nuevo. La inmutabilidad protege la auditoría.
- **Saltarse la spec** — si no hay spec y el cambio no es un fix de configuración, el reporte sale BLOQUEADO por `CORE-001`.
