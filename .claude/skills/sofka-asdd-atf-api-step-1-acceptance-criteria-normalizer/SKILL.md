---
name: sofka-asdd-atf-api-step-1-acceptance-criteria-normalizer
description: Normaliza criterios de aceptación heterogéneos a Given/When/Then trazable a RN. Sin inventar criterios faltantes.
used_by:
  - sofka-asdd-atf-api-step-1-requirement-review
---

## Propósito

Homogeneizar los `acceptance_criteria` extraídos por `hu-parser` a una estructura **Given/When/Then explícita y atómica**, lista para que la sub-fase 3B (Design test-cases) genere CPs sin re-interpretar el texto.

**Principio:** un criterio normalizado es **atómico** (cubre un solo escenario), **testeable** (tiene precondición, acción y resultado verificable) y **trazable** (referencia ≥ 1 RN).

## Cuándo invocar

Después de `hu-parser`. Segundo skill de la sub-fase 2A (Analyze funcional) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_hu` | object | Output de `hu-parser` |
| `business_rules` | array | Lista de RN extraídas (para asociación) |

## Formatos de entrada esperados

| Formato detectado | Tratamiento |
|---|---|
| `given-when-then` | Validar estructura; partir si el "Then" tiene múltiples assertions |
| `bullet-list` | Reconstruir Given (contexto inferido del bullet padre o sección), When (verbo), Then (resultado) |
| `narrative` | Identificar precondición, acción y resultado por análisis sintáctico; siempre marcar `confidence: medium` |
| `table` (Gherkin Scenario Outline) | Expandir cada fila como criterio independiente |

## Reglas de atomicidad

Un criterio normalizado contiene **exactamente**:

- 1 `given` (contexto / precondición)
- 1 `when` (acción única)
- 1 `then` (resultado verificable único)

Si el criterio fuente tiene "el servicio responde 201 **Y** crea el registro **Y** envía notificación", **dividir en 3** criterios normalizados que comparten Given/When pero difieren en Then.

## Output

```json
{
  "wi_id": "wi-001",
  "normalized_criteria": [
    {
      "ac_id": "AC-001",
      "given": "El usuario está autenticado con rol válido",
      "when": "envía POST /osf/api/v1/pending-billing-quotas con body {cycle:'2026-05', ...}",
      "then": "el servicio responde 201",
      "rules_covered": ["RN-008"],
      "source_format": "given-when-then",
      "source_text": "Dado que ... cuando ... entonces ...",
      "source_location": {"section": "5.1", "line_approx": 88},
      "confidence": "high | medium",
      "transformation_notes": "split de Then compuesto en 2 AC: AC-001 (status 201) y AC-002 (registro creado)"
    }
  ],
  "transformation_stats": {
    "total_source_criteria": 5,
    "total_normalized": 8,
    "split_count": 3,
    "merged_count": 0,
    "low_confidence_count": 1
  }
}
```

## Errores comunes

| Código | Causa |
|---|---|
| `AC-001` | Criterio sin verbo de acción claro — no se puede inferir `when` |
| `AC-002` | Criterio sin precondición ni contexto — `given` queda vacío, marcar como gap |
| `AC-003` | Criterio sin RN asociable — alertar al gap-detector |

## Cuándo NO invocar

- Los criterios ya están en Given/When/Then atómicos — solo validar, no transformar
- HU sin sección de criterios — escalar al gap-detector, no inventar

## Anti-patterns

- **Inventar `given`** cuando la HU no lo explicita. Si falta, marcar `given: ""` y flaggear.
- **Mergear criterios distintos** "para reducir." La atomicidad facilita el testing — preferir más AC pequeños que pocos AC compuestos.
- **Aplicar plantilla rígida** ignorando casos válidos sin Given (eventos del sistema, batches). En esos casos `given: "El sistema está en estado nominal"` es aceptable.
- **Perder trazabilidad al texto fuente.** Cada AC normalizado conserva `source_text` y `source_location`.

## Referencias

- Template: `templates/normalized-criteria.template.json`
- Ejemplo: `examples/example-normalized-clienteejemplo.json`
