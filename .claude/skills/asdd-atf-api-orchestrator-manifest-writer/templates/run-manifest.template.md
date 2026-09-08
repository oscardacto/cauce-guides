# Run Manifest — {run_id}

**Generado por:** asdd-atf-api-qa-engineer (Fase 1 — Bootstrap)
**Fecha de creación:** {YYYY-MM-DD}
**Estado inicial:** `{ready | needs_info | blocked}`
**Tipo de ciclo:** {baseline | regression | fast-track | retest}

---

## 1. Resumen de la Corrida

| Campo | Valor |
|---|---|
| `run_id` | {run_id} |
| API URL | {app.url} |
| Versión | {app.version} |
| Entorno | {app.environment} |
| Autenticación | {requires_auth ? default_role : "No requerida"} |
| Tipo de ciclo | {cycle.type} |
| Baseline run_id | {baseline_run_id o "N/A"} |
| Defect ID (retest) | {defect_id o "N/A"} |
| Fuentes inventariadas | {count} |
| Work Items creados | {count} |
| knowledge_base_path | {project-root}/docs/testing/atf/knowledge/ |

---

## 2. session_config (snapshot)

```json
{
  "user_name": null,
  "communication_language": "Español",
  "document_output_language": "Español",
  "style_of_communication": "profesional, claro, directo, preciso y conciso",
  "output_folder": "docs/output/{run_id}",
  "model_strategy_resolved": {
    "orchestrator": "sonnet",
    "step_3": "opus",
    "step_7": "haiku"
  }
}
```

> Todos los agentes hijos (Steps 1-7) leen `session_config` desde este manifiesto sin recargar `appapi.yaml`.

---

## 3. Inventario de Entradas

| ID | Fuente | Tipo | Utilidad | Observaciones |
|---|---|---|---|---|
| SRC-001 | {filename} | {hu | openapi | postman} | {high | medium | low} | {observación} |

---

## 4. Partición en Work Items

**Criterio aplicado:** {H1-funcional-layer | H2-resource | H3-capability | H4-endpoint}

**Justificación:** {criterion_justification}

| WI | Título | Endpoints | RN cubiertas | Inputs | CPs estimados |
|---|---|---|---|---|---|
| wi-001 | {title} | {endpoints} | {rules} | {inputs} | {count} |

---

## 5. Dependencias y Orden de Activación

```text
{grafo ASCII con flechas →}
wi-001 → wi-002 → wi-003
```

**Niveles topológicos:**

| Nivel | WIs | Paralelizables |
|---|---|---|
| 0 | wi-001 | sí (solo 1) |
| 1 | wi-002 | sí (solo 1) |
| 2 | wi-003 | sí (solo 1) |

**Plan de paralelismo por step:** {step_activation_plan resumen}

---

## 6. Plan de Activación de Fases

| Fase | Sub-fase / Módulo | Switch | Estado | Orden |
|---|---|---|---|---|
| Fase 2 — Analyze | 2A funcional (hu-parser → normalizer → gap-detector) | `step_1: true` | `enabled` | 1 (paralelo con 2B) |
| Fase 2 — Analyze | 2B técnica (openapi-parser → contract-hasher → delta-detector) | `step_2: true` | `enabled` | 1 (paralelo con 2A) |
| Fase 3 — Design | 3A test-plan (istqb-test-techniques → risk-scorer) | `step_3: true` | `enabled` | 2 (tras Fase 2) |
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
| wi-001 | `full_pipeline` | Tras Step 2, según `delta_status` se confirma o ajusta |
| wi-002 | `full_pipeline` | idem |
| wi-003 | `full_pipeline` | idem |

---

## 8. Preguntas Abiertas Consolidadas

| ID | WI afectado | Criticidad | Pregunta |
|---|---|---|---|
| Q-001 | Global | **Alta — bloquea Step 2** | {pregunta} |
| Q-002 | wi-001 | Media | {pregunta} |

---

## 9. Protocolo de Rate Limit

```
rate_limit_protocol: "ante señales de límite de tokens, escribir artefacto parcial
con status: 'partial' e interrupted_at antes de pausar; notificar al orquestador
antes de detener cualquier actividad. Detalle: .claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Rate Limit Protocol)"
```

---

## 10. Próximo Paso Recomendado

**Acción inmediata:** {según estado inicial}

- Si `ready` → "Activar Steps 1 + 2 en paralelo para los {N} WIs. Comando: `/asdd:qa-analyze`."
- Si `needs_info` → "Resolver preguntas medias antes de activar. Las altas no bloquean — se procesan como supuestos iniciales."
- Si `blocked` → "Resolver Q-{NNN} con criticidad alta antes de continuar. La corrida queda en `status: blocked`."

**Agentes a invocar:** según corresponda

---

*asdd-atf-api-qa-engineer | Fase 1 — Bootstrap | {run_id} | {ISO date}*
