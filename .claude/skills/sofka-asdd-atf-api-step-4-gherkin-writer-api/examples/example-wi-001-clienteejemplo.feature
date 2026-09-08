# language: es
# encoding: utf-8

@wi-001 @critical-flow
Feature: Solicitud de ejecución de facturación

  Como sistema que gestiona el ciclo de facturación de ClienteEjemplo
  Quiero registrar y actualizar solicitudes de facturación
  Para que el batch posterior procese las cuotas pendientes

  Background:
    Dado el servicio API está disponible
    Y existe un distributorId "DIST-TEST-001" en el catálogo

  @happy-path @critical-flow @CP-001
  Scenario: Crear solicitud válida con fecha actual
    Dado no existe solicitud previa con la misma llave de unicidad
    Cuando el cliente envía POST "/osf/api/v1/pending-billing-quotas" con cycle="2026-05", distributorId="DIST-TEST-001", billingPeriod="2026-05" y periodProcessDate=hoy
    Entonces el servicio responde 201
    Y el body contiene un requestId con formato UUID
    Y el body contiene status "PENDING"
    Y el body cumple el schema "BillingRequestCreated"

  @boundary @regression @CP-002 @CP-003
  Scenario Outline: Validación de límite en periodProcessDate
    Cuando el cliente envía POST con periodProcessDate = <fecha>
    Entonces el servicio responde <status>
    Y el body contiene <error>

    Examples:
      | fecha   | status | error                |
      | mañana  | 400    | INVALID_CYCLE_DATE   |
      | hoy     | 201    | n/a                  |
      | ayer    | 201    | n/a                  |

  @error-path @regression @CP-004
  Scenario: Rechazar solicitud sin campo cycle
    Cuando el cliente envía POST sin el campo "cycle"
    Entonces el servicio responde 400
    Y el body contiene error "MISSING_REQUIRED_FIELD"
    Y no se crea registro en t_billing_request

  @contract @smoke @CP-005
  Scenario: Response 201 cumple el schema BillingRequestCreated
    Cuando el cliente envía POST con datos válidos
    Entonces el servicio responde 201
    Y el body cumple el schema "BillingRequestCreated" estrictamente
    Y el campo "requestId" es un UUID válido
    Y el campo "createdAt" cumple el formato ISO 8601
