# Sequence — Saga orquestada para pago de checkout

**Contexto:** Checkout de e-commerce. Pago involucra reserva de inventario,
cobro al proveedor de pagos y emisión de la orden. Si cualquier paso falla,
se debe compensar lo ya hecho.

**Patrón:** Saga orquestada (un orquestador conoce todos los pasos).

## Happy path

```mermaid
sequenceDiagram
  autonumber
  participant SPA
  participant CO as Checkout Orchestrator
  participant INV as Inventory Service
  participant PAY as Payment Provider
  participant ORD as Order Service

  SPA->>CO: POST /checkout (Idempotency-Key)
  CO->>INV: POST /reservations { items }
  INV-->>CO: 201 { reservationId, expiresAt: now+10m }
  CO->>PAY: POST /charges { amount, token }
  PAY-->>CO: 200 { paymentId, status: captured }
  CO->>ORD: POST /orders { items, paymentId, reservationId }
  ORD-->>CO: 201 { orderId }
  CO->>INV: POST /reservations/{id}/confirm
  INV-->>CO: 200 OK
  CO-->>SPA: 201 { orderId }
```

## Error en payment — compensación

```mermaid
sequenceDiagram
  autonumber
  participant SPA
  participant CO as Orchestrator
  participant INV as Inventory
  participant PAY as Payment Provider

  SPA->>CO: POST /checkout
  CO->>INV: POST /reservations
  INV-->>CO: 201 { reservationId }
  CO->>PAY: POST /charges
  PAY-->>CO: 402 declined
  Note over CO: Compensación: liberar reserva
  CO->>INV: DELETE /reservations/{id}
  INV-->>CO: 204
  CO-->>SPA: 422 { error: payment_declined }
```

## Error en order_service — compensación parcial

```mermaid
sequenceDiagram
  autonumber
  participant CO as Orchestrator
  participant INV as Inventory
  participant PAY as Payment Provider
  participant ORD as Order Service

  CO->>INV: POST /reservations → ok
  CO->>PAY: POST /charges → captured
  CO->>ORD: POST /orders → 500 timeout
  Note over CO: Compensación inversa
  CO->>PAY: POST /refunds { paymentId }
  PAY-->>CO: 200 refunded
  CO->>INV: DELETE /reservations/{id}
  INV-->>CO: 204
  Note over CO: Marca saga como compensada<br/>Notifica a soporte para auditoría
```

## Decisiones reflejadas

- **Idempotency-Key obligatorio** en `/checkout` — protege contra retries del cliente.
- **Reservas con TTL** (10 min) — si el orquestador muere a mitad de saga, las reservas expiran solas.
- **Compensaciones por API explícitas** (DELETE reservation, POST refund) — más simple que event-driven choreography.
- **Estado de saga persistido** (no mostrado): el orquestador escribe en `saga_log` cada paso para poder reanudar tras un crash. Ver `sofka-asdd-architect-patterns/reference/data-patterns.md` sección Sagas.
- **Refund automático** solo cuando hay error técnico downstream del pago. Errores de negocio (fraud detection) usan flujo distinto.
