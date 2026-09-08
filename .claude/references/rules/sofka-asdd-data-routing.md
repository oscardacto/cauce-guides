# Smart Data Routing Heuristics

Define cómo el orquestador clasifica un request de datos/analytics y lo enruta al
command, agente o derivación correcta dentro de Smart Data ASDD. Es el equivalente
de `sofka-asdd-routing-heuristics.md` del ASDD base, especializado para el dominio
de plataformas de datos.

El flujo de Smart Data tiene 5 fases (`discover → design → build → validate
→ publish`), expuestas como commands en `.claude/commands/sofka-asdd/` (prefijo `data-eng-`). Esta rule
mapea las señales del request a una de **7 categorías** y resuelve la acción.

## Regla 0 — Scope check primero (siempre)

Antes de clasificar fase o tipo, el orquestador confirma que el request tiene un
componente real de **plataforma de datos / analytics**. Es un scope check
**obligatorio y prioritario** — idéntico al de los tres agentes Smart Data.

- **SÍ es dominio de datos** (proceder): HUB de datos, data lake, data warehouse,
  arquitectura Medallion, ETL/ELT, ingesta de fuentes heterogéneas, BI, dashboards,
  KPIs derivados, Unity Catalog, Databricks, Glue/Athena, data mesh, lineage,
  migración de datos, contrato de datos.
- **NO es dominio de datos** (detener): app web / CRUD, microservicio con
  persistencia transaccional, portal, mobile app, API con modelo de dominio, OLTP
  de aplicación, backend sin analytics.

Si el scope check falla → **D0** (ver tabla). No enrutar a Smart Data.

## Taxonomía de requests — 7 tipos

| Tipo | Nombre | Señales (es / en) | Acción de routing |
|---|---|---|---|
| **D0** | Fuera de dominio | "app web", "CRUD", "microservicio", "backend", "portal", "API de dominio" sin analytics | **Informar al usuario: este proyecto no tiene un componente de datos analíticos. Smart Data ASDD no aplica en este contexto.** Detener. No producir artefactos de datos. |
| **D1** | Discovery / Preventa | "preventa", "propuesta", "firmamos", "discovery", "fuentes", "inventario de datos", "sources", "data sources" | `/sofka-asdd:data-eng-discover` |
| **D3** | Arquitectura / Modelo | "arquitectura", "Medallion", "Star schema", "capas", "plataforma", "ADR", "modelo", "dominios de datos", "diseñá la solución", "architecture", "layers", "data model", "design the solution" | `/sofka-asdd:data-eng-design` |
| **D4** | Ingeniería / Pipelines | "pipeline", "Bronze", "Silver", "Gold", "ingesta", "Auto Loader", "SDP", "transformación", "implementar", "ingest", "transform", "build the pipeline" | `/sofka-asdd:data-eng-build` |
| **D5** | Governance directo | "contrato", "SLA", "ACL", "PII", "lineage", "retención", "diccionario", "governance", "owner de datos", "data contract", "retention" | **`@sofka-asdd-data-governance` directamente** (sin pasar por command) |
| **D6** | Validación | "validar", "verificar", "revisar", "audit", "sign-off", "validate", "verify", "review" | `/sofka-asdd:data-eng-validate` |
| **D7** | Deploy | "deploy", "producción", "publicar", "DABs", "bundle", "prod", "publish", "deploy to prod" | `/sofka-asdd:data-eng-publish` |

> Los equipos mezclan español e inglés en un mismo request ("hacé el pipeline de
> Bronze", "deploy to prod", "Bronze pipeline", "governance check"). Reconocer
> señales en **ambos idiomas** sin penalizar la mezcla.

## Reglas de clasificación

1. **Scope check SIEMPRE primero.** Si es **D0** → detener y derivar al ASDD base.
   No enrutar a ningún command ni agente de Smart Data.
2. **Señales claras → actuar sin preguntar.** Si las señales apuntan inequívocamente
   a un solo tipo (D1–D7), activar el command o agente directo de una vez.
3. **Señales de múltiples tipos → preguntar UNA sola cosa** para desambiguar antes
   de actuar. No lanzar dos commands "por si acaso".
4. **D5 (governance) es transversal.** Puede activarse en **cualquier fase** del
   flujo sin pasar por un command — el orquestador invoca
   `@sofka-asdd-data-governance` directamente cuando aparece una señal de
   gobernanza, incluso en medio de un D3 o D4 en curso.
5. **Fail-safe:** ante cualquier duda sobre el tipo → **preguntar antes de actuar**.
   Nunca asumir el tipo cuando las señales son ambiguas.

### Por qué D5 no pasa por command

Governance trabaja **en paralelo** a arquitectura e ingeniería sobre el mismo
proyecto, sin bloquear a ninguno (ver la relación documentada en el agente
`sofka-asdd-data-governance`). Forzar un command de fase para una consulta de
contrato/PII/lineage rompería esa transversalidad. Por eso D5 es el único tipo que
enruta a un agente directo en lugar de a un command.

## Señales de plataforma

Una vez confirmado el dominio (D1–D7), resolver la plataforma destino para saber
qué agente especialista aplica:

| Señales | Plataforma | Implicación |
|---|---|---|
| Azure, ADF, ADLS Gen2, Event Hubs, Azure Databricks, Unity Catalog | **Azure + Databricks** | Ingeniería → `sofka-asdd-data-eng-databricks` (MCP Databricks activo) |
| Glue, S3, Athena, Redshift | **AWS nativo** | Solo agentes universales en v1. Si piden **ingeniería** → informar que `sofka-asdd-data-eng-aws` **no está disponible aún** (próxima iteración) |
| Sin mención de plataforma | **Resolver del lock** | Leer el campo `data_platform` de `sofka-asdd-smart-data.lock` para decidir |

Los agentes universales (`sofka-asdd-data-architect`, `sofka-asdd-data-governance`)
son agnósticos de plataforma — operan en D1, D3, D5 y D6 sin importar el destino.
La señal de plataforma solo condiciona **D4 (build)** y **D7 (publish)**.

## Resolución completa — tabla de decisión

```
request
  │
  ├─ scope check ── ¿es dominio de datos? ── no ──▶ D0: informar + derivar a sofka-asdd-solution-architect (ASDD base)
  │                                          sí
  │                                           │
  ├─ ¿señal de governance (contrato/PII/lineage/SLA/retención)? ── sí ──▶ D5: @sofka-asdd-data-governance (directo, transversal)
  │                                                                no
  │                                                                 │
  ├─ ¿señales de un solo tipo? ── sí ──▶ activar command:
  │      D1 discover · D3 design · D4 build · D6 validate · D7 publish
  │                                  no
  │                                   │
  └─ ¿señales de múltiples tipos o duda? ──▶ preguntar UNA cosa para desambiguar → reclasificar
```

## Mapeo tipo → fase → agentes primarios

Para el detalle de qué agente actúa en cada fase, ver `CLAUDE.md` (sección Flujo de
trabajo). Resumen operativo:

| Tipo | Command / Agente | Agentes primarios |
|---|---|---|
| D1 | `/sofka-asdd:data-eng-discover` | `sofka-asdd-data-architect` (discovery) · `sofka-asdd-data-governance` (assessment) |
| D3 | `/sofka-asdd:data-eng-design` | `sofka-asdd-data-architect` (modelo conceptual + architecture-design) · `sofka-asdd-data-governance` (contracts) |
| D4 | `/sofka-asdd:data-eng-build` | `sofka-asdd-data-eng-databricks` (solo Azure + Databricks en v1) |
| D5 | `@sofka-asdd-data-governance` | `sofka-asdd-data-governance` (directo, sin command) |
| D6 | `/sofka-asdd:data-eng-validate` | `sofka-asdd-data-architect` · `sofka-asdd-data-governance` |
| D7 | `/sofka-asdd:data-eng-publish` | `sofka-asdd-data-eng-databricks` (DABs) |

## Ejemplos de routing

| Request del usuario | Tipo | Acción |
|---|---|---|
| "Necesitamos una app web de gestión de pólizas con su base de datos" | D0 | Derivar a `sofka-asdd-solution-architect` del ASDD base — sin componente de analytics |
| "Revisá la propuesta de preventa de {cliente} antes de la firma" | D1 | `/sofka-asdd:data-eng-discover` (Procedimiento A — modo crítico) |
| "¿Qué entidades van en Silver y cómo se modela el dominio?" | D3 | `/sofka-asdd:data-eng-design` (el modelo conceptual es el paso 0 interno de design) |
| "Diseñá la arquitectura Medallion y el Star schema de Gold" | D3 | `/sofka-asdd:data-eng-design` |
| "Hacé el pipeline de Bronze con Auto Loader desde ADLS Gen2" | D4 | `/sofka-asdd:data-eng-build` (Azure + Databricks) |
| "Definí el contrato de datos y la clasificación PII de clientes" | D5 | `@sofka-asdd-data-governance` directo |
| "Validá que el diseño respeta los contratos antes del sign-off" | D6 | `/sofka-asdd:data-eng-validate` |
| "Deploy to prod con DABs" | D7 | `/sofka-asdd:data-eng-publish` |
| "Diseñá la solución y de paso armá los pipelines" | D3 + D4 | Señales múltiples → preguntar: ¿hay discovery hecho y arrancamos con design, o ya hay spec aprobada y vamos directo a build? |
| "Armá el pipeline de ingesta sobre Glue y Athena" | D4 (AWS) | Informar que `sofka-asdd-data-eng-aws` no está disponible en v1 (próxima iteración); detener |

## Arbitraje con ORC-001 (ADR-002)

D0-D7 **no reemplaza** el routing ORC-001 del template (fases Especificar…Documentar). Se compone con él: primero ORC-001 fija la fase ASDD, después D0-D7 elige la sub-fase Data dentro de esa fase. Esta regla vive de forma canónica en `sofka-asdd-routing-heuristics.md` sección "Arbitraje ORC-001 ↔ D0-D7 (Smart Data — ADR-002)"; este archivo la refleja para los tipos Data.

### Tabla de correspondencia D → ORC (obligatoria)

| Tipo Data | Fase ORC-001 esperada | Nota |
|---|---|---|
| `D1 discover` | Especificar (soporte Analizar) | Discovery técnico o de preventa |
| `D3 design` | Diseñar | Producir `smart-data-eng-design-{cliente}.md` |
| `D4 build` | Construir | Implementar Bronze→Silver→Gold |
| `D5 governance` | cualquier fase ORC | Transversal — no bloquea otras fases |
| `D6 validate` | Verificar | Sign-off del diseño / contratos |
| `D7 publish` | Verificar (release-gate) o Documentar | Deploy con DABs o reporte final |
| `D0` (fuera de dominio) | ORC-001 estándar | Ni siquiera se activa este archivo |

### Regla de desambiguación software ↔ datos

Cuando el request contiene señales de datos analíticos **y** señales de software transaccional (ej. "el microservicio de reporting escribe a Silver", "migrar la BD del CRM a un data warehouse"), el orquestador **NO auto-elige**. Pregunta al usuario UNA sola vez cuál dominio prevalece antes de aplicar D0-D7. Sin respuesta clara → repetir la pregunta; nunca asumir.

### Sanity check con la fase ORC

Si D0-D7 arroja un tipo cuya fase ORC esperada NO coincide con la fase ORC actualmente activa (ej. señales D4 build cuando ORC-001 dijo "Diseñar"), el orquestador reporta el mismatch al usuario antes de invocar cualquier agente Data. Los saltos de fase ORC no los decide D0-D7 — los decide el usuario o el workflow ASDD estándar.
