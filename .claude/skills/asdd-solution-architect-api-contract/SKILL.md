---
name: asdd-solution-architect-api-contract
description: Define contratos entre componentes — REST con OpenAPI 3.1, eventos con AsyncAPI o interfaces internas.
---

## Rol

Definidor de contratos. Especifica la interfaz de comunicación entre componentes de forma precisa y verificable.

## Cuándo activar

- Se diseña una nueva API REST, endpoint o recurso
- Se definen eventos o mensajes entre servicios (event-driven)
- Se necesita documentar la interfaz de un módulo o librería interna
- Fase: **Diseñar**

## Tipos de contrato

| Tipo | Formato | Cuándo |
|---|---|---|
| REST API | OpenAPI 3.1 (YAML) | Servicios HTTP sincrónicos |
| Eventos / Mensajes | AsyncAPI 2.x | Comunicación asíncrona, colas, topics |
| Interfaz interna | Types / Interfaces del lenguaje | Contratos entre módulos del mismo servicio |

## Estructura mínima REST

```yaml
openapi: 3.1.0
info:
  title: {Service Name}
  version: 1.0.0
paths:
  /{resource}:
    post:
      operationId: createResource
      summary: ...
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/{Schema}'
      responses:
        '201': { description: Created }
        '400': { $ref: '#/components/responses/BadRequest' }
        '422': { $ref: '#/components/responses/Unprocessable' }
components:
  schemas:
    {Schema}:
      type: object
      required: [...]
      properties: ...
```

## Convenciones REST del COE

Aplicar SIEMPRE al diseñar contratos OpenAPI Guide:

1. **Versionado en URL** (`/v1/`) — fácil de proxyar y cachear.
2. **Plural en recursos** (`/orders` no `/order`).
3. **`operationId` obligatorio** — generadores de cliente lo necesitan.
4. **`description` en cada path y schema** — los clientes lo leen.
5. **Errores 4xx con `application/problem+json`** (RFC 9457) — `type`, `title`, `status`, `detail`, `instance`.
6. **No mezclar paginación de tipos** — elegir cursor o offset, no ambos.
7. **`Idempotency-Key` header** en POST que crean recursos no idempotentes.

## Convenciones AsyncAPI del COE

Aplicar SIEMPRE al diseñar contratos de eventos Guide:

1. **Naming `{dominio}.{evento-en-pasado}.v{N}`** (ej: `orders.created.v1`).
2. **Versionado en el nombre del topic** — incrementos breaking → nuevo topic, deprecación gradual.
3. **Headers obligatorios:** `eventId`, `eventType`, `occurredAt`, `traceId`. Schema explícito.
4. **Payload separado del envelope** — facilita evolución del envelope sin tocar payload.
5. **Eventos en pasado** (`OrderCreated`, no `CreateOrder` que es comando).
6. **Idempotency:** consumer debe ser idempotente — `eventId` como dedup key.
7. **Schema registry:** payloads registrados en Confluent Schema Registry / Apicurio si Kafka.

## Inputs

- Bounded contexts y componentes involucrados
- Requisitos funcionales del PO / Analista Funcional
- Restricciones de seguridad del agente Security

## Outputs

- `docs/architecture/{service}-api.yaml` — contrato OpenAPI o AsyncAPI

## Cuándo cargar referencias detalladas

| Situación | Cargar |
|---|---|
| API REST sincrónica (HTTP) | `templates/openapi-rest.yaml` |
| Eventos / mensajería asíncrona | `templates/asyncapi-events.yaml` |
| Ejemplo REST en producción | `examples/checkout-api.yaml` |
| Ejemplo eventos en producción | `examples/order-events.asyncapi.yaml` |

## Cuándo NO invocar

- El bounded context que expone la API no está definido — definir primero con `architect-bounded-context`; diseñar el contrato antes implica inventar un modelo que puede no reflejar el dominio.
- La API ya existe en producción y solo se necesita consultar su comportamiento actual — usar `asdd-explorer` para leer el contrato existente sin modificarlo.
- El cambio requerido es un fix puntual de un campo o código de error en un contrato ya aprobado — escalar al `tech-lead` como cambio de bajo riesgo, no re-invocar este skill completo.

## Anti-patterns

- **Contrato antes del dominio** — definir endpoints y schemas antes de tener el bounded context modelado. El contrato refleja el lenguaje ubicuo del dominio; si el dominio cambia después, el contrato queda obsoleto desde el primer commit.
- **Respuestas sin códigos de error** — documentar solo el caso exitoso (200/201) y omitir 400, 422, 404, 409 y 503. Los consumidores no saben cómo manejar errores y terminan implementando catch-all genéricos que ocultan problemas en producción.
- **Tipos genéricos en schemas** — usar `type: object` o `additionalProperties: true` sin propiedades definidas. Los generadores de cliente producen `any` o `Map<String, Object>`, perdiendo toda la seguridad de tipos y la documentación inline que los developers consultan.
