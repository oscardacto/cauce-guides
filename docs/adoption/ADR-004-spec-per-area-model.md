# ADR-004 — Modelo de specs por área: INDEX delgado + spec-funcional + slices por track de implementación

> **Ubicación canónica.** Este ADR vive en `docs/adoption/ADR-004-spec-per-area-model.md`, junto a los demás ADRs consumer-facing distribuidos por el CLI (ADR-002, ADR-006). Se redactó inicialmente en `docs/adoption/` porque `docs/architecture/decisions/` no está exento del `artifact-name-guard` para `Write` con `.asdd-run.json` cerrado; se movió temporalmente a `docs/architecture/decisions/` vía `git mv` en el PR de cierre (WU-7), pero se reubicó de vuelta a `docs/adoption/` porque el CLI de distribución no empaqueta `docs/architecture/decisions/` (ese directorio pertenece al proyecto consumidor, no al template) — sin esta reubicación, los agentes/rules/skills que citan la ruta de este ADR quedaban con referencias colgantes en el cliente. Ver fix de distribución del CLI (rama `fix/cli-distribuir-adrs`).

- **Estado:** Propuesta
- **Fecha:** 2026-07-06
- **Revisión 2026-07-06 (rev-1):** Ajuste dirigido tras decisión del maintainer — se agrega el área `diseno` como track separado (consume UX+UI). `frontend` queda restringido a código de presentación (Developer split por capa). Se re-encuadra el concepto de "área" para admitir tracks cuyo entregable no es código de runtime. Impacto en §1.2 decisión 2, §3.1, §3.2, §4 (§4.4, §4.5, §4.6), §5.2, §7.1, §8.2, §8.3, §9.3, §10 (Alt-3), §12 y Apéndice A. Estado sigue `Propuesta`.
- **Revisión 2026-07-06 (rev-2):** Refinamiento dirigido tras auditoría por área del maintainer. Seis ajustes: (1) `seguridad` pasa a **dueño único de §11** (el contrato completo de seguridad); `backend` y `frontend` **consumen §11 por referencia** con notas de implementación server/cliente donde aplique. Se elimina la duplicación de §11 en el slice de backend. (2) §4.6 se completa con las secciones divididas que faltaban: §5 (backend+devops), §7 (funcional+devops+qa) y §11 (seguridad + referencias backend/frontend). Corrige el conteo. (3) §13 se alinea: participación de `backend` **siempre**; participación de `seguridad` **condicional** a señal regulatoria (HIPAA/PCI-DSS/SOX). (4) §8.2 distingue autoría de `spec-qa` en WF-002 (criterios de aceptación §10 + RNFs de calidad §7) del diseño posterior de casos ATF (`step-3-istqb-test-techniques`). (5) §8.2 documenta la condicionalidad de `data` (`sofka-asdd-data-governance` si `data_platform ≠ none`; fallback a `solution-architect` con riesgo de spec liviano; `n/a` en INDEX si el AF marca `Datos Aplica = No`). (6) §4.5 y §8.3 declaran el grafo de dependencias completo del INDEX cubriendo las 7 áreas. Impacto en §3.2, §4.3, §4.4, §4.5, §4.6, §8.2, §8.3. Estado sigue `Propuesta`.
- **Deciders:** _(pendiente — requiere aprobación explícita del maintainer del template)_
- **Autor:** sofka-asdd-solution-architect
- **Rama de trabajo:** `feature/spec-per-area-model`
- **Relacionados:** ADR-001 (ORC enforcement 3 tiers), ADR-002 (Smart Data flow isolation), ADR-003 (analyze-guard domain-aware), WF-002/WF-003/WF-004 en `.claude/rules/sofka-asdd-workflow.md`, `.claude/references/rules/sofka-asdd-workflow-build.md`, ORC-011 en `.claude/references/rules/sofka-asdd-orchestration-worktree.md`.
- **Reemplaza / complementa:** WF-002 sub-regla #3650 (spec-size-guard) — se **retira**; el particionado pasa a ser **estructural por área**, no cuantitativo por tamaño.
- **Ship en:** v2.26.0 (MINOR — cambio de shape en un producto interno del template, sin ruptura del contrato con el consumidor final del código de negocio; sí requiere migración de skills consumidores en el propio template).

---

## 1. Contexto

### 1.1 Punto de partida

El maintainer entregó `/mnt/c/Users/andres.jimenez/Downloads/plantilla_spec_dominio_rev_1.md` (773 líneas, 15 secciones + Registro de Implementación) como **template corporativo Sofka de "Especificación de Dominio"**. Es un super-spec multi-dominio: su §0 declara un **Mapa de dominios** con 9 dominios (Funcional, Arquitectura, Developer, UX, UI, QA, DevOps, Seguridad, Datos) y por cada dominio lista, campo por campo, las secciones que le corresponden y su estado de completitud independiente. La spec queda "completa" cuando **todos los dominios marcados `Aplica = Sí`** están en `COMPLETO` y el AF emite aprobación final (§0 Gate DOR).

La versión previa del template ASDD (`.claude/skills/sofka-asdd-producto-templates/reference/spec-template.md`, 40 líneas) es la síntesis mínima que se usa hoy en `docs/specs/{feature}-{NNN}.md`: un solo archivo por funcionalidad con secciones planas y marcadores `## Aggregate:` para el `spec-size-guard`.

### 1.2 Decisiones tomadas antes de este ADR (locked por el usuario)

Cerradas en la sesión previa a la redacción del ADR. Se documentan porque condicionan el diseño; **no se re-abren aquí**:

1. **No se usa un único super-spec.** El super-spec del template corporativo tiene 9 dominios que actúan como **tracks de implementación** en Construir. Un solo archivo mezcla responsabilidades y hace ineficiente el read por parte de developers especializados.
2. **Áreas = work streams que producen un entregable consumible.** Las 7 áreas de este proyecto son: **backend, frontend, diseno, devops, seguridad, data, qa**. No todas producen código de runtime: `diseno` produce el contrato de diseño (wireframes, flows, arquetipos, componentes hi-fi, design tokens, WCAG, Figma) que alimenta a `frontend` como insumo aguas abajo. El re-encuadre operativo es explícito — un "área" es un track cuyo entregable (código, diseño, política de seguridad, contrato de datos, plan de QA, etc.) es consumido por otras áreas o por el ciclo de verificación. Cada funcionalidad analizada en WF-002 genera **N specs, una por cada área involucrada** — no las 7, solo las que aplican por el Mapa de dominios (§0). Nota: el super-spec corporativo tiene 9 dominios; el mapeo dominio→área operativa se resuelve en §4.5. La dependencia por defecto `diseno → frontend` (§7.1, §8.3) refleja que el código de presentación consume el contrato de diseño.
3. **INDEX delgado + `spec-funcional` aparte.** El "índice" es un artefacto por-feature que resume estado de las áreas y grafo de dependencias. La User Story completa, RN, actores, flujo, trazabilidad — todo el contenido cross-área — vive en un **spec-funcional único** referenciado desde el INDEX. Los `spec-{area}` solo llevan lo que cada track necesita para implementar.
4. **INDEX ↔ `.asdd-run.json` = separados con puntero.** `.asdd-run.json` sigue siendo Single Source of Truth de **fases** (orquestación, checkpoint, resume, ORC-007). El INDEX es SSoT del **progreso de implementación por área** dentro de Construir. **Cero duplicación de estado**: el step Construir de `.asdd-run.json` agrega un campo puntero `index_ref` que apunta al archivo INDEX; el INDEX no re-modela fases.
5. **Naming = reusar el helper existente** (`.claude/scripts/sofka-asdd-artifact-name.mjs`), plano en `docs/specs/`, fase `analyze`, con slugs canónicos:
   - `{feature}-index` para el INDEX
   - `{feature}-funcional` para el spec-funcional
   - `{feature}-{area}` para cada slice por área
   El patrón resultante es `{run_id}-ANALYZE-{SEQ}-{feature}-{area|index|funcional}.md`.
6. **Retirar el `spec-size-guard` (WF-002 sub-regla #3650).** Sus 3 gatillos actuales (`>300 líneas`, `>5 CU-\d+`, `>1 ## Aggregate:`) quedan sin sentido: el template corporativo no usa `CU-\d+` (los reemplaza por Reglas de Negocio + Gherkin sin ID) ni `## Aggregate:` (no es lenguaje del super-spec). Y la partición estructural por área garantiza tamaños razonables sin heurística cuantitativa.

### 1.3 Problema que este ADR resuelve

Con las 6 decisiones locked, quedan **6 preguntas de diseño abiertas** que este ADR cierra. Sin ellas, no se puede implementar el modelo:

| # | Pregunta abierta | Formaliza en |
|---|---|---|
| **T1** | ¿Cuál es el schema exacto del INDEX y del spec-funcional? | §3 |
| **T2** | ¿Cada `spec-{area}` es un **slice** del super-spec (solo secciones que le tocan) o un **template lean propio** por área? | §4 |
| **T3** | ¿Cómo se exenta al INDEX y a los `spec-{area}` del `artifact-name-guard`, dado que son **artefactos vivos** editados durante Construir en runs posteriores al de creación? | §5 |
| **T4** | ¿Cómo se reconcilian los consumidores del template que parsean `CU-\d+`, `HU-\d+`, `AC-\d+` con el nuevo modelo (sin ID en Gherkin, con `GAP-NNN` y `CR-NNN` nuevos, y `RN-\d+` tipado `[CORE]/[EDGE]`)? | §6 |
| **T5** | ¿Cuál es el **contrato de interacción** durante Construir: loop del agente, resume/post-compact, y concurrencia entre worktrees paralelos que tocan el mismo INDEX? | §7 |
| **T6** | ¿Cómo cambia **WF-002** para pasar de single-agent (`sofka-asdd-producto`) a autoría multi-dominio coordinada por el **Gate DOR** del super-spec? | §8 |

---

## 2. Decisión

Adoptar un **modelo de artefactos por-área** en WF-002, compuesto por tres tipos de archivo interrelacionados, retirando el `spec-size-guard` de #3650. Los detalles operacionales se formalizan en las secciones §3 a §9. El resumen ejecutivo:

- **Un INDEX por feature** en `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-index.md` — SSoT del progreso de las áreas.
- **Un spec-funcional por feature** en `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-funcional.md` — SSoT del contenido cross-área (User Story, Actores, Flujo de Negocio, RN, Trazabilidad, Gaps, CRs).
- **N spec-{area}** en `docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-{area}.md` — uno por cada área con `Aplica = Sí` en el Mapa de dominios. Cada spec-{area} es un **slice canónico** del super-spec (§4).
- **Puntero unidireccional** desde `.asdd-run.json.phases.build.index_ref` al INDEX. Cero duplicación de estado.
- **Sin exención de naming** — el `artifact-name-guard` no valida `Edit`, por lo que la edición de artefactos vivos (INDEX, spec-{area}) ya está libre y no requirió cambios en el guard (§5, revisado en WU-7).
- **Retirar el spec-size-guard** (§9). La partición pasa a ser estructural por área.
- **WF-002 se convierte en fase multi-dominio** (§8) con el Gate DOR del super-spec como criterio de cierre.

---

## 3. Schema del INDEX y del spec-funcional (cierra T1)

### 3.1 INDEX — SSoT del progreso por área

Archivo Markdown. Se crea en WF-002 (fase Analizar). Se edita en WF-004 (fase Construir). Se cierra en WF-005 (fase Verificar). Estructura obligatoria:

```markdown
# Índice de implementación — {feature}

<!-- Artefacto vivo. Edición autorizada en fases Construir y Verificar de cualquier run posterior al de creación. Ver ADR-004 §5. -->

| Metadatos | Valor |
|---|---|
| Feature | {feature} |
| Run de origen | {run_id_creación} |
| Spec-funcional | {ruta relativa a docs/specs/} |
| Estado global | {pending | in_progress | done | blocked} |
| Última actualización | {YYYY-MM-DD HH:MM UTC} |
| Progreso | X/Y áreas done · Z% |

## Áreas y specs

| # | Área | Spec | Orden | Depende de | Estado | Agente propuesto | Fecha done | Commit |
|---|---|---|---|---|---|---|---|---|
| 1 | backend | {ruta} | 1 | — | pending | sofka-asdd-developer-backend | — | — |
| 2 | diseno | {ruta} | 1 | — | pending | sofka-asdd-ux + sofka-asdd-ui | — | — |
| 3 | frontend | {ruta} | 2 | 1,2 | pending | sofka-asdd-developer-frontend | — | — |
| 4 | qa | {ruta} | 3 | 1,3 | pending | sofka-asdd-atf-api-qa-engineer | — | — |

## Grafo de dependencias

´´´mermaid
graph TD
  backend --> frontend
  diseno --> frontend
  backend --> qa
  frontend --> qa
´´´  

## Progreso por estado

- pending: N
- in_progress: N
- done: N
- blocked: N (razones abajo)

## Historial de estado

<!-- Append-only. Un renglón por transición. Formato: {ts} · área · from → to · agente · commit -->

| Timestamp | Área | Transición | Agente | Commit |
|---|---|---|---|---|
```

**Reglas del INDEX:**

- **R-INDEX-1**: Estados válidos por área: `pending | in_progress | done | blocked | n/a`. `n/a` se usa si el AF decidió a posteriori que el área no aplica (equivalente a `Aplica = No` en el Mapa de dominios del super-spec).
- **R-INDEX-2**: La tabla "Historial de estado" es **append-only**. Los renglones existentes no se editan, solo se agregan. Esto permite auditar el flujo sin depender de `git log`.
- **R-INDEX-3**: El INDEX **no duplica** fases del ciclo ASDD ni artifact_seq. Sólo modela áreas y sus estados.
- **R-INDEX-4**: El campo `Run de origen` en metadatos referencia el `run_id` bajo el cual se creó. Ediciones posteriores desde runs distintos NO cambian ese campo (queda trazado en el filename por el `run_id` embebido). Este es el "puntero fósil" que hace legible el INDEX aunque se edite meses después.

### 3.2 spec-funcional — SSoT del contenido cross-área

Archivo Markdown. Contiene **todas las secciones del super-spec corporativo (§0-§15)** que son **funcionales por naturaleza** (dominio Funcional del Mapa) más las secciones puramente informativas que cruzan áreas (Actores, Flujo de Negocio, Reglas de Negocio, Trazabilidad, Fuera de alcance, Decisiones y Gaps, Historial post-aprobación).

Secciones incluidas del super-spec corporativo:

- §0 Metadatos + Mapa de dominios + Gate DOR (íntegra)
- §1 User Story + Fuera de alcance
- §2 Actores y Permisos (subsección Funcional; la subsección UX/UI-arquetipos vive en `spec-diseno`)
- §3 Trazabilidad
- §4 Flujo de Negocio + Máquina de estados
- §6 Reglas de Negocio (íntegra, incluye `[CORE]` y `[EDGE]`)
- §7 RNFs de negocio (íntegra, sin subsecciones técnicas)
- §14 Decisiones Requeridas y Gaps
- §15 Historial de Cambios Post-Aprobación

Secciones **NO incluidas** en spec-funcional (viven en spec-{area}):

- §5 Integraciones (spec-backend + spec-devops)
- §8 UX Vista Funcional (spec-diseno como fuente del contrato visual, con soporte de spec-funcional para "Mensajes al usuario" y "Datos requeridos por estado"; spec-frontend implementa el wiring del contrato)
- §9 Validaciones de Campos (spec-diseno para comportamiento visual/UX + spec-frontend para validación cliente + spec-backend para validación servidor)
- §10 Criterios de Aceptación (spec-qa)
- §11 Seguridad (spec-seguridad — **dueño único** del contrato completo de seguridad; backend y frontend lo consumen por referencia — ver §4.6)
- §12 Dominio de Datos (spec-data)
- §13 Controles y Auditoría (spec-backend **siempre**; spec-seguridad **condicional** a señal regulatoria HIPAA/PCI-DSS/SOX — ver §4.6)
- §◎ Registro de Implementación (INDEX asume esa función)

**Nota**: las secciones §2, §4, §5, §7, §8, §9, §11 y §13 se dividen entre áreas — ver §4.6 para el mapeo exacto de secciones divididas.

**Reglas del spec-funcional:**

- **R-FUN-1**: Es el único archivo con **Estado APROBADA / BORRADOR** que corresponde a los estados globales del super-spec. Los `spec-{area}` heredan ese estado a través del INDEX.
- **R-FUN-2**: Cambios post-aprobación (CR-NNN) se registran en §15 del spec-funcional; los CRs que impacten un `spec-{area}` particular se referencian con marcador inline en ese área (mismo patrón `[CR-NNN]` del super-spec).
- **R-FUN-3**: El AF es el único autor de spec-funcional. Los demás dominios contribuyen a los `spec-{area}`.

---

## 4. Slice vs template lean — recomendación resuelta (cierra T2)

### 4.1 Alternativas evaluadas

| Alt | Descripción | Ventajas | Desventajas |
|---|---|---|---|
| **Alt-A — Slice canónico** | Cada `spec-{area}` es una proyección filtrada del super-spec que muestra **exactamente** las secciones asignadas a ese dominio en el Mapa (§0), en el mismo orden, con la misma redacción de headings, instrucciones y responsabilidades. El slicer es una regla mecánica derivada del Mapa. | (a) Máxima fidelidad al template corporativo — el spec-{area} es literalmente un subconjunto del super-spec, palabra por palabra. (b) Cambios al template corporativo propagan automáticamente al slicer sin editar N templates. (c) El consumidor Sofka reconoce cada sección porque el heading es idéntico al del template corporativo que ya conoce. (d) Trazabilidad implícita: cada sección de spec-{area} referencia una sección del super-spec por número. | (a) Los slices heredan la verbosidad del super-spec — cada uno arrastra tablas con muchos campos aunque el área solo use algunos. (b) Requiere un "slicer" (regla o skill) que mantenga la proyección; sin él, un editor humano podría producir slices divergentes. |
| **Alt-B — Template lean propio por área** | Se diseña un template minimalista por cada área (6 templates nuevos), curado a mano, con secciones específicas del track. `spec-backend` habla el idioma del backend (endpoints, DTOs, migraciones); `spec-frontend` el del frontend (componentes, hooks, tokens); etc. | (a) Cada spec-{area} ocupa menos líneas y tiene solo lo esencial para su implementador. (b) Se puede diseñar cada template al vocabulario del rol destino. | (a) 6 templates nuevos que mantener + drift inevitable contra el super-spec corporativo. (b) Se pierde la trazabilidad 1-a-1 con el template Sofka. (c) Duplicación conceptual: cambios al super-spec obligan a revisar 6 templates. (d) Riesgo de que un template lean omita una restricción crítica que sí estaba en el super-spec (ej. §11 Seguridad "OWASP Top 10" completa). |
| **Alt-C — Híbrido: slice + wrapper de contexto por área** | Slice canónico del super-spec **más** un pequeño encabezado con contexto específico del área (rol destino, prerequisitos, hallazgos del análisis relevantes para ese track). El wrapper NO agrega secciones nuevas, solo un preámbulo. | (a) Combina fidelidad de Alt-A con orientación de Alt-B. (b) El wrapper puede generarse una sola vez al crear el spec-{area}; no cambia. | (a) Ligera complejidad adicional respecto a Alt-A. |

### 4.2 Recomendación: **Alt-C (Slice canónico + wrapper de contexto)**

**Justificación:**

1. **Fidelidad no negociable.** El super-spec de Sofka es el estándar corporativo. Duplicar su semántica en 6 templates propios (Alt-B) tarde o temprano diverge — sesgo empírico visto en cada framework que intenta "adaptar" un template maestro (ver el rework de la sub-regla #3650, precisamente porque el mini-template ASDD ya divergió del super-spec).
2. **Mantenibilidad.** Una regla de slicing centralizada (`.claude/skills/sofka-asdd-producto-templates/reference/spec-slice-rules.md`) es más barata de mantener que 6 templates independientes. Cuando el super-spec cambie (v2 del template corporativo, ampliación del Mapa de dominios), sólo se actualiza el slicer.
3. **Trazabilidad 1-a-1.** Un auditor puede comparar `spec-backend §5` con "template corporativo §5" sin traducción. Alt-B rompe ese pareo.
4. **Wrapper de contexto** resuelve la única objeción real a Alt-A (verbosidad): el wrapper le dice al developer "estas son las secciones que te tocan, este es tu prerequisito, este es tu output esperado en Construir". No es un template nuevo — es una hoja de instrucciones al comienzo del slice.

### 4.3 Estructura del slice canónico (spec-{area})

```markdown
# {feature} — spec-{area}

<!-- Slice canónico del template corporativo Sofka. Ver ADR-004 §4. Este spec vive junto a:
- INDEX: {ruta}
- spec-funcional: {ruta}
Editable durante Construir. Ver §5. -->

## Wrapper de contexto — {area}

- **Rol destino:** {agente propuesto, ej. sofka-asdd-developer-backend}
- **Prerequisito:** todas las secciones del spec-funcional (User Story, Actores, RN, Flujo) están APROBADAS.
- **Áreas de las que depende:** {del INDEX — ej. "backend depende de nada; diseno depende de nada; frontend depende de backend y diseno; qa depende de backend y frontend"}
- **Contexto derivado del análisis:** {2-4 líneas — hallazgos del BA/Funcional/PO relevantes para este track, o `— sin hallazgos específicos`.}
- **Secciones que este spec cubre** (del template corporativo Sofka): {lista exacta — ej. §5, §9 (columnas de Developer), §11 subsecciones técnicas}
- **Marcador Aplica del Mapa:** Sí

---

## §5 Integraciones y Dependencias Externas

<!-- Secciones del super-spec corporativo. Contenido de las tablas queda vacío para completar por el rol destino en la fase apropiada, o poblado por el AF/Arquitecto durante Analizar según responsabilidad marcada [AF]/[Arquitecto/Developer]. -->

{...contenido del slice, EXACTAMENTE como aparece en el template corporativo Sofka §5...}

## §9 Validaciones de Campos — subsecciones Developer

{...slice de §9 con las columnas y subsecciones que corresponden al backend...}

## §11 Seguridad — nota de implementación server-side

> **Contrato de seguridad:** ver `spec-seguridad §11` — dueño único del contrato completo (autenticación, autorización, gestión de secretos, ciclo de sesión/token, logging seguro, casos de abuso, integraciones salientes, OWASP, compliance).

{...notas específicas de implementación server-side donde apliquen, sin re-declarar el contrato: enforcement en middleware, validación de JWT, mapeo de roles a policies, uso del KMS/vault del proyecto. Estas notas COMPLEMENTAN el contrato — nunca lo reescriben...}

## §13 Controles y Auditoría — subsección Arquitectura

{...slice de §13 subsección Arquitectura — compliance / trazabilidad regulatoria (eventos de negocio auditables desde el servidor, evidencia técnica de controles). Backend cubre §13 **siempre**; spec-seguridad se activa **solo** si el Mapa marca señal regulatoria (HIPAA/PCI-DSS/SOX)...}
```

### 4.4 Regla de slicing (skill nuevo)

Se crea un nuevo skill `sofka-asdd-producto-templates` reference `spec-slice-rules.md` (a redactar en la implementación) que define, por área, qué secciones del super-spec Sofka le corresponden. Es una **tabla de proyección**, no un template. Ejemplo:

```yaml
# spec-slice-rules — proyección Mapa de dominios (§0 super-spec) → área ASDD
# El dominio Developer del super-spec se PARTE POR CAPA: capa servidor → backend, capa presentación → frontend.
areas:
  backend:
    dominios_sofka: [Arquitectura, "Developer (capa servidor)"]
    secciones_super_spec:
      - "5 (subsección Backend/Arquitectura — contrato técnico completo, integración técnica, mock/prod)"
      - "9 (columnas Developer capa servidor: validación servidor, backend enforcement, evento)"
      - "13 (subsección Arquitectura — compliance / trazabilidad regulatoria)"
    referencia_por_puntero:
      - "11 (dueño: spec-seguridad — backend agrega solo notas de implementación server-side; nunca redeclara el contrato)"
  diseno:
    dominios_sofka: [UX, UI]
    secciones_super_spec:
      - "2 (subsección UX/UI — arquetipos y patrones de interacción por rol)"
      - "4 (máquina de estados — subsección UX/UI: intención visual y transiciones desde la perspectiva del usuario)"
      - "8 (íntegra — Vista Funcional UX + Vista UI: Prerequisitos UI, configuración UI, componentes hi-fi, design tokens, WCAG, Figma)"
      - "9 (subsección UX/UI — comportamiento de mensajes, tratamiento visual de errores HTTP, escenarios mock, jerarquía visual de validaciones)"
    consumido_por: [frontend]
  frontend:
    dominios_sofka: ["Developer (capa presentación)"]
    secciones_super_spec:
      - "4 (máquina de estados — subsección Developer: implementación de estado UI, routers, transiciones en código)"
      - "8 (subsección Developer — wiring de componentes hi-fi contra APIs del backend, consumo de tokens y contrato visual de spec-diseno)"
      - "9 (subsección Developer capa presentación: tipo HTML de input, longitud enforced en cliente, regex de validación cliente, integración con validación servidor de spec-backend)"
    referencia_por_puntero:
      - "11 (dueño: spec-seguridad — frontend agrega solo notas de implementación cliente-side: manejo de token, storage seguro, mitigación XSS, CSP, sesión; nunca redeclara el contrato)"
    consume: [diseno, backend]
  devops:
    dominios_sofka: [DevOps]
    secciones_super_spec:
      - "5 (subsección — SLA operacional / monitoreo)"
      - "7 (subsección — SLOs operacionales, observabilidad, pipeline, alertas)"
  seguridad:
    dominios_sofka: [Seguridad]
    secciones_super_spec:
      - "11 (íntegra — dueño ÚNICO del contrato completo de seguridad: autenticación, autorización, gestión de secretos, ciclo de sesión/token, logging seguro, casos de abuso, integraciones salientes, OWASP Top 10, compliance)"
      - "13 (subsección — condicional a señal regulatoria HIPAA/PCI-DSS/SOX; copia por referencia de la subsección de compliance del spec-backend cuando aplica)"
    consumido_por: [backend, frontend]  # ambos referencian §11 por puntero, no duplican contenido
  data:
    dominios_sofka: [Datos]
    secciones_super_spec:
      - "12 (íntegra — Dominio de Datos)"
  qa:
    dominios_sofka: [QA]
    secciones_super_spec:
      - "7 (subsección — RNFs de calidad, cobertura, performance testing)"
      - "10 (íntegra — Criterios de Aceptación con escenarios Gherkin base + adicionales QA + criterios de done)"
```

**Regla de reparto del dominio Developer (por CAPA):** el super-spec corporativo tiene un único dominio `Developer` que este ADR proyecta a DOS áreas ASDD según la capa arquitectónica de cada sección:

- **Developer (capa servidor) → backend.** Cubre API, dominio, DTOs, validación en servidor, migraciones, enforcement de reglas de negocio en backend, publicación de eventos.
- **Developer (capa presentación) → frontend.** Cubre implementación de componentes en código (React/framework), hooks, estado UI, routers, validación en cliente (tipos HTML, regex, longitud), consumo del contrato visual entregado por `spec-diseno` y del contrato de API entregado por `spec-backend`.

La partición evita que `spec-frontend` quede vacío tras mover UX+UI al área `diseno`. `spec-frontend` es la guía de implementación de código de presentación — el "código que renderiza y hace wiring" — no el diseño en sí.

### 4.5 Mapeo dominios (9) → áreas (7)

El super-spec corporativo tiene 9 dominios. Este ADR los proyecta a **7 áreas ASDD**. La única partición de un dominio Sofka en dos áreas ASDD ocurre en `Developer`, que se reparte por CAPA (ver §4.4). El resto es 1-a-1 o consolidación (UX+UI → `diseno`, Arquitectura+Developer-servidor → `backend`).

| Dominio Sofka | Área ASDD | Contribuye a |
|---|---|---|
| Funcional | (spec-funcional) | Contenido base cross-área — no genera spec-{area} |
| Arquitectura | backend | Contrato técnico servidor, SLAs, ADRs de aplicación |
| Developer (capa servidor) | backend | API, dominio, DTOs, validación servidor, migraciones, publicación de eventos |
| Developer (capa presentación) | frontend | Código de presentación (componentes, hooks, estado UI, routers, validación cliente) consumiendo `spec-diseno` y `spec-backend` |
| UX | diseno | Wireframes mid-fi, flows, arquetipos, arquitectura de información |
| UI | diseno | Componentes hi-fi, design tokens, WCAG, integración Figma |
| QA | qa | Escenarios adicionales, cobertura, performance |
| DevOps | devops | SLOs, pipeline, observabilidad |
| Seguridad | seguridad | Auth, secretos, OWASP, compliance |
| Datos | data | Discovery, stakeholders, fuentes, restricciones |

**Grafo de dependencias por defecto entre áreas (para el INDEX):**

Las 7 áreas se agrupan por su rol en el ciclo — contrato temprano vs implementación vs verificación. El grafo por defecto refleja qué área **necesita el output** de cuál antes de arrancar su implementación:

| Arista (dura, salvo nota) | Justificación |
|---|---|
| `diseno → frontend` | `spec-frontend` consume el contrato visual (Figma, tokens, componentes hi-fi, WCAG) entregado por `spec-diseno`. |
| `backend → frontend` | `spec-frontend` consume APIs y DTOs definidos en `spec-backend`. |
| `seguridad → backend` | `spec-backend` referencia §11 (contrato de auth, secretos, sesión) — necesita el contrato de seguridad listo antes de codificar enforcement. |
| `seguridad → frontend` | `spec-frontend` referencia §11 (manejo cliente-side de token, storage, CSP). Igual razón que backend. |
| `backend → devops` | `spec-devops` toma como input el contrato técnico (§5) y las SLAs operacionales (§7) del backend para configurar pipeline, observabilidad y alertas. |
| `backend → qa` | `spec-qa` diseña casos contra el contrato API (endpoints, DTOs, códigos de error) del backend. |
| `frontend → qa` | `spec-qa` diseña casos E2E contra la UI implementada — necesita saber estados visuales, componentes, rutas del frontend. |
| `data` (independiente) | Cuando aplica, `spec-data` se elabora en paralelo — no bloquea ni es bloqueado por las otras áreas dentro de WF-002 (el consumo aguas abajo — Bronze/Silver/Gold — sale del scope de este ADR y vive en su propio flujo D0-D7). |

**Áreas que pueden arrancar en paralelo (sin dependencias entrantes):** `seguridad`, `diseno`, `backend`, `data`. Son contratos o áreas independientes — el orquestador las lanza en paralelo en WF-002 (ORC-011-A verifica que sus specs son archivos distintos).

**Áreas con dependencia dura:**
- `frontend` — depende de `diseno` + `backend` (+ referencia a `seguridad` para notas cliente-side; ver §4.6).
- `devops` — depende de `backend`.
- `qa` — depende de `backend` + `frontend`.

**Regla de arranque de implementación (WF-004):** `frontend`, `devops` y `qa` no pasan de `pending → in_progress` hasta que TODAS sus dependencias entrantes estén `done` (§7.1 loop, R-INDEX). Si el Mapa marca alguna dependencia como `Aplica = No` (p.ej. `seguridad Aplica = No` para un feature sin auth explícita), la arista correspondiente desaparece del grafo del INDEX.

**Nota — dependencias suaves de contrato:** las aristas `seguridad → backend` y `seguridad → frontend` son duras en WF-004 (necesitas el §11 del spec-seguridad antes de codificar), pero en WF-002 los tres slices se pueden **redactar en paralelo** — el sign-off cruzado se resuelve en Gate DOR (§8.3 paso 4).

**Simetría con backend:** `diseno` fusiona UX + UI de forma equivalente a como `backend` fusiona Arquitectura + Developer(servidor) — ambos son áreas de "diseño y contrato" cuyo output alimenta la implementación en código. Esto justifica el re-encuadre de "área" en §1.2 decisión 2: `diseno` no produce código de runtime pero sí produce un **entregable consumible** (el contrato visual).

**Anti-patrón bloqueado:** ninguna área "hereda" secciones automáticamente. Si el Mapa de dominios dice `UX/UI Aplica = No` (ej. servicio backend puro sin frontend), NO se crean `spec-diseno` ni `spec-frontend`. El INDEX marca ambas filas como `n/a` desde el arranque. Análogamente, un feature "solo diseño de rediseño visual" con `Developer (presentación) Aplica = No` genera `spec-diseno` sin `spec-frontend` — decisión operativa del AF en el Mapa.

### 4.6 Secciones divididas entre áreas (regla de resolución de conflictos)

Del análisis del super-spec corporativo hay **8 secciones divididas** — aparecen en el slice de MÁS DE UN área o combinan contenido de `spec-funcional` con contenido específico de un track. La regla común: todos los slices citan por referencia cuando existe un ancla en `spec-funcional` o en el spec dueño del contrato, y **nunca duplican** el contenido citado. Cada sección tiene un dueño explícito y las demás áreas la consumen por puntero (`> Ver spec-{dueño} §N para {tema}`).

**Criterio de auditoría — completitud de esta lista:** una sección se considera "dividida" si aparece asignada a ≥2 áreas en §4.4 (`secciones_super_spec` + `referencia_por_puntero`) o si su contenido funcional vive en `spec-funcional` y su implementación vive en al menos un `spec-{area}`. Esta lista debe cubrir el 100% de esos casos — no dejar secciones divididas fuera es un requisito auditable.

| # | Sección | Dueño(s) | Áreas que consumen por referencia | Regla |
|---|---|---|---|---|
| 1 | §2 Actores y Permisos | `spec-funcional` (Actores + matriz de permisos AF) · `spec-diseno` (arquetipos UX/UI por rol) | `spec-frontend` referencia `spec-diseno §2` | `> Ver spec-diseno §2 para los arquetipos aplicables` |
| 2 | §4 Máquina de Estados | `spec-funcional` (diagrama base + transiciones funcionales) · `spec-diseno` (intención visual UX/UI) · `spec-frontend` (implementación Developer capa presentación) | `spec-backend` puede añadir subsección Developer server-side si el estado se enforza en servidor | Cada área agrega SÓLO su subsección; nunca redeclara el diagrama base del funcional |
| 3 | **§5 Integraciones y Dependencias Externas** | `spec-backend` (contrato técnico, integración técnica, mock/prod) · `spec-devops` (SLA operacional / monitoreo de las integraciones) | — | `spec-devops` referencia `spec-backend §5` para la lista de integraciones y agrega sus propias métricas operacionales |
| 4 | **§7 RNFs** | `spec-funcional` (RNFs de negocio — capacidad, disponibilidad esperada, criticidad) · `spec-devops` (SLOs operacionales, observabilidad, pipeline, alertas) · `spec-qa` (RNFs de calidad, cobertura, performance testing) | — | Cada área declara SU subsección de §7. `spec-devops` y `spec-qa` referencian `spec-funcional §7` como ancla de RNF de negocio y agregan sus targets técnicos derivados |
| 5 | §8 Vista Funcional | `spec-funcional` (Mensajes al usuario / Datos por estado — AF) · `spec-diseno` (grueso: Prerequisitos UI, configuración UI, componentes hi-fi, tokens, WCAG, Figma) · `spec-frontend` (wiring Developer) | — | `spec-frontend` referencia `spec-diseno §8` para el contrato visual |
| 6 | §9 Validaciones de Campos | `spec-funcional` (tabla "Reglas de validación — AF" — ancla) | `spec-diseno` (comportamiento visual/UX) · `spec-frontend` (validación cliente) · `spec-backend` (validación servidor) | Cada slice: `> Ver spec-funcional §9 para la tabla AF` + solo sus subsecciones propias. **Nunca** duplicar la tabla del funcional |
| 7 | **§11 Seguridad** | **`spec-seguridad` (dueño ÚNICO del contrato completo)** — autenticación, autorización, gestión de secretos, ciclo de sesión/token, logging seguro, casos de abuso, integraciones salientes, OWASP Top 10, compliance | `spec-backend` (notas de implementación server-side) · `spec-frontend` (notas de implementación cliente-side: manejo de token, storage seguro, mitigación XSS, CSP) | Backend y frontend **NUNCA** redeclaran el contrato — solo agregan notas específicas de implementación bajo un puntero `> Ver spec-seguridad §11 para el contrato de seguridad`. Auth aparece **una sola vez** en el corpus del feature, como contrato en `spec-seguridad §11` |
| 8 | §13 Controles y Auditoría | `spec-funcional` (Eventos de negocio — AF) · `spec-backend` (**siempre** — subsección Arquitectura: compliance / trazabilidad regulatoria, evidencia técnica de controles) | `spec-seguridad` (**condicional** — solo si el Mapa marca señal regulatoria HIPAA/PCI-DSS/SOX; copia por referencia de la subsección de compliance del backend) | Backend §13 aparece **siempre** que exista área backend. Seguridad §13 se activa **solo** por señal regulatoria explícita — sin señal, el AF marca la fila `spec-seguridad §13 = n/a` |

**Nota — anti-duplicación de auth:** con la regla de §11, cualquier mención a autenticación, autorización o gestión de secretos que aparezca **redactada** (no por referencia) en un slice distinto de `spec-seguridad` es un defecto de spec — debe reescribirse como puntero. El auditor puede validar mecánicamente esta regla buscando keywords (`OAuth`, `JWT`, `refresh token`, `roles`, `RBAC`, `secretos`) fuera del spec-seguridad y confirmando que cada aparición esté precedida por un bloque `> Ver spec-seguridad §11`.

---

## 5. Edición de artefactos vivos — sin exención necesaria (cierra T3)

> **Revisión 2026-07-07 (WU-7):** esta sección quedó obsoleta tras un hallazgo de implementación. La exención de `Edit` que originalmente se proponía **no era necesaria y no se implementó** — el `artifact-name-guard` nunca validó `Edit`. El texto a continuación documenta la realidad implementada.

### 5.1 Problema planteado originalmente

La duda T3 asumía que editar los INDEX y `spec-{area}` desde un run posterior al de creación sería bloqueado por el `artifact-name-guard` (que valida `run_id`/PHASE del filename contra el run activo, y bloquea todo Write cuando `status = complete`).

### 5.2 Hallazgo — el guard nunca valida `Edit`

`sofka-asdd-pre-tool-use-artifact-name-guard.mjs` está registrado con `matcher: Write` y, en su cuerpo, retorna temprano para cualquier tool distinto de `Write` (`if (toolName !== "Write") return`). Es decir: **el guard solo valida la creación (`Write`), nunca la edición (`Edit`/`MultiEdit`)**.

Consecuencia directa:

- Los `Edit` de artefactos vivos (INDEX, `spec-funcional`, `spec-{area}`) desde cualquier run posterior — incluso con el run original `complete` — **ya están libres**, porque el guard no intercepta `Edit`.
- La creación (`Write`) de esos artefactos sigue validada normalmente: se estampan con el `run_id`/PHASE activos en el run de Analizar donde nacen. No hay backdoor de creación.

Por lo tanto, **el `artifact-name-guard` queda sin cambios** en esta ADR. No se añadió lista de slugs vivos ni lógica de exención por sufijo: habría sido código muerto que enmascara la salvaguarda real (la validación de creación).

### 5.3 Efecto sobre run.status = complete

El bloqueo de `status = complete` vive en la rama de `Write` del guard, por lo que solo afecta la **creación** de artefactos con el run cerrado. Los CRs (Change Requests) sobre un feature entregado editan `spec-{area}` y el INDEX mediante `Edit` — no tocan esa rama y no requieren abrir un run nuevo, en línea con la semántica del super-spec §15 (los CRs agregan un renglón al historial, no re-inician el ciclo).

Crear un archivo NUEVO cuando el run está complete sigue bloqueado (comportamiento correcto y deseado). Si un CR requiere nuevas áreas o un nuevo INDEX, hay que abrir un run.

---

## 6. Reconciliación Tier C (cierra T4)

### 6.1 Cambio en el vocabulario

El template corporativo Sofka **eliminó** de la spec:

- `CU-\d+` (Casos de uso numerados) → reemplazados por Reglas de Negocio `RN-\d+` tipadas `[CORE]` / `[EDGE]` (§6) y por Flujo de Negocio numerado sin ID (§4).
- `HU-\d+` (Historias de usuario numeradas) → reemplazadas por **una única** User Story libre en §1.
- `AC-\d+` (Criterios de aceptación numerados como IDs propios) → reemplazados por **escenarios Gherkin** en §10, sin ID explícito, con etiquetas de tipo (`Scenario: Happy path — ...`, `Scenario: Negativo — ...`, `Scenario: Edge case regulatorio — ...`).

**Introduce:**

- `RN-\d+` con tipo obligatorio `[CORE]` o `[EDGE]` (mismo formato numérico, semántica ampliada).
- `GAP-\d+` en §14 (Decisiones Requeridas y Gaps).
- `CR-\d+` en §15 (Historial de Cambios Post-Aprobación).
- Marcador inline `> **[CR-NNN]** *Modificado AAAA-MM-DD. Ver § 15.*` en elementos modificados post-aprobación.

**Mantiene:**

- Reglas de negocio como concepto (con nuevo tipado).
- Escenarios de aceptación (con nueva forma, sin ID).

### 6.2 Consumidores impactados y decisión de reconciliación

| Consumidor | Uso actual | Impacto | Reconciliación propuesta |
|---|---|---|---|
| `sofka-asdd-tech-lead-sdd-traceability` | Parsea `AC-\d+`, `RN-\d+`, `CU-\d+` de la spec y los cruza contra tests | Se rompe para `CU-\d+` (no existe) y `AC-\d+` (no existe como ID; existe como Gherkin scenario sin ID) | **Migrar el parser**: (a) para AC → derivar ID sintético `SCN-{NNN}` desde el orden de aparición de `Scenario:` en §10. (b) para RN → mantener parseo con nuevo tipado (`[CORE]` / `[EDGE]` no cambia la extracción del ID). (c) para CU → **retirar** la tabla; el Flujo de Negocio §4 se rastrea por su descripción, no por ID. Documentar en `sdd-traceability.md` §"Ítems rastreables" el nuevo mapeo. |
| `sofka-asdd-tech-lead-artifact-audit` | En SKILL.md línea 52: verifica presencia de `CU-\d+` con flujo principal/alternativo/excepción | Falso negativo permanente (nunca encontrará `CU-\d+`) | **Migrar la señal**: reemplazar el check por presencia de "Flujo de Negocio" numerado en §4 y de máquina de estados. |
| `sofka-asdd-atf-api-step-1-hu-parser` | Trabaja sobre HUs crudas en `docs/testing/atf/requirements/`, no sobre specs ASDD | Sin impacto directo — sigue leyendo HUs de negocio en formato libre | Sin cambios en el skill. Nota en `sofka-asdd-atf-api-orchestration.md`: aclarar que los inputs del pipeline ATF-API son HUs de negocio (no `spec-{area}`). |
| `sofka-asdd-atf-api-qa-engineer` | Consume artefactos del pipeline ATF, no specs ASDD | Sin impacto directo | Sin cambios. La relación spec-qa ↔ ATF-API es a través del INDEX (spec-qa referencia la corrida ATF por `run_id` del pipeline QA, no por ID de AC). |
| `sofka-asdd-pre-tool-use-spec-size-guard` | Regex `CU-\d+`, marcador `## Aggregate:`, límite 300 líneas | **Retirado** — ver §9 | Eliminar el hook y su registro en `.claude/settings.json`. |

### 6.3 Convención de IDs con el nuevo modelo

| ID | Origen | Alcance | Se rastrea desde |
|---|---|---|---|
| `RN-NNN` | Reglas de Negocio §6 (tipado `[CORE]` / `[EDGE]`) | Global por feature (en spec-funcional) | tests que validan la regla; código de dominio que la enforza |
| `SCN-NNN` (sintético) | Orden de `Scenario:` en §10 (spec-qa) | Global por feature | test que ejecuta el escenario |
| `GAP-NNN` | §14 spec-funcional | Global por feature | resolución en algún spec-{area} o carrying a Verificar |
| `CR-NNN` | §15 spec-funcional | Post-aprobación | marcadores inline `[CR-NNN]` en el elemento modificado |
| `FAS-NNN` | §1 spec-funcional (Fuera de Alcance) | Global por feature | control de alcance en UAT |

**Anti-decisión: no re-introducir `CU-\d+` ni `HU-\d+` ni `AC-\d+`.** El template corporativo Sofka es el estándar; migrar los consumidores es más barato que mantener un desalineamiento permanente con el corporativo.

---

## 7. Contrato de interacción durante Construir (cierra T5)

### 7.1 Loop del agente en fase Construir

**Pre-condición:** WF-002 cerrado con Gate DOR verde en el spec-funcional (todos los dominios `Aplica = Sí` en COMPLETO).

**Pre-condición operativa:** `.asdd-run.json.phases.build.index_ref` está poblado apuntando al INDEX. Si no lo está, el orquestador lo puebla al abrir Construir (paso 1 de la fase, antes de delegar al primer developer).

Loop (una iteración por área implementada):

```
1. Orquestador lee .asdd-run.json.phases.build.index_ref → obtiene ruta al INDEX.
2. Orquestador lee INDEX → construye lista de áreas con
   estado == "pending" AND todas las áreas de "Depende de" en estado == "done".
   Si la lista está vacía → verificar si quedan `in_progress` (esperar) o `blocked` (escalar).
3. Orquestador elige la próxima área (según orden natural + prioridad del graph).
4. Orquestador anuncia la delegación en chat (ORC-008): agente propuesto, model, spec-{area}.
5. El agente elegido:
   5.1. Lee spec-funcional (una sola vez por sesión — cachea en su contexto).
   5.2. Lee spec-{area} de su ámbito.
   5.3. Implementa según ADR-004 y las convenciones de su rol.
   5.4. Reporta al orquestador: WORKTREE COMMIT (si aplica ORC-011), archivos tocados, resumen.
      Nota: `diseno` NO usa worktree — sus agentes (sofka-asdd-ux + sofka-asdd-ui) producen artefactos de diseño (Figma refs, tokens, specs de componentes, wireframes) que no requieren aislamiento de código. El reporte del área `diseno` incluye la ruta a los entregables producidos y no ejecuta ORC-011.
6. Orquestador aplica ORC-011 (validación + merge + cleanup del worktree) — sólo para áreas que produjeron código en worktree.
7. Orquestador escribe al INDEX (sólo el orquestador escribe — regla R-INDEX-5 abajo):
   7.1. Cambia estado del área → "done" con timestamp y commit SHA.
   7.2. Append al Historial de estado con la transición.
   7.3. Recalcula "Estado global" y "Progreso" del metadata block.
8. Orquestador checkpoint en .asdd-run.json (ORC-007): actualiza phases.build.completed_steps.
9. Volver al paso 2.
```

**Regla R-INDEX-5 (concurrencia):** el orquestador es el **único** actor que escribe el INDEX durante Construir. Developers y demás sub-agentes NUNCA escriben INDEX — reportan estado al orquestador vía payload de retorno. Esto elimina la carrera cuando N developers corren en paralelo (ORC-011-A) sobre worktrees distintos: cada uno commit su código, el orquestador consolida y actualiza el INDEX secuencialmente después de cada merge. No hay lock explícito — la serialización natural del turno del orquestador (LLM secuencial) es suficiente.

### 7.2 Resume post-compact / post-clear

Cuando la sesión se compacta o se reabre en un run nuevo:

- **Fuente de verdad de fase:** `.asdd-run.json` (ORC-007). Contiene `phases.build.status = in_progress`, `completed_steps`, `pending_steps`.
- **Fuente de verdad de progreso por área:** INDEX (a través de `index_ref`).
- **Fuente de verdad del contenido cross-área:** spec-funcional.

Regla: al reanudar, el orquestador lee **primero** `.asdd-run.json`, y sólo si `phases.build.status ∈ {in_progress, pending}` lee el INDEX. Nunca re-lee el spec-funcional a menos que un agente lo requiera para su tarea. Esto respeta el patrón de 3 capas de anti-loops (Grep → Glob → Read acotado).

### 7.3 Ediciones concurrentes desde runs distintos (paralelismo entre features)

Cuando dos features distintas comparten un módulo pero el orquestador procesa una a la vez, la concurrencia es intra-feature (worktrees) y se resuelve por R-INDEX-5. Si dos runs distintos abren en paralelo (caso raro, requiere invocación explícita en dos ventanas), aplican reglas ORC-011 estándar: un worktree por developer, merge secuencial. El INDEX del feature A vive en `docs/specs/{run_id_A}-...-index.md`; el del feature B en un archivo distinto — no colisionan.

### 7.4 Nota sobre skip de áreas y áreas re-abiertas

- Si un área queda en `blocked`, se registra la razón en el INDEX (bloque "Progreso por estado") y se escala al usuario. El área queda en `blocked` hasta que se resuelva.
- Si un área requiere re-implementación (CR post-aprobación afecta código ya entregado), su estado en el INDEX pasa `done → in_progress` (via CR-NNN registrado en spec-funcional §15). El `artifact-name-guard` no valida `Edit` (§5), por lo que editar es libre aunque el run original esté complete.

---

## 8. WF-002 pasa a autoría multi-dominio (cierra T6)

### 8.1 Modelo actual (v2.25.4)

WF-002 tiene a `sofka-asdd-producto` como primario (skills `ba` → `funcional` → `po`) con soportes condicionales de architect, security, tech-lead invocados **antes del cierre** del spec único para alimentar secciones fijas (Restricciones arquitectónicas, Requisitos de seguridad, Restricciones técnicas).

### 8.2 Modelo nuevo

WF-002 se convierte en **fase de coordinación multi-agente**. El coordinador sigue siendo `sofka-asdd-producto` (skill `funcional` como orquestador de la fase), pero el trabajo se distribuye entre los agentes dueños de los dominios del Mapa (§0 super-spec).

**Roles por dominio del super-spec (y dueño resultante de cada spec-{area}):**

| Dominio Sofka | Agente ASDD responsable | Skill primario | Alimenta a spec-{area} |
|---|---|---|---|
| Funcional | `sofka-asdd-producto` (skills ba → funcional → po) | `funcional` | spec-funcional (único autor) |
| Arquitectura | `sofka-asdd-solution-architect` | `architect-discovery` + `architect-adr` | spec-backend |
| Developer (capa servidor) | `sofka-asdd-developer-backend` | `developer-backend-feature` | spec-backend |
| Developer (capa presentación) | `sofka-asdd-developer-frontend` | `developer-frontend-feature` | spec-frontend (autor único) |
| UX | `sofka-asdd-ux` | `ux-context-core` + `ux-flows-builder` | spec-diseno (co-autor con UI) |
| UI | `sofka-asdd-ui` | `ui-design-tokens` | spec-diseno (co-autor con UX) |
| QA | **Autor del `spec-qa` en WF-002:** `sofka-asdd-atf-api-qa-engineer` o `sofka-asdd-atf-web-qa-engineer` (según señal API vs Web). Redacta §10 (Criterios de Aceptación — escenarios Gherkin base + adicionales QA + criterios de done) y §7 subsección QA (RNFs de calidad, cobertura, performance testing). **Diseñador de casos ATF (post-WF-002):** el mismo agente en su ciclo ATF completo, ejecutando el `step-3-istqb-test-techniques` durante WF-003/WF-004 con los artefactos del pipeline (test-plan, test-cases, .feature) bajo `docs/testing/atf/{run_id}/`. | **Autoría spec-qa (WF-002):** skill de autoría a confirmar en implementación — el ciclo ATF actual empieza en step-1 (HU parser) y no cubre explícitamente la redacción del `spec-qa`. El PR de implementación debe (a) definir el skill de autoría dentro de los agentes ATF o (b) invocarlos con instrucción directa sin skill nombrado. **NO reusar `step-3-istqb-test-techniques`** para esta autoría — ese skill diseña casos, no redacta el spec-qa. | spec-qa |
| DevOps | `sofka-asdd-devops-engineer` | `devops-observability` | spec-devops |
| Seguridad | `sofka-asdd-security` | `code-scan` + `compliance` | spec-seguridad |
| Datos | **Condicional al lock:** si `.sofka-asdd/sofka-asdd-smart-data.lock` declara `data_platform ≠ none` → dueño **`sofka-asdd-data-governance`** con skill `data-governance-assessment` (produce `spec-data` completo: dominio de datos, PII, retención, lineage inicial, contratos entre productor y consumidor). Si `data_platform = none` (software transaccional puro) → **fallback** a `sofka-asdd-solution-architect` con skill `architect-bounded-context` (produce un `spec-data` **liviano** cubriendo modelo de dominio, entidades, PII a nivel de aplicación; sin lineage analítico ni contratos Bronze/Silver/Gold). **Riesgo del fallback:** un `spec-data` producido por `solution-architect` no cubre el dominio analítico — si el feature termina requiriendo plataforma de datos, hay que abrir un run Smart Data (D0-D7) y redactar el `spec-data` real. **Cuándo marcar `n/a` en INDEX:** si el Mapa de dominios del super-spec marca `Datos Aplica = No` (feature sin manejo relevante de datos — p.ej. ajuste puramente visual, feature toggle, refactor de componente sin cambios de estado persistente), el AF marca la fila de `data` en el INDEX como `n/a` desde el arranque y no se crea `spec-data`. | `data-governance-assessment` (Smart Data activo) o `architect-bounded-context` (fallback transaccional) | spec-data |

**Nota — co-autoría de spec-diseno:** `sofka-asdd-ux` y `sofka-asdd-ui` son co-autores del mismo archivo. El orquestador los invoca secuencialmente (UX primero — arquetipos, flows, wireframes; luego UI — tokens, componentes hi-fi, WCAG) o en paralelo si tocan subsecciones disjuntas del slice (ORC-011-A verifica el scope). El sign-off del área `diseno` requiere ambos.

### 8.3 Orquestación de WF-002

Nuevo flujo en 4 pasos:

1. **Análisis del brief** (paso 1) — `sofka-asdd-producto` (ba → funcional → po) produce **borrador del spec-funcional** con §0 Mapa de dominios (marca Aplica Sí/No por dominio en base a las señales del brief), §1 User Story, §2 Actores, §3 Trazabilidad, §4 Flujo de Negocio, §6 RN, §7 RNFs de negocio, §14 gaps abiertos.
2. **Autoría multi-dominio en paralelo** (paso 2) — el orquestador delega a los agentes de dominios con `Aplica = Sí` para que produzcan sus `spec-{area}` respectivos. Se aplica ORC-011-A (task partitioning) para verificar que los scopes de archivos no se solapan — dado que cada spec-{area} es un archivo distinto, la intersección es 0 y las delegaciones ocurren en paralelo. Excepción: §9 (Validaciones de Campos) puede requerir sincronización AF ↔ Developer ↔ UX/UI — se resuelve con el patrón "cita por referencia" de §4.6.
3. **Consolidación e INDEX** (paso 3) — el orquestador genera el INDEX con la lista de spec-{area} producidos y calcula el grafo de dependencias según la tabla de §4.5. Heurística por defecto (todas las áreas con `Aplica = Sí`):

   **Ola 1 — arranque en paralelo (sin dependencias entrantes):** `seguridad`, `diseno`, `backend`, `data`. Son áreas de contrato o independientes. En WF-002 redactan sus specs en paralelo; en WF-004 arrancan implementación en paralelo (ORC-011-A verifica scope no-solapado).

   **Ola 2 — depende de la Ola 1:** `frontend` (depende de `diseno` + `backend`, referencia `seguridad`), `devops` (depende de `backend`).

   **Ola 3 — depende de Olas 1 y 2:** `qa` (depende de `backend` + `frontend`).

   **Reglas de contracción del grafo cuando alguna área tiene `Aplica = No`:**
   - `diseno Aplica = No` (feature sin UI): desaparece la arista `diseno → frontend`. `frontend` sólo depende de `backend`. Si además `Developer (presentación) Aplica = No` → tampoco hay `frontend`.
   - `seguridad Aplica = No` (feature sin auth explícita): desaparecen las aristas `seguridad → backend` y `seguridad → frontend`. Backend y frontend arrancan sin referencia a §11.
   - `backend Aplica = No` (feature puramente visual — raro): desaparecen las aristas `backend → *`. `frontend` sólo depende de `diseno`; `qa` sólo depende de `frontend`; `devops` no aplica.
   - `data Aplica = No`: `spec-data` no se crea; no afecta a otras áreas (data no bloquea nada por defecto).

   Todas las áreas creadas se setean como `pending` en el INDEX. El orquestador escribe el grafo Mermaid del INDEX reflejando el estado tras contracciones.
4. **Gate DOR** (paso 4) — verifica cada checkbox del Gate DOR del super-spec (§0). Sólo cierra WF-002 si:
   - El AF marcó `Funcional` con veredicto APROBADA o APROBADA CON OBSERVACIONES resueltas.
   - Cada dominio `Aplica = Sí` está en `COMPLETO`.
   - El opt-out de Seguridad (si se hubiera pedido) tiene sign-off explícito de `sofka-asdd-security` (no del AF).

### 8.4 Gate DOR — enforcement

Nueva regla en `.claude/rules/sofka-asdd-workflow.md`:

> **WF-002-DOR**: WF-002 no puede marcarse `complete` en `.asdd-run.json.phases.analyze` mientras el Gate DOR del spec-funcional (§0 del super-spec, checkboxes) tenga ítems sin marcar. Excepción: ítems marcados `_(omitir si Aplica = No)_` se ignoran cuando el dominio correspondiente en el Mapa está marcado `Aplica = No`.

El enforcement es **soft** en v2.26.0 (revisado por el orquestador, no por hook). Si en una versión posterior se necesita hard-enforce, se puede añadir un hook que parsee el spec-funcional al hacer `Edit` sobre el status de fase — ver Riesgos §11.

### 8.5 Efecto en WF-003 y WF-004

- **WF-003 (Diseñar)**: sin cambios estructurales — el arquitecto puede refinar spec-backend agregando ADRs y contratos API. Los ADRs siguen viviendo en `docs/architecture/decisions/` con su propio ciclo.
- **WF-004 (Construir)**: cambio central — se implementa el loop de §7. El agente entra a Construir con `.asdd-run.json.phases.build.index_ref` poblado; el resto del loop es determinista.

---

## 9. Retiro del spec-size-guard (#3650)

### 9.1 Justificación

Los tres gatillos actuales del guard son inaplicables:

- `>300 líneas` — el nuevo modelo garantiza tamaño razonable por partición estructural (área). Un spec-backend real tiene ~150 líneas; sólo el spec-funcional puede acercarse a 300 en features complejas, pero por diseño el spec-funcional es el "hub" con las secciones cross-área y su verbosidad es funcional al modelo.
- `CU-\d+ > 5` — el nuevo modelo no usa `CU-\d+`.
- `## Aggregate: > 1` — el nuevo modelo no usa `## Aggregate:`.

### 9.2 Retiro operacional

- Eliminar `.claude/hooks/sofka-asdd-pre-tool-use-spec-size-guard.mjs`.
- Eliminar su entrada en `.claude/settings.json` (matcher `Write|Edit`, path `docs/specs/*.md`).
- Actualizar `.claude/rules/sofka-asdd-workflow.md` — remover la sub-regla #3650 completa.
- Actualizar `.claude/docs/adoption/naming-convention.md` si menciona el guard.
- Registrar el retiro en `ASDD-CHANGELOG.md` como breaking change interno v2.26.0.

### 9.3 Reemplazo por control estructural

La sub-regla #3650 se sustituye por **WF-002-STRUCT**:

> **WF-002-STRUCT**: WF-002 cierra con exactamente 1 INDEX, 1 spec-funcional, y N `spec-{area}` donde N = cantidad de áreas con `Aplica = Sí` en el Mapa de dominios (§0), con **área ∈ {backend, frontend, diseno, devops, seguridad, data, qa}** (7 áreas — ver §4.5). No hay límite de tamaño por archivo — la partición es estructural por área, no cuantitativa.

---

## 10. Alternativas evaluadas para el modelo completo

| Alt | Descripción | Descartada porque |
|---|---|---|
| **Alt-1 — Super-spec único** | Un único `.md` por feature con todas las 15 secciones + Mapa de dominios. | Ya descartada por el usuario en las decisiones locked (§1.2 decisión 1). Difícil de leer por developers especializados; developer.md ve 700 líneas cuando le importan 150. |
| **Alt-2 — Spec por dominio (9)** | Un `spec-{dominio}` por cada dominio del Mapa (9 archivos). | Rechazada: 9 archivos por feature es alta fragmentación. El mapeo dominio↔área (§4.5) muestra que Arquitectura + Developer(servidor) → backend; UX + UI → diseno; Developer(presentación) → frontend. Consolidar en 7 áreas es más operativo — cada una con un entregable claro. |
| **Alt-3 — Spec-per-area (elegida)** | INDEX + spec-funcional + N `spec-{area}` con N ≤ 7. | Elegida. Balance entre granularidad (cada rol especializado tiene su spec, incluida `diseno` como área separada de `frontend`) y cohesión (spec-funcional evita duplicación cross-área). |
| **Alt-4 — Spec-per-area SIN spec-funcional** | Sólo INDEX + `spec-{area}`. Contenido funcional se duplica o se referencia entre archivos. | Rechazada: sin spec-funcional, cada área duplicaría User Story, Actores, RN, Flujo → drift garantizado. |

---

## 11. Riesgos y consecuencias

### 11.1 Riesgos técnicos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Slicer inexistente al momento del port — se implementa después → developers producen slices divergentes en el intervalo | Media | Alta | Implementar el skill `spec-slice-rules` en el PR de v2.26.0 como parte inseparable del cambio. No merger v2.26.0 sin el skill. |
| R2 | Como el `artifact-name-guard` no valida `Edit` (§5), editar artefactos vivos (INDEX/spec-{area}) desde un run posterior no deja huella a nivel de filesystem — auditoría de filesystem más difícil | Baja | Media | El Historial de estado del INDEX registra QUIÉN cambió QUÉ y CUÁNDO — trazabilidad de negocio, no de filesystem. La creación (`Write`) sí queda estampada con `run_id`/PHASE. |
| R3 | WF-002-DOR es soft en v2.26.0 — el orquestador puede olvidar validar checkboxes | Media | Media | Añadir a `sofka-asdd-orchestration.md` una regla de checklist post-analyze. Si en 2-3 runs se detectan olvidos, escalar a hook duro en una versión posterior. |
| R4 | Consumidores no migrados (traceability, artifact-audit) rompen post-v2.26.0 | Alta si no se implementan en el mismo PR | Alta | Migración de esos skills es parte del PR de v2.26.0, no diferida. Ver §12 lista de componentes. |
| R5 | Bloqueo de creación con run.status = complete + necesidad de CR con áreas nuevas | Baja | Media | Documentar en la guía de CRs que áreas nuevas requieren un run nuevo (revalida el spec-funcional §15). Extraer excepción sólo si aparece un caso real. |
| R6 | El wrapper de contexto de spec-{area} se convierte en el "template lean" por drift | Media | Media | Regla en `spec-slice-rules.md`: el wrapper es información derivada del análisis, no contenido nuevo del contrato. Ningún AC ni RN vive en el wrapper. |

### 11.2 Consecuencias positivas

- Coherencia total con el template corporativo Sofka.
- Developers especializados leen sólo lo que les incumbe (~150 líneas en vez de 700).
- Estado de implementación auditable en el INDEX sin depender de `git log`.
- Gate DOR habilita conversaciones multi-agente en fase Analizar sin duplicar contenido.
- Retiro del spec-size-guard elimina fricción vestigial.

### 11.3 Consecuencias operativas

- Al menos 8 componentes del template se modifican en el PR de implementación (§12).
- Los proyectos consumidores que ya tienen specs generadas con el modelo antiguo NO se migran automáticamente. Son legados. El check 19 del validador ya acepta ambos patrones; la migración es opcional.

---

## 12. Componentes a modificar en la implementación (input para el developer)

**No modificar en este ADR** — es fase Diseñar. La implementación se hace en un PR posterior. Esta lista es el checklist del developer.

### 12.1 Hooks

- **RETIRAR**: `.claude/hooks/sofka-asdd-pre-tool-use-spec-size-guard.mjs` y su registro en `.claude/settings.json`.
- **`sofka-asdd-pre-tool-use-artifact-name-guard.mjs` — SIN CAMBIOS por §5.** El hallazgo de WU-7 (§5 revisado) determinó que el guard nunca valida `Edit` (solo `Write`), por lo que la exención de slugs vivos era innecesaria y **no se implementó**. La edición de INDEX/spec-{area} desde runs posteriores ya está libre; la creación sigue validada. No hay lista de slugs vivos ni audit line EX-5.

### 12.2 Skills

- **CREAR**: `.claude/skills/sofka-asdd-producto-templates/reference/spec-slice-rules.md` — tabla de proyección Mapa Sofka → área ASDD (§4.4). Debe cubrir las **7 áreas** (backend, frontend, diseno, devops, seguridad, data, qa) e implementar:
  - El **reparto por capa del dominio Developer** (servidor → backend, presentación → frontend).
  - **§11 Seguridad con dueño único `spec-seguridad`** y notas de implementación por referencia en `spec-backend` (server-side) y `spec-frontend` (cliente-side) — nunca redeclarar el contrato.
  - **§13 con backend siempre, seguridad condicional** a señal regulatoria HIPAA/PCI-DSS/SOX.
  - El **grafo de dependencias por defecto** del INDEX cubriendo las 7 áreas (§4.5): Ola 1 (`seguridad`, `diseno`, `backend`, `data` — paralelo) → Ola 2 (`frontend` depende de diseno+backend, referencia seguridad; `devops` depende de backend) → Ola 3 (`qa` depende de backend+frontend), con reglas de contracción por `Aplica = No`.
  - La **regla de citación por referencia** para las 8 secciones divididas de §4.6: §2, §4, §5, §7, §8, §9, §11, §13.
- **CREAR / REEMPLAZAR**: `.claude/skills/sofka-asdd-producto-templates/reference/spec-template.md` — pasa a ser el "template corporativo Sofka" (o un puntero al archivo canónico). Ya no es el mini-template plano.
- **MODIFICAR**: `.claude/skills/sofka-asdd-producto-templates/reference/spec-funcional-template.md` (nuevo) — copia de las secciones del super-spec que corresponden al spec-funcional (§3.2).
- **MODIFICAR**: `.claude/skills/sofka-asdd-producto-funcional/SKILL.md` — actualizar proceso para producir spec-funcional (paso 1 de §8.3) y disparar la coordinación multi-agente (incluyendo la co-autoría ux+ui para spec-diseno).
- **CONFIRMAR**: los skills de `sofka-asdd-ux` y `sofka-asdd-ui` incorporan un modo "autor de spec-diseno en WF-002" (contribución al slice canónico §2, §4 UX/UI, §8, §9 UX/UI). Se documenta en sus SKILL.md respectivos.
- **CONFIRMAR**: el skill de `sofka-asdd-developer-frontend` incorpora un modo "autor de spec-frontend en WF-002" para la porción Developer de capa presentación (§4 Developer subsección, §8 Developer wiring, §9 Developer cliente).
- **MODIFICAR**: `.claude/skills/sofka-asdd-tech-lead-sdd-traceability/SKILL.md` — reconciliación Tier C §6.2 (SCN-NNN sintético + retiro de CU-NNN).
- **MODIFICAR**: `.claude/skills/sofka-asdd-tech-lead-artifact-audit/SKILL.md` — línea que verifica `CU-\d+` (§6.2).

### 12.3 Reglas

- **MODIFICAR**: `.claude/rules/sofka-asdd-workflow.md` — WF-002 pasa a multi-dominio (§8), retirar sub-regla #3650 (§9), añadir WF-002-STRUCT y WF-002-DOR.
- **MODIFICAR**: `.claude/references/rules/sofka-asdd-workflow-build.md` — WF-004 documenta el loop de §7 con lectura de `index_ref`.

### 12.4 Commands

- **MODIFICAR**: `.claude/commands/sofka-asdd/analyze.md` — reflejar el nuevo modelo multi-agente y la generación de INDEX + spec-funcional + spec-{area}.
- **MODIFICAR**: `.claude/commands/sofka-asdd/build.md` — mencionar `index_ref` y el loop.

### 12.5 Schema

- **MODIFICAR**: `.sofka-asdd/asdd-run.schema.json` — añadir campo `index_ref` en `phases.build`:
  ```json
  "index_ref": {
    "type": ["string", "null"],
    "description": "Ruta relativa al INDEX del feature (docs/specs/{run_id}-ANALYZE-{SEQ}-{feature}-index.md). Poblada por el orquestador al abrir Construir. Null hasta que se pobla."
  }
  ```

### 12.6 Documentación

- **MODIFICAR**: `CLAUDE.md` — actualizar tabla de skills y añadir slug conventions (§5.2) si aplica.
- **MODIFICAR**: `.claude/docs/adoption/naming-convention.md` — añadir entrada para artefactos vivos (§3.7.2 nueva tabla).
- **CREAR**: `ASDD-CHANGELOG.md` entrada `[2.26.0]` con el resumen del cambio (breaking interno + migración de consumidores). _(El template estaba en 2.25.4 — el bump real es 2.25.4 → 2.26.0.)_
- **CREAR**: `.claude/docs/migrations/2.25-to-2.26.md` — guía de migración para proyectos consumidores con specs legados.

### 12.7 Validador (deuda no bloqueante — evaluar en el PR)

- El check 19 del validador ya acepta ambos patrones legado y run-trazable. No requiere cambios.
- Considerar un check nuevo (opcional, `WARN`) que valide el triplete INDEX + spec-funcional + al menos 1 spec-{area} cuando aparece un archivo de la familia. Sin bloquear.

---

## 13. Decisión final

**Adoptar el modelo Spec-per-area con INDEX + spec-funcional + slice canónico por área (Alt-C de §4), con edición libre de artefactos vivos (§5 — el `artifact-name-guard` no valida `Edit`), retiro del spec-size-guard (§9) y WF-002 multi-dominio coordinado por Gate DOR (§8).**

**Ship en v2.26.0.** MINOR release — el cambio es breaking a nivel interno del template (skills consumidores) pero aditivo desde la perspectiva del proyecto consumidor final (los specs legados siguen funcionando por check 19).

**Nota de status:** este ADR queda `Propuesta` hasta ser aprobado por el maintainer del template (Andrés Jiménez). Al ser aceptado, actualizar frontmatter a `Aceptada` con fecha y abrir el PR de implementación. El archivo permanece en `docs/adoption/ADR-004-spec-per-area-model.md` (ver nota de "Ubicación canónica" al inicio del documento — reubicación por distribución del CLI).

---

## Apéndice A — Ejemplo hipotético del set de artefactos para un feature "checkout"

Un feature "checkout" con backend + diseno + frontend + qa + seguridad (auth requerida) generaría en WF-002:

```
docs/specs/
├── 2026-07-06-002-ANALYZE-001-checkout-funcional.md   ← spec-funcional
├── 2026-07-06-002-ANALYZE-002-checkout-backend.md     ← slice de §5 (contrato técnico), §9 (Developer capa servidor), §13 (compliance) + nota de implementación server-side referenciando spec-seguridad §11
├── 2026-07-06-002-ANALYZE-003-checkout-seguridad.md   ← §11 íntegra (contrato ÚNICO de auth, secretos, sesión, OWASP) — dueño único
├── 2026-07-06-002-ANALYZE-004-checkout-diseno.md      ← slice de §2 (UX/UI arquetipos), §4 UX/UI (intención visual), §8 íntegra (wireframes+tokens+WCAG), §9 UX/UI (comportamiento visual)
├── 2026-07-06-002-ANALYZE-005-checkout-frontend.md    ← slice de §4 Developer (estado UI, routers), §8 Developer wiring, §9 Developer capa presentación (validación cliente) + nota de implementación cliente-side (token handling, storage, CSP) referenciando spec-seguridad §11
├── 2026-07-06-002-ANALYZE-006-checkout-qa.md          ← §7 subsección QA, §10
└── 2026-07-06-002-ANALYZE-007-checkout-index.md       ← INDEX con 5 filas (backend, seguridad, diseno, frontend, qa) y aristas seguridad→backend, seguridad→frontend, diseno→frontend, backend→frontend, backend→qa, frontend→qa
```

Áreas no creadas por Mapa `Aplica = No`: `data` (feature sin dominio analítico), `devops` (sin infraestructura nueva). Sus filas en el INDEX quedan como `n/a` desde el arranque o simplemente no aparecen (a definir en el PR de implementación como decisión operativa del renderer).

**Observación de coherencia:** §11 aparece **una sola vez** en el corpus (dentro de `checkout-seguridad.md`). Ni `checkout-backend.md` ni `checkout-frontend.md` redeclaran el contrato de auth — cada uno lleva únicamente un puntero `> Ver spec-seguridad §11 para el contrato de seguridad` seguido de notas de implementación específicas de su capa.

**Nota sobre naming ASCII:** el archivo es `checkout-diseno.md`, sin ñ ni tilde. Coherente con la convención de kebab-case ASCII exigida por el helper `sofka-asdd-artifact-name.mjs`.
