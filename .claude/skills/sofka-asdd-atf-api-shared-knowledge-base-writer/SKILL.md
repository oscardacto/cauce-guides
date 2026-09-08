---
name: sofka-asdd-atf-api-shared-knowledge-base-writer
description: Persiste conocimiento cross-corridas en docs/testing/atf/knowledge/ — contratos por hash, defectos recurrentes, lecciones.
used_by:
  - sofka-asdd-atf-api-orchestrator
  - sofka-asdd-atf-api-step-2-api-context
  - sofka-asdd-atf-api-step-4-test-cases
  - sofka-asdd-atf-api-step-6-execution
  - sofka-asdd-atf-reporting-qa-engineer
---

## Propósito

Construir una **memoria del proyecto** que cruza corridas. Cada corrida deja un sedimento de conocimiento (contratos validados, endpoints estables, defectos recurrentes, decisiones) que las siguientes corridas leen primero para:

- **Reducir tokens consumidos** (no re-analizar lo ya conocido)
- **Acelerar regression/fast-track/retest** (saltar work redundante)
- **Detectar regresiones** (comparar contra estado canónico previo)
- **Capitalizar lecciones aprendidas** (no repetir errores diagnosticados)

Esta knowledge base es **inmutable por corrida** (cada actualización es un append) y **versionada** (toda escritura registra `run_id` y `recorded_at`).

## Estructura de la knowledge base

```text
docs/testing/atf/knowledge/
├── contracts/
│   └── {contract_hash}.json              ← Contratos OpenAPI conocidos (por hash SHA-256)
├── endpoints/
│   └── {method}-{path-slug}.json         ← Endpoints estables con su historial
├── defects/
│   ├── recurring/
│   │   └── {pattern-id}.json              ← Patrones de defectos que se repiten
│   └── resolved/
│       └── {defect-fingerprint}.json     ← Defectos resueltos con fix conocido
├── lessons/
│   └── lesson-{NNN}.md                    ← Lecciones aprendidas humano-legibles
└── _index.json                            ← Índice maestro de la knowledge base
```

## Operaciones

### `record_contract(run_id, contract_hash, contract_payload, delta_status)`

Indexa un contrato OpenAPI por su hash. Si ya existe (mismo hash), añade una entrada en `seen_in_runs[]`. Si es nuevo, crea el archivo.

**Uso típico:** invocado por `step-2-api-context` tras calcular el hash.

### `record_endpoint(run_id, method, path, behavior_summary)`

Indexa un endpoint con su comportamiento observado. Acumula:

- Códigos HTTP devueltos históricamente
- Bodies de error vistos
- Tiempos típicos (p50, p95 si hay datos del módulo de Performance)
- Defectos asociados

### `record_defect_pattern(pattern_id, fingerprint, runs_affected[], description)`

Registra un patrón recurrente. Un patrón se detecta cuando el mismo `fingerprint` (hash de endpoint + categoría + RN violada) aparece en ≥2 corridas.

**Uso típico:** invocado por `sofka-asdd-atf-reporting-qa-engineer` al sintetizar el reporte final.

### `record_resolved_defect(defect_id, run_id, fingerprint, fix_summary, verified_in_runs[])`

Cuando un defecto se confirma como `resolved` via `/sofka-asdd:qa-retest`, persiste la huella + el fix conocido. Si reaparece en una corrida futura, el orquestador alerta con la referencia histórica.

### `record_lesson(lesson_id, title, context, lesson, prevention)`

Escribe una lección aprendida en `lessons/lesson-{NNN}.md`. Formato:

```markdown
# Lesson-007 — {title}

**Recorded:** {run_id} on {date}
**Context:** {qué se estaba haciendo cuando se aprendió esto}
**Lesson:** {lo aprendido, en lenguaje claro}
**Prevention:** {acción concreta para evitar repetir el error}
```

### `query(filters)`

Búsquedas comunes:

- `query({contract_hash: "abc..."})` → ¿conocemos este contrato?
- `query({endpoint: "POST /osf/api/v1/pending-billing-quotas"})` → historial del endpoint
- `query({fingerprint: "..."})` → ¿este defecto es recurrente o ya resuelto?
- `query({all_lessons: true})` → todas las lecciones (uso del orquestador al inicio)

## Cuándo invocar

| Evento | Operación |
|---|---|
| Step 2 completa para un WI | `record_contract` + `record_endpoint` |
| Step 6 detecta un defecto | `record_endpoint` (con `verdict: fail`) |
| Step 7 al sintetizar el reporte | `record_defect_pattern` (si aplica), `record_lesson` (si aplica) |
| `/sofka-asdd:qa-retest` confirma fix | `record_resolved_defect` |
| Inicio de corrida (orchestrator) | `query({all_lessons: true})` para cargar contexto histórico |

## Garantías

- **Append-only:** las operaciones nunca borran; solo añaden entradas en arrays históricos.
- **Idempotente:** `record_contract` con mismo hash 2 veces no duplica.
- **Versionado:** cada entrada incluye `run_id` y `recorded_at` para trazabilidad.
- **Sin secretos:** la knowledge base nunca contiene credenciales — solo metadatos del contrato/endpoint/defecto.

## Errores comunes

| Código | Mensaje | Causa |
|---|---|---|
| `KB-001` | `Contract hash collision with different payload` | Hash repetido pero contenido distinto — investigar (¿hash mal calculado?) |
| `KB-002` | `Resolved defect re-detected` | Defecto marcado como `resolved` reaparece — alerta crítica, no falla |
| `KB-003` | `Knowledge base path missing` | `docs/testing/atf/knowledge/` no existe — crear directorio y continuar |

## Cuándo NO invocar

- Tarea LIGHT que no produce conocimiento útil (ej: regenerar hash) → omitir
- Corrida fallida en bootstrap (sin work items) → no escribir nada parcial
- Test de framework / dry-run → usar `--no-kb` (flag opcional del orchestrator)

## Anti-patterns

- **Persistir credenciales o evidencias completas.** La KB es metadata; las evidencias completas viven en `docs/testing/atf/{run_id}/execution/evidence/`.
- **Sobreescribir entradas.** Toda update es append a un array histórico, nunca mutación.
- **Indexar contratos por nombre de archivo en lugar de hash.** El hash es la única identidad estable.
- **Documentar lecciones triviales.** Una lección vale si **evita un error futuro** — si no, es ruido.
- **Lecciones genéricas tipo "siempre validar inputs".** Las lecciones útiles son específicas: "El endpoint X devuelve 200 con body de error en lugar de 4xx — siempre validar `body.error` además del status".

## Referencias

- Templates: `templates/contract-record.template.json`, `templates/endpoint-record.template.json`, `templates/lesson.template.md`, `templates/kb-index.template.json`
- Ejemplos: `examples/example-contract-record.json`, `examples/example-lesson.md`
