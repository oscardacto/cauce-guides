# ADR-001: Adoptar el patrón Cache-Aside para desacoplar lecturas críticas del Core System

> Ejemplo canónico del estándar Guide DA_ADE34 — Drivers de Arquitectura.
> Tomado del documento fuente, ADR-001 ilustrativo. Sirve como referencia
> de tono, profundidad y trazabilidad esperados.

| Ítem | Contenido |
|---|---|
| **Id** | ADR-001 |
| **Título** | Adoptar el patrón Cache-Aside para desacoplar lecturas críticas del Core System |
| **Estado** | Aceptada |
| **Fecha** | 2025-11-15 |

## Contexto y Problema

El Core System AS-IS solo permite 100 conexiones concurrentes, violando el
QA de **Escalabilidad (5x)** y **Disponibilidad (99.99%)**. Este cuello de
botella impide el crecimiento del portal y bloquea la entrada de nuevos
canales (web, mobile, agentes externos) que requieren consultar la misma
información de póliza.

El Architecture Concern central es: cómo absorber 5x más tráfico de lectura
sin tocar el Core System Legacy (restricción dura) ni degradar la
Disponibilidad del portal.

## Factores Impulsores

- **Prioridad Máxima:** Disponibilidad (QA, 99.99%) y Rendimiento (QA, latencia P95 ≤ 200ms en consulta de póliza).
- **Restricción:** No modificar el Core System ni aumentar licencias.
- **Restricción operativa:** El equipo de Run debe poder operar la solución con su stack actual (no introducir tecnologías propietarias adicionales).

## Opciones Consideradas

- **Implementar Patrón Event Sourcing:** Muy complejo, requiere reescribir la lógica de movimientos de póliza. Tiempo de implementación supera el plazo de la iniciativa.
- **Implementar Patrón Cache-Aside (Elegida):** Desacopla las lecturas críticas mediante una capa de cache distribuida. No requiere cambios en el Core.
- **Aumentar el límite de concurrencia del Core:** No viable, riesgo legacy. El proveedor del Core no garantiza estabilidad por encima de 100 conexiones.
- **No hacer nada:** Inviable. El portal no puede absorber el crecimiento proyectado y la SLA del 99.99% queda en riesgo desde el primer pico de tráfico.

## Resultado de la Decisión

Se implementará el patrón **Cache-Aside** utilizando un **Redis Cluster**
porque es la única opción viable que garantiza la **Disponibilidad
(99.99%)** y la **Escalabilidad (5x)** sin requerir modificaciones en el
Core System Legacy. La capa de cache se ubicará entre el portal y el Core,
operando como buffer de lecturas frecuentes (consulta de póliza, datos de
agente, catálogo de productos).

## Consecuencias

- **Bueno:** Se garantiza la Disponibilidad y el Rendimiento bajo carga de pico (5x).
- **Bueno:** Se desacopla el portal del Core Legacy, habilitando futuras migraciones del backend sin tocar el frontend.
- **Bueno:** Reduce la presión sobre las 100 conexiones concurrentes del Core, liberando capacidad para escrituras críticas (emisión y endoso).
- **Malo:** Se introduce una latencia de hasta **5 minutos (data stale)** en la información de póliza. Debe ser manejada con un indicador visual de "Última Actualización" en la UI.
- **Malo:** Se agrega un componente operativo nuevo (Redis Cluster) que el equipo de Run debe monitorear y mantener — Deuda Arquitectónica si no se cierra el gap de capacidades antes del go-live.
- **Neutral:** El costo del Redis Cluster managed (Cloud) se compensa con la postergación de la modernización del Core, que tendría OpEx mucho mayor.

## Más Información

- El Patrón Cache-Aside se describe en el catálogo de patrones de Microsoft Azure: **Patrones de Almacenamiento en Caché**.
- Se requerirá un **ADR de seguimiento** para definir la política exacta de Time-To-Live (TTL) para la caché y el mecanismo de invalidación (push desde el Core vs. polling desde la cache).
- Se requerirá un **ADR de seguimiento** para definir el sizing del Redis Cluster (réplicas, persistencia, modo de evicción).
- Trazabilidad: Resuelve Architecture Concern **AC-002** (cuello de botella de conexiones del Core). Implementa Driver de Negocio **DN-015** (crecimiento 5x del portal en 12 meses).
