---
description: Fase Analizar multi-dominio — desde el brief produce INDEX, spec-funcional y N spec-{area}, y detecta gaps.
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

Ejecutar la fase **Analizar** del workflow ASDD.

## Prerequisito — BLOQUEANTE

Verificar antes de continuar cualquier análisis:

Debe existir el brief run-trazable registrado en
`.asdd-run.json.phases.specify.artifacts[]`, producido por
`/sofka-asdd:specify`.

Si no existe → **STOP**. No generar ningún artefacto. Informar al usuario:
> "No existe brief para esta feature. Ejecutar primero `/sofka-asdd:specify`."

Este guard también se enforza mecánicamente: el hook `sofka-asdd-pre-tool-use-analyze-guard`
bloquea cualquier escritura en `docs/specs/` si no hay un brief canónico
registrado (mantiene detección de legado solo para migración).
Para ruta LIGHT sin brief o proyectos en adopción gradual: `ASDD_ANALYZE_GUARD_ENABLED=false`.

## Instrucciones (flujo multi-dominio en 4 pasos — ADR-004 §8.3)

Esta fase produce el **set spec-per-área** del feature: 1 INDEX + 1 spec-funcional + N `spec-{area}` (una por área con `Aplica = Sí` en el Mapa de dominios). NO produce un spec plano único.

1. **Análisis del brief → borrador del spec-funcional.** Invocar el agente `producto` con sus sub-roles en el siguiente **orden explícito**:
   1. **`ba` (Business Analyst)** — primero: levanta procesos AS-IS/TO-BE, reglas de negocio numeradas y tipadas (`RN-\d+` `[CORE]`/`[EDGE]`), gap analysis.
   2. **`funcional` (Analista Funcional)** — después: detalla el Flujo de Negocio numerado (sin ID de caso de uso) y la máquina de estados a partir de las reglas. Es el único autor del spec-funcional y el coordinador de la fase.
   3. **`po` (Product Owner)** — al final: escribe la User Story única (§1), Actores (§2) y Trazabilidad (§3) sobre el flujo ya definido.

   El AF marca en el **§0 Mapa de dominios** qué dominios aplican (`Aplica Sí/No`) según las señales del brief.

   > **Vocabulario (ADR-004 §6):** ya NO se usan `CU-\d+`, `HU-\d+` ni `AC-\d+`. Reglas de negocio `RN-\d+` `[CORE]`/`[EDGE]`, escenarios Gherkin sin ID (§10, con IDs sintéticos `SCN-NNN`), gaps `GAP-\d+` (§14), cambios post-aprobación `CR-\d+` (§15).

2. **Autoría multi-dominio en paralelo.** El orquestador delega a los agentes dueños de cada dominio con `Aplica = Sí` para que produzcan su `spec-{area}` como slice canónico del super-spec (ver ADR-004 §8.2): `solution-architect`+`developer-backend` → spec-backend · `developer-frontend` → spec-frontend · `ux`+`ui` → spec-diseno · `atf-api-qa-engineer`/`atf-web-qa-engineer` → spec-qa · `devops-engineer` → spec-devops · `security` → spec-seguridad (dueño único del contrato §11) · `data-governance` (o `solution-architect` como fallback si `data_platform = none`) → spec-data. Aplica ORC-011-A: cada `spec-{area}` es un archivo distinto → intersección 0 → paralelo.

3. **Consolidación e INDEX.** El orquestador genera el INDEX con la lista de `spec-{area}` producidos y el grafo de dependencias por defecto (Ola 1 `seguridad`·`diseno`·`backend`·`data` → Ola 2 `frontend`·`devops` → Ola 3 `qa`), contrayendo aristas cuando un dominio tiene `Aplica = No`.

4. **Gate DOR.** Cerrar la fase solo cuando el Gate DOR del spec-funcional (§0) esté completo — ver "Cierre de fase" abajo.

Como soporte: invocar `researcher` (skill `spike`) para incertidumbres técnicas o de negocio, y `domain-expert` para validar que los requisitos respetan las reglas del dominio.

Usar como plantillas canónicas `.claude/skills/sofka-asdd-producto-templates/reference/spec-funcional-template.md` (para el spec-funcional) y `.claude/skills/sofka-asdd-producto-templates/reference/spec-slice-rules.md` (tabla de proyección del super-spec en cada `spec-{area}`).

> **Campo obligatorio en specs nuevos — `ui_required`:** Establecer `**ui_required:** true` en el metadata si la feature tiene componentes de UI/UX que requieran wireframes o prototipo hi-fi. Dejar `false` para features puramente de backend/API sin frontend. El hook `design-guard` (WF-003) verifica este campo y bloquea el acceso a `docs/architecture/` si `ui_required: true` pero `docs/ui/` está vacío — garantizando que @sofka-asdd-ux se ejecute antes de diseñar.

## Dominios y sus autores (paso 2 — autoría multi-dominio)

Cada dominio con `Aplica = Sí` en el §0 Mapa de dominios tiene un agente dueño que autora su `spec-{area}`. Invocar SOLO los que el Mapa marque `Aplica = Sí`:

| Dominio (Mapa §0) | Agente autor | spec-{area} |
|---|---|---|
| Arquitectura + Developer (capa servidor) | @sofka-asdd-solution-architect + @sofka-asdd-developer-backend | spec-backend |
| Developer (capa presentación) | @sofka-asdd-developer-frontend | spec-frontend |
| UX + UI | @sofka-asdd-ux + @sofka-asdd-ui (co-autores) | spec-diseno |
| Seguridad | @sofka-asdd-security | spec-seguridad (dueño único del contrato §11) |
| QA | @sofka-asdd-atf-api-qa-engineer / @sofka-asdd-atf-web-qa-engineer | spec-qa |
| DevOps | @sofka-asdd-devops-engineer | spec-devops |
| Datos | @sofka-asdd-data-governance (o @sofka-asdd-solution-architect si `data_platform = none`) | spec-data |

Cada `spec-{area}` es un slice canónico del super-spec (sin duplicar contenido cross-área): las secciones divididas se consumen por referencia según `spec-slice-rules.md`. El contrato de seguridad (§11) vive **una sola vez** en spec-seguridad; backend y frontend lo referencian por puntero.

## Cierre de fase

### Umbral de gaps — criterio binario

Contar las **preguntas sin respuesta** durante el análisis (ambigüedades que impiden
implementar el feature con las reglas y escenarios dados):

| Preguntas sin respuesta | Acción |
|---|---|
| **≥ 2** | Registrar cada una como `GAP-\d+` en la §14 (Decisiones Requeridas y Gaps) del spec-funcional |
| **< 2** | Dejar §14 con el conteo explícito (ej. "0 preguntas abiertas detectadas") |

El umbral **no se evalúa subjetivamente** — es fijo. Una "pregunta abierta" es una
ambigüedad concreta que bloquea la implementación de al menos un flujo, no una
duda de contexto o de dominio. Los gaps **no bloquean** la generación del set — el
spec-funcional y sus `spec-{area}` se producen igual; §14 documenta lo que requiere
clarificación antes de diseñar.

### Gate DOR — criterio de cierre (WF-002-DOR)

La fase Analizar cierra solo cuando el Gate DOR del spec-funcional (§0 del super-spec,
checkboxes) está completo: (a) el dominio `Funcional` está `APROBADA` (u `APROBADA CON
OBSERVACIONES` resueltas); (b) cada dominio `Aplica = Sí` está en `COMPLETO`; (c) el
opt-out de Seguridad, si lo hubo, tiene sign-off explícito de @sofka-asdd-security.
Los ítems `_(omitir si Aplica = No)_` se ignoran cuando el dominio está `Aplica = No`.
Enforcement soft (revisado por el orquestador).

### Granularidad de artefactos

Si el brief cubre **múltiples funcionalidades acotadas** (bounded contexts o dominios de
negocio diferenciados sin reglas compartidas), generar **un set spec-per-área separado
por funcionalidad** (cada uno con su INDEX + spec-funcional + `spec-{area}`) — no un set
monolítico.

La cardinalidad la decide el sistema al analizar el brief — no se pregunta al usuario.
Criterio de división: dos funcionalidades van en sets separados si NO comparten reglas de
negocio ni flujos principales.

**Anuncio obligatorio antes de generar:** el sistema declara su decisión con justificación:
> "El análisis arroja N features: `{nombre-a}` (bounded context: {razón}), `{nombre-b}` (bounded context: {razón})…"

**Contra-propuesta cuando el usuario solicitó un número explícito y el análisis difiere:**
- Si el análisis arroja **más** features de los pedidos: "Pediste N, el análisis da M — funcionalidades adicionales detectadas: `{X}` ({razón}), `{Y}` ({razón})."
- Si el análisis arroja **menos** features de los pedidos: "Pediste N, el análisis da M — las funcionalidades `{A}` y `{B}` comparten {reglas/flujos comunes} y se consolidan en un solo set."

El sistema **no pide aprobación** ante la discrepancia — informa la evidencia y procede.

**WF-002-STRUCT:** el set cierra con exactamente 1 INDEX + 1 spec-funcional + N `spec-{area}` (N = áreas con `Aplica = Sí`, área ∈ {backend, frontend, diseno, devops, seguridad, data, qa}). Sin límite de tamaño por archivo — la partición es estructural por área.

## Artefactos esperados

- `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-index.md` — INDEX, SSoT del progreso por área (grafo de dependencias + historial de estado)
- `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-funcional.md` — spec-funcional, SSoT del contenido cross-área (Mapa de dominios, User Story, Actores, Flujo, RN, RNFs de negocio, §14 gaps)
- `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-{area}.md` — un slice por cada área con `Aplica = Sí` (slug `-diseno` en ASCII, sin ñ ni tilde)
- Spike reports en `docs/architecture/spikes/` (si aplica)

## Siguiente paso

Una vez el spec está validado → `/sofka-asdd:design`
