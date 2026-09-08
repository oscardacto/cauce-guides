---
description: Fase Validate de datos — verifica el design y los contratos Silver. Sin doble sign-off no se publica.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

Ejecutar la fase **Validate** del flujo Smart Data ASDD — fase 4 de 5:
`discover → design → build → **validate** → publish`.

Validate confronta lo que `/asdd:data-eng-build` implementó contra dos fuentes de verdad:
el `smart-data-eng-design-{cliente}.md` que produjo el arquitecto en la fase design, y los
contratos Silver que definió governance. Nada avanza a publish sin doble sign-off.

## Formato de estado por respuesta

Toda respuesta del orquestador dentro de esta fase abre con un header de una línea:

```
[Fase: Validate · Arquitectura: {pendiente|PASS|FAIL} · Governance: {pendiente|PASS|FAIL} · Semáforo: {—|Verde|Ámbar|Rojo}]
```

- Antes de invocar a los dos agentes, mostrar `[Fase: Validate · Arquitectura: pendiente · Governance: pendiente]`.
- Emitir el header al inicio de cada respuesta nueva del turno.

## Prerequisito

Los pipelines de `/asdd:data-eng-build` deben estar **implementados** y el archivo
`docs/specs/smart-data-eng-build-run-{cliente}.md` debe existir con al menos una corrida `SUCCEEDED`
por **cada pipeline definido en el `smart-data-eng-design-{cliente}.md`** (Bronze, Silver y
Gold como mínimo, más cualquier pipeline adicional que el spec contemple). Un único
pipeline con SUCCEEDED no satisface este prerequisito si el spec define más. La
validación se hace sobre artefactos reales, no sobre intención de diseño.

Si no existe `smart-data-eng-build-run-{cliente}.md`, o tiene corridas en `FAILED` o `ERROR_PRE_RUN`
sin una corrida `SUCCEEDED` correspondiente para ese pipeline:
**detener aquí** y volver a `/asdd:data-eng-build` antes de continuar. No se valida lo que no existe.

## Scope de plataforma — v1

En v1, las verificaciones específicas de plataforma aplican a **Azure + Databricks**
(Unity Catalog para lineage, pipelines SDP/Jobs para ejecución). La lógica del sign-off
(spec, contratos, diccionario) es agnóstica de plataforma y aplica a cualquier stack.

Cuando esté disponible `asdd-data-eng-aws`, las verificaciones de plataforma para
AWS se agregarán a esta fase sin cambiar el artefacto de salida
(`docs/specs/smart-data-eng-validate-signoff-{cliente}.md`).

Si el proyecto es **AWS nativo** en v1 → informar que las verificaciones automáticas de
plataforma no están disponibles; el sign-off arquitectónico y de governance sí pueden
emitirse sobre el spec y los contratos.

## Scope de validate — prohibición absoluta

Validate es **solo lectura y escritura del signoff**. Esta fase **nunca**:
- Edita `src/` ni `resources/` — esos son zona de build
- Ejecuta `bundle deploy`, `databricks bundle run` ni ningún comando de shell
- Aplica grants UC via MCP
- Crea archivos fuera de `docs/specs/`

Si el usuario responde preguntas sobre cómo resolver los gaps, validate **registra las decisiones en el signoff** y termina. Las correcciones las ejecuta `/asdd:data-eng-build` en la siguiente sesión — nunca validate. Intentar corregir código desde validate viola el Principio Smart Data 4 y desincroniza el bundle con el workspace.

## Paso 0 — Declaración de rutas (ART-002, bloqueante)

Antes de invocar a ningún agente, declarar en el plan las rutas **exactas** de
los artefactos de esta fase. No usar placeholders ni slugs sueltos.

Los artefactos Data **no requieren `run-bootstrap` ni `artifact-name.mjs`**: no
se trazan por run ASDD (ADR-003). Sus rutas son literales:

| Artefacto | Ruta |
|---|---|
| Sign-off de validación | `docs/specs/smart-data-eng-validate-signoff-{cliente}.md` |

Pasar a cada agente **su ruta literal** en el prompt. No lanzar agentes en
paralelo hasta tener todas las rutas declaradas.

## Instrucciones

0. **Lecturas obligatorias — criterios de entrada de validate.** Leé COMPLETAS las reglas siguientes antes de proceder al paso 1:
   - `.claude/reference/data-engineering/asdd-data-eng-workflow.md` sección **SD-004 (VALIDATE)** — verificá el criterio de entrada: `docs/specs/smart-data-eng-build-run-{cliente}.md` con al menos una corrida `SUCCEEDED` por cada pipeline del spec, sin `FAILED`/`ERROR_PRE_RUN` sin `SUCCEEDED` correspondiente + `smart-data-eng-design-{cliente}.md` aprobado + contratos Silver disponibles. Sin ese estado, la fase no está lista: detener aquí.
   - `.claude/reference/data-engineering/asdd-data-eng-lineage.md` — **gate de lineage (absorbe LIN-003)**: verificá que **todas las tablas de producción tienen lineage trazable** desde el sistema origen hasta el consumo: Unity Catalog registrado a nivel de tabla (LIN-002, LIN-006), y campo "Tabla entrada" del diccionario poblado para todo campo PII o regulado (LIN-005). Una sola tabla de producción sin lineage trazable → esta fase NO está lista para sign-off: reportar el gap y detener antes del paso 1. Este gate reemplaza la responsabilidad histórica del orquestador de "verificar lineage antes de entrar a validate" — ahora la verificación vive en el command.
   - `.claude/reference/data-engineering/asdd-data-eng-inter-contracts.md` — el validate chequea que los contratos inter-equipo (productor↔consumidor) declarados en el design siguen siendo respetados por los pipelines construidos: schema (DC-002 elemento 3), owners y SLA en los parámetros del pipeline, ACL aplicada en Unity Catalog. Todo consumo cross-team sobre Silver/Gold debe tener contrato `Estado: active` en `docs/specs/contracts/`; sin él, gap crítico → reportar y detener.

1. Confirmar que existe `smart-data-eng-design-{cliente}.md` y los contratos Silver de la fase design.
   Si falta cualquiera de los dos, el agente correspondiente reporta el gap y la validación
   no puede emitir sign-off PASS.

2. Invocar **@asdd-data-architect** para la validación arquitectónica:
   - Revisar que el `smart-data-eng-design-{cliente}.md` se respetó en la implementación.
   - Verificar específicamente: capas correctas (Bronze raw / Silver limpio / Gold agregado),
     `schemaHints` aplicados en Bronze donde el spec los exige, y — **si el
     `smart-data-eng-design` contempla un escenario de coexistencia (convivencia source
     legacy → target)** — confirmar que está implementado según diseño. Si el spec
     no lo contempla, omitir este punto.
   - Detectar desvíos entre el diseño aprobado y lo construido.
   - Si hay desvíos: reportarlos como **gaps con severidad** (crítico / medio / bajo) y
     **recomendación de corrección** concreta para cada uno.

3. Invocar **@asdd-data-governance** (en paralelo con el arquitecto — son independientes)
   para el governance assessment final:
   - Verificar lineage trazable de extremo a extremo en Unity Catalog.
   - Confirmar que la PII está clasificada y que las políticas de retención del diseño se aplican.
     Leer `docs/specs/smart-data-eng-dictionary-{cliente}.md` para verificar que los campos PII tienen
     retención explícita y que el campo "Tabla entrada" está poblado para todos los campos.
   - Validar que los contratos Silver están siendo **respetados por los pipelines** (schema,
     owners — sin breaking changes silenciosos). Para **SLAs de frescura y uptime**:
     verificar que los parámetros están configurados en el pipeline (frecuencia de
     ingesta, triggers, alertas); **no medir cumplimiento de SLA en dev/QA** — ese
     ambiente no reproduce las condiciones de carga ni las garantías de infraestructura
     de producción. Si un SLA no puede evaluarse en este ambiente, documentarlo como
     "verificación diferida a producción" en el signoff, sin emitir FAIL por ello.
   - Emitir **governance sign-off**: PASS o FAIL, con la lista de gaps si los hay.

   > Modo de invocación: paralelo. El arquitecto valida diseño-vs-implementación; governance
   > valida contratos-y-compliance. No dependen uno del otro, así que corren a la vez.

4. Consolidar ambos resultados en un semáforo R/A/G final:
   - **Verde** → ambos sign-offs PASS, sin gaps o solo gaps de severidad baja.
   - **Ámbar** → gaps medios que conviene corregir pero no bloquean. **Nunca aplica
     a gaps que las rules activas marcan como críticos bloqueantes** (campo PII sin
     retención — RET-007; dato sin lineage en datos regulados — LIN-001): esos
     siempre van a Rojo, independientemente de la severidad que asigne el agente.
   - **Rojo** → gaps críticos o FAIL en cualquiera de los dos sign-offs.

5. **Escribir el sign-off en disco** — al finalizar la consolidación, escribir
   `docs/specs/smart-data-eng-validate-signoff-{cliente}.md`. Este archivo es el gate de entrada de
   `/asdd:data-eng-publish`. Estructura mínima:

   ```
   Estado: PASS | FAIL | AMBER
   Fecha: YYYY-MM-DD
   Semáforo: Verde | Ámbar | Rojo
   Arquitectura: PASS | FAIL
   Governance: PASS | FAIL
   Spec validado: smart-data-eng-design-{cliente}.md — [título o hash de último commit al momento del signoff]
   Gaps críticos: [lista o "ninguno"]
   Gaps medios: [lista o "ninguno"]
   ```

## Artefactos esperados

- Reporte de **validación arquitectónica** — desvíos vs `smart-data-eng-design-{cliente}.md`,
  cada gap con severidad y recomendación.
- **Governance sign-off** con semáforo R/A/G final (PASS / FAIL).
- **Lista de correcciones requeridas** antes de `/asdd:data-eng-publish` — vacía si el resultado
  es Verde; poblada y priorizada si hay Ámbar o Rojo.
- `docs/specs/smart-data-eng-validate-signoff-{cliente}.md` — gate de entrada de publish.

## Siguiente paso

- **PASS en ambos sign-offs (Verde)** → avanzar a `/asdd:data-eng-publish`.
- **Ámbar** → decisión explícita: publicar asumiendo los gaps medios documentados, o
  corregir primero. Registrar la decisión.
- **Rojo / gaps críticos** → corregir en `/asdd:data-eng-build` y **volver a `/asdd:data-eng-validate`**.
  La validación se repite hasta lograr doble sign-off PASS.

> Recordatorio Smart Data: el arquitecto diseña, el agente de ingeniería ejecuta y aquí ambos
> disciplinas validan. El `smart-data-eng-design-{cliente}.md` es el contrato entre diseño e
> implementación — validate es donde se verifica que ese contrato se cumplió.
