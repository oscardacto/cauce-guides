# SLI / SLO — Plantilla y ejemplos

Formato estándar para documentar SLOs en `docs/platform/slos-{service}.md`.

## Plantilla

```markdown
## SLOs — {Nombre del servicio}

**Owner**: {equipo responsable}
**On-call**: {rotación}
**Última revisión**: {YYYY-MM-DD}

### SLI: Disponibilidad
- **Definición**: % de requests que retornan HTTP 2xx o 3xx
- **SLO**: ≥ 99.9% en ventana de 30 días
- **Error budget**: 43.8 minutos/mes
- **Fuente de datos**: Prometheus — `sum(rate(http_requests_total{status=~"[23].."}[5m])) / sum(rate(http_requests_total[5m]))`

### SLI: Latencia
- **Definición**: % de requests respondidos en < 200ms (p99)
- **SLO**: ≥ 95% en ventana de 7 días
- **Fuente de datos**: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`

### SLI: Tasa de errores
- **Definición**: % de requests con HTTP 5xx
- **SLO**: ≤ 0.1% en ventana de 24 horas
- **Fuente de datos**: `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`

### Política de error budget
- Si el budget mensual se consume > 50% antes del día 15 → freeze de features,
  foco en reliability.
- Si se consume > 100% → postmortem obligatorio + rolllback del cambio causante.
```

## Ejemplos por dominio

### Fintech — API de pagos

| SLI | SLO | Rationale |
|---|---|---|
| Disponibilidad | 99.95% (21.9 min/mes) | Transacciones no tolerables |
| Latencia p99 | < 300ms, 99% | Autorización debe ser inmediata |
| Tasa de errores | < 0.05% | Cada error es un potencial duplicado o pérdida |
| Consistencia | 100% idempotent retries | PCI/regulatorio |

### Retail — Catálogo

| SLI | SLO | Rationale |
|---|---|---|
| Disponibilidad | 99.9% (43.8 min/mes) | Downtime = pérdida directa |
| Latencia p95 | < 500ms | UX aceptable para browsing |
| Freshness | < 5 min tras cambio en CMS | Expectativa de negocio |

### Logística — Tracking

| SLI | SLO | Rationale |
|---|---|---|
| Disponibilidad | 99.5% (3.6h/mes) | Tolerancia a maintenance windows |
| Lag de eventos | < 60s (p95) | Expectativa del cliente final |

## Cómo derivar alertas desde SLOs

Regla general: **alerta antes de quemar el budget**.

Para un SLO de disponibilidad 99.9% (mensual):
- Warning: budget quemado al 50% del mes.
- Page: burn rate > 14.4× (agota el budget en 2 horas).

Implementación en Prometheus: multi-window, multi-burn-rate alert.
Ver [`prometheus-alerts.md`](prometheus-alerts.md).
