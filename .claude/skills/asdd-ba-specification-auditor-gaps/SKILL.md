---
name: asdd-ba-specification-auditor-gaps
description: Framework de 19 filtros que detecta gaps de definición funcional y genera las preguntas que el experto debe responder.
---

## Rol

Detector de brechas de definición. Evalúa un documento funcional (SPEC, brief o equivalente) y produce la lista de preguntas que el experto humano debe responder explícitamente antes de que el equipo estime o implemente.

**Principio fundamental:** este skill genera preguntas, no requisitos. Cada pregunta tiene tres respuestas posibles — todas válidas excepto el silencio:

| Estado | Significado | Acción |
|---|---|---|
| **DEFINIDO** | La respuesta está explícita en el documento | Sin riesgo — continúa |
| **IMPLÍCITO** | Se puede inferir pero no está escrito | Confirmar con experto antes de implementar |
| **PENDIENTE** | Sin respuesta explícita | Bloquea — debe resolverse antes de avanzar |

"No se necesita" es una respuesta válida. "No lo hemos definido" no lo es.

---

## Cuándo activar

- Antes de pasar un documento funcional a implementación o estimación
- Antes de una sesión UAT para anticipar hallazgos
- Cuando el BA humano siente que la definición tiene huecos
- Como complemento al quality gate estructural (framework de 19 filtros de asdd-ba-specification-auditor)

---

## BLOQUE A — FLUJO Y PROCESO (Filtros 1–4)

### Filtro 1 — Flujos de devolución y ciclos de ida y vuelta

El documento describe el camino exitoso. ¿Están definidos los caminos de rechazo?

- ¿Qué pasa si el receptor rechaza o devuelve? ¿A quién vuelve el proceso?
- ¿Cuántas rondas de ida y vuelta puede haber? ¿Hay un límite?
- ¿Qué pasa si el destinatario no responde en X tiempo? ¿Hay timeout automático?
- ¿Cada ronda acumula información de rondas anteriores o es independiente?
- Si hay devolución, ¿qué campos específicos se solicitan corregir? ¿Se puede devolver parcialmente?
- ¿El actor que recibe la devolución puede reenviar sin haber cambiado nada? ¿El sistema valida que efectivamente modificó algo?

**Señal de alerta:** Si el documento dice "aprueba o rechaza" sin detallar qué pasa después del rechazo, hay un flujo completo oculto.

---

### Filtro 2 — Permeabilidad de roles y herencia de funciones

Los roles tienen funciones asignadas. ¿Está definido qué pasa cuando un rol no está disponible o necesita actuar fuera de su scope habitual?

- ¿Un rol superior puede ejecutar las funciones de roles inferiores? ¿En qué circunstancias?
- ¿Puede una persona tener múltiples roles simultáneamente?
- ¿Quién es el backup cuando el titular de un rol no está disponible?
- Si hay jerarquía de aprobación: ¿quién aprueba cuando el ejecutor es el mismo que debería aprobar?
- ¿El sistema registra quién ejecutó realmente cada acción, no solo quién estaba asignado?
- ¿Existe delegación formal? ¿Con límite temporal?

**Señal de alerta:** Si el documento menciona roles jerárquicos sin definir si el superior puede hacer lo del inferior, hay una decisión de permisos sin resolver.

---

### Filtro 3 — Complejidad oculta en "parametrizable"

Cada vez que el documento diga "configurable", "catálogo", "según tipo de X" o "parametrizable", hay potencial complejidad no especificada.

- ¿Cuántos niveles tiene esta configuración? ¿Hay jerarquía entre niveles?
- ¿Quién administra estos valores? ¿El equipo técnico por tickets o el negocio directamente?
- Si el negocio lo administra: ¿necesita pantalla de administración? ¿Con qué operaciones?
- ¿La configuración aplica a la entidad principal o a sub-entidades?
- ¿Hay dependencias condicionales entre valores configurables?
- ¿Los cambios en la configuración afectan registros ya creados o solo los nuevos?
- ¿Se necesita log de auditoría de quién cambió qué y cuándo?

**Señal de alerta:** Si hay una lista de categorías sin definir quién las administra ni cómo cambian en el tiempo, hay un módulo de administración sin especificar.

---

### Filtro 4 — Ramas de fallo de integraciones externas

El documento describe qué pasa cuando los servicios externos responden correctamente. ¿Están definidos los caminos de fallo?

- ¿Qué pasa si el servicio no responde? ¿Timeout? ¿Retry automático? ¿Cuántos intentos?
- ¿Qué pasa si responde parcialmente?
- ¿Existe flujo manual de contingencia? ¿Quién puede ejecutarlo?
- ¿El dato faltante bloquea todo el proceso o solo esa validación específica?
- Si hay flujo manual: ¿la información ingresada manualmente se marca diferente de la validada automáticamente?
- Cuando el servicio se restablece: ¿se regulariza automáticamente lo ingresado en modo manual?

**Señal de alerta:** Si el documento dice "se consulta X para validar" sin una rama de "si X no responde, entonces...", hay un punto de bloqueo operativo sin contingencia.

---

## BLOQUE B — INTERFAZ Y EXPERIENCIA (Filtros 5–8)

### Filtro 5 — Notificaciones y mensajes como módulo completo

Cada mención de "se notifica", "se envía mensaje" o "se alerta" oculta un módulo completo.

- ¿A quién exactamente se notifica? ¿Rol, persona, lista de distribución?
- ¿Qué datos lleva el mensaje? ¿Número de registro? ¿Resumen del estado? ¿Datos del actor?
- ¿Incluye enlace directo a la pantalla o flujo relevante?
- ¿Cuál es el canal? ¿Email, notificación interna, SMS? ¿Uno o varios?
- ¿Qué pasa si el envío falla? ¿Reintento? ¿Cola? ¿Marca de no enviado?
- ¿Los mensajes de error que ve el usuario son comprensibles sin soporte técnico e incluyen acción de recuperación?
- ¿El tono y vocabulario de los mensajes es consistente con el resto del sistema?

**Señal de alerta:** Si el documento termina con "y se notifica al usuario" sin más detalle, hay un template, un canal y un flujo de entrega sin definir.

---

### Filtro 6 — Listados, bandejas y búsqueda como módulos de gestión

Un "listado" o "bandeja" parece una tabla simple. En operación real es un centro de gestión con acciones, filtros, búsqueda y distribución de trabajo.

- ¿Qué acciones se pueden tomar directamente desde esta vista?
- ¿Hay búsqueda? ¿Por qué campos? ¿Exacta o parcial? ¿Sensible a mayúsculas y acentos?
- ¿Los filtros son combinables? ¿Persisten entre sesiones o se resetean?
- ¿Hay conteos o indicadores? ¿Qué cuentan exactamente?
- ¿Hay paginación? ¿Cuántos registros por página? ¿Refresh automático?
- ¿Quién puede reasignar trabajo entre personas?
- ¿Qué pasa con el trabajo asignado cuando la persona se desactiva?

**Señal de alerta:** Si el documento dice "el usuario ve las solicitudes" sin detallar qué puede hacer con ellas desde esa vista, hay un módulo de gestión sin especificar.

---

### Filtro 7 — El actor externo ve una aplicación diferente

Los actores externos (clientes, proveedores, socios, sistemas consumidores) no ven lo mismo que los actores internos.

- ¿Qué estados del proceso ve el actor externo? ¿Con los mismos nombres o traducidos a su lenguaje?
- ¿Qué documentos puede ver y cuáles NO debe ver bajo ninguna circunstancia?
- ¿Puede editar información o es solo lectura?
- ¿Hay datos internos (observaciones, puntajes, justificaciones) que deben ocultarse al actor externo?
- ¿Los valores técnicos o internos se muestran al usuario o se traducen?

**Señal de alerta:** Si el documento no tiene una sección explícita de "lo que el actor externo ve vs. lo que el interno ve", hay riesgo de exponer datos internos.

---

### Filtro 8 — Documentos generados con requisitos de formato ocultos

"Generar documento" parece simple. Cada documento tiene un template con estructura, campos dinámicos y reglas de distribución.

- ¿Existe template ya definido? ¿Está disponible como archivo?
- ¿Qué campos del template son dinámicos?
- ¿El documento requiere firma? ¿De quién? ¿Con qué mecanismo?
- ¿El documento se envía, se descarga, se almacena en repositorio externo — o todo lo anterior?
- ¿El template puede cambiar en el tiempo? ¿Quién lo actualiza?
- ¿Hay restricciones de visibilidad? ¿Datos internos que no deben aparecer en el documento enviado al externo?

**Señal de alerta:** Si el documento dice "se genera carta de X" sin adjuntar el template, es un requisito incompleto que va a generar retrabajo.

---

## BLOQUE C — COMPLIANCE Y GOBERNANZA (Filtros 9–10)

### Filtro 9 — Validaciones regulatorias no escritas

Los controles regulatorios rara vez aparecen en los documentos funcionales. Aparecen en UAT y son innegociables.

- ¿Qué entidades regulatorias intervienen en este proceso?
- ¿Qué controles son obligatorios por regulación? ¿Trazabilidad, consentimientos, enmascaramiento?
- ¿Hay datos sensibles que requieren consentimiento explícito antes de capturarse?
- ¿Qué información es de uso interno restringida por área y perfil?
- ¿Hay plazos regulatorios que el sistema debe controlar?
- ¿Se requiere principio de cuatro ojos (quien crea no puede aprobar)?

**Señal de alerta:** Si el documento no menciona ningún regulador ni control de compliance, no es que no aplique — es que falta preguntar.

---

### Filtro 10 — Diseño para autosuficiencia futura del negocio

El negocio espera operar sin depender de tickets técnicos para cambios operativos cotidianos.

- ¿Este catálogo o configuración cambia con frecuencia en la operación real?
- ¿El negocio lo administra directamente o va por ticket a soporte?
- Si el negocio lo administra: ¿implica CRUD completo + trazabilidad + permisos por rol?
- ¿Hay opciones que hoy no se usan pero el negocio quiere dejar pre-creadas?
- ¿Los cambios en configuración requieren aprobación o el administrador tiene autonomía?

**Señal de alerta:** Si el negocio dice "eso lo administra el negocio" y el documento no tiene pantalla de administración especificada, hay un módulo completo sin estimar.

---

## BLOQUE D — COMPORTAMIENTO TÉCNICO-FUNCIONAL (Filtros 11–15)

### Filtro 11 — Microinteracciones UX como especificación oculta

El documento describe QUÉ hace la pantalla. ¿Está definido CÓMO se comporta?

- ¿Los campos se validan al perder foco o al hacer clic en guardar?
- ¿Qué campos se deshabilitan condicionalmente? ¿Qué condición los activa?
- ¿Los modales de confirmación cierran al hacer clic fuera o solo con botón?
- ¿Al completar una acción el sistema redirige o se queda en la misma pantalla?
- ¿Los campos de solo lectura se ven visualmente diferentes de los editables?
- ¿Hay comportamiento de doble confirmación para acciones críticas?

**Señal de alerta:** Un formulario con más de 10 campos sin especificación de comportamiento condicional tiene al menos 5–10 decisiones de UX sin definir que aparecerán en UAT.

---

### Filtro 12 — Datos iniciales, migración y carga base

Los catálogos y datos maestros no existen solos — alguien debe crearlos.

- ¿Los datos iniciales vienen de un sistema legado? ¿En qué formato?
- ¿Quién provee el archivo de carga inicial? ¿El cliente o el implementador?
- ¿Se requiere limpieza o depuración antes de cargar? ¿Quién la hace?
- ¿Hay validación post-carga que el cliente revisa y aprueba?
- ¿Qué pasa si la data tiene inconsistencias?
- ¿Hay data histórica que debe coexistir con la nueva? ¿Cómo se distinguen?

**Señal de alerta:** Si el documento dice "el sistema muestra el catálogo de X" sin un plan de carga de ese catálogo, hay una dependencia bloqueante sin identificar.

---

### Filtro 13 — Concurrencia, bloqueo y conflicto de edición

El documento describe flujos para un usuario. En operación real, múltiples personas trabajan simultáneamente.

- ¿Qué pasa si dos personas intentan editar el mismo registro al mismo tiempo?
- ¿Hay bloqueo pesimista (el primero bloquea) u optimista (el último en guardar gana)?
- ¿Se notifica al segundo usuario que alguien más está editando?
- ¿Qué pasa si un usuario deja un registro en edición y se va sin guardar? ¿Cuándo se libera el bloqueo?
- En flujos de aprobación: ¿qué pasa si dos aprobadores actúan simultáneamente?

**Señal de alerta:** Si el flujo pasa el registro por múltiples actores sin mencionar bloqueo ni concurrencia, hay riesgo de corrupción de datos.

---

### Filtro 14 — Timeout, sesión y recuperación de estado

¿Qué pasa cuando el usuario se desconecta, la sesión expira o el navegador se cierra a mitad de un proceso?

- ¿Cuánto dura la sesión antes de expirar? ¿Es configurable?
- ¿Hay autoguardado? ¿Con qué frecuencia? ¿Con confirmación visual?
- ¿Al reconectarse, el usuario retoma donde quedó o empieza de nuevo?
- ¿Los procesos asincrónicos tienen timeout definido?
- Para actores externos: ¿la sesión es más corta por seguridad?

**Señal de alerta:** Un formulario con más de 15 campos sin mención de autoguardado ni recuperación de sesión producirá pérdida de datos en producción.

---

### Filtro 15 — Operaciones masivas vs. unitarias

El documento describe cómo operar sobre un registro. ¿Está definido si se necesita operar sobre muchos al mismo tiempo?

- ¿El negocio necesita crear o modificar múltiples registros a la vez? ¿Cuántos aproximadamente?
- ¿Existe necesidad de carga masiva por archivo? ¿Qué formato?
- ¿Las operaciones masivas requieren el mismo ciclo de validación que las unitarias?
- ¿Se necesita exportar datos para análisis externo?
- ¿Qué pasa si una operación masiva falla a mitad del proceso? ¿Rollback total o parcial?

**Señal de alerta:** Si el negocio maneja catálogos con más de 100 registros y el documento solo describe operaciones unitarias, hay una funcionalidad masiva sin estimar.

---

## BLOQUE E — CICLO DE VIDA Y CONSISTENCIA (Filtros 16–19)

### Filtro 16 — Máquina de estados explícita

El documento nombra estados del objeto principal. ¿Está definido el ciclo de vida completo?

- ¿Cuáles son todos los estados posibles del objeto a lo largo de su vida?
- ¿Qué transiciones entre estados son válidas? ¿Cuáles están prohibidas?
- ¿Quién puede ejecutar cada transición? ¿Es automática o requiere acción manual?
- ¿Hay estados terminales desde los que no se puede salir?
- ¿Se puede revertir un estado? ¿Bajo qué condiciones y quién lo autoriza?
- ¿Los nombres de los estados son los mismos para el sistema y para el usuario, o se traducen?

**Señal de alerta:** Si el documento nombra estados (BORRADOR, ENVIADO, APROBADO) sin definir todas las transiciones válidas entre ellos, hay flujos ocultos que aparecerán en UAT.

> **Nota de consistencia del bundle (ver ADR-006 en `docs/adoption/`):** el material original referenciaba un "F05 de BA-evaluador" como validador estructural complementario de la máquina de estados que no está definido en el agente `asdd-ba-specification-auditor` incluido en este bundle. Se documenta como inconsistencia heredada — este Filtro 16 opera igual: *genera preguntas* sobre estados no definidos en el documento (¿falta un estado? ¿falta una transición?), independientemente de si existe o no un validador estructural complementario.

---

### Filtro 17 — Gestión de archivos adjuntos

Si el documento menciona "adjuntar", "cargar archivo" o "subir documento", hay un módulo completo sin especificar.

- ¿Qué formatos de archivo se aceptan?
- ¿Cuál es el tamaño máximo por archivo y por conjunto?
- ¿Dónde se almacenan los archivos?
- ¿Quién puede ver qué adjunto? ¿El adjunto hereda los permisos del registro padre?
- ¿Se pueden eliminar adjuntos? ¿Quién puede hacerlo? ¿Se elimina físicamente o se desactiva?
- ¿Puede haber múltiples versiones del mismo adjunto?
- ¿El adjunto viaja con el registro en todo su ciclo de vida o puede disociarse?

**Señal de alerta:** "Adjuntar documentos de soporte" sin ninguna de estas respuestas es un módulo de gestión documental sin estimar.

---

### Filtro 18 — Idempotencia y doble envío

¿Qué pasa si la misma operación se ejecuta más de una vez?

- ¿Qué pasa si el usuario hace clic dos veces en "Guardar" o "Enviar"?
- ¿Qué pasa si la solicitud llega duplicada por un retry de red?
- ¿El sistema detecta y rechaza duplicados? ¿Con qué criterio los identifica como duplicados?
- Si se detecta un duplicado: ¿se notifica al usuario? ¿Qué mensaje recibe?
- Para operaciones con impacto financiero, regulatorio o irreversible: ¿hay mecanismo explícito de prevención de doble procesamiento?

**Señal de alerta:** Una operación de alto impacto (pago, aprobación, envío formal, eliminación) sin mención de idempotencia tiene riesgo de doble procesamiento en producción.

---

### Filtro 19 — Retrocompatibilidad con registros existentes

Si el documento modifica un proceso ya en operación, ¿está definido qué pasa con los registros creados bajo las reglas anteriores?

- ¿Los registros existentes se migran automáticamente a las nuevas reglas?
- ¿Los registros viejos quedan en un estado diferenciado?
- ¿Las nuevas reglas aplican solo a registros nuevos o también a los existentes?
- ¿Hay un período de convivencia entre reglas viejas y nuevas? ¿Cuánto dura?
- ¿El usuario puede distinguir visualmente un registro creado bajo reglas viejas de uno nuevo?
- ¿Los reportes tratan igual los registros viejos y nuevos?

**Señal de alerta:** Si el documento modifica comportamiento existente sin mencionar qué pasa con datos históricos, hay una decisión de migración sin tomar.

---

## Proceso de evaluación

1. Leer el documento funcional completo
2. Recorrer los 19 filtros en orden
3. Por cada filtro, clasificar: DEFINIDO / IMPLÍCITO / PENDIENTE
4. Construir la tabla de resultados
5. Separar los PENDIENTES (bloqueantes) de los IMPLÍCITOS (a confirmar)
6. **Recolectar gaps ya reportados en el documento (o en artefactos de entrada) por otro agente/autor** — decisiones pendientes, brechas "por validar", TODOs, secciones de gaps preexistentes. NO se re-clasifican con los 19 filtros: se transcriben tal cual, marcando su origen, para que el agente los presente en la sección "Gaps heredados de otros artefactos" con formato consistente (ID `GAP-{ORIGEN}-NNN`).
7. Calcular el riesgo global

---

## Formato de salida

```
## Evaluación de Gaps Funcionales — {nombre del documento evaluado}
Fecha: {fecha}

### Resumen (va al inicio — vista rápida para el AF)
Filtros evaluados: 19 | Definidos: {N} | Implícitos: {N} | Pendientes: {N}
Riesgo global: BAJO / MEDIO / ALTO / CRÍTICO
Gaps heredados de otros artefactos: {N} (ver sección propia) | 0 → "ninguno"

### Tabla de resultados

| # | Filtro | Estado | Pregunta sin respuesta explícita | Decisión requerida |
|---|---|---|---|---|
| 1 | Flujos de devolución | PENDIENTE | ¿Qué pasa si el aprobador rechaza? | AF o cliente define el flujo de devolución completo |
| 5 | Notificaciones | IMPLÍCITO | Canal asumido como email — no está escrito | Confirmar canal y si aplica notificación interna |
| 16 | Máquina de estados | PENDIENTE | Solo se mencionan 2 de los N estados posibles | Definir ciclo de vida completo con todas las transiciones válidas |

### Decisiones bloqueantes — PENDIENTE
Preguntas que deben resolverse antes de implementar o estimar. El experto humano responde cada una — cualquier respuesta explícita cierra el ítem.

### Decisiones a confirmar — IMPLÍCITO
Asunciones detectadas que deben validarse explícitamente con el experto.

### Sin riesgo — DEFINIDO
{N} filtros con respuesta explícita en el documento — sin acción requerida.

### Gaps heredados de otros artefactos
Gaps YA reportados por otro agente/artefacto (EDT, ADR, diccionario, otra SPEC), transcritos sin
re-clasificar por los 19 filtros. Cada uno con su origen para que el agente los renderice con formato
consistente (ID `GAP-{ORIGEN}-NNN`). Si no hay → "ninguno".

| ID | Origen (artefacto + sección) | Reportado por | Estado en origen | Brecha |
|---|---|---|---|---|
| GAP-EDT-001 | EDT §4 decisiones pendientes | asdd-ba-functional-architect | parcialmente resuelto | {texto de la brecha tal como fue reportada} |
```

---

## Criterio de riesgo global

| Riesgo | Criterio |
|---|---|
| **BAJO** | 0 PENDIENTES, máximo 3 IMPLÍCITOS |
| **MEDIO** | 1–2 PENDIENTES o 4–6 IMPLÍCITOS |
| **ALTO** | 3–5 PENDIENTES |
| **CRÍTICO** | 6+ PENDIENTES, o cualquier PENDIENTE en Filtros 1, 4, 9, 16 o 18 |

---

## Anti-patterns

- **Generar requisitos sin que se soliciten** — si el filtro pregunta "¿hay operaciones masivas?" y el experto responde "no", el resultado es CERRADO, no un nuevo requisito. El skill detecta preguntas sin respuesta, no construye funcionalidades.
- **Marcar DEFINIDO por inferencia** — si la respuesta no está escrita explícitamente, es IMPLÍCITO como mínimo. La inferencia no cierra el riesgo.
- **Omitir filtros "no aplicables"** — todos los filtros deben evaluarse. Si no aplica, decir explícitamente por qué y marcar DEFINIDO con justificación.
