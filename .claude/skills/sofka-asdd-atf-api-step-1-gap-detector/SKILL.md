---
name: sofka-asdd-atf-api-step-1-gap-detector
description: Detecta gaps, ambigüedades y contradicciones en la HU y genera preguntas Q-NNN con criticidad y step bloqueado.
used_by:
  - sofka-asdd-atf-api-step-1-requirement-review
---

## Propósito

Identificar lo que **falta o no es claro** en la HU para escalar al humano antes de que el pipeline gaste tokens en pasos posteriores que dependen de información ambigua. La salida de este skill alimenta la **sección 8** del run-manifest.

**Principio:** una buena pregunta es **específica** ("¿cycle + distributorId + billingPeriod son la llave única?"), **trazable** ("RN-008 no lo explicita") y **bloqueante con justificación** ("Sin esto, no se puede diseñar el plan de Step 3").

## Cuándo invocar

Después de `acceptance-criteria-normalizer`. Tercer y último skill de la sub-fase 2A (Analyze funcional) por WI antes de escribir el `functional-spec`.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_hu` | object | Output de `hu-parser` |
| `normalized_criteria` | object | Output de `acceptance-criteria-normalizer` |
| `endpoints_in_scope` | array | Para detectar gaps de cobertura |

## Tipos de gap detectables

### G1 — Cobertura incompleta

Un endpoint del scope NO tiene ningún `acceptance_criterion` asociado.

**Ejemplo:** WI tiene `POST /a` y `GET /b` pero solo hay AC para POST.

### G2 — RN sin criterio testeable

Una `business_rule` no tiene ningún AC normalizado que la cubra.

**Ejemplo:** RN-006 declarada pero ningún AC referencia "RN-006".

### G3 — AC sin RN

Un AC normalizado no se asocia a ninguna RN.

**Ejemplo:** AC-007 describe un escenario sin RN-NNN identificable.

### G4 — Contradicción interna

Dos RN o dos AC dicen cosas contradictorias.

**Ejemplo:** RN-005 dice "el batch solo procesa fecha actual"; RN-006 dice "el batch procesa fecha actual o pasada".

### G5 — Referencias rotas

Texto referencia recursos no incluidos.

**Ejemplo:** "Ver imagen del esquema" pero no hay imagen.

### G6 — Ambigüedad de campos

Un campo no tiene tipo, formato, longitud, validación o ejemplo claro.

**Ejemplo:** RN-001 lista `cycle` como obligatorio pero no especifica formato (¿`2026-05`? ¿`May 2026`? ¿`05/2026`?).

### G7 — Ambigüedad de comportamiento

Un escenario tiene resultado no especificado.

**Ejemplo:** "¿Qué pasa si hay múltiples solicitudes PENDING para el mismo ciclo?"

## Criticidad

| Criticidad | Significado |
|---|---|
| `alta` | Bloquea Step 2 (contrato) o Step 3 (plan) — el pipeline no puede avanzar sin resolución |
| `media` | Bloquea Step 4 (casos) o introduce variabilidad alta en el diseño de tests |
| `baja` | Útil pero no bloquea — se documenta como supuesto y se valida con el cliente eventualmente |

## Output

```json
{
  "wi_id": "wi-001",
  "open_questions": [
    {
      "id": "Q-001",
      "type": "G6",
      "criticality": "alta",
      "blocks_step": "step_3",
      "question": "¿Qué combinación exacta de campos determina unicidad? cycle + distributorId + billingPeriod + periodProcessDate, o también contractId?",
      "evidence": "RN-008 menciona unicidad pero no enumera los campos. Sección 4.2 es ambigua.",
      "suggested_resolution": "Confirmar con stakeholder de ClienteEjemplo o revisar BD t_billing_request.",
      "wi_affected": ["wi-001", "wi-002"]
    }
  ],
  "coverage_report": {
    "endpoints_with_ac": 1,
    "endpoints_without_ac": 0,
    "rules_with_ac": 12,
    "rules_without_ac": 6,
    "ac_without_rules": 0,
    "broken_references": 2
  },
  "summary": {
    "total_questions": 4,
    "high_criticality": 2,
    "medium_criticality": 1,
    "low_criticality": 1,
    "blockers_step_2": 1,
    "blockers_step_3": 1
  }
}
```

## Reglas duras

- **Toda pregunta tiene evidencia.** Sin evidencia explícita (cita o referencia), no se crea Q-NNN.
- **Numeración Q-NNN secuencial global** dentro de la corrida (no por WI).
- **No proponer respuestas** en `question`. La pregunta es lo que hay que aclarar; las respuestas las da el humano.
- **`suggested_resolution`** es una pista de **dónde** buscar la respuesta (con quién, en qué doc), no la respuesta misma.

## Cuándo NO invocar

- Si Step 2 ya validó el contrato y resolvió ambigüedades técnicas, algunas Qs se cierran automáticamente
- Si la HU es trivial (1 endpoint, 1 AC, sin RN) — devolver `open_questions: []`

## Anti-patterns

- **Inventar preguntas defensivas.** No preguntar "¿Y si el servidor está caído?" sin que la HU mencione manejo de fallos del servidor.
- **Listar preguntas redundantes.** Si Q-001 cubre la unicidad y Q-002 también, consolidar en una.
- **Marcar todo como alta criticidad.** Solo bloqueante real es alta. Inflación de criticidad pierde foco del equipo.
- **Olvidar el cross-WI.** Una Q puede afectar a múltiples WIs (`wi_affected: [...]`).

## Referencias

- Template: `templates/gap-report.template.json`
- Ejemplo: `examples/example-gap-report-clienteejemplo.json`
