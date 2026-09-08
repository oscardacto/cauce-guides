---
description: Fase Discover de datos — revisión crítica del material de preventa, inventario de fuentes y assessment de gobernanza.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, PowerShell]
---

Ejecutar la fase **Discover** del workflow Smart Data ASDD. Es la **fase 1 de 5**
(`discover → design → build → validate → publish`) y su objetivo es capturar
el contexto del engagement antes de diseñar nada.

Esta fase tiene **cuatro procedimientos** (A, B, Sync y C) según el momento del engagement y el estado de los artefactos ya producidos.

## Formato de estado por respuesta

Toda respuesta del orquestador dentro de esta fase — después de resolver el Paso 0 —
abre con un header de una línea que ubica al usuario en el flujo:

```
[Fase: Discover · Procedimiento: {A|B|Sync|C} · Gaps abiertos: N (X bloqueantes design)]
```

- `Procedimiento` refleja la opción elegida en el Paso 0.
- `Gaps abiertos` y `bloqueantes design` solo aplican después de Procedimiento B, Sync o C
  (cuando ya existen `smart-data-eng-discovery-{cliente}.md` y
  `smart-data-eng-governance-assessment-{cliente}.md`). Antes de eso, omitir esa parte
  del header y mostrar solo `[Fase: Discover · Procedimiento: {A|B|Sync|C}]`.
- Emitir el header al inicio de cada respuesta nueva del turno — no repetirlo dentro
  de la misma respuesta ni en cada línea.

## Paso -2 — Lectura obligatoria antes de discover

Antes de ejecutar Paso -1, leé COMPLETAS las reglas siguientes:

- `.claude/reference/data-engineering/asdd-data-eng-workflow.md` sección **SD-001 (DISCOVER)** — verificá el criterio de entrada: material de preventa (Procedimiento A) **O** acceso al equipo técnico post-firma (Procedimiento B). Sin al menos uno de los dos, no se puede hacer discovery — informar al usuario y detener antes de intentar extraer material inexistente.
- `.claude/reference/data-engineering/asdd-data-eng-retention.md` — el governance-assessment producido en Procedimiento B define política de retención por campo PII (RET-001..RET-007). Ningún campo PII del diccionario puede quedar sin retención explícita; "indefinido" no es política válida (RET-005).

## Paso -1 — Extraer todo el material disponible

Ejecutar **siempre primero**, antes de cualquier otra lógica. El orquestador extrae
el contenido aquí para que los subagentes lo reciban en contexto — ellos no leen archivos.

**Regla absoluta — fuente de verdad única:** el Excel es el único archivo que se lee
en esta fase. Cualquier otro archivo en `docs/smart-data/data/` (`.pdf`, `.pptx`,
`.docx`, etc.) debe ignorarse completamente — no leer, no referenciar, no inferir.

Leer `.asdd/asdd.lock` con el tool `Read`, extraer `project.account`
como `{cliente}`. Luego ejecutar el script según plataforma — **una sola ejecución,
una sola aprobación**. Sustituir `{cliente}` con el valor real antes de ejecutar.

**Windows — tool `PowerShell`:**
```powershell
& ".\.asdd\extract-xlsx.ps1" -cliente "{cliente}"
```

**Mac/Linux — tool `Bash`:**
```bash
python3 << 'EOF'
import os, zipfile, xml.etree.ElementTree as ET

cliente = "{cliente}"
src  = os.path.join(os.getcwd(), 'docs', 'smart-data', 'data', f'smart-data-eng-{cliente}.xlsx')
skip = {'Guía', 'Guia'}
NS_M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

print(f'[Smart Data] Fuente de verdad: smart-data-eng-{cliente}.xlsx — todos los demás archivos ignorados.')
print('[Smart Data] Extrayendo...')

with zipfile.ZipFile(src) as z:
    wb   = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid_to_target = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    ss      = ET.fromstring(z.read('xl/sharedStrings.xml'))
    strings = [''.join(t.text or '' for t in si.findall(f'.//{{{NS_M}}}t')) for si in ss]

    def parse_sheet(path, name):
        ws   = ET.fromstring(z.read(path))
        rows = []
        for row in ws.findall(f'.//{{{NS_M}}}row'):
            cells = []
            for c in row.findall(f'{{{NS_M}}}c'):
                v = c.find(f'{{{NS_M}}}v')
                if v is not None and v.text:
                    cells.append(strings[int(v.text)] if c.attrib.get('t') == 's' else v.text)
                else:
                    cells.append('')
            if any(cells):
                rows.append(' | '.join(cells))
        return f'### {name}\n' + '\n'.join(rows)

    results = []
    for sheet in wb.findall(f'{{{NS_M}}}sheets/{{{NS_M}}}sheet'):
        name = sheet.attrib['name']
        if name in skip: continue
        rid  = sheet.attrib.get(f'{{{NS_R}}}id')
        path = f"xl/{rid_to_target[rid]}"
        results.append(parse_sheet(path, name))
        print(f'  ✓ {name}')

print(f'[Smart Data] {len(results)} pestañas leídas — listo.')
print('\n\n'.join(results))
EOF
```

Con el contenido del Excel en contexto → continuar al Paso 0.

---

## Paso 0 — Confirmar intención y scope

**1. Scope check**

Confirmar que el proyecto tiene un componente real de plataforma de datos / analytics (HUB de datos, lakehouse, Medallion, ETL/ELT, BI, migración de datos). Si no lo tiene → informar y detener. El scope corresponde al ASDD base (`@asdd-solution-architect`), no a Smart Data.

**2. Preguntar al arquitecto qué quiere hacer**

Hacer esta pregunta al inicio de **toda invocación nueva del skill**, sea por comando explícito (`/asdd:data-eng-discover`) o por lenguaje natural mid-conversation. No auto-detectar ni asumir el procedimiento desde el contexto — mostrar siempre las opciones:

> ¿Qué querés hacer?
> 1. Revisar el documento de preventa antes de presentarlo al cliente
> 2. Producir el discovery técnico con la información del engagement
> 3. Actualicé el Excel — sincronizar el .md
> 4. El archivo estaba abierto durante el último assessment — quiero re-extraer para verificar posibles falsos positivos
> 5. Cerrar gaps antes de avanzar a design

- Opción 1 → **Procedimiento A**
- Opción 2 → **Procedimiento B**
- Opción 3 → **Procedimiento Sync**
- Opción 4 → **Procedimiento Sync** (re-extracción de verificación — sin asumir cambios en el Excel; el objetivo es confirmar que el contenido es el mismo con el archivo correctamente cerrado)
- Opción 5 → **Procedimiento C** (requiere que Procedimiento B ya haya corrido al menos una vez — si no existen `smart-data-eng-discovery-{cliente}.md` y `smart-data-eng-governance-assessment-{cliente}.md`, indicarlo y ofrecer Procedimiento B primero)

---

## Paso 0-bis — Declaración de rutas (ART-002, bloqueante)

Antes de invocar a ningún agente, declarar en el plan las rutas **exactas** de
los artefactos de esta fase. No usar placeholders ni slugs sueltos.

Los artefactos Data **no requieren `run-bootstrap` ni `artifact-name.mjs`**: no
se trazan por run ASDD (ADR-003). Sus rutas son literales:

| Artefacto | Ruta |
|---|---|
| Discovery | `docs/specs/smart-data-eng-discovery-{cliente}.md` |
| Assessment de gobernanza | `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` |
| Diccionario | `docs/specs/smart-data-eng-dictionary-{cliente}.md` |

Pasar a cada agente **su ruta literal** en el prompt. No lanzar agentes en
paralelo hasta tener todas las rutas declaradas.

---

## Procedimiento A — Pre-firma (revisión crítica de preventa)

**Prerequisito:** tener algún documento de preventa para revisar (borrador, PPT, notas — lo que sea).
Si no existe ningún material, indicar que primero hay que conseguirlo y detener el flujo.

1. Invocar **@asdd-data-architect** (skill `asdd-data-eng-discovery`, Procedimiento A) en
   **modo crítico**: solo comentarios y gaps sobre el documento, **sin reescribirlo**. Debe cubrir
   las 7 secciones obligatorias del template de preventa: cliente, problema de negocio, alcance,
   riesgos principales, stack candidato, complejidad estimada, equipo requerido.
2. El arquitecto devuelve una **lista de gaps con severidad** sobre la preventa.
3. **No invocar @asdd-data-governance en Procedimiento A** — sin acceso al equipo técnico del cliente no hay material real que gobernar. La gobernanza entra en el Procedimiento B.

**Artefacto esperado:** lista de gaps sobre la preventa (en conversación, **no se persiste** a disco).

**Siguiente paso:** una vez iniciado el engagement, arrancar las sesiones de discovery
con los equipos técnicos del cliente. El Excel se completa durante esas sesiones
(pestañas Fuentes, Restricciones, Plataforma, Tablas consumo y Diccionario). Cuando el Excel tenga el detalle
técnico real del cliente, correr `/asdd:data-eng-discover` — en ese momento aplica el
Procedimiento B.

---

## Procedimiento B — Discovery técnico + governance assessment

**Prerequisito:** acceso al equipo técnico del cliente **y** el Excel tiene pestañas
técnicas con información real (Fuentes, Restricciones, Plataforma, Tablas consumo, Diccionario) — o las
sesiones de discovery están en curso.

Los dos agentes trabajan en **paralelo** y **ninguno bloquea al otro** — sus outputs son
independientes, ninguno espera al otro para empezar:

1. Invocar **@asdd-data-architect** (skill `asdd-data-eng-discovery`, Procedimiento B):
   inventario de fuentes reales (volúmenes, frecuencias, formatos), escenario de coexistencia con
   sistemas legacy, stakeholders y restricciones técnicas.
2. En paralelo, invocar **@asdd-data-governance** (skill `asdd-data-eng-governance-assessment`):
   assessment inicial de gobernanza — lineage, clasificación PII, retención, compliance genérico y
   stewardship. Tratar las regulaciones de forma **genérica**, sin nombrar países ni leyes concretas.

   > **Datos obligatorios del Paso -1 — pasar al agente íntegros, sin filtrar, sin resumir, sin omitir columnas:**
   > - Pestaña **Diccionario**: todas las filas y las **18 columnas** completas por tabla, incluyendo `Transformación` (columna 17) para cada fila de cada tabla fuente. No omitir filas ni columnas aunque parezcan vacías.
   > - Pestaña **Tablas consumo**: campo a campo con las **8 columnas** por fila: `Tabla Gold`, `Nombre campo Gold`, `Tipo de dato`, `Descripción de negocio`, `Cómo se calcula`, `Tablas Silver que usa`, `Owner`, `SLA frescura`. No pasar solo los nombres de tabla.
   > - Pestaña **Fuentes**: contenido completo.
   >
   > El agente de gobernanza **no lee el archivo Excel directamente en este flujo** — depende de que el orquestador le entregue estos datos íntegros desde el extracto del Paso -1.
3. Si un agente detecta un conflicto con el dominio del otro, lo **reporta como gap** — no edita el
   artefacto del otro agente.

**Artefactos esperados:**
- `docs/specs/smart-data-eng-discovery-{cliente}.md` — inventario de fuentes, coexistencia, stakeholders, restricciones.
- `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` — gaps de lineage, PII, retención y compliance.
- `docs/specs/smart-data-eng-dictionary-{cliente}.md` — schema consolidado por tabla: mapeo Bronze/Silver, tipos, PII, retención. Producido cuando la pestaña Diccionario del Excel tiene datos. Si no existe al iniciar design, design.md advertirá que los tipos no pudieron verificarse contra el origen, pero no bloqueará.

**Siguiente paso:** una vez `smart-data-eng-discovery-{cliente}.md` y `smart-data-eng-governance-assessment-{cliente}.md` están validados por el equipo → `/asdd:data-eng-design`. Si el diccionario también fue producido, validarlo antes de diseñar.

**Formato de cierre en consola:** al finalizar, mostrar únicamente la tabla de artefactos con estado y una sola línea de validación. No resumir hallazgos ni listar gaps en consola — el detalle completo está en los `.md` generados:

> Revisá ambos artefactos en disco antes de continuar. Cuando los hayas validado, corrés `/asdd:data-eng-design`.

---

## Procedimiento Sync — Actualización delta desde Excel

**Trigger:** el usuario seleccionó la opción 3 (actualizó el Excel) o la opción 4 (verificación de posibles falsos positivos por archivo abierto durante el assessment). En el caso de la opción 4, el Sync corre sin asumir que hubo cambios — su objetivo es re-extraer el Excel cerrado y confirmar que el contenido es consistente con el assessment anterior.

> **Prerequisito — Excel cerrado:** el archivo `.xlsx` debe estar **completamente cerrado** antes de invocar los agentes. Si Excel tiene el archivo abierto, los agentes leerán una versión obsoleta sin error visible y el Sync no reflejará los cambios.

Ejecutar los dos Syncs en **paralelo** — cada agente lee solo sus pestañas y actualiza solo su `.md`:

1. Invocar **@asdd-data-architect** (skill `asdd-data-eng-discovery`, Procedimiento Sync):
   lee las pestañas **Fuentes, Restricciones, Plataforma, Stakeholders y Tablas consumo** — detecta el delta
   y actualiza solo lo que cambió en `docs/specs/smart-data-eng-discovery-{cliente}.md`.

2. En paralelo, invocar **@asdd-data-governance** (skill `asdd-data-eng-governance-assessment`, Procedimiento Sync):
   lee la pestaña **Diccionario** — detecta el delta y actualiza solo lo que cambió en
   `docs/specs/smart-data-eng-dictionary-{cliente}.md` y `docs/specs/smart-data-eng-governance-assessment-{cliente}.md`.

**Artefactos que pueden actualizarse:**
- `docs/specs/smart-data-eng-discovery-{cliente}.md` — si cambiaron Fuentes, Restricciones, Plataforma, Stakeholders o Tablas consumo.
- `docs/specs/smart-data-eng-dictionary-{cliente}.md` y `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` — si cambió Diccionario.

**Paso 3 — Chequeo automático de consistencia spec vs diccionario:**

Después de actualizar los artefactos, verificar si existe `docs/architecture/smart-data-eng-design-{cliente}.md`
con `Estado: approved`. Si existe, cruzar el §"Schema consolidado — mapeo Bronze/Silver" del
diccionario actualizado contra los tipos y nombres de columna del spec. Reportar en consola
**toda divergencia** — tipo distinto, nombre distinto, columna presente en uno pero no en el otro:

```
⚠ Divergencias detectadas entre diccionario actualizado y spec aprobado:

| Tabla | Campo | Spec | Diccionario | Impacto |
|---|---|---|---|---|
| silver.X | columna_Y | string | bigint | join de tipo distinto |

Estas divergencias deben resolverse antes de continuar a build.
Opciones: (A) corregir el spec vía @asdd-data-architect · (B) corregir el diccionario
si el spec es la fuente correcta · (C) registrar como punto abierto diferido con owner/fecha.
```

Si no hay divergencias → mostrar solo: `✅ Diccionario y spec consistentes — sin divergencias de tipo o nombre.`

**Paso 4 — Reconciliación de gaps duplicados entre discovery y governance:**

Los dos agentes leen la misma pestaña `Tablas consumo` en paralelo y pueden detectar el
mismo hallazgo de forma independiente, cada uno con su propio esquema de ID (`G-NN` en
discovery, `GOV-NNN` en governance). Después de que ambos Syncs terminan:

1. Comparar los gaps **nuevos** de esta corrida en `smart-data-eng-discovery-{cliente}.md`
   (sección de hallazgos nuevos) contra los gaps **nuevos** en
   `smart-data-eng-governance-assessment-{cliente}.md` (`### Gaps abiertos`, filas agregadas
   en este Sync).
2. Un gap es duplicado si describe el **mismo objeto y el mismo problema** (misma tabla o
   campo, misma causa raíz) aunque el texto difiera. Ejemplos: "tabla X sin consumidor en
   Gold" en discovery y "tabla X sin owner en Tablas consumo" en governance sobre la misma
   tabla y el mismo motivo son el mismo hallazgo. Ante duda razonable, no fusionar — mejor
   un duplicado visible que perder un hallazgo real.
3. Para cada duplicado confirmado: mantener el ID de **governance** (`GOV-NNN`) como
   referencia canónica — es el artefacto de la tabla estructurada de gaps con severidad y
   owner. En `smart-data-eng-discovery-{cliente}.md`, no eliminar la entrada — anotarla como
   `(ver GOV-NNN en governance-assessment)` en lugar de duplicar la descripción completa.
4. Reportar en consola:

```
🔗 Gaps duplicados reconciliados en este Sync:
| Discovery | Governance | Hallazgo |
|---|---|---|
| G-17 | GOV-033 | cotizaciones/talleres sin consumidor en Gold v1 |

(vacío si no hubo duplicados en esta corrida)
```

**Formato de cierre en consola:** mostrar únicamente la tabla de artefactos con estado (✅ actualizado / — sin cambios detectados), el resultado del chequeo de consistencia y una sola línea de validación:

> Revisá los artefactos actualizados en disco. Cuando los hayas validado, corrés `/asdd:data-eng-design`.

---

## Procedimiento C — Cierre de gaps

**Trigger:** el usuario seleccionó la opción 5, o pide en lenguaje natural "cerrar gaps", "cerrar la fase" o equivalente estando en Discover.

**Prerequisito:** `smart-data-eng-discovery-{cliente}.md` y `smart-data-eng-governance-assessment-{cliente}.md` deben existir (Procedimiento B ya corrió al menos una vez). Si falta alguno, informar cuál falta y ofrecer correr Procedimiento B antes de continuar.

**Criterio operacional de "validado" (SD-001):** cero gaps `tipo_accion = conversation` sin resolver y cero gaps `Critical` abiertos. Gaps `High`/`Medium`/`Low` y los de `tipo_accion = design-decision`/`build-task` pueden quedar abiertos con owner y fecha — no bloquean el avance a design, quedan documentados como puntos que design/build heredan.

### Paso 1 — Leer y consolidar gaps abiertos

Leer la tabla `### Gaps abiertos` de `smart-data-eng-governance-assessment-{cliente}.md` y los bloques de gaps inline (formato A.3/B.5, sin tabla estructurada) de `smart-data-eng-discovery-{cliente}.md`. Si ya corrió la reconciliación de duplicados del Procedimiento Sync (ver sección de arriba), los gaps con nota `(ver GOV-NNN en governance-assessment)` cuentan una sola vez, por su ID canónico `GOV-NNN`.

### Paso 2 — Semáforo por `tipo_accion`

**Nota de origen:** `conversation` solo puede originarse en `smart-data-eng-discovery-{cliente}.md` (skill `asdd-data-eng-discovery`, Procedimientos A/B). El agente de gobernanza (`asdd-data-governance`) nunca genera gaps `conversation` — su vocabulario de `tipo_accion` es únicamente `excel-update`, `human-approval`, `design-decision`, `build-task`. Al consolidar el semáforo, la fila `conversation` cuenta exclusivamente gaps del discovery.

Mostrar la tabla completa una sola vez al iniciar el procedimiento:

```
[Fase: Discover · Procedimiento: C · Gaps abiertos: N (X+Y bloqueantes design)]

| tipo_accion       | Cantidad | Bloquea avance a design |
|---|---|---|
| conversation       | X        | Sí — resolver ahora     |
| excel-update        | Y        | Sí — requiere Sync      |
| human-approval      | Z        | No (solo bloquea publish)|
| design-decision     | W        | No — se difiere         |
| build-task          | V        | No — se difiere         |

Bloqueantes reales para avanzar a design: X+Y
```

Si `Bloqueantes reales = 0`, saltar directo al Paso 4 (criterio de salida).

### Paso 3 — Resolución interactiva de bloqueantes

Presentar **un gap por vez**, en orden: primero todos los `conversation`, luego todos los `excel-update`.

**Gaps `tipo_accion = conversation`:**

```
GAP-ID — {descripción del gap}
```

Esperar la respuesta del usuario. **Regla de trazabilidad obligatoria:** la respuesta dada en el chat se escribe textualmente en el gap dentro de `smart-data-eng-discovery-{cliente}.md` — reemplazar el campo `Sugerencia` / `→ Próximo paso` por la resolución dada y marcar el bloque del gap como `[RESUELTO — Procedimiento C, YYYY-MM-DD]` al inicio de su línea de severidad. `smart-data-eng-discovery-{cliente}.md` no tiene una tabla `### Gaps abiertos`/`### Gaps cerrados` estructurada como governance-assessment — los gaps son bloques inline por sección (formato A.3/B.5 del skill `asdd-data-eng-discovery`); el cierre se marca en el propio bloque, no moviendo filas de tabla. Un gap `conversation` **nunca se cierra solo verbalmente** — sin la escritura en disco, sigue abierto aunque el usuario haya respondido.

**Gaps `tipo_accion = excel-update`:**

Mostrar qué pestaña/columna completar (ya definido en `→ Próximo paso` del gap) y indicar:

> Este gap requiere actualizar el Excel. Cuando lo completes, corré `/asdd:data-eng-discover` → opción 3 (Sync) para cerrarlo.

No se cierra en esta sesión — queda marcado como "esperando Sync" y se excluye del conteo de bloqueantes pendientes de conversación, pero sigue contando como bloqueante hasta que el Sync lo cierre.

### Paso 4 — Criterio de salida

Cuando `conversation` y `excel-update` (ya sincronizados) llegan a cero:

> Cero bloqueantes para design. Quedan {N} puntos diferidos (documentados con owner/fecha) que design y build heredan.
> ¿Avanzamos a `/asdd:data-eng-design`?

Si aún quedan gaps `excel-update` pendientes de Sync, no mostrar este mensaje — indicar en su lugar cuántos quedan y que el criterio de salida se reevalúa después del próximo Sync.

**Escritura atómica — governance-assessment:** los gaps `excel-update` cerrados por Sync en `smart-data-eng-governance-assessment-{cliente}.md` siguen el "Checklist de escritura atómica post-Sync" ya definido en `asdd-data-eng-governance-assessment/SKILL.md` (mover de `### Gaps abiertos` a `### Gaps cerrados`, recalcular `## Resumen ejecutivo` sin hardcodear, agregar fila al `## Historial de sincronización` con motivo `"Cierre de gaps — Procedimiento C"`). Este procedimiento no introduce un checklist nuevo — reutiliza el existente.

**Escritura atómica — discovery:** los gaps `conversation` cerrados en `smart-data-eng-discovery-{cliente}.md` se marcan inline en su propio bloque (ver Paso 3), y se agrega una fila al `## Historial de sincronización` de ese archivo (mismo patrón del Procedimiento Sync del skill `asdd-data-eng-discovery`) con motivo `"Cierre de gaps — Procedimiento C"`.

---

## Notas de ejecución

- El Paso 0 (selección de procedimiento) se ejecuta al inicio de **toda invocación nueva** — sea por comando explícito o por lenguaje natural mid-conversation. No auto-detectar ni saltear el Paso 0 aunque el procedimiento parezca obvio por contexto.
- Los agentes **no ejecutan** pipelines, grants de Unity Catalog ni código en esta fase: solo capturan
  contexto y documentan.

## Siguiente paso del flujo

- Procedimiento A → completar el Excel con el equipo técnico del cliente durante las sesiones de discovery, luego correr `/asdd:data-eng-discover` (Procedimiento B).
- Procedimiento B → si hay gaps abiertos, correr Procedimiento C para cerrarlos; si el Excel necesita completarse antes, correr Procedimiento Sync después de actualizarlo.
- Procedimiento Sync → si el chequeo de consistencia y la reconciliación de duplicados no dejan divergencias pendientes, correr Procedimiento C para confirmar el criterio de salida.
- Procedimiento C, con cero bloqueantes (`conversation`/`excel-update`) → `/asdd:data-eng-design`.
