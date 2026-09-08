# Evidencia — {context_id}

**Tipo:** {context_type} — **Veredicto:** {verdict}
**Capturado:** {captured_at} por {captured_by}

## Resumen ejecutivo

{1-2 frases describiendo qué se ejecutó y qué pasó}

## Request

- **Método/URL:** `{method} {url}`
- **Auth:** {Bearer | none | Basic | otro — redactado}
- **Headers críticos:** `{Content-Type, Accept, X-Request-Id}`
- **Body:** ver `request.json`

## Response

- **Status:** `{status}`
- **TTFB:** {ttfb_ms} ms — **Total:** {total_ms} ms
- **Schema match:** {Sí | No (ver contract-diff.json)}
- **Body:** ver `response.json`

## Validación contra contrato

{Si matches_schema: true → "Response cumple el contrato OpenAPI."}
{Si matches_schema: false → tabla de diffs:}

| Path | Esperado | Actual |
|---|---|---|
| `$.totalAmount` | `number` | `string` |
| `$.requestId` | `required` | `missing` |

## Regla violada (si aplica)

- **RN-{NNN}:** {descripción breve de la regla de negocio}
- **Comportamiento esperado:** {qué debió pasar}
- **Comportamiento observado:** {qué pasó realmente}

## Acción sugerida

{Si verdict: fail y categoría preliminar:}

- **Categoría preliminar:** {bug | precondition | env_issue | script_issue}
- **Justificación:** {1 frase}

---
*Evidencia preservada en `{evidence_path}/`. Redactados: {redactions_applied} secretos.*
