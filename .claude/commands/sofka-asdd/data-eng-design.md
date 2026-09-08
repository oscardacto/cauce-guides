---
description: Fase Diseñar de datos — arquitectura y contratos. Produce el smart-data-eng-design y el contrato de Silver.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

Ejecutar la fase **Diseñar** del flujo Smart Data ASDD.

```
discover → [design] → build → validate → publish
```

Esta es la fase donde el modelado conceptual y el diseño formal ocurren en un solo
paso. El `smart-data-eng-design-{cliente}.md` que se produce aquí incluye el modelo
conceptual y es el contrato que el agente de ingeniería leerá en `build`.
**Nada se implementa sin un smart-data-eng-design completo y aprobado.**

## Formato de estado por respuesta

Toda respuesta del orquestador dentro de esta fase abre con un header de una línea:

```
[Fase: Design · Paso: {A|B|C} · Puntos abiertos: N (Y diferidos, Z en verificación)]
```

- `Paso` refleja en qué paso del flujo (A — modelo conceptual, B — resolución de
  puntos abiertos, C — aprobación y generación) está la respuesta actual.
- El conteo de puntos solo aplica desde que PASO A entrega la tabla de puntos
  abiertos. Antes de eso, mostrar solo `[Fase: Design · Paso: A]`.
- Emitir el header al inicio de cada respuesta nueva del turno.

## Prerequisitos

Antes de invocar a cualquier agente, verificar:

**`docs/specs/smart-data-eng-discovery-{cliente}.md` debe existir.** Es el output de
`/sofka-asdd:data-eng-discover` y la fuente de fuentes, dominios y restricciones.
Si **falta** → detener: *"No existe el discovery del cliente. Ejecutá
`/sofka-asdd:data-eng-discover` antes de diseñar la arquitectura."*

## Detección de sesión existente

Verificar si `docs/architecture/smart-data-eng-design-{cliente}.md` ya existe **antes de invocar ningún agente**:

**Sin spec:** iniciar desde PASO A (flujo normal).

**Spec con `Estado: draft` (puntos abiertos sin resolver):** presentar al arquitecto:

> El smart-data-eng-design de `{cliente}` tiene una sesión en curso con puntos pendientes.
> ¿Qué querés hacer?
> 1. Retomar — continuar resolviendo los puntos abiertos desde donde quedó
> 2. Avanzar con los puntos abiertos tal como están (no recomendado — el spec quedará incompleto para `build`)
> 3. Reiniciar el diseño desde cero

Routing según la opción elegida:
- **Opción 1 (Retomar):** ejecutar Paso 0 → ir directamente a **PASO B** con los puntos pendientes del spec. No re-ejecutar PASO A.
- **Opción 2 (Avanzar tal como están):** ir directamente a **PASO C** — no ejecutar Paso 0 ni PASO A.
- **Opción 3 (Reiniciar desde cero):** ejecutar Paso 0 → iniciar **PASO A** completo desde el principio.

**Spec con `Estado: approved`:** presentar:

> El smart-data-eng-design de `{cliente}` ya está aprobado.
> ¿Querés revisarlo o avanzar a `/sofka-asdd:data-eng-build`?

---

## Paso 0 — Declaración de rutas (ART-002, bloqueante)

Antes de invocar a ningún agente, declarar en el plan las rutas **exactas** de
los artefactos de esta fase. No usar placeholders ni slugs sueltos.

Los artefactos Data **no requieren `run-bootstrap` ni `artifact-name.mjs`**: no
se trazan por run ASDD (ADR-003). Sus rutas son literales:

| Artefacto | Ruta |
|---|---|
| Design | `docs/architecture/smart-data-eng-design-{cliente}.md` |
| Contrato Silver | `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{X.Y.Z}.md` |
| ADR de datos (si aplica) | `docs/architecture/decisions/ADR-{NNN}-{titulo}.md` |

> [!warning] Los ADRs no entran por la exención de dominio
> La exención del `artifact-name-guard` cubre solo nombres `smart-data-eng-*`.
> Un ADR bajo `docs/**` sin run activo será denegado por ART-001 — acordar con
> el usuario cómo proceder antes de intentar escribirlo.

Pasar a cada agente **su ruta literal** en el prompt. No lanzar agentes en
paralelo hasta tener todas las rutas declaradas.

## Instrucciones

### Paso -1 — Lectura obligatoria antes de diseñar

Leé COMPLETAS las reglas siguientes antes de invocar cualquier agente:

- `.claude/reference/data-engineering/sofka-asdd-data-eng-workflow.md` sección **SD-002 (DESIGN)** — verificá el criterio de entrada: `docs/specs/smart-data-eng-discovery-{cliente}.md` existe (obligatorio); `smart-data-eng-governance-assessment-{cliente}.md` y `smart-data-eng-dictionary-{cliente}.md` recomendados. Sin el discovery no se procede — detener aquí y volver a `/sofka-asdd:data-eng-discover`. Recordá también el criterio de salida: sin `Estado: approved` en el spec generado + al menos un contrato Silver en `docs/specs/contracts/`, la fase no habilita build.
- `.claude/reference/data-engineering/sofka-asdd-data-eng-schema-contracts.md` — Silver es el contrato. El design produce el contrato Silver del cliente en `docs/specs/contracts/`; clasificá todo cambio de schema como compatible (MINOR/PATCH) o breaking (MAJOR) antes de proponerlo. Sin contrato Silver `Estado: active` la fase no habilita build.
- `.claude/reference/data-engineering/sofka-asdd-data-eng-retention.md` — el design define la retención **por capa** (Landing/Bronze/Silver/Gold) en `smart-data-eng-design-{cliente}.md`. Ninguna capa productiva sin política de retención definida (RET-001..RET-007); para PII, la retención en el diccionario debe ser explícita.
- `.claude/reference/data-engineering/sofka-asdd-data-eng-inter-contracts.md` — si el design introduce un consumidor cross-team (analytics, BI, ML, otro equipo) sobre Silver o Gold, aplicá DC-001 (los 6 elementos obligatorios del contrato inter-equipo) y escalá a `@sofka-asdd-data-governance` para formalizarlo antes de aprobar el design.

### Paso 0 — Extraer "Tablas consumo" del Excel

Ejecutar **antes de invocar cualquier agente**. El orquestador extrae la pestaña
"Tablas consumo" — el schema Gold definido por el cliente — para que el arquitecto
lo reciba en contexto y valide contra Silver en lugar de definir desde cero.

Leer `.sofka-asdd/sofka-asdd.lock`, extraer `project.account` como `{cliente}`.
Luego ejecutar según plataforma:

**Windows — tool `PowerShell`:**
```powershell
& ".\.sofka-asdd\extract-xlsx.ps1" -cliente "{cliente}"
```

**Mac/Linux — tool `Bash`:**
```bash
python3 << 'EOF'
import os, zipfile, xml.etree.ElementTree as ET
cliente = "{cliente}"
src = os.path.join(os.getcwd(), 'docs', 'smart-data', 'data', f'smart-data-eng-{cliente}.xlsx')
NS_M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
with zipfile.ZipFile(src) as z:
    wb   = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid_to_target = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    ss      = ET.fromstring(z.read('xl/sharedStrings.xml'))
    strings = [''.join(t.text or '' for t in si.findall(f'.//{{{NS_M}}}t')) for si in ss]
    for sheet in wb.findall(f'{{{NS_M}}}sheets/{{{NS_M}}}sheet'):
        if sheet.attrib['name'] != 'Tablas consumo': continue
        rid  = sheet.attrib.get(f'{{{NS_R}}}id')
        ws   = ET.fromstring(z.read(f"xl/{rid_to_target[rid]}"))
        rows = []
        for row in ws.findall(f'.//{{{NS_M}}}row'):
            cells = []
            for c in row.findall(f'{{{NS_M}}}c'):
                v = c.find(f'{{{NS_M}}}v')
                cells.append(strings[int(v.text)] if v is not None and v.text and c.attrib.get('t')=='s' else (v.text if v is not None and v.text else ''))
            if any(cells): rows.append(' | '.join(cells))
        print('### Tablas consumo\n' + '\n'.join(rows))
        break
EOF
```

Si la pestaña **no existe** → advertir y continuar:
> ⚠ No se encontró "Tablas consumo" en el Excel. El schema Gold deberá definirse
> en PASO B con input del negocio — los puntos Gold serán 👤, no 🖥️.

### PASO A — Modelo conceptual y propuesta de arquitectura

Invocar **@sofka-asdd-data-architect** y **@sofka-asdd-data-governance** en
**paralelo** sobre `docs/specs/smart-data-eng-discovery-{cliente}.md`,
`docs/specs/smart-data-eng-governance-assessment-{cliente}.md` **y el contenido de "Tablas consumo"
extraído en Paso 0**:

- **Arquitecto**: identifica dominios de datos, distribución preliminar por capa
  Medallion (qué vive en Bronze / Silver / Gold), relaciones entre entidades y
  candidatos PII desde perspectiva del modelo. **Para Gold**: usa el contenido de
  "Tablas consumo" (Paso 0) como schema base — su trabajo es validar que Silver
  soporta cada columna y cálculo, no definir el schema desde cero. Solo abre un
  punto en PASO B si Silver no alcanza, una regla de negocio es ambigua, o falta
  información que "Tablas consumo" no cubre.
- **Governance**: revisa PII, restricciones de compliance que condicionan el modelo
  (retención, campos regulados que no pueden propagarse libremente entre capas).

Consolidar: cruzar candidatos PII del arquitecto con los de governance. Toda
discrepancia queda explícita como punto abierto. Identificar las **restricciones
duras** que el diseño no puede negociar (ej. purge selectivo de PII en Bronze,
clave surrogate no-PII para tablas con datos sensibles, campos de trazabilidad
obligatorios en tablas de riesgo).

**El orquestador verifica decisiones previas antes de listar puntos abiertos:**

1. **Decisiones de governance ratificadas** — leer `smart-data-eng-governance-assessment-{cliente}.md`
   buscando campos con estado "ratificado", "confirmado" o rationale documentado. Si
   un campo PII/compliance ya tiene decisión con fundamento → marcarlo como ✅ en la
   tabla de PASO B, no como ⏳. Solo reabre si hay un conflicto nuevo con el modelo.
2. **Hechos técnicos capturados en discovery** — leer `smart-data-eng-discovery-{cliente}.md`
   buscando hechos sobre relaciones de origen (FK, dependencias, ausencias conocidas).
   Si un hecho ya está documentado → no re-preguntar como punto abierto.
3. **Gaps de contratos** — si governance-assessment reporta ausencia de contratos,
   **no crear punto abierto en PASO B**. Los contratos se generan en la sección
   "Contratos de datos" después de PASO C. Registrarlos solo como nota al pie.

**Cruce obligatorio con el diccionario de datos:** el arquitecto lee
`docs/specs/smart-data-eng-dictionary-{cliente}.md` sección "Schema consolidado — mapeo
Bronze/Silver" **antes de cerrar el modelo conceptual** y cruza cada columna
propuesta contra los tipos del diccionario. Toda divergencia (tipo distinto,
nombre distinto, columna presente en uno pero no en el otro) se registra como
punto abierto en PASO B. No se resuelve silenciosamente ni se asume que el
diccionario está desactualizado sin confirmación explícita.

Si el archivo **no existe**, advertir en consola antes de continuar:
> ⚠ No se encontró `smart-data-eng-dictionary-{cliente}.md`. Los tipos propuestos en este
> diseño no pueden verificarse contra los tipos del origen. Se recomienda correr
> el Procedimiento B de `/sofka-asdd:data-eng-discover` para producirlo antes de
> aprobar el spec.

Al finalizar el PASO A, presentar en consola:
- El modelo conceptual completo (dominios, capas, relaciones, restricciones duras).
- La propuesta de arquitectura (plataforma, patrón, capas, ingesta, costos, riesgos).
- La tabla de puntos abiertos identificados.

**No generar ningún archivo en este paso.** Todo queda en consola hasta completar PASO B.

> **Nota sobre el diagrama:** el agente produce un borrador en Mermaid como insumo técnico. El diagrama final para presentar al cliente lo elabora el Arquitecto de Datos Sofka basándose en ese borrador y en el smart-data-eng-design.

### PASO B — Resolución interactiva de puntos abiertos

Si no hay puntos abiertos, pasar directamente a PASO C.

Si hay puntos abiertos, mostrar primero la tabla completa y la leyenda **una sola vez**:

```
PASO B — Resolución de puntos abiertos

Tenés N puntos para resolver antes de generar el spec:

| Punto | Pregunta | Tipo | Doc de referencia | Cómo responder | Estado |
|---|---|---|---|---|---|
| P-01 | ... | Arquitectura / Negocio / Modelo / Compliance / Governance / Contrato | `discovery` §Sección | 🖥️ / 👤 Quién / 📊 | ⏳ Pendiente |

Criterio de clasificación — Cómo responder:
🖥️  El arquitecto decide en consola usando documentos existentes + patrones conocidos.
    Si el agente tiene una recomendación que el arquitecto puede aceptar o ajustar → siempre 🖥️.
👤  La respuesta no existe en ningún documento ni en "Tablas consumo" y necesita input externo genuino.
📊  El dato debería estar en el Excel y no está — agregarlo y hacer Sync antes de continuar.
⚠️  Antes de clasificar un punto como 👤 sobre existencia de un campo en la fuente:
    verificar contra el diccionario. Si el campo no aparece → la respuesta es 🖥️
    "el campo no existe en la fuente". Si el diccionario no cubre esa fuente →
    es 📊 (completar discover primero). Nunca diferir a build una pregunta
    que el diccionario puede responder ahora.

Para cada punto podés:
A — Responder ahora en consola → lo marco resuelto y paso al siguiente
B — Lo dejo pendiente: asigno responsable y fecha límite → queda en el spec con quién lo resuelve y para cuándo
C — Pausar para verificar o hacer un Sync del Excel → instrucciones al elegir esta opción

📌 Nota contratos: los gaps de governance sobre contratos faltantes no son puntos A/B/C.
   Se generan en la sección "Contratos de datos" después de PASO C.
```

Luego, presentar **una pregunta por vez** sin repetir la leyenda:

```
P-NN — {pregunta específica y recomendación del agente si aplica}
📄 Ver: {doc-referencia} §{sección}  |  {🖥️ Decisión de diseño / 👤 Confirmar con {quién} / 📊 Excel + Sync}
```

Esperar respuesta. Según lo que el arquitecto responda:

- **A (responde ahora):** incorporar la decisión, marcar P-NN como ✅ Resuelto, pasar al siguiente punto.
- **B (difiere):** pedir owner y fecha estimada, marcar P-NN como 🔵 Diferido, pasar al siguiente punto.
- **C — pausa para verificar (sin Excel):** generar el draft del spec en ese momento con el estado
  actual de todos los puntos (✅ los ya resueltos, 🔵 los diferidos, 🔍 el que se pausa, ⏳ los
  restantes). Luego indicar:
  > El spec quedó guardado en `draft` con el progreso actual. Cuando tengas la información, volvé
  > a correr `/sofka-asdd:data-eng-design` — el agente detectará el `draft` y retomará desde el punto
  > en verificación.
- **C — pausa para Sync del Excel:** generar el draft del spec en ese momento con el estado actual
  de todos los puntos. Luego indicar:
  > El spec quedó guardado en `draft`. Cuando tengas el dato:
  > 1. Actualizá el Excel con el dato faltante.
  > 2. Corré `/sofka-asdd:data-eng-discover` → opción 3 (Sync).
  > 3. Volvé a correr `/sofka-asdd:data-eng-design` — el agente detectará el `draft` y retomará desde aquí.

**Regla de avance:** no pasar a PASO C mientras quede algún punto ⏳ Pendiente.
Los puntos 🔵 Diferidos y 🔍 En verificación permiten avanzar si el arquitecto lo aprueba explícitamente.

### PASO C — Aprobación y generación del spec

Con todos los puntos resueltos, diferidos o en verificación, presentar el resumen final y solicitar aprobación:

> Puntos abiertos: X ✅ resueltos · Y 🔵 diferidos · Z 🔍 en verificación.
> ¿Aprobás el diseño para generar el smart-data-eng-design?

Con aprobación explícita:

1. **Generar o actualizar** `docs/architecture/smart-data-eng-design-{cliente}.md`:
   - Si el spec **no existe** aún: crearlo completo con la tabla de puntos y el historial.
   - Si ya existe como `draft` (generado durante una pausa en PASO B): actualizar el estado
     de todos los puntos y agregar una fila al `## Historial de decisiones de diseño`.
   El campo `Estado:` refleja: `approved` si todos los puntos son ✅ Resueltos; `draft` si
   hay puntos 🔵 Diferidos o 🔍 En verificación.
   - Incluir el **schema Gold completo** de todas las tablas de "Tablas consumo" (dimensiones, hechos y derivadas) — columnas, tipos y grain — marcando cuáles fueron validadas contra Silver sin conflicto y cuáles generaron puntos abiertos. Este schema no se infiere: se copia directamente del contenido extraído en Paso 0.
   - Para toda **tabla Gold derivada** (hecho calculado, score, alerta, enriquecimiento) incluir además las reglas de negocio que la producen.
   - Documentar explícitamente todo objeto que tenga tabla Silver pero **no tenga representación en Gold v1** (ej. `silver.talleres → sin dim_taller en Gold v1 — sin requisito de análisis por taller en esta iteración`).

2. **Solo después de confirmar que el spec está escrito en disco**, preguntar:
   > El smart-data-eng-design está generado. ¿Generamos ahora los contratos de Silver y los ADRs, o los dejás para una sesión separada?

---

## Contratos de datos — @sofka-asdd-data-governance

Cuando el arquitecto confirme generar contratos (turno actual o sesión posterior):

Invocar **@sofka-asdd-data-governance** con la skill `sofka-asdd-data-eng-contract`.
La gobernanza opera sobre el spec ya generado — no en paralelo con él.

Definir los **contratos de datos para Silver**:
- **Schema comprometido** — leer `docs/specs/smart-data-eng-dictionary-{cliente}.md` sección "Schema consolidado — mapeo Bronze/Silver" e incluir **todas** las columnas mapeadas a Silver por tabla, no solo las columnas clave del spec. El contrato debe ser exhaustivo: el ingeniero no puede inferir columnas faltantes.
- **SLA** — frescura, disponibilidad, latencia de actualización.
- **ACL** — quién lee y quién escribe cada tabla de Silver.

Producir `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{version}.md` (ver template `data-contract.md`).
Para decisiones mayores, producir el ADR correspondiente en `docs/architecture/decisions/`
(ver template `architecture-adr.md`).

Una vez producidos los artefactos, **actualizar** `docs/architecture/smart-data-eng-design-{cliente}.md`
sección "Próximo paso" / "Pre-condiciones para build":
- Reemplazar la línea de contrato Silver con la referencia al archivo real generado (incluyendo versión) y estado `✅`.
- Eliminar cualquier texto `← pendiente` o pregunta residual sobre contratos que haya quedado del PASO C.

> Plataformas disponibles en v1: **Azure + Databricks** (ADF / ADLS Gen2 /
> Azure Databricks) y **AWS nativo** (Glue / S3 / Athena). La implementación de
> ingeniería en `build` solo está disponible para Databricks en v1.

---

## Artefactos esperados

- `docs/architecture/smart-data-eng-design-{cliente}.md` — **input principal de
  `/sofka-asdd:data-eng-build`**. Se genera en PASO C, primero. Debe estar completo y con
  `Estado: approved` antes de avanzar a `build`.
- `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{version}.md` — contrato de la capa Silver.
  Se genera después del spec, a confirmación del arquitecto.
- Ruta DESIGN reservada con slug `smart-data-eng-adr-{NNN}-{titulo}` — solo si la
  decisión lo amerita; nunca usar el nombre clásico sin prefijo de run.
  Se genera después del spec.

## Criterio de salida

- El smart-data-eng-design tiene `Estado: approved` y fue aprobado por el Arquitecto de Datos Sofka.
- Todos los puntos abiertos están ✅ Resueltos, 🔵 Diferidos con owner/fecha, o 🔍 En verificación con decisión explícita.
- La sección `## Historial de decisiones de diseño` está presente en el spec.
- El spec incluye el schema Gold completo (columnas, tipos, grain) de todas las tablas de "Tablas consumo".
- El contrato de Silver tiene schema, SLA y ACL definidos.

Si el spec tiene `Estado: draft` o puntos ⏳ Pendientes, **no avanzar a `build`** — el spec
es el contrato de implementación y un build sin spec aprobado viola el principio Smart Data
*"el arquitecto diseña, el agente de ingeniería ejecuta"*.

## Siguiente paso

Con el smart-data-eng-design aprobado y el contrato de Silver definido →
`/sofka-asdd:data-eng-build`
