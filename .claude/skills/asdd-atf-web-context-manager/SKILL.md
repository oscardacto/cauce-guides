---
name: asdd-atf-web-context-manager
description: Genera context_summary.json para handoff multi-sesión y guía la recuperación de contexto al reanudar.
used_by:
  - asdd-atf-web-qa-engineer
---

## Modo WRITE — Generar context_summary.json

Invocar como `[SKILL: asdd-atf-web-context-manager | mode: write | ...]` con los parámetros:

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `run_folder` | string | Ruta al run actual (ej: `docs/testing/atf-web/{run_id}/`) |
| `run_id` | string | Identificador del run |
| `summary_for_phase` | string | Primera fase que ejecutará en la próxima sesión (ej: `"2C"`) |
| `phases_completed` | string[] | Fases ya completadas en este run |
| `key_facts` | string | Resumen compacto: módulos, totales de CPs, bugs hallados, métricas clave |
| `next_action` | string | Instrucción concreta para el próximo arranque |

### Output — `{run_folder}/context_summary.json`

```json
{
  "generated_at": "ISO",
  "run_id": "{run_id}",
  "summary_for_phase": "2C",
  "phases_completed": ["0", "1", "1C", "1D", "1E", "2A", "2B"],
  "key_facts": "5 módulos (employees 32 CPs, login 12, dashboard 8, reports 15, admin 9). Bugs exploratorios: BUG-001 P2, BUG-002 P3. A11y: 91/100. Performance: GOOD.",
  "next_action": "Iniciar FASE 2C desde módulo employees. Todos los CPs en design/cp_modulo_*.json. Credenciales en credentials.yaml.",
  "resume_instructions": "1. Abrir nuevo chat. 2. @.claude/commands/asdd/qa-web-run.md. 3. El orquestador detecta checkpoint.json y retoma desde next_phase automáticamente.",
  "context_cost_note": "Este archivo sintetiza el estado del run. Leer solo este archivo + checkpoint.json = contexto completo para reanudar (~0.5% de ventana vs ~5% releer artefactos)."
}
```

---

## Modo READ — Recuperar contexto al reanudar

Invocar como `[SKILL: asdd-atf-web-context-manager | mode: read | run_folder: {run_folder}]`

- Si `context_summary.json` existe → devolver su contenido JSON completo.
- Si no existe → devolver `{ "found": false, "message": "Sin context_summary.json — leer checkpoint.json directamente." }`

El orquestador usa este output para completar su banner de inicio cuando `{resume_from_phase}` ≠ null.

---

## Tabla de sesiones recomendadas

Referencia para decidir cómo apagar/encender los switches `pipeline.fase_*` en `appweb.yaml` entre sesiones:

| Sesión | Fases | Perfil | Razón |
|--------|-------|--------|-------|
| **Sesión 1** | 0 → 1 → 1C | Sin browser, análisis puro | Bajo consumo por mensaje. CPs diseñados sin screenshots acumulados. |
| **Sesión 2** | 1E → 2A → 2B | Browser intensivo | Screenshots + DOM aislados por agente. |
| **Sesión 3** | 2C | Ejecución por módulo, mayor acumulación | Cada módulo se delega a executor. Para apps grandes (>5 módulos) considerar una sub-sesión por módulo. |
| **Sesión 4** | 3 | Generación de scripts, sin browser | Moderado. Puede concatenarse con Sesión 3 en apps pequeñas. |
