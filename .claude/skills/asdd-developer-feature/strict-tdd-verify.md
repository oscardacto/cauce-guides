# Strict TDD — Módulo de Auditoría de Cumplimiento (Verificar)

> Par de `strict-tdd.md` (módulo de implementación). Mientras `strict-tdd.md`
> gobierna CÓMO el `asdd-developer-frontend` / `asdd-developer-backend` implementa bajo Strict TDD, este
> módulo gobierna CÓMO el `asdd-atf-api-qa-engineer` **audita** ese
> cumplimiento en la fase Verificar, antes del sign-off.

Se activa cuando `.asdd/testing-capabilities.yaml` tiene `strict_tdd: true`
(el orquestador lo inyecta vía ORC-009). Si `strict_tdd: false` o el archivo no
existe → modo estándar, esta auditoría no aplica.

## Paso 0 — Insumos

1. Leer `.asdd/testing-capabilities.yaml` (confirmar `strict_tdd: true` y el `runner.command`).
2. Localizar la **Tabla de evidencia TDD** que el developer produjo (output de `strict-tdd.md`, sección "Tabla de evidencia TDD").
3. Localizar los archivos de test referenciados en la tabla.

Si no existe tabla de evidencia y `strict_tdd: true` → **FAIL inmediato** (regla hard #6 del módulo de implementación: la tabla es obligatoria).

## Qué auditar (checklist de cumplimiento)

Cada ítem se marca `✅ PASS` / `❌ FAIL` / `➖ N/A (justificado)` con evidencia `archivo:línea`.

| # | Control | Cómo verificarlo |
|---|---|---|
| A1 | **RED antes que GREEN** | Cada tarea de la tabla tiene `RED: ✅ Escrito`. Cruzar con git history: el test debe aparecer en un commit antes o junto al código de producción, nunca después. |
| A2 | **Gate GREEN real** | `GREEN: ✅ Pasó`. Re-ejecutar el runner UNA vez (`{runner.command}`) sobre los tests de la tabla; no asumir. Si falla por infra → registrar "Bloqueado: {razón}", no FAIL del código. |
| A3 | **Triangulación** | `TRIANGULATE: ✅ N casos` o `➖ N/A` con justificación explícita en la tabla. Sin justificación → FAIL. |
| A4 | **Safety Net** | Para archivos modificados (no nuevos): `Safety Net: ✅ N/N`. Si fue `N/A (nuevo)`, confirmar que el archivo es realmente nuevo. |
| A5 | **Capa de test correcta** | La capa declarada (Unit/Integration/E2E) coincide con lo que el test realmente ejercita (no un "integration" que mockea todo). |
| A6 | **Cobertura** | El código de producción tocado tiene cobertura segun los thresholds del proyecto (Coverage Gate). Reportar números reales. |

## Calidad de assertions (anti-patrones — auditar SIEMPRE)

Inspeccionar los tests citados en la tabla. Cualquiera de estos = `❌ FAIL` del control de calidad (espejo de `strict-tdd.md` §"Calidad de assertions"):

- **Tautología** (CRÍTICO): assertions que se verifican a sí mismas (`expect(x).toBe(x)`, mock que devuelve lo que el test luego afirma).
- **Ghost loop** (CRÍTICO): bucle de assertions sobre colección que puede estar vacía sin que el test falle.
- **Smoke sin comportamiento** (ADVERTENCIA): solo `toBeDefined`/`not.toThrow` sin verificar el resultado.
- **Acoplamiento a implementación** (ADVERTENCIA): assertions sobre llamadas internas en vez del comportamiento observable.
- **Exceso de mocks** (ADVERTENCIA): se mockea tanto que el test no ejercita lógica real.

Críticos → FAIL. Advertencias → se reportan; ≥3 advertencias en el mismo módulo → FAIL.

## Reglas hard del developer que el auditor confirma

Verificar que no se violó ninguna de las reglas hard de `strict-tdd.md`:
código de producción nunca antes del test (#1), gate GREEN no asumido (#2),
triangulación justificada (#3), sin assertions triviales (#4), Safety Net previo
a modificar existentes (#5), tabla de evidencia presente (#6), pre-existing
failures escaladas no silenciadas (#10).

## Veredicto

- **PASS**: todos los controles A1-A6 en `✅`/`➖ justificado`, sin anti-patrones críticos, reglas hard respetadas.
- **FAIL**: cualquier control crítico en `❌`. Listar cada violación con evidencia `archivo:línea` y la regla hard violada.
- Máximo **2 ciclos** de corrección (AL-001): si tras 2 vueltas persiste un FAIL → STOP y escalar al usuario.

## Artefacto de salida (OBLIGATORIO)

Derivar el nombre del artefacto con el helper (D4, `naming-convention.md §3.7.1`):
```bash
ARTIFACT_NAME=$(node .claude/scripts/asdd-artifact-name.mjs \
  --phase verify --slug tdd-audit-{feature})
```
El archivo resultante vive en `docs/qa/`. Si no hay run activo (`.asdd-run.json`
ausente), usar el patrón legado `docs/qa/tdd-audit-{feature}-{NNN}.md` como
fallback y documentarlo en el output. NUNCA estampar el sufijo `-{NNN}` a mano
para artefactos nuevos de run.

Debe incluir, en el encabezado, la **fecha** en formato `YYYY-MM-DD`
(convención de fecha consistente en artefactos, #3595).

Estructura mínima:

```markdown
# Auditoría TDD — {feature}

> Fecha: {YYYY-MM-DD} · Run: {run_id} · Auditor: asdd-atf-api-qa-engineer
> Veredicto: PASS | FAIL

## Controles
| Control | Resultado | Evidencia |
|---------|-----------|-----------|
| A1 RED antes que GREEN | ✅/❌ | archivo:línea |
| ... | | |

## Anti-patrones de assertions
{hallazgos o "ninguno"}

## Violaciones (si FAIL)
- {regla hard violada} — {evidencia} — {corrección requerida}
```

El sign-off de Verificar **no se emite** hasta que este reporte exista con
veredicto PASS. El reporte es insumo del Quality Gate Score (QGS) del
`asdd-atf-reporting-qa-engineer`.

## Reglas hard del auditor (no negociables)

```
1. NUNCA dar PASS sin la tabla de evidencia TDD del developer.
2. NUNCA asumir que los tests pasan — re-ejecutar el runner una vez (A2).
3. NUNCA aprobar tests con tautologías o ghost loops (anti-patrones críticos).
4. SIEMPRE citar evidencia archivo:línea por cada FAIL.
5. SIEMPRE producir el artefacto en docs/qa/ derivando el nombre con el helper (D4, §3.7.1); fallback legado si no hay run activo.
6. Máximo 2 ciclos de corrección; al tercero, STOP y escalar (AL-001).
```
