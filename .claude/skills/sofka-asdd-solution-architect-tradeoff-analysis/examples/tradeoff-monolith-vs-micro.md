# Matriz de decisión — Monolito modular vs Microservicios para Onboarding

**Fecha:** 2026-03-01
**Autor:** Arquitecto + CTO + Tech Lead Onboarding
**Decisión a documentar en:** ADR-007

## Contexto

El nuevo flujo de Onboarding del wallet (KYC + alta de cuenta + verificación
de identidad) reemplazará el flujo legacy. La decisión es si se construye como
monolito modular dentro del backend existente o como suite de microservicios
nuevos. Equipo: 6 devs, ratio 2 Sr / 3 Mid / 1 Jr. Carga esperada: 10k
onboardings/día en año 1.

## Alternativas evaluadas

1. **Monolito modular:** módulo dentro del backend existente (Spring Boot), boundaries explícitos.
2. **Microservicios (3 servicios):** kyc-service, identity-verification-service, account-creation-service.
3. **Microservicios (5 servicios):** descartada en pre-screening por overhead operativo desproporcionado para 10k/día.

## Criterios y pesos

| Criterio | Peso | Justificación |
|---|---|---|
| Time to market | 25% | Hay deadline regulatorio en Q3 (12 sem disponibles). |
| Operability | 20% | Equipo de SRE con 3 personas; cada servicio nuevo agrega carga. |
| Escalabilidad independiente | 15% | KYC tiene picos; Identity Verification es estable. |
| Mantenibilidad / Conway | 15% | El equipo es uno solo — Conway favorece monolito. |
| Resiliencia (blast radius) | 15% | Onboarding crítico para revenue futuro. |
| Cost cloud | 10% | 3 servicios = 3 deployments + ALB + observability. |
| **Total** | **100%** | |

## Matriz de scoring

| Criterio | Peso | Monolito modular | Micro (3 svc) |
|---|---|---|---|
| TTM | 25% | 5 | 3 |
| Operability | 20% | 5 | 3 |
| Escalabilidad indep. | 15% | 2 | 5 |
| Mantenibilidad / Conway | 15% | 5 | 3 |
| Resiliencia | 15% | 3 | 4 |
| Cost cloud | 10% | 5 | 3 |
| **Score ponderado** | | **4.15** | **3.40** |

## Justificación de scores

### Monolito modular
- TTM = 5: reuso de auth, observability, deploy pipeline. ≤ 8 semanas factible.
- Operability = 5: 0 nuevos servicios para SRE. Mismo runbook.
- Escalabilidad indep. = 2: KYC picos suben la carga del backend entero.
- Conway = 5: 1 equipo → 1 unidad desplegable. Sin contention de PRs cross-team.
- Resiliencia = 3: bug en KYC puede afectar el resto del backend.
- Cost = 5: 0 infra incremental significativa.

### Microservicios (3)
- TTM = 3: ~12 semanas con armado de pipelines, observability, IaC nuevos. Justo en deadline.
- Operability = 3: +3 servicios para una squad que ya opera 8.
- Escalabilidad indep. = 5: KYC escala solo, no arrastra al resto.
- Conway = 3: 1 equipo manejando 3 repos genera overhead de coordinación.
- Resiliencia = 4: blast radius acotado.
- Cost = 3: ~USD 300/mes adicionales (ALB + APM + storage logs).

## Recomendación

**Ganadora:** Monolito modular con score 4.15.

**Margen:** 22% — decisión razonable. Sensitivity recomendado.

Razones de la elección:
1. TTM de 8 vs 12 semanas con deadline regulatorio en 12 sem deja margen de seguridad.
2. Equipo de 1 squad con 6 devs no justifica overhead operativo de microservicios.
3. Estrategia de salida clara: si KYC necesita escalar independientemente en año 2-3, los boundaries modulares facilitan extracción a servicio dedicado (strangler fig).

## Sensitivity analysis

| Atributo | Peso original | +10% afecta ranking |
|---|---|---|
| Escalabilidad indep. | 15% | Si sube a 25%, se acerca pero no invierte (Mono 3.95 vs Micro 3.65). |
| Resiliencia | 15% | +10% no invierte. |
| TTM | 25% | -10% no invierte. |

Conclusión: decisión robusta. Si escalabilidad independiente se vuelve crítica (>25%), reconsiderar.

## Riesgos identificados

Ver `onboarding-monolito-risks.md`. Resumen:
- R-001: si KYC supera 30k/día (3× forecast), el monolito se queda corto. Mitigación: extraer a servicio en plan año 2.
- R-002: boundaries modulares pueden degradarse — mitigación: ArchUnit fitness function.

## Approvers

- [x] CTO
- [x] Arquitecto
- [x] Tech Lead Onboarding
