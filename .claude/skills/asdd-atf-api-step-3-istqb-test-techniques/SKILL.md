---
name: asdd-atf-api-step-3-istqb-test-techniques
description: Selecciona técnicas ISTQB (BVA, EP, Decision Table, State Transition, Pairwise) por endpoint, justificadas con el contrato.
used_by:
  - asdd-atf-api-step-3-test-plan
---

## Propósito

Decidir **qué técnicas formales** aplicar a cada endpoint del WI, evitando técnicas inadecuadas (ej: BVA sobre enums) y garantizando cobertura de los caminos de prueba relevantes. La decisión se basa en señales objetivas del contrato y de las RN, no en intuición.

## Cuándo invocar

Tras Fase 2 aprobada. Primer skill de la sub-fase 3A (Design test-plan) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI a analizar |
| `parsed_contract` | object | Output del `step-2-openapi-parser` |
| `normalized_criteria` | object | Output del `step-1-acceptance-criteria-normalizer` |
| `business_rules` | array | RN extraídas en Step 1 |

## Catálogo de técnicas y cuándo aplican

| Técnica | Cuándo aplica | Cuándo NO aplica | Cobertura producida |
|---|---|---|---|
| **Equivalence Partitioning (EP)** | Campos con dominios discretos (enum) o particionables (rango numérico tipo "edad: 0-17, 18-65, 66+") | Campos con un solo valor válido | 1 CP por partición |
| **Boundary Value Analysis (BVA)** | Campos numéricos con límites min/max o pattern de longitud | Enums, booleanos | min-1, min, min+1, max-1, max, max+1 |
| **Decision Table** | Combinación de ≥ 2 condiciones que producen acciones distintas | Lógica lineal sin combinatoria | 1 CP por columna de la tabla |
| **State Transition** | Endpoints que modifican estado del sistema con ciclo de vida (PENDING → EXECUTION → END) | Endpoints stateless | 1 CP por transición válida + 1 por inválida |
| **Pairwise / All-Pairs** | ≥ 3 campos discretos cuya combinación completa es inviable (combinatorial explosion) | Pocos campos | N(N-1)/2 pares cubiertos |
| **Error Guessing** | Códigos de error documentados (`INVALID_FORMAT`, `DUPLICATE`, etc.) | Errores no documentados | 1 CP por error documentado |
| **Contract Testing** | Siempre — validar response contra schema OpenAPI | Sin schema definido | 1 assertion por endpoint |

## Proceso

1. Para cada `endpoint` del `parsed_contract` con `in_wi_scope: true`:
   1.1. Listar los campos del request (`required_fields` + opcionales).
   1.2. Para cada campo, identificar señales:
        - ¿Tiene enum o partición discreta? → EP
        - ¿Tiene pattern, min/max length, min/max value? → BVA
        - ¿Es parte de combinación con otros campos en RN? → Decision Table
        - ¿Es la cabecera de un Authorization condicional? → cruce con Error Guessing
   1.3. Revisar las RN asociadas al endpoint para detectar:
        - Transiciones de estado (palabras clave: "transiciona", "cambia a", "PENDING", "estado") → State Transition
        - Combinatorias ("si A y B entonces X, si A y no B entonces Y") → Decision Table
   1.4. Revisar los códigos de error documentados → Error Guessing
   1.5. Decidir el conjunto mínimo y suficiente de técnicas.

2. Calcular `estimated_test_cases` por técnica.

3. Documentar la justificación de cada selección.

4. Devolver el catálogo.

## Output

```json
{
  "wi_id": "wi-001",
  "technique_catalog": [
    {
      "endpoint": "POST /osf/api/v1/pending-billing-quotas",
      "techniques_applied": [
        {
          "technique": "BVA",
          "target_fields": ["periodProcessDate"],
          "rationale": "RN-010 establece límite (fecha actual o pasada) — BVA detecta off-by-one en el límite.",
          "estimated_cps": 4
        },
        {
          "technique": "Decision Table",
          "target_fields": ["cycle", "distributorId", "billingPeriod", "periodProcessDate"],
          "rationale": "RN-008 define lógica create-vs-update por combinación de los 4 campos — 4 condiciones binarias = tabla de 16 columnas, reducida por reglas a 6.",
          "estimated_cps": 6
        },
        {
          "technique": "Contract Testing",
          "target_fields": ["response_body"],
          "rationale": "Validación inherente del response contra schema BillingRequestCreated.",
          "estimated_cps": 1
        },
        {
          "technique": "Error Guessing",
          "target_fields": ["request_body"],
          "rationale": "Códigos INVALID_CYCLE_DATE, MISSING_REQUIRED_FIELD, INVALID_FORMAT documentados en 400.",
          "estimated_cps": 3
        }
      ],
      "techniques_rejected": [
        {
          "technique": "Pairwise",
          "reason": "Solo 4 campos discretos — combinatoria manejable con Decision Table directa."
        }
      ],
      "total_estimated_cps": 14
    }
  ],
  "wi_total_estimated_cps": 14,
  "techniques_distribution": {
    "BVA": 4,
    "Decision Table": 6,
    "Contract Testing": 1,
    "Error Guessing": 3
  }
}
```

## Reglas duras

1. **Justificación obligatoria** para cada técnica aplicada. Sin "porque sí".
2. **Rechazo documentado** para técnicas que parecen aplicables pero se descartan (ayuda a la sub-fase 3B a no replantear).
3. **Mínimo viable.** No aplicar 5 técnicas cuando 2 cubren los mismos paths — sobre-testeo es ruido.
4. **Cobertura ≠ exhaustividad.** Decision Table de 4 condiciones binarias son 16 combinaciones; rara vez todas son testeables. Reducir por reglas (impossible combinations) antes de decidir CPs.

## Anti-patterns

- **BVA sobre enums.** Para `status: PENDING | EXECUTION | END`, aplicar EP (1 CP por valor) y State Transition (transiciones), no BVA.
- **EP sobre campos con un solo valor válido.** No hay partición — solo Contract Testing.
- **Pairwise con < 3 campos discretos.** Subuso de la técnica — preferir Decision Table.
- **Decision Table sin reglas de negocio.** Si no hay RN que justifique la combinatoria, no inventarla.
- **State Transition sobre endpoints stateless.** Si el endpoint no mantiene estado, no aplica.

## Referencias

- Template: `templates/technique-catalog.template.json`
- Ejemplo: `examples/example-technique-catalog-clienteejemplo.json`
