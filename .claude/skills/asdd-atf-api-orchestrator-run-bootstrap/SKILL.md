---
name: asdd-atf-api-orchestrator-run-bootstrap
description: Inicializa la corrida ATF API — run_id, session_config, inventario de requirements/ y prerrequisitos por cycle.type.
used_by:
  - asdd-atf-api-orchestrator
---

## Propósito

Realizar el **arranque controlado** de una nueva corrida: derivar identidad, cargar configuración, descubrir inputs y dejar todo listo para que `work-item-partitioner` pueda actuar. Es siempre el primer skill que invoca el pipeline al recibir un `/asdd:qa-bootstrap` o `/asdd:qa-resume` sin checkpoint.

## Cuándo invocar

- Al inicio de `/asdd:qa-bootstrap`
- Al inicio de `/asdd:qa-regression`, `/asdd:qa-fast-track`, `/asdd:qa-retest` — los modos no-baseline siguen pasando por bootstrap para validar prerrequisitos específicos del ciclo
- **No invocar** en `/asdd:qa-resume` cuando ya existe `checkpoint.json` — ese flujo va directo a `shared-checkpoint-manager → read`

## Inputs

| Parámetro | Tipo | Requerido | Descripción |
|---|---|---|---|
| `project_root` | string | sí | Raíz del proyecto |
| `cycle_hint` | enum | no | Override del `cycle.type` (raro — sobrescribe appapi.yaml) |
| `pre_assigned_run_id` | string | no | Si el dashboard ASDD inyectó un run_id, usarlo verbatim |

## Proceso

### Paso 1 — Cargar configuración

Invocar `asdd-atf-api-shared-config-loader → load(project_root, agent_name="asdd-atf-api-orchestrator", phase="bootstrap")`.

Validar que el `session_config` devuelto tenga los mínimos requeridos:
- `app.url` válido
- `cycle.type` válido (`baseline` | `regression` | `fast-track` | `retest`)
- Para no-baseline: `cycle.baseline_run_id` apunta a una corrida existente bajo `docs/output/`
- Para `retest`: `cycle.defect_id` existe en el baseline

Si falta algo → escalar al usuario con el código de error específico (`CONFIG-001` a `CONFIG-005`).

### Paso 2 — Resolver `run_id`

- Si `pre_assigned_run_id` no vacío → usar ese tal cual (caso dashboard).
- Sino, si `appapi.yaml → run_id` no vacío → usar ese.
- Sino, derivar: `{kebab(app.name)}-v{app.version}-{YYYYMMDD}-{HHmm}` con timezone local.

Validar formato `[A-Za-z0-9-]+` y largo ≤ 80 chars.

### Paso 3 — Crear carpeta de output

`{project_root}/docs/testing/atf/{run_id}/` — crear si no existe. Si existe y tiene `checkpoint.json`, **abortar bootstrap** y delegar al flujo de reanudación.

### Paso 4 — Inventariar inputs

Listar archivos en `{project_root}/docs/testing/atf/requirements/` (recursivo). Clasificar por tipo:

| Tipo detectado | Extensiones | Utilidad |
|---|---|---|
| HU funcional | `.md`, `.txt`, `.docx`, `.pdf` (sin "swagger"/"openapi" en nombre) | Input para step-1 |
| Contrato OpenAPI | `.yaml`, `.yml`, `.json` con `openapi:` o `swagger:` | Input para step-2 |
| Postman collection | `.json` con `info.schema` Postman | Input para step-2 |
| Otros | resto | Anotar como contexto adicional |

Si la carpeta está vacía o no hay HU **ni** contrato → escalar al usuario.

### Paso 5 — Validaciones específicas por `cycle.type`

**baseline:**
- Al menos 1 HU **o** 1 contrato disponible

**regression / fast-track:**
- `docs/output/{baseline_run_id}/` existe
- `docs/output/{baseline_run_id}/checkpoint.json` tiene `status: completed`

**retest:**
- Adicionalmente, `docs/output/{baseline_run_id}/execution/defects/{defect_id}.json` existe

### Paso 6 — Construir contexto inicial

Devolver al orquestador el `bootstrap_context`:

```json
{
  "run_id": "{run_id}",
  "session_config": { /* ref a session_config completo */ },
  "inputs_inventory": [
    {"src_id": "SRC-001", "path": "docs/testing/atf/requirements/HU_microservicio.md", "type": "hu", "utility": "high"},
    {"src_id": "SRC-002", "path": "docs/testing/atf/config/appapi.yaml", "type": "session_config", "utility": "medium"}
  ],
  "baseline_validation": {
    "applies": true,
    "baseline_run_id": "{run_id-1}",
    "baseline_status": "completed",
    "defect_id_validated": "D-007"
  },
  "issues": [
    {"id": "CONFIG-WARN-001", "severity": "warning", "description": "appapi.yaml.name tiene comilla sin cerrar"}
  ],
  "ready_to_partition": true
}
```

`ready_to_partition: true` indica al orquestador que puede invocar `work-item-partitioner`.

## Output principal

El skill no escribe artefactos directamente — devuelve el `bootstrap_context` al orquestador, que decide qué hacer (el `manifest-writer` lo escribirá luego en `run-manifest.md`).

Excepción: si detecta que la carpeta de output ya tenía un `checkpoint.json` huérfano sin run-manifest, lo loguea en `bootstrap_context.issues[]` como WARN-002 para revisión manual.

## Errores comunes

| Código | Causa |
|---|---|
| `BOOT-001` | `requirements/` vacío y no hay contrato — sin material para particionar |
| `BOOT-002` | `cycle.baseline_run_id` apunta a carpeta inexistente |
| `BOOT-003` | `cycle.baseline_run_id` existe pero baseline `status` ≠ `completed` |
| `BOOT-004` | `cycle.defect_id` no encontrado en baseline (solo `retest`) |
| `BOOT-005` | Output folder ya existe con `status: in_progress` — sugerir `/asdd:qa-resume` |

## Cuándo NO invocar

- Tarea LIGHT via `/asdd:qa-do` — no se crea run formal
- Reanudación de corrida existente — bypass directo al checkpoint-manager
- Solo se quiere consultar inventario de requirements/ — listar con `Glob`, no usar este skill

## Anti-patterns

- **Adivinar valores faltantes de appapi.yaml.** Mejor fallar con código explícito.
- **Crear el output folder antes de validar prerrequisitos.** El folder se crea solo si el ciclo es válido.
- **Mezclar inputs entre corridas.** Cada corrida indexa lo que está en `requirements/` al momento del bootstrap; no toca otras corridas.

## Referencias

- Templates: `templates/bootstrap-context.template.json`, `templates/inputs-inventory.template.json`
- Ejemplo: `examples/example-bootstrap-context.json`
- Skill colaborador: `asdd-atf-api-shared-config-loader`
