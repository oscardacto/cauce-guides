# Integridad de Datos y Eventos

> Aplica a todo agente que implemente persistencia, publicación de eventos o integraciones.
> Principios agnósticos de framework — la implementación (outbox pattern, Flyway/Liquibase,
> ack de listeners) va en el pack del proyecto.

## DEI-001: Publicar eventos solo tras confirmar persistencia

Los domain events se publican **después** de confirmar que la persistencia fue exitosa,
nunca antes ni de forma concurrente.

**Prohibido:**
```
// MAL: evento publicado antes de confirmar persistencia
eventBus.publish(pedidoConfirmado)
repository.save(pedido)
```

**Correcto:**
```
repository.save(pedido)           // confirmar primero
eventBus.publish(pedidoConfirmado) // publicar después
```

Si el sistema requiere garantías at-least-once entre persistencia y publicación,
usar el **Outbox Pattern** (la implementación concreta va en el pack).

## DEI-002: Ack solo tras procesar con éxito

En consumers de mensajes (Kafka, RabbitMQ, SQS, etc.), el **ack/confirmación** se envía
solo después de que el procesamiento completó exitosamente.

El ack prematuro convierte fallos de procesamiento en **pérdida silenciosa de datos**.

```
// MAL: ack antes de procesar
message.ack()
procesarPedido(message.payload)  // si falla, el mensaje se pierde

// CORRECTO:
procesarPedido(message.payload)  // procesar primero
message.ack()                    // ack solo si exitoso
```

Si el procesamiento falla: no hacer ack (el broker reintentará) o mover a DLQ.

## DEI-003: Correlation-ID en toda respuesta de error

Toda respuesta de error (4xx, 5xx) debe incluir un `correlation_id` o `trace_id` que permita
correlacionar el error con los logs del servidor.

- Si el request entrante trae un `X-Correlation-ID` header → usarlo y propagarlo.
- Si no trae → generarlo en el boundary de entrada (controller/handler).
- **Nunca** usar placeholder como `"unknown"`, `"N/A"` o `""`.

```json
{
  "error": "VALIDATION_ERROR",
  "message": "El campo 'email' es requerido.",
  "correlation_id": "a3f7b91c-2d4e-4f8a-9b1c-3d5e7f9a1b3c"
}
```

El correlation-ID debe propagarse en todos los logs relacionados con el request.

## DEI-004: Migraciones de base de datos son inmutables

Una migración aplicada en cualquier ambiente **nunca se edita**. Si hay un error:
crear una nueva migración que lo corrija.

**Reglas:**
- Número de versión secuencial y único (Flyway/Liquibase o equivalente).
- **Separar DDL de DML**: migraciones estructurales (CREATE TABLE, ALTER) en un script; carga de datos (INSERT, UPDATE) en otro separado.
- Migraciones compatibles con rollback cuando sea posible (preferir `ALTER ADD COLUMN` sobre `ALTER MODIFY COLUMN`).
- Nunca ejecutar `DROP TABLE` o `DROP COLUMN` en una migración sin confirmación explícita del usuario y backup verificado.

## DEI-005: Idempotencia en operaciones críticas

Las operaciones que pueden reintentarse (publicación de eventos, procesamiento de mensajes,
llamadas a APIs externas con retry) deben ser idempotentes cuando sea técnicamente posible.

Estrategias:
- **Idempotency key**: incluir un ID único en el request/mensaje para que el receptor ignore duplicados.
- **Verificar antes de ejecutar**: comprobar si la operación ya fue aplicada antes de aplicarla.
- **Operaciones naturalmente idempotentes**: preferirlas (`PUT` sobre `POST`, `SET` sobre `INCREMENT`).
