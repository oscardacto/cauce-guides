---
name: asdd-atf-api-step-4-test-data-generator-api
description: Genera fixtures válidos e inválidos desde el schema OpenAPI. Sin secretos hardcoded.
used_by:
  - asdd-atf-api-step-4-test-cases
---

## Propósito

Producir un catálogo de **datos de prueba reproducibles** para los CPs del WI. Cada fixture tiene un ID estable (`valid-cycle`, `valid-distributor`, `tomorrow`, etc.) que los CPs referencian. Sin esto, los CPs tendrían valores embebidos y serían frágiles.

## Cuándo invocar

En paralelo con `test-case-designer` o inmediatamente después (los CPs ya generados pueden mencionar fixture-IDs que este skill resuelve). Segundo skill de la sub-fase 3B (Design test-cases) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI |
| `parsed_contract` | object | Output del openapi-parser |
| `business_rules` | array | RN del WI (para fixtures derivadas de reglas) |
| `existing_test_cases` | array | (opcional) CPs ya diseñados, para identificar qué fixture-IDs hacen falta |

## Tipos de fixtures generadas

### Fixtures válidas

Datos que cumplen el schema y las RN. Una por tipo de valor relevante:

```json
{
  "id": "valid-cycle",
  "type": "string",
  "value": "2026-05",
  "schema_compliance": {"pattern": "^[0-9]{4}-[0-9]{2}$"},
  "rule_compliance": ["RN-001"],
  "category": "valid"
}
```

### Fixtures inválidas (clasificadas por tipo de invalidación)

| Tipo | Ejemplos |
|---|---|
| `missing` | Campo requerido ausente |
| `wrong-type` | `cycle: 202605` (number en lugar de string) |
| `wrong-pattern` | `cycle: "May2026"` (no cumple regex) |
| `out-of-enum` | `status: "UNKNOWN"` (no está en el enum) |
| `boundary-below` | `periodProcessDate: ayer-1` (BVA) |
| `boundary-above` | `periodProcessDate: hoy+1` (BVA) |
| `empty` | `cycle: ""` |
| `null` | `cycle: null` (cuando no es nullable) |
| `oversized` | string que excede maxLength |
| `injection` | SQL/XSS payloads para campos string |

### Fixtures temporales (resueltas en runtime)

Valores que dependen del momento de ejecución:

```json
{
  "id": "today",
  "type": "string",
  "value": "{runtime:date:today:YYYY-MM-DD}",
  "resolution_strategy": "runtime",
  "category": "temporal"
}
```

El runner (Step 5) resuelve estos placeholders al ejecutar.

### Fixtures de credenciales

**Nunca valores literales.** Solo referencias:

```json
{
  "id": "credential-admin",
  "type": "string",
  "value": "{credentials.admin}",
  "category": "credential",
  "resolution_strategy": "env-vars-at-runtime"
}
```

## Proceso

1. Para cada endpoint del WI:
   1.1. Por cada `required_field` del schema, generar:
        - 1 fixture válida
        - 1 fixture `missing`
        - Fixtures inválidas según el tipo de campo (pattern → `wrong-pattern`; enum → `out-of-enum`; numérico con rango → `boundary-below`, `boundary-above`)
   1.2. Por cada campo opcional, generar fixture válida (las inválidas son menos críticas).
2. Cruzar con `existing_test_cases` para validar que todas las referencias `{data.fixtures.{ID}}` se resuelvan.
3. Generar `fixtures-{wi_id}.json` con el catálogo completo.

## Output

```json
{
  "wi_id": "wi-001",
  "fixtures": [
    {
      "id": "valid-cycle",
      "type": "string",
      "value": "2026-05",
      "category": "valid",
      "field_target": "cycle",
      "schema_compliance": {"pattern": "^[0-9]{4}-[0-9]{2}$"},
      "rule_compliance": ["RN-001"]
    },
    {
      "id": "today",
      "type": "string",
      "value": "{runtime:date:today:YYYY-MM-DD}",
      "category": "temporal",
      "resolution_strategy": "runtime"
    },
    {
      "id": "tomorrow",
      "type": "string",
      "value": "{runtime:date:today+1:YYYY-MM-DD}",
      "category": "boundary-above",
      "field_target": "periodProcessDate",
      "expected_to_fail": true,
      "expected_error_code": "INVALID_CYCLE_DATE"
    }
  ],
  "coverage": {
    "fields_covered": ["cycle", "distributorId", "billingPeriod", "periodProcessDate"],
    "fixtures_count": {"valid": 4, "missing": 4, "boundary-below": 1, "boundary-above": 1, "wrong-pattern": 2, "temporal": 2, "credential": 0}
  },
  "unresolved_references": [],
  "warnings": []
}
```

## Reglas duras

1. **Sin valores reales de producción.** Generar datos sintéticos plausibles, no copiar registros reales.
2. **Credenciales solo por referencia.** Nunca password literal, ni siquiera "test123".
3. **IDs determinísticos.** El mismo `parsed_contract` produce los mismos fixture-IDs siempre.
4. **Trazabilidad completa.** Cada fixture indica su `field_target` y `rule_compliance`.
5. **Validar referencias.** Si un CP referencia `{data.fixtures.foo}` y no hay fixture `foo`, fallar con `TDG-001`.

## Cuándo NO invocar

- WI sin endpoints (wi-003 puro de consolidación) — fixtures derivadas de RN, casos limitados
- Fixtures ya existen del baseline en regression con `delta_status: unchanged` — reutilizar
- LIGHT de generar 1 fixture puntual — invocar con scope acotado

## Anti-patterns

- **Fixtures con valores "trampa" demasiado parecidos al producto real** (PII de clientes reales). Usar siempre datos sintéticos identificables (`DIST-TEST-001`, `dev@example.com`).
- **Hardcodear fechas absolutas** (`"2026-05-21"`). Para tests temporales, usar placeholders `{runtime:date:...}`.
- **Generar 100 fixtures inválidas** "para cobertura." El valor está en cubrir las clases de error, no en cantidad.
- **Olvidar fixtures de boundary.** Off-by-one es de los bugs más frecuentes — boundary fixtures son críticas.

## Referencias

- Template: `templates/fixtures.template.json`
- Ejemplo: `examples/example-fixtures-clienteejemplo.json`
