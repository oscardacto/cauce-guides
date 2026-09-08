# Smart Data Schema Contracts — Silver es el contrato

Rule **siempre activa** de Smart Data ASDD. Recuerda que la capa **Silver tiene un
schema comprometido** que es el contrato principal con analytics y con todo consumidor
aguas abajo. Aplica en **cualquier momento del flujo** donde se toque el schema de Silver
— no solo en el command `design`. Complementa `asdd-data-routing.md` (D5 governance es
transversal) y la skill `asdd-data-eng-contract`.

## Principio

**Silver es el contrato. No se modifica sin proceso formal.**

Bronze es zona de aterrizaje raw y puede cambiar libremente. Gold deriva de Silver y se
reconstruye. Pero **Silver es la frontera estable**: lo que el productor de datos
garantiza a los consumidores. Cambiar Silver sin proceso rompe dashboards, modelos de ML
y queries de analytics que dependen de su forma exacta.

Esta rule no es un check de fase — es una **verificación reactiva**: cada vez que la
conversación toca Silver, el agente que actúa se detiene y valida contra el contrato
antes de proponer o ejecutar nada.

## Qué es un schema comprometido de Silver

El conjunto de **columnas, tipos, nullable y reglas de calidad** que el productor
garantiza a los consumidores de la capa Silver. Es un compromiso, no una sugerencia.

- Vive en `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{version}.md`
- Se redacta con la skill `asdd-data-eng-contract` (template `data-contract.md`)
- El agente `asdd-data-eng-databricks` lo lee **ANTES** de implementar
  cualquier transformación Bronze→Silver — no después
- Solo las columnas listadas en la sección **Schema comprometido** del contrato son
  vinculantes; columnas fuera de esa tabla pueden cambiar sin proceso

> Regla de oro: si vas a tocar Silver y no leíste el contrato, **no toques Silver todavía**.

## Cuándo aplica esta rule (siempre activa)

| Disparador en la conversación | Acción obligatoria |
|---|---|
| Se menciona "Silver", "schema de Silver", "columnas de Silver", "capa Silver" | Verificar que existe `smart-data-eng-contract-silver-{cliente}-{version}.md`. Si no existe → ver sección "Si no existe contrato". |
| Se propone **agregar** una columna a Silver | Clasificar el cambio (ver tabla). Agregar opcional = compatible. |
| Se propone **cambiar tipo / renombrar / eliminar** una columna de Silver | Clasificar como **breaking change**. Detener y exigir proceso formal. |
| Se propone cambiar el **grain** de una tabla Silver (nivel de agregación, clave) | Breaking change. Detener. |
| Se diseña una transformación Bronze→Silver | Confirmar que el output coincide exactamente con el contrato vigente. |

La rule aplica a los tres agentes Smart Data y al orquestador. No depende de que estemos
en `design` o `build`: si el tema es Silver, la verificación corre.

## Clasificación de cambios en Silver

Todo cambio propuesto sobre Silver se clasifica antes de actuar. Esto determina si hay
proceso formal o no.

| Cambio | Clasificación | Versión | Proceso |
|---|---|---|---|
| Agregar columna **opcional** (nullable) | Compatible | **MINOR** (1.1.0) | No requiere proceso — actualizar contrato e historial |
| Actualizar la **descripción** de una columna | Compatible | **PATCH** (1.0.1) | No requiere proceso |
| Agregar filas / más datos del mismo schema | Compatible | — | No requiere proceso |
| **Renombrar** una columna | Breaking | **MAJOR** (2.0.0) | Preaviso 1-2 días lab. (sin fines de semana/festivos) + actualizar contrato |
| **Cambiar el tipo** de dato de una columna | Breaking | **MAJOR** (2.0.0) | Preaviso 1-2 días lab. (sin fines de semana/festivos) + actualizar contrato |
| **Eliminar** una columna | Breaking | **MAJOR** (2.0.0) | Preaviso 1-2 días lab. (sin fines de semana/festivos) + actualizar contrato |
| Cambiar **nullable** de no→sí en columna existente | Breaking | **MAJOR** (2.0.0) | Preaviso 1-2 días lab. (sin fines de semana/festivos) + actualizar contrato |
| Cambiar el **grain** de la tabla | Breaking | **MAJOR** (2.0.0) | Preaviso 1-2 días lab. (sin fines de semana/festivos) + actualizar contrato |

### Proceso de breaking change (MAJOR)

Un breaking change **nunca se ejecuta en el mismo turno** en que se detecta. El agente:

1. **Detiene** la implementación y anuncia el breaking change al usuario.
2. Invoca `@asdd-data-governance` para gestionar el proceso del contrato.
3. Aplica el **preaviso mínimo** según el impacto: 1 día laborable (impacto bajo, rollback fácil) o 2 días laborables (impacto medio/alto o con consumidores activos). No incluye fines de semana ni festivos.
4. Período de transición: ambas versiones de Silver activas simultáneamente.
5. Actualiza `smart-data-eng-contract-silver-{cliente}-{version}.md` — sube a versión MAJOR y registra el
   cambio en el **Historial de versiones**.
6. Solo después del corte acordado, el agente de ingeniería aplica el cambio.

Los cambios compatibles (MINOR/PATCH) sí pueden proceder en el turno, pero **igual
actualizan el contrato y su historial** antes de cerrar la tarea.

## Si no existe contrato Silver

Cuando se va a tocar Silver y **no existe** `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{version}.md`:

1. **Detener** — no implementar la transformación Bronze→Silver sin contrato.
2. Invocar `@asdd-data-governance` para crearlo usando la skill
   `asdd-data-eng-contract` (template `data-contract.md`).
3. El contrato debe estar redactado y acordado **antes** de que
   `@asdd-data-eng-databricks` implemente.
4. Recién con el contrato vigente, el agente de ingeniería procede.

> El orden es absoluto: **governance define el contrato → ingeniería implementa contra
> él**. Nunca al revés. Esto refleja el principio 4 del CLAUDE.md de Smart Data: "El
> arquitecto diseña, el agente de ingeniería ejecuta, nunca al revés".

## Regla de schemaHints (Bronze que respeta el contrato de Silver)

Auto Loader (`read_files()`) infiere tipos desde los valores del CSV/JSON. La inferencia
es conveniente pero **traicionera**: una columna con dígitos se infiere como `int` aunque
el contrato de Silver la espere como `string` (ej. un código de póliza con ceros a la
izquierda, un NIT, un número de documento).

- Cuando el tipo inferido por Auto Loader **no coincide** con el tipo que el contrato de
  Silver espera → definir **`schemaHints` explícitos en Bronze** para forzar el tipo correcto.
- **Nunca** dejar que Bronze infiera un tipo que Silver va a rechazar. Resolver el tipo en
  el punto de ingesta, no parchearlo en Silver.
- Antes de escribir la ingesta Bronze, contrastar cada columna contra el **Schema
  comprometido** del contrato y declarar `schemaHints` para toda columna donde la
  inferencia diverja del tipo contractual.

Ejemplo: el contrato compromete `numero_poliza` como `string`, pero el CSV solo tiene
dígitos y Auto Loader lo infiere `bigint`. Sin `schemaHints`, Silver recibe un tipo
incompatible y el pipeline rompe el contrato silenciosamente. Con
`.option("cloudFiles.schemaHints", "numero_poliza string")` el tipo queda correcto desde
Bronze y el contrato se cumple.

## Resumen operativo

- Silver = contrato. Tocarlo exige leer `smart-data-eng-contract-silver-{cliente}-{version}.md` primero.
- ¿Compatible? → MINOR/PATCH, actualizar contrato, seguir.
- ¿Breaking? → detener, `@asdd-data-governance`, preaviso 1-2 días laborables, versión MAJOR.
- ¿No hay contrato? → crearlo con governance antes de que ingeniería implemente.
- ¿Tipo inferido ≠ tipo del contrato? → `schemaHints` explícitos en Bronze.
