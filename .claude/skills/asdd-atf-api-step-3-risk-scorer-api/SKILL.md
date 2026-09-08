---
name: asdd-atf-api-step-3-risk-scorer-api
description: Matriz de riesgo probabilidad por impacto para cada endpoint y CP. Prioriza critical/high/medium/low.
used_by:
  - asdd-atf-api-step-3-test-plan
---

## Propósito

Decidir **qué probar primero y con cuánto esfuerzo**. Sin priorización, el equipo gasta el mismo tiempo en un GET de healthcheck que en un POST que mueve dinero. El skill produce un score numérico defendible por cada CP estimado.

## Cuándo invocar

Tras `istqb-test-techniques`. Segundo skill de la sub-fase 3A (Design test-plan) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI a evaluar |
| `parsed_contract` | object | Output del `openapi-parser` |
| `business_rules` | array | RN del WI |
| `technique_catalog` | object | Output del `istqb-test-techniques` |
| `session_config` | object | Para conocer `hard_exclusions` del routing |

## Modelo de riesgo

`Risk Score = Probability × Impact` (ambos en escala 1-5).

### Probabilidad de falla (1-5)

| Score | Señales |
|---|---|
| 5 | Endpoint nuevo, sin historial. Lógica compleja con >5 condiciones. Cambios `major` vs baseline. Integración con sistema externo |
| 4 | Lógica con 3-5 condiciones. Maneja datos parcialmente validados. Cambio `minor` reciente |
| 3 | Lógica estándar con validaciones. Sin historial de bugs recientes |
| 2 | Endpoint maduro con baseline estable. Lógica lineal |
| 1 | GET simple, idempotente, sin lógica |

### Impacto si falla (1-5)

| Score | Señales |
|---|---|
| 5 | Toca `hard_exclusions` del routing (auth, pagos, PII, compliance, contratos-publicos). Afecta dinero o regulación |
| 4 | Mutación de datos críticos del negocio (estado de facturación, contratos). Visible al cliente final |
| 3 | Mutación de datos no críticos (logs, métricas). Visible internamente |
| 2 | GET de datos no sensibles |
| 1 | Endpoints utilitarios (health, version) |

### Categorías finales

| Risk Score | Prioridad | % de esfuerzo recomendado |
|---|---|---|
| 20-25 | `critical` | ≥ 40% |
| 12-19 | `high` | 30% |
| 6-11 | `medium` | 20% |
| 1-5 | `low` | 10% |

## Heurísticas objetivas (sin opinión)

Para cada endpoint, evaluar señales binarias:

```text
+1 a probabilidad:
  - operation_id contiene "create", "update", "delete" (mutación)
  - request body con > 5 campos requeridos
  - integra con sistema externo (mencionado en RN)
  - delta_status: major en la corrida actual

+1 a impacto:
  - path contiene cualquier hard_exclusion ("auth", "pago", "pii", "compliance")
  - response 201/204 (crea/mutea recurso)
  - RN asociada categorizada como "calculation" (dinero o regulado)
  - endpoint declarado como crítico por el usuario en algún input
```

Sumar señales para llegar a los scores 1-5 (clip al rango).

## Proceso

1. Para cada endpoint del WI, calcular probability y impact según las heurísticas.
2. Multiplicar para obtener risk_score.
3. Categorizar.
4. Distribuir el `total_estimated_cps` del catálogo según las categorías encontradas.
5. Producir matriz visual + tabla por endpoint.

## Output

```json
{
  "wi_id": "wi-001",
  "risk_matrix": [
    {
      "endpoint": "POST /osf/api/v1/pending-billing-quotas",
      "probability": 4,
      "impact": 4,
      "risk_score": 16,
      "category": "high",
      "probability_signals": ["mutation operation (create)", "5 required fields", "delta_status: major"],
      "impact_signals": ["mutation (201)", "RN categorizada como flow crítico de facturación"],
      "recommended_cps": 9,
      "recommended_effort_pct": 30
    }
  ],
  "wi_summary": {
    "highest_risk_endpoint": "POST /osf/api/v1/pending-billing-quotas",
    "category_distribution": {
      "critical": 0,
      "high": 1,
      "medium": 0,
      "low": 0
    },
    "estimated_total_effort_hours": 16
  },
  "priorization_for_step_6": [
    "POST /osf/api/v1/pending-billing-quotas (high) — ejecutar primero"
  ]
}
```

## Reglas duras

1. **Score reproducible.** Mismo input → mismo score. No depende de quién ejecuta.
2. **Señales documentadas.** El score debe acompañarse de las señales que lo produjeron.
3. **Hard exclusions ≥ score 5 en impacto.** No negociable.

## Cuándo NO invocar

- WI sin endpoints (ej: wi-003 solo de consolidación interna) — score por reglas de negocio en lugar de endpoints
- Tarea LIGHT — el risk score no se recalcula para 1 CP

## Anti-patterns

- **Asignar critical a todo** "por si acaso." Critical es para `risk_score ≥ 20`; el resto pierde foco.
- **Score subjetivo.** "Me parece que es high" no aplica — se requieren señales explícitas.
- **Ignorar hard_exclusions.** Cualquier endpoint que las toque es ≥ high automáticamente.
- **Olvidar el delta.** Un endpoint estable durante 5 corridas con `delta_status: unchanged` baja su probabilidad — no asumir que todo es nuevo en cada corrida.

## Referencias

- Template: `templates/risk-matrix.template.json`
- Ejemplo: `examples/example-risk-matrix-clienteejemplo.json`
