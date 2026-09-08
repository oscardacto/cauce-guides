---
name: asdd-atf-api-step-4-test-case-designer
description: Diseña CP-NNN atómicos y trazables a RN y AC, con request y response esperados explícitos.
used_by:
  - asdd-atf-api-step-4-test-cases
---

## Propósito

Convertir las decisiones de la sub-fase 3A (técnicas + riesgo) en **casos de prueba ejecutables**. Cada CP es la unidad mínima que la sub-fase 3B entrega a Fase 4 (Automate) para que genere un `.spec.ts`.

**Principio:** un CP es bueno si **un humano puede ejecutarlo a mano leyendo el JSON** y un agente puede automatizarlo sin ambigüedad.

## Cuándo invocar

Tras Fase 3A (test-plan) aprobada. Primer skill de la sub-fase 3B (Design test-cases) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI |
| `parsed_contract` | object | Output del openapi-parser |
| `normalized_criteria` | object | Output del acceptance-criteria-normalizer |
| `business_rules` | array | RN del WI |
| `technique_catalog` | object | Output de istqb-test-techniques |
| `risk_matrix` | object | Output de risk-scorer-api |

## Algoritmo de generación

Por cada endpoint del WI:

1. **Por cada `technique_applied` en el catálogo:**
   - Generar CPs según la técnica:

     | Técnica | Algoritmo de generación |
     |---|---|
     | **EP** | 1 CP por partición válida + 1 CP por partición inválida (que produce error documentado) |
     | **BVA** | 6 CPs por límite: min-1, min, min+1, max-1, max, max+1 (solo los aplicables al rango) |
     | **Decision Table** | 1 CP por columna de la tabla reducida (sin combinaciones imposibles) |
     | **State Transition** | 1 CP por transición válida (`A → B`) + 1 CP por transición inválida (`A → C` cuando no es permitida) |
     | **Pairwise** | 1 CP por cada par no cubierto por los CPs existentes |
     | **Error Guessing** | 1 CP por código de error documentado en `responses.4xx.error_codes` |
     | **Contract Testing** | 1 CP único por endpoint validando response contra schema completo |

2. **Eliminar duplicados.** Si dos técnicas producen un CP equivalente (mismo request, mismo expected), consolidar en uno y registrar las técnicas cubiertas.

3. **Asignar priority** según el risk_matrix:
   - CPs sobre endpoint `critical` → todos `critical`
   - CPs sobre endpoint `high` → críticos los happy paths y errores documentados; resto `high`
   - CPs sobre endpoint `medium`/`low` → priority heredada del endpoint

4. **Trazar a RN y AC.** Cada CP referencia explícitamente:
   - `rule_covered`: RN-NNN que la prueba valida
   - `ac_covered`: AC-NNN del normalized_criteria
   - `technique`: técnica que generó el CP

5. **Numerar.** `CP-001` a `CP-NNN`, secuencial dentro del WI.

## Output

```json
{
  "wi_id": "wi-001",
  "test_cases": [
    {
      "id": "CP-001",
      "title": "Crear solicitud de facturación válida con fecha actual",
      "priority": "high",
      "technique": "Decision Table",
      "rules_covered": ["RN-001", "RN-008"],
      "acs_covered": ["AC-001", "AC-002"],
      "endpoint": "POST /osf/api/v1/pending-billing-quotas",
      "preconditions": [
        "Existe distributorId DIST-001 en el catálogo",
        "No existe solicitud previa con (cycle:2026-05, distributorId:DIST-001, billingPeriod:2026-05, periodProcessDate:hoy)"
      ],
      "request": {
        "method": "POST",
        "url": "/osf/api/v1/pending-billing-quotas",
        "headers": {"Content-Type": "application/json"},
        "body": {
          "cycle": "{data.fixtures.valid-cycle}",
          "distributorId": "{data.fixtures.valid-distributor}",
          "billingPeriod": "{data.fixtures.valid-period}",
          "periodProcessDate": "{data.fixtures.today}"
        }
      },
      "expected_response": {
        "status": 201,
        "headers_assertions": [
          {"name": "Content-Type", "matches": "application/json.*"}
        ],
        "body_assertions": [
          {"path": "$.requestId", "matches": "uuid"},
          {"path": "$.status", "equals": "PENDING"},
          {"path": "$.createdAt", "matches": "iso8601-datetime"}
        ],
        "schema_ref": "BillingRequestCreated"
      },
      "post_conditions": [
        "Existe registro en t_billing_request con status=PENDING (no validable sin acceso BD — validar via GET subsiguiente si existe)"
      ],
      "tags": ["@happy-path", "@critical-flow", "@regression"]
    }
  ],
  "wi_summary": {
    "total_cps": 9,
    "by_priority": {"critical": 0, "high": 6, "medium": 3, "low": 0},
    "by_technique": {"BVA": 2, "Decision Table": 4, "Contract Testing": 1, "Error Guessing": 2},
    "rules_coverage": {
      "covered": ["RN-001", "RN-002", "RN-003", "RN-008", "RN-010"],
      "uncovered": []
    }
  }
}
```

## Reglas duras

1. **Sin assertions ambiguas.** Cada `body_assertion` tiene `path` (JSONPath), operador (`equals`, `matches`, `contains`, `present`) y valor. Nunca "verificar que el body sea correcto".
2. **Sin credenciales literales.** Solo `{credentials.{ROLE}}` o `{data.fixtures.{ID}}`.
3. **Sin invención de RN.** Toda CP traza a RN existente. Si una CP no tiene RN clara → no se genera.
4. **Schema ref obligatorio para responses 2xx.** Permite contract testing automático.
5. **Tags consistentes** — usar `@happy-path` / `@error-path` / `@boundary` / `@regression` / `@smoke`.

## Errores comunes

| Código | Causa |
|---|---|
| `CPD-001` | CP sin RN ni AC asociada — no se generaría sin justificación |
| `CPD-002` | CP duplicado detectado — consolidar antes de output |
| `CPD-003` | CP con request inválido contra schema — bug en el generador |

## Cuándo NO invocar

- Si el technique_catalog está vacío (WI sin endpoints, ej: wi-003 puro de consolidación) — diseñar CPs basados en RN, no en técnicas formales
- Si Step 3 no fue aprobado — bloquear con notificación

## Anti-patterns

- **CPs gigantes que prueban 5 cosas a la vez.** Atomicidad: 1 CP = 1 assertion principal (más assertions de soporte permitidos).
- **Generar todas las combinaciones de Decision Table sin reducir.** Las combinaciones imposibles (`pago=true && contrato=null`) se eliminan.
- **Olvidar el caso negativo equivalente.** Por cada happy path, considerar al menos 1 caso negativo predecible.
- **Test data literal en CPs.** Todo dato variable va por fixtures — el `test-data-generator-api` resuelve.
- **CPs con expected_response ambiguo** ("200 o 201"). Decidir uno; si depende de condición, usar 2 CPs distintos.

## Referencias

- Template: `templates/test-cases.template.json`
- Ejemplo: `examples/example-test-cases-clienteejemplo.json`
- Skills colaboradores: `test-data-generator-api`, `gherkin-writer-api`
