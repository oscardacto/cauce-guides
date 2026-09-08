# SLO / SLI — {Servicio o Feature}

**Servicio / Feature:** {…}
**Owner del SLO:** {nombre, rol}
**Período de medición:** mensual rolling 30 días
**Fecha:** {YYYY-MM-DD}

## SLO #1 — {Nombre corto}

### SLI (Indicator)

- **Métrica:** {ej. successful_requests / total_requests, donde successful = 2xx, 3xx}
- **Fuente:** {Datadog APM / CloudWatch / Prometheus}
- **Filtros:** `service:{name} env:prod endpoint:/checkout`
- **Granularidad:** 1 minuto

### SLO (Objective)

- **Target:** {ej. 99.9% mensual rolling}
- **Justificación:** {por qué este número y no otro — costo, expectativa cliente, regulación}

### Error Budget

- **Budget mensual:** {ej. 0.1% = 43m de "errores" permitidos al mes}
- **Política de quema:** si se quema >50% en 7 días, congelar releases no críticos.

### Alerting (burn rate alerts)

| Burn rate | Ventana | Acción |
|---|---|---|
| 14.4× | 1h | Page on-call (consume 2% del budget mensual en 1h) |
| 6× | 6h | Page on-call (consume 5% del budget en 6h) |
| 3× | 1 día | Ticket P2 |
| 1× | 7 días | Notificación a equipo |

## SLO #2 — {Latencia}

### SLI

- **Métrica:** P95(http_request_duration_seconds)
- **Fuente:** Prometheus
- **Filtros:** `endpoint=/checkout, env=prod`

### SLO

- **Target:** P95 ≤ 200ms en período rolling 7 días.

### Error budget

- **Budget:** 5% de minutos del período pueden tener P95 > 200ms.

### Alerting

- Burn rate > 5× en 1h → page on-call.

## Reporting

- Dashboard: {link}
- Reporte mensual: {fecha y a quién}
- Revisión trimestral del SLO: {fecha}

## Cambios a este SLO

| Fecha | Cambio | Razón | Aprobado por |
|---|---|---|---|
| {…} | {ej. SLO subido de 99.5 a 99.9} | {…} | {nombre} |
