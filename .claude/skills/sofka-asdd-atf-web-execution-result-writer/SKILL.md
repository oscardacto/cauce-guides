---
name: sofka-asdd-atf-web-execution-result-writer
description: Escribe el resultado de ejecución por flow y el cierre al Orchestrator. Modo aggregate_batch para merge incremental por módulo.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Modos

| Mode | Invocador | Propósito |
|---|---|---|
| (default / `per_flow`) | executor | Escribe un `{flow_id}_{executor_type}_result.json` por flow ejecutado |
| `aggregate_batch` | executor (Firma B, fast-path) | Agrega los resultados de UN batch heterogéneo en N `module_result.json` — uno por cada `module_id` distinto presente |

## Modo `aggregate_batch` (fast-path)

Invocado por el executor al final de un batch (Firma B) para actualizar los
`module_result.json` afectados SIN pisar batches previos del mismo módulo.

### Invocación

```bash
echo '<JSON input>' | node .claude/tools/aggregate-batch-results.js
```

### Input

```json
{
  "run_folder": "docs/testing/atf-web/{run_id}/",
  "batch_id": 2,
  "custom_tags": ["@cp:CP-M1-001", "..."],
  "evidence_mode": "all",
  "batch_results": [
    {
      "cp_id": "CP-M1-001",
      "module_id": "M1",
      "status": "PASS",
      "duration_ms": 3200,
      "failed_step": null,
      "error_message": null,
      "evidence_dir": "execution/M1/001/",
      "steps_total": 6,
      "steps_passed": 6,
      "executed_at": "2026-04-19T12:00:00Z",
      "risk_level": "critical"
    }
  ]
}
```

### Contrato de merge

Por cada `module_id` distinto presente en `batch_results`:

1. Lee `execution/{module_id}/module_result.json` si existe (preserva results previos).
2. Lee `design/cp_modulo_{module_id}.json` para contadores totales y risk levels.
3. Merge por `cp_id`:
   - Si el CP ya estaba → el nuevo lo **sobreescribe** (re-run).
   - Si el CP es nuevo → se agrega a `results[]`.
4. Recalcula `summary`, `coverage_by_risk`, `verdict`, `failed_cps`, `bug_candidates_emitted`.
5. Escribe con **schema canónico** (sin campos legacy).

### Output

```json
{
  "modules_updated": ["M1", "M4"],
  "files_written": ["execution/M1/module_result.json", "execution/M4/module_result.json"],
  "per_module": {
    "M1": { "total_cps": 10, "executed": 5, "passed": 5, "failed": 0, "verdict": "CERTIFIED" },
    "M4": { "total_cps": 10, "executed": 1, "passed": 1, "failed": 0, "verdict": "INCOMPLETE" }
  },
  "warnings": []
}
```

### Verdict (mismo modelo que executor PASO 5)

| Condición | Veredicto |
|---|---|
| `blocked > 50% del total` | `BLOCKED` |
| Cualquier critical o high falló, o pass_rate < 60% | `FAIL` |
| critical=100% · high≥90% · pass_rate≥80% | `CERTIFIED` |
| critical≥80% · pass_rate≥60% | `CONDITIONAL` |
| Else | `INCOMPLETE` |

### Schema del output `module_result.json` (canónico

Campos OBLIGATORIOS top-level: `module_id`, `module_name`, `run_id`,
`executor_instance`, `tag_filter_applied`, `risk_override_applied`,
`evidence_mode`, `executed_at`, `summary`, `results[]`, `coverage_by_risk`,
`verdict`, `verdict_rationale`, `failed_cps[]`, `bug_candidates_emitted[]`,
`headless_results_path`, `evidence_dir`, `nav_learning`, `last_batch_id`.

**PROHIBIDOS** (removidos: `fail_by_design_confirmed`,
`fail_by_design_unexpected_pass`, `defects_confirmed`,
`bugs_confirmed_from_explorer`, `bugs_created_by_executor`,
`automation_scripts`, `smoke_blocker`.

Ver `.claude/atf-web-steps/execute.md` § "VALIDACIÓN OBLIGATORIA" para detalle.

---

## Modo `per_flow` (default)

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `run_id` | string | ID de la sesión |
| `flow_id` | string | ID del flow ejecutado |
| `executor_type` | string | `functional` · `exploratory` · `responsive` · `performance` · `ux` · `a11y` |
| `scenarios_results` | array | Resultados de cada escenario — pasado YA parseado en memoria; el skill NO lee `headless_results.json` del disco  |
| `executor_specific_data` | object | Datos adicionales propios del executor |
| `execution_metadata` | object | Timing, versión de app, viewport usado |

---

## PASO 1 — Calcular métricas

```
total_scenarios = count(scenarios_results)
pass_count      = count(where result == "PASS")
fail_count      = count(where result == "FAIL")
blocked_count   = count(where result == "BLOCKED")
skip_count      = count(where result == "SKIP")
pass_rate       = (pass_count / (total_scenarios - skip_count)) × 100
```

## PASO 2 — Veredicto del flow

| Condición | Veredicto |
|-----------|-----------|
| pass_rate == 100% | `PASS` |
| pass_rate ≥ 80% y sin FAIL en escenarios @smoke | `PASS_WITH_OBSERVATIONS` |
| pass_rate < 80% o algún FAIL en escenario @critical | `FAIL` |
| blocked_count > 50% del total | `BLOCKED` |
| Defecto P1 encontrado (severity crítica) | `FAIL` — forzado, independiente del pass_rate |

## PASO 3 — JSON de resultado del flow

```json
{
  "result_id": "{executor_type}_{flow_id}_{run_id}",
  "run_id": "run_2024_001", "flow_id": "flow_001", "executor_type": "functional",
  "verdict": "FAIL",
  "execution_metadata": {
    "started_at": "2024-01-15T14:25:00Z", "completed_at": "2024-01-15T14:35:22Z",
    "duration_seconds": 622, "app_version": "v2.3.1",
    "browser": "chromium", "viewport": { "width": 1440, "height": 900 }
  },
  "coverage": {
    "total_scenarios": 6, "pass": 4, "fail": 1, "blocked": 1, "skip": 0, "pass_rate": 80.0
  },
  "defects_found": [
    { "defect_id": "DEF-run001-001",
      "title": "Mensaje de bienvenida no muestra nombre del usuario",
      "severity_hint": "high", "scenario_id": "sc_001", "evidence_ref": "sc_001_step_02_fail.png" }
  ],
  "executor_specific_data": {},
  "scenarios_detail": []
}
```

## PASO 4 — executor_specific_data por tipo

**functional:**
```json
{ "gherkin_scenarios_executed": 6, "api_calls_validated": 3, "api_calls_with_errors": 0 }
```

**exploratory:**
```json
{ "charter_id": "charter_flow_001", "session_duration_min": 20,
  "findings": [
    { "finding_id": "EXP-001", "type": "bug", "title": "...", "severity": "medium", "screenshot": "..." },
    { "finding_id": "EXP-002", "type": "improvement", "title": "...", "severity": "low", "screenshot": "..." }
  ],
  "areas_covered": ["login form", "error messages", "session timeout"] }
```

**responsive:**
```json
{ "viewports_tested": ["mobile_375", "tablet_768", "desktop_1440"],
  "layout_issues": [
    { "viewport": "mobile_375", "issue": "overflow horizontal en tabla de resultados", "screenshot": "..." }
  ] }
```

**performance:**
```json
{ "core_web_vitals": {
    "lcp_ms": 2100, "lcp_status": "good",
    "fid_ms": 45,   "fid_status": "good",
    "cls_score": 0.08, "cls_status": "good"
  },
  "api_timings": [
    { "endpoint": "POST /api/login",   "avg_ms": 342, "status": "good" },
    { "endpoint": "GET /api/orders",   "avg_ms": 780, "status": "needs_improvement" }
  ] }
```

**ux:**
```json
{ "heuristics_evaluated": 10,
  "heuristic_scores": [
    { "heuristic_id": 1, "name": "Visibilidad del estado del sistema", "score": 80, "findings": [] },
    { "heuristic_id": 6, "name": "Reconocimiento en lugar de recuerdo", "score": 55, "findings": ["Iconos sin etiquetas de texto"] }
  ],
  "ux_score": 74.5 }
```

**a11y:**
```json
{ "wcag_level": "AA", "criteria_evaluated": 25, "criteria_passed": 22, "criteria_failed": 3,
  "a11y_score": 88.0,
  "violations": [
    { "criterion": "1.1.1", "description": "Imagen sin texto alternativo",
      "severity": "critical", "element": "img.logo", "screenshot": "..." }
  ] }
```

## PASO 5 — Rutas de escritura

Por flow:
```
docs/testing/atf-web/{run_id}/execution/{flow_id}_{executor_type}_result.json
```

Resultados globales (no por flow):
```
.../execution/exploratory_findings.json
.../execution/responsive_results.json
.../execution/performance_results.json
.../execution/ux_heuristic_report.json
.../execution/a11y_results.json
```

## PASO 6 — Reporte de cierre al Orchestrator

```
✅ [EXECUTOR: {executor_type}] Flow: {flow_id} | Veredicto: {verdict}
   Escenarios: {pass}/{total} PASS | Defectos: {defect_count}
   Resultado: docs/testing/atf-web/{run_id}/execution/{filename}
   Tiempo: {duration_seconds}s

❌ [EXECUTOR: {executor_type}] Flow: {flow_id} | Veredicto: FAIL
   Escenarios fallidos: {fail_count}/{total} | Defectos P1: {p1_count}
   Evidencia: docs/testing/atf-web/{run_id}/execution/failed_evidence/{flow_id}/
```

---

## Output

```json
{ "result_file_path": "docs/testing/atf-web/run_2024_001/execution/flow_001_functional_result.json",
  "verdict": "FAIL", "defects_count": 1, "pass_rate": 80.0 }
```
