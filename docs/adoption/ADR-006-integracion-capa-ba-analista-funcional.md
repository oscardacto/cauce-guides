# ADR-006: Integración de la capa BA del Analista Funcional

**Estado**: Aceptada (parcialmente supersedida por ADR-010)
**Fecha**: 2026-07-08
**Decisores**: Tech Lead (integración), Alejandro (sponsor / origen del bundle)
**Ver también**: [ADR-010 — Refactor consolidador capa BA (9→5 agentes)](ADR-010-refactor-consolidador-capa-ba.md)

## Contexto

Se recibió un bundle externo (`07-07-26_Agentes-Funcionales`) con 4 agentes y
7 skills que implementan un flujo propio de Analista Funcional (AF):
descomponer un alcance amplio en una EDT jerárquica → construir el contenido
funcional de una spec, hoja por hoja → evaluarla contra un framework de 19
filtros de detección de brechas (+ MECE + coherencia inter-spec) → registrar
cada cambio en una bitácora. El bundle nació en una versión antigua del
template, antes del modelo spec-per-área (ADR-004), y traía su propia
convención de rutas y su propia estructura de "spec" de 0 a 15 secciones que
no coincidía con la del template actual.

Se pidió integrarlo como capa reutilizable del template, resolviendo tres
tensiones: (1) naming inconsistente con la convención `sofka-asdd-*`, (2)
rutas de lectura/escritura de una "burbuja" desconectada del `docs/` real del
template, y (3) duplicación de la estructura completa de spec que el template
ya resuelve con el modelo spec-per-área.

## Decisión

### 1. Naming — prefijo `sofka-asdd-ba-*`

Todo agente, skill y regla de dominio del bundle se renombra con el prefijo
`sofka-asdd-ba-` (ej. `BA-descomponedor` → `sofka-asdd-ba-descomponedor`,
`BA-evaluador-gaps` → `sofka-asdd-ba-evaluador-gaps`). Cumple el check 14
(`naming-convention`, strict) del validador sin excepción.

### 2. Capa opcional e independiente — coexiste con `sofka-asdd-producto`

La capa BA **no fusiona** su framework con `sofka-asdd-producto` ni con el
modelo spec-per-área de ADR-004. Es un **camino alternativo** para producir
el mismo tipo de artefacto (el spec-funcional) cuando el AF trabaja de forma
personal/standalone, EDT-driven, fuera del ciclo ASDD orquestado del equipo.
Ver `.claude/references/rules/sofka-asdd-ba-layer-routing.md` para cuándo usar cada uno.

### 3. AJUSTE 1 (post-integración) — realineación de rutas al `docs/` real del template

La integración inicial iba a **documentar** las rutas viejas del bundle como
gap. Alejandro pidió en su lugar **realinearlas de verdad** a la estructura
vigente del template:

| Ruta / artefacto original del bundle | Ruta ASDD vigente adoptada |
|---|---|
| `docs/specs/{feature}.md` (estructura propia 0–15 secciones, dependiente de `docs/specs/plantilla_spec_dominio.md`, **inexistente en el template**) | `docs/specs/{feature}-funcional.md` — mismo artefacto y template (`spec-funcional-template.md`, skill `sofka-asdd-producto-templates`) que usa `sofka-asdd-producto-funcional` en WF-002 (ADR-004) |
| `docs/specs/edt-{proyecto}.md` | Sin cambio — coincide exactamente con la referencia `EDT ref ... ruta: docs/specs/edt-{proyecto}.md` que ya trae `spec-funcional-template.md §3` |
| `docs/specs/evaluacion-{feature}.md` | Sin cambio — vive junto al spec-funcional en `docs/specs/`, no requería realineación |
| `docs/bitacora/{proyecto}.md` | Sin cambio — el template no tiene convención equivalente de bitácora de cambios; se mantiene como carpeta propia de la capa BA |
| `.claude/rules/BA-bitacora-contract.md`, `.claude/rules/BA-constructor-iteracion.md` | `.claude/reference/ba/sofka-asdd-ba-bitacora-contract.md`, `.claude/reference/ba/sofka-asdd-ba-constructor-iteracion.md` (ver punto 4) |
| Sección numerada 0–14 + sección ◎ propia del bundle | Numeración de secciones alineada 1:1 con ADR-004 §6.3 donde coincide (§1 User Story, §2 Actores, §3 Trazabilidad, §4 Flujo, §6 RN, §7 RNF, §14 Gaps, §15 CR) — la sección ◎ de registro de implementación se **elimina** (ver punto 5, AJUSTE 2): el INDEX del orquestador (R-INDEX-5) ya cumple ese rol |

`docs/specs/plantilla_spec_dominio.md` deja de citarse como destino/dependencia
en los 4 agentes — se reemplaza por la convención real (`spec-funcional-template.md`).

### 4. Colocación on-demand de las rules del bundle (context-diet)

- `sofka-asdd-ba-bitacora-contract.md` y `sofka-asdd-ba-constructor-iteracion.md`
  → `.claude/reference/ba/` (lector explícito: los agentes `sofka-asdd-ba-*`
  las citan por ruta). No se suman al conteo `rules` del lock (no son
  always-loaded) — consistente con la migración context-diet reciente de
  Smart Data (reglas de dominio con lector explícito van a `reference/`, no a
  `.claude/rules/`).
- `sofka-asdd-spec-guard.md` → **`.claude/rules/`** (cross-cutting, always-loaded).
  Decisión distinta a la propuesta inicial (`reference/ba/`): su contenido
  formaliza el mecanismo de CR/§15 que **`spec-funcional-template.md` ya
  documenta inline para cualquier spec del template**, no solo para la capa
  BA — aplica igual a `sofka-asdd-producto` cuando edita una spec-funcional
  `APROBADA`. Se generalizó su alcance y su tabla `SPG-002b` (los agentes
  BA-only quedan como un origen posible entre varios, no el único). El
  archivo ya traía el prefijo `sofka-asdd-` correcto de origen.
  `.claude/rules/sofka-asdd-routing-heuristics.md` estaba en el límite de 150
  líneas (`rules_size_max`) — no había espacio para anexar la sección de
  routing BA ahí, lo que forzó (no solo justificó) crear
  `sofka-asdd-ba-layer-routing.md` como archivo separado.

### 5. AJUSTE 2 (post-integración) — `sofka-asdd-ba-constructor` acotado a contenido funcional

La integración inicial iba a portar el sistema completo de `BA-constructor`:
propietario de las 15 secciones de la spec, clasificación "Tipo AF / PENDIENTE
/ NO APLICA" sobre dominios ajenos (arquitectura, QA, UX/UI, seguridad),
checklist de gobernanza G1–G4 sobre el documento entero, y una sección ◎ de
registro de implementación. Alejandro pidió **reducir el alcance** porque el
template ya resuelve exactamente esa partición con el modelo spec-per-área:

- El agente ahora redacta **exclusivamente** las secciones AF de
  `{feature}-funcional.md`: §1, §2, §3, §4, §6, §7, §14 (y §15 solo bajo el
  protocolo de CR). No toca §0 Mapa de dominios multi-área, no crea ni
  actualiza el INDEX, y no escribe contenido en §5/§8/§9/§10/§11/§12/§13
  (delegadas a `spec-{area}` de cada dominio dueño, `spec-slice-rules.md`).
  Ver la tabla "Alcance — qué SÍ y qué NO redacta" en el agente.
- Este recorte además **reduce el conflicto de "dos fuentes de verdad"**
  anotado en el primer pase de integración: antes, un feature podía terminar
  con una `BA-constructor` SPEC de 15 secciones propias Y una spec-funcional
  ASDD del equipo describiendo lo mismo con vocabulario distinto. Ahora ambos
  caminos producen **el mismo archivo** con **el mismo template**; la única
  diferencia es quién lo redacta y en qué contexto (personal AF vs. ciclo
  orquestado del equipo).
- `sofka-asdd-ba-constructor-gherkin` se reencuadra como generador de un
  **borrador** de escenarios de aceptación (insumo para quien construya
  `spec-qa §10`), no como dueño de esa sección — en el modelo spec-per-área
  los criterios de aceptación viven en `spec-qa`, no en el spec-funcional.

### 6. AJUSTE 3 (post-integración) — `Write`/`Edit` en `sofka-asdd-ba-descomponedor`

Alejandro pidió que `sofka-asdd-ba-descomponedor` pueda escribir/editar
directamente (originalmente era read-only: `[Read, Grep, Glob]`). Se agregó
`Write, Edit` conservando las tools existentes: `[Read, Grep, Glob, Write, Edit]`.
Verificado contra el check `agent-permission-mode` del validador: el agente no
fija `permissionMode` restrictivo, por lo que la combinación con `Write`/`Edit`
no dispara el check (que bloquea únicamente agentes con tools de escritura Y
`permissionMode: plan|readonly|ask` simultáneamente).

### 7. Dependencias faltantes (no se inventan — se documentan)

El bundle referencia agentes y un artefacto que **no están incluidos**. Se
preservan las referencias (renombradas a `sofka-asdd-ba-*` por consistencia
futura) pero **no se crean**:

| Referencia faltante | Dónde se usa | Impacto si no existe |
|---|---|---|
| `sofka-asdd-ba-sme` | Escalamiento de vacíos de dominio (sectorial/cliente) desde `constructor-contexto` y `constructor` | Los vacíos `[ESCALAR_ANTES_DE_CONSTRUIR]` quedan bloqueados hasta que el AF humano los resuelva manualmente |
| `sofka-asdd-ba-documento-espejo` | Handoff de la spec aprobada hacia validación con negocio (DVF) | No hay automatización de esa validación; el AF gestiona el DVF fuera del sistema de agentes |
| `sofka-asdd-ba-clasificador-uat` | Clasificación de hallazgos UAT que originan CRs | Los CRs post-UAT los abre el AF manualmente, sin clasificación asistida |
| `sofka-asdd-ba-control-alcance` | Decisiones INCLUIR/DIFERIR/RECHAZAR sobre cambios de alcance | El registro de tipo `ALCANCE` en bitácora lo hace el AF manualmente |
| `sofka-asdd-ba-filtro-lecciones` | Correlación de hallazgos UAT con lecciones aprendidas (modo CONSULTAR/REGISTRAR) | Sin base de lecciones — cada EDT/evaluación parte sin contexto histórico de errores del dominio |
| `docs/specs/plantilla_spec_dominio.md` | Referenciado como destino/dependencia en el material original | **Superado** por el AJUSTE 1 — ya no se referencia; se usa `spec-funcional-template.md` del template |

### 8. Inconsistencia interna del bundle (heredada, no introducida por esta integración)

`sofka-asdd-ba-descomponedor` cita "verificado por `sofka-asdd-ba-evaluador`
(18 filtros)" y `sofka-asdd-ba-evaluador-gaps` cita un "F05 de BA-evaluador"
como validador estructural de máquina de estados complementario al Filtro 16.
Ninguno de los dos existe en el agente `sofka-asdd-ba-evaluador` incluido
(que aplica 19 filtros, no 18, y no define sub-identificadores `F01–F18`).
Se documenta como inconsistencia heredada del material original — no se
inventa el validador faltante ni se ajusta el conteo sin evidencia; queda
anotado inline en ambos archivos para quien continúe el trabajo.

### 9. Decisión aplazada — handoff BA standalone → ciclo ASDD del equipo

Cuando una spec-funcional nace en modo standalone BA (§0 con solo `Funcional
= Sí`, sin INDEX, sin Mapa de dominios multi-área completado) y luego el
feature se incorpora al ciclo ASDD orquestado del equipo, **no existe hoy un
protocolo automatizado** que complete el Mapa de dominios, genere el INDEX y
dispare el Gate DOR (WF-002-DOR) sobre una spec que ya tiene contenido AF. Se
deja como decisión consciente aplazada — la resuelve `sofka-asdd-producto`
manualmente al adoptar la spec, o un futuro ADR si el patrón se repite.

## Consecuencias

**Positivas:**
- Cero drift de naming — el validador (check 14) queda verde sin excepciones.
- Sin duplicación de formato de spec — un solo artefacto, un solo template.
- Footprint always-loaded controlado: solo 2 archivos nuevos en `.claude/rules/`
  (`sofka-asdd-spec-guard.md`, ya necesario de forma general; y
  `sofka-asdd-ba-layer-routing.md`, forzado por el límite de 150 líneas de
  `sofka-asdd-routing-heuristics.md`); las 2 rules de dominio BA-específicas
  viven en `reference/ba/` sin costo always-loaded.

**Negativas / riesgo aceptado:**
- 5 agentes/artefactos referenciados no existen (§7) — el flujo BA queda
  incompleto en los tramos de SME, DVF, UAT y lecciones aprendidas hasta que
  se integren en una iteración futura.
- El handoff standalone → equipo (§9) no está automatizado.

## Validación

- `node .claude/scripts/validate-template.mjs` ejecutado tras la integración
  — ver resultado en el reporte de cierre del ciclo (commit de esta rama).
- Conteos del lock actualizados: `agents` 20→24, `skills` 146→153, `rules`
  24→26 (`sofka-asdd-spec-guard.md` + `sofka-asdd-ba-layer-routing.md`; las
  2 rules en `reference/ba/` no cuentan — el validador solo escanea
  `.claude/rules/`).

## Alternativas consideradas

1. **Fusionar la capa BA dentro de `sofka-asdd-producto`** — descartada: el
   sponsor pidió explícitamente mantenerla como agente personal separado del
   AF, reutilizable fuera del ciclo orquestado del equipo.
2. **Mantener la estructura propia de 15 secciones del bundle** — descartada
   tras AJUSTE 2: duplicaba el modelo spec-per-área y generaba dos fuentes de
   verdad sobre el mismo feature.
3. **Dejar `sofka-asdd-spec-guard.md` en `reference/ba/`** (plan original) —
   descartada: su contenido aplica a cualquier spec-funcional `APROBADA` del
   template, no solo a las de la capa BA; restringirlo a lectura on-demand de
   BA habría dejado sin guard formal a `sofka-asdd-producto` en el mismo
   escenario.
