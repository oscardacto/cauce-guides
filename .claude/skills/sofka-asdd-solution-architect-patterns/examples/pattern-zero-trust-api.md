# Pattern — Zero Trust en API multi-tenant SaaS

**Contexto:** Plataforma SaaS multi-tenant (clínicas) con datos PHI. Acceso
desde múltiples canales: web, mobile, partners B2B, integraciones HIS.
Requerimiento HIPAA + SOC 2.

**Decisión:** Zero Trust end-to-end. No hay perímetro confiable. Cada
solicitud se autentica y autoriza con contexto fresco.

## Principios aplicados

1. **Never trust, always verify** — sin confianza implícita por origen de red.
2. **Least privilege** — cada token tiene el mínimo scope necesario.
3. **Assume breach** — diseñar como si el atacante ya estuviera dentro.

## Capas

### Capa 1 — Edge

- WAF con OWASP top 10 rules + custom rules para multi-tenant (header `X-Tenant-Id` obligatorio, validado).
- DDoS protection (Cloudflare / AWS Shield).
- TLS 1.3 obligatorio. Sin downgrade a 1.2.

### Capa 2 — Identity

- Microsoft Entra B2C como IdP para clínicas y pacientes.
- OAuth 2.1 Auth Code + PKCE para web/mobile.
- Client Credentials + mTLS para partners B2B.
- Tokens cortos (access 15 min, refresh 8h con rotation).
- MFA obligatorio para todo rol con acceso a PHI.

### Capa 3 — API Gateway

- Validación de JWT (firma, exp, aud, iss).
- Rate limiting por tenant + por usuario.
- Header `X-Tenant-Id` injectado desde claim del token, no aceptado del cliente.
- Logging de cada request a SIEM.

### Capa 4 — Service mesh interno

- mTLS entre todos los servicios (Istio gestiona certs, rotación 24h).
- Workload identity (SPIFFE) para que cada servicio se identifique.
- Authorization policies por servicio (Cerbos sidecar).
- Tráfico cross-namespace bloqueado por default.

### Capa 5 — Datos

- Cifrado at-rest con KMS (per-tenant key cuando posible).
- Tenant isolation en BD: row-level security (RLS) en Postgres + tenant_id en cada query.
- Tokenization de datos sensibles (PHI ID) para analytics.
- Audit log inmutable con who/what/when/why en S3 con Object Lock.

### Capa 6 — Operaciones

- SIEM con alertas sobre anomalías (login fuera de país, escalación de privilegios).
- Vulnerability scanning continuo (Snyk + Trivy en CI + runtime).
- Secret rotation automática (Vault).
- Privileged Access Management para admin (PAM con just-in-time elevation).

## Authorization decision flow

```
Request → API Gateway (JWT validation) → Service mesh (mTLS + workload identity)
       → Service (Cerbos check con context: user, action, resource, tenant)
       → BD (RLS por tenant_id)
```

Cada hop verifica. Compromiso de un hop NO da acceso completo.

## Validaciones críticas

- **Cross-tenant data leak:** test automatizado en CI que intenta GET `/patients/{id}` con token de tenant A apuntando a recurso de tenant B → debe ser 403/404.
- **JWT spoofing:** test que envía JWT con `alg: none` → debe ser rechazado.
- **Service-to-service sin mTLS:** test que llama a un servicio interno sin cert → debe ser rechazado por mesh.

## Métricas / observability

- `authn_failures_total{reason="expired|invalid_signature|missing"}`
- `authz_denials_total{service, reason}`
- `cross_tenant_attempts_total` (debería ser ~0; spike = alarma)
- `mtls_handshake_failures_total`

## Trade-offs aceptados

- **Latencia adicional** por validación en cada hop. Mitigado con caching corto de JWKS y de policies.
- **Complejidad operativa** — mesh + IdP + Vault + Cerbos. Justificada por compliance.
- **Cost** — mesh + WAF + KMS per-tenant aumentan factura. Aceptado por riesgo de breach.

## ADR asociado

ADR-021: Zero Trust en plataforma SaaS multi-tenant.
