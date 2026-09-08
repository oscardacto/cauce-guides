---
name: asdd-atf-api-step-4-gherkin-writer-api
description: Convierte los test cases JSON en .feature Gherkin, 1:1 CP-ID a Scenario, con Scenario Outline cuando aplica.
used_by:
  - asdd-atf-api-step-4-test-cases
---

## Propósito

Generar la **vista Gherkin** del catálogo de CPs. Esta vista NO es la fuente de verdad (el JSON sí lo es), pero es la representación que stakeholders no-técnicos pueden leer y validar.

**Principio:** Gherkin describe **qué se prueba**, no **cómo**. La implementación vive en `.spec.ts` (Fase 4 — Automate).

## Cuándo invocar

Tras `test-case-designer` y `test-data-generator-api`. Tercer y último skill de la sub-fase 3B (Design test-cases) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI |
| `test_cases` | object | Output de `test-case-designer` |
| `fixtures` | object | Output de `test-data-generator-api` (para resolver display names) |
| `wi_title` | string | Título del WI (del partition_result) |

## Estructura del .feature

```gherkin
# language: es
# encoding: utf-8

@wi-001 @critical-flow
Feature: Solicitud de ejecución

  Como sistema que gestiona el ciclo de facturación
  Quiero registrar solicitudes de facturación válidas
  Para que el batch posterior las procese

  Background:
    Given el servicio API está disponible
    And no existe solicitud previa con la misma llave de unicidad

  @happy-path @critical-flow @CP-001
  Scenario: Crear solicitud válida con fecha actual
    Given el sistema tiene un distributorId "DIST-TEST-001" registrado
    When el cliente envía POST "/osf/api/v1/pending-billing-quotas" con datos válidos
    Then el servicio responde 201
    And el body contiene un requestId con formato UUID
    And el body contiene status "PENDING"
    And el body cumple el schema "BillingRequestCreated"

  @error-path @boundary @CP-002
  Scenario: Rechazar solicitud con periodProcessDate futura
    Given el sistema tiene un distributorId "DIST-TEST-001" registrado
    When el cliente envía POST con periodProcessDate = mañana
    Then el servicio responde 400
    And el body contiene error "INVALID_CYCLE_DATE"
    And no se crea registro en t_billing_request
```

## Reglas de conversión JSON → Gherkin

| Campo JSON del CP | Sintaxis Gherkin |
|---|---|
| `preconditions[]` | `Given ...` |
| `request.method + url + body` | `When el cliente envía {METHOD} "{url}" con {descripción}` |
| `expected_response.status` | `Then el servicio responde {status}` |
| `expected_response.body_assertions[]` | `And el body contiene/cumple/coincide ...` |
| `post_conditions[]` | `And ...` (en el Then) |
| `tags[]` | `@tag` en línea anterior al Scenario |

## Uso de Scenario Outline

Cuando varios CPs de la misma técnica difieren solo en datos:

```gherkin
@boundary @CP-002 @CP-003
Scenario Outline: Validación de periodProcessDate en el límite
  Given el sistema está disponible
  When el cliente envía POST con periodProcessDate <fecha>
  Then el servicio responde <status>
  And el body contiene <error>

  Examples:
    | fecha    | status | error                |
    | mañana   | 400    | INVALID_CYCLE_DATE   |
    | hoy      | 201    | n/a                  |
    | ayer     | 201    | n/a                  |
```

Aplicar Outline solo si:
- ≥ 2 CPs comparten la misma estructura
- La diferencia está solo en valores (no en pasos)
- Se preserva la trazabilidad mencionando todos los CP-IDs en los tags

## Proceso

1. Agrupar `test_cases` por `endpoint`.
2. Crear `Feature` por endpoint con título derivado del WI.
3. Definir `Background` con preconditions compartidas (las que aparecen en ≥ 80% de los CPs).
4. Por cada CP, decidir si va como `Scenario` individual o agrupado en `Scenario Outline`.
5. Renderizar con sintaxis Gherkin española.
6. Validar que cada `{data.fixtures.{ID}}` resuelva contra el catálogo de fixtures (display name humano-legible).
7. Escribir `wi-{N}-test-cases.feature`.

## Output

```text
docs/testing/atf/{run_id}/test-cases/wi-{N}-test-cases.feature
```

Y un metadata file:

```json
{
  "wi_id": "wi-001",
  "feature_file": "docs/testing/atf/{run_id}/test-cases/wi-001-test-cases.feature",
  "features_count": 1,
  "scenarios_count": 5,
  "scenario_outlines_count": 1,
  "examples_rows_total": 3,
  "cps_referenced": ["CP-001", "CP-002", "CP-003", "CP-004", "CP-005"],
  "validation": {
    "all_cps_covered": true,
    "all_fixtures_resolved": true
  }
}
```

## Reglas duras

1. **Cero credenciales literales.** El Gherkin muestra el `display_name` de la fixture o un placeholder, nunca el valor real.
2. **Trazabilidad obligatoria.** Cada Scenario tiene tag `@CP-NNN` para mapear con el JSON.
3. **Idioma español** — palabras clave Gherkin: `Dado`, `Cuando`, `Entonces`, `Y`, `Pero`, etc.
4. **Sin invención de pasos.** Si un CP no tiene precondición, no agregarla "para hacerlo más bonito".

## Cuándo NO invocar

- Solo se quiere consultar Gherkin existente — leer el `.feature`
- LIGHT — los CPs nuevos van al JSON; el .feature se regenera completo o no se toca

## Anti-patterns

- **Texto narrativo extenso** en Scenarios. Gherkin debe ser conciso — 5-10 pasos max.
- **Mezclar dos endpoints en un Feature.** Una Feature = un endpoint.
- **Outline con 1 ejemplo.** Si solo hay 1 fila de Examples, usar Scenario simple.
- **Inventar Background** que no aparezca en preconditions de los CPs. El Background es real, no decorativo.

## Referencias

- Template: `templates/feature-file.template.feature`
- Ejemplo: `examples/example-wi-001-clienteejemplo.feature`
