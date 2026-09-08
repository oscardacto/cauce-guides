# Especificación Funcional — {feature}

<!-- Template del spec-funcional del modelo spec-per-área (ADR-004 §3.2).
Es la Single Source of Truth del contenido cross-área de un feature: User Story,
Actores (funcional), Flujo de Negocio, Reglas de Negocio, Trazabilidad, RNFs de
negocio, Gaps y CRs. Es un SLICE CANÓNICO de las secciones FUNCIONALES del
super-spec corporativo Sofka (spec-template.md) — mismos headings, placeholders y
redacción. Las secciones NO funcionales viven en los spec-{area} respectivos y se
referencian aquí por puntero. Ver spec-slice-rules.md para la tabla de proyección.

Este es el único archivo con Estado APROBADA / BORRADOR — los spec-{area} heredan
ese estado a través del INDEX. El AF es el único autor de este archivo (R-FUN-3). -->

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
| INDEX de implementación | {ruta al index activo: `{feature}-index.md` en ciclo del equipo · `{codigo}-index.md` en modo standalone AF — dejar placeholder si no aplica} |
| ui_required | {true / false} — se **deriva** del Mapa de dominios: `true` si UX o UI tienen `Aplica = Sí`; `false` en caso contrario. Consumido por el hook `design-guard` (gate WF-003) para exigir artefactos de diseño antes de construir la capa de presentación. No se fija a mano en contra del Mapa. |

> **Estado del artefacto** (este campo): BORRADOR → APROBADA CON OBSERVACIONES → APROBADA → RECHAZADA. Lo evoluciona el evaluador funcional al emitir veredicto.
> **Estado de dominio** (columna del Mapa): PENDIENTE → EN PROGRESO → COMPLETO (o N/A cuando Aplica = No). Lo evoluciona cada responsable de dominio. Son escalas independientes — no mezclarlas.

> **Agentes de dominio técnico:** si el campo `INDEX de implementación` contiene una ruta (no el placeholder), leer ese archivo como primera operación antes de escribir cualquier sección técnica (§5, §8–§13). Contiene el Mapa de dominios activo, el Gate DOR y el ◎ Registro de Implementación. Al finalizar, invocar skill `sofka-asdd-ba-spec-index` (operación `update-artifact`) para registrar el artefacto producido en la tabla del index.

### Mapa de dominios — estado de completitud

| Dominio | Aplica | Secciones que cubre | Responsable | Estado |
|---|---|---|---|---|
| Funcional | Sí | 1, 2, 3, 4, 6, 7 (RNFs de negocio), 14, 15 | AF | PENDIENTE |
| Arquitectura | {Sí / No} | 5 (tipo técnico / ADR / contrato completo), 7 (escalabilidad / capacidad), 11 (revisión), 13 (compliance / trazabilidad regulatoria) → `spec-backend` | Arquitecto | PENDIENTE |
| Developer | {Sí / No} | Capa servidor → `spec-backend` (5, 9 servidor, 13) · capa presentación → `spec-frontend` (4 UI, 8 wiring, 9 cliente) | Developer / Tech Lead | PENDIENTE |
| QA | {Sí / No} | 7 (cobertura / performance testing), 10 (escenarios adicionales + criterios de done) → `spec-qa` | QA Engineer | PENDIENTE |
| DevOps | {Sí / No} | 5 (SLA operacional / monitoreo), 7 (SLOs / observabilidad) → `spec-devops` | DevOps Engineer | PENDIENTE |
| UX | {Sí / No} | 2 (arquetipos / patrones de interacción), 4 (máquina de estados — refina), 8 (wireframes mid-fi, user flows, investigación) → `spec-diseno` | UX Designer | PENDIENTE |
| UI | {Sí / No} | 8 (componentes hi-fi, design tokens, WCAG audit, handoff), 9 (comportamiento visual de mensajes y errores) → `spec-diseno` | UI Designer | PENDIENTE |
| Seguridad | Sí _(default — opt-out requiere sign-off del Experto de Seguridad, no del AF)_ | 11 (íntegra — dueño único del contrato de seguridad), 13 (condicional a señal regulatoria) → `spec-seguridad` | Experto de Seguridad | PENDIENTE |
| Datos | {Sí / No} | 12 (contexto del proyecto, stakeholders, restricciones, fuentes) → `spec-data` | AF | PENDIENTE |

> La SPEC está completa cuando todos los dominios marcados como **Aplica: Sí** están en **COMPLETO** y el AF emite aprobación final.

> **Instrucciones:** La columna "Aplica" se define al iniciar la SPEC. Dominio Funcional siempre aplica. Los demás se marcan Sí / No según el alcance de la funcionalidad (ej. sin frontend → UX/UI = No; sin integraciones técnicas → Developer capa servidor = No). Los dominios con Aplica = No se marcan N/A en el INDEX. La columna "Secciones que cubre" indica en qué `spec-{area}` viven las secciones de ese dominio — el detalle del reparto está en `spec-slice-rules.md`.

> **BA standalone:** el Mapa de dominios y el Gate DOR viven en `{codigo}-index.md` — no en este archivo. `sofka-asdd-ba-specification-lead` solo copia la tabla de metadatos de §0.

### Gate de readiness — DOR

> Cada dominio responsable confirma que su aporte a la SPEC está completo y sin bloqueantes antes de activar la fase **Construir**. El AF coordina y no entrega la SPEC hasta que todos los dominios con **Aplica = Sí** en el Mapa de dominios estén marcados.

- [ ] **Funcional (AF)** — veredicto de evaluación APROBADA o APROBADA CON OBSERVACIONES con observaciones resueltas; Sección 14 sin ítems PENDIENTE
- [ ] **Arquitectura** — decisiones técnicas e integraciones definidas en `spec-backend §5`, ADRs emitidos si aplica _(omitir si Aplica = No)_
- [ ] **Developer** — contrato técnico completo en `spec-backend`, wiring y validación cliente en `spec-frontend` _(omitir la capa que no aplica)_
- [ ] **UX** — wireframes mid-fi aprobados, user flows mapeados y arquetipos validados en `spec-diseno` _(omitir si Aplica = No)_
- [ ] **UI** — componentes hi-fi, design tokens, WCAG audit y handoff disponibles en `spec-diseno` _(omitir si Aplica = No; requiere UX completado)_
- [ ] **QA** — estrategia de pruebas y escenarios adicionales definidos en `spec-qa` _(omitir si Aplica = No; también omitir si la estrategia QA se define en paralelo con construcción)_
- [ ] **DevOps** — SLOs, pipeline y observabilidad definidos en `spec-devops` _(omitir si Aplica = No)_
- [ ] **Seguridad** — análisis completo en `spec-seguridad §11`: autenticación y autorización, gestión de secretos, ciclo de sesión/token, datos sensibles y cifrado, logging seguro, casos de abuso, integraciones salientes, privacidad/GDPR (si aplica) y controles OWASP Top 10 _(opt-out requiere sign-off del Experto de Seguridad — el AF no puede marcarlo N/A unilateralmente)_
- [ ] **Datos** — contexto del proyecto, stakeholders, restricciones y fuentes definidos en `spec-data` _(omitir si Aplica = No)_

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

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### Actores del sistema — Funcional (AF)

| Actor | Rol | Permisos sobre este flujo |
|---|---|---|
| {Actor principal} | {Rol en el sistema} | {Qué puede hacer y qué no puede hacer sobre este flujo — permisos concretos y verificables} |
| {Actor secundario} | {Rol en el sistema} | {Qué puede hacer y qué no puede hacer sobre este flujo — permisos concretos y verificables} |

> **§2 Arquetipos de usuario y patrones de interacción (UX/UI) → ver `spec-diseno §2`.** El spec-funcional solo cubre los actores del sistema y la matriz de permisos AF; los arquetipos y patrones de interacción por rol viven en el slice de diseño.

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
| Downstream | Implementación distribuida en los `spec-{area}` del feature — ver INDEX (§0) para el estado por área |
| DVF asociado | No aplica — pendiente de evaluación. / `DVF-{1.X.Y}-{nombre} v{N}` — producido en la etapa de validación funcional post-aprobación |
| Estado en ciclo | {En especificación · En diseño · En construcción · En verificación · En producción · Retirado} |

> **Instrucciones (Funcional):** Esta sección establece la cadena de trazabilidad completa del spec: de dónde viene el requerimiento (upstream), a dónde fue (downstream) y en qué punto del ciclo se encuentra. — **EDT ref**: nodo `1.X.Y` del EDT que originó esta especificación; si no existe EDT formal, indicar el agrupador o módulo. — **Origen**: artefacto de negocio fuente (HU, brief, ticket, incidente u otro — no restringido). — **Fecha del artefacto fuente**: cuándo fue creado o aprobado ese artefacto en el ALM o sistema fuente. — **Fecha de registro de trazabilidad**: cuándo el AF formalizó el vínculo — la diferencia entre ambas fechas puede evidenciar demoras en la formalización. — **Última modificación**: actualizar cada vez que el spec cambie; el motivo en una línea hace el spec auto-explicativo sin necesidad de leer el historial de versiones. — **Downstream**: en el modelo spec-per-área, la implementación se rastrea por área a través del INDEX. — **DVF asociado**: completar con el ID `DVF-{1.X.Y}-{nombre} v{N}` una vez producido; antes dejar "No aplica — pendiente de evaluación". — **Estado en ciclo**: refleja en qué fase ASDD se encuentra este spec actualmente — actualizar junto con la Última modificación.

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

### Flujo de interacción — máquina de estados (diagrama base + transiciones funcionales)

> **Dominio primario:** Funcional · AF

```
[estado-inicial] → {acción del actor}       → [estado-A]
  → {condición de éxito} → [estado-exitoso] → {resultado o redirección}
  → {condición de error}  → [estado-error]  → {mensaje + acción de recuperación}

[estado-error] → {acción de recuperación del actor} → [estado-inicial]
```

> **§4 Refinamiento de la máquina de estados:** la subsección UX/UI (intención visual y transiciones desde la perspectiva del usuario) → ver `spec-diseno §4`. La subsección Developer capa presentación (implementación de estado UI, routers, transiciones en código) → ver `spec-frontend §4`. Si el estado se enforza en servidor, la subsección Developer server-side → ver `spec-backend §4`. Cada área agrega SÓLO su subsección; nunca redeclara el diagrama base de arriba.

> **Instrucciones (Funcional):** El AF esboza los estados de negocio significativos. Estados en minúsculas con guiones. Transiciones describen la acción o condición que las dispara. Los estados de error incluyen la transición de recuperación. Omitir esta subsección si la funcionalidad no tiene flujo de estados discernible — indicar explícitamente "No aplica".

---

<!-- §5 Integraciones y Dependencias Externas → ver spec-backend §5 (contrato técnico, mock/prod) + spec-devops §5 (SLA operacional / monitoreo). No vive en el spec-funcional. -->

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

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

### RNFs de negocio — Funcional (AF)

- **Tiempo de respuesta:** Respuesta disponible en menos de {N} segundos para {condición de volumen estándar}.
- **Disponibilidad:** {Disponibilidad requerida por el proceso de negocio — ej. "durante horario laboral" o "24/7"}.
- **Volumen:** {Descripción del patrón de uso: invocaciones individuales / batch / sesión continua — frecuencia y pico estimado}.
- **Retención de datos:** {Qué persiste el AF, dónde y por cuánto tiempo. Qué no se almacena en la funcionalidad}.
- **Seguridad:** Sin credenciales hardcodeadas. Datos sensibles del cliente no expuestos en artefactos versionados. {Consideraciones adicionales de confidencialidad del input/output}.

> **§7 Subsecciones técnicas de RNFs:** RNFs de arquitectura (escalabilidad / capacidad) → ver `spec-backend §7`. RNFs de calidad (cobertura, performance testing) → ver `spec-qa §7`. RNFs operacionales (SLOs, observabilidad, pipeline, alertas) → ver `spec-devops §7`. Cada área referencia estos RNFs de negocio como ancla y agrega sus targets técnicos derivados.

> **Instrucciones (Funcional):** Los cinco RNFs de negocio son obligatorios en todas las SPECs. El tiempo de respuesta debe incluir la condición de volumen estándar. La seguridad debe mencionar explícitamente la gestión de credenciales y datos sensibles.

---

<!-- §8 Experiencia del Usuario — Vista Funcional: la subsección funcional (Mensajes al usuario / Datos requeridos por estado — AF) es responsabilidad del AF pero acompaña al contrato visual; en el modelo spec-per-área el grueso de §8 (Prerequisitos UI, configuración UI, componentes hi-fi, tokens, WCAG, Figma) → ver spec-diseno §8; el wiring Developer → ver spec-frontend §8. -->

<!-- §9 Validaciones de Campos → la tabla ancla "Reglas de validación — AF" y el mapeo por área se resuelven en los slices: spec-diseno §9 (comportamiento visual/UX), spec-frontend §9 (validación cliente), spec-backend §9 (validación servidor). Ver spec-slice-rules.md §4 (fila 6). -->

<!-- §10 Criterios de Aceptación (escenarios Gherkin base + adicionales QA + criterios de done) → ver spec-qa §10. -->

<!-- §11 Seguridad → ver spec-seguridad §11 (dueño ÚNICO del contrato completo de seguridad). Backend y frontend agregan notas de implementación por puntero — nunca redeclaran el contrato. -->

<!-- §12 Dominio de Datos → ver spec-data §12. -->

<!-- §13 Controles y Auditoría → ver spec-backend §13 (siempre — subsección Arquitectura) y, condicional a señal regulatoria HIPAA/PCI-DSS/SOX, spec-seguridad §13. -->

## 14. Decisiones Requeridas y Gaps

> **Dominio:** Funcional · AF
> **Artefacto de origen:** {HU · Brief · Ticket · Requisito · Incidente · Otro — referencia al documento fuente}

| ID | Parámetro / Gap | Impacto | Opciones | Owner | Estado |
|---|---|---|---|---|---|
| GAP-001 | {Nombre del parámetro sin valor definido o gap detectado} | {Consecuencia concreta si no se resuelve antes de implementar} | A: {primera alternativa}. B: {segunda alternativa}. C: {tercera si aplica}. | {PO / UX / Seguridad / Negocio / SME} | PENDIENTE |

> Sin decisiones ni gaps — todos los parámetros están definidos. *(Reemplazar la tabla por esta línea cuando no hay pendientes.)*

> **Instrucciones (Funcional):** Registrar todo parámetro de negocio que el AF no puede definir solo y requiere confirmación del cliente o del SME del dominio, así como gaps funcionales o de diseño detectados durante el análisis o la construcción. El Estado evoluciona de PENDIENTE → EN DECISIÓN → CERRADO o DIFERIDO. Los ítems DIFERIDOS quedan referenciados por su ID (GAP-NNN) en los Criterios de done (`spec-qa §10`) — sin referencia explícita, el ítem DIFERIDO es invisible al cierre.

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
> Los CRs que impacten un `spec-{area}` particular se referencian con el mismo marcador inline en ese área.
> Ejemplo en una regla de negocio:
> ```
> > **[CR-001]** *Modificado 2026-07-15. Ver § 15.*
>
> **RN-005 [CR-001]** {texto actualizado de la regla}
> ```

| CR | Versión resultante | Fecha | Sección(es) / spec(s) afectada(s) | Resumen del cambio | Origen | Aprobado por |
|---|---|---|---|---|---|---|
| — | — | — | — | Sin cambios post-aprobación | — | — |
