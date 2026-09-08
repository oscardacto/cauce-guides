# Prometheus / AlertManager — Reglas base

Catálogo de alertas base derivadas de los SLIs/SLOs típicos. Adaptar el
selector `{service=...}` al servicio objetivo.

```yaml
groups:
  - name: {service}-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 1% en {{ $labels.service }}"
          runbook: "docs/platform/runbook-{service}.md#high-error-rate"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency > 500ms en {{ $labels.service }}"
          runbook: "docs/platform/runbook-{service}.md#high-latency"

      - alert: ServiceDown
        expr: up{job="{service}"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.instance }} está caído"
          runbook: "docs/platform/runbook-{service}.md#service-down"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{pod=~"{service}.*"} / container_spec_memory_limit_bytes > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.pod }} usando > 90% de memoria límite"

      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total{pod=~"{service}.*"}[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.pod }} en crash loop"
```

## Multi-burn-rate alerts (best practice de Google SRE)

Para un SLO de 99.9% mensual, avisar con tiempo según la velocidad a la que
se está quemando el budget:

```yaml
- alert: ErrorBudgetBurnFast
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[1h])) / sum(rate(http_requests_total[1h])) > 14.4 * 0.001
      and
      sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 14.4 * 0.001
    )
  for: 2m
  labels:
    severity: page
  annotations:
    summary: "Budget quemándose a 14.4× — agotado en 2h si persiste"

- alert: ErrorBudgetBurnSlow
  expr: |
    (
      sum(rate(http_requests_total{status=~"5.."}[6h])) / sum(rate(http_requests_total[6h])) > 3 * 0.001
      and
      sum(rate(http_requests_total{status=~"5.."}[1h])) / sum(rate(http_requests_total[1h])) > 3 * 0.001
    )
  for: 15m
  labels:
    severity: ticket
  annotations:
    summary: "Budget quemándose a 3× — agotado en ~10 días si persiste"
```

## Reglas para no abusar de las alertas

- Solo alerta lo que requiere **acción humana inmediata**.
- Si una alerta se auto-resuelve, no es alerta — es log.
- Toda alerta debe tener `runbook` en annotations.
- Revisar cada trimestre: alertas que nunca se dispararon → eliminar o ajustar.
