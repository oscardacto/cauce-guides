---
name: sofka-asdd-atf-web-checkpoint-writer
description: Escribe checkpoint.json del pipeline ATF Web por fase y por módulo, y lo elimina al completar.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

# sofka-asdd-atf-web-checkpoint-writer

## Contrato del archivo

Ubicación: `{run_folder}/checkpoint.json`. Estructura canónica (no escribir manualmente):

```json
{
  "run_id": "{run_id}",
  "pipeline_start": "{ISO timestamp}",
  "last_completed_phase": "1C",
  "next_phase": "1D",
  "phases_completed": ["0", "1", "1C"],
  "phases_remaining": ["1D", "1E", "2A", "2B", "2C", "CONSOLIDACION"],
  "modules_completed": [],
  "modules_remaining": [],
  "last_checkpoint_at": "{ISO timestamp}",
  "agent_call_log_snapshot": []
}
```

Fases válidas (en orden): `0 | 1 | 1C | 1D | 1E | 2A | 2B | 2C | CONSOLIDACION | 3`

---

## Modo WRITE — Escribir checkpoint tras una fase

Invocar como:
```
[SKILL: sofka-asdd-atf-web-checkpoint-writer | mode: write
  | run_id: {run_id}
  | run_folder: {path}
  | last_phase: {phase}
  | pipeline_start: {ISO}
  | agent_log: {json_array}?
  | modules_completed: {json_array}?
  | modules_remaining: {json_array}?
]
```

Equivale a:
```bash
node .claude/tools/generate-checkpoint.js \
  --run-id         "{run_id}" \
  --run-folder     "{run_folder}" \
  --last-phase     "{phase}" \
  --pipeline-start "{pipeline_start_time}" \
  [--agent-log          '{agent_call_log_json}'] \
  [--modules-completed  '{["M1","M2"]}'] \
  [--modules-remaining  '{["M3","M4"]}']
```

**Reglas de escritura:**
1. Invocar **después** de verificar que los outputs de la fase existen en disco.
2. En FASE 2C, invocar **después de cada módulo completado** con `modules_completed`/`modules_remaining` actualizados — no esperar al final de toda la fase.
3. `agent_call_log_snapshot` preserva telemetría cross-sesión; pasarlo como `--agent-log` solo si el orquestador mantiene un log local vivo.

**Macro de log** tras cada escritura exitosa:
```
📌 CHECKPOINT: {fase} completada → checkpoint.json actualizado
```

---

## Modo DELETE — Eliminar checkpoint

Invocar como `[SKILL: sofka-asdd-atf-web-checkpoint-writer | mode: delete | run_folder: {path}]`.

Equivale a:
```bash
node .claude/tools/generate-checkpoint.js --run-folder "{run_folder}" --delete
```

**Cuándo invocar:**
- Al completar CONSOLIDACIÓN FINAL exitosamente (el run terminó — todas las fases activas en `pipeline.fase_*` se ejecutaron)
- **NO invocar** si quedan fases pendientes para una sesión posterior (apagar `pipeline.fase_*: false` en sesión 1 implica reanudación) — el checkpoint debe preservarse para reanudar

---

## Modo ANNOTATE — Registrar re-ejecución

Invocar como:
```
[SKILL: sofka-asdd-atf-web-checkpoint-writer | mode: annotate
  | run_folder: {path}
  | phase: {N}
  | note: "{fecha} — {motivo breve} ({métricas delta})"
]
```

Agrega o sobrescribe el campo `phase_{N}_rerun` en `checkpoint.json`. Ejemplo resultante:
```json
"phase_0_rerun": "2026-03-24 — FRS bajó con HU-004 nueva (FRS 78→62, GATE READY→CONDITIONAL)"
```

Este modo no recalcula `phases_completed` ni `next_phase` — solo añade metadata de trazabilidad.
