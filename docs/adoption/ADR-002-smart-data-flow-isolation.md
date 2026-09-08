# ADR-002 — Aislamiento del flujo Smart Data en el template v2.24.0

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico: `docs/architecture/decisions/ADR-002-smart-data-flow-isolation.md`.
> Bloqueado por design-guard (WF-003) + artifact-name-guard (run cerrado). `docs/adoption/` es zona exenta. El orquestador reubica al mergear.

- **Estado:** **Aceptada**
- **Fecha:** 2026-07-02
- **Ship en:** **v2.25.0** (release MINOR — port aditivo sobre base v2.24.0 tagueada).
- **Deciders:** Usuario/maintainer del template (Andrés Jiménez) — 4 decisiones locked confirmadas al arquitecto por el orquestador en la iteración del 2026-07-02.
- **Autor:** sofka-asdd-solution-architect
- **Contexto relacionado:** `smart-data-integration-analysis.md` (inventario + mecanismo + vectores V1–V5) y `smart-data-integration-plan.md` (plan de implementación en slices).
- **Convención de numeración:** existe `ADR-001-orc-enforcement-3-tiers.md`; este es el siguiente secuencial → **ADR-002**.

---

## Contexto

Se quiere integrar el dominio Smart Data (`sofka-asdd-data-*`: 3 agentes, 4 skills, 6 reglas, 5 comandos, addon `data_platform` en `cli-contract`) desde la rama `feat/smart-data` (base v2.21.1) al template v2.24.0. El riesgo central no es colisión de nombres, sino **mala-selección de agente/skill en runtime**: con todos los frontmatter co-cargados, el orquestador LLM puede elegir un agente Data para un request de aplicación o —peor y ya observado— el `solution-architect` base para un request de datos (fallo que ya se dio con QA).

Se verificó que la rama es 100% Data: 30/34 archivos son Data-owned, 3/34 son mods al core al servicio del addon, 0 son de otra feature; la "SPDD Canvas" mencionada previamente fue falso positivo. El `sofka-asdd-smart-data.lock` de la rama está degradado (v2.21.1, 282 commits de desfase) — el port re-aplica los cambios core SOBRE v2.24.0, no trae el lock viejo (mismo patrón usado para portar ATF-web).

## Decisiones del usuario (locked)

Estas 4 decisiones son la base de esta ADR. Están confirmadas y cerradas antes del port.

### D1 — Postura: Smart Data SIEMPRE PRESENTE (no addon OFF-by-default)

**Decisión:** Smart Data se instala como los demás dominios del template (siempre activo). Se descarta la Opción B del análisis (master switch por `data_platform` que apagaba el dominio).

**Justificación:** simplicidad operativa para consumidores; alineación con el resto del template (ATF-API, ATF-Web, UX, UI son todos "siempre presentes"); evita crear una capa de configuración de opt-in nueva que no existe hoy para ningún dominio. Consecuencia: **toda la mitigación del riesgo de mis-selección recae en desambiguación en runtime** (no hay flag que apague los agentes cuando no aplican).

### D2 — Core: AUTORIZADO modificar archivos del core

**Decisión:** se autoriza tocar `description` de agentes existentes (mínimo `solution-architect`, y los que colisionen), el hook `sofka-asdd-user-prompt-submit.mjs` (regex `DATA_ARCH_RE`), y el routing (`sofka-asdd-routing-heuristics.md`).

**Justificación:** el amplificador mecánico V1 (hook `DATA_ARCH_RE`) vive en el template, no en Smart Data — corregirlo es la única forma de eliminar el fallo de raíz. El scope-check recíproco requiere tocar la prosa del `solution-architect`. El port es explícitamente no-aditivo-puro.

### D3 — Activación: AUTO-ROUTING CON DESAMBIGUACIÓN

**Decisión:** los prompts claros de datos enrutan al flujo Data automáticamente; ante ambigüedad genuina el orquestador PREGUNTA una sola vez ("¿software o datos?"); los comandos `/sofka-asdd-data:*` quedan disponibles como atajo inequívoco. Se descarta la Opción A pura del análisis (command-only, patrón ATF puro).

**Justificación:** el patrón ATF puro sacrifica conveniencia y castiga al usuario que no memoriza el comando; el auto-routing con desambiguación mantiene el valor UX del template y limita el riesgo al caso ambiguo, donde una pregunta explícita cierra la incertidumbre. Consecuencia: se necesita **rama de desambiguación en el hook** además de eliminar el mis-route actual.

### D4 — Alcance: SOLO Data

**Decisión:** el port se limita a los artefactos Data (3 agentes + 4 skills + 6 reglas + 5 comandos + addon `cli-contract` + PS1 + sección de CLAUDE.md). No se trae el `sofka-asdd-smart-data.lock` viejo — se actualizan los conteos del lock v2.24.0 y se añade `sofka-asdd-smart-data` a `sub_locks` (patrón de ATF-web).

**Justificación:** aislamiento del cambio; el lock v2.21.1 refleja un template desfasado; usar el patrón ATF-web como referencia (ya probado) baja el riesgo del port.

---

## Estrategia final — mitigación en 3 capas (autoriza D1+D2+D3)

Con Smart Data siempre presente, la robustez descansa en 3 capas de desambiguación runtime, aplicadas sobre el core del template. Cada capa cubre un fallo distinto — las tres son necesarias, ninguna suficiente sola.

### Capa 1 — Descripciones mutuamente excluyentes + triggers negativos + cross-pointer

Cada agente que puede colisionar con Data (y viceversa) declara **positivamente** su alcance, **niega** el ajeno y **apunta** al par correcto. Es exactamente el patrón que ya usa el template con `atf-web` ↔ `atf-api` ("NO para APIs REST → usar sofka-asdd-atf-api-qa-engineer"). El descubrimiento del análisis: hay **3 pares** de colisión, no solo uno.

| Colisión | Trigger negativo a agregar en el `description` del agente base | Cross-pointer |
|---|---|---|
| `solution-architect` ↔ `data-architect` | "NO para arquitectura de plataformas de datos, lakehouse, Medallion, Star schema, ETL/ELT, Databricks → usar `sofka-asdd-data-architect`" | ambas direcciones |
| `cloud-architect` ↔ `data-eng-databricks` | "NO para pipelines Azure + Databricks / AWS Glue (dominio de ingeniería de datos) → usar `sofka-asdd-data-eng-databricks`" | ambas direcciones |
| `security` ↔ `data-governance` | "NO para governance de datos (PII, retención por capa, contratos inter-equipo, lineage de datos) → usar `sofka-asdd-data-governance`" | ambas direcciones |

Recíprocamente, los 3 agentes Data ganan triggers negativos hacia software/CRUD/microservicios/OWASP/FinOps y cross-pointers a `solution-architect`/`cloud-architect`/`security`. El scope-check en prosa que ya traen se convierte en scope-check **con escalamiento** — si el request no es del dominio, el agente reporta `ESCALAMIENTO REQUERIDO / motivo: fuera_de_dominio_data / recomendación: {agente correcto}` en vez de solo "informar" (Capa 3).

### Capa 2 — Fix + extend del hook `DATA_ARCH_RE`

El hook `sofka-asdd-user-prompt-submit.mjs` se transforma de "amplificador del fallo" a "árbitro de desambiguación":

- **Fix:** las señales que hoy secuestran hacia `solution-architect` (`data warehouse|data lake|etl|pipeline de datos|redshift|bigquery|snowflake`) dejan de forzar al `solution-architect` base y pasan a **enrutar a `sofka-asdd-data-architect`** (o `data-eng-databricks` según sub-señales de plataforma).
- **Extend — rama de desambiguación:** cuando el prompt matchea señales de datos **AND** señales de software (nueva regex `SOFTWARE_ARCH_RE` para "microservicios|API REST|backend|módulo transaccional|CRUD"), el hook inyecta un `system-reminder` distinto que le pide al orquestador **preguntar una sola vez**: `"¿Este request es sobre plataforma de datos/analytics, o sobre arquitectura de software transaccional? (data | software)"`. Sin respuesta → default a preguntar de nuevo; no auto-elegir.

Las señales de "microservicios/base de datos/contrato API" del `DATA_ARCH_RE` actual que **no** son de dominio Data (son de arquitectura de aplicación con persistencia) se conservan como señales para `solution-architect` — se separan las que enrutan a Data (`data warehouse|data lake|lakehouse|medallion|databricks|silver|bronze|gold|glue|bigquery|snowflake|redshift|etl|elt|pipeline de datos|unity catalog`) de las que enrutan al architect base (`base de datos|microservicios|nueva api|contrato api|integración de sistemas`).

### Capa 3 — Scope-check recíproco con escalamiento en ambos dominios

- **En los 3 agentes Data:** ya existe scope-check unidireccional; se lo endurece con `ESCALAMIENTO REQUERIDO` (patrón `sofka-asdd-routing-heuristics.md` — motivo `fuera_de_dominio_data`, recomendación al agente correcto). Sin recomendación explícita, el orquestador re-clasifica.
- **En `solution-architect`, `cloud-architect`, `security`:** se agrega scope-check recíproco al inicio de su prosa ("si el request es de plataforma de datos/PII de datos/pipelines analíticos → **ESCALAMIENTO REQUERIDO**, recomendación: `sofka-asdd-data-{architect|eng-databricks|governance}`"). Cierra el gap unidireccional que hoy protege solo una dirección.

### Árbitro ORC-001 ↔ D0-D7

D0-D7 no reemplaza ORC-001. La regla de arbitraje:

- **ORC-001 sigue siendo la SSOT de fases del template** (Especificar…Documentar). Aplica a TODO request, incluidos los de datos.
- **D0-D7 mapea el request Data a la fase de dominio Data** (discover→publish) DENTRO de la fase ASDD que ORC-001 ya eligió. Ejemplo: request D3 (Design/arquitectura de datos) cae en fase ORC "Diseñar"; request D4 (Build/pipelines) cae en fase ORC "Construir".
- **Tabla de correspondencia obligatoria** (queda en `sofka-asdd-data-routing.md` y en el CLAUDE.md raíz):
  - `D1 discover` → ORC "Especificar" (con soporte de "Analizar")
  - `D3 design` → ORC "Diseñar"
  - `D4 build` → ORC "Construir"
  - `D5 governance` (transversal) → cualquier fase ORC
  - `D6 validate` → ORC "Verificar"
  - `D7 publish` → ORC "Verificar" (release-gate) o "Documentar"
- **D0 (fuera de dominio)** → orquestador NO enruta a Data, aplica ORC-001 estándar sobre el request.

Esta separación evita que D0-D7 "compita" con ORC-001. ORC-001 gobierna el ciclo ASDD; D0-D7 solo elige el sub-flujo Data cuando la fase ASDD ya está fijada.

---

## Opciones evaluadas (histórico — para trazabilidad)

Las opciones originales del análisis quedaron parcialmente adoptadas:

- **Opción A (command-gated puro estilo ATF):** DESCARTADA por D3 (auto-routing con desambiguación pesa más que command-only). Se conserva el aporte "no registrar agentes Data en las tablas WF-xxx" (V4 del análisis) porque no compite con auto-routing y reduce superficie de auto-selección.
- **Opción B (master switch por `data_platform`):** DESCARTADA por D1 (siempre presente). Se conserva `data_platform` como personalización de contexto informativo en `cli-contract.json` (dice qué plataforma usa el cliente, no si el dominio está ON/OFF).
- **Opción C (triggers negativos + scope-check recíproco):** ADOPTADA COMPLETA — es la Capa 1 y la Capa 3 de la estrategia final.
- **Corrección V1 del hook:** ADOPTADA como Capa 2, y **extendida** con rama de desambiguación (D3 exige preguntar en ambigüedad).

## Consecuencias

- **Positivas:** eliminación del amplificador V1; scope-check simétrico en ambas direcciones (V2 mitigado); árbitro explícito ORC-001↔D0-D7 (V3 resuelto); el hook actualizado enseña al orquestador a preguntar cuando corresponde en vez de auto-elegir.
- **Negativas / costos:** el port toca 3 archivos del core (hook `user-prompt-submit`, `routing-heuristics`, 3 `description` de agentes base) — cambio no aditivo. Requiere tests de no-interferencia dedicados (Plan §D). Rama de desambiguación agrega una interacción extra al usuario en prompts genuinamente ambiguos (acepta trade-off).
- **Riesgo residual:** el frontmatter Data se carga en contexto igual que el resto (Claude Code no descarga agentes por regla) — el gate es de inyección/prosa reforzada, no de descarga real. Mitigación: descripciones estrechas + no registrar en tablas WF-xxx + escalamiento con recomendación explícita (Capas 1+3).

## Referencias

- `docs/adoption/smart-data-integration-analysis.md` — inventario + mecanismo + vectores V1–V5.
- `.claude/docs/adoption/smart-data-integration-plan.md` — plan de implementación en 4 slices con PRs encadenados y matriz de testing.
- `.claude/agents/sofka-asdd-atf-web-qa-engineer.md` — precedente del patrón "NO para X → usar Y" (Capa 1).
- `.sofka-asdd/sofka-asdd-atf-web.lock` + `sub_locks` en `sofka-asdd.lock` — precedente para registrar `sofka-asdd-smart-data` como sub-lock v2.24.0.
