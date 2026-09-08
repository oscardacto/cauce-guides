---
name: asdd-atf-web-notebooklm-query
description: Consulta un cuaderno NotebookLM como fuente de dominio y devuelve respuestas con citas. Nunca bloquea el pipeline.
used_by:
  - asdd-atf-web-qa-engineer
  - asdd-atf-web-qa-engineer
  - asdd-atf-web-qa-engineer
  - asdd-atf-web-qa-engineer
---

## Inputs

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `query` | string | Sí | Pregunta específica sobre el dominio. No genérica. |
| `notebook_id` | string | Sí | UUID del cuaderno de NotebookLM (de `session_context.notebooklm_notebook_id`) |
| `fallback` | boolean | No (default: true) | Si la query no produce resultados, intentar extracción raw de las primeras 3 fuentes |
| `mode` | string | No (default: `query`) | Modo de operación: `query`, `enrich` o `resolve` |
| `doubt` | string | Solo para `resolve` | Descripción de la duda tal como se formularía al usuario |

## Proceso

### 1. Validación de disponibilidad

- Verificar que `notebook_id` no esté vacío
- Intentar invocar `mcp__notebooklm__notebook_query` con la query proporcionada
- Si la tool no existe o falla → devolver `status: "unavailable"` inmediatamente

### 2. Ejecutar query

```
mcp__notebooklm__notebook_query
  notebook_id: {notebook_id}
  query: {query}
```

- Si la respuesta contiene contenido útil → extraer `answer` y `citations`
- Si la respuesta está vacía o no es relevante → ir a paso 3

### 3. Fallback (si `fallback: true` y query vacía)

Extraer contenido raw de las primeras 3 fuentes del cuaderno:

```
mcp__notebooklm__notebook_list
  max_results: 1
```

Del notebook, leer hasta 3 fuentes y buscar coincidencias textuales con la query original.

- Si se encuentra contenido relevante → devolver con `status: "success"` y `source: "fallback_raw"`
- Si no hay coincidencias → devolver `status: "empty"`

### 4. Formatear respuesta

Devolver siempre un JSON con la estructura definida en Output.

## Output

```json
{
  "status": "success | empty | unavailable",
  "query": "{query original}",
  "answer": "{respuesta sintetizada del cuaderno}",
  "citations": [
    {
      "source_title": "{título de la fuente}",
      "excerpt": "{fragmento relevante}"
    }
  ],
  "sources_used": 0,
  "source": "query | fallback_raw"
}
```

### Valores por status

| Status | answer | citations | Significado |
|--------|--------|-----------|-------------|
| `success` | Contenido relevante | 1+ citas | La query produjo resultados útiles |
| `empty` | `""` | `[]` | El cuaderno no tiene información relevante para esta query |
| `unavailable` | `""` | `[]` | El MCP no está disponible o el notebook_id es inválido |

## Modo ENRICH

Mismo proceso que el Modo QUERY (pasos 1–4) pero con semántica de enriquecimiento de contexto.

### Gate condicional

Si `notebooklm_enabled == false` en session_context → retornar inmediatamente:
```json
{
  "status": "unavailable",
  "mode": "enrich",
  "query": "{query original}",
  "answer": "",
  "citations": [],
  "sources_used": 0
}
```

### Output ENRICH

Misma estructura que el Modo QUERY, con campo adicional:
```json
{
  "status": "success | empty | unavailable",
  "mode": "enrich",
  "query": "{query original}",
  "answer": "{respuesta sintetizada del cuaderno}",
  "citations": [...],
  "sources_used": 0,
  "source": "query | fallback_raw"
}
```

---

## Modo RESOLVE

Ejecuta una query contra el cuaderno y evalúa si la respuesta resuelve una duda específica,
evitando escalar preguntas al usuario cuando el cuaderno de dominio ya tiene la respuesta.

### Gate condicional

Si `notebooklm_enabled == false` en session_context → retornar inmediatamente:
```json
{
  "resolved": false,
  "mode": "resolve",
  "doubt": "{doubt}",
  "partial_context": null,
  "suggested_question": "{doubt}",
  "action": "ask_user"
}
```

### Proceso RESOLVE

1. Ejecutar query (pasos 1–3 del Modo QUERY) usando `query` como input
2. Evaluar si la respuesta resuelve la duda (`doubt`):
   - **Respuesta directa con citas específicas** → `resolved: true`
   - **Respuesta tangencial o parcial** → `resolved: false` con `partial_context`
   - **Sin respuesta relevante** → `resolved: false` sin contexto
3. Evaluar confianza:
   - 2+ citas relevantes → `confidence: "high"`
   - 1 cita → `confidence: "medium"`

### Output RESOLVE — Duda resuelta

```json
{
  "resolved": true,
  "mode": "resolve",
  "confidence": "high | medium",
  "doubt": "{doubt original}",
  "answer": "{respuesta que resuelve la duda}",
  "citations": [
    {
      "source_title": "{título de la fuente}",
      "excerpt": "{fragmento relevante}"
    }
  ],
  "action": "use_answer"
}
```

### Output RESOLVE — Duda no resuelta

```json
{
  "resolved": false,
  "mode": "resolve",
  "doubt": "{doubt original}",
  "partial_context": "{contexto parcial encontrado, o null}",
  "suggested_question": "{pregunta reformulada para el usuario}",
  "action": "ask_user"
}
```

---

## Reglas

1. **Nunca bloquea el pipeline** — si el MCP falla, devuelve `unavailable` y el agente continúa
2. **Queries específicas, no genéricas** — "Reglas de validación del módulo Emisión" sí; "Dime todo" no
3. **No persiste respuestas como archivos** — el agente que invoca incorpora el contenido en su propio artefacto
4. **Límite de 3 fuentes en fallback** — para acotar el consumo de tokens
5. **Solo lectura** — nunca modifica el cuaderno (no usar `notebook_create` ni `source_add`)
6. **Idempotente** — la misma query con el mismo notebook_id produce el mismo resultado
7. **Gate condicional** — si `notebooklm_enabled == false`, ENRICH retorna `status: "unavailable"` y RESOLVE retorna `resolved: false`. Nunca bloquear el pipeline por falta de NotebookLM
