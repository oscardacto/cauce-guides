# Spec — Checkout de 1 clic

> **Ejemplo de referencia ASDD**. Feature ficticio. Deriva del brief en
> `docs/.example/brief.md`.

| Campo | Valor |
|---|---|
| **Feature** | Checkout de 1 clic |
| **Versión de la spec** | 1.0 |
| **Fecha** | 2026-04-23 |
| **Brief origen** | `docs/specs/brief-checkout-1-click.md` |
| **Status** | approved |

## 1. Personas y contexto

### Usuario elegible

Usuario con cuenta activa, ≥ 3 compras exitosas sin contracargo en los
últimos 12 meses, método de pago tokenizado guardado, dirección default
marcada.

### Usuario no elegible

Cae al flujo de checkout clásico. Se muestra mensaje opcional indicando los
criterios de elegibilidad (transparencia), sin pedir acción.

## 2. Historias de usuario

### HU-001: Activación opt-in

> Como usuario elegible, quiero activar "checkout de 1 clic" desde mi perfil
> para acelerar mis próximas compras.

**Criterios de aceptación**:
- AC1: En "Mi cuenta > Preferencias", existe un toggle "Checkout de 1 clic"
  con estado inicial OFF.
- AC2: Al activar, se muestra modal con resumen de implicaciones y botón
  "Acepto". Sin aceptación, el toggle vuelve a OFF.
- AC3: La activación queda registrada con timestamp, IP y user agent en
  auditoría.
- AC4: Si el usuario deja de cumplir criterios de elegibilidad (contracargo
  nuevo), el toggle se desactiva automáticamente y se notifica por email.

### HU-002: Compra con 1 clic

> Como usuario elegible con "1 clic" activo, quiero comprar un producto con
> un solo clic desde el detalle del producto.

**Criterios de aceptación**:
- AC5: Botón "Comprar en 1 clic" visible solo si el usuario es elegible y
  tiene el feature activo.
- AC6: Al hacer clic, se muestra overlay con: producto, precio total, método
  de pago, dirección, y countdown de 60s con botón "Cancelar".
- AC7: Si el usuario no cancela, se procesa la compra al finalizar el
  countdown. Se muestra confirmación inline + push notification.
- AC8: Si el usuario cancela en la ventana de 60s, la transacción no se
  genera y se vuelve al detalle del producto.
- AC9: El tiempo total desde clic hasta confirmación (descontando el
  countdown) debe ser ≤ 6s (p50), ≤ 12s (p99).

### HU-003: Fallback al flujo clásico

> Como usuario elegible, quiero cambiar dirección o método de pago en la
> compra actual sin perder el intento.

**Criterios de aceptación**:
- AC10: En el overlay de 1 clic, botón "Cambiar dirección" y "Cambiar
  método de pago" redirigen al checkout clásico con el carrito precargado.
- AC11: El abandono en el fallback se loggea para analytics (distinguiendo
  de un cancel puro).

## 3. Casos de uso

### Caso feliz

```
Usuario elegible → detalle producto → clic "Comprar en 1 clic"
  → overlay con countdown → espera 60s
  → se ejecuta payment + fulfillment
  → confirmación en UI + push + email
```

### Casos alternativos

| ID | Escenario | Resultado esperado |
|---|---|---|
| CU-A1 | Usuario cancela en countdown | Transacción no generada; métrica "1-click cancel" + 1 |
| CU-A2 | Token de pago expirado al procesar | Fallback silencioso al flujo clásico con mensaje explicativo |
| CU-A3 | Inventario agotado entre clic y procesamiento | Error claro + sugerencia de similares |
| CU-A4 | Antifraude rechaza | Mensaje genérico (sin revelar heurística) + contacto soporte |
| CU-A5 | Usuario pierde elegibilidad durante el countdown | Transacción se completa (consistencia) pero se desactiva el toggle para futuras |

## 4. Edge cases

- **Doble clic accidental**: solo una transacción debe generarse. Idempotency
  key = `${userId}:${productId}:${clientTimestamp}`.
- **Red intermitente**: retry con exponencial backoff en cliente (3 intentos),
  server rechaza duplicados con mismo idempotency key.
- **Cambio de producto entre vistas**: overlay muestra snapshot congelado del
  producto al momento del clic, no estado actual.
- **Usuario con saldo insuficiente en wallet propia**: caer a tarjeta default
  si existe, sino fallback al flujo clásico.
- **i18n**: el countdown muestra "60" en todos los idiomas; el texto se
  internacionaliza.
- **Accesibilidad**: el overlay debe ser dismisable con ESC y anunciarse al
  lector de pantalla con `role="alertdialog"` y `aria-live="assertive"`.

## 5. Datos y contratos

| Entidad | Campos nuevos | Persistencia |
|---|---|---|
| `User.preferences` | `oneClickEnabled: bool`, `oneClickActivatedAt: timestamp` | PostgreSQL |
| `Order` | `oneClickFlow: bool`, `oneClickCancelledAt: timestamp?` | PostgreSQL |
| `AuditLog` | evento `one_click_activation`, `one_click_deactivation`, `one_click_purchase` | S3 + Athena |

Contrato API: extensión a `POST /checkout` con campo `flow: "standard" | "one_click"`.

## 6. Requisitos no funcionales

- **Performance**: p99 del procesamiento ≤ 12s desde fin del countdown.
- **Disponibilidad**: misma disponibilidad que checkout clásico (99.95%).
- **Seguridad**: PAN nunca viaja al frontend; solo tokens. CSRF token por
  sesión; re-verificación si la sesión tiene > 30 días.
- **Observabilidad**: métricas `one_click_started`, `one_click_completed`,
  `one_click_cancelled`, `one_click_fallback` con dimensiones (platform,
  cohort).

## 7. Gaps y preguntas abiertas

- **Q1**: ¿Qué pasa si el producto tiene precio variable (promoción dinámica)
  entre clic y procesamiento? **Pendiente con product + finance.**
- **Q2**: ¿Se permite 1 clic en gift cards? **Probable restricción
  regulatoria — validar con compliance.**
- **Q3**: ¿Los vendedores del marketplace deben opt-in explícitamente?

Gaps documentados por separado en `docs/specs/gaps-checkout-1-click.md`.

## 8. Status

- [x] Historias y AC verificables.
- [x] Casos de uso felices y alternativos.
- [x] Edge cases cubiertos.
- [x] Datos y contratos identificados.
- [x] Requisitos no funcionales explícitos.
- [x] Gaps documentados.
- [x] **Status: approved** — listo para `/asdd:design`.

## 9. Siguiente paso

Ejecutar `/asdd:design` para generar ADRs (p.ej. idempotencia,
anti-fraude) y component specs UX (overlay de countdown, toggle de activación).
