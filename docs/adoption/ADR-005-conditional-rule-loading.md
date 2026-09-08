# ADR-005 — Carga condicional de rules: rules de dominio fuera del auto-load

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico: `docs/architecture/decisions/ADR-005-conditional-rule-loading.md`. Vive en `docs/adoption/` porque los guards WF-002/WF-003 y `artifact-name-guard` bloquean escrituras en `docs/architecture/` y `docs/specs/` sin run activo (mismo motivo que ADR-002/ADR-003). El developer que promueva este ADR a `Aceptada` debe moverlo al hogar canónico como último paso.

- **Estado:** Propuesta
- **Fecha:** 2026-07-07
- **Deciders:** _(pendiente — requiere aprobación explícita del maintainer del template)_
- **Autor:** sofka-asdd (WU-T2)
- **Rama de trabajo:** `feature/subagent-context-diet`
- **Relacionados:** ADR-002 (Smart Data flow isolation), ADR-003 (analyze-guard domain-aware), ADR-004 (spec-per-área). Complementario — no sustituye a ninguno.
- **Convención de numeración:** ADR-001…ADR-004 existen; este es el siguiente secuencial → **ADR-005**.

---

## Contexto

Todo archivo `.claude/rules/*.md` se comporta como **memoria auto-cargada**: Claude Code lo inyecta en el contexto de cada sesión Y lo **hereda a cada sub-agente** que el orquestador lanza. El template acumuló 34 rules, muchas de ellas específicas de un solo dominio (pipeline ATF Web, Smart Data). Varias de esas rules son archivos grandes (`sofka-asdd-atf-web-orchestrator-fastpath-rules.md`, `sofka-asdd-atf-web-executor-invariants.md` superan las 400-600 líneas cada uno).

**Root-cause del thrashing:** el auto-load hereda TODAS las rules a TODOS los sub-agentes, independientemente de su dominio. Esto fija un **piso de contexto de ~110k tokens** antes de que el sub-agente lea un solo archivo de trabajo. En modelos `sonnet` (ventana efectiva menor que `opus`), ese piso dispara **auto-compactación temprana** (thrashing): el agente compacta, pierde contexto útil, vuelve a cargar, y el ciclo degrada la calidad del razonamiento y quema turnos.

**Restricción de diseño:** NO se resuelve forzando `opus` en todos los sub-agentes. Muchos equipos operan con licencias chicas donde `opus` quema cuota rápidamente; el modelo por fase ya está calibrado (`model_strategy` en el lock) y `sonnet` es el default correcto para las fases mecánicas. El problema es el **piso de memoria**, no el modelo. Bajar el piso es la solución correcta y backward-compatible.

## Decisión

**Mover las rules de dominio fuera de `.claude/rules/` a `.claude/reference/{domain}/`, un directorio que NO es auto-cargado.** Los agentes que las necesitan las **referencian y leen por path explícito** cuando entran en su flujo (igual que ya leen sus phase-specs, skills y tools).

Esto convierte la carga de rules de dominio de **incondicional (auto-load heredado)** a **condicional (lectura explícita bajo demanda)**. Las rules universales y de orquestación —que SÍ aplican a cualquier agente en cualquier momento— permanecen en `.claude/rules/` con auto-load intacto.

Ningún contenido se pierde ni se reescribe: los archivos se mueven con `git mv` y los agentes de dominio ya los referencian por ruta relativa (`reference/{domain}/…`).

## Clasificación de rules

Se clasifican en tres categorías según a quién aplican:

| Categoría | Aplica a | Auto-load | Ubicación |
|---|---|---|---|
| **Universal** | Todo agente, todo momento (git-safety, anti-loops, data-boundary, system-integrity, ephemeral-artifacts, memory-*, spanish-orthography, skill-preflight, claude-md-maintenance) | Sí (necesario) | `.claude/rules/` |
| **Orquestación** | Orquestador + routing en todo request (orchestration*, workflow*, routing-heuristics*, checkpoint-resume, phases-reference, orchestration-tdd/worktree/plan-gate/ops) | Sí (necesario) | `.claude/rules/` |
| **Dominio** | Solo agentes de un pipeline específico (ATF Web, Smart Data) | **No** — lectura explícita | `.claude/reference/{domain}/` |

### Qué se movió (5 rules ATF Web → `.claude/reference/atf-web/`)

**ATF Web → `.claude/reference/atf-web/` (5, commit `1d4c421`):**
- `sofka-asdd-atf-web-cp-enricher-invariants.md`
- `sofka-asdd-atf-web-cp-enricher-invariants-deep.md`
- `sofka-asdd-atf-web-executor-invariants.md`
- `sofka-asdd-atf-web-knowledge-access-contract.md`
- `sofka-asdd-atf-web-orchestrator-fastpath-rules.md`

Las 5 rules ATF Web tienen un **punto de lectura explícito**: el pipeline las carga por path desde `sofka-asdd-atf-web-qa-engineer.md` y sus phase-specs (`execute.md`, etc.) en el orden de lectura de cada fase. Moverlas fuera del auto-load NO las deja huérfanas — el pipeline las lee cuando entra en su flujo. Este es el único movimiento que quedó vigente.

### Qué se intentó mover y se REVIRTIÓ (6 rules Smart Data → auto-load)

Las 6 rules Smart Data se movieron a `.claude/reference/smart-data/` (commit `62978b6`) y luego **se revirtieron al auto-load** (`.claude/rules/`):

- `sofka-asdd-data-routing.md`
- `sofka-asdd-data-workflow.md`
- `sofka-asdd-data-schema-contracts.md`
- `sofka-asdd-data-lineage.md`
- `sofka-asdd-data-retention.md`
- `sofka-asdd-data-inter-contracts.md`

**Motivo (LECCIÓN):** a diferencia de las ATF Web, estas rules son **transversales "siempre activas"** — gobiernan a los agentes Data (schema contracts, lineage, retención, contratos inter-equipo, workflow de fases) de forma **reactiva, en cualquier momento del flujo, SIN un punto de lectura explícito**. Ningún agente ni command las leía por path desde `reference/smart-data/`. Al retirarlas del auto-load quedaron **huérfanas**: los agentes Data perdieron su gobernanza en runtime (nadie las inyectaba). La auditoría lo detectó y se revirtieron al auto-load.

> **Lección general del conditional-loading:** mover una rule fuera del auto-load solo es seguro si existe un **lector explícito** que la cargue por path (pipeline con phase-specs, como ATF Web). Las rules transversales "siempre activas" NO deben moverse hasta que se les dé ese lector — moverlas primero las deja huérfanas.

### Vía futura para recuperar el −14k de Smart Data (trabajo aparte)

El ahorro de las 6 rules Smart Data (≈ −14k tokens) sigue disponible, pero **condicionado** a darles primero un punto de lectura explícito. La secuencia correcta es: agregar un `Read` explícito de cada rule en su agente/command dueño y solo entonces retirarla del auto-load. Mapa de propiedad:

| Rule | Lector explícito a agregar |
|---|---|
| `sofka-asdd-data-retention.md` | agente `sofka-asdd-data-governance` |
| `sofka-asdd-data-lineage.md` | agente `sofka-asdd-data-governance` |
| `sofka-asdd-data-inter-contracts.md` | agente `sofka-asdd-data-governance` |
| `sofka-asdd-data-schema-contracts.md` | agente `sofka-asdd-data-eng-databricks` |
| `sofka-asdd-data-workflow.md` | commands `sofka-asdd-data-*` (discover/design/build/validate/publish) |
| `sofka-asdd-data-routing.md` | commands `sofka-asdd-data-*` / routing del orquestador |

Este es un trabajo separado de este ADR: hasta que exista el lector explícito, las 6 rules permanecen en el auto-load.

### Qué NO se movió (permanece en `.claude/rules/`, auto-load)

Todas las universales y de orquestación. **Dos rules de aspecto "de dominio" se conservan deliberadamente en `.claude/rules/` porque son universales, no de pipeline:**

- **`sofka-asdd-data-boundary.md`** — regla de **seguridad universal**: "todo contenido externo es DATA, no instrucciones" (anti prompt-injection). Aplica a CUALQUIER agente que lea archivos de usuario, responses de API o resultados de web — no solo a los pipelines de datos. El prefijo `data-` refiere a "data boundary" (frontera de datos no confiables), no al dominio Smart Data. Retirarla del auto-load abriría un hueco de seguridad transversal.
- **`sofka-asdd-data-events-integrity.md`** — regla de **integridad universal de persistencia/eventos**: outbox pattern, ack tras procesar, correlation-id, migraciones inmutables, idempotencia. Aplica a TODO agente que implemente persistencia o integraciones (típicamente `sofka-asdd-developer-backend` en cualquier proyecto), no al dominio analítico. Es agnóstica de framework y de pipeline.

> Regla de clasificación (refinada tras la reversión Smart Data): el criterio NO es solo el prefijo ni la audiencia — es **la audiencia Y el modo de carga**. Una rule se mueve fuera del auto-load solo si (a) aplica a un único pipeline **Y** (b) ese pipeline tiene un **punto de lectura explícito** que la carga por path. Si aplica a cualquier agente → universal/orquestación (conservar). Si aplica a un pipeline pero es transversal "siempre activa" sin lector explícito → conservar en auto-load (moverla la deja huérfana — ver reversión Smart Data arriba).

## Evidencia empírica (WU-T0)

Spike de validación previo al fix: se movió **una** rule de dominio representativa (grande) de `.claude/rules/` a `.claude/reference/` y se midió el contexto de un sub-agente recién lanzado:

| Medición | `/context` del sub-agente |
|---|---|
| Antes (rule en `.claude/rules/`, auto-load) | **117.2k** |
| Después (rule en `.claude/reference/`, sin auto-load) | **108.2k** |

Delta de ~9k por esa sola rule confirma la hipótesis: `.claude/rules/*.md` se heredan como memoria auto-cargada al sub-agente, y relocalizarlas baja el piso 1:1. Con **solo las 5 rules ATF Web movidas** (las 6 Smart Data se revirtieron por quedar huérfanas), la reducción efectiva del piso es **≈ −17k tokens**. El −14k restante de las rules Smart Data queda como trabajo futuro (ver §Vía futura), condicionado a darles un punto de lectura explícito antes de retirarlas del auto-load.

## Convención `.claude/reference/`

Se establece `.claude/reference/{domain}/` como **hogar canónico de las rules de dominio**:

- **NO es auto-cargado** por Claude Code (a diferencia de `.claude/rules/`). Vivir aquí = "no inflar el contexto de agentes que no lo necesitan".
- Las rules conservan su naming (`sofka-asdd-{topic}.md`) — solo cambia el directorio, no el nombre (ver `.claude/docs/adoption/naming-convention.md` §3.5).
- Los agentes de dominio las **cargan por lectura explícita** (`Read` sobre `reference/{domain}/…`) o las referencian por path en sus specs cuando la fase lo requiere. Ej.: `sofka-asdd-atf-web-qa-engineer.md` ya cita `reference/atf-web/sofka-asdd-atf-web-orchestrator-fastpath-rules.md § P26` por ruta.
- Subcarpeta por dominio (`atf-web/`, `smart-data/`) para aislamiento y descubribilidad.

Un contenido que aplica a "cualquier agente" NUNCA vive en `.claude/reference/` — eso lo volvería invisible a agentes que lo necesitan. `.claude/reference/` es exclusivamente para material condicional de dominio.

## Limitación conocida / follow-up

El check `broken-skill-references` de `validate-template.mjs` usa el patrón:

```
/\b(reference|templates|examples)\/([\w.-]+\.(?:md|json|yaml|yml|txt))/g
```

que solo resuelve referencias de **un nivel** (`reference/X.md`). Las rutas de **dos niveles** que introduce esta decisión (`reference/{domain}/X.md`, ej. `reference/atf-web/sofka-asdd-atf-web-executor-invariants.md`) **no son validadas** — el segmento intermedio `{domain}/` sin extensión rompe el match, así que esas referencias ni se verifican ni se marcan como rotas.

**Follow-up recomendado:** endurecer `broken-skill-references` para soportar rutas anidadas (`reference/{domain}/X.md`), de modo que un typo en un path de dominio se detecte mecánicamente. Además, el check hoy solo inspecciona `.claude/skills/*/SKILL.md`; conviene extenderlo a `.claude/agents/*.md`, que son quienes referencian las rules de dominio bajo `reference/`. Trabajo separado de este ADR.

## Consecuencias

**Positivas:**
- Piso de contexto de sub-agentes ≈ −17k tokens (solo ATF Web movidas) → menos thrashing de auto-compactación en `sonnet`, sin forzar `opus`. El −14k de Smart Data queda pendiente hasta darles un lector explícito.
- Separación explícita audiencia-universal vs audiencia-de-dominio; el auto-load queda reservado para lo que de verdad aplica a todos.
- Backward-compatible: los agentes de dominio ya referencian por path; ningún contenido cambió.

**Negativas / trade-offs:**
- Un agente de dominio que **olvide** leer su rule de `reference/` opera sin ese contrato. Mitigación: las specs de los agentes de dominio referencian las rules por path en el orden de lectura de cada fase.
- El validador no verifica rutas de 2 niveles todavía (ver Follow-up) → un typo en un path de dominio no se detecta hasta runtime.

### Alternativas evaluadas

- **Alt-A — Forzar `opus` en todos los sub-agentes.** Descartada: quema licencias chicas y no ataca el root-cause (el piso de memoria heredada persiste).
- **Alt-B — Borrar/adelgazar las rules de dominio.** Descartada: el contenido es normativo y necesario para sus pipelines; el problema es *dónde* se carga, no *qué* dice.
- **Alt-C — Mover TODAS las rules a `reference/` y cargarlas siempre por path.** Descartada: las universales/orquestación aplican a todo request; leerlas por path en cada agente reintroduce el costo que se busca evitar y agrega fragilidad.

---

## Enmienda 1 — Migración Smart-Data (opción b): darles lector explícito antes de mover

- **Estado de la enmienda:** Propuesta
- **Fecha:** 2026-07-07
- **Autor:** sofka-asdd-solution-architect (diseño)
- **Rama de trabajo:** `feature/subagent-context-diet`
- **Alcance:** diseño de la migración segura de las 6 rules Smart-Data que la §"Vía futura" dejó pendiente. NO ejecuta la migración (eso es fase Construir, ciclo aparte). Solo define el contrato: qué se mueve, quién lo lee, con qué instrucción textual, y en qué orden.

### E1.0 — Por qué esta enmienda existe

La §"Vía futura para recuperar el −14k de Smart Data" dejó un mapa de propiedad rule → lector, pero sin diseño ejecutable. El intento previo (commit `62978b6`) movió las 6 rules sin darles lector y quedaron huérfanas → revert `bcdab3f`. Esta enmienda cierra ese gap: para cada rule movible define **el lector concreto, el punto de lectura en runtime y la instrucción textual exacta**, respetando la lección del ADR: *mover una rule fuera del auto-load solo es seguro si un agente o command la LEE por path en el momento correcto*.

### E1.1 — Hallazgo que corrige la hipótesis inicial: el `rules:` frontmatter NO es el mecanismo de carga

Los agentes `sofka-asdd-atf-web-qa-engineer` y `sofka-asdd-atf-api-qa-engineer` declaran un key `rules:` en su frontmatter que lista rutas `reference/atf-web/…`. La hipótesis natural sería "agregar las rules Smart-Data a un `rules:` frontmatter y listo". **Es incorrecto y hay evidencia interna que lo demuestra:**

- Si el key `rules:` del frontmatter auto-cargara esas rutas al contexto del agente, mover las rules ATF Web a `reference/` **no habría ahorrado nada** (se re-cargarían por el frontmatter). Pero el ADR mide un ahorro real de ≈ −17k. Por lo tanto, `rules:` frontmatter **no dispara auto-load** — es documentación de intención, no un mecanismo de carga.
- El mecanismo **load-bearing** real de ATF Web es la **instrucción explícita de lectura en el cuerpo del prompt**, verificable en `sofka-asdd-atf-web-qa-engineer.md` línea 840: *"3. `.claude/reference/atf-web/sofka-asdd-atf-web-executor-invariants.md` — reglas inviolables (lectura COMPLETA)."* — más los punteros `[Detalle: reference/atf-web/…]` inline por fase.

**Consecuencia de diseño (no negociable):** el lector de cada rule Smart-Data es una **instrucción `Read` explícita en el cuerpo** del agente o command, ejecutada en el momento de fase correcto. El key `rules:` frontmatter se agrega en paralelo **solo por consistencia con ATF Web y descubribilidad**, pero **el diseño no depende de él**. La verificación de si `rules:` frontmatter auto-carga queda como check de la WU de verificación (E1.6, WU-6).

### E1.2 — Tabla maestra: rule → destino → lector → mecanismo de lectura

Las 5 rules con lector limpio se mueven a `.claude/reference/smart-data/` (conservan su naming). `data-routing` es caso especial (E1.3). Cada rule recibe un **Paso 0 de lectura** en el cuerpo de su(s) lector(es):

| # | Rule (líneas) | Destino | Lector(es) en runtime | Punto de lectura | Instrucción textual exacta a insertar |
|---|---|---|---|---|---|
| 1 | `sofka-asdd-data-schema-contracts.md` (122) | `reference/smart-data/` | `sofka-asdd-data-eng-databricks` (build) **y** `sofka-asdd-data-architect` (design) | eng: antes del Paso 1 "Leer la spec completa" del Flujo de trabajo · architect: en `sofka-asdd-data-architecture-design` antes de diseñar capa Silver | `Paso 0 (obligatorio antes de tocar Silver): leé COMPLETO `.claude/reference/smart-data/sofka-asdd-data-schema-contracts.md`. Silver es el contrato; clasificá todo cambio de schema como compatible (MINOR/PATCH) o breaking (MAJOR) antes de proponer o implementar.` |
| 2 | `sofka-asdd-data-inter-contracts.md` (114) | `reference/smart-data/` | `sofka-asdd-data-governance` (owner) **y** `sofka-asdd-data-architect` (detecta integración inter-equipo en design) | governance: antes de activar skill `sofka-asdd-data-contract` · architect: en design cuando aparece un consumidor cross-team | `Paso 0 (si el request toca consumo de datos entre equipos, SLA, ACL o breaking change): leé COMPLETO `.claude/reference/smart-data/sofka-asdd-data-inter-contracts.md` y aplicá DC-000..DC-007 (6 elementos obligatorios del contrato).` |
| 3 | `sofka-asdd-data-retention.md` (128) | `reference/smart-data/` | `sofka-asdd-data-governance` (owner, retención de campo PII) **y** `sofka-asdd-data-architect` (retención de capa en el design) | governance: antes de `sofka-asdd-data-governance-assessment` · architect: al definir retención por capa en `smart-data-design` | `Paso 0 (al crear/diseñar cualquier tabla o campo PII): leé COMPLETO `.claude/reference/smart-data/sofka-asdd-data-retention.md`. Ninguna tabla sin retención; ningún campo PII sin retención explícita (RET-005).` |
| 4 | `sofka-asdd-data-lineage.md` (101) | `reference/smart-data/` | `sofka-asdd-data-governance` **y** `sofka-asdd-data-eng-databricks` **y** command `data-validate.md` **y** command `data-build.md` | governance/eng: Paso 0 de su flujo · commands: Paso 0 del command | `Paso 0 (verificación de lineage — LIN-003): leé COMPLETO `.claude/reference/smart-data/sofka-asdd-data-lineage.md`. Toda tabla de producción exige lineage trazable; "Tabla entrada" vacío = gap. Antes de validate, lineage trazable para todas las tablas.` |
| 5 | `sofka-asdd-data-workflow.md` (90) | `reference/smart-data/` | los **5 commands** `data-discover / data-design / data-build / data-validate / data-publish` | Paso 0 de cada command (antes del Paso -1 de extracción o inmediatamente después) | `Paso 0 (gate de fase): leé de `.claude/reference/data-engineering/sofka-asdd-data-eng-workflow.md` la sección SD-00{N} correspondiente a esta fase y verificá criterios de entrada/salida antes de proceder.` |

Notas de la tabla:
- Los lectores son **agentes y commands** cuyo prompt **no se hereda** al piso de otros sub-agentes (el frontmatter/cuerpo de un agente solo entra en el contexto de ESE agente; los commands solo cargan al invocarse). Por eso agregar estos Paso 0 **no re-infla** el piso compartido — es exactamente el punto de la carga condicional.
- Rule 4 y Rule 5 tienen lector en **command**: es el punto más robusto, porque una fase Smart-Data **no puede ejecutarse sin su command**, así que la lectura está garantizada al abrir la fase.

### E1.3 — Manejo de `data-routing` (caso duro): inline lo load-bearing, mueve el detalle

`sofka-asdd-data-routing.md` (151 líneas) se consulta a **nivel orquestador ANTES de que corra cualquier agente o command** → no tiene punto de lectura de agente. Moverla entera la orfanaría (nadie la lee en el instante del routing). Diseño en dos partes:

**(a) INLINE en `sofka-asdd-routing-heuristics.md` (que YA está en auto-load):** lo estrictamente necesario para enrutar. Hoy `routing-heuristics.md` ya contiene la sección canónica *"Arbitraje ORC-001 ↔ D0-D7 (Smart Data — ADR-002)"* con la tabla D→fase→agente. Falta inlinear:
  - El **scope check condensado** (Regla 0 de data-routing): 3-4 líneas — "¿el request tiene componente de datos analíticos? SÍ: HUB/lakehouse/Medallion/ETL/Databricks/Unity Catalog/lineage… NO: app CRUD/microservicio/OLTP → D0, derivar a solution-architect".
  - La **tabla de taxonomía D0-D7** (7 filas: tipo · señales es/en · acción de routing) — es la decisión de routing propiamente dicha, ~15 líneas condensadas.
  - Total inline: **~20-25 líneas** agregadas a un archivo ya auto-cargado (costo marginal ~0.4-0.5k tokens).

**(b) MOVER a `reference/smart-data/sofka-asdd-data-routing.md` el detalle NO load-bearing:** señales de plataforma (Azure/Databricks vs AWS nativo) en profundidad, el árbol de decisión ASCII completo, la tabla de ejemplos de routing, el mapeo tipo→fase→agentes primarios extendido y el rationale "por qué D5 no pasa por command". ~120-125 líneas.

**Lector del detalle movido:** los 5 commands `data-*` pueden referenciarlo on-demand para desambiguar edge-cases de plataforma (puntero `[Detalle de routing y señales de plataforma: reference/smart-data/sofka-asdd-data-routing.md]`). **Reconocimiento honesto:** este es el único movimiento donde el archivo de reference tiene un lector **débil** (consulta opcional, no obligatoria). Es aceptable **porque la parte que DEBE dispararse en runtime (la decisión de routing) queda inlineada en auto-load**; el reference es documentación-grade, no enforcement. Si el equipo prefiere máxima seguridad, la WU-5 es **opcional y saltable** (ver E1.5): saltarla deja `data-routing` completa en auto-load y se pierde solo ~2k del ahorro.

### E1.4 — Cláusulas de orquestador problemáticas: decisión explícita

| Cláusula | Actor citado | Riesgo si se mueve | Decisión | Justificación |
|---|---|---|---|---|
| **LIN-003** (`data-lineage`) | "El orquestador y los agentes verifican lineage… antes de validate" | Medio — el orquestador pierde el recordatorio transversal de verificar lineage | **Refactor vía command.** El gate "antes de validate" se absorbe en `data-validate.md` (que lee `data-lineage` en su Paso 0); los triggers "crear tabla / agregar campo PII" quedan cubiertos por governance + eng leyéndola. | La verificación concreta (campo "Tabla entrada", Unity Catalog, detección Hive Metastore) siempre la ejecutan governance/eng/command, nunca el orquestador solo. El command es punto de lectura garantizado. Riesgo baja a **Bajo**. |
| **Gates SD-00x** (`data-workflow`) | "Claude verifica el prerequisito de cada fase ANTES de proceder" | Medio — el orquestador pierde la pre-validación de fase antes de invocar el command | **Refactor vía command.** Cada `data-{fase}.md` lee su sección SD-00x en Paso 0 y valida entrada/salida. | Una fase no corre sin su command → el gate SIEMPRE dispara, un nivel más profundo pero en el punto de enforcement real. Riesgo baja a **Bajo**. |
| **Routing D0-D7** (`data-routing`) | Orquestador enruta antes de cualquier agente | Alto — sin lector de agente en el instante del routing | **Inline (no mover entero).** La tabla D0-D7 + scope check se inlinean en `routing-heuristics.md` (auto-load); el detalle va a reference como documentación. | El routing debe estar en auto-load por definición; inlinearlo es la única forma segura. Ver E1.3. Riesgo residual **Bajo** sobre la decisión de routing; el reference detail es no-crítico. |
| **"Silver es el contrato"** (`data-schema-contracts`) | Rule "siempre activa cuando se toca Silver"; el orquestador la usa en el plan-gate | Bajo — el orquestador pierde awareness de breaking-change al planear | **Aceptar.** eng + architect la leen y la enforzan al tocar Silver. | Toda modificación de schema Silver pasa por un agente data que la lee; la enforcement sobrevive aunque el orquestador no la tenga en el plan-gate. Riesgo **Bajo**. |

Ninguna de las 5 rules movibles queda con una cláusula de orquestador **sin punto de lectura de reemplazo**. `data-routing` no se mueve entera precisamente por eso.

### E1.5 — Ahorro estimado (calibrado con el −14k del ADR y line counts reales)

Calibración: 706 líneas (las 6 rules) ≈ 14k tokens del ADR → **~20 tokens/línea** (incluye overhead de auto-load).

| Rule | Líneas | Tokens aprox. | Movimiento | Ahorro del piso |
|---|---|---|---|---|
| `data-schema-contracts` | 122 | ~2.4k | mueve entera | ~2.4k |
| `data-inter-contracts` | 114 | ~2.3k | mueve entera | ~2.3k |
| `data-retention` | 128 | ~2.5k | mueve entera | ~2.5k |
| `data-lineage` | 101 | ~2.0k | mueve entera | ~2.0k |
| `data-workflow` | 90 | ~1.8k | mueve entera | ~1.8k |
| `data-routing` | 151 | ~3.0k | inline ~25 líneas / mueve ~126 | ~2.0k neto (−2.5k movido, +0.5k inline en routing-heuristics) |
| **Total** | **706** | **~14.0k** | — | **≈ 13.0k** |

- **Con WU-5 (routing):** ≈ **−13.0k tokens** del piso heredado por cada sub-agente.
- **Sin WU-5 (conservador):** ≈ **−11.0k tokens**; `data-routing` queda en auto-load.
- Las instrucciones `Read` de Paso 0 agregan pocas líneas a agentes/commands, pero **no suman al piso compartido** (no se heredan a otros sub-agentes). Costo neto sobre el piso ≈ 0.
- Sumado a las 5 rules ATF Web ya movidas (≈ −17k), el piso combinado baja ≈ **−30k tokens** respecto al estado pre-ADR.

### E1.6 — Plan de implementación por WU (fase Construir, ciclo aparte)

**Principio de seguridad (de la lección `bcdab3f`):** en cada WU, **agregar el lector ANTES o en el MISMO commit que el `git mv`**. Nunca mover primero y agregar lector después — eso abre una ventana de orfandad. Cada WU es atómica y ≤400 líneas de diff.

| WU | Alcance | Archivos tocados | Cómo se testea |
|---|---|---|---|
| **WU-1** | `data-schema-contracts` → reference + lectores | edita `sofka-asdd-data-eng-databricks.md` (Paso 0) y `sofka-asdd-data-architect.md` (Paso 0 en design); `git mv` de la rule | `validate-template.mjs` verde; grep que ambos agentes citan `reference/smart-data/sofka-asdd-data-schema-contracts.md` |
| **WU-2** | `data-retention` + `data-inter-contracts` → reference + lectores | edita `sofka-asdd-data-governance.md` (2 Paso 0) y `sofka-asdd-data-architect.md` (retención de capa); `git mv` de las 2 rules | validador verde; grep de las 2 rutas en governance |
| **WU-3** | `data-lineage` → reference + lectores | edita `sofka-asdd-data-governance.md`, `sofka-asdd-data-eng-databricks.md`, `data-validate.md`, `data-build.md`; `git mv` | validador verde; grep de la ruta en los 4 lectores |
| **WU-4** | `data-workflow` → reference + lectores | edita los 5 commands `data-*.md` (Paso 0 apuntando a su SD-00x); `git mv` | validador verde; grep de la ruta en los 5 commands |
| **WU-5** *(opcional)* | `data-routing`: inline en `routing-heuristics.md` + mover detalle a reference | edita `sofka-asdd-routing-heuristics.md` (inline scope check + tabla D0-D7); crea `reference/smart-data/sofka-asdd-data-routing.md` con el detalle; punteros en los 5 commands | validador verde; confirmar que la tabla D0-D7 quedó en auto-load; un request data de prueba enruta correcto |
| **WU-6** | **Actualización de contadores + verificación en consumidor real** | actualiza conteo de rules en `.sofka-asdd/sofka-asdd.lock` (29 → 24, o 23 con WU-5) y el expected del validador; endurece `broken-skill-references` para rutas de 2 niveles y lo extiende a `.claude/agents/*.md` (follow-up del ADR §Limitación) | **Test en `/tmp/test-data-*`**: instalar el template en un proyecto consumidor, correr cada fase Smart-Data (`/sofka-asdd:data-eng-discover → …→ data-eng-validate`) y confirmar en el transcript que **cada agente/command efectivamente ejecutó el `Read` de su rule de `reference/smart-data/`**. Sin esa evidencia, la WU no cierra. |

Orden recomendado: WU-1 → WU-2 → WU-3 → WU-4 → (WU-5 opcional) → WU-6. WU-6 es obligatoria y cierra el ciclo con la prueba en consumidor real que faltó en `62978b6`.

### E1.7 — Riesgos y criterio de reversión

**Cómo detectar orfandad (una rule movida que nadie carga en runtime):**
1. **Test de consumidor (WU-6):** correr el flujo Smart-Data completo y verificar en el transcript que aparece el `Read` de cada `reference/smart-data/*.md`. Si un flujo completa una fase **sin** haber leído su rule → orfandad → revertir esa rule al auto-load.
2. **Grep estático de lectores:** por cada rule en `reference/smart-data/`, debe existir ≥1 agente/command que la cite por path en su cuerpo. `broken-skill-references` endurecido (WU-6) lo verifica mecánicamente.
3. **Señal de gobernanza perdida:** si un pipeline Smart-Data pasa a `validate`/`publish` sin gate de lineage o retención (ej. tabla PII sin retención llega a publish), es síntoma de que la rule no se cargó → investigar el punto de lectura.

**Criterio de reversión (por rule, no en bloque):** si la WU-6 demuestra que una rule específica no se lee en su fase, **revertir SOLO esa rule** al auto-load (`git mv` inverso) y dejar las demás movidas. No repetir el error de `62978b6` de mover/revertir en bloque — la migración es incremental y cada rule se valida por separado.

**Trade-off aceptado:** un agente de dominio que **olvide** ejecutar su Paso 0 opera sin el contrato. Mitigación: (a) el Paso 0 va al inicio del flujo del agente, antes de cualquier acción; (b) los lectores en command (WU-4, LIN-003 en validate) son el punto más robusto porque la fase no corre sin el command; (c) `data-routing` NO se mueve entera, evitando el caso más frágil.

### E1.8 — Estado final de la ejecución

- **Rama de trabajo:** `feature/smart-data-context-diet` (derivada de `feature/subagent-context-diet`, MR !208 sin cambios).
- **WU-0** DONE — `ff38c8d` — commit del diseño de esta Enmienda (ADR-005).
- **WU-1** DONE — `0020653` — `data-schema-contracts.md` → `reference/smart-data/`; Read Paso 0 en `sofka-asdd-data-eng-databricks` (Flujo de trabajo) y `sofka-asdd-data-architect` (lectura obligatoria antes de diseñar). Lock 29 → 28.
- **WU-2** DONE — `9c19925` — `data-retention.md` + `data-inter-contracts.md` → `reference/smart-data/`; Read Paso 0 en `sofka-asdd-data-governance` (nueva sección "Lectura obligatoria antes de gobernar") y extensión en `sofka-asdd-data-architect`. Lock 28 → 26.
- **WU-3** DONE — `bbff6e4` — `data-lineage.md` → `reference/smart-data/`; Read en `sofka-asdd-data-governance` + `sofka-asdd-data-eng-databricks` + commands `data-build` y `data-validate` (este último absorbe LIN-003 como criterio de entrada). Lock 26 → 25.
- **WU-4** DONE — `cbd3357` — `data-workflow.md` → `reference/smart-data/`; Read en los 5 commands `data-*` citando su sección `SD-00x` respectiva como criterio de entrada. Lock 25 → 24.
- **WU-5** DIFERIDO — decisión de mantener `data-routing` en `.claude/rules/` (auto-load). Es routing crítico del orquestador consultado ANTES de que corra cualquier agente, sin punto de lectura de agente en el instante del routing (E1.3). El ahorro adicional (≈ −2k) no justifica el riesgo residual de que el orquestador pierda la tabla D0-D7 inline. Queda como mejora futura si se prueba en consumidor real que el inline+detalle-en-reference funciona sin regresiones de routing.
- **WU-6a** DONE — commit de este cierre — check nuevo `reference-path-integrity` en `.claude/scripts/validate-template.mjs` (error, escanea agentes + commands, matchea `.claude/reference/{domain}/*.{md,json,yaml,yml,txt}` y verifica existencia), Enmienda cerrada, changelog actualizado. **Verificación empírica del check:** al eliminar temporalmente `reference/smart-data/sofka-asdd-data-lineage.md`, el validador reporta `ERR` señalando los 4 lectores exactos (`data-eng-databricks`, `data-governance`, `data-build`, `data-validate`). Al restaurar, VERDE. Prueba de fuego contra orfandad futura pasada.

#### Tabla consolidada — cadena migrada (5 rules)

| Rule (destino) | Líneas | Lector(es) en runtime | Punto de lectura |
|---|---|---|---|
| `reference/smart-data/sofka-asdd-data-schema-contracts.md` | 122 | `sofka-asdd-data-eng-databricks.md:115`, `sofka-asdd-data-architect.md:58` | Paso 0 antes de tocar Silver (eng) / Paso 0 lectura obligatoria antes de diseñar Silver (architect) |
| `reference/smart-data/sofka-asdd-data-retention.md` | 128 | `sofka-asdd-data-governance.md:60`, `sofka-asdd-data-architect.md:59` | Paso 0 antes de gobernar (governance) / Retención por capa en design (architect) |
| `reference/smart-data/sofka-asdd-data-inter-contracts.md` | 114 | `sofka-asdd-data-governance.md:61`, `sofka-asdd-data-architect.md:60` | Paso 0 antes de gobernar (governance) / Integración cross-team en design (architect) |
| `reference/smart-data/sofka-asdd-data-lineage.md` | 101 | `sofka-asdd-data-governance.md:62`, `sofka-asdd-data-eng-databricks.md:117`, `data-build.md:114`, `data-validate.md:53` | Paso 0 governance/eng + gate de entrada en commands (validate absorbe LIN-003 del orquestador) |
| `reference/data-engineering/sofka-asdd-data-eng-workflow.md` | 90 | `data-discover.md:14`, `data-design.md:56`, `data-build.md:115`, `data-validate.md:53`, `data-publish.md:62` | Paso 0/-1/-2 de cada uno de los 5 commands, apuntando a su sección SD-00x |

Total movido: **555 líneas** (5 rules) del auto-load. Piso reducido según calibración del ADR (~20 tokens/línea, ver E1.5): **≈ −11k tokens** del contexto heredado por cada sub-agente. Sumado a las 5 rules ATF Web ya movidas (≈ −17k), el piso combinado baja ≈ **−28k tokens** respecto al estado pre-ADR (el −30k proyectado en E1.5 sale con WU-5 completa; sin ella queda en −28k).

#### Verificación consolidada

- **Cero refs colgantes operativas** a las rutas viejas (`.claude/rules/sofka-asdd-data-{schema-contracts,retention,inter-contracts,lineage,workflow}.md`). Las cross-refs por nombre en otras rules (`data-inter-contracts` menciona `data-schema-contracts` por nombre) y en skills (`sofka-asdd-data-architecture-design/SKILL.md`) siguen válidas — el archivo existe, solo cambió de directorio. Dos hits históricos en `ASDD-CHANGELOG.md` y `docs/adoption/ADR-003-domain-aware-analyze-guard.md` son descriptivos y no operativos (documentan el estado previo a la migración); el check `reference-path-integrity` los excluye por diseño.
- **Baseline del validador:** VERDE — `21 ok, 2 warn, 1 error`. El único `error` (`no-hardcoded-paths`) es **preexistente** en `.claude/settings.local.json` (untracked, config personal), sin relación con esta migración.
- **`sofka-asdd-counts`:** OK — `.claude/rules/` tiene 24 archivos, coincidente con `manifest.rules = 24` en el lock.
- **Nuevo check `reference-path-integrity`:** OK — 10 paths distintos verificados (5 Smart-Data movidas por esta Enmienda + 5 ATF-web citadas por `sofka-asdd-atf-web-qa-engineer` en v2.27.0). Cierra el gap del follow-up del ADR original (§Limitación) para rutas de 2 niveles.
- **Self-test `test-guards-chain-data.mjs`:** 15 PASS / 0 FAIL.

#### Hallazgo de diseño verificado tres veces

Ninguno de los agentes/commands lectores (data-eng-databricks, data-architect, data-governance, ni los 5 commands data-*) declara el key `rules:` en su frontmatter. El **único mecanismo real de carga** de las rules movidas es la instrucción `Read` explícita en el CUERPO del agente/command (patrón ATF-web `sofka-asdd-atf-web-qa-engineer.md ~L840`). La hipótesis E1.1 queda confirmada empíricamente por la migración.

### E1.9 — Hallazgo runtime WU-6b y refuerzo WU-7

El test de consumidor real de WU-6b arrojó un hallazgo que corrige la calibración de "lectores" hecha en E1.2:

- **Los agentes Data corrieron con 0 tool uses en el flujo de discover del consumidor.** Recibieron el prompt y contestaron de memoria — la instrucción `Read` en su Paso 0 (Enmienda 1 §E1.2, mapeo original) **no se disparó en runtime** cuando fueron invocados vía command con contexto pre-cargado por el orquestador. No es un bug: el patrón de invocación via Task/sub-agent con `prompt` que ya trae los datos extraídos hace que el sub-agente responda directamente sin abrir tools.
- **El command `/sofka-asdd:data-eng-discover` SÍ disparó `Read` de `.claude/reference/data-engineering/sofka-asdd-data-eng-workflow.md`** en el mismo test — el command ejecuta su Paso -2 en el turno del orquestador (no en un sub-agent), donde los tool calls sí son visibles y se ejecutan.

**Conclusión:** el lector **command** es confiable (dispara en el turno del orquestador); el lector **agente** es best-effort (puede ser saltado si el orquestador pre-carga contexto en el prompt del Task). Esto no invalida la migración de rules a `reference/` — sigue bajando el piso — pero requiere robustecer el lado del **flujo normal** (que arranca por command) para que las rules de dominio se carguen deterministicamente.

**WU-7 — Refuerzo: lector command para las 3 reglas "soft":** las reglas que en la Enmienda 1 original quedaron con lector solo en agente (`data-schema-contracts`, `data-retention`, `data-inter-contracts`) suman ahora lector en el(los) command(s) donde su aplicación es semánticamente correcta. Ninguna rule se mueve — ya están en `reference/`. Solo se extienden los "Paso 0" existentes de los commands. Los lectores agente se mantienen como best-effort (§E1.2, sin cambios): si el sub-agente sí abre tools, tiene el `Read` disponible; si no, el command ya lo cargó por él.

**Mapa post-WU-7 — command → reglas que lee en Paso 0:**

| Command | workflow | lineage | schema-contracts | retention | inter-contracts |
|---|---|---|---|---|---|
| `data-discover` | SD-001 | — | — | ✓ (WU-7) | — |
| `data-design` | SD-002 | — | ✓ (WU-7) | ✓ (WU-7) | ✓ (WU-7) |
| `data-build` | SD-003 | ✓ | ✓ (WU-7) | — | — |
| `data-validate` | SD-004 | ✓ (absorbe LIN-003) | — | — | ✓ (WU-7) |
| `data-publish` | SD-005 | — | — | — | — |

Cada regla de las 5 movidas queda leída por al menos un command en la fase correspondiente:
- **schema-contracts** → design (produce) + build (consume). Contrato definido en design, respetado en build.
- **retention** → discover (assessment) + design (por capa). PII sin retención = gap en discover; capa sin retención = gap en design.
- **inter-contracts** → design (formaliza) + validate (verifica cumplimiento). Contrato inter-equipo formalizado en design y auditado en validate.
- **lineage** → build (LIN-003 tablas nuevas) + validate (gate de entrada absorbiendo LIN-003).
- **workflow** → los 5 commands (SD-001..SD-005), gate de fase.

**Commit WU-7:** ver historial de la rama. El check `reference-path-integrity` sigue OK con 10 paths distintos verificados (los mismos 5 Smart-Data + 5 ATF-web; WU-7 no agregó rutas nuevas, solo aumentó la cantidad de citas por regla).

**Trade-off aceptado (revisado):** el `Read` en agentes queda como best-effort documental (ayuda cuando el sub-agente sí abre tools). El **flujo normal** ahora se apoya en el command como punto de lectura confiable — el mismo patrón que WU-3/WU-4 usó para data-lineage y data-workflow, extendido a las 3 reglas soft.

---

## Enmienda 2 — Generalización a contexto por capas

- **Estado:** Aceptada
- **Fecha:** 2026-07-18
- **Run:** `2026-07-18-001`
- **Decisión relacionada:** `ADR-017-presupuesto-efectivo-y-carga-contextual.md`

La carga condicional deja de aplicarse únicamente a rules de dominio y se
generaliza a tres tipos de contenido:

1. **Rules:** núcleo universal compacto always-on; detalle en reference solo con
   lector explícito.
2. **Skills/capabilities:** máximo una capability inicial por agente; una
   segunda requiere dependencia y autorización explícitas.
3. **Coordinadores:** contrato mínimo en agent file; phase specs y referencias
   se leen en el punto de uso.

La regla anti-orfandad de este ADR se conserva sin cambios: ningún contenido
normativo sale del contexto inicial hasta existir lector verificable, integridad
de path y prueba E2E en la ruta consumidora.

ADR-017 es autoritativo para fórmula y budgets; esta enmienda es autoritativa
para extender el alcance del patrón de carga condicional. La enmienda no mueve
archivos por sí misma: cada migración ocurre en B5–B7 con rollback individual.

**Historial Enmienda 2**

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-18 | Propuesta | Aceptada | Aprobada explícitamente junto con ADR-017 dentro del bloque Runtime Efficiency v2. |
