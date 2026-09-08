# Smart Data Lineage

Recuerda que **todo dato en producción debe tener lineage trazable desde el origen hasta
el consumo**. Esta rule está siempre activa, con foco especial en las fases **build** y
**validate** del flujo Smart Data (`discover → design → build → validate → publish`).

Complementa `sofka-asdd-data-routing.md` (cómo enrutar requests de governance, tipo D5) y opera
sobre los artefactos de `sofka-asdd-data-governance`: el diccionario de datos y el assessment
de gobernanza.

## LIN-001: El principio — un dato sin lineage no existe formalmente

Si no se puede trazar **de dónde viene** y **a dónde va** un dato, es un **gap de governance**,
no un detalle menor. Un dato sin origen conocido no se documenta como "pendiente": se reporta
como gap crítico y bloquea el avance a producción cuando se trata de datos regulados.

Este principio extiende el primero de Smart Data ("el dato no existe si no está documentado"):
documentar un dato incluye documentar su trazabilidad completa, no solo su definición.

## LIN-002: Qué es lineage en Smart Data

Lineage es el **camino completo** que recorre un dato a través de la arquitectura Medallion:

```
sistema origen → Landing (si aplica) → Bronze → Silver → Gold → consumidor
```

| Nivel de lineage | Qué traza | Cuándo es obligatorio |
|---|---|---|
| **Tabla** | Tabla origen → tabla destino en cada capa | Siempre, para toda tabla de producción |
| **Columna** | Campo origen → campo destino, transformación aplicada | **Obligatorio** para datos regulados o campos PII |

En **Azure + Databricks**, Unity Catalog registra el lineage **automáticamente a nivel de
tabla** a medida que los pipelines se ejecutan. El lineage a nivel de columna se complementa
con el campo "Tabla entrada" del diccionario de datos (ver LIN-005).

## LIN-003: Cuándo verificar lineage (siempre activo en estas situaciones)

El orquestador y los agentes verifican lineage — sin esperar a que el usuario lo pida — en:

| Situación | Verificación |
|---|---|
| Crear una nueva tabla en **Bronze, Silver o Gold** | Confirmar que su tabla origen está registrada y trazable |
| Agregar un nuevo **campo PII** al diccionario | Exigir lineage a nivel de columna desde el sistema origen |
| **Antes de ir a `validate`** | El lineage debe estar trazable para **todas** las tablas de producción |
| Detectar un dato **sin origen conocido** | Reportar como **gap crítico de governance** (no continuar como si fuera menor) |

La verificación previa a `validate` es un criterio de entrada de la fase: si una sola tabla
de producción no tiene lineage trazable, la fase `validate` no se considera lista.

## LIN-004: Qué hacer si el lineage no está completo

Cuando se detecta lineage incompleto o un dato sin origen:

1. **Invocar `@sofka-asdd-data-governance`** para registrar el gap en el assessment y definir
   cómo resolverlo (recuperar el origen, declarar la transformación, completar el diccionario).
2. **No publicar a producción con gaps de lineage en datos regulados.** Para datos no regulados,
   el gap se documenta y se prioriza, pero no bloquea de la misma forma.
3. Registrar la decisión: si el gap se acepta temporalmente, debe quedar explícito quién lo
   acepta y con qué plazo de resolución.

> La invocación de governance es transversal (regla D5 de `sofka-asdd-data-routing.md`): puede
> dispararse en medio de un `build` o un `design` en curso, sin pasar por un command de fase.

## LIN-005: Lineage en el diccionario de datos

El campo **"Tabla entrada"** del `data-dictionary.md` (producido por la skill
`sofka-asdd-data-eng-governance-assessment`) **es la fuente del lineage a nivel de columna**: identifica de qué tabla del sistema origen proviene cada campo.

- Si ese campo está **poblado** → el lineage de columna de ese dato es trazable.
- Si ese campo está **vacío** → es un **gap de lineage** que debe resolverse **antes de
  `validate`**. Un diccionario con campos "Tabla entrada" en blanco no está completo.

Para campos PII y datos regulados, "Tabla entrada" no es opcional: es la evidencia de
que el dato sensible tiene una procedencia conocida y auditable.

## LIN-006: Herramienta en Azure + Databricks — Unity Catalog obligatorio

En proyectos sobre **Azure + Databricks**, `sofka-asdd-data-eng-databricks` debe usar
**Unity Catalog siempre**:

| Catálogo | Lineage | Decisión |
|---|---|---|
| **Unity Catalog** | Registra lineage automáticamente (tabla y, con esfuerzo, columna) | **Usar siempre** |
| **Hive Metastore** | **No** registra lineage | **Nunca usar** — rompe LIN-001 por diseño |

Usar Hive Metastore en una tabla de producción es un gap de lineage automático: ese dato
nace sin trazabilidad. El agente de ingeniería que detecte una tabla en Hive Metastore lo
reporta como gap crítico y propone migrarla a Unity Catalog antes de `validate`.

## Resumen operativo

| Disparador | Acción inmediata |
|---|---|
| Nueva tabla Bronze/Silver/Gold | Verificar origen trazable (LIN-003) |
| Nuevo campo PII | Exigir lineage de columna + "Tabla entrada" en diccionario |
| "Tabla entrada" vacío | Gap de lineage → resolver antes de `validate` (LIN-005) |
| Dato sin origen conocido | Gap crítico → `@sofka-asdd-data-governance` (LIN-004) |
| Tabla en Hive Metastore | Gap crítico → migrar a Unity Catalog (LIN-006) |
| Entrada a `validate` | Lineage trazable para todas las tablas de producción (LIN-003) |
| Gaps de lineage en datos regulados | **No publicar** a producción (LIN-004) |
