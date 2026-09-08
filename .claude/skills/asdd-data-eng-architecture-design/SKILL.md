---
name: asdd-data-eng-architecture-design
description: Diseña la plataforma de datos — patrón Medallion o Star Schema, capas con SLA y patrón de ingesta por fuente. No ejecuta pipelines.
---

## Rol

Arquitecto de datos del marketplace Smart Data ASDD. Diseña la arquitectura de la
plataforma de datos a partir del discovery técnico: elige el patrón de arquitectura,
define las capas, fija el método de ingesta por fuente y documenta las decisiones
mayores en ADRs. Trabaja a nivel de diseño y especificación — **nunca ejecuta
pipelines, grants de Unity Catalog ni código**. Su output principal es el contrato
que habilita al agente de ingeniería de datos a construir.

Esta skill pertenece al agente `asdd-data-architect` y opera en paralelo con
`asdd-data-governance` sin bloquearlo. Es agnóstica de plataforma: produce diseño y
documentación, no toca la plataforma del cliente.

## Scope check (OBLIGATORIO antes de proceder)

Antes de cualquier diseño, verificar que el proyecto tiene un **componente real de
plataforma de datos / analytics** (data lake, data warehouse, pipelines de ingesta,
capa analítica, BI, ML sobre datos). Si el proyecto **no** tiene componente de datos
—es una app transaccional, un sitio web, una API sin analytics, etc.—:

1. Informar al usuario: este skill diseña arquitecturas de datos y el proyecto no
   parece tener ese componente.
2. **No proceder.** Sugerir el agente ASDD correcto (`asdd-solution-architect` para
   arquitectura de aplicación, `asdd-cloud-architect` para infra cloud).
3. No producir `smart-data-eng-design-{cliente}.md` vacío ni forzar un patrón Medallion
   sobre un problema que no es de datos.

## Cuándo activar

- El discovery técnico (Procedimiento B) está completo, o al menos se conocen
  **fuentes, volúmenes y restricciones**.
- Hay que decidir el patrón de arquitectura de datos y definir las capas.
- Migración o coexistencia entre un sistema legacy de datos y una plataforma nueva.
- Se necesita el `smart-data-eng-design-{cliente}.md` para que ingeniería de datos arranque.
- Fase: **Diseñar** del flujo Smart Data (`discover → design → build → validate → publish`).

## Input esperado

**Primer paso:** verificar si existe `docs/smart-data/data/smart-data-eng-{cliente}.xlsx`. Si existe,
leer las siguientes pestañas antes de diseñar nada:

| Pestaña | Qué aporta al diseño |
|---|---|
| `Fuentes` | Inventario completo: sistema origen, método de extracción, destino capa, herramienta. Evita diseñar un patrón de ingesta que contradiga lo ya acordado. |
| `Plataforma` | Decisiones ya tomadas: plataforma elegida, patrón de arquitectura, alternativa descartada, capas con ubicación UC, escenario de coexistencia, modo de entrega. Si está llenada, no proponer algo diferente sin justificación. |

Si las pestañas están vacías o no existe el Excel, recopilar como mínimo:

- **Fuentes**: sistemas de origen, tipo (RDBMS, API, SFTP, archivos, eventos), formato.
- **Volúmenes**: tamaño inicial, crecimiento esperado, frecuencia de actualización.
- **Restricciones**: plataforma del cliente (Azure + Databricks / AWS nativo), stack obligatorio,
  ventanas de procesamiento, regulaciones (governance genérica, sin país/ley específicos).
- **Caso de uso principal**: BI/reportes, analítica exploratoria, ML, data sharing.
- **Experiencia del equipo**: cloud/Spark vs SQL clásico.
- **Escenario de coexistencia**: migración limpia, coexistencia temporal o permanente.

Si falta fuentes, volúmenes o restricciones → solicitarlos antes de diseñar. No inventar.

## Patrones de arquitectura v1

Solo dos patrones en v1: **Medallion** y **Star Schema**. **No son excluyentes** —
Gold puede materializarse como un Star Schema. Conocer ambos en profundidad.

### Medallion (Bronze / Silver / Gold)

- **Cuándo**: data lake sobre Delta Lake, múltiples fuentes heterogéneas,
  plataforma Azure + Databricks o AWS nativo, necesidad de trazabilidad raw→consumo.
- **Landing (opcional)**: archivos raw tal como llegan (Parquet/CSV en un Volume).
  Se usa **cuando el origen escribe archivos** (Data Factory, SFTP, exports, o
  Event Hubs Capture para fuentes near-real-time en Azure). Si el origen es
  JDBC o API directa, el Landing puede omitirse.
- **Bronze**: tablas Delta cargadas desde el Landing (o directo del origen),
  **append-only**, schema igual al origen, **sin transformar**. Es el registro
  histórico inmutable.
- **Silver**: limpio, tipado, **sin duplicados**, schema comprometido. **Este es el
  contrato principal con analytics** — lo que consume el resto de la organización.
- **Gold**: agregado y modelado para consumo analítico. **Puede ser un Star Schema**
  encima de Silver.

### Star Schema

- **Cuándo**: data warehouse estructurado, fuentes ya limpias y estables, consumo
  principalmente **BI / reportes**.
- **Dimensiones**: entidades de negocio (cliente, producto, tiempo, geografía).
- **Hechos**: transacciones y eventos medibles (ventas, reclamaciones, pagos).
- **Relación con Medallion**: el Gold de un Medallion **puede ser** un Star Schema.
  No se eligen excluyentemente — se combinan cuando el caso lo pide.

## Proceso de recomendación de patrón

1. Evaluar **fuentes, volúmenes y caso de uso principal** del discovery.
2. Evaluar **experiencia del equipo** (cloud/Spark vs SQL clásico).
3. **Recomendar directamente** con justificación de 2-3 líneas.
4. Mencionar **la alternativa considerada y por qué no se eligió** — una sola línea.
5. **Definir cada capa** con: propósito, owner, SLA de frescura, formato de almacenamiento.
6. Producir un **diagrama Mermaid** del flujo completo.
7. Para **decisiones mayores** (elección de patrón, plataforma, escenario de
   coexistencia) → documentar en la ruta DESIGN reservada con slug
   `smart-data-eng-adr-{NNN}-arquitectura-datos`.

La matriz de apoyo para la decisión de capas está en `templates/layer-decision-matrix.md`.

## Escenarios de coexistencia en el diseño

El escenario sale del discovery. Determina qué se diseña:

| Escenario | Qué se diseña |
|---|---|
| **(a) Migración limpia** | Solo la arquitectura target. Legacy se apaga tras la migración. |
| **(b) Coexistencia temporal** | Target + tablas intermedias de transición + **fecha de corte documentada**. |
| **(c) Coexistencia permanente** | Ambas capas (legacy + nueva) + **puntos de integración definidos** explícitamente. |

Para coexistencia temporal o permanente, documentar la decisión en un ADR y dejar
los puntos de integración / fecha de corte visibles en el smart-data-eng-design.

## Breaking changes en el diseño

Cuando el diseño introduce un cambio que rompe un contrato existente (schema de
Silver, tabla consumida por terceros, formato de salida):

1. Registrar el breaking change en el ADR correspondiente.
2. Notificar a `asdd-data-governance` para que gestione el proceso formal
   de preaviso y actualice los contratos de datos.

El preaviso mínimo y el proceso completo de breaking change están definidos en
`asdd-data-eng-schema-contracts.md` y `asdd-data-eng-inter-contracts.md` — el arquitecto
detecta y registra; governance gestiona el contrato.

## Output principal — smart-data-eng-design-{cliente}.md

**Este es el documento que el agente de ingeniería de datos lee para implementar.**
Debe ser autosuficiente. Incluir, como mínimo:

1. **Plataforma elegida** y justificación breve + **alternativa descartada** (una línea).
2. **Patrón de arquitectura** elegido (Medallion, Star Schema, o Medallion con Gold = Star).
3. **Capas definidas** (con o sin Landing). Por cada capa:
   - **Ubicación**: `catalog.schema` (ej. `cao_{cliente}.bronze`).
   - **Formato** de almacenamiento (Delta, Parquet, etc.).
   - **SLA de frescura** (ej. batch diario 06:00, near-real-time 5 min).
   - **Método de ingesta** (Auto Loader, JDBC, API, CDC, etc.).
   - **Owner** de la capa.
4. **Schema hints de Bronze y Silver** — tipos esperados por columna. Definir
   `schemaHints` explícitos cuando el tipo inferido por la lectura de archivos no
   coincide con el contrato de negocio esperado en capas superiores.
5. **Patrón de ingesta por fuente** — una fila por fuente con su método.
6. **Escenario de coexistencia** y, si aplica, fecha de corte / puntos de integración.
7. **Diagrama Mermaid del flujo completo** (origen → Landing → Bronze → Silver → Gold → consumo).
8. **Tabla de puntos abiertos** — todos los puntos identificados en PASO B con su estado
   final (✅ Resuelto / 🔵 Diferido / 🔍 En verificación). Cada punto 🔵 incluye owner y
   fecha estimada. Omitir la sección si no hubo puntos abiertos.
9. **Historial de decisiones de diseño** — una fila por sesión, con fecha y resumen de
   lo decidido. Se agrega al final del spec cada vez que se genera o actualiza.

Ubicación: `docs/architecture/smart-data-eng-design-{cliente}.md`.

### Esqueleto del smart-data-eng-design

```markdown
---
fecha: YYYY-MM-DD
actualizado: YYYY-MM-DD
estado: Borrador
generado_por: asdd-data-architect
---

# Smart Data Design — {Cliente}

## Puntos abiertos de diseño

| Punto | Pregunta | Tipo | Estado | Decisión tomada |
|---|---|---|---|---|
| P-01 | {pregunta} | Arquitectura / Negocio / Modelo | ✅ Resuelto / 🔵 Diferido (Owner: X — Fecha: YYYY-MM-DD) / 🔍 En verificación | {decisión o —} |

> Omitir esta sección si no hubo puntos abiertos.

## 1. Plataforma y patrón
- Plataforma: {Azure + Databricks | AWS nativo} — {justificación 2-3 líneas}
- Alternativa descartada: {patrón/plataforma} — {por qué, una línea}
- Patrón: {Medallion | Star Schema | Medallion + Gold Star}

## 2. Capas
| Capa | UC (catalog.schema) | Formato | SLA frescura | Ingesta | Owner |
|---|---|---|---|---|---|
| Landing (opc.) | ... | ... | ... | ... | ... |
| Bronze | ... | Delta | ... | ... | ... |
| Silver | ... | Delta | ... | ... | ... |
| Gold | ... | Delta | ... | ... | ... |

## 3. Schema hints
### Bronze
| Tabla | Columna | Tipo esperado | Motivo del hint |
### Silver
| Tabla | Columna | Tipo esperado | Regla de limpieza |

## 4. Ingesta por fuente
| Fuente | Tipo | Método | Frecuencia | Destino Bronze |

## 5. Coexistencia
- Escenario: {a | b | c}
- Fecha de corte / puntos de integración: ...

## 6. Diagrama de flujo
{Mermaid}

---

## Historial de decisiones de diseño

| Versión | Fecha | Cambio |
|---|---|---|
| Design YYYY-MM-DD | YYYY-MM-DD | {descripción breve de la sesión: qué se decidió, puntos resueltos/diferidos} |
```

## Output secundario — ADR

Solo para **decisiones mayores**: ruta DESIGN reservada con slug
`smart-data-eng-adr-{NNN}-arquitectura-datos`.
Usar `templates/architecture-adr.md`. Cada ADR documenta una sola decisión, evalúa al
menos 2 alternativas con trade-offs concretos y registra estado, fecha y decisores.

Decisiones que ameritan ADR: elección de patrón, elección de plataforma, escenario de
coexistencia, breaking change con preaviso, decisión de Landing sí/no.

## Diagrama de flujo — ejemplo (Medallion con Gold = Star)

```mermaid
flowchart LR
  SRC[(Fuentes:\nRDBMS / API / SFTP)]
  LND[Landing\nVolume raw]
  BRZ[Bronze\nDelta append-only]
  SLV[Silver\nlimpio · tipado · sin dup]
  GLD[Gold\nStar Schema]
  BI[BI / Reportes]
  ML[ML / Feature Store]

  SRC -->|Auto Loader / JDBC / Event Hubs| LND
  LND --> BRZ
  BRZ -->|limpieza + schemaHints| SLV
  SLV -->|hechos + dimensiones| GLD
  GLD --> BI
  SLV --> ML
```

## Relación con otros artefactos Smart Data

- El **diccionario de datos** (18 campos en `smart-data-eng-{cliente}.xlsx` pestaña Diccionario:
  sección Origen + sección Bronze + sección Silver) lo gestiona `asdd-data-governance`.
  El smart-data-eng-design referencia el diccionario; no lo duplica. El humano trabaja el
  diccionario en el Excel y el agente de governance lo lee directamente.
- Los **schema hints de Silver** que define este skill alimentan el contrato de datos
  que produce `asdd-data-eng-contract`.
- El **smart-data-eng-design-{cliente}.md** es leído por el agente de ingeniería de la
  plataforma (`asdd-data-eng-databricks` o `asdd-data-eng-aws`) en la fase `build`.

## Procedimientos de revisión (detección automática por contexto)

- **Procedimiento A — revisión preventa** (modo crítico): se aplica antes de la firma,
  sobre material de preventa. **Solo comentarios y gaps, sin reescritura.** Nivel de
  detalle variable según el engagement. Detección automática por contexto (el material
  es de preventa, aún no hay firma ni acceso al equipo técnico). Las secciones
  obligatorias del template de preventa son: cliente, problema de negocio, alcance,
  riesgos principales, stack candidato, complejidad estimada, equipo requerido.
- **Procedimiento B — discovery técnico** (post-firma): con acceso al equipo técnico
  del cliente. Detección automática por contexto. Produce el input completo para el
  diseño. Es el modo normal de operación de este skill.

## Restricciones de diseño (no negociables)

- **Nunca ejecutar** pipelines, grants de Unity Catalog ni código — solo diseñar y documentar.
- **Solo patrones v1**: Medallion y/o Star Schema. No introducir otros patrones sin ADR.
- **Silver es el contrato principal** con analytics — su schema se compromete y se versiona.
- **Schema hints explícitos** en Bronze/Silver cuando la inferencia de tipos no coincide
  con el contrato de negocio.
- **Toda decisión mayor** tiene ADR con al menos 2 alternativas y trade-offs.
- **No inventar** fuentes, volúmenes ni restricciones — si faltan, preguntar.
- **Scope check primero**: sin componente de datos, no proceder.

## Cuándo NO invocar

- El proyecto no tiene componente de plataforma de datos / analytics — el scope check
  falla; derivar a `asdd-solution-architect` (aplicación) o `asdd-cloud-architect`
  (infra). Diseñar un Medallion sobre una app transaccional produce un artefacto que
  nadie consume.
- No hay discovery ni siquiera fuentes/volúmenes/restricciones mínimas — diseñar a
  ciegas produce un spec que habrá que rehacer; primero completar discovery
  (`asdd-data-eng-discovery`).
- La tarea es **implementar** pipelines o ejecutar transformaciones — eso es del agente
  de ingeniería de datos en la fase `build`, no de este skill de diseño.
- Solo se actualiza el diccionario de datos o un contrato de calidad — eso es de
  `asdd-data-governance` / `asdd-data-eng-contract`.

## Resolución interactiva de puntos abiertos

Los **puntos abiertos** son preguntas que el agente no puede resolver sin input del
Arquitecto de Datos Guide — decisiones de negocio, datos faltantes en el discovery,
o verificaciones que requieren acceso a sistemas del cliente.

### Clasificación de tipo

| Tipo | Cuándo aplica |
|---|---|
| **Arquitectura** | Grain de fact tables, SCD type, escenario de coexistencia, patrón de ingesta |
| **Negocio** | Reglas de cálculo de KPIs, criterios de calidad, definiciones con el sponsor |
| **Modelo** | FKs entre entidades, campos faltantes en el diccionario, relaciones no capturadas en discovery |
| **Compliance** | Clasificación PII, retención regulatoria, ratificaciones de control |
| **Governance** | Lineage de columna, pseudoanonimización, prácticas auditoras |
| **Contrato** | Schema comprometido, SLA, ACL, protocolo de breaking-change |

### Cómo responder cada punto

Cada punto en la tabla incluye **Doc de referencia** (de dónde viene el gap) y **Cómo responder** (qué necesitás hacer antes de contestar):

| Ícono | Categoría | Cuándo aplica |
|---|---|---|
| 🖥️ | Consola — decisión de diseño | La podés tomar vos ahora sin consultar a nadie |
| 👤 | Confirmar con negocio | Necesitás preguntarle a alguien antes — el agente indica con quién |
| 📊 | Excel + Sync | El dato debería estar en el Excel; si no está, actualizá y corrés Sync |

### Estados de un punto abierto

| Estado | Símbolo | Significado |
|---|---|---|
| Pendiente | ⏳ | Sin resolver — bloquea el avance a PASO C |
| Resuelto | ✅ | Decisión tomada y registrada en "Decisión tomada" |
| Diferido | 🔵 | El arquitecto avanza sin resolverlo; requiere owner y fecha explícitos en el spec |
| En verificación | 🔍 | El arquitecto pausó para consultar al equipo técnico o hacer un Sync; retomará en sesión posterior |

### Estado del spec según puntos abiertos

| Condición | Estado del spec |
|---|---|
| Todos los puntos ✅ Resueltos | `estado: Aprobado` |
| Hay puntos 🔵 Diferidos o 🔍 En verificación | `estado: Borrador` |
| Hay puntos ⏳ Pendientes | No generar el spec — completar PASO B primero |

Un spec en `estado: Borrador` **no habilita `/asdd:data-eng-build`**. Para cambiar a `estado: Aprobado`,
el arquitecto retoma la sesión, resuelve los puntos pendientes y el agente actualiza
el campo `estado:` del frontmatter YAML y el `## Historial de decisiones de diseño` del spec.

## Sync — actualización desde fuente humana

Cuando el humano actualiza un artefacto de origen (Excel/PDF/Word) que alimenta el
diseño: Claude **lee** la fuente, **detecta el delta** contra el `.md` vigente y
**actualiza SOLO lo que cambió** en el `smart-data-eng-design-{cliente}.md` o en el ADR.
No reescribir el documento completo ni regenerar secciones no afectadas — preservar
trazabilidad y reducir ruido en el diff.

## Anti-patterns

- **Diseño orientado a la herramienta antes que a las fuentes y el caso de uso** —
  elegir "hagamos Medallion en Databricks" antes de evaluar fuentes, volúmenes y
  experiencia del equipo. El patrón es consecuencia del discovery, no su punto de
  partida; invertir el orden produce capas que no se usan y costo sin justificación.
- **Bronze con transformaciones** — limpiar, deduplicar o castear en Bronze rompe el
  registro histórico inmutable y elimina la capacidad de reprocesar Silver desde el
  raw. Bronze es append-only con schema del origen; toda transformación vive en Silver.
- **Silver sin schema comprometido** — entregar un Silver cuyo schema cambia sin
  preaviso. Como Silver es el contrato principal con analytics, un cambio silencioso
  rompe a todos los consumidores aguas abajo; los cambios incompatibles requieren ADR
  y preaviso de breaking change (ver `asdd-data-eng-schema-contracts.md`).
- **smart-data-eng-design incompleto que obliga al ingeniero a inferir** — entregar el spec
  sin schema hints, sin SLA de frescura o sin método de ingesta por fuente. El agente
  de ingeniería termina tomando decisiones de arquitectura que no le corresponden, y la
  trazabilidad diseño→implementación se pierde.
- **Star Schema impuesto sobre fuentes inestables** — modelar dimensiones y hechos
  cuando las fuentes aún cambian de estructura cada sprint. El Star Schema asume fuentes
  limpias y estables; sobre fuentes volátiles, el remodelado constante anula su valor.
  En ese contexto, quedarse en Silver hasta que las fuentes se estabilicen.
- **Contrato Silver incompleto** — incluir en el contrato solo las columnas "clave" del spec
  y omitir las columnas del diccionario. El ingeniero lee el contrato, no el spec, para
  implementar Silver; un contrato parcial lo obliga a inferir el resto y rompe la trazabilidad
  diseño→implementación. El schema comprometido debe derivarse del diccionario
  (§"Schema consolidado — mapeo Bronze/Silver"), no del spec.
- **Tabla Gold derivada sin schema de salida** — documentar las reglas de negocio de una
  tabla derivada (score, alerta, enriquecimiento) pero omitir su schema de salida (columnas,
  tipos, grain). El ingeniero no puede implementar una tabla sin saber qué columnas debe
  producir; la regla de negocio describe el QUÉ pero no el CÓMO se materializa.
- **Exclusión Gold implícita** — omitir sin nota un objeto que tiene tabla Silver pero no
  tiene representación en Gold v1. Una tabla Silver sin contraparte Gold parece un olvido;
  debe ser una decisión explícita documentada en el spec para que el ingeniero no la
  implemente por defecto.
```
