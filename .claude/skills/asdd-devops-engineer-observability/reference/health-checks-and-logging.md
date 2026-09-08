# Health Checks y Logging Estructurado

Implementación concreta de los endpoints `/health` y `/ready`, patrones de
logging y campos mínimos que debe tener cada log.

## Health Checks

```typescript
// /health — liveness probe (¿está vivo el proceso?)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// /ready — readiness probe (¿puede recibir tráfico?)
app.get('/ready', async (_req, res) => {
  try {
    await db.ping()           // conexión a DB
    await cache.ping()        // conexión a cache
    res.json({ status: 'ready' })
  } catch (err) {
    res.status(503).json({ status: 'not ready', reason: err.message })
  }
})
```

### Regla clave
- `/health` **no debe** consultar dependencias — si lo hace, Kubernetes reinicia
  el pod cuando la DB falla temporalmente (efecto cascada).
- `/ready` **sí** valida dependencias — si la DB está caída, el pod sale del
  pool de tráfico pero sigue vivo.

## Logging estructurado

```typescript
import { logger } from './logger'

// CORRECTO: JSON estructurado con contexto
logger.info('Payment processed', {
  paymentId: payment.id,
  amount: payment.amount,
  currency: payment.currency,
  durationMs: Date.now() - startTime,
  traceId: req.traceId
})

// INCORRECTO: string interpolado sin contexto
console.log(`Payment ${payment.id} processed for ${payment.amount}`)
```

### Campos mínimos en cada log

| Campo | Descripción |
|---|---|
| `timestamp` | ISO 8601 con timezone |
| `level` | debug / info / warn / error |
| `service` | nombre del servicio |
| `traceId` | ID de la traza distribuida (propagado desde el upstream) |
| `spanId` | ID del span actual (si aplica) |
| `message` | descripción concisa del evento |
| `context` | objeto con IDs de entidades, duración, resultado |

### Campos nunca loggear

- Passwords, tokens, API keys.
- PAN (Primary Account Number), CVV, datos de tarjeta (PCI-DSS).
- PHI en dominio salud (HIPAA).
- Datos personales identificables cuando no sea estrictamente necesario.
- Tokens de sesión completos — loggear hash o prefijo.

## Correlación cross-service

Propagar `traceId` en todos los headers salientes:

```typescript
// middleware de express
app.use((req, _res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuid()
  next()
})

// al llamar downstream
fetch(url, { headers: { 'x-trace-id': req.traceId, ... } })
```

## Niveles de log por contexto

| Nivel | Usar para |
|---|---|
| `error` | Excepciones no manejadas, fallos que despagan |
| `warn` | Degradación (cache miss repetido, retry exhausto) |
| `info` | Eventos de negocio (payment processed, user registered) |
| `debug` | Detalle interno (útil en dev, off en prod) |
