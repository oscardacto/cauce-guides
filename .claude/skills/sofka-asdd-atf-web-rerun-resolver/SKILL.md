---
name: sofka-asdd-atf-web-rerun-resolver
description: Resuelve CP-IDs a re-ejecutar desde custom_tags, limpia artefactos previos y prepara rerun_targets.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `custom_tags` | `string[]` | Filtro completo heredado de `session_context` (todos los tags, no solo `@cp:*`) |
| `is_continuation` | boolean | `true` si el run_id apunta a un run existente |
| `module_id` | string | Módulo que está siendo procesado por esta instancia |
| `execution_dir` | string | Ruta al directorio de ejecución del módulo (`{run_folder}/execution/{module_id}/`) |
| `run_id` | string | ID del run actual |

---

## Proceso

### 1. Pre-checks

- Si `is_continuation` es `false` → retornar `{ rerun_targets: null, reason: "fresh_run" }` y terminar.
- Si `custom_tags` está vacío → retornar `{ rerun_targets: null, reason: "no_filter" }` y terminar.

### 2. Extracción de CP-IDs explícitos

Filtrar `custom_tags` quedándose solo con entradas que cumplan el patrón regex:
```
^@cp:CP-[A-Za-z0-9_]+-.+$
```

Extraer el CP-ID removiendo el prefijo `@cp:`:
- `"@cp:CP-Matriz_1-12,01,1"` → `"CP-Matriz_1-12,01,1"`
- `"@cp:CP-M1-003"` → `"CP-M1-003"`

Si 0 CPs extraídos → retornar `{ rerun_targets: null, reason: "no_cp_explicit" }`.

### 3. Filtro por módulo

De los CP-IDs extraídos, quedarse solo con los que pertenecen a `module_id`. El
`module_id` del CP está codificado entre el primer `-` y el último `-`:
- `"CP-Matriz_1-12,01,1"` → module_id extraído: `"Matriz_1"`
- `"CP-M1-003"` → module_id extraído: `"M1"`

Si 0 CPs pertenecen a `module_id` → retornar `{ rerun_targets: null, reason: "other_modules" }`.

### 4. Cleanup de artefactos previos (BATCH)

Ejecutar UNA sola invocación con TODOS los CP-IDs del módulo. No invocar
`reset-cp-artifacts.js` por CP (cada invocación de Node tiene ~300ms de startup).

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/reset-cp-artifacts.js \
  --execution-dir "{execution_dir}" \
  --design-dir "{design_dir}" \
  --cp-ids '<JSON array COMPLETO de cp_ids filtrados>'
```

> ⚠️ `--design-dir` es obligatorio para detectar módulos multi-palabra
> (admin-organization, email-config). Sin él, la limpieza de slugs legacy
> queda silenciada.

El script borra recursivo la carpeta `{slug}/` de cada CP del batch (no se
archiva a `{slug}_rerunN/` — comportamiento eliminado. El historial
de ejecuciones vive en `cp_registry.execution_history` y en ALM.

Antes de borrar aplica REGLA 2.1 (detección/renombrado automático de slugs
legacy). Acepta el array completo y agrupa por módulo internamente.

Interpretar exit code:
- `0` → limpieza exitosa, `cleanup_completed: true`
- `1` → error, retornar `{ rerun_targets: null, reason: "cleanup_failed", error: "..." }`
  y el executor debe abortar con mensaje al usuario.

### 5. Construir y retornar rerun_targets

```json
{
  "rerun_targets": {
    "cp_ids": ["CP-Matriz_1-12,01,1"],
    "module_ids_affected": ["Matriz_1"],
    "reason": "custom_tags:explicit",
    "cleanup_completed": true
  },
  "reason": "ok"
}
```

El executor usa este objeto en:
- PASO 0.5 (cleanup batch): ya aplicado por este mismo skill al invocar `reset-cp-artifacts.js`.
- PASO 1.3 (construcción de `cps_to_execute`): los CPs ya vienen pre-resueltos desde `exec_context.cp_targets_resolved[]` por el preflight; `rerun_targets` solo aporta trazabilidad.
- PASO knowledge-updater post-run: `rerun_targets.reason` se persiste en `cp_registry.execution_history` para trazabilidad.

---

## Output

Esquema (JSON devuelto por el skill al agente que lo invoca):

```json
{
  "rerun_targets": { "cp_ids": [...], "module_ids_affected": [...], "reason": "...", "cleanup_completed": true } | null,
  "reason": "ok" | "fresh_run" | "no_filter" | "no_cp_explicit" | "other_modules" | "cleanup_failed",
  "error": "<mensaje si reason=cleanup_failed, si no null>"
}
```


