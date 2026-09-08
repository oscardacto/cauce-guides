# QA Sign-off — Checkout de 1 clic

> **Ejemplo de referencia ASDD**. Feature ficticio. Cierra la trazabilidad
> brief → spec → ADR → sign-off.

| Campo | Valor |
|---|---|
| **Feature** | Checkout de 1 clic |
| **Versión** | 1.0.0 |
| **Release candidate** | `rc-2026-04-23-1` (commit `a1b2c3d`) |
| **Fecha del sign-off** | 2026-04-23 |
| **QA Lead** | qa-engineer |
| **Veredicto** | **PASS** |

## Resumen ejecutivo

El feature **cumple** todos los AC del spec v1.0, tiene cobertura dentro de
umbrales, y no introduce regresiones en suites existentes. Se aprueba el
release candidate para deploy progresivo a producción siguiendo el plan del
`platform-engineer` (canary 5% → 25% → 100% con gates de 2h cada paso).

## Cobertura por capa

| Capa | Cobertura | Umbral proyecto | Status |
|---|---:|---:|:---:|
| Unit tests | 87.4% | ≥ 80% | PASS |
| Integration tests | 78.1% | ≥ 70% | PASS |
| E2E (Playwright) | 12 flujos críticos | ≥ 10 | PASS |
| Contract tests | 100% endpoints nuevos | 100% | PASS |
| Mutation tests | 73% (Stryker) | ≥ 65% | PASS |

## Casos críticos probados

| Caso | HU / AC | Resultado |
|---|---|:---:|
| Activación opt-in con confirmación modal | HU-001 / AC1-AC3 | PASS |
| Desactivación automática por contracargo nuevo | HU-001 / AC4 | PASS |
| Compra feliz de 1 clic con countdown | HU-002 / AC5-AC9 | PASS |
| Cancel en ventana de 60s | HU-002 / AC8 | PASS |
| Latencia p50 clic → confirmación (excl. countdown) | HU-002 / AC9 | PASS (4.8s) |
| Latencia p99 clic → confirmación (excl. countdown) | HU-002 / AC9 | PASS (9.4s) |
| Fallback a checkout clásico | HU-003 / AC10-AC11 | PASS |
| Doble-clic accidental → 1 transacción (idempotencia) | CU-A1 + ADR-001 | PASS |
| Token expirado → fallback silencioso | CU-A2 | PASS |
| Inventario agotado entre clic y procesamiento | CU-A3 | PASS |
| Antifraude rechaza → mensaje genérico | CU-A4 | PASS |
| Pérdida de elegibilidad durante countdown → completa + desactiva | CU-A5 | PASS |
| Accesibilidad: overlay navegable con teclado y anunciado | edge case | PASS |

## Regresiones

Suite completa del checkout clásico ejecutada sobre el RC. **Sin
regresiones detectadas** en los 94 casos E2E existentes.

## Riesgos residuales (aceptados)

| Riesgo | Probabilidad | Impacto | Aceptación |
|---|---|---|---|
| Q1 del spec (precio variable entre clic y procesamiento) no resuelto — hoy se usa snapshot al clic | Baja | Bajo (diferencia de centavos) | Product + finance aceptan snapshot para MVP; ticket FIN-4567 para refinamiento |
| Carga de 500 RPS en peak hour no probada (escala actual 300 RPS) | Baja | Medio | Plan de capacidad con `platform-engineer` para 2027-Q1 |
| Gift cards excluidas temporalmente (Q2 del spec) | N/A | N/A | Excluido explícitamente del release inicial |

## Seguridad — Referencia cruzada

Sign-off de `security` en `docs/security/review-checkout-1-click.md`:
veredicto **APROBADO**. Sin vulnerabilidades Critical ni High. 2 findings
Medium (sobre logging de `idempotency_key` en debug) remediados en commit
`b2c3d4e`.

## Quality gate del tech-lead

Reporte en `docs/tech/quality-gate-checkout-1-click.md`: veredicto **PASS**.
Métricas: complejidad ciclomática promedio 4.2 (umbral < 10), duplicación
1.8% (umbral < 3%), linter 0 warnings/0 errors.

## Dashboard de release

Link al dashboard Grafana con paneles de seguimiento durante el canary:
`grafana.example.internal/d/checkout-1-click`.

## Checklist de sign-off

- [x] Todos los AC del spec v1.0 cubiertos por tests.
- [x] Cobertura sobre umbrales por capa.
- [x] Casos críticos y edge cases probados con resultado.
- [x] Suites de regresión pasan sin fallas nuevas.
- [x] Security PASS documentado.
- [x] Quality gate del tech-lead PASS documentado.
- [x] Riesgos residuales explicitados con owner.
- [x] Plan de canary definido por `platform-engineer`.
- [x] Veredicto: **PASS**.

## Siguiente paso

Ejecutar `/asdd:document` para consolidar la documentación final del
ciclo: actualización del ADR index, contratos API en estado final, guías
de uso y changelog técnico.
