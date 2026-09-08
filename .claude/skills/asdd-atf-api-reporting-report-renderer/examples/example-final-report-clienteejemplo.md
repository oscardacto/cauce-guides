# ATF API — Reporte Final de Corrida

**Run ID:** PruebaAPIClienteEjemplo-v1.0-20260521-1030
**API:** Prueba API ClienteEjemplo v1.0
**Entorno:** qa
**Tipo de ciclo:** baseline
**Fecha:** 2026-05-21

---

## Veredicto

🔴 **FAIL**

El pass rate de alta prioridad (77.8%) está por debajo del threshold de 80%, y hay 4 bugs `high` pendientes de promoción al backlog. La corrida no puede declararse PASS hasta resolver ambos puntos.

---

## Cifras clave

| Métrica | Valor |
|---|---|
| Casos de prueba ejecutados | 27 |
| Pass rate global | 70.4% |
| Pass rate críticos | 100% (0 CPs críticos) |
| Pass rate alta prioridad | 77.8% (14 de 18) |
| Flaky rate | 7.4% (2 de 27) |
| Defectos `bug` clasificados | 4 |
| Defectos promovidos al backlog | 0 (pendiente, backlog-sync) |
| Duración total de la suite | 9 min |

---

## Distribución de defectos

| Categoría | Cantidad | Severidad alta |
|---|---|---|
| bug | 4 | 4 |
| precondition | 0 | 0 |
| env_issue | 1 | 0 |
| script_issue | 1 | 0 |
| flaky (alerta) | 2 | — |

---

## Defectos críticos (top 5)

| ID | WI | Título | Severidad | Backlog |
|---|---|---|---|---|
| D-001 | wi-001 | POST devuelve 500 cuando falta cycle (esperado 400) | high | pendiente |
| D-002 | wi-001 | RN-010 no validada: fecha futura aceptada | high | pendiente |
| D-003 | wi-002 | Trigger manual no procesa PENDING con scheduler corrido | high | pendiente |
| D-004 | wi-002 | Transición END → PENDING permitida (debería ser inválida) | high | pendiente |
| D-005 | wi-002 | Timeout intermitente en GET batch | medium (env_issue) | n/a |

---

## QGS — métricas bloqueantes

| Métrica | Observado | Threshold | Acción sugerida |
|---|---|---|---|
| pass_rate_high | 77.8% | ≥ 80% | Resolver D-001 a D-004 (todos bugs high) |
| bugs_high_not_promoted | 4 | = 0 | Ejecutar backlog-sync para promover los 4 bugs |

---

## Preguntas abiertas (al cierre)

| Q-ID | WI | Pregunta | Estado |
|---|---|---|---|
| Q-001 | Global | URL base correcta del servicio | Resuelta antes de Step 2 |
| Q-002 | wi-001, wi-002 | Combinación de campos para unicidad | Resuelta antes de Step 3 |
| Q-003 | wi-001, wi-002 | Esquemas de BD no disponibles | Sin resolver — afectó validación de post_conditions |
| Q-004 | wi-002 | Comportamiento con múltiples PENDING en mismo ciclo | Sin resolver — D-003 podría relacionarse |
| Q-005 | wi-003 | Mecanismo asíncrono para actualización de seguro deudor | Sin resolver — no bloqueó esta corrida |

---

## Próximos pasos sugeridos

1. **Desarrollo ClienteEjemplo:** revisar D-001 a D-004 (4 bugs high del wi-001 y wi-002).
2. **Equipo QA:** ejecutar `backlog-sync` para crear los 4 items en Jira/ADO.
3. **Equipo de Producto:** resolver Q-003 (esquemas BD) y Q-004 (concurrencia de PENDING) para próxima corrida.
4. **DevOps:** investigar D-005 (env_issue de timeouts intermitentes en QA).
5. **Re-correr regression** una vez confirmados los fixes — se espera pass_rate_high ≥ 95% en regression.

---

*Reporte generado por ATF API v3 — 2026-05-21T11:50:00-05:00*
*Artefactos completos en: `docs/output/PruebaAPIClienteEjemplo-v1.0-20260521-1030/`*
