# Matriz de decisión — Postgres vs MongoDB para Wallet Service

**Fecha:** 2026-02-10
**Autor:** Arquitecto Wallet + DBA + Tech Lead
**Decisión a documentar en:** ADR-001

## Contexto

El servicio Wallet manejará 5M cuentas y ~80M transacciones/año, con
requerimiento de movimientos ACID y latencia P95 ≤ 80ms en consultas de saldo.
Hay que elegir motor de BD entre Postgres (que el equipo opera) y MongoDB
(propuesto por un proveedor consultor).

## Alternativas evaluadas

1. **Postgres 16 (Cloud SQL):** relacional managed, equipo con experiencia 4 años.
2. **MongoDB 7 (Atlas):** document store, sin experiencia operativa interna.
3. **Cassandra (Astra):** wide-column, descartada en pre-screening por overkill.

## Criterios y pesos

| Criterio | Peso | Justificación del peso |
|---|---|---|
| ACID / consistency | 30% | Movimientos contables exigen atomicidad; pérdida = riesgo regulatorio. |
| Latencia P95 | 20% | Driver del SLA al cliente final. |
| Operability del equipo | 20% | Equipo opera prod 24/7 — la curva de aprendizaje es riesgo material. |
| Cost (USD/mes a 5M cuentas) | 15% | Cap operativo es USD 1.5k/mes por motor. |
| Conciliación con core (joins) | 15% | Reportes diarios de conciliación — joins multi-tabla esperados. |
| **Total** | **100%** | |

## Matriz de scoring

| Criterio | Peso | Postgres | MongoDB |
|---|---|---|---|
| ACID / consistency | 30% | 5 | 3 |
| Latencia P95 | 20% | 4 | 4 |
| Operability del equipo | 20% | 5 | 2 |
| Cost (USD/mes) | 15% | 5 | 4 |
| Conciliación con core (joins) | 15% | 5 | 2 |
| **Score ponderado** | | **4.75** | **3.05** |

## Justificación de scores

### Postgres
- ACID = 5: transacciones multi-tabla nativas, MVCC, isolation level configurable.
- Latencia = 4: índices bien usados dan P95 ≤ 50ms en pruebas con datos sintéticos.
- Operability = 5: equipo lleva 4 años operando, runbooks listos.
- Cost = 5: Cloud SQL db-custom-4-16GB con HA cuesta ~USD 600/mes a la carga del año 1.
- Conciliación = 5: SQL estándar con joins; reportes ya escritos.

### MongoDB
- ACID = 3: transacciones multi-documento existen pero overhead 3-4× vs SQL.
- Latencia = 4: similar con índices bien diseñados.
- Operability = 2: cero experiencia en sharding, replica set, BI Connector. Riesgo P1 en producción.
- Cost = 4: Atlas M30 cluster cuesta ~USD 900/mes con métricas similares.
- Conciliación = 2: joins via aggregation pipeline son costosos y poco familiares al equipo de reportes.

## Recomendación

**Ganadora:** Postgres con score 4.75.

**Margen sobre MongoDB:** 36% — decisión robusta.

Postgres cumple los drivers críticos (ACID, operability) sin trade-offs
materiales. MongoDB tendría sentido si el modelo fuera más flexible/event-sourced,
pero el dominio de cuentas y movimientos es naturalmente relacional.

## Sensitivity analysis

Por margen de 36%, no es necesario. Se hizo igualmente como sanity check:

| Atributo | Peso original | ±10% |
|---|---|---|
| Operability | 20% | Postgres sigue ganando |
| ACID | 30% | Postgres sigue ganando |

Conclusión: decisión robusta a cualquier reasignación razonable de pesos.

## Riesgos identificados

Ver `wallet-bd-risks.md`. Resumen:
- R-001: Postgres techo vertical en ~3-4× la carga del año 1 → sharding/Citus en backlog.
- R-002: Cloud SQL multi-region async tiene RPO ~5s — aceptable para nuestro RTO/RPO.

## Approvers

- [x] Arquitecto Wallet
- [x] DBA
- [x] Tech Lead
- [x] Lead Architect
