# Run Manifest — PruebaAPIClienteEjemplo-v1.0-20260521-1030

**Generado por:** asdd-atf-api-qa-engineer (Fase 1 — Bootstrap)
**Fecha de creación:** 2026-05-21
**Estado inicial:** `needs_info`
**Tipo de ciclo:** baseline

---

## 1. Resumen de la Corrida

| Campo | Valor |
|---|---|
| `run_id` | PruebaAPIClienteEjemplo-v1.0-20260521-1030 |
| API URL | https://api-qa.clienteejemplo.example.com/v1 |
| Versión | v1.0 |
| Entorno | qa |
| Autenticación | No requerida |
| Tipo de ciclo | baseline |
| Baseline run_id | N/A |
| Defect ID (retest) | N/A |
| Fuentes inventariadas | 2 |
| Work Items creados | 3 |
| knowledge_base_path | docs/testing/atf/knowledge/ |

---

## 2. session_config (snapshot)

```json
{
  "user_name": null,
  "communication_language": "Español",
  "document_output_language": "Español",
  "style_of_communication": "profesional, claro, directo, preciso y conciso",
  "output_folder": "docs/output/PruebaAPIClienteEjemplo-v1.0-20260521-1030",
  "model_strategy_resolved": {
    "orchestrator": "sonnet",
    "step_1": "sonnet",
    "step_2": "sonnet",
    "step_3": "opus",
    "step_4": "sonnet",
    "step_5": "sonnet",
    "step_6": "sonnet",
    "step_7": "haiku"
  }
}
```

> Todos los agentes hijos (Steps 1-7) leen `session_config` desde este manifiesto sin recargar `appapi.yaml`.

---

## 3. Inventario de Entradas

| ID | Fuente | Tipo | Utilidad | Observaciones |
|---|---|---|---|---|
| SRC-001 | `Microservicio_consulta_cuotas_pendientes.md` | HU + Criterios + Reglas de Negocio | Alta | 5 definiciones, 18 RN, ejemplos request/response. Imágenes de esquemas BD referenciadas pero no incluidas. |
| SRC-002 | `docs/testing/atf/config/appapi.yaml` | Configuración de sesión | Media | URL apunta a `/credit-risk-service/v1/quotas/save` pero HU documenta `/osf/api/v1/pending-billing-quotas` — discrepancia bloquea Step 2. |

---

## 4. Partición en Work Items

**Criterio aplicado:** H1-funcional-layer

**Justificación:** La HU describe un flujo end-to-end con 3 capas separables: registro de solicitud, proceso batch con ciclo de vida, consulta y consolidación. Cada capa es testeable independientemente.

| WI | Título | Endpoints | RN cubiertas | Inputs | CPs estimados |
|---|---|---|---|---|---|
| wi-001 | Solicitud de ejecución | POST `/osf/api/v1/pending-billing-quotas` | RN-001, RN-002, RN-003, RN-008, RN-010 | SRC-001 | 8 |
| wi-002 | Proceso batch y ciclo de vida | GET `/osf/api/v1/pending-billing-quotas` | RN-004 a RN-006, RN-011 a RN-013 | SRC-001 | 12 |
| wi-003 | Consulta de cuotas y consolidación | (sin endpoint propio — efecto en wi-002 + OSF externo) | RN-014 a RN-018 | SRC-001 | 10 |

---

## 5. Dependencias y Orden de Activación

```text
wi-001 ──→ wi-002 ──→ wi-003
  (state)    (sequential)
```

**Niveles topológicos:**

| Nivel | WIs | Paralelizables |
|---|---|---|
| 0 | wi-001 | sí (solo 1) |
| 1 | wi-002 | sí (solo 1) |
| 2 | wi-003 | sí (solo 1) |

**Plan de paralelismo por step:**

- **Steps 1 + 2:** corren en paralelo para los 3 WIs simultáneamente (solo lectura)
- **Step 3 → 4 → 5:** secuencial por WI siguiendo orden topológico
- **Step 6:** secuencial estricto — wi-001 antes que wi-002 antes que wi-003

---

## 6. Plan de Activación de Fases

| Fase | Sub-fase / Módulo | Switch | Estado | Orden |
|---|---|---|---|---|
| Fase 2 — Analyze | 2A funcional (hu-parser → normalizer → gap-detector) | `step_1: true` | `enabled` | 1 (paralelo con 2B) |
| Fase 2 — Analyze | 2B técnica (openapi-parser → contract-hasher → delta-detector) | `step_2: true` | `enabled` | 1 (paralelo con 2A) |
| Fase 3 — Design | 3A test-plan (istqb-test-techniques → risk-scorer) | `step_3: true` | `enabled` | 2 (tras Fase 2 aprobada) |
| Fase 3 — Design | 3B test-cases (designer → data-generator → gherkin-writer) | `step_4: true` | `enabled` | 3 |
| Fase 4 — Automate | scaffolding + playwright + newman | `step_5: true` | `enabled` | 4 |
| Fase 5 — Execute | execution-runner + failure-classifier | `step_6: true` | `enabled` | 5 |
| Fase Report (agente separado) | qgs + report + backlog | `step_7: true` | `enabled` | 6 |
| Módulo Security (paralelo en Fase 4) | owasp-api-checks (+zap si aplica) | `step_security: false` | `skipped` | — |
| Módulo Performance (paralelo en Fase 4) | k6-script-generator + threshold-evaluator | `step_performance: false` | `skipped` | — |

---

## 7. Track Inicial de Work Items

| WI | Track | Actualización esperada |
|---|---|---|
| wi-001 | `full_pipeline` | baseline → confirmado tras Step 2 |
| wi-002 | `full_pipeline` | baseline → confirmado tras Step 2 |
| wi-003 | `full_pipeline` | baseline → confirmado tras Step 2 |

---

## 8. Preguntas Abiertas Consolidadas

| ID | WI afectado | Criticidad | Pregunta |
|---|---|---|---|
| Q-001 | Global | **Alta — bloquea Step 2** | URL en `appapi.yaml` (`/credit-risk-service/v1/quotas/save`) no coincide con endpoints documentados en HU (`/osf/api/v1/pending-billing-quotas`). ¿Cuál es la URL base correcta? |
| Q-002 | wi-001, wi-002 | **Alta — impacta Step 3** | ¿Qué combinación exacta de campos determina unicidad (cycle + distributorId + billingPeriod + periodProcessDate)? ¿`contractId` forma parte de la llave? |
| Q-003 | wi-001, wi-002 | Media | Imágenes de esquemas de las 2 tablas BD referenciadas pero no disponibles. ¿Existe documentación adicional? |
| Q-004 | wi-002 | Media | ¿Qué sucede si hay múltiples solicitudes `PENDING` para el mismo ciclo/distribuidora en la fecha del scheduler? |

---

## 9. Protocolo de Rate Limit

```
rate_limit_protocol: "ante señales de límite de tokens, escribir artefacto parcial
con status: 'partial' e interrupted_at antes de pausar; notificar al orquestador
antes de detener cualquier actividad. Detalle: .claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Rate Limit Protocol)"
```

---

## 10. Próximo Paso Recomendado

**Acción inmediata:**

1. **Responder Q-001** (URL base correcta) — habilita Sub-fase 2B con la URL real.
2. **Activar Sub-fase 2A (Analyze funcional)** en paralelo — no depende de la URL.
3. **Activar Sub-fase 2B (Analyze técnica)** asumiendo `appapi.yaml` como punto de partida — corregir si Q-001 trae cambio.
4. **Resolver Q-002** antes de iniciar Sub-fase 3A (Design test-plan).

**Comando sugerido:** `/asdd:qa-analyze`

---

*asdd-atf-api-qa-engineer | Fase 1 — Bootstrap | PruebaAPIClienteEjemplo-v1.0-20260521-1030 | 2026-05-21*
