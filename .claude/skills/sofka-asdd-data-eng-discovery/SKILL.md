---
name: sofka-asdd-data-eng-discovery
description: Captura el contexto de un engagement de datos — preventa e inventario de fuentes y stakeholders. Pertenece a sofka-asdd-data-architect.
---

## Propósito

Capturar el contexto de un proyecto de plataforma de datos / analytics para que
el resto de los skills de Arquitectura (modelado, recomendación de patrón,
spec técnica) tomen decisiones informadas. Sin discovery, el arquitecto diseña
en el vacío y produce una arquitectura genérica que no respeta restricciones del
cliente.

El output (revisión de preventa o ficha de discovery técnico) alimenta directamente
`smart-data-eng-design-{cliente}.md`, el documento que el agente de ingeniería lee
para implementar.

## Scope check obligatorio

**Antes de ejecutar cualquier procedimiento**, validar que el proyecto tenga un
componente de plataforma de datos o analytics (ingesta, modelado, pipelines,
warehouse, lakehouse, BI, ML). Si el proyecto NO lo tiene → informar al usuario
con una línea ("este engagement no tiene componente de datos; este agente no
aplica") y **no proceder**. No forzar un discovery de datos sobre un proyecto que
no lo necesita.

## Restricción de ejecución

Este skill **nunca ejecuta** pipelines, grants de Unity Catalog, queries ni
código de ninguna plataforma. Solo lee documentos, entrevista, diseña y documenta.
Toda salida es un artefacto `.md` o una lista de gaps — nunca una acción sobre la
infraestructura del cliente.

**Restricción de contenido:** los gaps generados en el discovery son exclusivamente técnicos de ingesta y de diseño de arquitectura (schema, volumen, frecuencia, formato, calidad de fuente, conectividad, disponibilidad de ventana de datos, decisiones de plataforma). El arquitecto **no genera** gaps de PII, retención, aprobación DPO ni compliance. Si detecta una señal de este tipo durante el discovery, la menciona en conversación para que `sofka-asdd-data-governance` la capture directamente en su propio assessment. **No existe la sección `context_gaps` en el discovery** — no crearla, no registrar ítems de governance en ella, no referenciarla.

## Cuándo invocar

- Llega un documento borrador de preventa para revisar antes de una reunión con cliente.
- Se firmó el contrato y hay acceso al equipo técnico para inventariar fuentes.
- El ingeniero indica que actualizó un archivo fuente del engagement — Excel (pestañas Fuentes, Restricciones, Plataforma, Stakeholders o Tablas consumo), Word de preventa u otro documento técnico compartido. La pestaña Diccionario es competencia de `sofka-asdd-data-governance`.

## Cuándo NO invocar

- El proyecto no tiene componente de datos / analytics (ver scope check).
- Ya existe `smart-data-eng-discovery-{cliente}.md` completo y no hubo cambios en los archivos fuente.
- Decisión puntual de diseño que no requiere re-mapear el contexto.

## Selección de procedimiento — siempre por el arquitecto

El procedimiento **nunca se infiere** del contexto — el orquestador pregunta al arquitecto y él elige:

| Opción elegida | Procedimiento |
|---|---|
| "Revisar el documento de preventa antes de presentarlo al cliente" | **A — Revisión de Preventa** |
| "Producir el discovery técnico con la información del engagement" | **B — Discovery Técnico** |
| "Actualicé el Excel — sincronizar el .md" | **Sync — Sincronización** |

El Excel es la **única fuente de verdad** en todos los procedimientos. El PDF no se lee en ningún caso.

---

## Procedimiento A — Revisión de Preventa (pre-engagement)

**Modo crítico, solo lectura.** Devuelve una **lista de gaps con severidad**
(`crítico` / `recomendado` / `opcional`). **NO reescribe el documento original** —
solo comenta y señala qué falta.

### A.0 — Material disponible en contexto

El orquestador extrajo el contenido del Excel antes de invocar este skill —
está disponible en el contexto de la conversación. No releer el archivo.

El Excel es la única fuente de verdad. Toda información relevante del engagement
debe estar en la pestaña `Propuesta` del Excel — no usar el PDF como fuente.

### A.1 — Criterio de severidad según etapa

Esta es una propuesta **ejecutiva pre-engagement**, no un documento técnico.
Aplicar criterio de etapa:

- Exigir detalle técnico (volúmenes exactos, regulación confirmada, métricas precisas)
  es incorrecto a este nivel. Los gaps de detalle técnico son máximo **RECOMENDADO**.
- Son **CRÍTICOS** solo los gaps que exponen a Sofka a compromisos ambiguos,
  riesgos no declarados, o promesas que el equipo no puede cumplir.

### A.2 — Evaluar las 7 secciones

Cargar `templates/preventa-document.md` para las secciones obligatorias.
Evaluar cada punto y emitir un gap si falta o es débil:

1. **Tipo de proyecto** — ¿está claro si es full platform / migración / componente de integración?
2. **Problema de negocio** — ¿está articulado en términos de negocio, no técnicos?
3. **Alcance** — ¿es realista y acotado? ¿Hay una sección explícita de qué queda fuera?
4. **Stack candidato** — ¿es coherente con el contexto del cliente?
5. **Complejidad estimada** — ¿especifica si el engagement es standalone o parte de un programa mayor? ¿Tiene al menos estimación de nivel (Alta/Media/Baja)?
6. **Equipo requerido** — Para el equipo Sofka: ¿están los roles mínimos (Arquitecto de Datos + Data Engineer)? Para ejecutar el discovery, ¿se confirma disponibilidad del Arquitecto de Datos al 100% y al menos un data owner por cada sistema fuente del lado del cliente?
7. **Riesgos principales** — ¿están mencionados los riesgos más obvios del engagement?

### A.3 — Formato de cada gap

```
[severidad] Sección: {sección del documento}
Gap: {qué falta o es débil}
Por qué importa: {impacto si se presenta al cliente sin resolver}
Sugerencia: {qué pregunta hacer o qué precisar — sin reescribir el doc}
tipo_accion: conversation | excel-update
→ Próximo paso: {instrucción exacta — qué hacer ahora mismo y cómo}
```

`tipo_accion` para preventa:
- `conversation` → preguntarle algo al equipo Sofka o al cliente antes de presentar. Próximo paso: "Preguntale a {rol}: {pregunta concreta}. Actualizá el Excel o respondé aquí."
- `excel-update` → dato que ya existe pero no se capturó. Próximo paso: "Abrí la pestaña {X}, columna {Y}. Completá el valor. Luego decime `actualicé el Excel`."

### A.4 — Resumen y recomendación final

El resumen se dirige al **Arquitecto de Datos responsable del engagement** (no usar
nombres propios ni alias).

Si hay gaps críticos:
> "Este documento tiene gaps críticos que deben resolverse antes de presentarlo
> al cliente. Presentarlo así expone a Sofka a compromisos ambiguos."

Listar los gaps críticos numerados y las dos o tres promesas más peligrosas
del documento si las hay.

### A.5 — Siguiente paso

No usar lenguaje de "firma" como trigger técnico. El siguiente paso es:

> "Una vez iniciado el engagement, arrancar las sesiones de discovery con los
> equipos técnicos del cliente. El Excel se completa durante esas sesiones
> (pestañas Fuentes, Restricciones, Plataforma, Tablas consumo y Diccionario). Cuando el Excel tenga
> el detalle técnico real del cliente, correr `/sofka-asdd:data-eng-discover` — en ese
> momento aplica el Procedimiento B."

**Output:** lista de gaps entregada al usuario (no se persiste un .md salvo que se pida).

---

## Procedimiento B — Discovery Técnico

Activo cuando hay acceso al equipo técnico del cliente **y** el Excel tiene
pestañas técnicas con información real (Fuentes, Restricciones, Plataforma, Tablas consumo, Diccionario)
— o cuando las sesiones de discovery están en curso. Usar
`reference/interview-script.md` como guion de entrevistas y
`templates/technical-discovery.md` como estructura del output.

### B.0 — Material disponible en contexto

El orquestador extrajo el contenido del Excel antes de invocar este skill —
está disponible en el contexto de la conversación. No releer el archivo.

Las pestañas del Excel y lo que alimentan:

| Pestaña | Sección del discovery que alimenta |
|---|---|
| `Propuesta` | Contexto del engagement (tipo de proyecto, problema de negocio, stack candidato) |
| `Stakeholders` | B.3 — roles del engagement |
| `Fuentes` | B.1 — inventario de fuentes |
| `Restricciones` | B.4 — restricciones del proyecto |
| `Plataforma` | B.2 — coexistencia y decisión de plataforma |
| `Tablas consumo` | B.5 — consumidores y SLAs de Gold |

**Regla:** usar el contenido del Excel como base. Solo hacer preguntas para
completar lo que esté vacío, contradictorio o ambiguo. No pedir al equipo
información que ya está documentada en el Excel.

### B.1 — Inventario de fuentes

Capturar por **cada fuente**:

- Nombre
- Sistema origen
- Tipo: `transaccional` | `maestro` | `evento` | `referencia` | `externo`
- Volumen aproximado
- Frecuencia (de actualización / ingesta)
- Formato
- Calidad conocida
- Owner técnico
- SLA Origen

**Regla SLA Origen:** la columna SLA Origen del Excel captura cuándo el sistema fuente tiene el dato disponible para ser extraído. Un valor válido expresa al menos uno de: frecuencia de disponibilidad (`diaria`, `mensual`, `streaming`), ventana horaria (`antes de las HH:mm`, `día N del mes`), o disponibilidad continua explícita (`Siempre disponible`).
- SLA Origen con valor válido → **no generar gap de "sin SLA"** para esa fuente.
- SLA Origen vacío, o con valor genérico sin información temporal (`pendiente`, `ok`, `sí`) → gap con `tipo_accion: excel-update`.
- **SLA Origen ilegible (`System.Xml.XmlElement` u otro artefacto de parsing):** la celda tiene formato enriquecido que el extractor no puede leer. Tratar como vacío: NO preservar el valor viejo del `.md` ni generar gap técnico. En cambio, informar al usuario exactamente: "La celda SLA de `{fuente}` no es legible por formato enriquecido. Para sincronizarla: abrí el Excel, seleccioná esa celda, borrá el contenido, escribí el valor en texto plano y cerrá. Luego corré Sync nuevamente."
- Convención de escritura: texto plano sin formato enriquecido dentro de la celda — sin negrita ni colores mezclados.

### B.2 — Escenario de coexistencia

Leer el valor de la pestaña **Plataforma** (campo tipo de coexistencia) y documentarlo sin re-interpretar. Escalar a gap solo si el contenido del Excel es contradictorio o ambiguo.

Los tres escenarios posibles (referencia para interpretar el valor del Excel):

- **Migración limpia:** source → landing/bronze, sin sistemas legacy corriendo en paralelo.
- **Coexistencia temporal:** legacy + nuevo en paralelo con **fecha de corte definida**.
- **Coexistencia permanente:** arquitectura híbrida estable, ambos coexisten indefinidamente.

Para coexistencia temporal o permanente, documentar la política de **breaking-change**:
preaviso mínimo de **1 día laborable** (impacto bajo) o **2 días laborables**
(impacto medio/alto). No incluye fines de semana ni festivos. Ajustable por acuerdo.

### B.3 — Stakeholders

Leer la pestaña `Stakeholders` del Excel si está disponible y llenada.
Complementar con lo que surja en las sesiones de entrevista.

Roles a mapear: **data owners**, **data stewards**, **consumers**, **sponsor**, **compliance**.
Identificar siempre un sponsor que pelee por el engagement internamente.

### B.4 — Restricciones (formato Sofka)

Documentar cada restricción con los campos:

`Tipo | Dureza (dura / semi-dura / blanda) | Origen | Impacto en arquitectura | Vigencia`

Las restricciones regulatorias se documentan en términos genéricos de governance
(retención, PII, residencia de datos, auditoría) **sin especificar países ni leyes**.

### B.5 — Consumidores y SLAs de Gold

Leer la pestaña **Tablas consumo** del Excel. Si tiene filas con `Tabla Gold` y `Cómo se calcula` rellenos, documentar lo que está ahí — no generar un riesgo de "pendiente de definir". Los productos Gold ya están definidos en el Excel; el arquitecto los transcribe al discovery.

Solo escalar a gap si la pestaña está vacía o si hay contradicción entre lo que dice Tablas consumo y lo que surge en las entrevistas técnicas.

**Formato de gap en el discovery técnico:** cada gap detectado en B sigue la misma estructura que A.3 — incluye `tipo_accion` y `→ Próximo paso`. Los `tipo_accion` disponibles en B son:
- `excel-update` → dato que ya existe en el cliente pero no fue capturado. Próximo paso: "Abrí la pestaña {X}, columna {Y}. Completá el valor. Luego decime `actualicé el Excel`."
- `conversation` → requiere sesión o consulta con el equipo técnico del cliente. Próximo paso: "Preguntale a {rol/owner}: {pregunta concreta}. Cuando tengas la respuesta, actualizá el Excel y decime `actualicé el Excel`."
- `design-decision` → se resuelve en la siguiente fase. Próximo paso: "Nada ahora — se resuelve automáticamente en `/sofka-asdd:data-eng-design`."

**Regla SLA Origen — gaps de discovery:** un gap de "sin SLA" para una fuente solo se genera si SLA Origen está vacío o tiene un valor genérico sin información temporal. Si la columna tiene un valor válido (frecuencia, ventana horaria o `Siempre disponible`), ese dato fue capturado con el cliente y es suficiente — no generar gap de falta de SLA.

**Output:** `docs/specs/smart-data-eng-discovery-{cliente}.md`

> **Documento vivo:** este artefacto no es un snapshot fijo. Se actualiza a lo largo del flujo via Procedimiento Sync cada vez que el humano actualiza los datos fuente en el Excel. Los gaps se cierran o evolucionan en fases posteriores.

---

## Procedimiento Sync — Sincronización desde archivos humanos

**Trigger:** el ingeniero indica que actualizó un archivo fuente del engagement — Excel (pestañas Fuentes, Restricciones, Plataforma, Stakeholders o Tablas consumo) u otro documento técnico compartido. La pestaña Diccionario es competencia de `sofka-asdd-data-governance`.

> **Prerequisito obligatorio — Excel cerrado:** antes de ejecutar el Sync, confirmar que el archivo `.xlsx` está **completamente cerrado** en Excel. Si el archivo está abierto, Excel mantiene un lock y el agente puede leer una versión obsoleta sin errores visibles. Si el usuario no confirma que cerró Excel, preguntar antes de proceder.

Pasos:

1. **Leer** el archivo fuente directamente (`.xlsx` o texto).
2. **Limpiar sección `context_gaps` obsoleta:** si el `.md` existente contiene una sección `context_gaps` o ítems CG-XX, eliminar esa sección completa del documento **sin excepción** — independientemente de si algún ítem CG aparece como abierto. Los ítems CG abiertos ya están capturados en `smart-data-eng-governance-assessment-{cliente}.md` o en la sección Próximos pasos; mantener la sección context_gaps es redundante y genera confusión. Reportar al usuario qué sección fue eliminada.
3. **Comparar** su contenido con el `.md` existente correspondiente.
4. **Detectar el delta** — qué cambió respecto a la última versión sincronizada.
5. **Actualizar SOLO el delta** en el `.md` (con Edit, no reescribir el archivo entero). Para cada fuente cuyo SLA, retención o frecuencia cambió: actualizar TANTO la fila de la tabla (sección 3.X) como las Notas técnicas que citen el valor anterior **y también la Sección 7 (Ingesta por fuente — tabla resumen)** si la frecuencia de carga o herramienta cambió.
6. **NO sobreescribir** interpretaciones, recomendaciones ni análisis generados por Claude que no tienen un campo directo en el Excel. **Excepción obligatoria:** si un gap (sección de gaps) o una nota técnica cita explícitamente un valor del Excel que acaba de cambiar — SLA Origen, retención, frecuencia, volumen, o código de restricción (R-XX) — actualizar esa referencia para que refleje el valor actual. Un gap con un valor obsoleto no es análisis preservado: es análisis incorrecto. Si el cambio resuelve el riesgo del gap → cerrarlo con fecha. Cuando una restricción de Sección 4 cambia, buscar TODOS los gaps de Sección 10 que la citen por su código (R-01, R-02…) y re-evaluar severidad o cerrar si el cambio lo resuelve. **Regla específica SLA Origen:** si una fuente tenía SLA Origen vacío o genérico y ahora tiene un valor válido (frecuencia, ventana horaria o `Siempre disponible`) → cerrar cualquier gap abierto de "sin SLA" para esa fuente con nota de fecha y del valor registrado.
   - **R-D1 — Notas técnicas con PII obsoleto:** si las Notas técnicas de una fuente (sección 3.X) contienen cualquier referencia a "PII", "campos PII", "dato PII" o lenguaje equivalente para campos específicos, **y** la pestaña Diccionario del Excel muestra PII=No para esos campos → actualizar esa nota eliminando o corrigiendo esas referencias para que reflejen el estado actual (PII=No). No buscar solo en un campo — revisar el texto completo de las Notas técnicas de cada fuente. Un análisis de PII generado en Procedimiento B no es interpretación preservable cuando la clasificación cambió en el Excel — es dato incorrecto.
   - **R-D2 — Ítems con gaps cerrados:** para cada mención a un gap con patrón `GOV-NNN` dentro de `## Gaps y preguntas abiertas` (o cualquier otra sección del propio `.md` de discovery que lo cite), leer `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` y verificar su estado en la tabla `### Gaps cerrados`. Si figura como cerrado → eliminar esa mención del `.md` de discovery. Para menciones a un gap propio de discovery (patrón `G-NN`), verificar su estado dentro de la misma sección `## Gaps y preguntas abiertas`: si el bloque tiene el marcador `[RESUELTO — ...]` (ver Procedimiento C de `/sofka-asdd:data-eng-discover`), la mención puede eliminarse.
7. **Actualizar frontmatter e historial:** si el Sync produjo al menos un cambio en el `.md`:
   - Actualizar el campo `actualizado:` del frontmatter YAML a la fecha de hoy (`YYYY-MM-DD`).
   - Agregar una fila al final de la tabla `## Historial de sincronización` con: versión (`Sync YYYY-MM-DD`), fecha del día (YYYY-MM-DD) y una línea describiendo qué cambió. Si la sección no existe, crearla al final antes de cerrar la edición.
8. **Listar al usuario**: qué cambió y qué **artefactos dependientes** quedan afectados (contratos de datos, pipelines, governance).

La sincronización del diccionario de datos (pestaña Diccionario) es competencia de `sofka-asdd-data-governance` vía su Procedimiento Sync — este skill no sincroniza el diccionario.

---

## Coordinación con otros agentes

Este skill trabaja **en paralelo** con `sofka-asdd-data-governance`, sin bloquearlo. El
discovery técnico (Procedimiento B) produce el insumo de fuentes y restricciones que
governance consume para el diccionario y el assessment, pero ninguno espera al otro.

## Output

| Procedimiento | Output |
|---|---|
| A — Revisión de Preventa | Lista de gaps con severidad (entregada en conversación) |
| B — Discovery Técnico | `docs/specs/smart-data-eng-discovery-{cliente}.md` |
| Sync | Delta aplicado en el `.md` correspondiente + lista de afectados |

## Cuándo cargar cada reference

| Situación | Cargar |
|---|---|
| Secciones obligatorias de preventa a evaluar | `templates/preventa-document.md` |
| Estructura del discovery técnico | `templates/technical-discovery.md` |
| Guion de entrevista al equipo técnico del cliente | `reference/interview-script.md` |
