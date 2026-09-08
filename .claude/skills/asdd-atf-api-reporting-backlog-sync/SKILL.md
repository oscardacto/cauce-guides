---
name: asdd-atf-api-reporting-backlog-sync
description: Produce defects-ready-for-jira-ado.json con los bugs clasificados. NO publica en Jira ni ADO.
used_by:
  - asdd-atf-reporting-qa-engineer
---

## Propósito

Transformar los defectos clasificados como `bug` en items estructurados para los sistemas de backlog del cliente (Jira o Azure DevOps), siguiendo sus convenciones de campos y prioridades.

**Principio:** este skill **no escribe en Jira/ADO directamente** — esa decisión es del cliente. Produce un JSON intermedio que herramientas posteriores pueden consumir (jira CLI, az boards CLI, integraciones internas).

## Cuándo invocar

Tras `qgs-evaluator`. Tercer y último skill del agente de Reporting por corrida.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `run_id` | string | Run ID |
| `defects[]` | array | Defectos clasificados (todos, no solo bugs) |
| `backlog_target` | enum | `jira` \| `ado` \| `both` |
| `session_config` | object | Para metadata (app.name, environment) |
| `project_key` | string | Para Jira: `CLIENTEEJEMPLO`; para ADO: `ClienteEjemplo-Billing` |

## Mapeo de defectos a items

### Solo se promueven

- Defectos con `category: bug` (no `precondition`, `env_issue`, `script_issue`, `flaky`)
- Defectos con `promoted_to_backlog: false` (no duplicar)
- Defectos con evidencia completa

### Mapeo de campos — Jira

| Campo defecto | Campo Jira |
|---|---|
| `title` | summary |
| `description + evidence_summary` | description (Markdown) |
| `severity` | priority (`critical → Highest`, `high → High`, `medium → Medium`, `low → Low`) |
| `rule_violated` | custom field `Rule-Violated` |
| `cp_id`, `wi_id`, `run_id` | labels |
| `evidence_path` | link en description |
| issue type | `Bug` |
| `project_key` | project |
| Component sugerido | derivar del `wi_id` y mapping `wi-001 → Solicitud, wi-002 → Batch, wi-003 → Consolidación` |

### Mapeo de campos — Azure DevOps

| Campo defecto | Campo ADO |
|---|---|
| `title` | System.Title |
| `description + evidence_summary` | System.Description (HTML) |
| `severity` | Microsoft.VSTS.Common.Severity (`1 - Critical`, `2 - High`, `3 - Medium`, `4 - Low`) |
| `cp_id`, `wi_id`, `run_id` | System.Tags (CSV) |
| issue type | `Bug` |
| Iteration/Area | derivar del `wi_id` |

## Proceso

1. Filtrar `defects[]` por `category: bug && promoted_to_backlog: false`.
2. Para cada defecto:
   2.1. Generar item según `backlog_target`.
   2.2. Validar campos requeridos del template.
3. Producir `defects-ready-for-jira-ado.json` con la lista completa.
4. (Importante) **NO** mutar los `D-NNN.json` originales — la promoción real (cuando el cliente la confirma) se registra en una operación separada.

## Output

```json
{
  "run_id": "{run_id}",
  "generated_at": "{ISO 8601}",
  "backlog_target": "jira | ado | both",
  "total_defects_to_promote": 4,
  "items_for_jira": [
    {
      "defect_ref": "D-001",
      "issue_type": "Bug",
      "project": "CLIENTEEJEMPLO",
      "summary": "[ATF-API] POST /pending-billing-quotas devuelve 500 cuando falta cycle",
      "description": "## Descripción\n\nEl servicio responde 500 con NullPointerException cuando se omite el campo `cycle`. La RN-001 + contrato OpenAPI exigen 400 con `MISSING_REQUIRED_FIELD`.\n\n## Evidencia\n\n- Request: `POST /osf/api/v1/pending-billing-quotas` (sin cycle)\n- Response observado: `500 INTERNAL_SERVER_ERROR` con NPE\n- Response esperado: `400 BadRequest` con `error: MISSING_REQUIRED_FIELD`\n- Path completo: `docs/testing/atf/{run_id}/execution/evidence/CP-004/`\n\n## Reproducibilidad\n\nAlways. Reproducido en 2 ejecuciones consecutivas.\n\n## Detalle técnico\n\nNPE en `BillingRequestValidator.checkCycle` (visible en response — también es hallazgo de seguridad menor: expone stack interno).\n\n## Trazabilidad\n\n- ATF Run ID: {run_id}\n- CP: CP-004\n- WI: wi-001\n- RN violada: RN-001",
      "priority": "High",
      "labels": ["atf-api", "run:{run_id}", "cp:CP-004", "wi:wi-001"],
      "components": ["Solicitud de ejecución"],
      "customfields": {
        "Rule-Violated": "RN-001"
      },
      "reporter": "atf-api-bot",
      "source_artifact": "docs/testing/atf/{run_id}/execution/defects/D-001.json"
    }
  ],
  "items_for_ado": [
    {
      "defect_ref": "D-001",
      "workItemType": "Bug",
      "fields": {
        "System.Title": "[ATF-API] POST /pending-billing-quotas devuelve 500 cuando falta cycle",
        "System.Description": "<h2>Descripción</h2>...",
        "System.AreaPath": "ClienteEjemplo-Billing\\Solicitud",
        "System.IterationPath": "ClienteEjemplo-Billing\\Sprint 2026-05",
        "Microsoft.VSTS.Common.Severity": "2 - High",
        "System.Tags": "atf-api; run:{run_id}; cp:CP-004; wi:wi-001"
      },
      "source_artifact": "docs/testing/atf/{run_id}/execution/defects/D-001.json"
    }
  ],
  "skipped_defects": [
    {"defect_ref": "D-005", "reason": "category: env_issue — no promueve"},
    {"defect_ref": "D-014", "reason": "category: flaky — no promueve"}
  ],
  "next_step": "Cliente debe revisar `defects-ready-for-jira-ado.json` y ejecutar herramienta de upload (jira CLI, az boards CLI). Tras confirmar upload, marcar manualmente los D-NNN como `promoted_to_backlog: true` con el item-ID real."
}
```

## Reglas duras

1. **No publicar automáticamente.** El archivo es el único output. Cualquier upload a Jira/ADO es responsabilidad del cliente.
2. **No re-promover.** Si un defecto ya tiene `promoted_to_backlog: true`, se omite con justificación en `skipped_defects[]`.
3. **Solo bugs.** `precondition` / `env_issue` / `script_issue` / `flaky` se reportan en `final-report.md` pero NO van al backlog del producto.
4. **Trazabilidad bidireccional.** El item lleva el `defect_ref` (D-NNN), y al confirmarse el upload, el `D-NNN.json` se actualiza con el item-ID externo.

## Cuándo NO invocar

- No hay bugs clasificados — devolver archivo vacío con explicación
- `cycle.type: retest` que valida un fix — el defecto del baseline se marca resolved, no se promueve uno nuevo

## Anti-patterns

- **Promover automáticamente** vía API a Jira/ADO. Cliente decide.
- **Items con título genérico** ("Test failure CP-004"). El título debe describir el bug, no el evento.
- **Descripción solo con stack trace.** La descripción tiene contexto, regla violada, comportamiento esperado.
- **Promover flaky.** Es ruido sistémico, no bug del producto.
- **Olvidar el `defect_ref`.** Sin él se pierde la trazabilidad al ATF.

## Referencias

- Templates: `templates/jira-item.template.json`, `templates/ado-workitem.template.json`
- Ejemplo: `examples/example-defects-ready-clienteejemplo.json`
