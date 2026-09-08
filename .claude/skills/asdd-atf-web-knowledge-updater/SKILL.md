---
name: asdd-atf-web-knowledge-updater
description: Merge incremental de module_verdicts, cp_registry y cp_index en agent-memory tras la ejecución.
used_by:
  - asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `mode` | `"full"` \| `"verdicts"` \| `"cp_registry"` \| `"indices"` | Qué registros actualizar |
| `project_root` | string | Raíz del proyecto |
| `module_id` | string | ID del módulo |
| `run_id` | string | ID del run |
| `module_result_path` | string | Ruta a module_result.json |
| `headless_results_path` | string | Ruta a headless_results.json |
| `output_dir` | string | Directorio execution/{module_id}/ |

---

## mode: full — Ejecutar todas las partes en secuencia

Ejecuta Parte 1 → Parte 2 → Parte 3 en orden.

---

## Parte 1 — module_verdicts.json

1. Leer `{project_root}/.claude/agent-memory/{app_name}/module_verdicts.json`.
   - Si no existe → inicializar: `{ "verdicts": [] }`

2. Construir entrada desde `module_result.json`:
   ```json
   {
     "run_id": "{run_id}",
     "module_id": "{module_id}",
     "verdict": "{verdict de module_result.json}",
     "coverage_pct": "{coverage_critical}",
     "total_cps": "{summary.total_cps}",
     "pass": "{summary.passed}",
     "fail": "{summary.failed}",
     "fecha": "{timestamp ISO}"
   }
   ```

3. Append al array `verdicts`. Escribir.

---

## Parte 2 — cp_registry.json (execution_history)

> Leer justo antes de escribir — no cachear lectura previa.
> Optimización B2: usar cp_index.json para filtrar qué CPs existen antes de leer el registro completo.

1. Leer `{project_root}/.claude/agent-memory/{app_name}/cp_index.json` (si existe).
   - Filtrar `headless_results.json → results[]` a solo los `cp_id` presentes en `cp_index.cps`.
   - Si ningún cp_id está en el índice → saltar lectura de cp_registry.json.
   - Si cp_index.json no existe → continuar normalmente.

2. Leer `{project_root}/.claude/agent-memory/{app_name}/cp_registry.json`.
   - Si no existe → inicializar: `{ "cps": {} }`

3. Para cada CP en `headless_results.json → results[]`:
   - Si `cp_id` existe en registry → append a `execution_history`:
     ```json
     { "run_id": "{run_id}", "status": "{PASS|FAIL|BLOCKED}", "executed_at": "{executed_at}" }
     ```
   - Si cp_id **NO existe** en registry → **crear nueva entrada** con el historial inicial:
     ```json
     { "cp_id": "{cp_id}", "module_id": "{module_id_derivado}", "execution_history": [
       { "run_id": "{run_id}", "status": "{status}", "executed_at": "{executed_at}" }
     ] }
     ```
     > ℹ️ CPs nuevos (primer run) no necesitan haber sido creados por design-team para ser registrados. El executor es la fuente de verdad de ejecución.
   - No modificar ningún otro campo en entradas existentes

4. Escribir `cp_registry.json` actualizado.

---

## Parte 3 — cp_index.json

> Merge incremental — nunca reconstruir desde cero.

1. Leer `{project_root}/.claude/agent-memory/{app_name}/cp_index.json`.
   - Si no existe → inicializar: `{ "updated_at": "", "last_run_id": "", "cps": {} }`

2. Para cada CP en headless_results.json:
   - `cps[cp_id]` = `{ "status": "active", "last_verdict": "{PASS|FAIL|...}", "last_run_id": "{run_id}" }`
   - Si ya existía → solo actualizar `last_verdict` y `last_run_id`

3. Para CPs marcados deprecated → actualizar `status: "deprecated"`.

4. Actualizar `updated_at` y `last_run_id`. Escribir.

---

## Output

```
✅ knowledge/ actualizado:
   module_verdicts.json — veredicto {verdict} registrado
   cp_registry.json — {N} CPs con execution_history actualizado
   cp_index.json — {N} entradas
```

```json
{
  "verdicts_updated": true,
  "cp_registry_updated": true,
  "indices_updated": true
}
```
