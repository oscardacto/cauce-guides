---
description: ATF API fase Report — reporte ejecutivo, evaluación QGS y backlog para Jira o Azure DevOps. No publica.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar la fase **Report** del workflow ATF API.

## Prerrequisito

`checkpoint.json` con `status: ready_for_report` y artefactos del contrato de disco presentes (output de `/asdd:qa-execute`).

## Por qué este command apunta a un agente separado

El agente de Reporting (`asdd-atf-reporting-qa-engineer`) **no está unificado** con el pipeline. Consume exclusivamente el contrato de disco (no estado en memoria del productor) para que pueda ser reutilizado por futuros ATF (UI, mobile, etc.). Hoy lo invoca este command; a futuro `asdd-atf-ui-pipeline` u otros productores podrán invocarlo igual cumpliendo el mismo contrato.

## Instrucciones

1. Invocar `@asdd-atf-reporting-qa-engineer`.
2. **Pre-flight check obligatorio:** validar `checkpoint.json.status == "ready_for_report"` y que no haya defectos con `category == null`. Si falla → escalar al usuario sin escribir reporte.
3. El agente ejecuta:
   - `reporting-qgs-evaluator` → bloquea si hay defectos `bug` sin promover, sin clasificar, o flaky > 10%
   - `reporting-report-renderer` → renderiza `final-report.md` y `final-report.html`
   - `reporting-backlog-sync` → genera `defects-ready-for-jira-ado.json` con defectos `bug` clasificados
4. Actualizar checkpoint: `status: completed`.
5. Registrar entrada en `docs/testing/atf/runs_index.json` con métricas finales.

## Artefactos esperados

- `docs/qa/atf/{run_id}/final-report.md`
- `docs/qa/atf/{run_id}/final-report.html`
- `docs/qa/atf/{run_id}/qgs-evaluation.json`
- `docs/qa/atf/{run_id}/defects-ready-for-jira-ado.json`
- Entrada nueva en `docs/testing/atf/runs_index.json`

## Cierre

Si QGS PASS → corrida exitosa, ofrecer resumen al usuario.
Si QGS FAIL → indicar bloqueos, no marcar `completed` hasta resolución (puede requerir LIGHT via `/asdd:qa-do`).
