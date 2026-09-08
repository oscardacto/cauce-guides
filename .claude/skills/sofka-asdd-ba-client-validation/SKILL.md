---
name: sofka-asdd-ba-client-validation
description: Documento de Validación con Cliente (DVC/DVF) en lenguaje de negocio, nunca de implementación, para aprobar gaps o firmar la spec.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/sofka-asdd-ba-specs-layout.md`.

## Propósito y modos (skill compartido)

Este skill produce un **Documento de Validación con Cliente (DVC)**: un documento cristalino, en lenguaje de negocio, para que el cliente **entienda y decida**. Es un skill **compartido** de la capa BA, invocado desde tres puntos del ciclo con el mismo motor de claridad y distinto propósito:

| Invocador | Propósito | Contenido que valida |
|---|---|---|
| `sofka-asdd-ba-functional-architect` (vía `scope-manager` / `early-scope`) | Aprobar decisiones y cierre de gaps | EDT + gaps + decisiones abiertas |
| `sofka-asdd-ba-specification-lead` | Validar y firmar la spec funcional (**DVF** — modo detallado abajo) | spec-funcional aprobada |
| `sofka-asdd-ba-scope-manager` | Consensuar diferencias de alcance / cambios | análisis de alcance / CR |

El **modo DVF** (validación de spec) es el modo completamente especificado en este skill — su estructura fija y sus reglas de humanización se detallan abajo. Los otros dos modos **reutilizan el mismo motor** (lenguaje llano, mensaje explícito, sección de firmas) sobre su contenido fuente respectivo (el enunciado de alcance de `early-scope`, o el análisis de `scope-control`), conservando la sección de decisión/firma.

## Rol

Construye el DVF a partir de una spec-funcional aprobada. Humaniza el contenido funcional para que el stakeholder de negocio pueda validar y firmar sin necesitar al AF presente.

## Fuente de verdad

La spec-funcional en `docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md` (modelo spec-per-área, ADR-004). Leerla completa antes de construir el DVF. Identificar las secciones por sus headings tal como aparecen en el documento (`## 1. User Story`, `## 2. Actores y Permisos`, `## 4. Flujo de Negocio`, `## 6. Reglas de Negocio`, etc.). Si el heading de una sección esperada no existe o está sin contenido real (placeholder del template sin reemplazar), anotar "No aplica" en la sección correspondiente del DVF.

En el modelo spec-per-área, algunas secciones **no viven en el spec-funcional** sino en slices dueñas de cada dominio. El DVF las lee **por puntero** solo si existen:

| Contenido para el DVF | Dónde vive | Qué hacer si no existe el slice |
|---|---|---|
| Criterios de aceptación (Gherkin base) | `docs/specs/{codigo}-{slug}/{codigo}-qa-{slug}.md` §10 | Derivar "Cómo Sabe Que Funciona" del Flujo de Negocio (§4) y las Reglas (§6) del funcional; anotar que los criterios formales aún no están en `spec-qa` |
| Datos sensibles / regulación (parte de negocio) | `docs/specs/{codigo}-{slug}/{codigo}-seguridad-{slug}.md` §11 | Omitir sección 7b salvo que el Mapa de dominios marque Seguridad `Aplica = Sí` con contenido disponible |
| Contexto y fuentes de datos (parte de negocio) | `docs/specs/{codigo}-{slug}/{codigo}-data-{slug}.md` §12 | Omitir la parte de datos de la sección 7b si el Mapa de dominios marca Datos `Aplica = No` |

## Precondición de activación

Verificar el campo `Estado` en la Sección 0 (Metadatos del documento) de la spec-funcional:
- `APROBADA` o `APROBADA CON OBSERVACIONES` → proceder
- `BORRADOR`, `RECHAZADA` o cualquier otro estado → interrumpir e informar al AF. El DVF requiere una spec-funcional aprobada.

## Propósito del DVF

El DVF no reemplaza la spec-funcional — la complementa. La spec-funcional es para el equipo técnico y el AF. El DVF es para el cliente, el Product Owner y los stakeholders de negocio. Nunca contiene detalles de implementación, solo comportamiento funcional observable.

**Qué incluir y humanizar:** User Story (§1), Actores (§2), Flujo de Negocio (§4), Reglas de Negocio (§6), Criterios de Aceptación (`spec-qa §10` si existe), y las decisiones pendientes de negocio (§14, ítems con owner Negocio/Cliente/SME). De Seguridad (`spec-seguridad §11`) y Dominio de Datos (`spec-data §12`), solo incluir si el Mapa de dominios los marca `Aplica = Sí` (leer desde `{codigo}-index.md` en **modo standalone AF**; desde §0 del spec-funcional en **ciclo del equipo**) — y solo la parte que el negocio necesita validar (clasificación de datos sensibles, regulaciones aplicables, restricciones de datos, fuentes identificadas — no los controles técnicos ni los campos de infraestructura).

**Qué NO incluir en el DVF:** Metadatos del documento (§0), Mapa de dominios, Gate de readiness (DOR), Trazabilidad (§3), Integraciones y Dependencias Externas técnicas (§5), Especificación UX/UI hi-fi (§8), Validaciones técnicas de campos (§9), Controles y Auditoría técnicos (§13), Historial de CR (§15).

## Principio de autosuficiencia del documento

El DVF debe poder leerse, entenderse y firmarse sin que el AF esté presente. Cada sección orienta al lector antes del contenido:

- **Introducción por sección:** antes del contenido de cada sección, una frase que explique qué verá el lector y por qué importa. No reemplaza el contenido — lo introduce.
- **Narrativa orientada al valor:** la sección 2 siempre incluye el problema o la ineficiencia actual que el proceso resuelve — no solo qué hace, sino por qué es necesario ahora.
- **Términos del negocio explicados:** cualquier término interno del equipo que el cliente pueda no reconocer se explica entre paréntesis en la primera aparición.
- **Preguntas autónomas en la sección 7:** cada punto a confirmar incluye contexto, opciones y consecuencia — el stakeholder puede responder sin necesitar más información del AF.

## Estructura del DVF (plantilla fija — producir siempre en este orden)

### 0. Para leer este documento

Tres bullets fijos, antes de cualquier otro contenido. Oraciones cortas, sin jerga:

> - **Qué es esto:** {una oración que diga qué proceso o funcionalidad se está validando y para qué sirve en palabras del negocio}
> - **Qué necesitamos de usted:** revisar el contenido, confirmar que refleja lo acordado y responder las preguntas de la sección {N} antes del {fecha límite si el AF la conoce, o "a la brevedad posible"}.
> - **Cómo respondernos:** {canal — correo, reunión, comentarios en el documento}. Si todo está correcto, firmar la sección final.

El objetivo de esta sección es que cualquier persona que reciba el documento sepa en 30 segundos qué se espera de ella — sin necesidad de llamar al AF.

### 1. Encabezado de Validación
| Campo | Valor |
|-------|-------|
| Funcionalidad | {nombre de la funcionalidad — desde §0 Metadatos y §1 de la spec-funcional} |
| Versión de spec-funcional | {campo Versión de §0 Metadatos} |
| Fecha de presentación | {fecha actual} |
| Stakeholders convocados | {el AF informa la lista al invocar el skill; si no se informó, dejar en blanco con nota "por completar"} |

### 2. ¿Qué hace este proceso? (narrativa ejecutiva, máx 3 párrafos)
Construir desde la User Story (§1) y el Flujo de Negocio (§4) de la spec-funcional:
- Párrafo 1: qué problema resuelve en términos de negocio
- Párrafo 2: quién lo usa y para qué
- Párrafo 3: qué produce o entrega cuando funciona correctamente

### 3. Actores y Sus Acciones
Tabla construida desde la Sección 2 (Actores y Permisos — Actores del sistema, Funcional) de la spec-funcional:

| Actor | Qué puede hacer | Qué no puede hacer |
|-------|----------------|-------------------|
| {nombre real del rol} | {capacidades en lenguaje natural} | {restricciones en lenguaje natural} |

### 4. El Proceso Paso a Paso
Los pasos del Flujo de Negocio (§4) de la spec-funcional, convertidos a lenguaje natural:
- Sin operadores técnicos: `SI/SINO` → "Si X ocurre… Si no…", `TIMEOUT` → "si no hay respuesta en N segundos", `MIENTRAS` → "mientras…"
- Sub-pasos con letras si el flujo original los tiene
- Incluir la máquina de estados (§4, subsección de estados) si existe en la spec-funcional, simplificada a estados de negocio legibles

### 5. Las Reglas del Negocio
Por cada regla `[CORE]` y `[EDGE]` de la Sección 6 (Reglas de Negocio) de la spec-funcional:
- Una oración en lenguaje natural que explique la regla
- Al menos un ejemplo concreto para cada `[EDGE]`

### 6. Cómo Sabe Que Funciona
Los escenarios Gherkin de `docs/specs/{codigo}-{slug}/qa-{codigo}.md` §10 (si existe), convertidos a frases en lenguaje natural del tipo: "El sistema funciona correctamente cuando…". **Prohibido mantener Given/When/Then en el DVF.** Si `spec-qa` no existe todavía, derivar estas frases del Flujo de Negocio (§4) y las Reglas (§6) del funcional, y anotar: "Criterios de aceptación formales pendientes de definir en la capa QA."

### 7. Puntos que Necesitan su Confirmación

Cada gap de la spec-funcional con owner de negocio (`Negocio`, `Cliente`, `SME`, `PO`) o marcado `[ESCALAMIENTO_AL_CLIENTE]`, presentado como punto de decisión estructurado. Si no hay puntos pendientes: indicar "No hay puntos pendientes de confirmación — podemos continuar."

Cada punto sigue esta estructura (una tarjeta por ítem):

---
**[N]. {Pregunta directa al stakeholder, en lenguaje de negocio}**

| Campo | Contenido |
|---|---|
| Contexto | {Una o dos oraciones que explican por qué existe este punto y qué lo originó — sin mencionar IDs, secciones ni artefactos internos} |
| Opciones disponibles | A. {opción A en lenguaje de negocio} / B. {opción B} _(agregar C si corresponde)_ |
| Si no se confirma | {Consecuencia concreta para el negocio. Nunca iniciar con "RECHAZADA" ni "BLOQUEADA" — usar: "La implementación de {parte concreta} no podrá avanzar hasta confirmar este punto" o "Por defecto se aplicará {opción X}, lo que podría diferir de la intención del negocio"} |
| Urgencia | `⚠ Antes de iniciar` — necesario para comenzar · o `Durante la implementación` — puede resolverse en la primera iteración |

Decisión del equipo de negocio: _______________________________________________

Fecha de confirmación: _____________ Responsable: _____________________________

---

> `⚠ Antes de iniciar` aplica cuando el punto es bloqueante para el diseño de la solución, los datos o la arquitectura. `Durante la implementación` cuando puede resolverse en la primera iteración sin retrasar el inicio.

### 7b. Tratamiento de Datos y Seguridad _(incluir solo si el Mapa de dominios marca Seguridad o Datos con `Aplica = Sí` — leer desde `{codigo}-index.md` en modo standalone AF, o desde §0 del spec-funcional en ciclo del equipo)_
- **Datos y protección:** qué datos maneja el proceso y cómo se protegen (sin jerga técnica), desde `spec-seguridad §11`. Regulaciones aplicables en lenguaje de negocio.
- **Dominio de datos:** contexto del proyecto; stakeholders del dominio de datos y sus roles; restricciones de datos (dureza y vigencia); fuentes de datos y problemas de calidad conocidos, desde `spec-data §12`.

### 8. Firmas y Aprobación
| Nombre | Rol | Fecha | Firma |
|--------|-----|-------|-------|
| | | | |

## Reglas de humanización del lenguaje

**Prohibido en el DVF** (criterio: si el stakeholder no lo entiende sin el AF, no va):

*Términos técnicos:* `API` · `endpoint` · `payload` · `timeout` · `Gherkin` · `Given/When/Then` · `JWT` · `OAuth` · `token` · `HTTP` · `REST` · `JSON` · `OWASP` · `schema` · `boolean` · `null` · `enum`

*Términos internos del proceso ASDD:* `MECE` · `DOR` · `CORE` · `EDGE` · `RN-NNN` · `§N` · `GAP-NNN` · `spec-{area}` · `spec-funcional` · `spec-qa` · `spec-backend` · `spec-diseno` · `spec-seguridad` · `spec-data` · `INDEX` · `RECHAZADA` · `APROBADA CON OBSERVACIONES` · `BORRADOR` · `veredicto` · `auditoría funcional` · `gap` (como sustantivo técnico)

**Sustituciones obligatorias:**
- Códigos de actores ("AF", "actor_sistema") → nombre real del rol
- Códigos de reglas ("RN-042") → descripción de la regla en lenguaje natural
- Referencias a secciones ("§4", "Sección 6") → nombre del contenido ("el flujo del proceso")
- Nombres técnicos de sistemas → nombre como lo conoce el negocio (si es diferente)
- `GAP-NNN` → "punto pendiente de confirmación" o "aspecto a definir"
- `RECHAZADA` → nunca usar en el DVF (si la spec no está aprobada, el DVF no se genera)
- `bloqueante` / `BLOQUEADA` → "requiere definición antes del inicio de la implementación"
- Cualquier mención al proceso ASDD, fases, agentes o artefactos del framework → omitir completamente

**Mantener sin cambios:** números, tiempos, porcentajes, nombres de sistemas reconocibles por el negocio.

## Guía de tono profesional — pares incorrecto → correcto

Cuando el DVF deba comunicar algo difícil (bloqueo, riesgo, urgencia), usar estas formulaciones de referencia. Nunca copiar literalmente — adaptar al contexto del feature:

| Situación | Incorrecto (no usar) | Correcto (usar esta línea o adaptarla) |
|---|---|---|
| Punto que bloquea el inicio | "Este gap es bloqueante. Sin resolverlo la spec queda RECHAZADA." | "Necesitamos su confirmación sobre este punto antes de iniciar el desarrollo. Sin ella, esta parte no podrá comenzar." |
| Riesgo regulatorio | "RN-042 tiene RIESGO_REGULATORIO que puede causar incumplimiento." | "Hay una regulación aplicable a este proceso que conviene verificar con su área legal antes de avanzar." |
| Decisión urgente sobre datos | "GAP-003 requiere definición de esquema de datos — CRÍTICO." | "Para diseñar correctamente cómo se almacena esta información, necesitamos saber {pregunta concreta}. Cuanto antes lo definamos, mejor." |
| Punto que puede resolverse en marcha | "GAP-007 puede cerrarse durante la implementación." | "Este aspecto puede definirse durante el desarrollo sin afectar el inicio. Lo revisamos en la primera iteración." |
| Spec aprobada con observaciones | "La spec está APROBADA CON OBSERVACIONES — hay ítems IMPLÍCITOS." | "El documento fue revisado y puede avanzar. Hay algunos aspectos menores que confirmaremos a medida que avancemos." |

## Proceso

1. Leer la spec-funcional en `docs/specs/{codigo}-{slug}/{codigo}-funcional-{slug}.md` completamente.
2. Verificar el campo `Estado` en §0: interrumpir si no es `APROBADA` ni `APROBADA CON OBSERVACIONES`.
3. Identificar todas las secciones por sus headings; leer el Mapa de dominios para saber qué slices aplican (`Aplica = Sí`): en **modo standalone AF** desde `{codigo}-index.md`; en **ciclo del equipo** desde §0 del spec-funcional.
4. Leer los slices por puntero solo si existen y aplican (Layout B): `{codigo}-qa-{slug}.md` (§10 Gherkin), `{codigo}-seguridad-{slug}.md` (§11), `{codigo}-data-{slug}.md` (§12).
5. Leer el reporte de evaluación `docs/specs/_proyecto/evaluacion-{feature}.md` (si existe) — incorporar las decisiones del AF sobre gaps de negocio.
6. Construir el DVF sección por sección según la plantilla de este skill.
7. Verificar el checklist de salida.
8. Guardar en `docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.md`.
8b. *(Opcional — solo si el AF solicitó entrega en PDF o Docx):*
    1. Verificar si `pandoc` está disponible: `which pandoc` (Linux/Mac) o `where pandoc` (Windows).
    2. **Si pandoc disponible:**
       - Docx: `pandoc docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.md -o docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.docx`
       - PDF: `pandoc docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.md -o docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.pdf`; si falla, reintentar con `--pdf-engine=wkhtmltopdf` o `--pdf-engine=weasyprint`.
       - Informar al AF la ruta del archivo generado.
    3. **Si pandoc no disponible:** informar al AF que el Markdown generado puede convertirse con: `brew install pandoc` / `choco install pandoc`, o abriendo el `.md` directamente en Word, Typora u Obsidian.
9. Informar al agente `sofka-asdd-ba-specification-lead` para que active:
   - `sofka-asdd-ba-spec-index` — operación `update-artifact` con `archivo: {codigo}-dvf-{slug}.md`, `tipo: DVF`, `estado: COMPLETADO`, `fecha: {fecha}` (solo modo standalone AF).
   - `sofka-asdd-ba-change-log` — tipo `ESTADO`: DVF generado.

## Checklist de salida

- [ ] Se leyó la spec-funcional completa y se verificó `Estado` APROBADA / APROBADA CON OBSERVACIONES antes de construir
- [ ] Sección "0. Para leer este documento" presente — tres bullets (qué es, qué se necesita, cómo responder) en lenguaje del negocio sin jerga técnica
- [ ] El DVF no contiene ningún término de la lista prohibida
- [ ] Los actores tienen nombres reales, no códigos
- [ ] Todos los gaps de negocio (§14) están como preguntas directas en la sección 7
- [ ] El flujo está en lenguaje natural (sin SI/SINO técnicos ni TIMEOUT literales)
- [ ] Las reglas de negocio tienen al menos un ejemplo concreto por cada `[EDGE]`
- [ ] Los criterios de aceptación están en lenguaje natural (sin Given/When/Then); si no existe `spec-qa`, se dejó la nota de pendiente
- [ ] La sección de firmas está completa con todos los roles identificados
- [ ] Si el Mapa de dominios marca Seguridad o Datos con `Aplica = Sí` (leer desde `{codigo}-index.md` en standalone AF o desde §0 en ciclo del equipo), la sección 7b está presente
- [ ] Sección 7: cada punto pendiente tiene contexto, opciones, consecuencia en lenguaje profesional y campo de urgencia — ningún punto requiere que el stakeholder llame al AF para entender qué está decidiendo
- [ ] El DVF no contiene ningún término interno del proceso (GAP-NNN, spec-funcional, RECHAZADA, veredicto, DOR, MECE, etc.)
- [ ] DVF guardado en `docs/specs/{codigo}-{slug}/{codigo}-dvf-{slug}.md`
- [ ] Si se solicitó PDF o Docx: archivo generado en la carpeta del nodo o instrucción de conversión entregada al AF
- [ ] Skill `sofka-asdd-ba-spec-index` invocado vía `sofka-asdd-ba-specification-lead` — operación `update-artifact` registrando el DVF en la tabla del index del nodo (solo modo standalone AF)

## Anti-patterns

- **DVF técnico** — copiar la spec-funcional con formato diferente pero mismo vocabulario. Si el stakeholder no puede leerlo sin el AF presente, falló.
- **Escalamientos omitidos** — los gaps de negocio no resueltos se convierten en cambios de alcance durante la implementación.
- **DVF sin firmas** — no sirve como evidencia de validación formal.
- **Gherkin en el DVF** — los escenarios deben convertirse a lenguaje natural; nunca dejar Given/When/Then.
- **Sección 7b omitida cuando aplica** — ignorar Seguridad o Datos cuando el Mapa de dominios los marca `Aplica = Sí` deja al negocio sin validar restricciones que impactan el alcance.
- **Leer slices que no existen como si existieran** — en modo standalone del AF, `spec-qa`/`spec-seguridad`/`spec-data` pueden no estar creados. Verificar existencia con Glob antes de leerlos; nunca inventar su contenido.
- **Editar la spec-funcional** — este skill es de solo lectura sobre la spec; nunca la modifica. Los cambios post-validación los gestiona el AF vía CR (§15).
- **Preguntas sin contexto en la sección 7** — una pregunta sola, sin opciones ni consecuencia, obliga al stakeholder a llamar al AF para entender qué está decidiendo. Cada punto debe ser completamente autónomo.
- **Términos ASDD en el DVF** — palabras como "RECHAZADA", "GAP-NNN", "spec-funcional", "veredicto", "auditoría" exponen el proceso interno al cliente y reducen la credibilidad profesional del documento.
