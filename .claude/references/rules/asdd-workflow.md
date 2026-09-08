# ASDD Workflow Rules

Define las 6 fases del ciclo ASDD, agentes por fase y artefactos esperados. Complementa `asdd-orchestration.md` (cómo delegar). Orden secuencial por defecto (`Especificar → Analizar → Diseñar → Construir → Verificar → Documentar`); el orquestador puede paralelizar fases independientes siguiendo ORC-003.

## WF-001: Especificar — `/asdd:specify`

Define alcance, restricciones y contexto del proyecto.

| Rol | Agente · cuándo |
|---|---|
| Primario | `asdd-producto` (skill **`pm`**) · siempre — visión estratégica, alcance, OKRs, prioridades, restricciones de negocio |
| Primario | `asdd-domain-expert` · siempre — contexto de dominio, regulaciones, flujos |
| Soporte | `asdd-producto` (skill **`ba`**) · brief involucra procesos AS-IS/TO-BE o gap analysis |
| Soporte | `asdd-researcher` · dominio o tecnología desconocidos |
| Soporte condicional | `asdd-solution-architect` · señal: integración, migración, contrato API, escalabilidad, nueva API / diseño de API, decisión de stack o tecnología, multi-plataforma (mobile + web / multi-canal), microservicios, nuevo servicio backend, arquitectura del sistema — aporta restricciones arquitectónicas |
| Soporte condicional | `asdd-security` · señal: datos sensibles, auth, regulación (PCI/HIPAA/KYC), pagos — aporta requisitos de compliance |
| Soporte condicional | `asdd-tech-lead` · señal: estimación, esfuerzo, factibilidad técnica, breaking change — aporta riesgo técnico |

Los soportes condicionales se invocan SOLO si la señal aparece explícita en el brief. Sin señal → no invocar.

**Artefactos**: project brief en la ruta SPECIFY reservada en
`.asdd-run.json.phases.specify.artifacts[]`, con naming universal; alcance,
restricciones y contexto de dominio. **Completitud**: el brief responde ¿qué
construimos?, ¿para quién?, ¿con qué restricciones?, ¿dominio?

## WF-002: Analizar — `/asdd:analyze` (fase multi-dominio, ADR-004)

Extrae y valida requisitos a partir del brief y produce el **set de artefactos spec-per-área** del feature: 1 INDEX + 1 spec-funcional + N `spec-{area}`. Detecta gaps antes de diseñar. Deja de ser autoría mono-agente — es una **fase de coordinación multi-dominio** donde `asdd-producto` (skill `funcional`) coordina y cada dominio del Mapa (§0 del super-spec) autora su propio slice.

**Vocabulario del super-spec corporativo (ADR-004 §6):** ya NO se usan `CU-\d+`, `HU-\d+` ni `AC-\d+`. El modelo usa Reglas de Negocio `RN-\d+` tipadas `[CORE]`/`[EDGE]` (§6), Flujo de Negocio numerado sin ID (§4), una única User Story libre (§1) y escenarios Gherkin sin ID (§10, con IDs sintéticos `SCN-NNN` derivados del orden de aparición para trazabilidad). Gaps se numeran `GAP-\d+` (§14) y cambios post-aprobación `CR-\d+` (§15).

**Orden de sub-roles de `asdd-producto` para el spec-funcional:** `ba` (reglas `RN-\d+` `[CORE]`/`[EDGE]` + AS-IS/TO-BE) → `funcional` (Flujo de Negocio numerado + máquina de estados) → `po` (User Story + Actores + Trazabilidad). El AF (`asdd-producto` skill `funcional`) es el único autor del spec-funcional (R-FUN-3).

| Rol | Agente · cuándo |
|---|---|
| Primario · coordinador | `asdd-producto` (skills `ba` → `funcional` → `po`) · siempre — autora spec-funcional (§0 Mapa de dominios, §1 User Story, §2 Actores, §3 Trazabilidad, §4 Flujo, §6 RN, §7 RNFs de negocio, §14 gaps) y coordina la autoría multi-dominio |
| Primario · autor spec-{area} | agente dueño de cada dominio con `Aplica = Sí` en el Mapa · autora su `spec-{area}` como slice canónico del super-spec (ver ADR-004 §8.2 dueños): `asdd-solution-architect` + `asdd-developer-backend` → spec-backend · `asdd-developer-frontend` → spec-frontend · `asdd-ux` + `asdd-ui` (co-autores) → spec-diseno · `asdd-atf-api-qa-engineer`/`asdd-atf-web-qa-engineer` → spec-qa · `asdd-devops-engineer` → spec-devops · `asdd-security` → spec-seguridad · `asdd-data-governance` (o `asdd-solution-architect` como fallback si `data_platform = none`) → spec-data |
| Primario | `asdd-researcher` · incertidumbre técnica o de negocio detectada |
| Soporte | `asdd-domain-expert` · valida reglas del dominio |

El agente `asdd-security` es **dueño único** del contrato de seguridad (§11); `backend` y `frontend` lo consumen por referencia (notas de implementación server/cliente), nunca lo redeclaran (ADR-004 §4.6).

**Orquestación en 4 pasos (ADR-004 §8.3):**
1. **Análisis del brief** — `asdd-producto` (ba → funcional → po) produce el borrador del spec-funcional con el §0 Mapa de dominios (marca `Aplica Sí/No` por dominio según las señales del brief).
2. **Autoría multi-dominio en paralelo** — el orquestador delega a los agentes de dominios con `Aplica = Sí` para que produzcan sus `spec-{area}`. Aplica ORC-011-A (task partitioning): como cada `spec-{area}` es un archivo distinto, la intersección es 0 y las delegaciones ocurren en paralelo.
3. **Consolidación e INDEX** — el orquestador genera el INDEX con la lista de `spec-{area}` producidos y el grafo de dependencias por defecto (ver ADR-004 §4.5 / §8.3): Ola 1 (`seguridad`, `diseno`, `backend`, `data` — sin dependencias entrantes) → Ola 2 (`frontend` depende de `diseno`+`backend`; `devops` depende de `backend`) → Ola 3 (`qa` depende de `backend`+`frontend`). Las aristas se contraen cuando un dominio tiene `Aplica = No`.
4. **Gate DOR** — cierre de fase (ver WF-002-DOR abajo).

**Prerrequisito bloqueante**: debe existir el brief run-trazable registrado en
`phases.specify.artifacts[]` antes de generar specs. El hook
`asdd-pre-tool-use-analyze-guard` conserva compatibilidad de lectura con
briefs legado, pero ningún artefacto nuevo usa ese fallback.

**Umbral de gaps (criterio binario)**: ≥ 2 preguntas sin respuesta → registrar en §14 del spec-funcional como `GAP-\d+`. Conteo sobre ambigüedades que bloquean implementación — no sobre dudas de contexto.

**Granularidad**: un set spec-per-área (INDEX + spec-funcional + N `spec-{area}`) por funcionalidad acotada. El sistema decide la cardinalidad al analizar el brief — no se pregunta al usuario, pero anuncia su decisión con justificación ("el análisis arroja N features: {lista con razón por bounded context}") y contra-propone con evidencia cuando la cardinalidad difiere de un número explícitamente solicitado por el usuario.

**WF-002-STRUCT (control estructural — reemplaza la sub-regla de tamaño #3650, retirada por ADR-004 §9):** WF-002 cierra con exactamente **1 INDEX, 1 spec-funcional, y N `spec-{area}`** donde N = cantidad de áreas con `Aplica = Sí` en el Mapa de dominios (§0), con **área ∈ {backend, frontend, diseno, devops, seguridad, data, qa}** (7 áreas — ver ADR-004 §4.5). No hay límite de tamaño por archivo — la partición es **estructural por área**, no cuantitativa. El slug `-diseno` usa ASCII (sin ñ ni tilde) por el kebab-case del helper de naming.

**WF-002-DOR (criterio de cierre — Gate DOR):** WF-002 no puede marcarse `complete` en `.asdd-run.json.phases.analyze` mientras el Gate DOR del spec-funcional (§0 del super-spec, checkboxes) tenga ítems sin marcar. Cierre válido solo si: (a) el AF marcó el dominio `Funcional` con veredicto `APROBADA` (u `APROBADA CON OBSERVACIONES` resueltas); (b) cada dominio `Aplica = Sí` está en estado `COMPLETO`; (c) si hubo opt-out de Seguridad, tiene sign-off explícito de `asdd-security` (no del AF). Los ítems marcados `_(omitir si Aplica = No)_` se ignoran cuando el dominio está `Aplica = No`. Enforcement **soft** en v3.1.0 (revisado por el orquestador, no por hook).

**Artefactos**: INDEX (`docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-index.md`) — SSoT del progreso por área; spec-funcional (`docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-funcional.md`) — SSoT del contenido cross-área; N `spec-{area}` (`docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-{area}.md`) — slice canónico por área con `Aplica = Sí`; spike reports. **Completitud**: Gate DOR verde (WF-002-DOR) y el set cumple WF-002-STRUCT.

## WF-003: Diseñar — `/asdd:design`

Propone la solución técnica y visual. ADRs, diagramas y wireframes.

| Rol | Agente · cuándo |
|---|---|
| Primario | `asdd-solution-architect` · siempre — ADRs de aplicación, C4 L1/L2/L3 de aplicación, bounded contexts, contratos API, secuencias, ERD |
| Primario | `asdd-ux` · **señal: cualquiera de** — investigación UX, flujos de usuario, wireframes mid-fi, arquitectura de información, análisis de brechas UX — produce user-flows, wireframes, problem-statement, narrativas bajo `docs/design/wireframes/` y `docs/specs/` |
| Primario | `asdd-ui` · **señal: cualquiera de** — **URL de Figma / enlace a diseño Figma proporcionado** (#3577), setup de design system, definición de tokens, prototipo hi-fi, especificación de componentes visuales — produce design-tokens, ux-content en `src/styles/` y `docs/ui/` |
| Primario | `asdd-cloud-architect` · **señal: cualquiera de** — diseño de infraestructura cloud, diagrama de infraestructura, C4 Deployment Diagram, decisión de proveedor (AWS/GCP/Azure), DR/RTO/RPO, FinOps, compliance de infra, selección de IaC — ADRs de infra, C4 Deployment, diagramas con iconografía oficial, estimación de costos |
| Primario | `asdd-atf-api-qa-engineer` · **señal: cualquiera de** — diseño de casos de prueba API, plan de pruebas ISTQB, análisis de contrato OpenAPI, estrategia de testing de API REST — produce `test-plan.md`, `test-cases.json`, `.feature` files bajo `docs/testing/atf/` |
| Soporte | `asdd-researcher` · benchmarks o matrices de decisión para el ADR |
| Soporte | `asdd-domain-expert` · modelado DDD, reglas que afectan el diseño |
| Soporte | `asdd-tech-lead` · viabilidad técnica y estándares |
| Soporte | `asdd-security` · decisiones con impacto en seguridad de aplicación |

### Separación de responsabilidades de diagramas en WF-003

| Tipo de diagrama | Agente responsable | Skill |
|---|---|---|
| C4 L1 Context (sistema + actores) | `asdd-solution-architect` | `architect-component-diagram` |
| C4 L2 Container — componentes de **aplicación** | `asdd-solution-architect` | `architect-component-diagram` |
| C4 L3 Component — internos de un servicio | `asdd-solution-architect` | `architect-component-diagram` |
| Diagrama de secuencia | `asdd-solution-architect` | `architect-component-diagram` |
| ERD / Event Storming | `asdd-solution-architect` | `architect-component-diagram` |
| **C4 Deployment Diagram** | **`asdd-cloud-architect`** | **`cloud-architect-design`** |
| **Diagrama de infraestructura cloud** (VPC, redes, servicios) | **`asdd-cloud-architect`** | **`cloud-architect-design`** |
| **Diagrama con iconografía oficial AWS/GCP/Azure** | **`asdd-cloud-architect`** | **`cloud-architect-design`** |

**Regla de desambiguación:** si el request menciona "infraestructura", "deployment diagram", "diagrama cloud", "VPC", "EKS/AKS/GKE", "AWS/GCP/Azure" (como proveedor de infra) o "topología cloud" → activar `cloud-architect` como primario, no `architect`.

**Artefactos**: ADRs (aplicación e infraestructura), diagramas C4, C4 Deployment Diagram, diagramas cloud con iconografía oficial, wireframes, component specs, contratos OpenAPI/AsyncAPI, estimaciones de costo cloud. **Completitud**: toda decisión técnica significativa tiene ADR aprobado.

Para WF-004 (Construir), WF-005 (Verificar) y WF-006 (Documentar): ver `asdd-workflow-build.md`.

## Referencia rápida — agentes por fase: ver `asdd-phases-reference.md`.
