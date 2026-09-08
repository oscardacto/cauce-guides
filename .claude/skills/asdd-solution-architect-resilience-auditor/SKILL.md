---
name: asdd-solution-architect-resilience-auditor
description: Audita resiliencia ante fallos externos — retry con jitter, idempotencia, timeouts, circuit breakers, bulkheads y fallbacks.
---

## Propósito

Auditar de forma read-only la tolerancia a fallos del sistema frente a sus
integraciones con servicios externos. Producir hallazgos clasificados por
severidad y mapeados a patrones de resiliencia concretos (timeout, retry,
circuit breaker, bulkhead, fallback, dead-letter, health check).

Este skill **no modifica archivos**. Solo analiza y reporta.

## Rol

Auditor de resiliencia. Inventaria dependencias externas, verifica patrones
de protección configurados y detecta escenarios de fallo en cascada. Su
output alimenta ADRs de resiliencia, criterios de aceptación NFR y el quality
gate de Verificar.

## Cuándo activar

Señales que disparan el skill:

- Diseño o cambio de un componente que llama a {servicio_externo} (HTTP,
  cola, base de datos, identidad federada, proveedor de firma, catálogos).
- Acceptance criteria mencionan NFRs de disponibilidad, tiempo de respuesta,
  recuperación, degradación graceful.
- Pre-release o pre-merge a producción con integraciones nuevas o modificadas.
- Post-incidente: un fallo en cascada llegó a producción y se necesita
  retroalimentar el diseño.

Fases ASDD aplicables:

- **Diseñar (WF-003)** — definir patrones de resiliencia antes de implementar.
- **Verificar (WF-005)** — validar que la implementación cumple los patrones
  decididos.

## Disciplina de tokens (read-only)

- Patrón de 3 capas: Grep → Glob → Read.
- Nunca leer un archivo > 100 líneas sin localizar primero la sección con
  Grep.
- `Read` con `offset` + `limit`, máximo 200 líneas por lectura.
- Si dos greps con patrones distintos no encuentran la dependencia → reportar
  al usuario, no seguir explorando (regla de declaración de contexto).

## Proceso

### Paso 1 — Inventario de dependencias externas

Mapear toda integración con un sistema fuera del proceso:

```bash
# Adaptar los patrones a los identificadores del stack del proyecto consumidor.
# Clientes HTTP / SDK
rg -l "{http_client_pattern}" src/

# Productores / consumidores de mensajería
rg -l "{messaging_producer_pattern}|{messaging_consumer_pattern}" src/

# Acceso a almacenes persistentes
rg -l "{repository_pattern}|{pool_pattern}" src/
```

Para cada {servicio_externo} encontrado, registrar: propósito, criticidad,
impacto si cae.

### Paso 2 — Verificar checklist de patrones (ver tablas abajo)

Aplicar las 8 tablas de auditoría sobre cada dependencia inventariada.

### Paso 3 — Detectar escenarios de fallo en cascada

Para cada dependencia crítica, responder:

- Si {servicio_externo} cae 100% durante 5 minutos, ¿qué se rompe en el
  sistema? ¿Qué transiciones de estado quedan bloqueadas?
- Si {servicio_externo} responde con latencia 10× la normal, ¿se satura el
  pool de conexiones? ¿Se agotan los workers compartidos con otras
  dependencias?
- ¿La caída de {servicio_externo} no crítico (catálogos, validaciones
  asíncronas) bloquea operaciones que deberían degradar graciosamente?

### Paso 4 — Reportar hallazgos clasificados

Producir el reporte con el formato definido en "Outputs". Cada hallazgo
incluye severidad, ubicación (`archivo:línea`), patrón violado y fix
sugerido — nunca proponer fix especulativo si la causa raíz no se confirmó
con evidencia de lectura.

## Tablas de auditoría

### 1. Timeout por enlace

Un `.timeout()` envolviendo la operación externa **no es suficiente**.
Verificar timeouts en cada eslabón:

- [ ] Connect timeout (sugerido: 5s) en el cliente HTTP.
- [ ] Read / response timeout (10-30s según servicio).
- [ ] Connection-pool acquire timeout — sin este, la operación cuelga bajo
      saturación aunque exista el timeout externo.
- [ ] Timeout del consumidor de mensajería para el ciclo de poll.

### 2. Retry con backoff exponencial + jitter

Para toda operación externa con fallos transitorios esperables:

- [ ] Reintentos limitados (sugerido: máximo 3).
- [ ] Backoff **exponencial con jitter** — el backoff exponencial sin jitter
      sincroniza reintentos entre instancias y produce *retry storm*.
- [ ] Reintentar **solo** sobre errores transitorios (5xx, timeout,
      connection refused). Nunca sobre 4xx.
- [ ] Reintentar **solo** operaciones idempotentes (GET, PUT idempotente).
      `POST` ciego nunca se reintenta sin clave de idempotencia.

### 3. Circuit breaker

Para cada {servicio_externo}:

- [ ] Circuit breaker configurado con umbral de fallo (N consecutivos o X%
      de tasa de fallo).
- [ ] Estado half-open: prueba periódica antes de reabrir el circuito.
- [ ] Fallback definido para el estado open.

### 4. Bulkhead

Aislamiento de recursos para evitar que un servicio degradado consuma todo
el pool compartido:

- [ ] Concurrencia acotada por dependencia (no un único pool global).
- [ ] Trabajo bloqueante o CPU-intensivo en un worker pool dedicado por
      dependencia, no en el event-loop compartido.

### 5. Fallback y degradación graceful

Para cada {servicio_externo}, definir comportamiento cuando está caído:

| Tipo de servicio | Fallback esperado |
|---|---|
| Validación regulatoria asíncrona | Encolar para reintento, no bloquear el flujo principal |
| Firma o validación con SLA largo | Marcar como pendiente, polling job posterior |
| Catálogos / datos maestros | Servir desde caché local con TTL |
| Bus de eventos | Dead-letter queue + reproceso manual |
| Base de datos primaria | Sin fallback — sistema no disponible (aceptable si está documentado) |

Regla: un fallback que bloquea una transición de estado cuando la lógica
permite degradación → hallazgo.

### 6. Sizing de pools

- [ ] Pool de conexiones a base de datos con `max-size` y `max-idle-time`
      configurados (nunca ilimitado).
- [ ] Pool HTTP configurado por {servicio_externo} (no un pool global
      compartido).
- [ ] Consumidor de mensajería con tamaño de batch acorde a la capacidad
      de procesamiento.

### 7. Dead-letter handling

- [ ] DLQ configurada para procesamiento fallido de mensajes.
- [ ] Alerta cuando los mensajes aterrizan en DLQ.
- [ ] Mecanismo de reproceso manual desde la DLQ.

### 8. Health checks de dependencias

- [ ] Cada {servicio_externo} reporta a un endpoint de salud del sistema.
- [ ] El check es ligero (ping, no operación completa).
- [ ] Reporta estado degradado (UP / DOWN / DEGRADED), no solo binario.

## Outputs

Reporte en `docs/architecture/resilience-audit-{feature}.md` con:

```markdown
## Resilience Audit — {feature}

### Inventario de dependencias externas
| {servicio_externo} | Propósito | Timeout | Retry | Circuit Breaker | Fallback | Estado |
|---|---|---|---|---|---|---|

### Hallazgos
| # | Severidad | Dependencia | Patrón violado | Ubicación (archivo:línea) | Impacto | Fix sugerido |
|---|---|---|---|---|---|---|

### Escenarios de fallo en cascada
| Escenario | Comportamiento actual | Comportamiento esperado |
|---|---|---|

### Resumen
- Dependencias externas: N
- Totalmente protegidas: N
- Sin protección: N
- Riesgos de cascada: N
```

Severidad:

- **blocker** — un fallo de la dependencia produce caída total o corrupción
  silenciosa de datos en producción.
- **major** — degradación funcional significativa o saturación bajo carga
  realista.
- **minor** — observabilidad o métricas faltantes; el patrón existe pero no
  se monitorea.

## Relación con skills y reglas existentes

- **`.claude/docs/stabilization-bug-rules.md`** — la tabla "Bugs que los Agentes
  Introducen" lista *retry storm*, *race condition*, *connection exhaustion*
  y *memory leak* como patrones a verificar en code-review. Este skill
  aporta **visión de diseño**: detecta la ausencia del patrón de
  resiliencia *antes* de que el bug se manifieste, mientras que el checklist
  de la regla actúa sobre el código ya escrito.
- **`SBR-001`** (Think Before Coding) — toda hipótesis del auditor cita
  `archivo:línea`. Sin evidencia de lectura no se propone fix.
- **`SBR-003`** (Surgical Changes) — el auditor es read-only; los fixes
  propuestos deben tener scope acotado y trazable al hallazgo.
- **`asdd-system-integrity.md`** — la sección *Dependent Module
  Testing* exige testear consumers cuando cambia una interfaz; este skill
  identifica qué consumers están expuestos al fallo de cada dependencia.
- **`asdd-solution-architect-quality`** — convierte NFRs de disponibilidad y
  recuperación en SLOs/SLIs. Este skill verifica que los patrones que
  sostienen esos SLOs estén presentes.
- **`asdd-solution-architect-patterns`** — cataloga patrones; este skill audita
  su aplicación correcta sobre dependencias externas concretas.

## Cuándo NO invocar

- No hay dependencias externas en el scope — sistema puramente interno sin
  IO remota.
- Auditoría general de calidad de código sin foco en integraciones — usar
  `asdd-tech-lead-code-review`.
- Necesidad de cuantificar NFRs (latencia, uptime) — primero
  `asdd-solution-architect-quality`, luego este skill verifica la
  implementación.
- Pruebas de carga reales — este skill audita configuración; la ejecución
  de chaos / carga corresponde a `asdd-devops-engineer-testing`.

## Anti-patterns

- **Retry sin jitter** — backoff exponencial puro sincroniza reintentos
  entre instancias bajo fallo correlacionado. Siempre con jitter.
- **Timeout único en la operación externa** — `.timeout()` envolviendo la
  llamada sin verificar timeouts en cada eslabón (connect, read, pool
  acquire) deja el sistema vulnerable a saturación silenciosa.
- **Pool global compartido entre todas las dependencias** — un
  {servicio_externo} degradado consume todo el pool y mata a los demás.
  Bulkhead por dependencia.
- **Fallback que bloquea transición de estado** — si la lógica de negocio
  permite degradación graceful, el fallback debe encolar y continuar, no
  bloquear.
- **Retry de operaciones no idempotentes** — `POST` ciego reintentado
  produce duplicados silenciosos. Exigir clave de idempotencia.
- **Circuit breaker sin half-open observable** — si el estado del circuito
  no se expone como métrica, el operador no sabe cuándo el servicio se
  recuperó.
- **DLQ sin alerta ni reproceso** — los mensajes muertos se acumulan y
  nadie se entera hasta que el negocio reclama.
- **Hallazgo sin evidencia `archivo:línea`** — el reporte cita siempre la
  fuente; un hallazgo sin ubicación es especulación, no auditoría.
