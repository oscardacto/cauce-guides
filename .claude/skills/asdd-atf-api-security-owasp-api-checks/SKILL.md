---
name: asdd-atf-api-security-owasp-api-checks
description: Checks estáticos y probes ligeros contra OWASP API Security Top 10 (BOLA, broken auth, mass assignment) con severidad CVSS.
used_by:
  - asdd-atf-api-security
---

## Propósito

Auditar la API contra el **OWASP API Security Top 10 (2023)** sin requerir herramientas pesadas. Detecta vulnerabilidades comunes mediante:

1. **Análisis estático del contrato** (mass assignment, auth missing, etc.)
2. **Probes ligeros** sobre endpoints en QA (sin ataques destructivos)

Es el primer skill del módulo de Security y corre en paralelo dentro de la Fase 4 (Automate) si `optional_pipelines.security: true`.

## Cuándo invocar

- Tras Fase 2 (Analyze) si flag activo
- Vía `/asdd:qa-do` para auditoría puntual de 1 endpoint
- **Nunca contra producción** sin override explícito del usuario

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_contracts` | array | Output de `step-2-openapi-parser` |
| `business_rules` | array | Para detectar gaps en validaciones declaradas |
| `session_config` | object | Para `app.url`, `app.environment` (debe ser ≠ production) |
| `credentials` | object | Para probes que requieren auth — leídas en runtime |
| `enabled_checks` | array | (opcional) Subset OWASP a ejecutar; default = todos |

## Catálogo OWASP API Top 10 (2023)

| Código | Nombre | Tipo de check |
|---|---|---|
| API1 | Broken Object Level Authorization (BOLA) | Probe dinámico |
| API2 | Broken Authentication | Estático + probe |
| API3 | Broken Object Property Level Authorization | Estático |
| API4 | Unrestricted Resource Consumption | Probe + análisis |
| API5 | Broken Function Level Authorization | Probe |
| API6 | Unrestricted Access to Sensitive Business Flows | Análisis de RN |
| API7 | Server Side Request Forgery (SSRF) | Estático + probe ligero |
| API8 | Security Misconfiguration | Estático + headers |
| API9 | Improper Inventory Management | Análisis de contrato |
| API10 | Unsafe Consumption of APIs | Análisis de RN + integration |

### Detalle de checks por categoría

#### API1 — BOLA (Broken Object Level Authorization)

Si el contrato declara endpoints con `path_param` (`/users/{userId}`):
- **Probe:** crear 2 usuarios; intentar acceder al recurso del usuario A con el token del usuario B
- **Expected:** `403 Forbidden`
- **Finding si:** retorna `200` con datos del A

#### API2 — Broken Authentication

- **Estático:** todos los endpoints fuera de `/auth/*` y `/health` declaran `auth_required: true` o esquema en `securitySchemes`
- **Probe:** intentar acceder sin auth → expected `401`
- **Probe:** intentar con token expirado/inválido → expected `401`

#### API3 — Mass Assignment

- **Estático:** schemas con `additionalProperties: true` sin restricciones
- **Probe:** enviar campo extra `isAdmin: true` no documentado en request — observar si pasa al response

#### API4 — Resource consumption

- **Probe:** request con body de 10MB en endpoint que típicamente recibe < 100KB
- **Probe:** 100 requests/segundo contra 1 endpoint — observar si hay rate limit
- **Estático:** schema permite arrays/strings sin `maxLength`/`maxItems`

#### API5 — Broken Function Level Auth

- **Probe:** intentar `DELETE /resources/{id}` con token de rol básico
- **Expected:** `403`

#### API7 — SSRF

- **Estático:** endpoints que aceptan URLs en su body (campos tipo `url`, `callback`, `webhook`)
- **Probe:** enviar `callback: "http://169.254.169.254/latest/meta-data/"` (AWS metadata) — observar si el servicio lo invoca

#### API8 — Security Misconfiguration

- **Estático:** ausencia de headers de seguridad en responses (`X-Content-Type-Options`, `X-Frame-Options`, etc.)
- **Probe:** error response expone stack trace
- **Estático:** CORS configurado como `*`

#### API9 — Inventory Management

- **Estático:** endpoints documentados en Swagger pero no protegidos por auth
- **Estático:** documentación tiene endpoints `/v1` y `/v2` simultáneamente sin política de deprecación clara

## Severity (CVSS aproximado)

| Severity | Score | Significado |
|---|---|---|
| `critical` | 9.0+ | Toma de control completa, exposición masiva de datos |
| `high` | 7.0-8.9 | Acceso no autorizado a recursos sensibles |
| `medium` | 4.0-6.9 | Information disclosure parcial, DoS limitado |
| `low` | 1.0-3.9 | Hardening recomendado, no explotable directo |

## Proceso

1. Validar que `app.environment !== 'production'`. Si lo es, abortar `SEC-001`.
2. Por cada categoría OWASP en `enabled_checks`:
   2.1. Ejecutar análisis estático sobre `parsed_contracts`.
   2.2. Si corresponde, ejecutar probes (con `--rate-limit` interno para no saturar).
   2.3. Capturar evidencia via `shared-evidence-collector` (con redacción extra de tokens de prueba).
3. Producir `findings.json`.
4. Generar `security-report.md`.

## Output

```json
{
  "run_id": "{run_id}",
  "scan_started_at": "{ISO 8601}",
  "scan_completed_at": "{ISO 8601}",
  "scope": {
    "endpoints_audited": 4,
    "checks_executed": ["API1", "API2", "API3", "API4", "API5", "API7", "API8", "API9"],
    "checks_skipped": [{"code": "API6", "reason": "no sensitive business flow declared en RN"}, {"code": "API10", "reason": "no integration externa documentada"}]
  },
  "findings": [
    {
      "id": "SEC-001",
      "owasp_code": "API3",
      "owasp_name": "Broken Object Property Level Authorization",
      "severity": "medium",
      "cvss_approx": 5.5,
      "title": "Schema BillingRequest permite additionalProperties sin restricciones",
      "description": "El schema OpenAPI tiene `additionalProperties: true` sin lista de propiedades permitidas. Probe confirma que el campo `isAdmin: true` se acepta y persiste en la respuesta.",
      "affected_endpoint": "POST /osf/api/v1/pending-billing-quotas",
      "evidence_path": "docs/testing/atf/{run_id}/security/evidence/SEC-001/",
      "remediation": "1. Cambiar `additionalProperties: true` a `false` en el schema BillingRequest. 2. Si propiedades adicionales son válidas, listarlas explícitamente. 3. Validar en backend que solo los campos esperados se persisten.",
      "owasp_reference": "https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/"
    }
  ],
  "summary": {
    "total_findings": 5,
    "by_severity": {"critical": 0, "high": 1, "medium": 3, "low": 1},
    "blocking_step_7": ["high"]
  }
}
```

## Reglas duras

1. **Solo entornos no-producción.** Si environment es prod → abortar sin probe.
2. **Probes ligeros.** Máximo 10 requests/segundo por probe; total < 100 requests para una corrida completa.
3. **Sin ataques destructivos.** No SQL injection con `; DROP TABLE`, no XSS persistente. Solo detección.
4. **Findings bloqueantes:** `critical` y `high` bloquean Step 7 hasta resolución o ack del usuario.
5. **Trazabilidad OWASP.** Cada finding referencia su URL oficial OWASP API Top 10 2023.

## Cuándo NO invocar

- `optional_pipelines.security: false` — skipped por configuración
- `app.environment: production` — abortar y escalar
- Step 2 no completo — necesita el contrato

## Anti-patterns

- **Probes contra producción.** Nunca, ni "para validar."
- **Findings sin remediation accionable.** "Hay vulnerabilidad" no sirve; necesita "cambiar X a Y."
- **Severity inflada.** Un `additionalProperties: true` rara vez es `critical` — usar la escala con criterio.
- **Saltar API6 / API10 sin justificación.** Si no se ejecuta, registrar en `checks_skipped` con razón.

## Referencias

- Template: `templates/findings.template.json`
- Ejemplo: `examples/example-findings-clienteejemplo.json`
