---
name: sofka-asdd-atf-api-step-5-newman-bridge
description: Genera una colección Postman/Newman desde los test-cases para sanity manual fuera del runner.
used_by:
  - sofka-asdd-atf-api-step-5-automation
---

## Propósito

Producir una **colección Postman v2.1** que duplica la cobertura de los specs Playwright pero en formato que el equipo puede importar en Postman/Newman para:

- Sanity manual antes de un release (QA o stakeholder ejecuta sin tocar consola)
- Demos a cliente con UI visible
- Debugging de un endpoint puntual sin levantar todo el runner

**Principio:** la colección Newman es un **artefacto secundario** — la fuente de verdad sigue siendo el JSON de test-cases. Si cambian los CPs, se regenera; no se edita a mano.

## Cuándo invocar

Tras `playwright-api-scaffolder`. Tercer y último skill de la Fase 4 (Automate) por WI.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI |
| `test_cases` | object | Output de `test-case-designer` |
| `fixtures` | object | Output de `test-data-generator-api` |
| `parsed_contract` | object | Para metadata (base URL, info) |
| `session_config` | object | Para `app.url`, `environment` |

## Estructura de salida

```text
docs/testing/atf/{run_id}/automation/postman/
├── {wi_id}.postman_collection.json     ← Colección con CPs como requests
├── {wi_id}.postman_environment.json    ← Environment con fixtures
└── README.md                            ← Cómo importar y correr
```

## Mapeo CP → Postman Request

| Campo del CP | Postman |
|---|---|
| `id` (CP-NNN) | `request.name` con prefijo `[CP-NNN]` |
| `title` | Parte del `request.name` |
| `tags[]` | `request.description` (Postman no tiene tags nativos) |
| `request.method/url/body` | `request.method/url/body` |
| `expected_response.status` | Test script: `pm.test("Status is X", () => pm.response.to.have.status(X))` |
| `expected_response.body_assertions[]` | Test script: `pm.test(...)` por cada uno |
| `expected_response.schema_ref` | Test script con `pm.response.to.have.jsonSchema(...)` si el schema es inline |
| `fixtures` referenciadas | Variables del environment: `{{validCycle}}`, `{{today}}` |

## Estructura de la collection

```json
{
  "info": {
    "name": "{wi_id} — {wi_title}",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    "description": "Colección generada por ATF API v3 — Newman bridge\nFuente: docs/testing/atf/{run_id}/test-cases/{wi_id}-test-cases.json\nCorrer con: newman run {wi_id}.postman_collection.json -e {wi_id}.postman_environment.json"
  },
  "item": [
    {
      "name": "[CP-001] Crear solicitud válida con fecha actual",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json" }],
        "url": "{{baseUrl}}/osf/api/v1/pending-billing-quotas",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"cycle\": \"{{validCycle}}\",\n  \"distributorId\": \"{{validDistributor}}\",\n  \"billingPeriod\": \"{{validPeriod}}\",\n  \"periodProcessDate\": \"{{today}}\"\n}"
        },
        "description": "Tags: @happy-path @critical-flow @CP-001\nRN cubiertas: RN-001, RN-008\nAC cubiertos: AC-001, AC-002"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Status is 201', () => pm.response.to.have.status(201));",
              "pm.test('Has requestId', () => pm.expect(pm.response.json()).to.have.property('requestId'));",
              "pm.test('status is PENDING', () => pm.expect(pm.response.json().status).to.equal('PENDING'));"
            ]
          }
        }
      ]
    }
  ]
}
```

## Estructura del environment

```json
{
  "name": "{wi_id}-{environment}",
  "values": [
    { "key": "baseUrl", "value": "https://api-qa.example.com/v1", "type": "default" },
    { "key": "validCycle", "value": "2026-05", "type": "default" },
    { "key": "validDistributor", "value": "DIST-TEST-001", "type": "default" },
    { "key": "validPeriod", "value": "2026-05", "type": "default" },
    { "key": "today", "value": "{{$isoTimestamp}}", "type": "default" },
    { "key": "tomorrow", "value": "", "type": "default", "_note": "Calcular antes de correr o usar pre-request script" }
  ]
}
```

## Tratamiento de fixtures con `runtime:*`

Las fixtures temporales (`{runtime:date:today}`) se traducen a:

- Si Postman tiene helper nativo (`{{$isoTimestamp}}`, `{{$timestamp}}`) → usarlo
- Si no → generar `pre-request script` que calcule la fecha y la asigne al environment

## Reglas duras

1. **Sin credenciales literales.** Las variables sensibles se dejan vacías con instrucción de completar antes de correr.
2. **Reproducibilidad.** El JSON generado es estable — mismo input → mismo output (excepto timestamps de metadata).
3. **Test scripts equivalentes a Playwright.** Cada assertion del CP tiene su counterpart en Postman.
4. **Sin lógica de negocio en pre-request scripts.** Solo cálculo de variables temporales o tokens dinámicos.

## Cuándo NO invocar

- `fast-track` con colección del baseline aún válida — reutilizar
- WI sin endpoints (wi-003 puro de consolidación) — no se genera colección

## Anti-patterns

- **Mezclar varios WIs en una misma collection.** Una collection = un WI.
- **Hardcodear el `baseUrl`.** Siempre variable del environment.
- **Editar manualmente la colección después de generarla.** Si hace falta cambio, se regenera desde el JSON canónico.
- **Test scripts vacíos.** Toda request lleva al menos 1 `pm.test` (status code).

## Referencias

- Templates: `templates/collection.template.json`, `templates/environment.template.json`
- Ejemplo: `examples/example-wi-001.postman_collection.json`
