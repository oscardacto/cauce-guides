# Architecture Review — Checklist

**Sistema / PR / Diseño:** {…}
**Reviewer:** {arquitecto}
**Fecha:** {YYYY-MM-DD}

Marcar cada item: ✅ cumple / ❌ no cumple / ⚠️ parcial / N/A.

## 1. Alineación con ADRs vigentes

- [ ] El cambio respeta los ADRs aceptados.
- [ ] Si contradice un ADR, hay un ADR nuevo (o draft) que lo supersede.
- [ ] Las decisiones nuevas significativas tienen ADR asociado.

## 2. Bounded contexts y boundaries

- [ ] El cambio respeta los bounded contexts existentes.
- [ ] No introduce dependencias cíclicas entre contexts.
- [ ] Si introduce un nuevo context, está documentado (canvas).
- [ ] Las relaciones entre contexts (ACL, OHS, conformist) están explicitadas.

## 3. NFRs / Quality attributes

- [ ] Performance — los cambios no degradan SLOs (P95/P99 en endpoints críticos).
- [ ] Reliability — no introduce SPOFs nuevos; respeta RTO/RPO.
- [ ] Security — controla auth/authz, no expone datos sensibles, sin vulns conocidas.
- [ ] Maintainability — boundaries respetados, sin god-classes, complejidad controlada.
- [ ] Observability — cambios cubiertos por logs/métricas/trazas con correlation ID.

## 4. Datos

- [ ] Cambios de schema usan expand-contract o feature toggles.
- [ ] Migraciones tienen rollback plan.
- [ ] Backups y retention respetan compliance vigente.
- [ ] PII / datos sensibles cifrados at-rest, masked en logs.
- [ ] Idempotency garantizada en operations relevantes.

## 5. Integración

- [ ] Contratos (OpenAPI/AsyncAPI) versionados y publicados.
- [ ] DLQ + retries en mensajería async.
- [ ] Circuit breaker en llamadas a sistemas externos críticos.
- [ ] Timeouts explícitos (no defaults infinitos).
- [ ] Schemas con backwards compatibility o ruta de deprecación clara.

## 6. Seguridad

- [ ] Authentication respetada (OAuth/OIDC, mTLS donde aplica).
- [ ] Authorization granular por endpoint y/o por recurso.
- [ ] Inputs validados (no SQLi, no XSS, no injection).
- [ ] Secrets en vault, no en código/env vars expuestas.
- [ ] Audit log para acciones sensibles.

## 7. Operabilidad

- [ ] Logs estructurados con correlation ID + tenant_id si multi-tenant.
- [ ] Métricas custom donde el dominio lo justifica.
- [ ] Alertas configuradas en SLOs y burn rates.
- [ ] Runbook actualizado si el cambio agrega fallos nuevos.
- [ ] Health endpoint funcional (`/health`, `/ready`).

## 8. Tests

- [ ] Unit tests cubriendo lógica nueva (cobertura ≥ política del proyecto).
- [ ] Integration / contract tests con sistemas externos.
- [ ] Tests de fitness functions (ArchUnit, dependency-cruiser) pasan.
- [ ] Carga / performance tests para endpoints críticos.
- [ ] Tests E2E para user journeys críticos.

## 9. Documentación

- [ ] Diagrama C4 (al menos L2) actualizado si la topología cambió.
- [ ] README del módulo/servicio actualizado.
- [ ] ADR(s) creado(s) o actualizado(s).
- [ ] Sequence diagram para flujos no triviales.
- [ ] Compliance documentation (si aplica) actualizada.

## 10. Equipo / Conway

- [ ] El equipo dueño puede mantener este cambio (cognitive load OK).
- [ ] Dependencies cross-team explicitadas y aceptadas por todos los teams involucrados.
- [ ] Bus factor del cambio > 1 (al menos 2 personas conocen).

## 11. Rollback / contingencia

- [ ] Plan de rollback documentado.
- [ ] Feature toggles donde aplica.
- [ ] Capacidad de cutover atómico (blue-green / canary) o justificación.

## 12. Cost / FinOps

- [ ] Estimación de impacto en cloud spend.
- [ ] Si supera el budget, hay aprobación.
- [ ] Recursos sub-utilizados / sobre-provisionados detectados.

## Resultado

- ✅ Items cumplidos: {n} / {total}
- ❌ Items no cumplidos: {lista}
- ⚠️ Items parciales: {lista}

Pasa a `templates/review-report.md` para el reporte detallado.
