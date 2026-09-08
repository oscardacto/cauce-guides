# ADR-001 — Idempotencia del checkout de 1 clic

> **Ejemplo de referencia ASDD**. Feature ficticio. Deriva del spec en
> `docs/.example/spec.md`.

| Campo | Valor |
|---|---|
| **Estado** | Accepted |
| **Fecha** | 2026-04-23 |
| **Autor** | architect |
| **Reviewers** | tech-lead, security, domain-expert (retail) |
| **Feature** | Checkout de 1 clic |

## Contexto

El spec del feature requiere que un doble-clic accidental o un retry de red
**no genere dos transacciones**. El servicio `POST /checkout` hoy no es
idempotente — cada request genera una orden nueva. Para soportar 1 clic con
garantías de "exactly once" desde la perspectiva del usuario, necesitamos
un mecanismo de idempotencia.

Restricciones:
- La cardinalidad esperada de intentos es alta: ~200 RPS en peak hour.
- Las órdenes deben persistir aún si el cliente abandona la UI tras el
  clic (commit antes de ack al cliente).
- Tiempo total del flujo (incluyendo idempotency check) debe respetar
  p99 ≤ 12s.

## Decisión

Introducir una **idempotency key** por request:

```
Header: Idempotency-Key: {userId}:{productId}:{clientTimestamp}
```

El backend persiste la tupla `(idempotency_key, result)` en una tabla
dedicada `idempotency_records` con TTL de 24h. Antes de crear la orden, se
consulta la tabla: si existe, se retorna el result cacheado; si no, se
procesa y se persiste.

La tabla usa índice único sobre `idempotency_key` con locking optimista
(Postgres `INSERT ... ON CONFLICT DO NOTHING RETURNING`).

## Alternativas evaluadas

### Alternativa 1: Idempotency key en header (elegida)

- **Pros**:
  - Estándar de industria (Stripe, PayPal usan este patrón).
  - No requiere cambios en la semántica del endpoint.
  - TTL de 24h suficiente para retry pattern.
- **Contras**:
  - Añade lookup adicional por request (~2ms en SSD con índice único).
  - Requiere limpieza periódica de la tabla (cron de purge > 24h).

### Alternativa 2: Lock distribuido en Redis con `userId:productId`

- **Pros**: No persiste estado adicional en DB.
- **Contras**:
  - Redis como single point of failure en el path crítico.
  - Si Redis cae entre lock y commit, orden puede duplicarse.
  - No cubre el caso de "mismo usuario, mismo producto, distintos momentos
    (intencional)": ej. comprar 2 del mismo item en dos clics.
  - **Descartada**: fragilidad operativa inaceptable para path financiero.

### Alternativa 3: Natural key en base de datos (`user + cart_snapshot + timestamp_ms`)

- **Pros**: Sin tabla adicional.
- **Contras**:
  - Acopla lógica de idempotencia al schema del domain model.
  - Cambios en el carrito (items, cantidad) invalidan la llave — retry real
    del mismo clic puede generar duplicados si el snapshot cambió por TZ.
  - Dificulta retries limpios desde el cliente.
  - **Descartada**: acoplamiento excesivo.

## Trade-offs de la decisión

| Aspecto | Impacto |
|---|---|
| Performance | +2ms por request (medidos con benchmark en spike-001) |
| Storage | ~200 MB/día con 17M requests/día → 6 GB/mes con purge de 24h |
| Complejidad operativa | +1 cron de purge + monitoreo de la tabla |
| Cumplimiento PCI-DSS | Neutro — no se persiste PAN |
| Simplicidad de cliente | + Los clientes deben generar y enviar la key |

## Consecuencias

- El SDK del cliente (web + mobile futuro) debe agregar `Idempotency-Key`
  con formato estándar.
- Se agrega una migración de DB: tabla `idempotency_records` (id, key UNIQUE,
  response JSONB, created_at).
- Se añade un cron de purge diario (`platform-engineer-iac`).
- Se añade alerta Prometheus: tasa de conflictos > 1% durante 5min →
  warning (posible abuso o bug cliente).
- El `qa-engineer` debe cubrir explícitamente: doble-clic, retry de red,
  retry tras timeout, retry en branch diferente del mismo usuario.

## Referencias

- Spike: `docs/architecture/spikes/2026-04-15-idempotency-benchmark.md`
- Patrón Stripe idempotency: https://stripe.com/docs/api/idempotent_requests
- Spec origen: `docs/specs/checkout-1-click.md` (HU-002, edge case
  "doble clic accidental")
- Regulación aplicable: PCI-DSS v4.0 sección 3 (protección de datos)
