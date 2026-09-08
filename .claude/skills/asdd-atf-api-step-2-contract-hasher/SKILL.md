---
name: asdd-atf-api-step-2-contract-hasher
description: Hash SHA-256 determinista del contrato canónico, ignorando orden y formato. Detecta si cambió la semántica.
used_by:
  - asdd-atf-api-step-2-api-context
  - asdd-atf-api-shared-knowledge-base-writer
---

## Propósito

Generar un **identificador estable y comparable** de un contrato API. Si el mismo contrato pasa por el hasher 2 veces (en corridas distintas, distintas máquinas, distinto orden de propiedades), produce el **mismo hash**. Si cambia algo semánticamente relevante, produce un hash distinto.

Es la base de las optimizaciones de `regression`, `fast-track` y la knowledge base.

## Cuándo invocar

Inmediatamente después de `openapi-parser`. Segundo skill de la sub-fase 2B (Analyze técnica) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_contract` | object | Output de `openapi-parser` |
| `hash_mode` | enum | `strict` (default — toda la estructura) o `endpoints-only` (solo endpoints, sin metadata) |

## Qué entra al hash

Por defecto (`hash_mode: strict`):

✅ Endpoints (method, path, operation_id)
✅ Schemas resueltos (estructura, tipos, required, enum, patterns, formats)
✅ Códigos de respuesta y sus schemas
✅ Headers obligatorios
✅ Auth requirements
✅ Códigos de error declarados

## Qué NO entra al hash

❌ `metadata.title` (texto descriptivo)
❌ `metadata.description`
❌ Ejemplos (no son contrato — son ayuda)
❌ `summary` y `description` de cada operation
❌ Orden de claves en objetos JSON
❌ Whitespace y comentarios
❌ `base_url` (cambia por entorno)
❌ `info.contact`, `info.license`

## Proceso

1. **Canonicalizar.** Convertir el contrato a JSON canónico:
   - Ordenar claves alfabéticamente (recursivo)
   - Eliminar campos descriptivos (lista arriba)
   - Normalizar tipos numéricos (`1.0` y `1` se tratan igual si son enteros)
   - Remover propiedades con valor `null` o `undefined`
   - Para arrays cuyo orden no es semánticamente relevante (`tags`, `required` de un object), ordenar también

2. **Serializar.** JSON.stringify sin espacios.

3. **Hashear.** SHA-256 sobre el string resultante.

4. **Formatear** el output:
   ```json
   {
     "contract_hash": "sha256:7a3b8c2f9d1e4a5b...",
     "hash_mode": "strict",
     "hashed_at": "{ISO 8601}",
     "canonical_size_bytes": 4521,
     "sub_hashes": {
       "endpoints": "sha256:abc...",
       "schemas": "sha256:def...",
       "responses": "sha256:ghi..."
     }
   }
   ```

Los `sub_hashes` permiten al `contract-delta-detector` saber exactamente qué cambió cuando hay delta.

## Determinismo — garantías

- **Mismo input lógico → mismo hash siempre.** Independiente del SO, locale, formato de timestamp del proceso.
- **Insensible a representación.** `{"a":1,"b":2}` y `{ "b" : 2, "a" : 1 }` producen el mismo hash.
- **Sensible a semántica.** Cambiar `required: ["a"]` → `required: ["a", "b"]` cambia el hash. Cambiar `type: "string"` → `type: "integer"` cambia el hash.

## Cuándo NO invocar

- Contrato no parseado aún — invocar primero `openapi-parser`
- LIGHT puntual donde el hash no aporta — saltar
- Cálculo de hash sobre un contrato malformado (con errores `OPENAPI-E-*`) — abortar y escalar

## Anti-patterns

- **Hashear el archivo crudo** (YAML/JSON original). Diferencias cosméticas darían hashes distintos para el mismo contrato.
- **Incluir `metadata.version`** en el hash. El versionado se trackea en la knowledge base, no se confunde con identidad semántica.
- **Hashear con timestamps embebidos.** Cualquier `timestamp` que no esté ya filtrado por canonicalización rompe el determinismo — escalar como bug del canonicalizador.
- **Reutilizar el hash entre `hash_mode` distintos** — un hash `strict` y uno `endpoints-only` del mismo contrato son distintos por definición.

## Errores comunes

| Código | Causa |
|---|---|
| `HASH-001` | parsed_contract tiene `issues` con `severity: error` — no hashear contrato inválido |
| `HASH-002` | `$ref` no resuelto en parsed_contract — hash sería inestable |

## Referencias

- Template: `templates/contract-hash.template.json`
- Ejemplo: `examples/example-contract-hash.json`
