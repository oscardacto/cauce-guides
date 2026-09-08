---
description: Fase Publish de datos — cierra el ciclo en desarrollo o QA del cliente y prepara el handoff a DevOps.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

Ejecutar la fase **Publish** (fase 5 de 5) del workflow Smart Data ASDD: `discover → design → build → validate → publish`.

Esta es la fase de cierre del ciclo de desarrollo. **No despliega al ambiente de producción del cliente** — eso es responsabilidad del equipo DevOps del cliente desde su propio pipeline. Lo que hace esta fase: verificar que la solución funciona correctamente en el ambiente de desarrollo/QA del cliente, preparar el entregable para handoff y dejar toda la documentación actualizada. **No realiza rollback ni operaciones destructivas.**

## Formato de estado por respuesta

Toda respuesta del orquestador dentro de esta fase abre con un header de una línea:

```
[Fase: Publish · Checklist de cierre: N/8 ítems]
```

- El conteo refleja cuántos ítems del `## Checklist de cierre del ciclo` están marcados.
  Antes de verificar el prerequisito de validate, mostrar `[Fase: Publish · Checklist de cierre: 0/8 ítems]`.
- Emitir el header al inicio de cada respuesta nueva del turno.

## Contexto de la fase

En `validate` los agentes de arquitectura y gobernanza emitieron su veredicto sobre la solución construida en `build`. `publish` toma esa solución ya validada, confirma que el entregable está listo para que el DevOps del cliente lo despliegue, y sincroniza los artefactos de documentación (`smart-data-eng-design`, contratos de datos, governance assessment, diccionario de datos) con el estado final del sistema.

> **Aclaración importante sobre "producción":** Guide desarrolla y valida en el ambiente que el cliente provee (dev/QA). El deploy al ambiente de producción real lo ejecuta el equipo DevOps del cliente desde su pipeline de CI/CD. Smart Data entrega el artefacto listo; no presiona el botón de producción.

## Prerequisito CRÍTICO

Antes de hacer cualquier cosa, verificar el resultado de `/asdd:data-eng-validate`:

- Leer `docs/specs/smart-data-eng-validate-signoff-{cliente}.md`. Si no existe → detener y pedir que
  se complete `/asdd:data-eng-validate` primero.
- `Estado: PASS` → proceder.
- `Estado: FAIL` → NO proceder. Mostrar los gaps críticos del signoff y devolver al
  usuario a `/asdd:data-eng-build` o `/asdd:data-eng-validate` según corresponda.
- `Estado: AMBER` → mostrar gaps medios y pedir decisión explícita al usuario antes
  de proceder. **Antes de invocar ningún agente de esta fase**, agregar al final de
  `docs/specs/smart-data-eng-validate-signoff-{cliente}.md` el campo:
  `Decisión AMBER: [texto acordado con el usuario — ej. "Publicar asumiendo gaps medios — responsable: {nombre}, fecha: YYYY-MM-DD"]`.
  El agente escribe ese campo; el usuario lo dicta. Solo después continuar con la instrucción 1.

No se despliega a producción nada que no haya pasado validación. Este es un gate duro.

## Scope de plataforma — v1

En v1, la verificación del entregable aplica a **Azure + Databricks** (bundle DABs /
scripts .py / SDP standalone). El cierre de documentación (spec, contratos, diccionario)
es agnóstico de plataforma y aplica a cualquier stack.

Cuando esté disponible `asdd-data-eng-aws`, la verificación del entregable para
AWS se agregará a esta fase sin cambiar el prerequisito ni el flujo de cierre.

## Scope del agente de ingeniería en publish — prohibición absoluta

El agente de ingeniería en esta fase **solo verifica y confirma**. Nunca:
- Ejecuta `bundle deploy` ni `bundle run` — el bundle ya fue deployado y los pipelines ya corrieron en build
- Re-ejecuta pipelines via `manage_pipeline_run` — la verificación es de estado, no de ejecución
- Activa schedules en target `dev` — PAUSED es el comportamiento correcto de DABs en modo development
- Despliega al target `prod` — eso es responsabilidad del DevOps del cliente

## Prerequisito MCP — verificar antes de invocar cualquier agente

Invocar `mcp__databricks__get_current_user` y confirmar que responde con un usuario autenticado en el workspace del proyecto. Si el tool falla o no responde → detener e indicar:

> El MCP de Databricks no está activo. Configurá el perfil antes de continuar:
> `databricks auth login --profile {perfil del target dev en databricks.yml} --host {host del workspace}`
> Luego reiniciá la sesión con el MCP activo.

## Paso 0 — Declaración de rutas (ART-002, bloqueante)

Esta fase **no crea artefactos nuevos**: actualiza los existentes
(`smart-data-eng-*`) con `Edit`. Igual aplica ART-002: declarar en el plan qué
artefactos existentes se van a actualizar, con sus rutas exactas — no usar
placeholders ni slugs sueltos.

Los artefactos Data **no requieren `run-bootstrap` ni `artifact-name.mjs`**: no
se trazan por run ASDD (ADR-003). Pasar a cada agente **su ruta literal** en el
prompt. No lanzar agentes en paralelo hasta tener todas las rutas declaradas.

## Instrucciones

### 0. Lectura obligatoria antes de publicar

Leé COMPLETO `.claude/reference/data-engineering/asdd-data-eng-workflow.md` sección **SD-005 (PUBLISH)** y verificá el criterio de entrada: `docs/specs/smart-data-eng-validate-signoff-{cliente}.md` con `Estado: PASS`. Sin ese archivo o con `Estado: FAIL` → detener aquí y volver a `/asdd:data-eng-validate`. Regla absoluta: **ninguna tabla PII sin retención definida puede publicarse** — si el validate signoff arrastra ese gap, no publicar y escalar a `@asdd-data-governance`.

### 1. Verificación final y preparación del entregable

Invocar **@asdd-data-eng-databricks** con la skill correspondiente al modo de
entrega acordado en `build`:
- **Modo A (DABs):** skill `databricks-dabs`
- **Modo B (Jobs/.py):** skill `databricks-jobs`
- **Modo C (SDP standalone):** skill `databricks-pipelines`

Si el modo de entrega no está explicitado en el `smart-data-eng-design-{cliente}.md` ni
en el `smart-data-eng-build-run-{cliente}.md`, preguntar al usuario antes de invocar el agente.

- Verificar el estado actual de los pipelines y jobs en el workspace via MCP (lectura de estado — no re-ejecución). Confirmar que el último estado registrado en `smart-data-eng-build-run-{cliente}.md` es consistente con el estado actual en el workspace.
- Confirmar que el entregable está completo según el modo de entrega acordado en `build`:
  - Modo A (DABs): bundle validado y listo para que el DevOps del cliente lo despliegue a producción.
  - Modo B (Jobs/.py): scripts versionados en Repos, Jobs configurados y documentados.
  - Modo C (SDP): pipelines desplegados en dev/QA, documentados y listos para handoff.
- Confirmar que los Jobs en el ambiente de desarrollo/QA están configurados correctamente.
  **Nota:** en el target `dev` (`mode: development`) los schedules están **PAUSED por diseño** — eso es comportamiento esperado de DABs, no un error. La verificación de que los schedules estén activos aplica únicamente al target `prod`.
- **Si hay errores** → el agente reporta el error concreto y recomienda la corrección. La fase se detiene hasta resolverlo.

### 2. Cierre de governance

Invocar **@asdd-data-governance**:

- Actualizar el `smart-data-eng-governance-assessment` con el estado final del entregable en dev/QA.
  **Antes de editar**, agregar una fila a `## Historial de sincronización` con:
  `Publish YYYY-MM-DD | Fecha | qué se actualizó y por qué`.
- Confirmar que los contratos de datos están activos y vigentes. Si se encuentra un
  contrato con `Estado: deprecated`:
  - **Con sucesor activo** (existe la versión MAJOR siguiente en `docs/specs/contracts/`):
    situación normal — documentarlo en el checklist y continuar.
  - **Sin sucesor activo** (no existe contrato que reemplace al deprecated para ese par
    productor-consumidor): gap bloqueante — pausar e invocar `@asdd-data-governance`
    antes de continuar.
- Actualizar `docs/specs/smart-data-eng-dictionary-{cliente}.md` para que refleje las tablas
  y columnas reales en producción. **Antes de editar**, agregar una fila a
  `## Historial de cambios` con: `Versión siguiente | Fecha | qué cambió | Impacto`.
  Si no hubo cambios respecto al último sync, registrar igualmente con nota
  `"Sin cambios — confirmado contra estado productivo"`.

### 3. Cierre de arquitectura

Invocar **@asdd-data-architect**:

- Actualizar el `smart-data-eng-design-{cliente}.md` con cualquier ajuste que haya ocurrido durante `build` o `validate`.
  **Antes de editar**, agregar una fila a la sección `## Historial de decisiones de diseño` (o `## N. Historial de decisiones de diseño` si el spec usa secciones numeradas) con:
  `Fecha | "Cierre publish — [descripción del ajuste]" | Arquitecto Guide | Impacto`.
  Si no hubo ajustes, registrar igualmente: `"Publish completado — diseño confirmado sin cambios"`.
- Confirmar que el `smart-data-eng-design` refleja el estado del entregable en dev/QA listo para producción — no el diseño teórico inicial.

### 4. Sincronización de `_client_repo/`

Sincronizar (crear si no existe, actualizar si ya existe) la carpeta `_client_repo/` en la raíz del proyecto con el estado actual del entregable.

**Archivos a copiar/actualizar** — siempre desde la raíz del proyecto:
- `databricks.yml`
- `resources/` (completo, todos los `.yml`)
- `src/` (completo, todos los `.py`)

**Nunca copiar:**
- `.claude/`, `.asdd/`, `.ai-dev-kit/`, `CLAUDE.md`, `.mcp.json`, `.gitignore`
- `docs/` completo — specs, architecture, smart-data — todo queda interno
- Scripts de mantenimiento o configuración del workspace de Guide

**Generar o actualizar `_client_repo/README.md`** a partir de los artefactos del proyecto. El README es el único documento que el cliente recibe — debe ser suficiente para operar y desplegar sin acceso a `docs/`. Secciones obligatorias:
1. Nombre del proyecto + descripción + versión + fecha de entrega
2. Estructura del repositorio (solo los archivos que están en `_client_repo/`)
3. Fuentes de datos (del `smart-data-eng-discovery-{cliente}.md`)
4. Modelo de datos — Silver (tablas, grain) + Gold (tablas, grain)
5. Pipelines — nombre, descripción, schedule configurado para prod (aclarar que en dev están PAUSED por diseño — comportamiento de `mode: development` en DABs; el equipo DevOps del cliente los activa al desplegar a prod)
6. Unity Catalog — catalog y schemas
7. Gobernanza — owners, retención por capa, grupos de acceso, contratos vigentes
8. Arquitectura — diagrama Mermaid del flujo completo
9. Despliegue — prereqs CI/CD, comando de deploy, activación de schedules. Incluir:
   - Instalación CLI: Windows `winget install Databricks.DatabricksCLI`, Mac/Linux `brew install databricks/tap/databricks`
   - Configuración del perfil prod — opción A OAuth (recomendado): `databricks auth login --profile {perfil prod} --host {host}`; opción B PAT: entrada manual en `~/.databrickscfg`
   - Nota CI/CD: parametrizar `email_notifications.on_failure` en el pipeline del cliente con el email del equipo de datos antes del deploy a prod
10. No agregar crédito al pie — el header ya incluye `Entregado por: Guide Technologies — CAO`

**Nota para el ingeniero:** `_client_repo/` se versiona en este repo — commitear junto con el resto de los cambios de publish. Para entregar al cliente, copiar el contenido de `_client_repo/` al repo del cliente manualmente.

## Checklist de cierre del ciclo

Marcar cada ítem solo cuando esté confirmado:

- [ ] Entregable validado y listo en el ambiente de desarrollo/QA del cliente
- [ ] Jobs activos y verificados en el ambiente de desarrollo/QA
- [ ] `smart-data-eng-design` actualizado al estado productivo
- [ ] Contratos de datos vigentes
- [ ] Governance assessment final guardado
- [ ] Diccionario de datos actualizado
- [ ] `_client_repo/` sincronizado con el estado actual del entregable
- [ ] `_client_repo/README.md` generado o actualizado

Si algún ítem no puede marcarse → la fase **no está completa**. Reportar qué falta y quién (qué agente) debe resolverlo.

## Artefactos esperados

- Entregable (DABs / scripts / SDP) validado en ambiente de desarrollo/QA y listo para handoff al DevOps del cliente
- `smart-data-eng-design-{cliente}.md` actualizado
- `docs/specs/smart-data-eng-governance-assessment-{cliente}.md` actualizado al estado final
- `docs/specs/smart-data-eng-dictionary-{cliente}.md` actualizado
- Contratos de datos confirmados como vigentes
- `_client_repo/` sincronizado — `databricks.yml` + `resources/` + `src/` + `README.md`

## Cierre y siguiente paso

Con el checklist completo, el ciclo Smart Data ASDD está **cerrado del lado Guide**. La solución está validada en dev/QA, documentada y lista para que DevOps la despliegue a producción. El contenido de `_client_repo/` es el entregable: commitear y copiar al repo del cliente.

Para una nueva feature, una nueva fuente de datos o un nuevo dominio → iniciar un ciclo nuevo desde **`/asdd:data-eng-discover`**.
