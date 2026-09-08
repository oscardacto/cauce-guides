---
name: asdd-atf-web-instance-planner
description: Calcula instancias paralelas de Design y Executor, reparte módulos y genera execution_plan.json.
used_by:
  - asdd-atf-web-qa-engineer
---

## Inputs

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `modules[]` | Array | Módulos con `module_id`, `priority`, `hus[]` |
| `critical_flows[]` | Array | IDs de flujos críticos |
| `max_design_instances` | Integer | Límite instancias Design Team (config.yaml, default 4) |
| `max_executor_instances` | Integer | Límite instancias Executor Team (config.yaml, default 3) |
| `max_hus_per_design_instance` | Integer | HUs máx por instancia (config.yaml, default 20) |

## Proceso

**PASO 1 — Partir módulos de alto volumen:**
Si `len(M.hus) > max_hus_per_design_instance` → partir en sub-módulos de ≤max HUs (`{module_id}_a`, `_b`, etc.). Registrar `split_from`. Sub-módulos solo para Design — cada uno genera su propio `cp_modulo_*.json`.

**PASO 2 — Calcular instancias:**
```
módulos_efectivos = originales + sub-módulos
design_instances  = min(len(módulos_efectivos), max_design_instances)
executor_instances = min(len(módulos_efectivos), max_executor_instances)
```

**PASO 3 — Asignar (bin-packing por HU count):**
Ordenar por prioridad desc. Greedy: asignar cada módulo a instancia con menor carga acumulada.

**PASO 4 — Construir contrato:**
```json
{
  "design_instances": N, "executor_instances": M,
  "modules": [{ "module_id": "", "priority": 1, "hus": [], "hu_count": 0, "design_instance": 1, "executor_instance": 1, "split_from": null }],
  "critical_flows": [{ "flow_id": "", "entry_url": "", "name": "" }],
  "volume_stats": { "original_modules": N, "effective_modules": M, "total_hus": T, "splits_applied": [] },
  "coordination": { "design_expected_outputs": ["design/cp_modulo_*.json"], "instance_timeout_min": 45 }
}
```

**PASO 5 — Validar:**
- Cada módulo en exactamente 1 instancia Design y 1 Executor
- Ninguna instancia vacía
- Ninguna instancia excede `max_hus_per_design_instance`
- `design_expected_outputs` lista TODOS los `cp_modulo_*.json`

## Output

`{strategy_dir}/execution_plan.json` — leído por Orchestrator en FASE 1C y 2C.

## Reglas
- Nunca más instancias que módulos (instancia vacía = tokens sin valor)
- 1 módulo ≤ 20 HUs → sin partir
- Prioridad afecta orden dentro de instancia, no cantidad de instancias
- Sub-módulos heredan prioridad del original