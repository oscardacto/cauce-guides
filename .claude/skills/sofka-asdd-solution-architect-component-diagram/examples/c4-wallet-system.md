# C4 — Wallet System

**Fecha:** 2026-03-12
**Autor:** Arquitecto Wallet

## L1 — System Context

```mermaid
graph TB
  classDef external fill:#f3f4f6,stroke:#6b7280
  classDef person fill:#fff7ed,stroke:#d97706

  cliente([Cliente final]):::person
  operador([Operador back-office]):::person
  wallet[Wallet System]
  core[Core Bancario]:::external
  sms[SMS Gateway]:::external
  cognito[AWS Cognito]:::external

  cliente -->|Consulta saldo, transfiere| wallet
  operador -->|Ajustes manuales| wallet
  wallet -->|Movimientos contables| core
  wallet -->|Notifica| sms
  wallet -->|Autentica| cognito
```

## L2 — Containers

```mermaid
graph TB
  classDef db fill:#dbeafe,stroke:#1e40af
  classDef external fill:#f3f4f6,stroke:#6b7280

  cliente([Cliente])
  spa[Web SPA<br/>React 18]
  mobile[Mobile App<br/>React Native]
  api[API Gateway<br/>Kong]
  walletSvc[Wallet Service<br/>Node 20]
  ledgerSvc[Ledger Service<br/>Java 21]
  walletDb[(Postgres 16<br/>wallet)]:::db
  ledgerDb[(Postgres 16<br/>ledger)]:::db
  redis[(Redis 7<br/>cache + idempotency)]:::db
  kafka[Kafka<br/>3 brokers]
  core[Core Bancario]:::external

  cliente -->|HTTPS| spa
  cliente -->|HTTPS| mobile
  spa -->|REST/JSON| api
  mobile -->|REST/JSON| api
  api -->|HTTP| walletSvc
  walletSvc -->|gRPC| ledgerSvc
  walletSvc --> walletDb
  walletSvc --> redis
  ledgerSvc --> ledgerDb
  walletSvc -->|publish| kafka
  ledgerSvc -->|consume| kafka
  walletSvc -->|SOAP via ACL| core
```

## L3 — Wallet Service (interno)

```mermaid
graph TB
  subgraph "Wallet Service (Node 20)"
    http[HTTP Layer<br/>Express]
    app[Application Service<br/>use cases]
    dom[Domain<br/>Account, Movement, Money]
    repo[Wallet Repository<br/>TypeORM]
    pub[Event Publisher<br/>kafkajs]
    acl[Core ACL<br/>SOAP client]
  end

  http --> app
  app --> dom
  app --> repo
  app --> pub
  app --> acl
```

## Notas y decisiones

- **ADR-001:** Postgres como BD principal por ACID y experiencia del equipo.
- **ADR-002:** Cognito como IdP — Conformist (sin ACL).
- **Core Bancario con ACL:** ACL aísla del modelo SOAP legacy. Ver `bounded-contexts.md` (wallet → core).
- **Kafka entre Wallet y Ledger:** consistencia eventual aceptable. Saldo del usuario y libro contable se concilian asincrónicamente.
- **Redis usado para 2 cosas:** caché de saldo (TTL 30s) e idempotencia de POST (TTL 24h).
