# Review — Descomposición de monolito Sales hacia microservicios

**Fecha:** 2026-04-10
**Reviewer:** Arquitecto Sofka
**Solicitante:** CTO + Tech Lead Sales
**Tipo:** Modernización
**Modo:** Modo 2 (evolution roadmap)

## Resumen ejecutivo

Sales es un monolito Spring Boot de 8 años, 600k líneas, 2 BDs Postgres
compartidas (sales y reporting), 25 devs en 4 squads. Releases semanales
bloqueadas por coordinación cross-squad. Bug fix tarda 3-4 días por testing y
deployment manual.

El equipo plantea descomponer en microservicios. La revisión confirma que los
bounded contexts existen y son extraíbles, pero advierte contra un big-bang.
Recomendación: **strangler fig por bounded context**, empezando por Pricing
(menor blast radius, ROI más rápido).

**Estado:** ⚠️ Aprobado con observaciones — proceder con roadmap evolutivo.

## Hallazgos

### P1 — Bloqueantes

#### H1 — BD compartida entre los 4 squads

- **Componente:** `sales_db` (Postgres, 180 tablas).
- **Encontrado:** las 4 squads modifican schema de la misma BD; cada cambio requiere coordinación.
- **Impacto:** descomponer en microservicios sin partir la BD = distributed monolith.
- **Recomendación:** db-per-service como precondición. Identificar bounded contexts → repartir tablas → usar CDC o dual-write durante migración.
- **Justificación:** patrón db-per-service (`sofka-asdd-architect-patterns/reference/data-patterns.md`).
- **Owner:** DBA + Arquitecto.

#### H2 — Sin observability cross-servicio

- **Componente:** logs y métricas existentes solo cubren el monolito como un todo.
- **Encontrado:** correlation ID no se propaga; trazas distribuidas no existen.
- **Impacto:** una vez extraído el primer servicio, debugging cross-servicio será imposible.
- **Recomendación:** instrumentar OpenTelemetry en el monolito ahora; cada extracción mantiene la traza.
- **Justificación:** sin observabilidad distribuida, microservicios se vuelven black boxes.
- **Owner:** Platform team (o crear si no existe).

### P2 — Mejoras importantes

#### H3 — Tests E2E flakeans 18%

- **Encontrado:** flakiness alta en CI. Bloquea releases.
- **Recomendación:** estabilizar antes de extraer servicios. Sin tests fiables, paridad rota se detecta en producción.
- **Owner:** QA + Tech Lead.

#### H4 — 4 squads, sin platform team

- **Encontrado:** cada squad mantiene su CI/CD individual + observability + secrets.
- **Recomendación:** extraer infraestructura común a un platform team antes/durante la descomposición.
- **Justificación:** `team-topologies.md` — 4+ stream-aligned teams suelen beneficiarse de platform team.
- **Owner:** CTO.

### P3 — Mejoras menores

#### H5 — ADRs ausentes para decisiones arquitectónicas históricas

- **Encontrado:** no hay registro de por qué la BD es compartida ni de los integration patterns elegidos.
- **Recomendación:** retrospective ADRs para top 5 decisiones; no bloquea la descomposición pero ayuda al onboarding.

## Buenas prácticas detectadas

- ✅ Estructura modular interna del monolito (paquetes por dominio): facilita identificación de bounded contexts.
- ✅ Cobertura unit ~72%, sin código sin tests en módulos críticos.
- ✅ Ya hay práctica de feature toggles vía LaunchDarkly: factor positivo para strangler fig.

## ADRs y referencias

- ADRs por crear: ADR-030 (db-per-service), ADR-031 (estrategia strangler fig), ADR-032 (platform team).
- Bounded contexts identificados: Pricing, Catalog, Orders, Customers, Reporting.

## Próximos pasos

| # | Acción | Owner | Fecha |
|---|---|---|---|
| 1 | Mapping de tablas a bounded contexts | DBA + Arquitecto | 2026-05-15 |
| 2 | Instrumentación OpenTelemetry en monolito | Platform candidate | 2026-05-30 |
| 3 | Estabilización de tests E2E (target flakiness ≤ 3%) | QA | 2026-06-15 |
| 4 | ADRs 030-032 | Arquitecto | 2026-05-10 |
| 5 | Roadmap detallado | Arquitecto + CTO | 2026-05-20 |

## Roadmap (esquema)

Ver `sales-decomposition-roadmap.md`. Resumen:

- **Hito 1 (Q3 2026):** db-per-service para Pricing. Extraer Pricing como primer microservicio. Cutover gradual con feature toggles. Métrica: 100% tráfico de pricing en el nuevo, 0 regresiones.
- **Hito 2 (Q4 2026):** extraer Catalog. Reusar el playbook de Pricing.
- **Hito 3 (Q1-Q2 2027):** Orders. Es el más complejo (sagas con Pricing y Catalog).
- **Hito 4 (Q3 2027):** Customers + Reporting.
- **Hito 5 (Q4 2027):** apagar el monolito.

## Approvers

- [x] Arquitecto Sofka
- [x] Tech Lead Sales
- [x] CTO
- [ ] Lead Architect (review pending — H1 y H2 deben atenderse antes)
