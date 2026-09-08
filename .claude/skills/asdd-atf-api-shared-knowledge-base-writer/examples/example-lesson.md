---
lesson_id: "lesson-001"
title: "POST /pending-billing-quotas devuelve 200 con body de error en algunos paths"
recorded_in_run: "PruebaAPIClienteEjemplo-v1.0-20260427-0900"
recorded_at: "2026-04-27T15:30:00-05:00"
tags: ["error-handling", "POST-osf-api-pending-billing-quotas", "contract-violation"]
applies_to:
  - "Step 4: diseño de assertions"
  - "Step 6: clasificación de fallos"
---

# Lesson-001 — POST /pending-billing-quotas devuelve 200 con body de error en algunos paths

## Contexto

Durante la primera corrida baseline contra el microservicio de cuotas pendientes (ClienteEjemplo), 3 casos de prueba diseñados para validar errores de negocio fallaron en Step 6 con clasificación inicial `script_issue` — los specs esperaban códigos `4xx` para errores, pero el servicio respondía `200 OK` con un body conteniendo `{"error": "INVALID_CYCLE_DATE"}`.

## Lección

El servicio no respeta la convención HTTP estándar para errores de negocio: responde **siempre `200`** en escenarios donde el body indica error funcional. Asumir que `status >= 400` implica error es incorrecto contra esta API en particular.

Antes de declarar PASS/FAIL en un assertion, validar **ambos** el status code y la presencia del campo `body.error`. Si `body.error` está presente, tratar como FAIL aunque el status sea 200.

## Prevención

- **Skill afectado:** `asdd-atf-api-step-4-test-case-designer` debe generar assertions duales (status + `body.error`) cuando el contrato del endpoint lo indique o cuando esta lección esté indexada.
- **CP a agregar:** ningún CP nuevo — basta con corregir los assertions existentes.
- **Convención del framework:** documentar en `.claude/rules/asdd-atf-api-qa-engineer.md (embedded: ATF API Defect Classification)` que un `script_issue` recurrente por este patrón debe re-evaluarse como `bug` del servicio (no respeta convenciones HTTP). De hecho, el equipo de ClienteEjemplo confirmó que es comportamiento conocido del legacy — clasificación actual: `bug-by-design`.

## Evidencia / Referencia

- Defecto que originó la lección: D-014 en run `PruebaAPIClienteEjemplo-v1.0-20260427-0900`
- Path de evidencia: `docs/output/PruebaAPIClienteEjemplo-v1.0-20260427-0900/execution/evidence/D-014/`
- RN relacionada: RN-010 (cycle.periodProcessDate debe ser fecha actual o pasada)
