# Evidencia — D-001

**Tipo:** execution — **Veredicto:** fail
**Capturado:** 2026-05-21T11:25:00-05:00 por sofka-asdd-atf-api-step-6-execution

## Resumen ejecutivo

Al ejecutar CP-001 (creación de solicitud de facturación para el ciclo 2026-05), el servicio respondió `500 INTERNAL_SERVER_ERROR` en lugar del `201` documentado. El response apunta a un `NullPointerException` en `PendingBillingService.computeTotal`.

## Request

- **Método/URL:** `POST /osf/api/v1/pending-billing-quotas`
- **Auth:** Bearer (redactado)
- **Headers críticos:** `Content-Type: application/json`, `X-Request-Id: req-2026-05-21-001`
- **Body:** ver `request.json`

## Response

- **Status:** `500` (esperado: `201`)
- **TTFB:** 122 ms — **Total:** 134 ms
- **Schema match:** No (ver `contract-diff.json`)
- **Body:** ver `response.json`

## Validación contra contrato

| Path | Esperado | Actual |
|---|---|---|
| `$.status` | `201` | `500` |
| `$.body` | `BillingRequestCreated` | `ErrorResponse` |

## Regla violada

- **RN-008:** Toda solicitud válida para ciclo válido debe crear el registro en estado `PENDING` y responder con el `requestId` generado.
- **Comportamiento esperado:** `201 Created` con body `{requestId, status: "PENDING", createdAt}`.
- **Comportamiento observado:** `500` con NullPointerException en el servicio interno.

## Acción sugerida

- **Categoría preliminar:** `bug`
- **Justificación:** El servicio responde fuera del contrato con un error interno (NPE). No es problema de data (el body cumple el contract), ni de entorno (status 500 es respuesta del servicio).

---
*Evidencia preservada en `docs/output/PruebaAPIClienteEjemplo-v1.0-20260521-1030/execution/evidence/D-001/`. Redactados: 1 secreto (Authorization header).*
