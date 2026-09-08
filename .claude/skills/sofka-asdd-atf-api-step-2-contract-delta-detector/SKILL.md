---
name: sofka-asdd-atf-api-step-2-contract-delta-detector
description: Compara el contrato contra el baseline y clasifica el delta unchanged/minor/major, separando breaking de aditivo.
used_by:
  - sofka-asdd-atf-api-step-2-api-context
---

## Propósito

Determinar **qué cambió** entre el contrato actual y el de una corrida previa, y **cuán grave** es el cambio. La clasificación final (`unchanged | minor | major`) decide:

- Si `regression` puede saltar steps (unchanged → propone `fast-track`)
- Si activa el `ORC-010 plan-gate` (major → requiere aprobación humana antes de Step 5)
- Qué specs hay que regenerar (delta de endpoints específicos)

## Cuándo invocar

- Solo en ciclos `regression`, `fast-track`, `retest` (en `baseline` no aplica — no hay con qué comparar)
- Después de `contract-hasher` cuando hay `baseline_run_id`

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `current_contract_hash` | string | Hash SHA-256 del contrato actual |
| `current_parsed_contract` | object | Contrato actual canónico |
| `baseline_run_id` | string | Run ID del baseline a comparar |
| `baseline_contract_path` | string | Path al `api-context.json` del baseline |

## Clasificación de cambios

### `unchanged`

`current_contract_hash` === `baseline_contract_hash`.

→ Recomendar `fast-track`. Cero cambios semánticos.

### `minor` (aditivo o no-breaking)

Cualquiera de:
- Nuevo endpoint agregado (sin remover existentes)
- Nuevo campo **opcional** en un schema
- Nuevo código de respuesta agregado (ej: ahora documenta 404 que antes no estaba)
- Nuevo header **opcional**
- Nuevo `operation_id` (renombrado opcional — solo si cambia el operation_id pero el endpoint sigue accesible)

→ Re-ejecutar steps 6 + 7 sobre todos los CPs. Step 3-5 se mantienen.

### `major` (breaking)

Cualquiera de:
- Endpoint removido
- Path cambiado (`/v1/users` → `/v2/users`)
- Método HTTP cambiado
- Campo **requerido** nuevo (rompe clientes existentes)
- Campo removido del response (cliente podría depender de él)
- Cambio de tipo en un campo (`string` → `integer`)
- Cambio en enum (valor removido)
- Cambio en regex pattern, format o longitud máxima
- Auth changed (`none` → `bearer`, o `bearer` → `oauth2`)
- Códigos de error críticos removidos del response

→ Bloquea pipeline hasta gate humano (`ORC-010`). Regenerar steps 3-7 completos.

## Proceso

1. Leer `api-context.json` del baseline en `docs/output/{baseline_run_id}/api-context/wi-{N}-api-context.json`.
2. Comparar `contract_hash` rápido — si son iguales, retornar `unchanged` y salir.
3. Comparar `sub_hashes`:
   - `endpoints` distinto → revisar deltas de endpoints
   - `schemas` distinto → revisar deltas de schemas
   - `responses` distinto → revisar deltas de responses
   - `auth` distinto → escalar como `major` casi siempre
4. Calcular delta detallado por categoría.
5. Clasificar según las reglas arriba.
6. Devolver `delta_report`.

## Output

```json
{
  "wi_id": "wi-001",
  "delta_status": "major",
  "current_hash": "sha256:abc...",
  "baseline_hash": "sha256:xyz...",
  "baseline_run_id": "PruebaAPIClienteEjemplo-v1.0-20260427-0900",
  "changes": {
    "endpoints_added": [],
    "endpoints_removed": [],
    "endpoints_modified": [
      {
        "endpoint": "POST /osf/api/v1/pending-billing-quotas",
        "changes": [
          {
            "type": "field_added_required",
            "path": "request.body.contractId",
            "before": "absent",
            "after": "required string",
            "breaking": true
          }
        ]
      }
    ],
    "schemas_added": [],
    "schemas_removed": [],
    "schemas_modified": [
      {
        "schema": "BillingRequest",
        "changes": [{"path": ".required", "before": ["cycle", "distributorId"], "after": ["cycle", "distributorId", "contractId"]}]
      }
    ],
    "responses_modified": [],
    "auth_changes": []
  },
  "classification_reasons": [
    "campo contractId promovido a required en BillingRequest — breaking change"
  ],
  "recommended_action": "Activar ORC-010 plan-gate. Regenerar steps 3-5 para wi-001. Notificar al usuario que clientes existentes podrían fallar."
}
```

## Cuándo NO invocar

- Ciclo `baseline` (sin baseline a comparar) — siempre devolver `delta_status: "baseline"` sin proceso
- Baseline missing (path no existe) — abortar con `BOOT-002`
- Contrato actual sin hash — invocar antes `contract-hasher`

## Anti-patterns

- **Tratar adición de optional como breaking.** Agregar un campo opcional no rompe clientes existentes — es `minor`.
- **Ignorar el delta de auth.** Pasar de `none` a `bearer` es siempre `major`, incluso si los endpoints son idénticos.
- **Subestimar cambio de format.** `date` → `date-time` es breaking — los validadores rompen.
- **Catalogar como minor cualquier cambio "pequeño".** El criterio es objetivo: ¿rompe un cliente existente que cumplía el contrato anterior?
- **Olvidar la trazabilidad.** Cada `change` registrado tiene `before/after` para que el humano pueda revisar.

## Referencias

- Template: `templates/delta-report.template.json`
- Ejemplo: `examples/example-delta-major.json`
- Regla relacionada: `.claude/rules/sofka-asdd-atf-api-qa-engineer.md (embedded: ATF API Orchestration Rules) → ORC-010` (plan-gate)
