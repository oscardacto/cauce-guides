---
description: Fase Build de datos — implementa los pipelines Medallion sobre Azure y Databricks desde el design aprobado.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, PowerShell]
---

Ejecutar la fase **Build** del flujo Smart Data ASDD.

Tercera fase del flujo `discover → design → build → validate → publish`.
Aquí el diseño aprobado se convierte en pipelines reales sobre Databricks. El
arquitecto ya decidió; en esta fase **solo se implementa**. Ninguna decisión de
arquitectura nace en build.

## Formato de estado por respuesta

Toda respuesta del orquestador dentro de esta fase abre con un header de una línea:

```
[Fase: Build · Modo: {A DABs|B Jobs|C SDP} · Pipelines SUCCEEDED: N/M · Gaps activos: X]
```

- `Modo` refleja el modo de entrega elegido (A, B o C). Si aún no se determinó, mostrar
  `Modo: pendiente`.
- `Pipelines SUCCEEDED` y `Gaps activos` solo aplican después de la primera corrida
  registrada en `smart-data-eng-build-run-{cliente}.md`. Antes de eso, mostrar solo
  `[Fase: Build · Modo: {A|B|C|pendiente}]`.
- Emitir el header al inicio de cada respuesta nueva del turno.

## Prerequisitos — CRÍTICOS

No proceder si falta cualquiera de los siguientes. Si un prerequisito no está
cumplido, detener la fase e indicar al usuario qué resolver antes de continuar.

1. **Smart Data Design aprobado** — `docs/architecture/smart-data-eng-design-{cliente}.md`
   debe existir y estar marcado como aprobado. Es el contrato entre diseño e
   implementación (Principio Smart Data 5). Sin él, no hay nada que construir.
   Si existe `docs/specs/smart-data-eng-dictionary-{cliente}.md`, verificar que los tipos y
   nombres de columna del spec sean consistentes con la sección del diccionario que
   mapea columnas Bronze a Silver. Reportar toda divergencia como bloqueo duro: si
   existe al menos una divergencia de tipo de dato o nombre de columna entre el spec
   y el diccionario, detener la fase y esperar que el arquitecto
   (@asdd-data-architect) resuelva la inconsistencia antes de continuar. No
   proceder con divergencias pendientes.
2. **Contrato Silver** — debe existir `docs/specs/contracts/smart-data-eng-contract-silver-{cliente}-{version}.md`
   con `Estado: active`, producido en la fase `design` por @asdd-data-governance.
   Define el schema comprometido, los tipos y los nullable de negocio de la capa Silver.
   Si existen múltiples versiones en disco, usar la de mayor versión semántica con `Estado: active`.
3. **MCP de Databricks activo** — verificar antes de invocar al agente de ingeniería:
   - Invocar `mcp__databricks__get_current_user` y confirmar que responde con un usuario autenticado.
   - Si el tool falla o no responde → detener. No continuar sin MCP activo.
4. **Unity Catalog preparado** — el catalog principal y los schemas Bronze / Silver /
   Gold deben existir o estar contemplados para crearse según el spec. Nunca Hive
   Metastore. Si el spec no define el catalog y los schemas, es una ambigüedad que
   debe resolver el arquitecto antes de implementar.

## Scope de plataforma — solo Azure + Databricks

Esta fase, en v1, cubre únicamente la plataforma **Azure + Databricks**
(ADF / ADLS Gen2 / Azure Databricks / Unity Catalog).

Si el proyecto fue diseñado para **AWS nativo** (Glue / S3 / Athena), detener la
fase e informar: el agente de ingeniería de datos sobre AWS
(placeholder `asdd-data-eng-aws` — no disponible en v1; queda para una
próxima iteración) aún no está desarrollado. No intentar implementar AWS con el
agente de Databricks.

## Detección de sesión existente

Verificar **antes de invocar cualquier agente**:

**Sin `databricks.yml` en disco** → build desde cero. Flujo normal, sin preguntar.

**Con `databricks.yml` en disco, sin corridas SUCCEEDED en `docs/specs/smart-data-eng-build-run-{cliente}.md`**
(bundle generado pero nunca deployado correctamente, o corridas solo FAILED/ERROR_PRE_RUN):
> Se encontró un bundle en disco pero sin corridas exitosas registradas.
> ¿Qué querés hacer?
> 1. **Rerun** — deployar el código existente y correr los pipelines
> 2. **Rebuild** — el agente re-lee el spec, actualiza lo necesario, deploya y corre

**Con `databricks.yml` en disco y al menos una corrida SUCCEEDED por pipeline en `smart-data-eng-build-run-{cliente}.md`**:

Leer la sección `## Gaps activos` del build-run antes de ofrecer opciones.

**Sin gaps activos:**
> Build anterior completo. N pipelines SUCCEEDED. Sin gaps activos.
> ¿Qué querés hacer?
> 1. **Avanzar a validate** — el build está listo
> 2. **Rerun** — re-correr los pipelines sin cambios
> 3. **Rebuild** — el agente re-lee el spec, actualiza lo necesario, deploya y corre

**Con gaps activos** — mostrar la tabla de gaps y ofrecer:
> Build anterior completo. N pipelines SUCCEEDED. X gap(s) activo(s):
>
> | GAP-ID | Severidad | Descripción | Responsable |
> |---|---|---|---|
> | ... | ... | ... | ... |
>
> ¿Qué querés hacer?
> A — **Trabajar en los gaps** — el agente los revisa uno por uno y cierra los que puede
> B — **Avanzar a validate** — los gaps están documentados, validate los clasifica
> C — **Rerun** — re-correr los pipelines sin cambios
> D — **Rebuild** — el agente re-lee el spec y reconstruye desde cero

### Resolución de gaps (opción A)

El agente revisa cada gap activo en orden de severidad (ALTO → MEDIO → BAJO) y para cada uno determina si puede cerrarlo ahora o debe diferirlo:

| Tipo de gap | Puede cerrarlo el agente | Acción |
|---|---|---|
| Grant UC fallido — grupo ya existe en account level | Sí | Aplicar grant via `manage_uc_grants` y marcar cerrado |
| Schema diverge del contrato Silver | Sí | Corregir el `.py`, redeploy, rerun del pipeline afectado |
| Corrección técnica en código (tipo de dato, lógica) | Sí | Corregir el `.py`, redeploy, rerun del pipeline afectado |
| Depende de acción humana externa (PO, infra, DBA) | No | Pedir owner y fecha límite, marcar 🔵 Diferido en build-run |
| Decisión de arquitectura pendiente | No | Escalar a @asdd-data-architect antes de continuar |
| Schedules PAUSED en target `dev` | No es gap | `mode: development` auto-pausa schedules por diseño de DABs — **no crear entrada en gaps activos**. Documentar en el build-run como comportamiento esperado; la activación para prod es responsabilidad del DevOps del cliente |

**Regla de severidad para avanzar a validate:**
- Gaps **ALTO** sin resolver → no avanzar a validate. Resolver primero.
- Gaps **MEDIO** diferidos → validate los evalúa y decide si son bloqueantes.
- Gaps **BAJO** diferidos → validate los registra; se cierran en publish si aplica.

Al terminar la ronda de gaps, actualizar `## Gaps activos` en el build-run con el estado real de cada uno (cerrado / diferido con owner y fecha) y preguntar:
> Gaps resueltos en esta sesión: X. Gaps diferidos: Y.
> ¿Avanzamos a validate o hay algo más que resolver?

---

## Paso 0 — Declaración de rutas (ART-002, bloqueante)

Antes de invocar a ningún agente, declarar en el plan las rutas **exactas** de
los artefactos de esta fase. No usar placeholders ni slugs sueltos.

Los artefactos Data **no requieren `run-bootstrap` ni `artifact-name.mjs`**: no
se trazan por run ASDD (ADR-003). Sus rutas son literales:

| Artefacto | Ruta |
|---|---|
| Build run | `docs/specs/smart-data-eng-build-run-{cliente}.md` |

Pasar a cada agente **su ruta literal** en el prompt. No lanzar agentes en
paralelo hasta tener todas las rutas declaradas.

## Instrucciones

0. **Lectura obligatoria antes de construir** — leé COMPLETAS las reglas siguientes antes de proceder al paso 1:
   - `.claude/reference/data-engineering/asdd-data-eng-workflow.md` sección **SD-003 (BUILD)** — verificá el criterio de entrada de esta fase: `smart-data-eng-design-{cliente}.md` aprobado + contratos Silver disponibles + MCP Databricks activo. Sin esos artefactos, la fase no está lista y se detiene aquí.
   - `.claude/reference/data-engineering/asdd-data-eng-schema-contracts.md` — el build implementa Silver **estrictamente contra el contrato**. Antes de escribir cualquier transformación Bronze→Silver, verificá `schemaHints` en Bronze donde el tipo inferido diverja del contrato de Silver. El contrato Silver prevalece sobre el spec ante cualquier conflicto de tipo, nullable o grain. Ningún cambio de schema (rename/tipo/eliminar/nullable no→sí/grain) se implementa sin proceso formal — reportar al arquitecto en lugar de improvisar.
   - `.claude/reference/data-engineering/asdd-data-eng-lineage.md` — al construir cualquier tabla nueva en Bronze/Silver/Gold, verificá origen trazable (LIN-003), campo "Tabla entrada" del diccionario poblado para campos PII (LIN-005) y uso obligatorio de Unity Catalog (LIN-006 — NUNCA Hive Metastore, que rompe lineage por diseño). Sin lineage trazable en las tablas que se van a crear, no se procede al paso 1.

1. Confirmar los cuatro prerequisitos de arriba. Si alguno falla, detener y reportar.

2. **Preparar permisos MCP** — antes de invocar al agente de ingeniería, verificar que los
   tools MCP de Databricks necesarios estén en `allow` de `.claude/settings.local.json`.
   Si faltan, agregarlos: `mcp__databricks__manage_workspace`,
   `mcp__databricks__manage_workspace_files`, `mcp__databricks__manage_pipeline`,
   `mcp__databricks__manage_pipeline_run`, `mcp__databricks__manage_jobs`,
   `mcp__databricks__manage_job_runs`, `mcp__databricks__manage_uc_objects`,
   `mcp__databricks__manage_uc_grants`, `mcp__databricks__execute_sql`,
   `mcp__databricks__execute_code`, `mcp__databricks__list_compute`,
   `mcp__databricks__manage_volume_files`. Operación idempotente — no duplicar si ya
   existen.

3. **FASE ESCRITURA — invocar @asdd-data-eng-databricks para escribir archivos locales.**
   El agente escribe todo el código en disco y termina. **No ejecuta `bundle deploy`.
   No corre pipelines. Solo produce archivos locales.** El deploy lo ejecuta el
   orquestador en el paso 4.

   **Scope del agente de ingeniería — prohibición absoluta (Principio Smart Data 4):**
   El agente de ingeniería **nunca edita** `docs/architecture/` ni `docs/specs/`.
   Esos documentos son zona del arquitecto. Si una decisión del usuario implica
   actualizar el spec (`smart-data-eng-design-{cliente}.md`) o cualquier artefacto de
   `docs/specs/`, el agente **reporta al orquestador** qué debe cambiar y el
   orquestador invoca `@asdd-data-architect` para aplicar el cambio.
   Editar el spec directamente desde ingeniería viola "el arquitecto diseña,
   el agente de ingeniería ejecuta" y rompe la trazabilidad del diseño.

   El agente lee el `smart-data-eng-design-{cliente}.md` **completo** antes de escribir
   nada. El spec es el contrato de implementación: implementa estrictamente lo que
   define — schemaHints, patrón de ingesta por fuente, schemas Gold con grain y
   reglas de negocio. Nada se infiere fuera del spec. Ante cualquier aspecto no
   cubierto, pausar y consultar al arquitecto (@asdd-data-architect).

   El agente escribe en este orden:

   **-1. `sync.exclude` en `databricks.yml`** — verificar que el bloque `sync.exclude` esté presente
      en `databricks.yml` antes de escribir cualquier otro archivo. `.databrickignore` **no funciona**
      con `bundle deploy` — el mecanismo correcto es `sync.exclude` dentro del propio `databricks.yml`.
      Si el bloque no existe, agregarlo inmediatamente después de la sección `include`:
      ```yaml
      sync:
        exclude:
          - ".claude/**"
          - ".asdd/**"
          - ".ai-dev-kit/**"
          - "_client_repo/**"
          - "docs/**"
          - "scripts/**"
          - "CLAUDE.md"
          - ".mcp.json"
          - ".databrickignore"
          - "*.xlsx"
          - "*.pdf"
      ```
      Si ya existe con esas entradas, no modificarlo. Esta verificación es obligatoria — sin
      `sync.exclude`, `bundle deploy` sube toda la carpeta local al workspace incluyendo
      contenido confidencial del ASDD.

   **0. Objetos de Unity Catalog** — crear catalog y schemas si el spec lo indica.
      Verificar que Bronze, Silver y Gold existan antes de continuar.
      **Grupos UC — verificar antes de reportar gap:** si el spec define grants a
      grupos locales, verificar su existencia real via MCP (`manage_uc_objects` con
      action `list` sobre groups, o `execute_sql` equivalente) antes de reportarlos
      como gap. Si el grupo existe → anotar para aplicar grants en paso 5. Solo
      reportar gap si la verificación confirma que el grupo no existe.

      **Landing — prerequisito de ingesta, no responsabilidad del build:**
      La capa Landing (schema + volúmenes + archivos CSV) es responsabilidad de
      ADF o del administrador del workspace — el data engineer la consume, no la crea.
      El build verifica que exista y tiene datos; si está vacía, detiene y reporta:
      > Landing vacía: `/Volumes/{catalog}/landing/{fuente}/` no tiene archivos.
      > Confirmar con el equipo de infra/ADF que la ingesta está activa antes de
      > correr los pipelines. En entornos de prueba, subir los CSV de muestra manualmente.

      Estructura correcta de Landing en UC:
      ```
      {catalog}          (catalog — mismo que Bronze/Silver/Gold)
      └── landing        (schema)
          ├── {fuente1}  (volume MANAGED — un volume por fuente)
          ├── {fuente2}  (volume MANAGED)
          └── ...
      ```

      Patrón de path en `resources/pipeline_*.yml`:
      ```yaml
      {fuente}_landing_path: "/Volumes/${var.catalog}/landing/{fuente}/"
      ```
      **Nunca** agregar subdirectorios extra (`/files/`, `/raw/`, etc.) que no
      existan como volúmenes UC — el path debe apuntar directamente al volumen.

   **1. Archivos del bundle (Modo A — DABs):**
      - `databricks.yml` con resources, variables de catalog y targets `dev`/`prod`.
        **No incluir `host` en los targets** — el host lo resuelve el perfil en
        `~/.databrickscfg` del ingeniero que corre el deploy. Así el bundle es
        agnóstico de workspace y funciona tanto en el ambiente de Guide como en el
        del cliente sin modificar el archivo.

        **Estructura obligatoria de `databricks.yml`** — catalog como variable, derivado del spec:
        ```yaml
        bundle:
          name: {client}-smart-data   # client slug del asdd.lock

        include:
          - resources/*.yml

        sync:
          exclude:
            - ".claude/**"
            # ... (bloque completo del paso -1)

        variables:
          catalog:
            description: "Unity Catalog principal del proyecto"
            default: "{catalog_prod}_dev"   # fallback a dev

        targets:
          dev:
            default: true
            mode: development
            workspace:
              profile: {profile}   # host viene del perfil — no hardcodear
            variables:
              catalog: "{catalog_prod}_dev"   # derivado del spec: catalog canónico + _dev

          prod:
            mode: production
            workspace:
              profile: {profile}   # host viene del perfil — no hardcodear
            variables:
              catalog: "{catalog_prod}"       # catalog canónico del spec — sin sufijo
        ```

        **Regla de derivación del catalog:** leer el catalog canónico del spec
        (`smart-data-eng-design-{cliente}.md`, campo `Catálogo UC`). El catalog dev
        es ese valor + sufijo `_dev`. El catalog prod es ese valor sin modificar.
        Nunca hardcodear el nombre del catalog en el YAML — siempre variable.

      - `resources/*.yml` — definición de pipelines SDP y jobs. **Tres reglas:**
        1. **Nombres sin `[${bundle.target}]`** — usar nombre plano (ej. `{cliente}-bronze`).
           `mode: development` ya agrega el prefijo `[dev username]` automáticamente.
           Poner `[${bundle.target}]` provoca un doble prefijo en dev.
        2. **`catalog: ${var.catalog}`** — nunca el nombre hardcodeado del catalog.
           El pipeline SDP hereda el catalog de la variable del bundle.
        3. **`file: path` con `../src/`** — las rutas en `libraries.file.path` se resuelven
           relativas al YAML en `resources/`, no al bundle root. Siempre
           `../src/{capa}/archivo.py`, nunca `src/{capa}/archivo.py`.

        Ejemplo correcto:
        ```yaml
        name: "{cliente}-bronze"        # sin [${bundle.target}]
        catalog: ${var.catalog}         # variable, no string fijo
        schema: bronze
        libraries:
          - file:
              path: ../src/bronze/ingest_bronze.py   # ../src/, no src/
        ```

      - Activar la skill `databricks-dabs` para la estructura correcta del bundle.

   **2. Archivos de código bajo `src/`:**
      - **Bronze** — ingesta raw con schemaHints explícitos para toda columna donde
        el tipo inferido diverja del contrato Silver. Implementar exactamente el
        patrón de ingesta definido en el spec por fuente.
      - **Silver** — leer el contrato Silver completo antes de escribir. El contrato
        prevalece sobre el spec ante cualquier conflicto de tipo, nullable o grain.
      - **Gold** — implementar exactamente las tablas, schemas, grain y reglas de
        negocio del spec. No crear tablas para fuentes que el spec excluya de Gold.

      **Incompatibilidades UC — verificar antes de escribir Bronze:**
      - `F.input_file_name()` → **prohibido en Unity Catalog** (error `UC_COMMAND_NOT_SUPPORTED`).
        Usar siempre `F.col("_metadata.file_path")` para capturar el path del archivo fuente.
      - `spark.conf.get("pipelines.target.catalog")` → **clave inexistente en SDP runtime**
        (error `SQL_CONF_NOT_FOUND`). Para pasar variables del bundle al código Python,
        declarar `configuration: {catalog: "${var.catalog}"}` en el pipeline YAML y leer
        con `spark.conf.get("catalog", "valor_default")` en el `.py`.

      **Regla de referencias a tablas en Silver y Gold:** usar siempre nombres
      **relativos** (`schema.tabla`) en `spark.read.table()` — nunca el catalog
      hardcodeado. El pipeline SDP conoce su catalog por configuración; el código
      no debe duplicar esa información.
      ```python
      # ✅ correcto — relativo al catalog del pipeline
      spark.read.table("bronze.polizas")

      # ❌ incorrecto — hardcodeado, rompe en otro cliente o al cambiar de env
      spark.read.table("cao_{cliente}.bronze.polizas")
      ```

   Cuando todos los archivos estén escritos en disco, el agente reporta al
   orquestador: lista de archivos creados + cualquier ambigüedad del spec que
   requiera decisión del arquitecto antes de deployar.

   **Modo B — Jobs directos con .py:** el agente escribe los scripts Python y los
   sube a Repos via `manage_workspace_files`. No genera `databricks.yml`.
   **Modo C — SDP standalone:** el agente crea los pipelines directamente via
   `manage_pipeline`. No genera `databricks.yml`.

4. **BUNDLE DEPLOY — el orquestador ejecuta el deploy (solo Modo A).**
   El deploy lo corre el orquestador, no el subagente, para garantizar que el
   tool correcto esté disponible en el entorno.

   **Windows → tool `PowerShell` (no `Bash`):**
   ```powershell
   $tf = $null
   if (Get-Command terraform -ErrorAction SilentlyContinue) {
       $tf = (Get-Command terraform).Source
   } elseif (Test-Path "$env:USERPROFILE\.databricks\terraform\terraform.exe") {
       $tf = "$env:USERPROFILE\.databricks\terraform\terraform.exe"
   } elseif (Test-Path "C:\terraform\terraform.exe") {
       $tf = "C:\terraform\terraform.exe"
   }
   if ($tf) {
       $tfv = (& $tf version -json | ConvertFrom-Json).terraform_version
       $env:DATABRICKS_TF_EXEC_PATH = $tf
       $env:DATABRICKS_TF_VERSION = $tfv
   }
   databricks bundle deploy --target dev --auto-approve
   ```

   **Mac/Linux → tool `Bash`:**
   ```bash
   databricks bundle deploy --target dev --auto-approve
   ```

   **Si el deploy falla:**
   1. Escribir `ERROR_PRE_RUN` en `smart-data-eng-build-run-{cliente}.md` con el error exacto.
   2. Reportar al usuario el error completo.
   3. DETENER — no avanzar al paso 5 hasta que el deploy sea exitoso.

5. **FASE EJECUCIÓN — invocar @asdd-data-eng-databricks para correr pipelines.**
   Con el bundle deployado, el agente corre cada pipeline via `manage_pipeline_run`
   y escribe el resultado.

   - Correr Bronze → verificar SUCCEEDED → correr Silver → verificar SUCCEEDED →
     correr Gold → verificar SUCCEEDED.
   - Si un pipeline falla: leer el error, corregir el archivo `.py` local, reportar
     al orquestador **"archivo corregido — se necesita redeploy antes de reintentar"**.
     El orquestador vuelve al **paso 4** (bundle deploy) con el archivo corregido,
     y luego reinvoca este paso para reintentar el pipeline.
     **Prohibido** subir el fix directo al workspace via `manage_workspace_files` para
     saltear el redeploy — el bundle y el workspace quedarían desincronizados ante
     cualquier cambio posterior. El redeploy es obligatorio.
   - Silver no corre si Bronze falla. Gold no corre si Silver falla.
   - Aplicar grants UC a los grupos verificados en paso 3.
   - Al finalizar todos los pipelines, escribir `docs/specs/smart-data-eng-build-run-{cliente}.md`
     siguiendo **exactamente** esta estructura — sin agregar ni quitar secciones ni
     reorganizar el orden. El agente no puede inventar secciones propias:

     ```
     # Build Run — {Nombre del cliente}

     **Fecha:** YYYY-MM-DD
     **Target:** dev | prod ({catalog})
     **Workspace:** {host}
     **Bundle:** {bundle name}
     **Ejecutado por:** {usuario}

     ## Corridas de pipelines
     | Pipeline | Pipeline ID | Run ID | Estado | Duración | Timestamp UTC |
     (una fila por pipeline — no por tabla)

     ## Conteos post-corrida
     | Capa | Tabla | Filas | Nota |
     (una fila por tabla en las tres capas)

     ## Correcciones aplicadas en esta sesión
     | Corrección | Archivo | Motivo |
     (vacía si no hubo correcciones — la sección se incluye igual)

     ## Grants UC
     | Grant | Estado | Motivo |
     (vacía si no hubo intentos — la sección se incluye igual)

     ## Gaps activos
     | GAP-ID | Severidad | Descripción | Acción | Responsable |
     (vacía si no hay gaps — la sección se incluye igual)

     ## IDs de recursos
     | Recurso | ID |
     ```

     Este archivo es el gate de entrada de `/asdd:data-eng-validate`.

6. **Manejo de ambigüedades** — si el spec tiene huecos o contradicciones, el agente
   pausa y consulta al arquitecto (@asdd-data-architect). Nunca toma decisiones
   de arquitectura por su cuenta (Principio Smart Data 4).

## Artefactos esperados

- Pipelines Bronze → Silver → Gold desplegados en el workspace Databricks.
- `docs/specs/smart-data-eng-build-run-{cliente}.md` — una fila por pipeline con: nombre del pipeline (tal como aparece en el spec), run_id, estado (SUCCEEDED / FAILED / ERROR_PRE_RUN), timestamp.
- Jobs de orquestación serverless configurados.
- Entregable según el modo elegido: bundle DABs (Modo A), scripts .py en Repos (Modo B), o SDP standalone (Modo C).
- Objetos de Unity Catalog creados bajo el catalog principal del proyecto, en
  `snake_case` (catalogs, schemas, tablas, columnas, volumes).

## Siguiente paso

Con los pipelines desplegados y verificados → ejecutar `/asdd:data-eng-validate`
para que @asdd-data-architect y @asdd-data-governance validen el
cumplimiento del spec, los contratos y la gobernanza antes de publicar.
