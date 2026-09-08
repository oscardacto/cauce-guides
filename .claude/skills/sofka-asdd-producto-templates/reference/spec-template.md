# Especificación de Dominio — {1.X.Y}: {Nombre del spec}

---

## 0. Metadatos del documento

| Campo | Valor |
|---|---|
| Proyecto | {Nombre del proyecto} |
| Cliente | {Nombre del cliente} |
| Versión | 1.0 |
| Última modificación | AAAA-MM-DD |
| Fecha de creación | AAAA-MM-DD |
| Autor | AF |
| Fase SDLC aplicable | {Fase 1 / Fase 2 / ... / Todas las fases} |
| Estado | BORRADOR |
| Control de cambios | Cuando `Estado: APROBADA`, toda modificación requiere registrar un CR en **§ 15** antes de editar cualquier otra sección. La versión se incrementa en el _minor_ con cada CR aprobado (ej. 1.0 → 1.1 → 1.2). |
| Módulo / Agrupador | {Nombre del módulo, dominio o agrupador de nivel superior — omitir si no aplica} |
| Figma | {node-id: X:Y — URL: https://... — omitir si no aplica} |
| Dependencias | {Otras specs que deben estar completas antes de implementar esta — o "Ninguna"} |
| ALM | {Azure DevOps · Jira · Rally · Linear · Otro — ítem: {URL o ID} — o "No aplica"} |

> **Estado del artefacto** (este campo): BORRADOR → APROBADA CON OBSERVACIONES → APROBADA → RECHAZADA. Lo evoluciona el evaluador funcional al emitir veredicto.
> **Estado de dominio** (columna del Mapa): PENDIENTE → EN PROGRESO → COMPLETO (o N/A cuando Aplica = No). Lo evoluciona cada responsable de dominio. Son escalas independientes — no mezclarlas.

### Mapa de dominios — estado de completitud

| Dominio | Aplica | Secciones que cubre | Responsable | Estado |
|---|---|---|---|---|
| Funcional | Sí | 1, 2, 3, 4, 5 (tabla de integraciones + campos AF del contrato), 6, 7 (RNFs de negocio), 8 (mensajes/datos), 9 (reglas de validación + mensajes), 10 (4 escenarios base), 11 (encabezado Aplica + clasificación inicial de datos), 13, 14 | AF | PENDIENTE |
| Arquitectura | {Sí / No} | 5 (tipo técnico / ADR / contrato completo), 7 (escalabilidad / capacidad), 11 (revisión), 13 (compliance / trazabilidad regulatoria) | Arquitecto | PENDIENTE |
| Developer | {Sí / No} | 4 (máquina de estados — refina), 5 (contrato técnico — schemas / autenticación), 9 (especificación técnica de validaciones) | Developer / Tech Lead | PENDIENTE |
| QA | {Sí / No} | 7 (cobertura / performance testing), 10 (escenarios adicionales + criterios de done) | QA Engineer | PENDIENTE |
| DevOps | {Sí / No} | 5 (SLA operacional / monitoreo), 7 (SLOs / observabilidad) | DevOps Engineer | PENDIENTE |
| UX | {Sí / No} | 2 (arquetipos / patrones de interacción), 4 (máquina de estados — refina), 8 (wireframes mid-fi, user flows, investigación de usuarios) | UX Designer | PENDIENTE |
| UI | {Sí / No} | 8 (componentes hi-fi, design tokens, WCAG audit, handoff), 9 (comportamiento visual de mensajes y errores) | UI Designer | PENDIENTE |
| Seguridad | Sí _(default — opt-out requiere sign-off del Experto de Seguridad, no del AF)_ | 11 (autenticación y autorización, gestión de secretos, ciclo de vida de sesión/token, datos sensibles y cifrado, logging seguro, casos de abuso, integraciones salientes, privacidad/derechos del titular, compliance, OWASP Top 10) | Experto de Seguridad | PENDIENTE |
| Datos | {Sí / No} | 12 (contexto del proyecto, stakeholders, restricciones, fuentes) | AF | PENDIENTE |

> La SPEC está completa cuando todos los dominios marcados como **Aplica: Sí** están en **COMPLETO** y el AF emite aprobación final.

> **Instrucciones:** La columna "Aplica" se define al iniciar la SPEC. Dominio Funcional siempre aplica. Los demás se marcan Sí / No según el alcance de la funcionalidad (ej. sin frontend → UX/UI = No; sin integraciones técnicas → Developer = No). Los dominios con Aplica = No se marcan N/A. Un dominio con Aplica = No debe documentar el motivo en la columna "Secciones que cubre" en lugar del listado de secciones (ej. "N/A — funcionalidad sin interfaz visual").

### Gate de readiness — DOR

> Cada dominio responsable confirma que su aporte a la SPEC está completo y sin bloqueantes antes de activar la fase **Construir**. El AF coordina y no entrega la SPEC hasta que todos los dominios con **Aplica = Sí** en el Mapa de dominios estén marcados.

- [ ] **Funcional (AF)** — veredicto de evaluación APROBADA o APROBADA CON OBSERVACIONES con observaciones resueltas; Sección 14 sin ítems PENDIENTE
- [ ] **Arquitectura** — decisiones técnicas e integraciones definidas (Sección 5), ADRs emitidos si aplica _(omitir si Aplica = No)_
- [ ] **Developer** — contrato técnico completo (Sección 5), máquina de estados confirmada (Sección 4), especificación técnica de validaciones (Sección 9) _(omitir si Aplica = No)_
- [ ] **UX** — wireframes mid-fi aprobados, user flows mapeados y arquetipos validados (Secciones 2, 4, 8) _(omitir si Aplica = No)_
- [ ] **UI** — componentes hi-fi, design tokens, WCAG audit y handoff disponibles (Sección 8), comportamiento visual de mensajes (Sección 9) _(omitir si Aplica = No; requiere UX completado)_
- [ ] **QA** — estrategia de pruebas y escenarios adicionales definidos (Sección 10) _(omitir si Aplica = No; también omitir si la estrategia QA se define en paralelo con construcción)_
- [ ] **DevOps** — SLOs, pipeline y observabilidad definidos (Secciones 5 / 7) _(omitir si Aplica = No)_
- [ ] **Seguridad** — análisis completo: autenticación y autorización, gestión de secretos, ciclo de vida de sesión/token, datos sensibles y cifrado, logging seguro, casos de abuso, integraciones salientes, privacidad/GDPR (si aplica) y controles OWASP Top 10 definidos (Sección 11) _(opt-out requiere sign-off del Experto de Seguridad — el AF no puede marcarlo como N/A unilateralmente)_
- [ ] **Datos** — contexto del proyecto, stakeholders, restricciones y fuentes definidos (Sección 12) _(omitir si Aplica = No)_

> **Instrucciones:** Marcar [x] cuando el dominio confirma que su parte está lista. Los dominios con Aplica = No en el Mapa de dominios se omiten aquí. El checkbox Funcional se respalda en el veredicto formal de evaluación — no es autoevaluación. No avanzar a construcción con dominios requeridos sin marcar.

---

## 1. User Story

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

Como {actor principal}, quiero {capacidad o función}, para {valor de negocio obtenido}.

**Métrica de éxito:** {Indicador cuantificable que confirma que la funcionalidad cumple su propósito}. Validado por {actor validador} mediante {método de validación}.

> **Instrucciones (Funcional):** Una sola User Story que captura el propósito completo de la funcionalidad. La métrica de éxito debe ser medible y verificable — no usar "funciona correctamente" sino porcentajes, conteos o condiciones observables con número.

### Fuera de alcance

> **Dominio:** Funcional · AF
> **Propósito:** registrar únicamente las exclusiones que el negocio podría asumir incluidas por proximidad semántica con esta funcionalidad. No es un inventario de todo lo que el sistema no hace — es un contrato explícito de expectativas para stakeholders e input directo para BA-control-alcance al evaluar hallazgos UAT y solicitudes de cambio.

| # | Exclusión | Por qué podría asumirse incluida | Dónde vive si existe |
|---|---|---|---|
| FAS-001 | {descripción de lo que queda fuera} | {razón por la que el stakeholder podría esperarlo} | {otro SPEC, otro proyecto, backlog, N/A} |

> Sin exclusiones relevantes — todo lo que el stakeholder podría asumir incluido, está incluido. *(Reemplazar la tabla por esta línea cuando no aplica.)*

---

## 2. Actores y Permisos

> **Dominios:** Funcional · AF — UX/UI (arquetipos y patrones de interacción por rol)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Actores del sistema — Funcional (AF)

| Actor | Rol | Permisos sobre este flujo |
|---|---|---|
| {Actor principal} | {Rol en el sistema} | {Qué puede hacer y qué no puede hacer sobre este flujo — permisos concretos y verificables} |
| {Actor secundario} | {Rol en el sistema} | {Qué puede hacer y qué no puede hacer sobre este flujo — permisos concretos y verificables} |

### Arquetipos de usuario y patrones de interacción — UX/UI

> Incluir: arquetipos de usuario por rol, patrones de interacción relevantes, necesidades específicas de cada perfil.

> **Instrucciones (Funcional):** Incluir todos los actores que interactúan directamente con este flujo — roles del sistema que se construye, no el equipo que escribe la spec. Los permisos deben ser concretos y verificables: qué puede hacer, qué no puede hacer, bajo qué condiciones. No usar roles abstractos ("puede ver", "tiene acceso") sin especificar el alcance exacto.

---

## 3. Trazabilidad

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

| Campo | Valor |
|---|---|
| EDT ref | {`1.X.Y` — nodo del EDT que originó este spec · ruta: `docs/specs/edt-{proyecto}.md`} |
| Origen | {HU-NNN / Brief-{proyecto} / Ticket {ID} / Requisito / Incidente / Otro — referencia exacta al artefacto fuente} |
| Fecha del artefacto fuente | {AAAA-MM-DD} — fecha de creación o aprobación del artefacto que origina este requerimiento |
| Fecha de registro de trazabilidad | {AAAA-MM-DD} — fecha en que el AF formalizó el vínculo entre el artefacto fuente y esta SPEC |
| Última modificación | {AAAA-MM-DD} — {motivo del cambio en una línea — o "Sin cambios desde el registro inicial". Para cambios post-aprobación usar formato `CR-NNN: {motivo}` — el detalle queda en § 15.} |
| Downstream | Implementación en `{ruta del artefacto de implementación}` — referenciada en `{ruta}\README.md` |
| DVF asociado | No aplica — pendiente de evaluación. / `DVF-{1.X.Y}-{nombre} v{N}` — producido en la etapa de validación funcional post-aprobación |
| Estado en ciclo | {En especificación · En diseño · En construcción · En verificación · En producción · Retirado} |

> **Instrucciones (Funcional):** Esta sección establece la cadena de trazabilidad completa del spec: de dónde viene el requerimiento (upstream), a dónde fue (downstream) y en qué punto del ciclo se encuentra. — **EDT ref**: nodo `1.X.Y` del EDT que originó esta especificación; si no existe EDT formal, indicar el agrupador o módulo. — **Origen**: artefacto de negocio fuente (HU, brief, ticket, incidente u otro — no restringido). — **Fecha del artefacto fuente**: cuándo fue creado o aprobado ese artefacto en el ALM o sistema fuente. — **Fecha de registro de trazabilidad**: cuándo el AF formalizó el vínculo — la diferencia entre ambas fechas puede evidenciar demoras en la formalización. — **Última modificación**: actualizar cada vez que el spec cambie; el motivo en una línea hace el spec auto-explicativo sin necesidad de leer el historial de versiones. — **Downstream**: ruta al artefacto de implementación confirmado. — **DVF asociado**: completar con el ID `DVF-{1.X.Y}-{nombre} v{N}` una vez producido; antes dejar "No aplica — pendiente de evaluación". — **Estado en ciclo**: refleja en qué fase ASDD se encuentra este spec actualmente — actualizar junto con la Última modificación.

---

## 4. Flujo de Negocio

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

1. {Paso 1: acción del actor — qué provee o hace para iniciar el flujo}
2. {Paso 2: procesamiento — qué evalúa o transforma la funcionalidad}
3. {Paso 3: bifurcación de decisión}
   - SI {condición A} → {acción A}
   - SINO → {acción B}
4. {Paso 4: continuación del flujo principal}
   a. {Sub-paso a}
   b. {Sub-paso b}
5. {Paso final — resultado exitoso del flujo: qué produce, confirma o entrega la funcionalidad al completarse correctamente}
6. {Manejo de error o condición excepcional — qué pasa si el flujo no puede completarse: acción de contingencia, mensaje al actor, estado que queda registrado}

> **Instrucciones (Funcional):** Numerar todos los pasos. Usar operadores de flujo estándar: SI/SINO para bifurcaciones, MIENTRAS para iteraciones, TIMEOUT cuando el proceso tiene restricción temporal. El penúltimo paso define el resultado exitoso del flujo. El último paso define el manejo de error o condición excepcional. Sub-pasos con letras (a, b, c) para detallar dentro de un paso numerado. Mínimo 5 pasos.

### Flujo de interacción — máquina de estados

> **Dominio primario:** Funcional · AF — refina: UX/UI · Developer

```
[estado-inicial] → {acción del actor}       → [estado-A]
  → {condición de éxito} → [estado-exitoso] → {resultado o redirección}
  → {condición de error}  → [estado-error]  → {mensaje + acción de recuperación}

[estado-error] → {acción de recuperación del actor} → [estado-inicial]
```

> **Instrucciones:** El AF esboza los estados de negocio significativos; UX/UI y Developer refinan los estados de interfaz y las transiciones técnicas. Estados en minúsculas con guiones. Transiciones describen la acción o condición que las dispara. Los estados de error incluyen la transición de recuperación. Omitir esta subsección si la funcionalidad no tiene flujo de estados discernible — indicar explícitamente "No aplica".

---

## 5. Integraciones y Dependencias Externas

> **Dominios:** Funcional · AF — Arquitectura (tipo técnico / ADR / contrato completo) — Developer (schemas / autenticación) — DevOps (SLA operacional / monitoreo)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Tabla de integraciones — Funcional (AF)

| Sistema | Tipo de integración | Dato intercambiado | SLA esperado | Equipo dueño | Comportamiento ante indisponibilidad |
|---|---|---|---|---|---|
| {Sistema externo 1} | {REST / gRPC / evento / batch / etc.} | {Dato que entra} / {Dato que sale} | {SLA esperado} | {Equipo dueño} | {Acción concreta ante indisponibilidad} |
| {Sistema externo 2} | {Tipo} | {Dato} | {SLA} | {Equipo} | {Comportamiento} |

### Especificación de integración técnica

> **Responsabilidades:** campos marcados `[AF]` — los completa el AF con lo que conoce del negocio. Campos marcados `[Arquitecto/Developer]` — los completan el Arquitecto y el Developer durante Diseñar/Construir.
> *(Referencia opcional — si el contenido técnico es extenso, los campos `[Arquitecto/Developer]` pueden reemplazarse por una referencia al documento donde el experto lo documentó — puede ser un ADR, un contrato OpenAPI, un archivo técnico separado u otro:*
> *`📄 <ruta/al/archivo>` — <descripción breve de qué contiene>)*

**[AF] Endpoint:** `{METHOD} /{versión}/{recurso}`
**[Arquitecto/Developer] Mock:** `{http://localhost:PORT/api/{ruta}}` · Header: `X-Mock: true` · Latencia simulada: `{N ms}`
**[Arquitecto/Developer] Prod:** `{https://api.{dominio}/{versión}/{ruta}}`

**[Arquitecto/Developer] Headers de request:**
```http
Content-Type: application/json
X-Request-Id: <uuid v4>
Authorization: {esquema de autenticación — Arquitecto/Developer define}
```

**[AF] Request body — campos del negocio:**
```json
{
  "{campo1}": "{tipo: string / number / boolean — descripción de negocio}",
  "{campo2}": "{tipo}"
}
```

**[Arquitecto/Developer] Response {STATUS} — {Nombre del caso exitoso}:**
```json
{
  "{campo}": "{tipo o valor de ejemplo}"
}
```

**[AF / Arquitecto/Developer] Tabla de errores:**

> El AF completa la columna **Acción en UI / proceso** (comportamiento visible al usuario). El Arquitecto/Developer confirma o ajusta los códigos HTTP, el código de error y la descripción técnica según el contrato real del backend.

| Status | Código de error | Descripción | Acción en UI / proceso |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload malformado o campo inválido | {AF — qué muestra o hace la UI ante este error} |
| 401 | `UNAUTHORIZED` | Autenticación requerida o credenciales inválidas | {AF — qué muestra o hace la UI ante este error} |
| 403 | `FORBIDDEN` | Sin permisos para esta operación | {AF — qué muestra o hace la UI ante este error} |
| 409 | `CONFLICT` | Conflicto con el estado actual del recurso | {AF — qué muestra o hace la UI ante este error} |
| 429 | `TOO_MANY_REQUESTS` | Límite de intentos excedido · Header `Retry-After: {N}` | {AF — qué muestra o hace la UI ante este error} |
| 5xx | `SERVICE_UNAVAILABLE` | Sistema temporalmente no disponible | {AF — qué muestra o hace la UI ante este error} |

> Eliminar las filas que no apliquen. Agregar filas adicionales según el contrato real. Arquitecto/Developer confirma que los códigos HTTP y de error coinciden exactamente con lo que devuelve el backend.

### Datos especiales para forzar errores

> **Responsabilidades:** `[AF]` — define los escenarios de negocio que el mock debe poder simular. `[Arquitecto/Developer]` — el Developer define los valores exactos de entrada y la respuesta técnica del mock.

**[AF] Escenarios requeridos en el mock:**

| Escenario de negocio | Tipo |
|---|---|
| {descripción del escenario — ej. "usuario bloqueado por intentos fallidos"} | {Error / Éxito / Edge case} |
| {descripción del escenario — ej. "servicio temporalmente no disponible"} | {Error / Éxito / Edge case} |

**[Arquitecto/Developer] Valores del mock:**

- `{campo: valor}` → `{STATUS CODE}` `{CÓDIGO_ERROR}` ({detalle técnico relevante — ej. `retry-after: N`})
- `{campo: valor}` + `{campo2: valor2}` → `{STATUS CODE}` `{CÓDIGO_ERROR}`
- {condición de contexto — ej. "cookie de sesión ya presente"} → {comportamiento — ej. redirección a `/{ruta}` sin invocar endpoint}

> **Instrucciones (Funcional):** Registrar todos los escenarios que deben poder reproducirse en ambiente de desarrollo y QA sin depender del backend real. Incluir al menos: el caso exitoso con credenciales de prueba, cada error de negocio de la tabla anterior, y los edge cases del flujo. El Developer completa los valores técnicos exactos durante Construir.

### Decisiones de integración técnica — Arquitectura

> Incluir: tipo de integración técnica (REST/gRPC/mensajería/eventos), patrones de integración aplicados, ADR relacionado si existe.

### SLA operacional y monitoreo — DevOps

> Incluir: SLA operacional por integración, métricas de monitoreo, alertas configuradas, runbook ante falla.

> **Instrucciones (Funcional):** Registrar cada sistema externo con el que la funcionalidad intercambia datos — APIs, servicios, colas, DBs externas. Las subsecciones Arquitectura y DevOps son complementarias al contrato: el contrato define qué se intercambia, Arquitectura define cómo y por qué, DevOps define cómo se opera.

---

## 6. Reglas de Negocio

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

| ID | Tipo | Regla | Impacto en implementación |
|---|---|---|---|
| RN-001 | `[CORE]` | {Regla fundamental — invariante del negocio que nunca puede violarse.} | {Consecuencia técnica: qué componente la enforza, en qué capa y bajo qué condición se valida} |
| RN-002 | `[CORE]` | {Regla fundamental — comportamiento obligatorio de la funcionalidad.} | {Consecuencia técnica concreta} |
| RN-003 | `[CORE]` | {Regla fundamental — restricción que aplica siempre, sin excepciones.} | {Consecuencia técnica concreta} |
| RN-004 | `[EDGE]` | {Caso especial — comportamiento en condición atípica o límite del dominio.} | {Manejo del edge case: frontend / backend / ambos} |
| RN-005 | `[EDGE]` | {Caso especial — excepción conocida a la regla general.} | {Manejo del edge case: frontend / backend / ambos} |

> **Instrucciones (Funcional):** `[CORE]` = reglas que siempre aplican, cuya violación invalida el resultado. `[EDGE]` = comportamientos en casos límite o excepciones. La columna "Impacto en implementación" indica dónde y cómo se enforza la regla (frontend / backend / DB constraint / ambos). Toda regla debe ser verificable. Mínimo 3 reglas CORE y 1 EDGE. Redactar en presente indicativo afirmativo o negativo.

---

## 7. Requerimientos No Funcionales

> **Dominios:** Funcional · AF — Arquitectura (escalabilidad / capacidad) — QA (cobertura / performance testing) — DevOps (SLOs / observabilidad)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### RNFs de negocio — Funcional (AF)

- **Tiempo de respuesta:** Respuesta disponible en menos de {N} segundos para {condición de volumen estándar}.
- **Disponibilidad:** {Disponibilidad requerida por el proceso de negocio — ej. "durante horario laboral" o "24/7"}.
- **Volumen:** {Descripción del patrón de uso: invocaciones individuales / batch / sesión continua — frecuencia y pico estimado}.
- **Retención de datos:** {Qué persiste el AF, dónde y por cuánto tiempo. Qué no se almacena en la funcionalidad}.
- **Seguridad:** Sin credenciales hardcodeadas. Datos sensibles del cliente no expuestos en artefactos versionados. {Consideraciones adicionales de confidencialidad del input/output}.

### RNFs de arquitectura — Arquitectura

> Incluir: escalabilidad, patrones de capacidad, trade-offs técnicos, restricciones de diseño.

### RNFs de calidad — QA

> Incluir: cobertura mínima requerida (%), criterios de performance testing, herramientas de prueba.

### RNFs operacionales — DevOps

> Incluir: SLOs operacionales, métricas de observabilidad, pipeline CI/CD requerido, alertas.

> **Instrucciones (Funcional):** Los cinco RNFs de negocio son obligatorios en todas las SPECs. El tiempo de respuesta debe incluir la condición de volumen estándar. La seguridad debe mencionar explícitamente la gestión de credenciales y datos sensibles.

---

## 8. Experiencia del Usuario — Vista Funcional

> **Dominios:** Funcional · AF — UX/UI (componentes / accesibilidad / prototipo real)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Mensajes al usuario — Funcional (AF)

| Estado / Evento | Mensaje en lenguaje de negocio |
|---|---|
| {Estado 1 — resultado exitoso} | {Mensaje que el AF ve. Sin jerga técnica. Incluye datos clave del resultado.} |
| {Estado 2 — resultado condicional} | {Mensaje con advertencia o acción requerida.} |
| {Estado de error o timeout} | {Mensaje de error con acción de contingencia.} |

### Datos requeridos por estado — Funcional (AF)

| Paso del flujo | Actor | Datos que debe ver para decidir |
|---|---|---|
| Antes de invocar | AF | {Qué inputs debe tener listos el AF para invocar la funcionalidad correctamente} |
| Al recibir {Estado 1} | {Actor} | {Qué campos del output necesita ver para tomar su decisión} |
| Al recibir {Estado 2} | {Actor} | {Qué campos del output necesita ver para tomar su decisión} |

**Prototipo de referencia (Funcional):** No aplica — herramienta CLI/API sin interfaz visual. / {Referencia al mockup si existe}

> **Instrucciones (Funcional):** Esta sección define el QUÉ mostrar (responsabilidad del AF), no el CÓMO mostrarlo (responsabilidad del UX/UI Designer). Los mensajes deben ser comprensibles por un usuario de negocio sin acceso al código. Las subsecciones DOR y de interfaz UX/UI son artefactos de proceso y diseño — el DVF no las humaniza.

### Especificación de interfaz — UX/UI

> Completar una entrada por cada componente relevante para esta funcionalidad. Omitir componentes heredados sin cambios. Si el dominio UX/UI está marcado como Aplica = No en el Mapa de dominios (Sección 0), reemplazar esta subsección por "No aplica — [motivo documentado en el Mapa de dominios]".
> *(Referencia opcional — si la especificación de interfaz es extensa, puede reemplazarse por una referencia al documento donde el experto la documentó — puede ser un archivo de diseño, guía de componentes, Figma exportado u otro:*
> *`📄 <ruta/al/archivo>` — <descripción breve de qué contiene>)*

**Prerequisitos de inicio UI:**
- [ ] Wireframe mid-fi aprobado
- [ ] User flow mapeado
- [ ] Investigación de usuarios disponible
- [ ] Arquetipos validados

> Si ninguno aplica — UI opera en autonomía alta y toma decisiones de diseño sin esperar artefactos UX.

| Configuración UI | Valor |
|---|---|
| Design tokens ref | {`src/styles/theme.css` — ruta al archivo de tokens · o "No existe — el agente UI creará el sistema desde el brand-guide"} |
| audience_mode | {`Product` — dashboards, formularios, herramientas internas, flujos transaccionales · `Brand` — onboarding, landing pages, comunicación institucional} |
| DESIGN_VARIANCE | {1–10 — `Product` recomendado: 2–5 · `Brand` recomendado: 6–9} |

#### {NombreComponente} — {tipo: form / input / button / container / modal / etc.}

| Atributo | Valor |
|---|---|
| Tipo | {form / input / button / container / etc.} |
| Variante Figma | {Nombre de la variante o descripción del frame} |
| Node-ID Figma | `{X:Y}` |

**Props:**

| Prop | Tipo TS | Requerido | Descripción |
|---|---|---|---|
| {propName} | {string / boolean / () => void} | {sí / no} | {Qué controla este prop} |

**Estados visuales:**

| Estado | Descripción | Token de color / estilo | Trigger |
|---|---|---|---|
| default | {Apariencia en reposo} | `{--token-nombre}` ({valor hex}) | Render inicial |
| focus | {Apariencia al recibir foco} | `{--token-nombre}` ({valor hex}) | onFocus |
| error | {Apariencia con error de validación} | `{--token-nombre}` ({valor hex}) | {Evento que dispara el estado de error} |
| disabled | {Apariencia deshabilitada} | `{--token-nombre}` ({valor hex}) | {prop / condición que lo activa} |

**Accesibilidad WCAG:**
- `aria-label`: `"{texto descriptivo del elemento}"`
- `aria-invalid`: `true cuando hay error de validación`
- `aria-describedby`: `{id del helper text de error}`
- `role`: `{alert / dialog / listbox / etc. — si aplica}`
- `type`: `{email / password / tel / etc. — si es input}`
- `autocomplete`: `{username / current-password / etc. — si aplica}`

**Comportamiento responsive:**
- `< 768px` (móvil): {descripción del comportamiento}
- `≥ 768px` (desktop): {descripción del comportamiento}

**Prototipo de referencia:** {URL Figma del frame o componente — o "No aplica"}

> **Instrucciones (UX/UI):** Duplicar el bloque `#### {NombreComponente}` por cada componente adicional.

---

## 9. Validaciones de Campos

> **Dominios:** Funcional · AF — Developer (tipo HTML / longitud / rango / regex / backend / eventos) — UX/UI (posicionamiento y comportamiento visual de mensajes)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Reglas de validación — Funcional (AF)

> **Ejemplo de fila completa** _(eliminar al entregar)_:
> | Campo | Obligatorio | Regla de negocio | Mensaje de error al usuario |
> |---|---|---|---|
> | email | Sí | Debe tener formato de correo electrónico válido (contiene `@` y un dominio) | "El correo ingresado no tiene un formato válido (ej. nombre@dominio.com)" |
> | contraseña | Sí | Debe tener entre 8 y 64 caracteres | "Sin mensaje inline — se muestra mensaje genérico al enviar el formulario" |

| Campo | Obligatorio | Regla de negocio | Mensaje de error al usuario |
|---|---|---|---|
| {nombre del campo 1} | {Sí / No} | {Regla en lenguaje de negocio — ej. "debe ser un correo electrónico con formato válido"} | {Mensaje exacto que ve el usuario — sin jerga técnica} |
| {nombre del campo 2} | {Sí / No} | {Regla de negocio} | {Mensaje de error — o "Sin mensaje inline; mensaje genérico al enviar"} |

### Especificación técnica de validaciones — Developer

> Incluir: tipo HTML del input, longitud mínima y máxima en caracteres, rango numérico o valores permitidos (enum), validación frontend (regex / regla técnica), validación backend (método + capa), evento que dispara cada validación.

> **Ejemplo de fila completa** — mismos campos que la tabla AF _(eliminar al entregar)_:
> | Campo | Tipo HTML | Longitud (min–máx) | Rango / Valores permitidos | Validación Frontend | Validación Backend | Evento de trigger |
> |---|---|---|---|---|---|---|
> | email | email | 5–254 | N/A | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | misma regex + verificación de unicidad en DB (capa repositorio) | onBlur |
> | contraseña | password | 8–64 | N/A | `^.{8,64}$` | mismo rango en capa de dominio | onBlur |

| Campo | Tipo HTML | Longitud (min–máx) | Rango / Valores permitidos | Validación Frontend | Validación Backend | Evento de trigger |
|---|---|---|---|---|---|---|
| {nombre del campo 1} | {email / text / password / number / etc.} | {ej. 5–254 · N/A si no aplica} | {ej. N/A · 1–999 · activo\|inactivo\|suspendido} | {Regex o regla técnica — ej. `^[^\s@]+@[^\s@]+\.[^\s@]+$`} | {Método + capa — ej. "misma regex + verificación contra DB"} | {onBlur / onChange / onSubmit} |
| {nombre del campo 2} | {tipo} | {min–máx} | {rango o valores} | {Regla técnica} | {Método backend} | {Evento} |

### Comportamiento de mensajes — UX/UI

> Incluir: posicionamiento de mensajes de error (inline bajo campo / toast / banner), momento de aparición y desaparición, comportamiento en mobile, estado visual del campo con error.

### Tratamiento visual de errores HTTP — UX/UI

> **Fuente de verdad de códigos HTTP y de error: §5 (Tabla de errores).** Esta tabla no los redefine — extiende cada fila de §5 con la respuesta visual que experimenta el usuario. Si el Arquitecto/Developer modifica un código en §5, actualizar aquí también para mantener consistencia.
> El UX/UI define únicamente la columna "Acción visible en la interfaz".

| Status HTTP | Código de error | Acción visible en la interfaz |
|---|---|---|
| 400 | `VALIDATION_ERROR` | {Mensaje inline bajo el campo afectado con borde rojo. Foco regresa al primer campo con error.} |
| 401 | `UNAUTHORIZED` | {Redirect a `/login`. Toast o banner con mensaje visible al usuario.} |
| 403 | `FORBIDDEN` | {Mensaje de acceso denegado — modal o inline según contexto.} |
| 409 | `CONFLICT` | {Toast de error. El formulario permanece abierto con opción de reintentar.} |
| 429 | `TOO_MANY_REQUESTS` | {Mensaje con tiempo de espera. Input deshabilitado durante el período Retry-After.} |
| 5xx | `SERVICE_UNAVAILABLE` | {Estado de error con botón "Reintentar". No cerrar el formulario.} |

> Eliminar las filas que no apliquen. Agregar filas para errores de negocio específicos del contrato definido en §5.

### Escenarios de mock para prototipo — UX/UI

> Escenarios que el prototipo Figma debe poder simular en sesiones de validación con stakeholders. Mínimo 1 por tipo: happy path, error, edge case.

| Nombre del escenario | Tipo | Datos de mock | Comportamiento esperado |
|---|---|---|---|
| {descripción del caso exitoso} | Happy path | {datos de entrada representativos} | {qué ocurre visualmente al completarse — ej. formulario se limpia, toast verde} |
| {descripción del error de negocio} | Error | {datos que fuerzan el error} | {qué muestra la interfaz: toast, modal, mensaje inline} |
| {descripción del edge case} | Edge case | {condición límite — ej. sin conexión, timeout} | {comportamiento visual ante la condición límite} |

> **Instrucciones (Funcional):** Esta sección especifica el comportamiento de cada campo con restricciones de entrada desde tres perspectivas complementarias sobre la misma lista de campos: **AF** define la regla en lenguaje de negocio y el mensaje visible al usuario; **Developer** define los constraints técnicos (tipo HTML, longitud, rango de valores, regex y capa de validación); **UX/UI** define el comportamiento visual del error. — La columna "Regla de negocio" no usa regex ni tipos técnicos — describe la restricción en lenguaje de usuario. — El mensaje de error debe ser el texto exacto que verá el usuario. — "Longitud (min–máx)": en caracteres; usar N/A si el campo no tiene restricción de longitud. — "Rango / Valores permitidos": para campos numéricos indica el rango (ej. 1–999); para enums lista los valores exactos separados por `|`; para campos sin restricción usar N/A. — Si un campo no muestra mensaje inline, indicarlo explícitamente.

---

## 10. Criterios de Aceptación

> **Dominios:** Funcional · AF — QA (escenarios adicionales de regresión, performance y seguridad)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Escenarios base — Funcional (AF)

```gherkin
Feature: {Nombre de la funcionalidad en lenguaje de negocio}

  Scenario: Happy path — {descripción del caso exitoso principal}
    Given {precondición — estado del sistema o datos de entrada}
    And {precondición adicional si aplica}
    When {acción que dispara el flujo}
    Then {resultado observable esperado}
    And {resultado adicional verificable}

  Scenario: Negativo — {descripción del caso de fallo o rechazo}
    Given {precondición que genera el caso negativo}
    And {precondición adicional si aplica}
    When {acción que dispara el flujo}
    Then {resultado observable esperado en el caso negativo}
    And {campo o estado específico del resultado negativo}

  Scenario: Edge case operativo — {descripción del caso límite técnico}
    Given {precondición del caso límite}
    When {acción que dispara el flujo}
    Then {resultado esperado para el caso límite}
    And {verificación adicional}

  Scenario: Edge case regulatorio — {descripción del caso con implicación regulatoria}
    Given {precondición regulatoria o contractual}
    When {acción que activa la regla [EDGE] de Sección 6}
    Then {resultado esperado con cumplimiento de la regla especial}
    And {verificación de cumplimiento}

  Scenario: Seguridad — {descripción del intento de acceso no autorizado o manipulación de datos}
    Given {actor sin permiso / con token inválido / intentando acceder a un recurso ajeno}
    When {intenta ejecutar la acción del flujo}
    Then {el sistema rechaza la operación con código 401 o 403 según corresponda}
    And {ningún dato sensible es expuesto en el cuerpo de la respuesta de error}
```

### Escenarios adicionales — QA

> Incluir: escenarios de regresión, performance, seguridad y cualquier caso borde no cubierto por los 4 escenarios base.

### Criterios de cobertura — QA

> Incluir: cobertura mínima requerida (%), herramientas y ambientes de prueba.

> **Instrucciones (Funcional):** Mínimo 5 escenarios base obligatorios con sus tipos específicos: happy path, negativo, edge operativo, edge regulatorio, seguridad. Cada escenario debe corresponder a una regla [CORE] o [EDGE] de la Sección 6, o a controles de la Sección 11 (el edge regulatorio siempre a un [EDGE]; el de seguridad verifica los controles de §11). Los Then deben ser verificables por un analista sin acceso al código.

### Criterios de done — AF / QA

> Checklist de condiciones que confirman que la funcionalidad está completa y lista para sign-off. El QA Engineer y el AF validan en conjunto antes de cerrar el ciclo.

- [ ] Todos los escenarios Gherkin base tienen resultado Pass en el ambiente de QA (happy path, negativo, edge operativo, edge regulatorio)
- [ ] Reglas de negocio `[CORE]` verificadas sin excepciones no documentadas
- [ ] Estados de error (4xx / 5xx) probados con los datos especiales del mock
- [ ] Criterios de accesibilidad WCAG verificados (contraste AA, navegación por teclado, aria-labels) _(omitir si UX/UI = No aplica)_
- [ ] Comportamiento responsive validado en móvil y desktop _(omitir si UX/UI = No aplica)_
- [ ] Manejo de sesión / token / cookie verificado según RNFs de seguridad _(omitir si Seguridad = No aplica)_
- [ ] Ítems PENDIENTE de Sección 14 cerrados; ítems DIFERIDOS listados por ID (GAP-NNN) con justificación documentada
- [ ] CRs registrados en § 15 verificados e incorporados en la implementación _(omitir si la tabla de CRs en § 15 está vacía)_
- [ ] {Criterio adicional específico de la funcionalidad — si aplica}

> **Instrucciones:** Marcar cada ítem [x] durante la sesión de QA. Ítems sin marcar requieren un GAP registrado en Sección 13 con owner y fecha comprometida. Los ítems con `_(omitir si...)_` se tachan o anotan N/A cuando la condición no aplica. No emitir sign-off con ítems sin justificar.

---

## 11. Seguridad

> **Dominios:** Seguridad · Arquitectura · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}
> **Aplica:** **Sí** _(default — toda funcionalidad que toque auth, datos o integraciones tiene superficie de seguridad)_ | No — **requiere sign-off explícito del Experto de Seguridad** (no del AF): {motivo — razón explícita y verificable}
>
> *(Referencia opcional — si el análisis de seguridad es extenso, las subsecciones técnicas pueden reemplazarse por una referencia al documento donde el experto lo documentó — puede ser un informe de seguridad, un ADR, una evaluación de riesgos u otro:*
> *`📄 <ruta/al/archivo>` — <descripción breve de qué contiene>)*

### Autenticación y autorización

| Aspecto | Definición |
|---|---|
| Mecanismo de autenticación | {JWT / OAuth2 / API Key / sesión / otro} |
| Modelo de autorización | {RBAC / ABAC / ACL / otro} |
| Punto de enforcement | {Gateway / Middleware / Por-endpoint / Row-level security — dónde se enforza la autorización en la arquitectura del sistema} |
| Principio deny-by-default | {Sí — toda acción denegada salvo permiso explícito · No — justificación obligatoria del Experto de Seguridad} |
| Actores con acceso (ref. §2) | {Actor → nivel de acceso sobre este flujo} |
| Restricciones de acceso | {Qué no puede hacer ningún actor en este flujo — pensar en el espacio negativo del permiso} |

### Gestión de secretos

| Aspecto | Definición |
|---|---|
| Ubicación de credenciales / keys / tokens | {Vault / Azure KeyVault / AWS Secrets Manager / Variable de entorno en pipeline — **nunca hardcodeados, nunca en el repositorio versionado**} |
| Política de rotación | {Frecuencia y mecanismo — ej. "cada 90 días, rotación automática via KeyVault" · o "Manual — justificación"} |
| Verificación de no-hardcoding | {Herramienta o control en CI — ej. "git-secrets en pre-commit + scan de secretos en pipeline"} |

### Ciclo de vida de sesión / token

| Aspecto | Definición |
|---|---|
| Almacenamiento del token en cliente | {`httpOnly` cookie _(recomendado)_ / `localStorage` ⚠ _(riesgo XSS directo — requiere justificación)_ / `sessionStorage` / otro} |
| Expiración idle | {Tiempo de inactividad antes de invalidar la sesión — ej. "30 minutos sin actividad"} |
| Expiración absoluta | {Tiempo máximo de vida del token sin importar actividad — ej. "8 horas"} |
| Revocación / logout | {Mecanismo de invalidación del token al cerrar sesión — ej. "blacklist en Redis" · "rotación de signing key" · "short-lived tokens — justificación"} |
| Claims validados | {Claims verificados en cada request: firma, `exp`, `aud`, `iss` — quién los verifica y en qué capa} |

### Datos sensibles y cifrado

| Dato | Clasificación | Cifrado en tránsito | Cifrado en reposo | Enmascaramiento / tokenización | Controles obligatorios que dispara esta clasificación |
|---|---|---|---|---|---|
| {nombre del dato} | {PII / PHI / financiero / público} | {Sí / No / N/A} | {Sí / No / N/A} | {Sí — método / No} | {PHI → cifrado en reposo + acceso auditado + tope de retención enforzado · PII → minimización + consentimiento + derecho de borrado · financiero → PCI-DSS + tokenización · público → N/A} |

### Logging seguro

| Aspecto | Definición |
|---|---|
| Qué **NO** se debe loguear | {Lista específica para este flujo: passwords, tokens, PAN completo, PHI, PII identificable — ej. "número de documento, número de tarjeta, contraseña en claro"} |
| Eventos de seguridad que **SÍ** se loguean | {Lista específica: login fallido, denegación de autorización, acceso a dato sensible, cambio de permisos, exportación de datos — con actor y timestamp} |
| Quién puede leer el audit log de seguridad | {Rol / equipo con acceso — separado del log general de aplicación} |

### Casos de abuso / amenazas por funcionalidad

| Escenario de abuso | Tipo de amenaza | Control de mitigación |
|---|---|---|
| {¿Cómo se ataca esta funcionalidad concreta? — ej. "atacante manipula el ID en la URL para acceder a datos de otro usuario"} | {IDOR / Fuerza bruta / Inyección / Privilege escalation / SSRF / Replay / Otro} | {Control concreto — ej. "validar en backend que el recurso solicitado pertenece al actor autenticado antes de devolver datos"} |

### Seguridad de integraciones salientes

> Completar por cada sistema externo al que llama esta funcionalidad (ref. tabla de integraciones en §5).

| Sistema externo | Autenticación de salida | Verificación TLS | Datos PII / sensibles que salen | Acuerdo de procesamiento (DPA) | Riesgo SSRF |
|---|---|---|---|---|---|
| {nombre del sistema — ref. §5} | {Mecanismo de autenticación saliente + dónde viven esas credenciales} | {Certificado verificado: Sí / No — si No, justificar} | {Qué datos PII o sensibles se envían a este sistema} | {DPA firmado / En trámite / No aplica} | {¿La URL destino puede ser manipulada por el actor? Sí — mitigación obligatoria / No} |

### Privacidad y derechos del titular de datos

> Completar solo si la funcionalidad procesa PII, PHI o datos regulados (GDPR, Ley 1581 / Habeas Data, HIPAA u otra regulación aplicable). Si no aplica, indicar "No aplica — [motivo]".

| Aspecto | Definición |
|---|---|
| Minimización de datos | {¿Se recopila solo lo estrictamente necesario para el propósito declarado? — indicar datos que se decidió no recopilar} |
| Limitación de propósito | {¿Los datos se usan solo para el propósito por el que fueron recopilados? — usos secundarios previstos y su base legal} |
| Retención enforzada | {Mecanismo técnico que elimina o anonimiza los datos al vencer el período — ref. §13 columna "Retención requerida"} |
| Base legal / consentimiento | {Consentimiento explícito / Interés legítimo / Obligación contractual / Obligación legal — base legal específica} |
| Derecho de borrado | {¿Se implementa? Sí — mecanismo técnico / No — justificación legal explícita} |

### Compliance y regulaciones aplicables

| Normativa | Controles requeridos | Evidencias esperadas |
|---|---|---|
| {GDPR / HIPAA / PCI-DSS / SOC 2 / Ley 1581 / regulación local / otro} | {Controles concretos que aplica} | {Evidencias que deben existir para auditoría} |

### Controles OWASP Top 10 (2021)

| # | Categoría OWASP | Aplica | Nivel de riesgo | Control implementado / requerido |
|---|---|---|---|---|
| A01 | Broken Access Control | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control — o "No aplica: [motivo]"} |
| A02 | Cryptographic Failures | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A03 | Injection | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A04 | Insecure Design | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A05 | Security Misconfiguration | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A06 | Vulnerable and Outdated Components | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A07 | Identification and Authentication Failures | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A08 | Software and Data Integrity Failures | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A09 | Security Logging and Monitoring Failures | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |
| A10 | Server-Side Request Forgery (SSRF) | {Sí / No} | {Alto / Medio / Bajo / N/A} | {Control} |

> **Instrucciones:** El AF: (1) no puede marcar "Aplica = No" unilateralmente — requiere sign-off del Experto de Seguridad; (2) aporta la clasificación inicial de datos en **Datos sensibles y cifrado**; (3) describe actores y restricciones en **Autenticación y autorización**; (4) completa **Privacidad y derechos del titular** si hay PII. El Experto de Seguridad completa el resto. Toda categoría OWASP con "Aplica = No" requiere motivo explícito en la columna "Control". Si Aplica = Sí, todas las subsecciones deben completarse antes del gate DOR.

---

## 12. Dominio de Datos

> **Dominios:** AF — el Arquitecto completa campos puntuales dentro de Restricciones y Fuentes
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}
> **Aplica:** {Sí — completar sección} | {No — Motivo obligatorio: {razón explícita y verificable de por qué esta funcionalidad no gestiona datos propios}}
>
> *(Referencia opcional — si existe documentación técnica de datos que complementa lo capturado por el AF (modelo de datos, ADR de datos, catálogo, contrato técnico), referenciarla aquí:*
> *`📄 <ruta/al/archivo>` — <descripción breve de qué contiene>)*

### Contexto del proyecto de datos

> **Dominio:** Funcional · AF

| Campo | Descripción |
|---|---|
| Tipo de proyecto de datos | {Migración / modernización · Plataforma de datos completa (greenfield) · Componente de integración dentro de un sistema mayor · Otro} |
| Problema de negocio | {Descripción del problema que este proyecto de datos resuelve} |
| Fuera del alcance | {Qué fuentes, entidades o procesos de datos quedan explícitamente excluidos} |
| Complejidad estimada | {Alta · Media · Baja — breve justificación} |
| Equipo Smart Data | {Nombres y roles del equipo de datos asignado} |

### Stakeholders del dominio de datos

> **Dominio:** Funcional · AF

| Nombre | Cargo | Rol de datos | Equipo | Poder de decisión | Contacto | Notas |
|---|---|---|---|---|---|---|
| {Nombre completo} | {Cargo en la organización} | {Data Owner · Data Steward · Data Consumer · Sponsor · IT/Infraestructura · Compliance/Legal · Otro} | {Equipo o área} | {Alto · Medio · Bajo} | {email o canal} | {observaciones relevantes} |

### Restricciones de datos

> **Dominio:** Funcional · AF — el campo Impacto en arquitectura lo completa el Arquitecto

| Descripción | Tipo | Dureza | Origen | Impacto en arquitectura | Vigencia |
|---|---|---|---|---|---|
| {Descripción de la restricción} | {Técnica · Regulatoria · Contractual · Organizacional · Presupuesto · Tiempo · Alcance} | {Dura — no negociable · Semi-dura — negociable con costo · Blanda — preferencia} | {Quién o qué impone esta restricción} | {Cómo afecta el diseño técnico — lo completa el Arquitecto} | {Hasta cuándo aplica — o "Permanente"} |

### Fuentes de datos

> **Dominio:** Funcional · AF — los campos Owner técnico y SLA origen los completa el Arquitecto

| Nombre fuente | Sistema origen | Tipo | Volumen aprox | Formato | Calidad conocida | Owner técnico | SLA origen |
|---|---|---|---|---|---|---|---|
| {Nombre de la fuente} | {Sistema de donde provienen los datos} | {Transaccional · Maestro · Evento · Referencia · Externo} | {Registros/día o GB estimados} | {CSV · JSON · Parquet · API · DB · Otro} | {Problemas de calidad conocidos — o "Sin problemas documentados"} | {Equipo responsable del sistema origen} | {SLA del sistema origen} |

> **Instrucciones:** El AF completa las 4 subsecciones (Contexto, Stakeholders, Restricciones y Fuentes). El Arquitecto completa los campos de su dominio dentro de Restricciones y Fuentes. Si Aplica = No, documentar el motivo obligatoriamente — "no aplica" sin motivo no es suficiente.

---

## 13. Controles y Auditoría

> **Esta sección no audita el documento SPEC.** Define los eventos de negocio que el sistema debe registrar cuando la funcionalidad se ejecuta en producción: qué ocurrió, quién lo ejecutó, qué datos quedaron comprometidos y por cuánto tiempo deben conservarse. Es el registro de auditoría del proceso de negocio en tiempo de ejecución.

> **Dominios:** Funcional · AF — Arquitectura (compliance / trazabilidad regulatoria)
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Eventos de negocio — Funcional (AF)

| Evento | Actor | Dato registrado | Propósito de auditoría | Retención requerida | Contiene datos sensibles |
|---|---|---|---|---|---|
| {Evento de inicio} | {Rol que ejecuta la acción — ej. Asegurado · Broker · Sistema} | Timestamp, {datos de contexto del inicio} | Trazabilidad del proceso | {N años / meses — o "Política general de retención"} | {Sí — {indicar qué dato sensible} · No} |
| {Evento de resultado principal} | {Actor} | {Campos del output relevantes para auditoría}, timestamp | {Propósito de control o cumplimiento} | {Retención} | {Sí — {dato} · No} |
| {Evento de caso especial} | {Actor} | {Campos específicos del caso}, timestamp | {Propósito de seguimiento o escalamiento} | {Retención} | {Sí — {dato} · No} |
| {Evento de error o timeout} | {Actor / Sistema} | Timestamp, {estado del error}, {punto de interrupción} | Continuidad operacional | {Retención} | {Sí — {dato} · No} |

### Requisitos de compliance y auditoría regulatoria — Arquitectura

> Incluir: requisitos de compliance aplicables, trazabilidad regulatoria requerida, ADRs de seguridad o auditoría relacionados.

> **Instrucciones (Funcional):** Registrar los eventos significativos del flujo de negocio en producción — no cada paso interno de la SPEC. Mínimo 3 eventos: inicio, resultado principal y error/timeout. — **Evento**: nombre del hecho de negocio observable (no el nombre de la función o endpoint). — **Actor**: quién desencadena el evento (rol del sistema, no nombre de persona). — **Dato registrado**: campos suficientes para reconstruir qué pasó, cuándo y con qué inputs. — **Propósito de auditoría**: trazabilidad operacional / cumplimiento regulatorio / seguridad / BI — ser específico. — **Retención requerida**: tiempo que exige el negocio o la regulación conservar este registro. — **Contiene datos sensibles**: si el evento registra PII o datos regulados, indicar explícitamente cuáles — esto condiciona el diseño del sistema de auditoría (cifrado, acceso restringido).

---

## 14. Decisiones Requeridas y Gaps

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

| ID | Parámetro / Gap | Impacto | Opciones | Owner | Estado |
|---|---|---|---|---|---|
| GAP-001 | {Nombre del parámetro sin valor definido o gap detectado} | {Consecuencia concreta si no se resuelve antes de implementar} | A: {primera alternativa}. B: {segunda alternativa}. C: {tercera si aplica}. | {PO / UX / Seguridad / Negocio / SME} | PENDIENTE |

> Sin decisiones ni gaps — todos los parámetros están definidos. *(Reemplazar la tabla por esta línea cuando no hay pendientes.)*

---

## § 15 — Historial de Cambios Post-Aprobación

> **Cuándo usar esta sección:** Solo aplica cuando `Estado: APROBADA` (Sección 0).
> Antes de editar cualquier otra sección del documento, registrar el CR en la tabla de abajo.
> Si el historial está vacío, el documento no ha sido modificado desde su aprobación original.
>
> **Cómo versionar:** al cerrar el CR, incrementar el campo `Versión` en § 0 (1.0 → 1.1 → 1.2…).
>
> **Marcador inline:** en los elementos modificados del cuerpo, agregar al inicio:
> `> **[CR-NNN]** *Modificado AAAA-MM-DD. Ver § 15.*`
> Ejemplo en una regla de negocio:
> ```
> > **[CR-001]** *Modificado 2026-07-15. Ver § 15.*
>
> **RN-005 [CR-001]** {texto actualizado de la regla}
> ```

| CR | Versión resultante | Fecha | Sección(es) afectada(s) | Resumen del cambio | Origen | Aprobado por |
|---|---|---|---|---|---|---|
| — | — | — | — | Sin cambios post-aprobación | — | — |

---

## ◎ Registro de Implementación — sofka-asdd-developer

> **BA standalone:** en el flujo personal del Analista Funcional (capa BA, carpetas por nodo EDT),
> este Registro de Implementación vive en `{codigo}-index.md` del nodo, no aquí. El developer
> AI que trabaja sobre una spec BA standalone debe leer el `{codigo}-index.md` primero.

> **Instrucción para el developer AI:** Antes de escribir una línea de código, leer esta SPEC completa de principio a fin, sección por sección. Completar primero la tabla de contexto marcando cada sección como `LEÍDO`. Luego, a medida que se produce código, completar la tabla de implementación con el artefacto generado. Al cerrar el PR ninguna sección puede quedar en `PENDIENTE`.

### Secciones de contexto — leer y marcar LEÍDO

Estas secciones informan al developer pero no generan un artefacto de código directo.

| Sección | Nombre | Estado |
|---|---|---|
| 0 | Metadatos del documento | PENDIENTE |
| 1 | User Story | PENDIENTE |
| 3 | Trazabilidad | PENDIENTE |
| 14 | Decisiones Requeridas y Gaps | PENDIENTE |
| 15 | Historial de Cambios Post-Aprobación | PENDIENTE |

> Estados válidos: `PENDIENTE` · `LEÍDO` · `N/A` (indicar motivo). La § 15 puede marcarse `N/A` solo si `Estado` en § 0 es `BORRADOR` y la tabla de CRs está vacía.

**Versión SPEC al iniciar implementación:** `{anotar el valor del campo Versión en § 0}` — Si al retomar la implementación la versión en § 0 difiere de este valor, leer § 15 antes de continuar.

### Secciones de implementación — requieren artefacto de código

Cada sección debe tener un artefacto de código correspondiente antes de cerrar el PR.

| Sección | Nombre | Estado | Artefacto / Nota de implementación |
|---|---|---|---|
| 2 | Actores y Permisos | PENDIENTE | — |
| 4 | Flujo de Negocio | PENDIENTE | — |
| 5 | Integraciones y Dependencias Externas | PENDIENTE | — |
| 6 | Reglas de Negocio | PENDIENTE | — |
| 7 | Requerimientos No Funcionales | PENDIENTE | — |
| 8 | Experiencia del Usuario — Vista Funcional | PENDIENTE | — |
| 9 | Validaciones de Campos | PENDIENTE | — |
| 10 | Criterios de Aceptación | PENDIENTE | — |
| 11 | Seguridad | PENDIENTE | — |
| 12 | Dominio de Datos | PENDIENTE | — |
| 13 | Controles y Auditoría | PENDIENTE | — |

> Estados válidos: `PENDIENTE` · `LEÍDO` · `✓ IMPLEMENTADO` (con artefacto en la columna Artefacto) · `N/A` (indicar motivo).

> **Instrucciones (Funcional):** Registrar todo parámetro de negocio que el AF no puede definir solo y requiere confirmación del cliente o del SME del dominio, así como gaps funcionales o de diseño detectados durante el análisis o la construcción. El Estado evoluciona de PENDIENTE → EN DECISIÓN → CERRADO o DIFERIDO. Los ítems DIFERIDOS quedan referenciados por su ID (GAP-NNN) en los Criterios de done (Sección 10) — sin referencia explícita, el ítem DIFERIDO es invisible al cierre.
