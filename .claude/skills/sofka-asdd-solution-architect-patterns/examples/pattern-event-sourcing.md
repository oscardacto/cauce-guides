# Pattern — Event Sourcing para Ledger contable

**Contexto:** Ledger del wallet. Cada movimiento contable debe ser auditable
con historia completa, reconciliable contra el core bancario, y la regulación
exige no perder ni alterar movimientos pasados (immutability).

**Decisión:** Event Sourcing con projections para queries.

## Por qué Event Sourcing aquí

- **Auditoría completa requerida** por regulación (Circular SuperFin).
- **"Estado en el tiempo T"** es pregunta común (conciliación de cierre del día).
- **Append-only** alinea con la naturaleza contable (no se borra, se contraasiente).
- **Re-derivar projections** facilita evolución de reportes sin migrar datos.

## Estructura

### Event Store

```sql
CREATE TABLE ledger_events (
  event_id UUID PRIMARY KEY,
  account_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL,
  UNIQUE (account_id, version)
);
CREATE INDEX idx_account_version ON ledger_events(account_id, version);
```

`version` es monotónica por `account_id` — controla concurrencia optimista.

### Eventos del dominio

- `AccountOpened`
- `MoneyDeposited`
- `MoneyWithdrawn`
- `MoneyTransferredOut`
- `MoneyTransferredIn`
- `AccountFrozen`
- `AccountUnfrozen`
- `AccountClosed`

NUNCA `AccountUpdated` o `MovementCorrected`. Si hay error, se hace una
contraasiento (`AdjustmentDebited` / `AdjustmentCredited`) que deja trazabilidad.

### Projections (read models)

| Projection | Updateado por | Storage | Uso |
|---|---|---|---|
| `account_balance` | event handler | Postgres tabla | Saldo actual (cache) |
| `account_statements` | event handler | Postgres tabla | Estado de cuenta mes a mes |
| `daily_reconciliation` | batch nocturno | Parquet en S3 | Conciliación con core |

## Snapshots

Para cuentas con > 10k eventos, se crea snapshot cada 1000 eventos para
acelerar reconstrucción del estado actual:

```sql
CREATE TABLE account_snapshots (
  account_id UUID NOT NULL,
  version INT NOT NULL,
  snapshot_state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (account_id, version)
);
```

Reconstrucción: leer último snapshot + eventos posteriores.

## Concurrencia optimista

```sql
INSERT INTO ledger_events (..., version) VALUES (..., last_version + 1);
-- Si UNIQUE constraint falla → reintentar leyendo el version actual.
```

## Replay y rebuild de projections

Si una projection se corrompe o cambia de schema, se reconstruye:

```bash
# 1. Trunc projection
TRUNCATE account_statements;
# 2. Replay todos los eventos en orden
SELECT * FROM ledger_events ORDER BY occurred_at;
# 3. Aplicar el handler nuevo a cada evento
```

## Trade-offs aceptados

- **Storage growth:** ledger crece linealmente con eventos. Política: archivado a S3 Glacier después de 7 años.
- **Queries complejas via projections solamente** — no se hacen joins ad-hoc sobre ledger_events.
- **GDPR:** se mitiga con encriptación per-account; "right to be forgotten" rompe la propiedad append-only por diseño → se discute con compliance, en general se anonimiza payloads en vez de borrar.
- **Curva equipo:** training inicial 2-3 semanas para que devs piensen en términos de eventos.

## Patrones complementarios

- **CQRS:** lectura via projections, escritura via eventos.
- **Outbox:** los eventos del ledger también se publican a Kafka para consumers (Notifications, BI).
- **Saga:** para movimientos cross-account (transferencias entre wallets).

## ADR asociado

ADR-012: Event Sourcing para Ledger contable.
