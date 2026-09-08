# Ficha de Contexto — Banca Móvil ACME

**Fecha:** 2026-02-20
**Autor:** Arquitecto Sofka + Lead Architect ACME
**Próxima revisión:** 2026-08-20

## 1. Sistema y propósito

- **Nombre:** App Móvil ACME (iOS + Android)
- **Propósito:** Canal autoservicio de clientes retail para consulta de saldos, transferencias, pago de servicios públicos, PSE.
- **Fase:** Producción estable, escalando (3.2M MAU, +18% YoY).
- **Métrica principal:** transacciones exitosas/mes y NPS (target 55+).
- **Impacto caída 1h:** ~USD 80k en revenue + multa regulatoria por incumplimiento de SLA al SuperFinanciero (Colombia).

## 2. Stack actual

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Backend | Java + Spring Boot | 17 | Migrando de 11 |
| Frontend Web | Angular | 17 | (Para canal web, no app) |
| Mobile | React Native | 0.74 | Compartido iOS/Android |
| BD principal | Oracle | 19c | Core bancario, no se toca |
| BD producto | PostgreSQL | 14 | Cuentas digitales |
| Cache | Redis | 7 | Cluster managed |
| Mensajería | Kafka | 3.5 | On-prem |
| Cloud | AWS | — | Bogotá local zone + us-east-1 DR |
| CI/CD | GitLab CI + ArgoCD | — | 8 deploys/sem promedio |
| Observability | Datadog (logs+APM) + Grafana | — | OK |

## 3. Arquitectura

- **Estilo:** Híbrido — Core Bancario (monolito legacy) + capa de microservicios sobre EKS para canales digitales.
- **Diagrama vigente:** `arch/2025-q4-c4.excalidraw` — desactualizado en 2 servicios.
- **Bounded contexts identificados:** Cuentas, Transferencias, Pagos PSE, Notificaciones, Onboarding. Pending: Inversiones.

## 4. Equipo

| Rol | Cantidad | Mix |
|---|---|---|
| Backend devs | 14 | 5 Sr / 7 Mid / 2 Jr |
| Mobile devs | 6 | 2 Sr / 3 Mid / 1 Jr |
| QA | 4 | 2 Sr / 2 Mid |
| SRE | 3 | 2 Sr / 1 Mid |
| DBA | 1 | Sr (compartido con corporate) |
| Security | 2 | Sr (CISO area, no en squad) |
| Architect | 1 | Sr (Lead Architect) |

- **Organización:** 4 squads por dominio (cuentas, transferencias, pagos, onboarding).
- **On-call:** rotación semanal entre 6 SRE+devs senior.
- **Incidentes 3m:** 14 (3 sev1, 11 sev2). 60% de root cause en integraciones con Core.

## 5. Restricciones

| # | Restricción | Tipo | Dureza | Origen | Vigencia |
|---|---|---|---|---|---|
| 1 | Circular 052 SuperFinanciero (ciberseguridad) | Regulatoria | Dura | SuperFin Colombia | permanente |
| 2 | PCI-DSS para módulo de tarjetas | Regulatoria | Dura | PCI Council | permanente |
| 3 | SLA 99.9% mensual | Contractual | Dura | comité de riesgos interno | revisado anual |
| 4 | Solo AWS para cargas digitales | Técnica | Dura | acuerdo corporativo | hasta 2027 |
| 5 | Cloud spend ≤ USD 35k/mes | Presupuesto | Blanda | CFO | trimestral |
| 6 | Core Bancario intocable | Técnica | Dura | proveedor + estabilidad histórica | permanente |

Compliance: Circular 052, PCI-DSS, Habeas Data Colombia (Ley 1581).

## 6. Stakeholders

Ver `acme-stakeholders.md`. Sponsor: VP Tecnología Digital. Veto silencioso: CISO corporativo (no participa pero firma).

## 7. Deuda técnica

- 2 microservicios aún en Java 11 (deadline interno: Q4 2026).
- Diagramas C4 desactualizados — fricción en onboarding.
- Tests E2E flakeans 12% — bloquea CI cada 2-3 días.
- Cobertura unit ~58% — sin política mínima.
- Logs no se hacen scrubbing — riesgo Habeas Data identificado en último audit interno.

## 8. Migraciones en curso

| Migración | Estado |
|---|---|
| Java 11 → 17 | 80% (2 servicios pendientes) |
| EC2 → EKS | 95% |
| Oracle → Postgres para producto digital | 100% — completada Q1 2026 |

## 9. Gaps del discovery

- Plan de DR de Datadog si AWS Bogotá cae — no documentado.
- Estrategia de upgrade de Kafka 3.5 → 3.7 — sin owner.
- Política formal de retención de logs (Habeas Data) — pending.

## 10. Próximos pasos

- [ ] Validar ficha con Lead Architect ACME (semana del 24/02).
- [ ] Reunión con CISO corporativo (sponsor: VP Tec Digital).
- [ ] Discovery profundo del módulo Inversiones (próximo Q3).
