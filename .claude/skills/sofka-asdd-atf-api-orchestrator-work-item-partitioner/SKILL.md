---
name: sofka-asdd-atf-api-orchestrator-work-item-partitioner
description: Particiona HUs y contratos en Work Items atómicos wi-XXX por cohesión funcional. Sin inventar work items.
used_by:
  - sofka-asdd-atf-api-orchestrator
---

## Propósito

Convertir un paquete heterogéneo (1 HU grande, varias HUs, Swagger sin HU, etc.) en una **lista finita de Work Items** que el resto del pipeline pueda procesar de forma trazable e idealmente en paralelo.

**Principio:** un WI es una unidad cohesiva de comportamiento observable y testeable de forma independiente. No es "un endpoint = un WI" salvo cuando ese endpoint es autocontenido.

## Cuándo invocar

Después de `run-bootstrap` cuando `ready_to_partition: true`. Es el segundo skill del orquestador en cualquier `/sofka-asdd:qa-bootstrap`.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `bootstrap_context` | object | Output de `run-bootstrap` con `inputs_inventory[]` |
| `session_config` | object | Para conocer `cycle.type` y ajustar partición (regression puede heredar WIs del baseline) |

## Heurísticas de partición (por orden de preferencia)

### H1 — Capa funcional del flujo de negocio

Cuando la HU describe un flujo end-to-end con capas claras (ej: solicitud → batch → consolidación → notificación), particionar por capa.

**Indicadores:** la HU usa secciones tipo "Proceso 1", "Etapa 2", "Fase Final", o describe transiciones de estado.

### H2 — Recurso REST

Cuando hay múltiples recursos independientes (orders, customers, products), particionar por recurso.

**Indicadores:** Swagger con paths bajo distintos `/api/v1/{resource}/...` que no comparten dependencias funcionales.

### H3 — Capacidad / Caso de uso

Cuando la HU enumera casos de uso (CU-001, CU-002, ...) más que un flujo único, particionar por capacidad.

**Indicadores:** la HU lista "El sistema permite X. El sistema permite Y. El sistema permite Z" sin orden temporal.

### H4 — Por endpoint si todo lo demás falla

Si no se identifica cohesión más alta, **1 WI por endpoint** como fallback. Documentar explícitamente "particionado por endpoint por ausencia de cohesión funcional clara".

## Restricciones duras

- **Mínimo 1 WI**, máximo 8 WIs por corrida. Más de 8 → indicar al usuario que conviene splitear en múltiples corridas.
- **Cada WI ≥ 1 endpoint o ≥ 1 caso de uso testeable.** Sin WIs vacíos.
- **Sin solapamiento:** un endpoint pertenece a UN solo WI.
- **Toda partición justificable con evidencia** del paquete recibido. Si se inventa, fallar (`PART-001`).

## Proceso

1. Leer el paquete completo (todas las HU + contratos) en una sola pasada antes de decidir.
2. Detectar el patrón dominante (H1/H2/H3/H4) y dejarlo explícito.
3. Construir borrador de WIs aplicando la heurística.
4. Validar restricciones (mínimo/máximo, sin solapamiento, ≥1 endpoint).
5. Para cada WI, identificar:
   - `wi_id` — formato `wi-NNN` (zero-padded)
   - `title` — corto, ≤ 80 chars
   - `description` — 2-3 frases con el alcance
   - `endpoints_in_scope[]` — paths del contrato
   - `rules_referenced[]` — RN-IDs si la HU las numera
   - `inputs[]` — qué `src_id` aportan a este WI
6. Devolver `partition_result` al orquestador.

## Output

```json
{
  "partition_criterion": "H1-funcional-layer | H2-resource | H3-capability | H4-endpoint",
  "criterion_justification": "1-2 frases explicando por qué se eligió",
  "total_work_items": 3,
  "work_items": [
    {
      "wi_id": "wi-001",
      "title": "Solicitud de ejecución",
      "description": "Registro y actualización de solicitud de facturación...",
      "folder_name": "wi-001-solicitud-ejecucion",
      "endpoints_in_scope": ["POST /osf/api/v1/pending-billing-quotas"],
      "rules_referenced": ["RN-001", "RN-002", "RN-008"],
      "inputs_assigned": ["SRC-001"],
      "estimated_test_cases": 8
    }
  ],
  "regression_inheritance": null
}
```

Si `cycle.type` es `regression` o `fast-track`, intentar **heredar la partición del baseline** y devolver `regression_inheritance.inherited_from: "{baseline_run_id}"` con anotaciones de qué WIs deben re-procesarse.

## Cuándo NO invocar

- Tarea LIGHT — no se particiona
- Corrida `retest` — solo se procesa el WI que contiene el `defect_id`; la partición ya existe en el baseline
- Solo se quiere consultar la partición existente — leer `run-manifest.md` del baseline

## Anti-patterns

- **Particionar antes de leer todo.** El patrón dominante solo emerge al ver el conjunto.
- **Inventar WIs por simetría** ("debería haber 5 porque hay 5 endpoints"). Si la cohesión es por capa, 3 WIs cubriendo 5 endpoints es correcto.
- **Mezclar criterios en la misma corrida.** Elegir UNA heurística dominante; si hace falta combinar, documentar como `H1+H3 mixed` con justificación.
- **WIs sobredimensionados** (un WI con 20 endpoints, 30 RN). Si excede 8 endpoints o 10 RN, considerar split.
- **WIs micro** (1 endpoint trivial sin reglas asociadas). Considerar agrupar con su vecino lógico.

## Referencias

- Template: `templates/partition-result.template.json`
- Ejemplo: `examples/example-partition-clienteejemplo.json`
