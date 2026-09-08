# SLO / SLI — Checkout API (e-commerce retail)

**Servicio:** checkout-api
**Owner del SLO:** Tech Lead Checkout (escalación: Arquitecto)
**Período:** mensual rolling 30 días
**Fecha:** 2026-03-15
**Tier:** Tier 0 (revenue critical)

## SLO #1 — Availability

### SLI

- **Métrica:** `(count(status_code in [200,201,202,204,302,304]) / count(*))` sobre todos los endpoints `/orders/*` y `/payments/*`.
- **Fuente:** Datadog APM (`service:checkout-api`).
- **Granularidad:** 1 minuto.

### SLO

- **Target:** 99.95% mensual rolling.
- **Justificación:** caída de 1h en hora pico = USD 12k de revenue perdida + impacto NPS. 99.95% deja 22m/mes — manejable con runbook estándar.

### Error budget

- **Budget mensual:** 0.05% ≈ 22 minutos de "errores" permitidos.

### Burn rate alerts

| Burn rate | Ventana | Acción |
|---|---|---|
| 14.4× | 1h | Page on-call (ya consumiendo 2% del budget mensual) |
| 6× | 6h | Page on-call |
| 3× | 1 día | Ticket P2 al equipo |
| 1× | 7 días | Notificación + retro |

## SLO #2 — Latencia

### SLI

- **Métrica:** P95(http_request_duration_seconds) sobre `POST /orders` y `POST /orders/{id}/payments`.
- **Fuente:** Prometheus + Grafana.

### SLO

- **Target:** P95 ≤ 250ms en período rolling 7 días.
- **Justificación:** P95 > 400ms degrada conversión de checkout en >5% (medido en A/B test 2025-Q4).

### Error budget

- **Budget:** 5% de minutos del período rolling pueden exceder P95 > 250ms.

### Burn rate alerts

- 5× en 1h → page.
- 2× en 6h → ticket P2.

## SLO #3 — Pagos exitosos (calidad de negocio)

### SLI

- **Métrica:** `payments_captured / payments_attempted` sobre rolling 1h.
- **Fuente:** Datadog metrics (custom metric emitida por checkout-api).

### SLO

- **Target:** ≥ 92% mensual.
- **Justificación:** baseline histórica 93-95%. <90% indica problema con proveedor de pagos o con el flow de checkout.

### Burn rate

- < 88% en 1h → page on-call (probable degradación del proveedor o bug).

## Reporting

- **Dashboard:** Datadog `Checkout - SLO Dashboard`.
- **Reporte mensual:** primer día hábil del mes, a CTO + PO Checkout.
- **Revisión SLO:** trimestral (Q1, Q2, Q3, Q4).

## Cambios a este SLO

| Fecha | Cambio | Razón | Aprobado por |
|---|---|---|---|
| 2025-11-10 | Availability subido de 99.9 a 99.95 | SLA cliente Black Friday | CTO |
| 2026-01-20 | P95 latencia bajado de 300ms a 250ms | Resultado A/B test conversión | PO + Arquitecto |
