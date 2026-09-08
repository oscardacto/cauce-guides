---
name: asdd-atf-api-reporting-report-renderer
description: Renderiza el final-report ejecutivo en MD y HTML para stakeholders no técnicos.
used_by:
  - asdd-atf-reporting-qa-engineer
---

## Propósito

Producir el **documento que el cliente lee** al cierre de la corrida. Debe ser:

- **Conciso:** 1-2 páginas en versión markdown. La versión HTML es más rica pero igualmente focalizada.
- **Honesto:** flaky rate, gaps abiertos, defectos críticos — siempre visibles, nunca enterrados.
- **Trazable:** todo número proviene de un artefacto que se puede inspeccionar.

## Cuándo invocar

Tras `qgs-evaluator`. Segundo skill del agente de Reporting por corrida.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `run_id` | string | Run ID |
| `session_config` | object | Para metadata (app.name, url, version) |
| `run_manifest` | object | Para WIs y preguntas abiertas |
| `execution_results` | object | Output del execution-runner |
| `defects` | array | Defectos clasificados |
| `qgs_evaluation` | object | Veredicto y métricas |
| `regression_delta` | object | (opcional) Para corridas regression/fast-track |

## Estructura del `final-report.md`

```markdown
# ATF API — Reporte Final de Corrida

**Run ID:** {run_id}
**API:** {app.name} v{app.version}
**Entorno:** {app.environment}
**Tipo de ciclo:** {cycle.type}
**Fecha:** {YYYY-MM-DD}

## Veredicto

🟢 **PASS** | 🔴 **FAIL**

{1 frase resumiendo por qué}

---

## Cifras clave

| Métrica | Valor |
|---|---|
| Casos de prueba ejecutados | {total_cps} |
| Pass rate global | {pct}% |
| Pass rate críticos | {pct}% |
| Pass rate alta prioridad | {pct}% |
| Flaky rate | {pct}% |
| Defectos `bug` clasificados | {count} |
| Defectos promovidos a backlog | {count} |

## Distribución de defectos

| Categoría | Cantidad | Severidad alta |
|---|---|---|
| bug | 4 | 4 |
| env_issue | 1 | 0 |
| script_issue | 1 | 0 |
| flaky (alerta) | 2 | — |

## Defectos críticos (top 5)

| ID | WI | Título | Severidad | Backlog |
|---|---|---|---|---|
| D-001 | wi-001 | POST devuelve 500 cuando falta cycle | high | Jira:ATF-1234 |
| ... | | | | |

## QGS — métricas bloqueantes

(solo si verdict: FAIL)

| Métrica | Observado | Threshold | Acción |
|---|---|---|---|
| pass_rate_high | 77.8% | ≥ 80% | Fix defectos D-001 a D-004 |

## Comparación vs baseline

(solo si cycle: regression/fast-track)

- Regresiones nuevas: {count}
- Fixes confirmados: {count}
- Aún fallando: {count}

## Preguntas abiertas que persistieron

(traídas del run-manifest)

| Q-ID | Pregunta | Estado |
|---|---|---|
| Q-001 | URL base correcta | Resuelta antes de Step 2 |
| Q-003 | Esquemas de BD no disponibles | Sin resolver — afectó cobertura |

## Próximos pasos sugeridos

1. {acción}
2. {acción}

---

*Reporte generado por ATF API v3 — {ISO 8601}*
*Artefactos: `docs/testing/atf/{run_id}/`*
```

## Versión HTML

La versión HTML duplica el contenido del MD pero con:

- Charts simples (barras horizontales en SVG inline — sin librerías externas)
- Colores semafóricos para PASS/FAIL y severidades
- Links clickeables a evidencias y defectos
- Tabla expandible de defectos completa (no solo top 5)

Sin JavaScript externo, sin dependencias — todo inline para que el HTML funcione offline.

## Proceso

1. Cargar todos los inputs.
2. Calcular cifras agregadas desde `execution_results` y `defects[]`.
3. Renderizar `final-report.md` desde el template.
4. Renderizar `final-report.html` con la versión rica.
5. Escribir ambos archivos.
6. Devolver `render_result`.

## Output

```json
{
  "run_id": "{run_id}",
  "markdown_path": "docs/qa/atf/{run_id}/final-report.md",
  "html_path": "docs/qa/atf/{run_id}/final-report.html",
  "verdict_summary": "FAIL — 4 bugs high pendientes de fix y pass_rate_high bajo threshold",
  "size_kb": {"md": 4.2, "html": 12.8},
  "next_step": "asdd-atf-api-reporting-backlog-sync"
}
```

## Reglas duras

1. **Sin métricas escondidas.** Si flaky rate es 7%, aparece. Si hay 6 bugs, aparecen los 6.
2. **Sin valores absolutos sin contexto.** No "8 fallos" sin decir de cuántos totales.
3. **Veredicto explícito en la primera página.** El cliente no debe scrollear para saber PASS/FAIL.
4. **Trazabilidad.** Cada cifra puede rastrearse a `execution-results.json` o `defects/D-NNN.json`.
5. **Sin tonos optimistas falsos.** Si la corrida falló, el reporte no la disfraza.

## Cuándo NO invocar

- QGS no evaluado aún — bloquear
- Solo se quiere consultar reporte existente — abrir el archivo

## Anti-patterns

- **Mover defectos no resueltos al pie del reporte** "para no asustar." Visibilidad temprana = mejor priorización.
- **Reportes de 10 páginas con detalle exhaustivo.** El final-report es ejecutivo; el detalle vive en `docs/testing/atf/{run_id}/`.
- **Charts con datos manipulados** (escalas que minimizan problemas). Honestidad sobre estética.
- **HTML que requiere internet** (CDNs externos para CSS). Todo inline.

## Referencias

- Templates: `templates/final-report.md.template`, `templates/final-report.html.template`
- Ejemplo: `examples/example-final-report-clienteejemplo.md`
