# Smart Data → v2.24.0 — Análisis de integración y de interferencia

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico previsto: `docs/specs/smart-data-integration-analysis.md`.
> Tres hooks de gobernanza (analyze-guard WF-002, design-guard WF-003, artifact-name-guard con run `2026-05-28-001` en status `complete`) bloquearon las rutas `docs/specs/` y `docs/architecture/`. `docs/adoption/` es la única zona exenta de los tres. El orquestador debe reubicar este archivo (ver reporte). Contenido íntegro y final — solo la ruta es provisional.

**Fase:** Diseñar
**Autor:** asdd-solution-architect
**Fecha:** 2026-07-02
**Rama de trabajo:** `feat/smart-data-integration` (contenido = template v2.24.0)
**Fuente analizada (READ-ONLY):** worktree `.tmp/smart-data-branch/` (rama `feat/smart-data`, base template v2.21.1)
**Objetivo:** traer el dominio Smart Data (`asdd-data-*`) al template v2.24.0 SIN que su flujo interfiera con el flujo del orquestador ASDD base. Este documento cubre inventario, mecanismo de aislamiento actual y análisis de interferencia. Las opciones y la recomendación viven en el ADR asociado (`ADR-002-smart-data-flow-isolation.md`).

> **Nota de alcance:** este documento es análisis, no port. No se copió ni modificó código de Smart Data. El worktree fuente es de solo lectura.

---

## Parte 1 — Inventario definitivo de artefactos Smart Data

Prefijo canónico confirmado: **`asdd-data-*`** (no "smart"). El slug "smart-data" solo aparece en el nombre del lock, el namespace conceptual y los nombres de artefactos de output (`smart-data-eng-design-{cliente}.md`, etc.).

### Agentes (3)

| Archivo | Rol | Skills declarados en frontmatter | model |
|---|---|---|---|
| `asdd-data-architect.md` | Arquitectura Medallion + Star schema, discovery técnico, `smart-data-eng-design` | `asdd-data-discovery`, `asdd-data-architecture-design` | opus |
| `asdd-data-governance.md` | Contratos inter-equipo, diccionario, PII, lineage, retención | `asdd-data-governance-assessment`, `asdd-data-contract` | opus |
| `asdd-data-eng-databricks.md` | Implementa pipelines Azure + Databricks (requiere MCP Databricks) | Databricks AI Dev Kit (perfil externo, NO prefijo `asdd-data-*`) | sonnet |

### Skills (4 — confirmados en disco, con SKILL.md real)

| Skill | Dueño | Templates/reference incluidos |
|---|---|---|
| `asdd-data-discovery` | data-architect | `interview-script.md`, `preventa-document.md`, `technical-discovery.md` |
| `asdd-data-architecture-design` | data-architect | `architecture-adr.md`, `layer-decision-matrix.md` |
| `asdd-data-governance-assessment` | data-governance | `data-dictionary-template.xlsx`, `data-dictionary.md`, `governance-checklist.md` |
| `asdd-data-contract` | data-governance | `data-contract.md` |

> `asdd-data-eng-databricks` no aporta skills con prefijo propio: usa el Databricks AI Dev Kit (perfil `data-engineer`), skills externos que **no** viven en `.claude/skills/`. Al portar, verificar de dónde se resuelven esos skills — si son un pack externo, es una dependencia adicional a documentar.

### Reglas (6 — corrige el conteo previo de "≥5")

| Regla | Naturaleza | Activación |
|---|---|---|
| `asdd-data-routing.md` | Routing propio, taxonomía **D0–D7** | SSOT de routing del dominio Data |
| `asdd-data-workflow.md` | 5 fases **SD-001..SD-005** (`discover→design→build→validate→publish`) con criterios de entrada/salida | Gate de fases del dominio Data |
| `asdd-data-schema-contracts.md` | "Silver es el contrato" — enforcement de schema | Reactiva (siempre activa ante señal Silver) |
| `asdd-data-inter-contracts.md` | Contratos de datos inter-equipo (DC-000..DC-007) | Reactiva (siempre activa) |
| `asdd-data-lineage.md` | Trazabilidad origen→consumo (LIN-001..LIN-006) | Reactiva (build/validate) |
| `asdd-data-retention.md` | Retención por capa y por campo PII (RET-001..RET-007) | Reactiva (governance) |

> El artefacto `asdd-data-relation.md` mencionado en el contexto previo **no existe** en el worktree. El conteo real de reglas es 6.

### Comandos (5 — namespace propio `/asdd-data:`)

`discover` · `design` · `build` · `validate` · `publish` (en `.claude/commands/asdd-data/`).

### Configuración

| Artefacto | Contenido relevante |
|---|---|
| `.asdd/asdd-smart-data.lock` | `model_strategy` propio (phase_default de las 5 fases Data + agent_pinning de los 3 agentes), `data_platform: "none"`, `repository` counts (agents:3, skills:4, commands:5, rules:6). Declara: "se activa cuando `data_platform != none`". |
| `.asdd/cli-contract.json` | Addon `data-platform` con valores `azure-databricks \| aws \| other`. |
| `.asdd/extract-xlsx.ps1` | Script de extracción de Excel — **solo Windows** (PowerShell). |
| Sección CLAUDE.md "Dominio de datos — Smart Data ASDD" | Registra los 3 agentes + 5 comandos en una **sección separada** (no en la tabla principal de agentes ni en las WF-xxx). |

**Total del footprint:** 3 agentes + 4 skills + 6 reglas + 5 comandos + 1 lock + entradas en cli-contract + 1 script PS1 + 1 sección de CLAUDE.md.

---

## Parte 2 — Mecanismo de aislamiento actual: ¿es robusto?

El worktree implementa **cinco** capas de separación. Todas existen, pero ninguna es un gate mecánico:

1. **SSOT de routing propia (`asdd-data-routing.md`).** Taxonomía D0–D7 con "Regla 0 — scope check primero": si el request no tiene componente real de plataforma de datos → **D0**, detener y derivar al ASDD base. Es un archivo de reglas más, cargado en contexto junto al `asdd-routing-heuristics.md` base. **Nada obliga al orquestador a usar D0–D7 en lugar de ORC-001.**

2. **Scope check en cada agente Data** (sección "Alcance del dominio" + `description` del frontmatter). Cada agente, antes de actuar, confirma que el request es de dominio de datos; si no lo es, informa que corresponde a `asdd-solution-architect` y **no procede**. Es un guard **post-selección** en **una sola dirección**: protege contra "agente Data seleccionado para request no-Data". **No hay guard recíproco** en el `solution-architect` base para el caso inverso ("architect base seleccionado para request de datos").

3. **Flujo command-gated** (`/asdd-data:*`) con workflow propio de 5 fases (SD-001..SD-005) y criterios de entrada/salida formales. El command es el único punto de activación **inequívoco** del dominio.

4. **Lock separado** con `model_strategy` propio y flag `data_platform`. El flag es la única señal cuasi-mecánica ("se activa cuando `data_platform != none`") — pero **ningún hook ni validador lo lee para gatear disponibilidad de agentes**. Es declarativo.

5. **Reglas de governance reactivas** (schema/inter-contracts/lineage/retention) que disparan ante señales de dominio de datos.

### Veredicto

**El mecanismo actual NO previene la mala-selección-en-runtime. Solo separa por nomenclatura, prosa de scope-check y un flag declarativo que nada enforce.**

- La nomenclatura `data-*` no impide que el LLM elija mal: las `description` del `data-architect` ("arquitectura… ADRs… decisiones") y del `solution-architect` base comparten vocabulario semántico ("arquitectura", "diseño", "ADR", "plataforma").
- El scope-check protege una sola dirección y **actúa después** de que el agente ya fue seleccionado (desperdicia una invocación y depende del auto-juicio del LLM).
- Es exactamente la misma clase de mitigación basada en prosa que —según el revisor— **ya falló con el dominio QA**. La preocupación del usuario está **vigente y sin resolver**.

---

## Parte 3 — Vectores de interferencia en v2.24.0 (priorizados)

### V1 — CRÍTICO · El hook `DATA_ARCH_RE` secuestra requests de Smart Data hacia el agente equivocado

El template v2.24.0 tiene en `asdd-user-prompt-submit.mjs` (líneas 48, 97-107) una inyección **mecánica e incondicional** en cada prompt:

```
DATA_ARCH_RE = /…\bdata\s*warehouse\b|\bdata\s*lake\b|…\betl\b|\bpipeline de datos\b|\bbase de datos\b|\bredshift\b|\bbigquery\b|\bsnowflake\b…/i
```

Cuando matchea → inyecta como `system-reminder`: **"DEBES involucrar a `asdd-solution-architect` en el plan"**.

El problema: esas señales (`data warehouse`, `data lake`, `ETL`, `pipeline de datos`) son **exactamente** las señales de dominio Data (D3/D4 de `asdd-data-routing.md`). Al integrar Smart Data, un request legítimo de datos ("diseñá el data lake", "armá el pipeline de datos") dispara un hook que **fuerza mecánicamente al `solution-architect` base** (el arquitecto de aplicación, agente equivocado) dentro del plan — combatiendo activamente el routing D0–D7 que lo enviaría a `asdd-data-architect`.

Es el amplificador mecánico exacto del fallo que el usuario teme. La regex es **estática/hardcodeada** y la inyección es de mayor "volumen" que el archivo de routing Data (que es pasivo). **Máxima prioridad de corrección.**

### V2 — ALTO · Mala-selección en runtime por frontmatter co-cargado

Todos los `description` de agentes y skills quedan residentes en contexto. El global CLAUDE.md del usuario declara "Contextual Skill Loading (MANDATORY)" (auto-match por `description`). Un request de datos comparte léxico con el `solution-architect` base; un request de app puede matchear un skill Data. La nomenclatura `data-*` **no desambigua semánticamente**. El único freno son el scope-check (una dirección, post-selección) y el routing D0/D5 (prosa pasiva, no enforced). Es la misma condición que produjo el fallo documentado con QA.

### V3 — ALTO · Doble routing sin árbitro (ORC-001 vs D0–D7)

v2.24.0 inyecta el **NÚCLEO ORC** en cada prompt vía hook (ORC-000/001/001-B/008/010) y el índice ORC en session-start. **Nada inyecta el routing D0–D7.** Resultado: el routing ORC es "ruidoso" (hook cada turno) y el routing Data es "silencioso" (archivo pasivo). Además ORC-001 clasifica en las 6 fases base (Especificar…Documentar) que **no contemplan** las 5 fases Data (discover…publish). El orquestador tenderá a mapear un request de datos a las fases base equivocadas. **Ninguna regla dice "si señal Data → usar la SSOT Data en vez de ORC-001".** No hay árbitro.

### V4 — MEDIO · Registro en tablas de CLAUDE.md / phases-reference

En el worktree los agentes Data viven en una **sección separada** de CLAUDE.md y **no** están en las tablas WF-xxx ni en `asdd-phases-reference.md` — esto sigue parcialmente el patrón ATF y es correcto. Riesgo residual: el frontmatter se carga igual, así que la sección separada reduce pero no elimina la auto-selección. **Si al portar se agregan a las tablas de fase, la probabilidad de auto-selección sube** — no hacerlo.

### V5 — MEDIO · Desfase v2.21.1 → v2.24.0 (refs muertas y naming)

- **`asdd-developer` → split.** El worktree (base v2.21.1) referencia `asdd-developer` (singular); v2.24.0 lo dividió en `asdd-developer-frontend` / `asdd-developer-backend`. Las reglas Data no dependen de ese agente, pero el D0 de `asdd-data-routing.md` deriva a **`asdd-architect`**, renombrado en v2.24.0 a **`asdd-solution-architect`** → **referencia muerta a corregir**.
- **Convención de naming:** los skills Data usan `asdd-data-*` (cumple la convención). Auditar sus `description` contra el auto-match del Contextual Skill Loading.
- **Contaminación SPDD Canvas:** el worktree trae además el sistema SPDD Canvas (ADR-004, Gate 1/Gate 2, `asdd-workflow-build.md` modificado) que **no** forma parte del pedido. Un merge naive de la rama arrastraría SPDD. El port debe limitarse a los artefactos Data, **sin** tocar reglas base modificadas por SPDD.
- **Conteos del lock/validador:** el `asdd-smart-data.lock` declara counts propios (agents:3, skills:4, commands:5, rules:6). El validador del template (baseline 30/0/0, WI#3466) verifica consistencia de agentes/skills/hooks/manifiesto. Agregar los artefactos Data cambia los conteos del lock principal → reconciliar (relación con la memoria `installer-no-prune-orphans`: drift lock vs filesystem).
- **`extract-xlsx.ps1` solo Windows** → gap de portabilidad cross-OS (el template valida cross-OS).

### Resumen de severidad

| Vector | Severidad | Naturaleza | Requiere tocar el template base |
|---|---|---|---|
| V1 — hook DATA_ARCH_RE secuestra | **CRÍTICO** | Mecánico (activo) | Sí — editar la regex/lógica del hook |
| V2 — mala-selección por frontmatter | ALTO | Prosa (débil) | Sí — scope-check recíproco / descriptions |
| V3 — doble routing sin árbitro | ALTO | Asimetría de enforcement | Sí — inyectar routing Data o gatear |
| V4 — registro en tablas de fase | MEDIO | Superficie de auto-selección | No — solo no registrarlos ahí |
| V5 — desfase v2.21.1→v2.24.0 | MEDIO | Refs muertas / naming / conteos | Sí — correcciones puntuales al portar |

**Los tres vectores de mayor riesgo (V1, V2, V3) exigen cambios en el template base, no solo aditivos.** Esto contradice el supuesto implícito de que Smart Data se puede "sumar" sin tocar el core: el amplificador del fallo (V1) vive en el hook del template.
