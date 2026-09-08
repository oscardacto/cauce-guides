---
name: asdd-data-eng-contract
description: Formaliza el contrato de datos productor-consumidor — schema, SLA, ACL. Pertenece a asdd-data-governance.
---

## Rol

Formalizador de contratos de datos inter-equipo. Convierte el acuerdo implícito entre quien produce datos y quien los consume en un documento versionado y verificable. Sin este contrato, los cambios de schema se convierten en incidentes de producción: un consumidor se rompe sin aviso porque una columna cambió de tipo o desapareció.

Este skill **no ejecuta** pipelines, grants de Unity Catalog ni código — solo diseña y documenta el contrato. La aplicación técnica (schemaHints en Silver, grants UC) la ejecuta el equipo de ingeniería.

## Scope check (obligatorio)

Antes de proceder, verificar que el proyecto tiene un componente de plataforma de datos / analytics. Si no lo tiene → **informar al usuario y no proceder**. Un contrato de datos sin productor y consumidor de datos reales no tiene sentido.

## Cuándo invocar

- Dos equipos van a integrar datos y necesitan formalizar la frontera de responsabilidad
- Se formaliza el consumo de una tabla Silver o Gold por un equipo distinto al que la produce
- Hay un cambio de schema sobre una tabla con consumidores activos
- Fase: **Diseñar** (definición del contrato) o **Construir** (formalización pre-integración)

## Cuándo NO invocar

- La integración ocurre dentro del mismo equipo que produce y consume — no hay frontera inter-equipo que formalizar; el costo del contrato no se justifica y un acuerdo en el README del repo basta.
- El consumo es exploratorio, sin SLA ni dependencia productiva (un analista que lee una tabla una vez para un spike) — un contrato impone obligaciones de frescura/uptime que nadie va a cumplir ni necesitar.
- Ya existe un contrato firmado y el cambio es un fix de redacción de una descripción — aplicar el procedimiento Sync (PATCH), no re-derivar el contrato completo.

## Proceso en 3 pasos

### Paso 1 — Identificar las partes y la frontera

Definir con precisión:

- **Productor**: equipo responsable + sistema/pipeline + tabla o topic concreto (ej. `equipo-ingesta` / `transformation-silver` / `cao_{cliente}.silver.polizas`)
- **Consumidor**: equipo + caso de uso concreto (ej. `equipo-analytics` / dashboard de siniestralidad mensual)
- **Frontera del contrato**: el punto exacto donde la responsabilidad cambia de manos. Típicamente una tabla Silver/Gold en Unity Catalog. El equipo productor responde por lo que entrega; el equipo consumidor responde por cómo lo usa.

### Paso 2 — Definir schema comprometido, SLA y ACL

- **Schema comprometido**: lista de columnas con tipo y `nullable`. Es el subconjunto del schema físico que el productor **se compromete a mantener estable**. Columnas internas del productor no listadas aquí no son parte del contrato y pueden cambiar sin aviso.
- **SLA**: frescura (cada cuánto se actualizan los datos), uptime (disponibilidad comprometida de la tabla/endpoint), RPO (Recovery Point Objective — máxima pérdida de datos tolerable ante un fallo).
- **ACL**: quién puede leer (roles/grupos UC autorizados) y quién explícitamente no. El contrato documenta la intención; el equipo de ingeniería aplica los grants.

### Paso 3 — Documentar el proceso de breaking-change

- **Preaviso mínimo de referencia**: 1 día laborable para impacto bajo; 2 días laborables para impacto medio/alto o con consumidores activos en riesgo. No incluye fines de semana ni festivos. Registrar el valor acordado en el contrato.
- **Período de transición**: ambas versiones del schema activas simultáneamente para que el consumidor migre sin downtime.
- **Fecha de corte**: acordada y comunicada — momento en que la versión vieja se retira.
- **Canal de notificación**: definido explícitamente (ej. canal de Slack, lista de correo, ticket) — sin canal, el preaviso no llega.

## Diccionario de datos — 10 campos obligatorios por columna

El humano trabaja el diccionario en `.xlsx`; Claude lee el `.xlsx` directamente (no necesita conversión a CSV). Cada columna del schema comprometido documenta:

1. **nombre** — `snake_case`, igual que en Unity Catalog
2. **tipo de dato** — tipo físico comprometido
3. **nullable** — sí / no
4. **descripción de negocio** — qué representa, en lenguaje de negocio
5. **ejemplo** — un valor representativo
6. **PII** — sí / no (dato personal identificable)
7. **owner del campo** — equipo o rol responsable de su definición
8. **retención** — cuánto tiempo se conserva
9. **tabla entrada** — tabla del sistema origen de la que proviene el campo
10. **regla de calidad** — la validación que debe cumplir (ej. `> 0`, `in (CO, MX)`, formato fecha)

## Versionado semántico

| Cambio | Versión | Ejemplo | Proceso |
|---|---|---|---|
| **MINOR** — compatible | `1.0.0 → 1.1.0` | agregar columna opcional (nullable) | Sin proceso de breaking-change |
| **MAJOR** — incompatible | `1.0.0 → 2.0.0` | renombrar columna, cambiar tipo, eliminar columna | Proceso completo de breaking-change (Paso 3) |
| **PATCH** — documentación | `1.0.0 → 1.0.1` | fix de descripción o corrección de metadato | Sin proceso de breaking-change |

Regla: solo MAJOR dispara el proceso de preaviso, transición y fecha de corte.

## Escenarios de coexistencia

Cuando conviven una fuente legacy y una nueva, el contrato declara cuál de estos 3 escenarios aplica:

- **(a) Migración limpia** — el consumidor corta de la fuente vieja a la nueva en una fecha; no hay convivencia.
- **(b) Coexistencia temporal con fecha de corte** — ambas fuentes activas hasta una fecha acordada, luego se retira la vieja.
- **(c) Coexistencia permanente** — ambas fuentes se mantienen indefinidamente por decisión de negocio; el contrato documenta cuál es autoritativa para qué caso de uso.

## Procedimiento Sync

Cuando el contrato físico firmado llega al equipo en otro formato (Word/PDF, o el humano actualizó el `.xlsx` del diccionario):

1. Claude **lee** el documento entrante (`.xlsx`, `.docx`, `.pdf`).
2. **Compara** con el contract `.md` existente y **detecta el delta** (qué columnas, SLA, ACL o cláusulas cambiaron).
3. **Actualiza SOLO lo que cambió** en el `.md` — no reescribe el documento completo.
4. **Ajusta la versión** según el tipo de cambio detectado (MINOR / MAJOR / PATCH).

## Inputs

- Identificación de equipos productor y consumidor (del discovery o del diccionario)
- Schema físico de la tabla Silver/Gold (de Unity Catalog o del diseño de ingeniería)
- Diccionario de datos en `.xlsx` (cuando existe)
- SLA y políticas de retención del proyecto

## Outputs

- `docs/specs/contracts/smart-data-eng-contract-{productor}-{consumidor}-{version}.md` — contrato versionado

## Cuándo cargar referencias detalladas

| Situación | Cargar |
|---|---|
| Redactar un contrato nuevo desde cero | `templates/data-contract.md` |

## Anti-patterns

- **Schema comprometido = schema físico completo** — listar todas las columnas físicas en el contrato, incluyendo las internas del productor. Esto congela detalles de implementación que el productor necesita evolucionar y dispara breaking-changes innecesarios. El contrato compromete solo lo que el consumidor realmente usa.
- **Breaking-change sin canal de notificación** — definir preaviso pero no decir por dónde llega el aviso. El consumidor se entera cuando su pipeline ya falló. El canal es tan obligatorio como el plazo.
- **Versionar un cambio incompatible como MINOR** — cambiar el tipo de una columna o renombrarla y bumpear `1.1.0` en vez de `2.0.0` para "evitar el proceso". El proceso de breaking-change existe precisamente para estos cambios; saltarlo traslada el incidente a producción del consumidor.
- **Contrato sin owner por campo** — documentar columnas sin responsable. Cuando una regla de calidad falla o una descripción está obsoleta, nadie sabe a quién escalar y el contrato se vuelve un documento muerto.
