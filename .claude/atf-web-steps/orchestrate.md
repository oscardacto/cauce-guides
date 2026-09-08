---
name: ATF Web Orchestration
description: Inicialización, checkpoint, recuperación, consolidación y errores del coordinador ATF Web.
---

## SKILLS

| Skill | Responsabilidad |
|---|---|
| `asdd-atf-web-checkpoint-writer` | Escritura/eliminación de `checkpoint.json` vía `generate-checkpoint.js` |
| `asdd-atf-web-rate-limit-handler` | Detectar rate limit, persistir estado, mostrar banner de pausa |
| `asdd-atf-web-browser-lifecycle` | Verificación de browser MCP / NotebookLM MCP y cleanup post-ejecución |
| `asdd-atf-web-context-manager` | Handoff cross-sesión (`context_summary.json`) |

## SESSION CONTEXT DAO

`tools/session-context.js` mantiene `session_context.json` (canónico) y proyecta 4 contextos segregados: `auth_context.json`, `execution_context.json`, `design_context.json`, `pipeline_state.json`. API: `sc.read(runId)`, `sc.write(runId, patch)`, `sc.get{Auth|Execution|Design}Context(runId)`, `sc.getPipelineState(runId)`, `sc.writePipelineState(runId, patch)`.

## REGLAS

1. **ANTI-SELF-READ:** Tras cargar el core y leer COMPLETO este phase spec, NUNCA releer ninguno con Read/grep/cat durante el pipeline. Ya están en contexto; volver a tokenizarlos introduce overhead sin valor. Si una recuperación exige detalle, usar `view_range` solo para la sección mínima.
2. **NO-TODOWRITE:** NUNCA usar Update Todos / TodoWrite durante el pipeline. Son UI overhead sin valor operativo (~4 calls × 2-3s ≈ 10s). El estado del pipeline vive en `session_context.json` y `checkpoint.json` — no en la UI de tareas.
3. NUNCA ejecutas tareas de testing — solo coordinas. Todas las fases se delegan a sub-agentes via Agent tool.
4. SIEMPRE escribes `session_context.json` en PASO 0.3 antes de invocar cualquier agente.
5. Los agentes leen `session_context.json` — no los archivos de config directamente.
6. SIEMPRE verificas que el output de un agente existe antes de lanzar el siguiente.
7. NUNCA saltas la compuerta del Diagnostician.
8. Orden: Strategist → Design Team → Strategist coverage → Executor Team → Consolidación.
9. Ante fallo: reportar, preguntar al usuario, no abortar silenciosamente.
10. `execution_plan.json` es el contrato de instancias — leerlo antes de FASE 1C y FASE 2C.
11. NUNCA escanees ni leas carpetas de runs anteriores. Scope = SOLO `{run_folder}`.
12. NUNCA hagas glob/listado de `docs/testing/atf-web/` — solo `{run_folder}`.
13. RATE LIMIT: Si tool retorna 429/overloaded → `[SKILL: asdd-atf-web-rate-limit-handler | mode: detect-and-pause]`. NO reintentar.
14. **REPORTES — NUNCA HTML manual.** Solo: `node .claude/dashboard/generate-report.js {run_id}` y `node .claude/dashboard/generate-index.js`.
15. **Atomicidad para apps de alto volumen:** timeout: `45 + (estimated_cps / 10) * 5` min. HU >15 CAs o fórmulas = slot exclusivo. Checkpoint tras CADA módulo en 2C. **Reporte NO se regenera por módulo en 2C** — solo en consolidación.
16. **ANTI-BYPASS:** NUNCA ejecutar pasos de otro agente. Invocar via Agent tool. Lógica directa = solo estado/scripts/reportes.
17. **ANTI-EXPLORACIÓN:** NO usar ls/find/head/grep exploratoriamente. Rutas vienen de config.yaml, appweb.yaml y session_context.json. PROHIBIDO: `ls docs/testing/atf-web/requirements/`, `ls docs/testing/atf-web/`, `ls .claude/tools/`, `ls .claude/agents/`, `ls .claude/skills/`, `find . -name`, `head -20`, `cat` ajenos al run.
18. **ANTI-AGENT-TOOL-PARA-DETERMINÍSTICO:** NUNCA usar `Agent tool` para tareas <10 s. Patrón correcto: `bash → node .claude/tools/{script}.js`. Únicas invocaciones legítimas: diagnostician (FASE 0), strategist (FASE 1), design-team × N (FASE 1C), coverage-fill (FASE 1D), executor (FASE 2C). [Detalle: `reference/atf-web/asdd-atf-web-orchestrator-fastpath-rules.md` § REGLA 18.]

---

## PASO 0 — INICIALIZACIÓN

### 0.0 Browser MCP [CONDICIONAL — HARD GATE]

**Si `fase_2c` activa:** OBLIGATORIO ejecutar verificación del browser MCP.

> ⛔ **Gate previo:** Si un `system-reminder` declara que tools `mcp__playwright__browser_*` están desconectadas, O `ToolSearch query="select:mcp__playwright__browser_navigate"` retorna 0 hits, O el probe `browser_navigate('about:blank')` falla → **ABORTAR DIRECTAMENTE** invocando el script atómico:
>
> ```bash
> node .claude/tools/abort-blocked.js \
>   --run-id "{run_id}" --module-id "{module_id}" \
>   --cp-ids '{cp_targets_ids_json}' \
>   --reason "browser_mcp_unavailable" \
>   --action-required "Reiniciar MCP server playwright en VSCode → Ctrl+Shift+P → Claude: Restart MCP Server" \
>   --detected-via "ToolSearch:0_hits"
> ```
>
> Escribe en 1 sola invocación: `execution_blocked.json` + `result.json` BLOCKED por cp_id (shape REGLA 1+3+5+6) + `module_result.json` + `headless_results.json`. Tras esto: validate + verify-no-self-read paralelos + generate-report + generate-index. NO `node -e` inline (escapes Windows fallan), NO Write de scripts temporales, NO Bash ls extras, NO refresh-session-context, NO pausa al usuario. [Ver `reference/atf-web/asdd-atf-web-orchestrator-fastpath-rules.md` § P26 + § P32 para flujo completo.]

`[SKILL: asdd-atf-web-browser-lifecycle | mode: verify]` → ejecuta `browser_navigate('about:blank')`
con **hasta 3 intentos** (5s entre cada uno). El skill maneja los reintentos internamente.

- Si **responde OK** (en cualquier intento) → `{browser_verified} = true`. Continuar.
- Si **los 3 intentos fallan** → **DETENER INMEDIATAMENTE** con mensaje al usuario.
  No ejecutar NINGÚN paso posterior (ni cleanup, ni pre-extract, ni sub-agents).
  NUNCA generar resultados sintéticos. El skill ya incluye diagnóstico de procesos
  y mensaje accionable para el usuario.

**Si `fase_2c` NO activa:** Saltar (browser no requerido para fases 0/1/1C).

### 0.0b NotebookLM MCP [CONDICIONAL]

`[SKILL: asdd-atf-web-browser-lifecycle | mode: verify-notebooklm | enabled: {notebooklm.enabled} | notebook_id: {notebooklm.notebook_id}]` — No bloqueante.

### 0.0c Knowledge bootstrap gate

> ⚡ **Gate de knowledge — solo ejecutar si `fase_0` o `fase_2c` activas.** Verifica que el knowledge per-app no sea solo placeholder cuando hay docs en `docs/testing/atf-web/requirements/context/`. Si hay drift, sugiere ejecutar `/asdd:qa-web-knowledge` antes del run.

```bash
KNOWLEDGE_FILE="docs/testing/atf-web/knowledge/app_behavior.{app_name}.md"
KNOWLEDGE_PLACEHOLDER_MARKER="<!-- PLACEHOLDER: este archivo es un skeleton"
CONTEXT_DOCS_COUNT=0
[ -d docs/testing/atf-web/requirements/context ] && CONTEXT_DOCS_COUNT=$(find docs/testing/atf-web/requirements/context -maxdepth 1 -type f \( -name "*.md" -o -name "*.txt" -o -name "*.docx" -o -name "*.pdf" \) 2>/dev/null | wc -l)

if [ -f "$KNOWLEDGE_FILE" ] && grep -q "$KNOWLEDGE_PLACEHOLDER_MARKER" "$KNOWLEDGE_FILE"; then
  if [ "$CONTEXT_DOCS_COUNT" -gt 0 ]; then
    echo "⚠️ KNOWLEDGE_DRIFT: $KNOWLEDGE_FILE es solo placeholder, pero hay $CONTEXT_DOCS_COUNT docs en docs/testing/atf-web/requirements/context/."
    echo "   Sugerencia: ejecutar /asdd:qa-web-knowledge antes de continuar — los agentes carecen de doctrina específica de {app_name}."
    echo "   Para continuar IGNORANDO: confirmar al usuario y registrar en banner de FASE 2C."
  else
    echo "ℹ️ KNOWLEDGE_PLACEHOLDER: $KNOWLEDGE_FILE vacío y no hay docs en docs/testing/atf-web/requirements/context/ — continuar sin acción."
  fi
elif [ ! -f "$KNOWLEDGE_FILE" ]; then
  echo "⚠️ KNOWLEDGE_MISSING: $KNOWLEDGE_FILE no existe. ¿Falta ejecutar /asdd:qa-web-setup-app {app_name}?"
fi
```

**Acción del orquestador según output:**

| Salida del bash | Acción |
|---|---|
| (sin warnings) | Continuar a 0.1 silenciosamente. |
| `KNOWLEDGE_DRIFT` (placeholder + docs) | Mostrar el warning al usuario UNA vez. Si `--auto-knowledge` flag presente o usuario confirma → invocar `/asdd:qa-web-knowledge` automáticamente. Si usuario continúa sin extraer → registrar en banner FASE 2C: `⚠️ run sin doctrina de dominio (placeholder activo)`. |
| `KNOWLEDGE_MISSING` (archivo ausente) | Sugerir `/asdd:qa-web-setup-app {app_name}` antes de continuar. NO bloquear (puede ser app legacy sin setup). |

**Razón:** sin este gate, un QA podría olvidar ejecutar `/asdd:qa-web-knowledge` y luego obtener CPs genéricos sin enterarse de la causa. El gate detecta el caso al inicio y advierte explícitamente. No bloquea — el QA puede continuar sabiendo el estado.

### 0.1 Carga de configuración

> ⚡ **CONTINUATION SHORTCUT:** Si `{is_continuation} = true` Y solo `fase_2c` activa, **NO leer `config.yaml` aquí**. Sus valores ya están en `session_context.json` (refrescado por `preflight-continuation.js` con valores actuales de `appweb.yaml`). Re-leer `config.yaml` en este modo añade ~10-15 s de overhead sin valor. Saltar directamente a 0.3.1 + WAVE 0 P25.

Leer `config.yaml` → extraer:
- `{output_base_folder}` ← `folders.output`
- `{parallel_executors}`, `{browser}`, `{timeout_ms}`
- `{defect_severity_definitions}`, `{report_config}`
- `{instance_timeout_min}`, `{max_design_instances}`, `{max_executor_instances}`, `{max_hus_per_design_instance}`
- `navigation_learning.*` (enabled, min_confidence, stale_purge_after_runs, max_alternatives)

> **** los campos `user.*` (perfil del usuario) y `execution.{headless,screenshots,video,retry_on_failure}` se eliminaron de `config.yaml` por uso ~0. El saludo no es personalizado. `headless` vive solo en `appweb.yaml`.

Leer `appweb.yaml` → extraer:
- `{app_name}`, `{app_url}`, `{app_version}`, `{app_environment}`, `{app_description}`
- `{requires_auth}`, `{default_role}`, `{additional_roles}`
- `{functional_docs_folder}`, `{primary_files}`
- `{test_run_mode}`, `{custom_tags}`, `{run_id}`
- `{matrix_format}` (default `"generic"`), `{evidence_mode_override}`
- `{fase_1d_e2e_fills}` ← `pipeline.fase_1d_e2e_fills` (default: `true`)

**Pipeline switches** (default true si ausente): `{fase_0_on}`, `{fase_1_on}`, `{fase_1c_on}`, `{fase_2c_on}`.

**Evidence mode:** `{evidence_mode}` ← `{evidence_mode_override}` si no vacío, else `"failures_only"`.

`{pipeline_start_time}` ← timestamp ISO · `{agent_call_log}` ← []

### 0.1.5 Cross-session recovery [solo si checkpoint activo]

Si `{run_id}` con checkpoint: `[SKILL: asdd-atf-web-context-manager | mode: read | run_folder: {run_folder}]`. Contenido → mostrar resumen. `found: false` → continuar.

### 0.2 Run ID y continuación

Si `{run_id}` vacío → auto: `{app_name}-v{app_version}-{YYYYMMDD}-{HHmm}`. `{run_folder}` ← `{output_base_folder}/{run_id}/`.

| Condición | Modo | `{is_continuation}` |
|---|---|---|
| `{run_folder}` + `session_context.json` existen | CONTINUACIÓN | `true` |
| `{run_folder}` sin `session_context.json` | ⛔ ERROR | DETENER |
| `{run_folder}` no existe | RUN NUEVO | `false` |

### 0.3 Rutas

```
{diagnostics_dir} = {run_folder}/diagnostics/
{strategy_dir}    = {run_folder}/strategy/
{design_dir}      = {run_folder}/design/
{execution_dir}   = {run_folder}/execution/
{reports_dir}     = {run_folder}/reports/
{screen_coverage_path} = {run_folder}/screen_coverage.json
```

### 0.3.1 session_context.json

Construir JSON con TODAS las variables de 0.1 + rutas de 0.3 + campos:
- `is_continuation`, `rerun_targets: null`
- `pipeline_switches: { fase_0, fase_1, fase_1c, fase_2c }`
- `navigation_learning: { enabled, min_confidence, stale_purge_after_runs, max_alternatives }`
- `notebooklm_enabled`, `notebooklm_notebook_id`
- `memory_dir: {project-root}/.claude/agent-memory/{app_name}`
- `credentials_file: {project-root}/docs/testing/atf-web/config/credentials.yaml`

Si continuación: leer existente como base, sobreescribir con valores actuales de appweb.yaml.

**En CONTINUACIÓN, usar el script dedicado** (no `node -e` inline — escapes Windows fallan):

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/refresh-session-context.js \
  --run-id "{run_id}" --tags '{custom_tags_json}' \
  --evidence-mode "{evidence_mode}" --batch-size {fast_path_batch_size} \
  --mode "{test_run_mode}" --is-continuation true
```

[Detalle: ver `reference/atf-web/asdd-atf-web-orchestrator-fastpath-rules.md` § P4. Para runs NUEVOS, construir session_context desde cero — el script es opt-in para refresh, no para creación.]

### 0.3.1b pipeline_start.json

Si continuación y ya existe → preservar (mtime = t0 autoritativo). Si no → escribir `{ "run_id", "started_at" }`.

### ⚡ CONTINUATION SHORTCUT

> ⛔ **ANTI-SELF-READ en CONTINUACIÓN:** Si llegaste aquí, el core y este phase spec ya están en contexto. **NO releer ninguno** para encontrar estas instrucciones.

**Si `{is_continuation}` = true → SALTAR 0.4, 0.4b, 0.6, 0.7. Ir directo a 0.5.**
Estos pasos ya se ejecutaron en el run original.

**Si `{is_continuation}` = true Y solo `fase_2c` activa (demás OFF):**
- Saltar 0.0b, 0.5.1.

> ⛔ **REGLA 19 (INVIOLABLE) — WAVE 0 paralelo es UN SOLO MENSAJE:**
>
> Después de cargar el core, leer COMPLETO este phase spec y completar los 3 reads/checks iniciales (`Read appweb.yaml`, `Glob docs/testing/atf-web/requirements/*.xlsx`, `Bash test session_context`), el SIGUIENTE mensaje del coordinador DEBE contener EXACTAMENTE 2-3 tool calls EN PARALELO:
>
> 1. (Solo si `mcp__playwright__browser_*` está en deferred tools) `ToolSearch query="select:mcp__playwright__browser_navigate"` — UNA vez, máximo. Si ya hiciste ToolSearch en mensaje previo, omitir.
> 2. `mcp__playwright__browser_navigate('about:blank')` — probe MCP.
> 3. `Bash` — `node .claude/tools/preflight-continuation.js ...`.
>
> **EJEMPLO LITERAL DEL MENSAJE VÁLIDO:**
>
> Este es el ÚNICO formato aceptable del mensaje posterior a la carga condicional y los tres checks:
>
> ```
> [tool_use: mcp__playwright__browser_navigate]
>   url: "about:blank"
>
> [tool_use: Bash]
>   command: "node .claude/tools/preflight-continuation.js --run-id ... --tags ... --evidence-mode ... --batch-size ... --mode ..."
>   description: "Pre-flight consolidado"
> ```
>
> **AMBAS tool calls van en EL MISMO mensaje del LLM**, en bloques de tool_use consecutivos sin intervención de texto narrativo entre ellas. Razón: son INDEPENDIENTES — `preflight-continuation.js` lee disco (no toca el browser); `browser_navigate('about:blank')` toca el browser MCP (no toca disco). Pueden ejecutarse en paralelo sin race condition.
>
> ⛔ **NO razonar sobre dependencias ficticias.** El preflight script es 100% deterministic-disk-only y NO necesita el browser. El probe `about:blank` solo confirma que el MCP responde. Son dos verificaciones ortogonales — emitirlas secuenciales paga el thinking del LLM dos veces en lugar de una.
>
> **PROHIBIDO ANTES DEL WAVE PARALELO:**
> - ❌ Mensajes separados con cada tool — el LLM debe paralelizar en UN mensaje.
> - ❌ `Read config.yaml` (sus valores ya están en `session_context.json` post-refresh — § P30).
> - ❌ `Glob docs/testing/atf-web/requirements/**/*.xlsx` recursivo — el `Glob docs/testing/atf-web/requirements/*.xlsx` no-recursivo previo fue suficiente.
> - ❌ `Bash ls docs/testing/atf-web/` o `ls execution/` "para verificar artefactos".
> - ❌ `Bash test -f checkpoint.json` por separado — el preflight ya lo lee internamente y reporta en su JSON.
> - ❌ `TodoWrite` — flujo es lineal y conocido, no necesita planning.
> - ❌ Sub-agentes "para diagnosticar".
>
> **Si ToolSearch retorna 0 hits O `browser_navigate` falla con timeout:** ABORT con `browser_mcp_unavailable` siguiendo el flujo de § P26 + § P32 (consolidación BLOCKED automática, sin pausa al usuario, sin bashes extras).

- Lanzar **PRE-FLIGHT consolidado** — 2 tool calls EN UN SOLO MENSAJE:

  1. `mcp__playwright__browser_navigate('about:blank')` — probe MCP.
     Si la tool no está registrada (ToolSearch retorna 0 hits o la invocación falla con timeout) → ⛔ ABORT con `browser_mcp_unavailable` ANTES de spawnear executor. [Ver § P26 + § P32 para flujo exacto.]
  2. `Bash` — UN solo node call que consolida lo que antes eran WAVE 0 + WAVE 1 + WAVE 2 + `ls design/` + inject inline:
     ```bash
     node .claude/tools/preflight-continuation.js \
       --run-id "{run_id}" \
       --tags '{custom_tags_json}' \
       --evidence-mode "{evidence_mode}" \
       --batch-size {fast_path_batch_size} \
       --mode "{test_run_mode}"
     ```
     - Exit 0 → JSON consolidado en stdout: `run_folder`, `module_id` (derivado del tag — § P15/P23), `cp_targets[]`, `cp_targets_resolved_count`, `mfa_status`, `exec_context_path`, `design_status`, `checkpoint`, `run_started_at`.
     - Exit 1 → fatal (run_folder ausente / design missing / tag inválido / cp_id no encontrado). ⛔ DETENER con el mensaje del stderr.
     - Exit 2 → MFA `needs_reauth` o `parse_error`. Aplicar § P7 (BLOCKED batch + skip executor + consolidación).

[Reglas: ver `reference/atf-web/asdd-atf-web-orchestrator-fastpath-rules.md` § P25. El script consolida WAVE 0 + WAVE 1 + WAVE 2 + `ls design/` + inject inline en una sola invocación sub-segundo.]

- Tras pre-flight (exit 0) + probe MCP exitoso → FASE 2C directo (0.5 checkpoint resume sin sub-agente).
  - Las claves del JSON de stdout reemplazan a las variables que antes se derivaban de WAVE 1/2 (`{module_id}`, `{cp_targets_ids_json}`, `cp_targets_resolved`, `mfa_preflight.status`, etc.).

### 0.4 Conversión .docx

Si ninguna fase consumidora activa (0, 1, 1C todas OFF) → saltar.
```bash
node .claude/tools/convert-docx.js {functional_docs_folder}
```
Originals → `.docx-originals/`. Agentes downstream solo procesan .md/.txt.

### 0.4b Conversión .xlsx (Flujo Fábrica)

> ⛔ **Guard de continuación (INVIOLABLE):** Si `is_continuation = true` (existe `docs/testing/atf-web/{run_id}/session_context.json`), SALTAR este paso incondicionalmente, **incluso si hay un .xlsx en `docs/testing/atf-web/requirements/`**. En CONTINUATION SHORTCUT el `design/` ya está poblado por el run original; procesar el xlsx sobrescribiría los `cp_modulo_*.json`, perdiendo el diseño autoritativo. El xlsx queda intacto en `docs/testing/atf-web/requirements/` para futuros runs nuevos. Doctrina: la presencia de un archivo en disco NO debe gobernar el modo del pipeline cuando el QA ya declaró un `run_id` existente.

**Guards (en orden):**
- `is_continuation=true` → SKIP siempre.
- `fase_1c=OFF` + `xlsx_import_summary.json` existe → leer variables, saltar.
- `fase_1c=OFF` + `fase_2c=ON` + no existe summary → ejecutar.
- `fase_1c=ON` → ejecutar.

**Switch por `{matrix_format}`** (de `appweb.yaml → test_run.matrix_format`):

| matrix_format | Script | Formato Excel esperado |
|---|---|---|
| `gnp` o `generic` (default) | `convert-xlsx.js` | 19 columnas, preámbulo con "Título Matriz N" |
| `fogafin` | `convert-xlsx-fogafin.js` | 9 columnas, Gherkin preformateado (Dado/Cuando/Entonces) |

Si hay `.xlsx`:
```bash
# Si matrix_format == "fogafin":
node .claude/tools/convert-xlsx-fogafin.js "{functional_docs_folder}/{archivo.xlsx}" "{design_dir}" "{run_id}"

# Si matrix_format != "fogafin" (gnp/generic):
node .claude/tools/convert-xlsx.js "{functional_docs_folder}/{archivo.xlsx}" "{design_dir}" "{run_id}"
```

Leer `xlsx_import_summary.json` → `{xlsx_modules_generated}`, `{xlsx_total_cps}`.
Mover xlsx a `procesados/`. Si `fase_1c=true` y xlsx existe → forzar `fase_1c=false`.

Reportar: `📊 XLSX IMPORTADO ({matrix_format}) — {xlsx_modules_generated} módulos, {xlsx_total_cps} CPs`.

Si no hay .xlsx: verificar si `xlsx_import_summary.json` ya existe (xlsx en procesados/). Si tampoco → flujo sin Fábrica.

### 0.5 Checkpoint (resume)

Si `checkpoint.json` existe:
- `pipeline_complete === true` → ignorar checkpoint, fresh start. `{resume_from_phase}` ← `null`.
- `pipeline_complete` false/ausente → checkpoint de run interrumpido:
  - `{resume_from_phase}` ← `checkpoint.next_phase`
  - Si `current_phase === "2C"` y `rerun_targets.module_ids_affected` no vacío → filtrar módulos de `modules_completed` para re-ejecución
  - Si no hay rerun_targets → `{resume_from_module_index}` ← `modules_completed.length`
  - **Saltar fases ya completadas.**

Si no existe → `{resume_from_phase}` ← `null`.

### 0.5.1 Validación de session

```bash
node .claude/tools/validate-session.js {run_id}
```
Exit 0 → OK. Exit 1 → DETENER. Exit 2 → warnings, continuar.

### 0.6 Validación de inputs

- `app_url` no vacía
- `functional_docs` con ≥1 documento
- `credentials.yaml` si `requires_auth=true` Y fase con auth activa; DIFERIDO si no hay fase con auth

Fallo → reportar + instrucciones + detener.

### 0.7 Resolución del filtro

Modos válidos: `smoke` | `custom`.

- `mode = smoke` → `{active_tag_filter}` = `["@smoke"]`, `{active_flow_scope}` = `"critical"` (de `run_modes.smoke`).
- `mode = custom` → `{active_tag_filter}` = `{custom_tags}` (de `appweb.yaml → test_run.custom_tags`), `{active_flow_scope}` = `"all"`.
- Cualquier otro valor → ERROR de configuración. Reportar y detener.

### 0.8 Banner

Mostrar:
```
╔════════════════════════════════════════════╗
║  ATF — AGENTIC TESTING FRAMEWORK          ║
║  App: {app_name} {app_version} ({env})    ║
║  Run: {run_id} | Auth: {requires_auth}    ║
║  Modo: {test_run_mode} | Tags: {filter}   ║
║  Switches: F0:{on/off} F1:{} F1C:{} F2C:{}║
║  Output: {run_folder}                     ║
╚════════════════════════════════════════════╝
```
Saludar al QA con un mensaje genérico ("Hola").

---

## CHECKPOINT SYSTEM

Toda gestión via `[SKILL: asdd-atf-web-checkpoint-writer]`:
- Tras cada fase: `mode: write` con `{run_id, run_folder, last_phase, pipeline_start}`
- En 2C tras módulo: `mode: write` + `modules_completed[]`, `modules_remaining[]`
- Cierre exitoso: `mode: delete`
- Tras escritura: `📌 CHECKPOINT: {fase} completada`

---

## ARTEFACTOS PRE-EXISTENTES (standalone-ready)

> Verificar ANTES de ejecutar cualquier fase. Si el artefacto ya existe (producido por un comando standalone previo), la fase correspondiente se omite.

| Artefacto | Fase omitida |
|---|---|
| `{diagnostics_dir}/base_pruebas.md` | FASE 0 |
| `{strategy_dir}/execution_plan.json` | FASE 1 |
| `{design_dir}/cp_modulo_*.json` ≥ 1 | FASE 1C (módulos existentes) |

Verificar existencia + `produced_by`. Registrar en `pipeline_state.phases_skipped[]`.
Switch ON + artefacto existe → respetar artefacto (skip). QA quiere forzar re-ejecución → borrar artefacto o usar `reset-run.js`.

---

## CLEANUP BROWSER

> ⚡ **CONTINUATION SHORTCUT — SKIP `browser-lifecycle` skill duplicado:** Si el run usó CONTINUATION SHORTCUT con 1 batch (típico `/asdd:qa-web-exec` o `/asdd:qa-web-run` con `cp_targets ≤ 5`), el executor YA ejecutó `browser_close()` en su PASO 3.C de cada CP. Invocar el skill `browser-lifecycle | mode: cleanup` aquí produce un segundo `browser_close` que retorna `"No open tabs"` — tool call wasteful (~2-3 s + thinking). OMITIR en este modo. Aplica solo en FULL run multi-módulo donde el executor puede dejar tabs abiertos entre módulos.

`[SKILL: asdd-atf-web-browser-lifecycle | mode: cleanup | browser_phases_ran: {fase_2c_on}]`

> ⚡ **Cleanup OS-level garantizado (INVIOLABLE):** además del cleanup vía MCP del párrafo anterior, SIEMPRE ejecutar el script `cleanup-mcp-browser.js` al cierre. El `browser_close()` del MCP cierra la tab pero **no garantiza** que el proceso chrome.exe muera a nivel OS — pueden quedar procesos huérfanos pese a múltiples `browser_close()`. El script mata por filtro `mcp-chromium` en cmdline + borra lockfiles del profile dir, sin tocar el navegador personal del usuario. Fast-path interno: ~5-100 ms si no hay residuales — costo despreciable en happy path.

```bash
node .claude/tools/cleanup-mcp-browser.js --quiet
```

Exit 0 siempre (mata 0..N procesos). NO bloquea si falla — reportar warning y continuar.

---

## CONSOLIDACIÓN FINAL

> Siempre se ejecuta al terminar la última fase activa, con los datos disponibles.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 CONSOLIDANDO RESULTADOS   [{timestamp}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Modo de consolidación

```
{consolidation_mode}:
  "full"        → execution data existe (≥1 module_result.json)
  "design_only" → solo cp_modulo_*.json
  "analysis"    → solo execution_plan.json
  "minimal"     → solo diagnóstico
```

### Checkpoint

`[SKILL: asdd-atf-web-checkpoint-writer | mode: delete | run_folder: {run_folder}]` — pipeline completo.

Equivale a (si el skill falla, usar directamente):
```bash
node .claude/tools/generate-checkpoint.js --run-folder "{run_folder}" --delete
```

> ⛔ Flags INVÁLIDOS que causan error silencioso: `--mode delete`, `--pipeline-complete`, `--pipeline-complete true`. El único flag para eliminar es `--delete` (booleano, sin valor). `--run-folder` es **obligatorio** siempre.

Métricas según modo: si execution → sumar passed/failed/blocked. Si no → CPs = diseñados, ejecución = 0.

> `context_summary.json` puede existir de una sesión anterior. Usar overwrite (borrar + escribir) — NO append ni Edit.

`[SKILL: asdd-atf-web-context-manager | mode: write | summary_for_phase: "{next}" | phases_completed | key_facts | next_action]`

### runs_index.json

Leer o inicializar `{output_base_folder}/runs_index.json`. Construir/actualizar entrada con:
`run_id`, app info, mode, consolidation_mode, timestamps, phases completed/skipped,
FRS, modules, total_cps_designed, cps_by_risk, execution stats (si hay), verdict, report_path.

Si `run_id` ya existe → actualizar. Si no → agregar.

### Consolidación final — Wave 1 paralelo + Wave 2 secuencial

```bash
# Wave 1 — validate y verify-no-self-read son independientes (paralelos)
( node .claude/tools/validate-execution-output.js {run_id} > /tmp/_validate.out 2>&1 ) &
( node .claude/tools/verify-no-self-read.js --run-id={run_id} --since={run_started_at_iso} > /tmp/_antiself.out 2>&1 ) &
wait

# Wave 2 — generate-report → generate-index (dependencia: runs_index.json)
node .claude/dashboard/generate-report.js {run_id}
node .claude/dashboard/generate-index.js
```

[Interpretación de exit codes y dispatch: ver `reference/atf-web/asdd-atf-web-orchestrator-fastpath-rules.md` § P19. `{run_started_at_iso}` viene de `session_context.pipeline_state.run_started_at` (lo setea `refresh-session-context.js`).]

> **`{run_started_at_iso}`** se persiste en `session_context.pipeline_state.run_started_at` desde PASO 0.3 (refresh-session-context.js lo setea automáticamente). Sin él, el script analiza todo el transcript del proyecto y puede dar falsos positivos por sesiones previas.

### Banner final

```
╔════════════════════════════════════════════════════════╗
║  ATF — REPORTE FINAL | {consolidation_mode}           ║
║  App: {app_name} {version} | Run: {run_id}            ║
║  FRS: {score}% ({gate}) | Módulos: {N} | CPs: {N}    ║
║  {execution ? "PASS:{N} FAIL:{N} BLOCKED:{N}" : ""}   ║
║  📊 {run_folder}/report.html                          ║
║  📋 {output_base_folder}/runs_index.html              ║
║  Pendientes: {fases_off o "Ninguna"}                  ║
╚════════════════════════════════════════════════════════╝
```

---

## MANEJO DE ERRORES

```
⚠️ AGENTE FALLIDO: {nombre} | Fase: {fase} | Error: {desc}
   A) Reintentar  B) Omitir + parciales  C) Abortar
   → Esperar decisión del usuario
```
