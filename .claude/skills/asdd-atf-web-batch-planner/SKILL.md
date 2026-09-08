---
name: asdd-atf-web-batch-planner
description: Divide cp_targets[] en batches ordenados por riesgo y agrupados por módulo, con estimación de duración.
used_by:
  - command_exec
  - asdd-atf-web-qa-engineer
---

## Invariantes del plan

1. Los CPs `critical` siempre ocupan los primeros batches.
2. Dentro del mismo nivel de riesgo, los CPs del mismo módulo son contiguos.
3. Ningún batch excede `batch_size`.
4. El plan es determinista — mismo input produce mismo output.

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `cp_targets` | `[{module_id, cp_id}]` | CPs a ejecutar (orden irrelevante — el skill ordena). |
| `batch_size` | number | Máximo de CPs por batch (leído de `appweb.yaml` → `fast_path.batch_size`). |
| `run_folder` | string | Ruta al run para leer `design/cp_modulo_{module_id}.json`. |

## Invocación

```bash
echo '<JSON input>' | node .claude/tools/plan-batches.js
```

Donde el JSON es exactamente:

```json
{
  "cp_targets": [
    { "module_id": "M1", "cp_id": "CP-M1-001" },
    { "module_id": "M1", "cp_id": "CP-M1-006" },
    { "module_id": "M4", "cp_id": "CP-M4-005" },
    { "module_id": "M5", "cp_id": "CP-M5-005" }
  ],
  "batch_size": 3,
  "run_folder": "docs/testing/atf-web/MiApp-v1.0-20260101-0900/"
}
```

Stdout emite JSON con la estructura del output (ver sección siguiente).

## Output

```json
{
  "batches": [
    [
      { "module_id": "M1", "cp_id": "CP-M1-001", "risk_level": "critical" },
      { "module_id": "M1", "cp_id": "CP-M1-006", "risk_level": "critical" },
      { "module_id": "M4", "cp_id": "CP-M4-005", "risk_level": "critical" }
    ],
    [
      { "module_id": "M5", "cp_id": "CP-M5-005", "risk_level": "critical" },
      { "module_id": "M5", "cp_id": "CP-M5-001", "risk_level": "medium" }
    ]
  ],
  "total_batches": 2,
  "stats": {
    "total_cps": 5,
    "by_risk":   { "critical": 4, "high": 0, "medium": 1, "low": 0, "unknown": 0 },
    "by_module": { "M1": 2, "M4": 1, "M5": 2 }
  },
  "estimated_duration_min": 6.9,
  "warnings": []
}
```

## Contrato de ordenamiento

El script aplica estas reglas en cascada, sort estable:

1. **`risk_level`** (ascendente): `critical < high < medium < low < unknown`.
2. **`module_id`** (alfabético): CPs del mismo módulo quedan contiguos dentro del mismo nivel de riesgo.
3. **`cp_id`** (alfabético): orden estable dentro del mismo módulo+riesgo.

Después del sort flat, divide en chunks de `batch_size`.

## Estimación de duración

`estimated_duration_min` es grueso — asume:

| Risk level | Minutos por CP |
|---|---|
| critical | 1.5 |
| high     | 1.2 |
| medium   | 0.9 |
| low      | 0.7 |
| unknown  | 1.0 |

## Warnings

El output incluye un array `warnings` (puede estar vacío). Casos conocidos:

- `CP {cp_id} no encontrado en cp_modulo_{module_id}.json` — el CP está en
  `cp_targets` pero no existe en el diseño. El script le asigna `risk_level=unknown`
  y el executor debería marcarlo BLOCKED al encontrarlo.
- `cp_modulo_{module_id}.json no legible` — el archivo no existe o es inválido.
  Todos los CPs de ese módulo quedan en `unknown`.

`/asdd:qa-web-exec` DEBE loguear los warnings al usuario antes de ejecutar los batches.

## Reglas de uso

- **Invocar UNA vez por run** al inicio del fast-path (después de derivar
  `cp_targets` desde `custom_tags`). No volver a invocar entre batches.
- **No asumir idempotencia runtime:** si el QA cambia `cp_modulo_*.json` entre
  dos invocaciones de `/asdd:qa-web-exec`, los risk_levels pueden diferir.
- **No depender del orden interno de `batches[i][]`** más allá del contrato
  de ordenamiento declarado arriba — si el contrato se relaja en el futuro,
  puede cambiar sin aviso.

## Exit codes

| Exit | Significado |
|---|---|
| 0 | OK — output válido en stdout |
| 1 | Input inválido (stdin vacío, JSON malformado, campos requeridos ausentes) |
| 2 | Error de filesystem (no se pudo leer input file) |
