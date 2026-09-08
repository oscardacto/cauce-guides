---
name: asdd-atf-api-shared-evidence-collector
description: Captura evidencia de cada interacción API (request, response, timings, diff vs contrato) redactando secretos.
used_by:
  - asdd-atf-api-step-6-execution
  - asdd-atf-api-security
  - asdd-atf-api-performance
---

## Propósito

Capturar y persistir evidencia trazable de cada ejecución API en un formato canónico, **garantizando que ningún secreto, token o credencial llegue al disco**. Funciona tanto en ejecución automatizada (Fase 5) como en escenarios de security y performance.

## Cuándo invocar

- Cada vez que la Fase 5 (Execute) ejecuta un CP — sea PASS, FAIL o flaky
- Cuando el módulo de Security documenta un finding OWASP que requiere request/response como prueba
- Cuando el módulo de Performance captura una muestra representativa de un escenario k6
- En `/asdd:qa-retest` para validar un fix

## Inputs

| Parámetro | Tipo | Requerido | Descripción |
|---|---|---|---|
| `run_id` | string | sí | Para resolver path de output |
| `context_type` | enum | sí | `execution` \| `security` \| `performance` \| `retest` |
| `context_id` | string | sí | CP-ID, finding-ID, scenario-name, defect-ID |
| `request` | object | sí | `{method, url, headers, body, timestamp}` |
| `response` | object | sí | `{status, headers, body, timestamp}` |
| `timings` | object | no | `{dns_ms, connect_ms, ttfb_ms, total_ms}` |
| `contract_validation` | object | no | `{matches_schema: bool, diff: [...]}` |
| `verdict` | enum | sí | `pass` \| `fail` \| `flaky` \| `error` |
| `notes` | string | no | Observaciones del agente |

## Proceso

### Paso 1 — Redacción de secretos

Aplicar redacción **antes de cualquier persistencia**. Lista de keys a redactar (case-insensitive):

**Headers:**
- `authorization`, `proxy-authorization`
- `x-api-key`, `api-key`, `apikey`
- `x-auth-token`, `auth-token`
- `cookie`, `set-cookie`
- `x-csrf-token`
- Cualquier header conteniendo `secret`, `token`, `password`, `credential`

**Body (recursivo sobre JSON):**
- `password`, `passwd`, `pwd`
- `token`, `accessToken`, `refreshToken`, `idToken`
- `secret`, `clientSecret`, `apiSecret`
- `creditCard`, `cardNumber`, `cvv`, `cvc`
- `ssn`, `nationalId`, `taxId`, `documentNumber`
- `pin`

**Patrón de redacción:**
```text
Authorization: Bearer eyJhbG...  →  Authorization: Bearer [REDACTED:length=192]
"password": "MyP@ssw0rd"          →  "password": "[REDACTED:length=11]"
```

Mantener `length` ayuda a depurar sin exponer el valor.

### Paso 2 — Diff contra contrato (si aplica)

Si `request.body` o `response.body` no coinciden con el schema OpenAPI esperado:

```json
{
  "contract_validation": {
    "matches_schema": false,
    "schema_ref": "components/schemas/BillingRequestCreated",
    "diff": [
      {
        "path": "$.totalAmount",
        "expected": "number",
        "actual": "string",
        "actual_value_redacted": false,
        "actual_value": "1234.56"
      },
      {
        "path": "$.requestId",
        "expected": "required",
        "actual": "missing"
      }
    ]
  }
}
```

### Paso 3 — Persistir evidencia

Path canónico:

```text
docs/testing/atf/{run_id}/{context_type}/evidence/{context_id}/
├── request.json        (request redactado)
├── response.json       (response redactado)
├── timings.json        (solo si se proveyó)
├── contract-diff.json  (solo si hubo diff)
├── evidence.md         (resumen humano-legible)
└── _redaction-log.json (qué keys se redactaron — sin valores)
```

`evidence.md` es el resumen ejecutivo del incidente (1 página máximo) para que un humano entienda sin abrir los JSON.

### Paso 4 — Retornar referencia

```json
{
  "evidence_path": "docs/testing/atf/{run_id}/{context_type}/evidence/{context_id}/",
  "files_written": ["request.json", "response.json", "evidence.md", "_redaction-log.json"],
  "redactions_applied": 3,
  "size_bytes_total": 4521,
  "verdict": "fail"
}
```

## Garantías

- **Cero secretos en disco:** la redacción se aplica antes del primer `Write`. El `_redaction-log.json` registra los keys redactados (sin valores) para auditoría.
- **Reproducible:** dada la misma entrada, el output es determinista (excepto timestamps).
- **Inmutable:** una vez escrita, la evidencia no se modifica — solo se añaden anotaciones via archivos hermanos (ej: `annotation-{timestamp}.md`).

## Errores comunes

| Código | Mensaje | Causa |
|---|---|---|
| `EVID-001` | `request.body has unredactable binary content` | Body binario (file upload) — capturar solo metadata + checksum |
| `EVID-002` | `Evidence path already exists for context_id` | Reintento sobre el mismo CP — sufijar con `-retry{N}` |
| `EVID-003` | `Contract schema not found` | `schema_ref` apunta a OpenAPI inexistente — registrar como `unknown_schema` y continuar |

## Cuándo NO invocar

- Solo se quiere ver el último response — el agente puede mostrarlo en chat sin persistir
- Tests pasando que no se quiere persistir todos — usar `verdict: pass` solo en CPs marcados como `evidence: required`
- Documentación general — usar `Write` directo, no este skill (este es para evidencia técnica trazable)

## Anti-patterns

- **Persistir sin redactar.** Cualquier escritura sin pasar por el paso de redacción es violación crítica.
- **Logging por consola con headers crudos.** Antes de cualquier `console.log` o mensaje al usuario que incluya request/response, aplicar el mismo filtro de redacción.
- **Mezclar evidencias de múltiples CPs en un archivo.** Una carpeta por `context_id`, sin excepción.
- **Borrar evidencias viejas para "ahorrar espacio".** Las evidencias forman parte del registro de la corrida y deben preservarse hasta que la corrida sea archivada formalmente.
- **Re-redactar al leer.** La redacción se aplica una vez al escribir; al leer se confía en que ya está redactado.

## Referencias

- Templates: `templates/evidence.template.json`, `templates/evidence-summary.template.md`, `templates/redaction-rules.json`
- Ejemplos: `examples/evidence-D-001-bug.json`, `examples/evidence-summary.md`
