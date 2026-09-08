---
name: sofka-asdd-solution-architect-patterns
description: Catálogo de estilos (microservicios, serverless, EDA), integración EIP, datos (CQRS, sagas, outbox) y seguridad, con decision tree.
---

## Propósito

Catálogo de consulta. NO prescribe — muestra trade-offs por contexto. El skill
ayuda a identificar qué patrón aplica al problema y qué references cargar para
profundizar.

Las decisiones que salen de aquí entran como alternativas en
`sofka-asdd-architect-tradeoff-analysis` y se documentan en un ADR vía
`sofka-asdd-architect-adr`.

## Cuándo invocar

- Decisión de estilo arquitectónico (monolito / micro / serverless / EDA).
- Diseño de integración entre 2+ sistemas o servicios.
- Sistema con múltiples almacenes de datos (CQRS, ES, sagas, outbox).
- Requerimiento de seguridad o compliance que afecta arquitectura (zero trust, mTLS, secrets).
- Selección de patrón antes de un ADR.

## Cuándo NO invocar

- Implementación táctica de un patrón ya decidido (delegar a developer).
- Refactor dentro de un mismo patrón (delegar a tech-lead).
- Decisión sin impacto estructural.

## Tabla de routing (núcleo del skill)

| Si el problema es… | Aplicar |
|---|---|
| Estilo macro del sistema | Selección de estilo (ver abajo) |
| Integración entre 2+ sistemas | Convenciones COE de integración (ver abajo) |
| Decidir sync vs async | Default sync/async COE (ver abajo) |
| Múltiples almacenes / sagas / CQRS / ES | Patrones de datos (CQRS, ES, sagas orquestadas/coreografiadas, outbox, db-per-service) |
| Zero trust, defense in depth, secrets, API gateway | Patrones de seguridad (zero trust, mTLS, secrets KMS, API gateway, JWE) |
| OAuth, OIDC, PKCE, mTLS, sessions | Patrones de auth (OAuth 2.1, OIDC, PKCE, refresh rotation, sessions) |

## Selección de estilo arquitectónico

Decision tree para descartar opciones obvias rápido. **NO sustituye análisis
riguroso** — sirve para acotar.

**Default Sofka: Monolito Modular.** Apartarse de él requiere justificación.

### Pregunta 1 — Tamaño del equipo (thresholds Sofka)

- **≤ 15 devs en un solo equipo** → MONOLITO MODULAR (default). Si workload es muy event-driven, considerar SERVERLESS + EDA.
- **16-50 devs en 2-5 squads** → MICROSERVICIOS si los bounded contexts son claros; sino MONOLITO MODULAR + extraer servicios cuando duela.
- **> 50 devs en > 5 squads** → MICROSERVICIOS casi siempre. Conway's law domina.

### Pregunta 2 — Práctica DevOps/SRE

- Sin SRE dedicado, sin CI/CD, < 1 deploy/día → MONOLITO. Microservicios sin DevOps maduro = downtime.
- CI/CD + observability + deploys diarios → microservicios viables.
- Plataforma interna (PaaS, k8s gestionado, observability como servicio) → micro o serverless según workload.

### Pregunta 3 — Tipo de carga

- Tráfico predecible y constante → Containers (ECS/EKS/GKE/Container Apps).
- Tráfico altamente variable (10× picos) → Serverless o auto-scaling agresivo.
- Workload event-driven → EDA + serverless (Lambda/Functions).
- Workload latency-critical (sub-50ms P99) → Containers con warm pools, evitar serverless cold starts.

### Pregunta 4 — Dominio

- Dominio simple CRUD → MONOLITO LAYERED.
- Dominio con reglas complejas, terminología propia → MONOLITO HEXAGONAL o CLEAN; si crece, extraer a microservicios por bounded context.
- Dominio naturalmente event-driven → EDA + sagas para flujos multi-step.

### Pregunta 5 — Lock-in

- Cliente acepta lock-in cloud → Serverless del provider viable.
- Cliente quiere portabilidad → Containers + Kubernetes.
- Cliente exige on-prem → Containers en infra propia + k8s.

### Anti-flowchart Sofka (señales de alerta)

| Si oís… | Sospechá |
|---|---|
| "Microservicios desde el día 1" | Posible over-engineering. Empezar monolítico modular. |
| "Microservicios para escalar el equipo" | Válido si > 25 devs. No para equipos chicos. |
| "Serverless porque es moderno" | Verificar el fit (event-driven, variable load, lock-in aceptable). |
| "Necesitamos Kafka para todo" | Probable overkill. Validar volumen y casos de uso. |
| "Hexagonal es overkill" | Quizás. Hexagonal cuesta poco si se aplica desde el start. |

### Heurísticas finales Sofka

1. **Default = Monolito modular.** Apartarse de él requiere justificación.
2. **Conway's Law:** la arquitectura va a reflejar la organización, querás o no.
3. **No copiar a Netflix/Uber.** Su contexto no es el tuyo.
4. **La complejidad migra, no desaparece.** Microservicios mueven complejidad de código a operaciones.
5. **Reversibilidad importa.** Decisiones reversibles requieren menos análisis. Estilo macro suele ser irreversible — pensar bien.

## Default sync/async COE

**Default Sofka:** sync **sólo** cuando el cliente necesita la respuesta para
continuar. El resto, async.

**Checklist Sofka antes de adoptar async:**

- [ ] ¿El consumer es idempotente?
- [ ] ¿Hay DLQ?
- [ ] ¿Schema versionado y registry?
- [ ] ¿Observability cross-servicio (correlation ID)?
- [ ] ¿Contract test entre producer y consumer?

Si alguna respuesta es "no", se cubre antes de adoptar async, o se queda con sync.

## Convenciones COE de integración (EIP)

Sobre el catálogo EIP de Hohpe (Channels / Construction / Routing /
Transformation / Endpoints / System Management), aplicar:

1. **Pub-Sub por defecto** para eventos de dominio.
2. **Point-to-Point** para tareas de trabajo (worker queues).
3. **DLQ obligatorio** en producción.
4. **Idempotent receiver siempre** — broker no garantiza exactly-once en práctica.
5. **Schema versionado** (Avro/Protobuf si Kafka, JSON Schema sino).
6. **No mensajes >256KB** — usar Claim Check para payloads grandes.

## Metodología

1. Identificar la categoría del problema (de la tabla de routing).
2. Aplicar el decision tree o las convenciones COE inline.
3. Listar 2-4 patrones candidatos del catálogo (Claude conoce los nombres canónicos).
4. Filtrar por contexto del cliente (cargado en `architect-discovery`).
5. Listar trade-offs de cada candidato según el contexto.
6. Si la elección no es trivial, encadenar con
   `sofka-asdd-architect-tradeoff-analysis` para matriz formal.
7. Documentar la decisión final en un ADR (`sofka-asdd-architect-adr`) y, si
   produce diagrama, delegar a `sofka-asdd-architect-component-diagram`.

## Output

Este skill **no produce archivos por sí solo**. Sus outputs alimentan:
- Sección "Patrón seleccionado" del ADR.
- Sección "Alternativas evaluadas" del ADR si se listaron varios candidatos.
- Diagrama de componentes (delegado).

## Ejemplos

- `examples/pattern-saga-orchestrated.md` — saga orquestada para checkout multi-step.
- `examples/pattern-event-sourcing.md` — event sourcing en ledger contable.
- `examples/pattern-zero-trust-api.md` — zero trust en API multi-tenant.
