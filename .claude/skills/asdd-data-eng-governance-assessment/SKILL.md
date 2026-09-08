---
name: asdd-data-eng-governance-assessment
description: Evalúa gobernanza de datos (lineage, calidad, PII, retención). No ejecuta grants UC ni código. Pertenece a asdd-data-governance.
---

## Propósito

Levantar una foto objetiva del estado de gobernanza de una plataforma de datos
y convertirla en acciones priorizadas. El skill no implementa controles —
diagnostica, documenta y prioriza. La ejecución (grants UC, monitores, cifrado)
es responsabilidad del agente de ingeniería.

```
inventario de datos sensibles → assessment por dimensión (🔴/🟡/🟢) → diccionario + reporte de gaps
```

El output alimenta al arquitecto (decisiones de patrón con impacto en gobernanza),
al agente de ingeniería (qué grants y monitores implementar) y al data steward
(qué campos completar en el diccionario).

## Scope check (obligatorio)

Antes de proceder, verificar que el proyecto tiene un componente real de
plataforma de datos / analytics (catálogo, capas, tablas, pipelines). Si el
proyecto **no** lo tiene, informar al usuario que este skill no aplica y **no
proceder**. No inventar tablas ni dimensiones sobre un proyecto sin datos.

## Cuándo invocar

- Inicio de proyecto de datos — establecer la línea base de gobernanza.
- Antes de pasar a producción — gate de gobernanza previo al go-live.
- Auditoría de compliance — evidencia del estado de controles.
- Cambio del modelo de datos — nuevas tablas/columnas que reabren el assessment.
- El ingeniero indica que actualizó el Excel del diccionario → ejecutar Sync.

## Cuándo NO invocar

- Para ejecutar grants en Unity Catalog → eso es el agente de ingeniería.
- Para crear monitores o pipelines de calidad en producción → ingeniería.
- Para diseñar el patrón de arquitectura (Medallion / Star) → arquitecto.
- Proyecto sin componente de datos / analytics → ver Scope check.

## Proceso en 3 pasos

### Paso 1 — Inventario de datos sensibles

Recorrer el modelo tabla por tabla e identificar, por columna, tres categorías:

- **PII** — identifica a una persona (nombre, documento, correo, teléfono, geo).
- **Datos regulados** — sujetos a regulación aplicable al proyecto (genérico,
  sin nombrar leyes ni países salvo que el contexto del proyecto lo especifique).
- **Confidenciales** — sensibles de negocio sin ser PII (tarifas, scoring, márgenes).

Salida: tabla `tabla.columna → categoría → justificación`. Esta clasificación
es el insumo de la dimensión PII y del campo `PII` del diccionario.

### Paso 2 — Assessment por dimensión con semáforo

Para cada dimensión asignar 🔴 (ausente/crítico), 🟡 (parcial) o 🟢 (cubierto),
con evidencia de una línea y el gap si aplica:

| Dimensión | Preguntas guía |
|---|---|
| **Lineage** | ¿Trazado origen→destino? ¿Nivel de columna para campos regulados? |
| **Calidad** | ¿Contratos de datos activos? ¿Monitores corriendo en producción? |
| **PII** | ¿Campos identificados y clasificados? ¿Cifrado en reposo? |
| **Retención** | ¿Política por capa (Bronze/Silver/Gold)? ¿Proceso de purge definido? |
| **Acceso** | ¿ACL con mínimo privilegio? ¿Revisión de accesos actuales? |
| **Compliance** | ¿Regulación identificada? (genérico — incluir solo si aplica al proyecto) |

La dimensión **Compliance** se incluye solo si el proyecto tiene una regulación
real en alcance; si no aplica, marcarla `N/A` y no inventar requisitos.

**Reglas de fase para el semáforo (aplican al Resumen ejecutivo del template):**

- **Dimensión Acceso:** en discover y model, ausencia de matriz ACL = 🟡 (a diseñar en design). Solo 🔴 si existe acceso activo sin control sobre datos PII en producción.
- **Semáforo global en discover:** 🔴 global solo si un riesgo compromete la continuidad del proyecto (fuente PII crítica sin owner identificable, dato regulado expuesto sin ningún control). Falta de aprobación del DPO, ACL no diseñada y contratos pendientes = 🟡 máximo en discover.
- **Estas reglas modulan el semáforo de fase — no la severidad del gap individual.** Un gap Critical sigue siendo Critical y bloquea publish, aunque el semáforo de fase sea 🟡.

### Paso 3 — Diccionario de datos + reporte de gaps

- Generar / actualizar el diccionario (modelo híbrido, ver sección siguiente).
- Consolidar los gaps detectados en los pasos 1 y 2 en un reporte con
  **severidad**, **owner** y **tipo de acción concreta**:

| Severidad | Criterio |
|---|---|
| **Critical** | PII/regulado expuesto sin control, o ausencia que bloquea go-live |
| **High** | Control parcial sobre dato sensible; riesgo material a corto plazo |
| **Medium** | Gap de gobernanza sin exposición directa de datos sensibles |
| **Low** | Mejora recomendable, sin riesgo inmediato |

Cada gap lleva tres campos obligatorios — sin los tres, el gap no es accionable:

1. **Owner nominal** — rol responsable de cerrarlo.
2. **`tipo_accion`** — qué tipo de acción resuelve el gap:

| `tipo_accion` | Cuándo aplica | Ejemplo de `accion_concreta` |
|---|---|---|
| `excel-update` | El dato existe en el cliente pero no fue capturado en el Excel — el arquitecto lo pregunta y lo completa | "Pestaña Diccionario, columna Retención — confirmar con Laura Gómez y actualizar" |
| `human-approval` | Requiere que una persona del cliente decida o apruebe formalmente. Los gaps de aprobación del DPO (PII, retención) bloquean **publish** — no bloquean discover/model/design. | "Reunión con María Torres (DPO) — obtener aprobación de política de retención PII antes de publish." |
| `design-decision` | Se resuelve diseñando la solución correcta en la fase `design` | "Decidir en smart-data-eng-design: ¿anonimizar PII en Gold o extender retención Gold?" |
| `build-task` | Se implementa en código o configuración durante la fase `build` | "Configurar cifrado en reposo en ADLS Gen2 y grants UC en Unity Catalog" |

> `excel-update` aplica solo cuando el cliente **ya sabe la respuesta** pero no fue capturada
> en las sesiones. Si el cliente todavía no lo ha decidido, el tipo correcto es `human-approval`.

3. **`accion_concreta`** — instrucción específica de una línea: qué hacer exactamente, dónde (pestaña del Excel, fase del flujo, sistema) y con quién.

4. **`→ Próximo paso`** — instrucción exacta de qué hacer AHORA MISMO, según `tipo_accion`:

| `tipo_accion` | Texto del `→ Próximo paso` |
|---|---|
| `excel-update` | "Abrí la pestaña {X}, columna {Y}, fila {campo}. Completá el valor. Luego decime `actualicé el Excel`." |
| `human-approval` | "Coordiná con {rol}. Cuando tengas la aprobación, actualizá {columna} en la pestaña {X} a {valor} y decime `aprobado`." |
| `design-decision` | "Nada ahora — se resuelve automáticamente en `/asdd:data-eng-design`." |
| `build-task` | "Nada ahora — se implementa en `/asdd:data-eng-build`." |

## Diccionario de datos — modelo híbrido

El diccionario tiene **18 campos** organizados en 3 secciones:

- **Origen** (10): 1. tabla entrada · 2. columna/variable · 3. tipo de dato entrada · 4. descripción de negocio · 5. ejemplo · 6. PII · 7. owner del campo · 8. retención · 9. retención aprobada · 10. regla de calidad
- **Bronze** (3): 11. destino bronze · 12. schema hint Bronze · 13. nombre en Bronze
- **Silver** (5): 14. tabla en Silver · 15. nombre en Silver · 16. tipo Silver · 17. transformación · 18. nullable Silver

**Campos 8 y 9 (retención / retención aprobada) — solo aplican a campos PII:**

> Los campos de retención existen en el diccionario **únicamente para campos con `PII = sí`**. Un campo no-PII con retención vacía **no es un gap** — hereda la política de retención de su capa (definida en el smart-data-eng-design). No generar ningún gap de retención para campos no-PII.

| Condición | Gap generado |
|---|---|
| Campo **no-PII**, retención vacía | **Ninguno** — hereda retención de capa |
| Campo **PII**, `Retención Aprobada = sí` | **Ninguno** — aprobación evidenciada en Excel |
| Campo **PII**, retención llenada, `Retención Aprobada` vacío o `no` | Gap — bloquea **publish**, no bloquea discover/design |
| Campo **PII**, retención vacía o `TBD` | **Gap crítico** (RET-005) — bloquea publish |

> **Regla de supresión:** si todos los campos PII tienen `Retención Aprobada = sí`, no generar ningún gap de aprobación de retención ni de confirmación DPO. El "sí" en el Excel es la evidencia de aprobación — no exigir acta adicional.

**Reclasificación PII (PII=Sí → PII=No en Excel):** si el Excel actualiza un campo de PII=Sí a PII=No, aceptar el cambio como decisión humana tomada. No generar ningún gap de "aprobación DPO pendiente" por la reclasificación — el humano que controla el Excel ya tomó la decisión. Si el resultado es 0 campos PII, cerrar automáticamente los gaps de propagación PII en Gold, incoherencia de retención PII y proceso de purge PII, ya que no aplican sin campos PII declarados.

El humano completa **todo** el Excel en `smart-data-eng-{cliente}.xlsx` (pestaña Diccionario).
Las columnas en azul claro (tabla entrada, tipo de dato entrada) se consultan desde el
sistema fuente. Las demás requieren conocimiento del negocio o del cliente.
Cuando el skill se invoca vía `/asdd:data-eng-discover`, el orquestador ya entregó el
contenido completo del Excel (Paso -1) — el agente usa esos datos del contexto y **no lee el
`.xlsx` directamente**. Cuando el skill se invoca standalone, lee
`docs/smart-data/data/smart-data-eng-{cliente}.xlsx` directamente con el tool `Read` y genera
`docs/specs/smart-data-eng-dictionary-{cliente}.md`.

## Procedimiento Sync del diccionario

- **Trigger**: el ingeniero/data steward indica que actualizó el Excel.
- **Prerequisito obligatorio — Excel cerrado:** el archivo `.xlsx` debe estar completamente cerrado antes de ejecutar el Sync. Si Excel tiene el archivo abierto, el agente leerá una versión obsoleta sin error visible.
- **R-G1 — Fecha del documento:** si el Sync produce al menos un cambio en `smart-data-eng-governance-assessment-{cliente}.md`, actualizar el campo `actualizado:` del frontmatter YAML a la fecha de hoy (`YYYY-MM-DD`) antes de cerrar la edición.
- Claude lee `smart-data-eng-{cliente}.xlsx` (pestaña **Diccionario** y pestaña **Fuentes**) directamente.
- Compara contra `smart-data-eng-dictionary-{cliente}.md` existente y detecta el delta.
- Actualiza **solo lo que cambió** en el .md — no reescribe el documento entero
  ni reformatea campos sin cambios.
- **Delta pestaña Fuentes — SLA Origen:** si el valor de SLA Origen de alguna fuente cambió, buscar en `smart-data-eng-governance-assessment-{cliente}.md` todos los gaps que citen ese valor (ej. retención de Event Hubs, ventana de disponibilidad de una fuente) y actualizar la referencia al valor actual. Si el nuevo valor elimina el riesgo del gap → cerrarlo con nota de fecha.
- **Cambio PII=Sí → PII=No:** si el delta incluye campos reclasificados a PII=No, verificar si quedaron gaps de PII en el assessment que ya no apliquen (ej. gaps de propagación en Gold, incoherencia de retención, proceso de purge) y cerrarlos con nota de fecha. No modificar `docs/specs/smart-data-eng-discovery-{cliente}.md` — el discovery no registra ítems de governance.
- **Retención aprobada → cerrar gaps de aprobación**: si el delta incluye campos cuyo `Retención aprobada` cambió de vacío/No a Sí, buscar en `smart-data-eng-governance-assessment-{cliente}.md` los gaps de aprobación de retención para esos campos y cerrarlos con nota de fecha.
- **Tabla/Nombre Silver cambiaron**: si el delta incluye cambios en `Tabla Silver` o `Nombre Silver`, reportar explícitamente: "Cambio de tabla Silver `[anterior]` → `[nueva]` en campo `[campo]` — contratos de datos y referencias en discovery pueden quedar obsoletos." Buscar en `docs/specs/smart-data-eng-discovery-{cliente}.md` referencias al nombre anterior y actualizarlas.
- Propaga el resto del impacto del delta y lo reporta explícitamente:
  - ¿Afecta algún **contrato de datos**? (coordinar con `asdd-data-eng-contract`)
  - ¿Hay algún **campo PII nuevo**? (reabrir Paso 1 y dimensión PII)
  - ¿Cambia algún **pipeline**? (notificar al agente de ingeniería)
- **Historial de sincronización:** si el Sync produjo al menos un cambio en `smart-data-eng-governance-assessment-{cliente}.md`, agregar una fila al final de la tabla `## Historial de sincronización` con: versión (`Sync YYYY-MM-DD`), fecha del día (YYYY-MM-DD) y una línea describiendo qué cambió. Si la sección no existe en el documento, crearla al final antes de cerrar la edición.

### Checklist de escritura atómica post-Sync

Después de determinar qué gaps se cierran y qué gaps nuevos se detectan, aplicar **en este orden exacto** sobre `smart-data-eng-governance-assessment-{cliente}.md`. Completar cada paso antes de pasar al siguiente — si el contexto se corta antes de terminar, reportar explícitamente hasta qué paso se llegó:

1. **Tabla `### Gaps abiertos`**
   - Eliminar cada fila cuyo gap fue cerrado en este Sync.
   - Agregar cada gap nuevo con todas sus columnas: Dimensión, Severidad, Owner, `tipo_accion`, `accion_concreta`, Fecha esperada.
   - No dejar gaps cerrados en esta tabla ni gaps nuevos fuera de ella.

2. **Sección `### Gaps cerrados`** (crearla si no existe)
   - Agregar una entrada por cada gap cerrado: ID, motivo de cierre y fecha.

3. **Sección `## Acciones en Excel`**
   - Eliminar las filas cuyos gaps fueron cerrados en este Sync.
   - Agregar filas para los gaps nuevos con `tipo_accion = excel-update`.
   - Esta sección es proyección directa de los gaps abiertos con `tipo_accion = excel-update` — debe quedar consistente con el paso 1.

4. **Sección `**Próximos pasos por gap**`** (si existe)
   - Eliminar referencias a gaps cerrados en este Sync.
   - Agregar instrucciones `→ Próximo paso` para los gaps nuevos.

5. **Sección `## Resumen ejecutivo`**
   - Recalcular los conteos (`Total abierto`, `Critical`, `High`, `Medium`, `Low`) contando las filas de la tabla `### Gaps abiertos` resultante del paso 1. **No hardcodear** — el número debe derivarse del conteo real.

6. **Sección `## Historial de sincronización`** — siempre la última operación
   - Agregar fila con: versión (`Sync YYYY-MM-DD`), fecha del día y descripción de qué cambió (cuántos gaps cerrados, cuántos nuevos).

**Prohibición de meta-comentarios en el encabezado:** el Sync nunca inserta callouts, notas explicativas ni bloques `> **Sync vX.X...**` en el encabezado del documento. Todo registro de cambio va exclusivamente a `## Historial de sincronización`. Si el Sync necesita advertir sobre datos en transición, usar una sección `## Advertencias activas` que se elimina una vez resuelta la situación.

Este procedimiento aplica el mismo principio Sync del kit: el humano manda en
el artefacto fuente (Excel), Claude solo sincroniza el delta al .md.

## Output

- `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` — inventario sensible, assessment por dimensión con semáforo y reporte de gaps con severidad/owner.
- `docs/specs/smart-data-eng-dictionary-{cliente}.md` — diccionario versionado, generado desde el Excel y mantenido vía Sync.

> **Documentos vivos:** ambos artefactos se actualizan a lo largo del flujo — no son snapshots fijos. El assessment se reabre cuando hay nuevas tablas, campos PII o cambios de compliance. El diccionario se sincroniza vía Procedimiento Sync cada vez que el humano actualiza el Excel. Los gaps se cierran o evolucionan en fases posteriores.

**Estructura obligatoria del assessment:** seguir estrictamente `templates/governance-checklist.md`. No agregar secciones fuera de las definidas en ese template. Secciones prohibidas: "Alineación con el arquitecto", "Qué NO se gobernó en esta iteración" y cualquier otra no listada en el template. Secciones permitidas: Resumen ejecutivo, las 6 dimensiones, Gaps priorizados, Acciones en Excel. Esta restricción aplica al assessment únicamente — el `data-dictionary.md` sigue su propio template.

La sección **"Acciones en Excel"** es una proyección directa de los gaps con `tipo_accion = excel-update`: lista plana con pestaña, columna y qué llenar. No es una lista independiente — deriva de los gaps del reporte y debe ser consistente con ellos.

## Restricciones

- **Nunca** ejecuta grants UC, monitores, pipelines ni código — solo diseña y
  documenta. La ejecución es del agente de ingeniería.
- Trabaja en paralelo con el arquitecto, sin bloquearlo ni ser bloqueado.
- Regulaciones tratadas de forma **genérica** — sin nombrar países ni leyes
  salvo que el contexto del proyecto las especifique.
- No modifica el .xlsx del diccionario: el humano es el dueño del Excel.
  Claude lee para sincronizar — no escribe en el Excel.

## Pestaña Tablas consumo del Excel

Si existe la pestaña `Tablas consumo` en `smart-data-eng-{cliente}.xlsx`, leerla durante el
assessment para validar lineage Gold←Silver.

La pestaña tiene una fila por campo Gold con las siguientes columnas:

| Columna | Descripción |
|---|---|
| `Tabla Gold` | Tabla Gold a la que pertenece el campo |
| `Nombre campo Gold` | Nombre del campo en la tabla Gold |
| `Tipo de dato` | Tipo físico del campo |
| `Descripción de negocio` | Qué representa el campo en términos de negocio |
| `Cómo se calcula` | Transformación aplicada o "Directo desde Silver" si es passthrough |
| `Tablas Silver que usa` | Tabla(s) Silver de donde proviene el dato — es el lineage |
| `Owner` | Equipo responsable del campo |
| `SLA frescura` | Compromiso de disponibilidad respecto a Silver |

**Verificaciones obligatorias:**
- Cada campo Gold con `Tablas Silver que usa` vacío → **gap de lineage** (reportar con severidad High).
- Cada campo Gold con `Owner` vacío → gap de stewardship.
- Campos `Directo desde Silver` sin transformación → lineage trazable ✅.
- Campos con fórmula en `Cómo se calcula` → verificar que la tabla Silver referenciada existe en el Diccionario.

## Cuándo cargar cada reference

| Situación | Cargar |
|---|---|
| Checklist de las 6 dimensiones con semáforo | `templates/governance-checklist.md` |
| Estructura del diccionario en Markdown | `templates/data-dictionary.md` |
| Diccionario (Excel) — vía data-eng-discover | Datos del orquestador (Paso -1) — **no** leer `.xlsx` directamente |
| Diccionario (Excel) — standalone | `docs/smart-data/data/smart-data-eng-{cliente}.xlsx` (pestaña Diccionario) |
| Tablas consumo — vía data-eng-discover | Datos del orquestador (Paso -1) con las **8 columnas por fila** — **no** leer directamente |
| Tablas consumo — standalone | `docs/smart-data/data/smart-data-eng-{cliente}.xlsx` (pestaña Tablas consumo) |
