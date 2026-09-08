---
name: sofka-asdd-atf-api-orchestrator-dependency-mapper
description: Mapea dependencias entre Work Items y devuelve el grafo más los conjuntos paralelizables. Bloquea si detecta ciclos.
used_by:
  - sofka-asdd-atf-api-orchestrator
---

## Propósito

Determinar qué Work Items **deben ejecutarse secuencialmente** y cuáles pueden correr **en paralelo**. Esto alimenta el plan de activación de Steps 1+2 (paralelos por naturaleza), pero también informa al ejecutor (Step 6) cuándo un WI bloquea a otro funcionalmente.

**Principio:** una dependencia funcional existe solo si el WI-A produce un estado/dato que el WI-B necesita para validarse. No confundir con dependencia conceptual.

## Cuándo invocar

Inmediatamente después de `work-item-partitioner`. Tercer skill del orquestador en bootstrap.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `partition_result` | object | Output de `work-item-partitioner` con WIs definidos |
| `inputs_inventory` | array | Para releer pasajes de la HU que describan flujos |

## Tipos de dependencia detectables

| Tipo | Señal | Ejemplo |
|---|---|---|
| `state-prerequisite` | WI-A produce un estado que WI-B consume | WI-A crea solicitud `PENDING`; WI-B la transiciona a `EXECUTION` |
| `data-prerequisite` | WI-A genera datos que WI-B usa | WI-A registra contrato; WI-B consulta cuotas del contrato |
| `sequential-flow` | La HU declara orden explícito ("primero esto, luego aquello") | "El batch SOLO se ejecuta tras un POST exitoso de solicitud" |
| `none` | WIs independientes | Recursos paralelos sin acoplamiento |

## Proceso

1. Para cada par ordenado (WI-A, WI-B), evaluar si existe alguna señal de los 3 tipos.
2. Si existe → registrar arco `A → B` con `type`, `reason` y `evidence` (cita del texto fuente).
3. Construir el grafo dirigido (DAG).
4. **Validar acíclico** — si hay ciclo, escalar al usuario; no es válido funcionalmente.
5. Calcular niveles topológicos (BFS):
   - Nivel 0: WIs sin dependencias entrantes
   - Nivel N+1: WIs cuyas dependencias están en nivel ≤ N
6. WIs del mismo nivel son paralelizables. Niveles distintos son secuenciales.
7. Devolver `dependency_map`.

## Output

```json
{
  "edges": [
    {
      "from": "wi-001",
      "to": "wi-002",
      "type": "state-prerequisite",
      "reason": "wi-002 (batch) requiere solicitudes en PENDING generadas por wi-001",
      "evidence": "HU sección 4.2: 'El proceso batch toma SOLO solicitudes en PENDING.'",
      "strength": "hard"
    }
  ],
  "topological_levels": [
    {"level": 0, "wis": ["wi-001"]},
    {"level": 1, "wis": ["wi-002"]},
    {"level": 2, "wis": ["wi-003"]}
  ],
  "parallel_groups": [
    {"group_id": "G0", "wis": ["wi-001"], "can_run_concurrently": true},
    {"group_id": "G1", "wis": ["wi-002"], "can_run_concurrently": true},
    {"group_id": "G2", "wis": ["wi-003"], "can_run_concurrently": true}
  ],
  "step_activation_plan": {
    "step_1_plus_step_2": "paralelo por WI dentro del mismo nivel",
    "step_3": "paralelo por WI tras step_1+2 del mismo WI aprobados",
    "step_5_execution": "respeta orden topológico para evitar fallos por falta de estado previo"
  },
  "cycle_detected": false,
  "warnings": []
}
```

## Errores comunes

| Código | Causa |
|---|---|
| `DEP-001` | Ciclo detectado — los WIs forman dependencia circular, no es funcionalmente válido |
| `DEP-002` | Dependencia declarada sin evidencia textual — escalar al usuario |
| `DEP-003` | Más de 2 niveles topológicos — revisar si la partición no debería ser otra |

## Cuándo NO invocar

- 1 solo WI — no hay nada que mapear, devolver grafo trivial
- Corrida de regression que hereda la partición — heredar también el mapping previo
- Tarea LIGHT — no aplica

## Anti-patterns

- **Inventar dependencias por "lógica de negocio asumida".** Toda arista debe tener cita textual o regla numerada.
- **Confundir dependencia funcional con orden de redacción** en la HU. El orden narrativo no implica orden de ejecución.
- **Mapear todo como secuencial** por miedo a romper. Si dos WIs son verdaderamente independientes → paralelo. El paralelismo es eficiencia, no riesgo.
- **Ignorar ciclos.** Un ciclo es siempre un error de partición o de comprensión del flujo.

## Referencias

- Template: `templates/dependency-map.template.json`
- Ejemplo: `examples/example-dependency-map-clienteejemplo.json`
