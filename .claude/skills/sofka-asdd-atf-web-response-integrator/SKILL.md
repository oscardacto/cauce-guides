---
name: sofka-asdd-atf-web-response-integrator
description: Matchea respuestas del cliente con preguntas PQ-ID, clasifica su resolución y evalúa impacto en assumptions y FRS.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `preguntas_md` | string | Contenido de `preguntas_cliente.md` |
| `assumptions_md` | string | Contenido de `assumptions.md` |
| `response_files` | array | `[{filename, content}]` de archivos en `respuestas_cliente/` |
| `base_pruebas_md` | string | Contenido de `base_pruebas.md` |

## Proceso

1. **Extraer preguntas pendientes** — Parsear `preguntas_md` buscando filas con prefijo
   `PQ-` cuyo Status sea `pendiente` o vacío. Ignorar preguntas ya marcadas `resuelta`.

2. **Analizar archivos de respuesta** — Leer cada archivo en `response_files` (formato
   libre: .md, .txt, email pegado, conversación copiada). Extraer bloques de contenido
   que respondan a preguntas específicas. Señales de match:
   - Mención explícita de PQ-ID (`PQ-001`, `pregunta 1`)
   - Mención de HU-ID referenciado en la pregunta
   - Coincidencia semántica de keywords entre pregunta y respuesta

3. **Matcheo semántico** — Para cada pregunta pendiente, buscar en los archivos de
   respuesta el bloque más relevante. Criterios de match (en orden de confianza):
   - PQ-ID explícito en la respuesta → match directo
   - HU-ID + tipo de pregunta coinciden → match por contexto
   - Keywords de la pregunta aparecen en la respuesta → match semántico (requiere
     que ≥60% de los términos clave coincidan)

4. **Clasificar resolución:**
   - `resuelta` — la respuesta aborda directamente la pregunta con información suficiente
     para eliminar la ambigüedad
   - `parcial` — la respuesta da información útil pero no cierra completamente la duda
   - `pendiente` — sin match o match insuficiente

5. **Evaluar impacto en assumptions:**
   - `CONFIRMADO` — la respuesta valida el supuesto adoptado
   - `DESCARTADO` — la respuesta contradice el supuesto → el diagnostician debe ajustar
   - `ACTUALIZADO` — la respuesta modifica parcialmente el supuesto (nuevo valor, condición)

6. **Estimar impacto en FRS:**
   - Cada pregunta `resuelta` de prioridad ALTA → +2-5% FRS estimado
   - Cada pregunta `resuelta` de prioridad MEDIA → +1-2% FRS estimado
   - Cada assumption `DESCARTADO` → posible -1% si el nuevo dato introduce ambigüedad
   - Calcular `frs_delta_estimate` como suma neta

## Output

```json
{
  "results": [
    {
      "pq_id": "PQ-001",
      "status": "resuelta|parcial|pendiente",
      "matched_from": "respuestas_20260408.md",
      "response_summary": "Resumen conciso de la respuesta (max 200 chars)",
      "assumption_impact": [
        {
          "sup_id": "SUP-001",
          "action": "CONFIRMADO|DESCARTADO|ACTUALIZADO",
          "detail": "Explicación del cambio aplicado al supuesto"
        }
      ],
      "frs_impact": "positivo|neutro|negativo"
    }
  ],
  "summary": {
    "total_preguntas": 0,
    "resueltas": 0,
    "parciales": 0,
    "pendientes": 0,
    "assumptions_confirmados": 0,
    "assumptions_descartados": 0,
    "assumptions_actualizados": 0,
    "frs_delta_estimate": "+X%"
  }
}
```
