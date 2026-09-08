# Pattern — Saga orquestada para checkout multi-step

**Contexto:** E-commerce. Checkout requiere 3 pasos en servicios distintos:
reserva inventario, captura pago, crea orden. Cada paso puede fallar y debe
poder compensarse.

**Decisión:** Saga orquestada con un Checkout Orchestrator dedicado.

## Por qué orquestada (no coreografiada)

- Flujo crítico para revenue — visibilidad operativa importa más que desacoplamiento.
- Equipo necesita debuggear sagas vivas en producción rápido.
- 3 servicios fijos, no se espera explosión combinatoria de pasos.
- Single point of compensation lógico.

## Diagrama de happy path

Ver `asdd-architect-component-diagram/examples/seq-saga-payment.md`.

## Tabla de pasos y compensaciones

| # | Paso | Servicio | Compensación |
|---|---|---|---|
| 1 | Reservar items | Inventory | Liberar reserva (DELETE /reservations/{id}) |
| 2 | Capturar pago | Payment Provider | Refund (POST /refunds) |
| 3 | Crear orden | Order Service | Cancelar orden (POST /orders/{id}/cancel) |

## Estado persistido

El orquestador escribe en `saga_log` cada paso:

```sql
CREATE TABLE saga_log (
  saga_id UUID PRIMARY KEY,
  status VARCHAR(20),         -- started, paid, completed, compensating, failed
  current_step INT,
  payload JSONB,
  reservation_id UUID,
  payment_id UUID,
  order_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

Si el orquestador crashea, al reiniciar lee sagas en estado `started` o
`compensating` y reanuda desde `current_step`.

## Idempotencia

- `Idempotency-Key` enviado por el cliente → garantía de "no doble checkout" si retry.
- Cada llamada downstream usa `saga_id` como idempotency key — Inventory, Payment, Order saben no duplicar.

## Manejo de fallos

| Falla en | Acción |
|---|---|
| Inventory (paso 1) | 422 al cliente, saga termina sin compensar (no hay nada hecho). |
| Payment (paso 2) | Compensar paso 1 (liberar reserva). 422 al cliente. |
| Order (paso 3) | Compensar paso 2 (refund) + paso 1 (liberar reserva). Notificar a soporte (compensación financiera). |

## Métricas

- `checkout_saga_started_total`
- `checkout_saga_completed_total`
- `checkout_saga_compensated_total{reason="payment_failed|order_failed"}`
- `checkout_saga_orphaned_total` (saga vieja sin completar — alarma)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Orchestrator es single point of coordination | Replicado horizontalmente + saga state en BD compartida |
| Compensación falla (refund timeout) | Reintento con backoff + ticket P1 si supera N intentos |
| Saga huérfana (orchestrator murió a mitad) | Job cron detecta sagas en `started` > 10min y reanuda |
| Doble cobro al cliente | Idempotency-Key + payment provider con dedup (Stripe gestiona) |

## ADR asociado

ADR-007: Saga Orquestada para Checkout (justificación + alternativa coreografiada descartada).
