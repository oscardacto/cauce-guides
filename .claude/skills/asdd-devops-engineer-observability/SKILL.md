---
name: asdd-devops-engineer-observability
description: Logs, métricas y trazas; SLIs y SLOs con error budget, alertas por síntoma y runbooks de incidente.
---

## Rol

Ingeniero de observabilidad. Implementa los tres pilares (logs, métricas, trazas) y define los indicadores de salud del sistema. Sin observabilidad configurada, un servicio no puede ir a producción.

## Cuándo activar

- Nuevo servicio listo para producción sin observabilidad configurada.
- Incidente en producción sin visibilidad suficiente para diagnosticar.
- Definición de SLOs para un servicio nuevo o existente.
- Incorporación de distributed tracing a un sistema de microservicios.
- Fases: **Verificar** (principal) · **Diseñar** (SLOs, arquitectura de obs) · **Construir** (instrumentación).

## Tres pilares

| Pilar | Responde | Herramientas |
|---|---|---|
| **Logs** | ¿Qué pasó exactamente? | Loki + Grafana, CloudWatch Logs, Azure Monitor Logs, GCP Cloud Logging, Datadog Logs |
| **Métricas** | ¿Cuánto / con qué frecuencia? | Prometheus + Grafana, CloudWatch Metrics, Azure Monitor Metrics, Datadog Metrics |
| **Trazas** | ¿Dónde en el sistema ocurrió? | Jaeger, Zipkin, AWS X-Ray, Azure Application Insights, Datadog APM, OpenTelemetry |

OpenTelemetry es el estándar recomendado como capa de instrumentación — desacopla el código del backend de observabilidad.

## Health checks — estándar ASDD

Todo servicio expone exactamente dos endpoints:

```
GET /health  → liveness  — ¿está vivo el proceso? (200 si sí, 503 si no)
GET /ready   → readiness — ¿puede recibir tráfico? (verifica DB, cache, deps)
```

El `/health` nunca verifica dependencias externas — solo que el proceso funciona.
El `/ready` verifica que todas las dependencias requeridas están alcanzables.

## Logging estructurado

Todo log debe ser JSON con campos mínimos:

```json
{
  "timestamp": "2026-05-12T10:30:00Z",
  "level": "INFO",
  "service": "payments-api",
  "traceId": "abc123",
  "spanId": "def456",
  "message": "Payment processed",
  "userId": "u-789",
  "amount": 1500,
  "currency": "COP"
}
```

**Nunca loggear**: passwords, tokens, API keys, números de tarjeta (PAN), datos personales completos (PHI/PII sin enmascarar).

Código de referencia y reglas por nivel de log en [`reference/health-checks-and-logging.md`](reference/health-checks-and-logging.md).

## SLIs / SLOs — Obligatorios antes del primer deploy a prod

Todo servicio en producción declara como mínimo tres SLIs:

| SLI | Definición | SLO típico |
|---|---|---|
| **Disponibilidad** | % requests con respuesta 2xx-3xx | ≥ 99.9% (43 min downtime/mes) |
| **Latencia p99** | % requests bajo umbral de latencia | ≥ 99% requests < 500ms |
| **Tasa de errores** | % requests con respuesta 5xx | ≤ 0.1% |

Cada SLO define un **error budget** derivado. Si el error budget se consume antes de la mitad del período, se suspenden los deploys hasta su recuperación.

Plantilla completa de SLI/SLO por dominio en [`reference/slo-definitions.md`](reference/slo-definitions.md).

## Alertas — solo basadas en síntomas

Las alertas se derivan de los SLOs (no de métricas de causa). Regla: **solo alerta lo que requiere acción humana inmediata**.

```yaml
# Prometheus — alerta basada en SLO de error rate
- alert: HighErrorRate
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total[5m]))
    ) > 0.01
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Error rate > 1% — SLO en riesgo"
    runbook: "https://docs.internal/runbooks/payments-api"
```

Catálogo de reglas base (error rate, latencia, pod caído, saturación) en [`reference/prometheus-alerts.md`](reference/prometheus-alerts.md).

## Dashboard Grafana — panels obligatorios

Todo servicio tiene un dashboard con al menos:

- Request rate (RPS)
- Error rate (%) con línea de SLO
- Latencia P50 / P95 / P99
- Disponibilidad vs. SLO (burn rate)
- CPU y memoria del pod
- Conexiones activas a DB / cache
- Error budget restante

## Runbook de incidentes

Cada servicio en producción tiene `docs/platform/runbook-{service}.md` con:

1. **Síntomas** — qué alerta se dispara y qué significa
2. **Diagnóstico** — comandos para investigar (`kubectl logs`, `kubectl describe`, queries Grafana)
3. **Remediación** — acciones concretas con comandos exactos
4. **Escalamiento** — cuándo y a quién escalar
5. **Post-mortem** — link al template de post-mortem

## Outputs

- `docs/platform/slos-{service}.md` — SLIs y SLOs con error budgets y período de medición.
- `infra/monitoring/alerts-{service}.yaml` — reglas de alertas Prometheus/AlertManager.
- `infra/monitoring/dashboard-{service}.json` — dashboard Grafana exportado.
- `docs/platform/runbook-{service}.md` — guía de diagnóstico con comandos para incidentes.

## Cuándo NO invocar

- No hay SLOs definidos por el equipo de producto — las alertas y dashboards deben derivarse de los SLIs que reflejan lo que el negocio considera "funcionando correctamente"; sin SLOs, la observabilidad produce ruido (alertas sin umbral de negocio) o silencio (sin criterio para alertar); definir primero los SLOs con `asdd-producto`.
- El objetivo es debuggear un bug puntual que acaba de aparecer en development — usar `asdd-explorer` para investigar el código y `asdd-developer-frontend` o `asdd-developer-backend` para corregirlo; este skill configura infraestructura de observabilidad persistente, no hace debugging ad-hoc de tickets.
- No hay infraestructura de observabilidad disponible en el ambiente (no existe Prometheus, Grafana, Loki ni equivalente cloud nativo configurado) — configurar instrumentación sin backend de observabilidad produce código que no tiene dónde enviar métricas ni logs; escalar a `asdd-devops-engineer-iac` para provisionar el stack de observabilidad primero.

## Anti-patterns

- **Alertas sin runbook asociado** — crear reglas de alerta en Prometheus o CloudWatch sin documentar qué debe hacer el operador cuando se disparan. Una alerta que despierta a alguien a las 3am sin un runbook que explique síntomas, diagnóstico y remediación es peor que no tener alerta; el operador improvisa bajo presión y comete errores; toda alerta en producción debe tener `runbook:` en sus annotations con una URL real.
- **Loggear datos sensibles en texto plano** — incluir en los logs campos como `password`, `token`, `card_number`, `ssn`, `email` o cualquier PII/PHI sin enmascarar. Además de ser una violación de GDPR, PCI-DSS e HIPAA, los logs van a sistemas de centralización (Loki, CloudWatch, Datadog) con políticas de retención largas; un audit de seguridad o un breach en el sistema de logs expone datos de usuarios reales.
- **Dashboards sin SLIs definidos previamente** — crear paneles de Grafana con métricas técnicas (CPU, memoria, requests por segundo) sin haberlas vinculado a un SLI de negocio. El resultado es un dashboard que nadie consulta porque no responde la pregunta "¿está el servicio cumpliendo su promesa al usuario?"; los paneles deben mostrar la brecha entre el SLO comprometido y el valor real, con el error budget restante visible.
