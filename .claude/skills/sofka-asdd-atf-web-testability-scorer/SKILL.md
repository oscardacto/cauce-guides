---
name: sofka-asdd-atf-web-testability-scorer
description: Evalúa la documentación funcional en 5 dimensiones, calcula el FRS y emite gate READY, CONDITIONAL o BLOCKED.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `doc_items` | array | Ítems de documentación a evaluar |
| `doc_type` | string | `"HU"` · `"use_case"` · `"requirement"` · `"acceptance_criteria"` · `"other"` |
| `is_unstructured` | boolean | Si `true`, cap 50% en Trazabilidad |

**Estructura de un doc_item:**
```json
{ "item_id": "HU-001", "title": "...", "description": "...", "acceptance_criteria_text": "...",
  "has_id": true, "has_actor": true, "has_preconditions": false, "has_postconditions": false }
```

---

## PASO 1 — Claridad (peso 25%)

Palabras de alerta: `rápido, lento, intuitivo, fácil, difícil, seguro, siempre, nunca, adecuado, suficiente, apropiado, oportuno, eficiente, amigable, simple, moderno, completo, óptimo, mejor`

Penalización: −15 pts por término encontrado.
Excepción: término seguido de criterio cuantificable (ej. "rápido: <2 segundos") → no penalizar.

```
clarity_score = max(0, 100 - (count_alert_words × 15))
```

## PASO 2 — Completitud (peso 25%)

| Escenarios presentes | Score |
|---------------------|-------|
| Happy path + alternativo + error | 100 |
| Happy path + uno de (alternativo o error) | 66 |
| Solo happy path | 33 |
| Ninguno identificable | 0 |

Detección:
- **Happy path**: flujo principal exitoso, sin excepciones
- **Alternativo**: variación del flujo normal (usuario sin permisos, datos opcionales)
- **Error**: condición de fallo, validación negativa, sistema no disponible

## PASO 3 — Criterios de Aceptación (peso 25%)

| Formato | Score |
|---------|-------|
| BDD (Given/When/Then o Dado/Cuando/Entonces) | 100 |
| Criterios definidos sin formato BDD | 60 |
| Criterios vagos o implícitos | 20 |
| Sin criterios | 0 |

## PASO 4 — Trazabilidad (peso 15%)

25 pts por elemento presente: ID único · Actor definido · Precondiciones · Postcondiciones

```
traceability_score = (has_id×25) + (has_actor×25) + (has_preconditions×25) + (has_postconditions×25)
```

Si `is_unstructured: true` → cap máximo 50% en esta dimensión.

## PASO 5 — Atomicidad (peso 10%)

| Tipo | Score |
|------|-------|
| Atómico: exactamente una funcionalidad | 100 |
| Divisible: podría subdividirse sin perder coherencia | 50 |
| Épica: múltiples funcionalidades independientes | 0 |

Señales de épica: "y además", "también debe", múltiples actores con objetivos distintos, más de 3 flujos alternativos.

## PASO 6 — Score del ítem

```
item_score = (clarity×0.25) + (completeness×0.25) + (criteria×0.25) + (traceability×0.15) + (atomicity×0.10)

≥75  → TESTEABLE
50–74 → CONDICIONAL
<50  → NO TESTEABLE
```

## PASO 7 — Functional Readiness Score (FRS)

```
FRS = promedio(item_score de todos los ítems)
```

Ítems NO TESTEABLE se incluyen completos en el promedio (no se excluyen).

## PASO 8 — Decisión de gate

| FRS | Decisión | Acción |
|-----|----------|--------|
| ≥75 | **READY** ✅ | Pipeline continúa |
| 50–74 | **CONDITIONAL** ⚠️ | Pipeline continúa; generar `testability_assumptions.md` |
| <50 | **BLOCKED** ❌ | Pipeline se detiene; requiere mejora de documentación |

## PASO 9 — Supuestos (solo si CONDITIONAL)

Por cada ítem con score <75, identificar ambigüedades y generar:
```json
{ "assumption_id": "SUP-001", "source_item": "HU-003",
  "ambiguity": "Criterio 'carga rápida' sin umbral definido",
  "adopted_assumption": "Se asume tiempo de carga aceptable ≤3 segundos según estándar web",
  "risk_level": "medium",
  "validation_needed": "Confirmar umbral con PO antes de ejecución" }
```

---

## Output

```json
{
  "frs": 72.5,
  "gate_decision": "CONDITIONAL",
  "total_items_evaluated": 8,
  "items_testeable": 5, "items_conditional": 2, "items_no_testeable": 1,
  "item_scores": [
    {
      "item_id": "HU-001", "item_score": 88.5, "classification": "TESTEABLE",
      "dimension_scores": { "clarity": 85, "completeness": 100, "criteria": 100, "traceability": 75, "atomicity": 100 },
      "alert_words_found": ["intuitivo"],
      "recommendations": []
    },
    {
      "item_id": "HU-003", "item_score": 52.0, "classification": "CONDICIONAL",
      "dimension_scores": { "clarity": 55, "completeness": 33, "criteria": 60, "traceability": 50, "atomicity": 100 },
      "alert_words_found": ["rápido", "siempre"],
      "recommendations": ["Definir umbral cuantificable para 'rápido'", "Agregar escenario de error"]
    }
  ],
  "assumptions": [
    { "assumption_id": "SUP-001", "source_item": "HU-003",
      "ambiguity": "Criterio 'carga rápida' sin umbral definido",
      "adopted_assumption": "Se asume tiempo de carga aceptable ≤3 segundos",
      "risk_level": "medium", "validation_needed": "Confirmar umbral con PO" }
  ]
}
```