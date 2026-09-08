---
description: ATF Web fast-path — ejecuta CPs puntuales de un run existente invocando al executor sin pasar por el orquestador.
mode: 'agent'
---

## PROPÓSITO

**Ejecutar CPs específicos en un run existente sin pasar por el orquestador.** Casos de uso:

- Re-test de un CP post-fix
- Re-ejecutar un CP con datos corregidos
- Validar manualmente un par de CPs antes de un reporte
- Ciclo iterativo de depuración de selectores/recetas sin penalización de setup

**NO usar para:** runs nuevos, pipeline completo, fases distintas a 2C, o ejecuciones donde necesitas
diagnóstico/estrategia/consolidación/reporte HTML regenerado automáticamente.

**Para esos casos → `@.claude/commands/sofka-asdd/qa-web-run.md`.**

---

## PROHIBICIONES — Integridad del veredicto (INVIOLABLE)

Este command es el orquestador del fast-path y prepara el prompt del sub-agente
executor. Está **TERMINANTEMENTE PROHIBIDO** que `/sofka-asdd:qa-web-exec` inyecte al sub-agente
notas pre-construidas sobre resultados esperados de CPs específicos.

**Ejemplos de lo prohibido** (viola REGLA 4 del executor — verdad por run, sin
consulta de historial):

```
❌ Nota sobre CP-M5-005: es @known_bug — FAIL_BY_DESIGN esperado. Si al re-ejecutar
   sigue fallando, ese es el resultado correcto.
❌ CP-M4-012 fue reportado como flaky en runs previos — tolerar reintentos.
❌ Para CP-M1-003 se espera PASS porque nunca ha fallado.
❌ El CP-Matriz_1-7,02,3 se sabe que tarda más de 2 min — no marcar BLOCKED por timeout.
```

**Razón:** cualquier hint sobre el veredicto esperado de un CP específico sesga al
sub-agente. Aunque el hint sea informativo, el LLM lo usa como ancla. El executor
debe evaluar cada CP contra observación directa vs `expected_result` del CP, sin
priors.

**Lo que SÍ se puede inyectar** (contexto técnico operativo, no veredicto):

```
✅ app_behavior_excerpt: patrones de click React, selectores canónicos, waits
✅ test_gotchas_excerpt: precauciones operativas (logout+login patterns, SSL noise)
✅ credentials_for_default_role: user/pass resueltos desde credentials.yaml
✅ navigation_recipes_excerpt: cómo navegar a una pantalla específica
```

La diferencia: contexto **técnico universal** (aplica a cualquier CP del app) SÍ;
contexto **histórico específico** de un CP o veredicto esperado NO.

**Verificación durante el armado del prompt:** antes de enviar al sub-agente,
buscar en el prompt final cualquier match a estos patrones — abortar si aparece:
- `/CP-[A-Z0-9_]+-[0-9,]+/` (menciones de CPs específicos) en oraciones con
  `esperado`, `known_bug`, `@known`, `FAIL_BY_DESIGN`, `ya falla`, `ya pasa`,
  `flaky`, `history`, `previo`.

---

## RENDIMIENTO — Fast-Path (INVIOLABLE)

⛔ **NO usar `TodoWrite` en ningún punto del fast-path.** Las 6 llamadas de tracking
de progreso (`TodoWrite × 6`) generan ~10-15s de overhead total sin valor para el run.
En fast-path el progreso se comunica mediante banners de texto en el PASO 5 (resumen
final), no mediante actualizaciones de todo list. Esto aplica al orquestador (este
prompt) y NO afecta al sub-agente executor, que tampoco debe usar TodoWrite.

⛔ **NO hacer reads exploratorios** (`glob`, `ls`, `grep`) para encontrar archivos
cuyas rutas ya están definidas en `exec_context.json` o `session_context.json`. Toda
ruta necesaria está resuelta en el preflight (PASO 0). Leer un archivo no referenciado
en esas fuentes es ANTI-EXPLORACIÓN y desperdicia tool calls.

---

## PASO 0 — Preflight consolidado (1 bash call)

> **Consolidación:** lo que antes eran 5-6 bash calls separados (~100-180s de
> overhead LLM entre invocaciones) ahora es 1 bash call con ~1-2s real.

### 0.a — Ejecutar preflight

```bash
node .claude/tools/exec-preflight.js --run-id={run_id} --batch-size={N}
# Si --custom-tags no se pasa, el preflight lo lee de appweb.yaml → test_run.custom_tags
# {N} = fast_path.batch_size del appweb.yaml (default 10)
```

### 0.b — Qué hace internamente el preflight

En un solo proceso Node (sin overhead entre bash calls):

| Phase | Acción | Baseline (bash separado) |
|---|---|---|
| `cleanup_mcp` | Mata Chromium residuales del MCP. **Fast-path**: si no hay lockfile en ningún profile → exit <200ms sin invocar PowerShell CIM. | 18.2s (ETIMEDOUT) |
| `validate_prereqs` | Verifica `session_context.json` y `cp_modulo_{M}.json` existen. | 6.4s |
| `sync_tag_filter` | Escribe `active_tag_filter` al session_context (require directo, sin spawn). | 57.5s |
| `knowledge_excerpt` | Escribe `{run_folder}/.tmp/exec_context.json` con app_yaml_extract, credenciales, excerpts de knowledge. | incluido arriba |
| `plan_batches` | Ordena `cp_targets` por riesgo + módulo, devuelve `batches[]`. | 18.9s |
| `pre_resolve_cps` (Fix D) | Lee `cp_modulo_*.json`, extrae CPs completos (gherkin, expected_result, tags, etc.), los inyecta en `exec_context.cp_targets_resolved[]`. | NUEVO — evita 4 tool calls del sub-agente |
| `merge_context` | Persiste `exec_context.json` con CPs + batches. | implícito |

### 0.c — Output del preflight (JSON a stdout)

```json
{
  "ok": true,
  "total_ms": 1190,
  "phases": [ { "name": "...", "ok": true, "ms": 260 }, ... ],
  "batches": [ [ {"module_id","cp_id","risk_level"}, ... ] ],
  "total_batches": 1,
  "cp_targets_resolved_count": 2,
  "exec_context_path": "docs/testing/atf-web/{run_id}/.tmp/exec_context.json",
  "stats": { "total_cps": 2, "by_risk": {...}, "by_module": {...} },
  "warnings": []
}
```

Parsear el JSON. Si `ok: false` → DETENER mostrando la phase que falló
(`phases.find(p => !p.ok)`). Si `warnings[]` no vacío → mostrar pero continuar.

### 0.d — Validaciones críticas (fallan con exit 1)

El preflight aborta si:
- `run_id` no apunta a una carpeta existente.
- `session_context.json` falta.
- `cp_modulo_{module_id}.json` falta para algún módulo derivado de `custom_tags`.
- `custom_tags` no contiene ningún `@cp:CP-*`.

### 0.e — Log al usuario

```
📦 Plan: {total_cps} CPs en {total_batches} batches — {total_ms}ms preflight
   Risk: critical={X}, high={Y}, medium={Z}, low={W}
   Módulos: {unique module_ids}
   CPs resueltos inline: {cp_targets_resolved_count}
```

---

## PASO 1 — Bucle de batches (secuencial)

> **Contexto del bucle:** `batches[]`, `total_batches`, y `cp_targets_resolved[]`
> vienen del JSON del preflight (PASO 0). El exec_context.json en disco
> contiene TODO lo que el sub-agente necesita — el prompt del Agent tool solo
> pasa referencias.

> Un batch puede contener CPs de **múltiples módulos**; el executor los procesa
> secuencialmente. Cada CP es atómico: `browser_open` → ejecutar steps →
> `browser_close`. Sin reuso de sesión entre CPs.
>
> 🔒 **`subagent_type: general-purpose` (canónico).** La propagación de las
> tools `mcp__playwright__browser_*` al sub-agente NO depende del `subagent_type`
> — depende de que cada tool esté declarada por nombre exacto en
> `.claude/settings.json → permissions.allow` (las 22 tools granulares).
> Aliases de servidor (`mcp__playwright` sin subcomando) NO se expanden al
> filtrar el contexto del sub-agente. Si aparece regresión silenciosa, PASO 3.5
> la detecta vía mtime de `headless_results.json`.

### 1.1 — Bucle principal

Para cada `batch_i` (1-indexado) en `batches[]`:

1. **Verificación de bias determinística** antes de emitir el Agent tool:

```bash
PROMPT_TEXT="$(cat <<'ENDOFPROMPT'
{prompt_texto_completo_que_se_enviará}
ENDOFPROMPT
)"
node -e "
const t=process.argv[1];
const biasPatterns=[
  /CP-[A-Z0-9_]+-[0-9]+.*(?:esperado|known_bug|@known|FAIL_BY_DESIGN|ya falla|ya pasa|flaky|history|previo)/i,
  /(?:sabemos que|recordar que|anteriormente|en el run anterior).*CP-[A-Z0-9_]+-[0-9]+/i,
];
const hits=biasPatterns.filter(p=>p.test(t));
if(hits.length===0){process.stdout.write('BIAS_CLEAN');process.exit(0);}
process.stdout.write('BIAS_DETECTED:'+hits.length+' patrones encontrados');process.exit(1);
" "\$PROMPT_TEXT"
```
- Exit 0 `BIAS_CLEAN` → emitir Agent tool.
- Exit 1 `BIAS_DETECTED:{N}` → ⛔ limpiar el prompt eliminando las referencias de historial y re-verificar antes de emitir.

2. Emitir UN Agent tool call con el prompt **minimal** (≤25 líneas). Todos los
   excerpts y credenciales ya están en `.tmp/exec_context.json` — el sub-agente
   los lee en PASO 0 del spec.

```
[AGENT TOOL]
subagent_type: general-purpose
run_in_background: false
description: "Executor batch {i}/{total_batches}"
prompt: |
  Eres una instancia del Executor Team del ATF.

  ORDEN DE LECTURA OBLIGATORIO (secuencial — no paralelizar):
    1) docs/testing/atf-web/{run_id}/.tmp/exec_context.json  — leer PRIMERO y extraer TODAS las variables
       al runtime ({app_name}, {app_url}, {evidence_mode}, {credentials_for_default_role},
       {navigation_learning_enabled}, {cp_targets_resolved[]}, {mfa_type}, {session_state_file},
       {db_config}, etc.) ANTES de continuar.
    2) {project-root}/.claude/atf-web-steps/execute.md  — spec del executor
    3) .claude/reference/atf-web/sofka-asdd-atf-web-executor-invariants.md  — reglas duras (REGLAS 1–8)

  Parámetros del batch:
    session_context_path: docs/testing/atf-web/{run_id}/session_context.json
    run_folder:           docs/testing/atf-web/{run_id}/
    batch_id:             {i}
    total_batches:        {total_batches}
    cp_targets:           {JSON array con {module_id, cp_id, risk_level}}

  Ver PROHIBICIONES de /sofka-asdd:qa-web-exec.md (cero sesgo por historia).

  Outputs obligatorios al finalizar:
    execution/{module_id}/{slug}/result.json        (por cada CP ejecutado)
    execution/{module_id}/module_result.json        (por cada module_id distinto)
    execution/{module_id}/headless_results.json
```

**Log por batch al iniciar:**
```
🚀 [EXEC FAST-PATH] Batch {i}/{total_batches} — {N} CPs
   Módulos afectados: {unique module_ids}
   Risk mix: critical={X}, high={Y}, medium={Z}, low={W}
```

**Log por batch al finalizar:**
```
✅ Batch {i}/{total_batches} completado — {passed}/{executed} PASS ({duration_sec}s)
   Módulos actualizados: {modules_updated}
```

**Esperar completación del batch antes de invocar el siguiente** (secuencial
— MCP browser es singleton). Tras el retorno del Agent del batch N, `/sofka-asdd:qa-web-exec`
puede disparar `generate-report.js --evidence-only` en background y arrancar
el batch N+1 inmediatamente. Ver PASO 4.a.

---

## PASO 3.5 — Post-return verification (red de seguridad anti-falla-silenciosa)

> **Por qué existe este paso:** un executor de tipo `general-purpose` sin tools `browser_*`
> heredadas puede completar PASO 0.5 (puramente FS) y retornar sin ejecutar R2.
> Sin este check, `/sofka-asdd:qa-web-exec` avanzaría a PASO 4 regenerando `evidence.html` con los
> artefactos viejos — silenciando la falla. Este paso detecta ese patrón y lo
> reporta al QA como blocker explícito.

Tras retornar CADA invocación del executor (cada batch), realizar las verificaciones
**antes** de pasar al siguiente batch o a PASO 4.

### 3.5.a — Registrar timestamps pre-invocación

Antes de emitir el `[AGENT TOOL]` del batch `i`, capturar **3 tipos de timestamp**
que usarán los 4 checks post-retorno:

1. **`pre_exec_batch_started_at_ms`**: `Date.now()` — timestamp fijo antes de emitir el sub-agente. Usado por Check 4 (ghost aggregation).
2. **`pre_exec_mtime_{module_id}`**: por cada `module_id` distinto, mtime de `{run_folder}/execution/{module_id}/headless_results.json` (0 si no existe). Usado por Check 2.
3. **`pre_exec_result_mtime_{cp_id}`**: por cada CP en `cp_targets`, mtime de `{run_folder}/execution/{module_id}/{slug}/result.json` (0 si no existe). Usado por Check 4.

```bash
MSYS_NO_PATHCONV=1 node -e "
const fs=require('fs');
const path=require('path');
const {cpIdToFolder}=require('./.claude/tools/lib/cp-slug.js');
const runId='{run_id}';
const cpTargets=<JSON cp_targets del batch>;
const out={
  pre_exec_batch_started_at_ms: Date.now(),
  headless_mtimes: {},
  result_mtimes: {}
};
const modules=[...new Set(cpTargets.map(t=>t.module_id))];
for(const m of modules){
  const p=path.join('output',runId,'execution',m,'headless_results.json');
  try{out.headless_mtimes[m]=fs.statSync(p).mtimeMs;}catch(e){out.headless_mtimes[m]=0;}
}
for(const t of cpTargets){
  const slug=cpIdToFolder(t.cp_id);
  const p=path.join('output',runId,'execution',t.module_id,slug,'result.json');
  try{out.result_mtimes[t.cp_id]=fs.statSync(p).mtimeMs;}catch(e){out.result_mtimes[t.cp_id]=0;}
}
console.log(JSON.stringify(out));
"
```

Guardar el JSON retornado en memoria del orquestador para usarlo en los 4 checks post-retorno.

### 3.5.b — Verificaciones post-retorno del batch

**Check 1 — `execution_blocked.json` nuevo (cualquier módulo afectado):**
```bash
MSYS_NO_PATHCONV=1 node -e "const fs=require('fs');const p='docs/testing/atf-web/{run_id}/execution/{module_id}/execution_blocked.json';try{const s=fs.statSync(p);console.log(JSON.stringify({exists:true,mtimeMs:s.mtimeMs}));}catch(e){console.log(JSON.stringify({exists:false}));}"
```
Si para **cualquier** `module_id` del batch `exists:true` **y** `mtimeMs > pre_exec_mtime_{module_id}`:
```
🚫 BATCH {i} BLOQUEADO — módulo {module_id}
   Razón: {execution_blocked.reason}
   Acción requerida: {execution_blocked.action_required}
   Fases no ejecutadas: {execution_blocked.phases_not_executed}
```
**DETENER `/sofka-asdd:qa-web-exec` por completo.** No avanzar a siguiente batch ni a PASO 4.

**Check 2 — `headless_results.json` actualizado:**
```bash
MSYS_NO_PATHCONV=1 node -e "const fs=require('fs');const p='docs/testing/atf-web/{run_id}/execution/{module_id}/headless_results.json';try{const s=fs.statSync(p);const j=JSON.parse(fs.readFileSync(p,'utf8'));const cps=(j.results||j.scenarios||j.cps||[]).length;console.log(JSON.stringify({exists:true,mtimeMs:s.mtimeMs,cp_count:cps}));}catch(e){console.log(JSON.stringify({exists:false,error:e.message}));}"
```
Si `exists:false` **o** `mtimeMs === pre_exec_mtime` (archivo no tocado por el
sub-agente) **o** `cp_count === 0`:

Escribir `{output_dir}/post_execution_audit.json`:
```json
{
  "module_id": "{module_id}",
  "run_id": "{run_id}",
  "audited_at": "{ISO 8601}",
  "reason": "sub_agent_returned_without_r2_evidence",
  "detail": "El sub-agente completó sin escribir execution_blocked.json pero tampoco actualizó headless_results.json. Indica posible falla silenciosa en R2 (sub-agente sin tools browser_* heredadas, o aborto antes de PASO 0.6 del executor).",
  "pre_exec_mtime_ms": {pre_exec_mtime},
  "post_exec_mtime_ms": {post_exec_mtime_or_null},
  "headless_cp_count": {cp_count_or_null},
  "custom_tags": {m.cp_tags},
  "suggestion_next_action": "Re-invocar con subagent_type='Executor Team' (registry declara browser tool) o migrar /sofka-asdd:qa-web-exec a ejecución inline en contexto primario. Revisar que el spec del executor incluya PASO 0.6 (probe post-cleanup)."
}
```

Mostrar al QA:
```
⚠️  FALLA SILENCIOSA DETECTADA en módulo {module_id}
    El sub-agente retornó sin evidencia nueva y sin blocker explícito.
    post_execution_audit.json escrito en {output_dir}/.
    Esto suele indicar que las tools browser_* no llegaron al sub-agente.
```
**DETENER `/sofka-asdd:qa-web-exec`.** No avanzar a PASO 4 (regenerar evidencia con resultados
obsoletos corromperá el reporte). Esperar intervención humana.

**Check 3 — `module_result.json` presente para cada módulo del batch:**

Para cada `module_id` distinto presente en `cp_targets` del batch, si Check 1 y Check 2
pasan pero `{run_folder}/execution/{module_id}/module_result.json` no existe
(o su mtime < timestamp de inicio del batch), reportar warning pero continuar:
```
⚠️  module_result.json no escrito para {module_id} — PASO 4 usará result.json por CP
```

Esto sugiere que `aggregate-batch-results.js` no fue invocado por el executor.
`generate-report.js` en PASO 4.5 reconstruirá `results[]` desde los `result.json`
individuales, así que no es blocker.

**Check 4 — Ghost aggregation:**

Detecta el patrón específico del incidente donde un batch abortó en PASO 2
(MFA) pero `module_result.json` fue re-escrito (aggregator corrió) sobre `result.json`
stale, produciendo un PASS fantasma que no fue ejecutado en este batch.

Para cada `module_id` del batch, para cada CP en `cp_targets`:

```bash
MSYS_NO_PATHCONV=1 node -e "
const fs=require('fs');
const path=require('path');
const {cpIdToFolder}=require('./.claude/tools/lib/cp-slug.js');
const runId='{run_id}';
const cpTargets=<JSON cp_targets>;
const preExecMtime={pre_exec_batch_started_at_ms};  // timestamp capturado pre-batch
const ghosts=[];
for(const t of cpTargets){
  const slug=cpIdToFolder(t.cp_id);
  const resultPath=path.join('output',runId,'execution',t.module_id,slug,'result.json');
  const modulePath=path.join('output',runId,'execution',t.module_id,'module_result.json');
  let resultMtime=0,moduleMtime=0;
  try{resultMtime=fs.statSync(resultPath).mtimeMs;}catch(e){}
  try{moduleMtime=fs.statSync(modulePath).mtimeMs;}catch(e){}
  // Ghost pattern: result.json stale (mtime < pre_exec) pero module_result.json actualizado
  if(resultMtime>0 && resultMtime<preExecMtime && moduleMtime>preExecMtime){
    // Verificar que la entrada en module_result NO es synthetic_blocked_entry
    let isSyntheticBlocked=false;
    try{
      const mr=JSON.parse(fs.readFileSync(modulePath,'utf8'));
      const entry=(mr.results||[]).find(r=>r.cp_id===t.cp_id);
      isSyntheticBlocked=!!(entry && entry.synthetic_blocked_entry);
    }catch(e){}
    if(!isSyntheticBlocked){
      ghosts.push({cp_id:t.cp_id,module_id:t.module_id,result_mtime:resultMtime,module_mtime:moduleMtime});
    }
  }
}
console.log(JSON.stringify({ghosts}));
"
```

Si `ghosts.length > 0`:

Escribir `{run_folder}/post_execution_audit.json`:
```json
{
  "run_id": "{run_id}",
  "audited_at": "{ISO 8601}",
  "reason": "ghost_aggregation_detected",
  "detail": "Aggregator actualizó module_result.json con entries de CPs cuyos result.json son stale del pre_exec_mtime. Esto indica que el batch abortó sin escribir result.json fresco y el aggregator preservó el resultado del run previo (PASS/FAIL fantasma). Violación latente de REGLA 6.",
  "ghosts": [/* array del check */],
  "pre_exec_mtime_ms": {pre_exec_mtime},
  "suggestion_next_action": "Re-ejecutar los CPs afectados con attempted_cp_ids explícito en aggregate-batch-results. Verificar que el executor escriba result.json BLOCKED en abort."
}
```

Mostrar al QA:
```
🚨 GHOST AGGREGATION DETECTADA — {N} CP(s) afectado(s)
   {cp_id}: result.json stale ({result_mtime_iso}) pero module_result.json actualizado ({module_mtime_iso})
   post_execution_audit.json escrito con reason=ghost_aggregation_detected.
   NO avanzar a PASO 4 — los reportes mostrarían veredictos fantasma.
```

**DETENER `/sofka-asdd:qa-web-exec`.** No avanzar a PASO 4 (regenerar evidencia con ghost = publicar falso positivo).

### 3.5.c — Si todos los checks pasan

Log por batch:
```
✅ Batch {i}/{total_batches} — {cp_count} CPs en headless_results verificados
   Módulos actualizados: {modules_updated}
   Batch {i} browser closed at: {signal.timestamp}
```
Avanzar al siguiente batch o a PASO 4.

---

## PASO 4 — Regenerar `evidence.html` automáticamente (scope quirúrgico)

Una vez completados todos los batches, regenerar `evidence.html` **solo** para los
CPs que efectivamente se ejecutaron en este fast-path. Este paso es quirúrgico —
el costo típico es 100–700 ms. La regeneración del `report.html` global y el
`runs_index.json` ocurre en el PASO 4.5 inmediatamente después.

**Optimización de paralelismo:** este PASO 4 se puede disparar
**por cada batch** en background (`run_in_background: true` del `Bash` tool)
inmediatamente tras el retorno del Agent del batch i. El batch i+1 arranca
mientras `generate-report.js --evidence-only` del batch i todavía renderiza.
Ahorro por batch intermedio: ~15–45 s.

### 4.a — Regen por batch (durante el bucle del PASO 3.4)

Inmediatamente después del retorno del Agent del batch `i` (verificaciones
3.5.b ya pasadas), antes de lanzar el batch `i+1`, disparar en background:

```bash
node .claude/dashboard/generate-report.js {run_id} \
  --evidence-only \
  --cp-ids='<JSON array de cp_ids del batch i>'
```

Usar `run_in_background: true` en el Bash tool call. El PID queda registrado;
no bloquear el flujo esperándolo. El batch `i+1` arranca inmediatamente.

Ejemplo:
```bash
node .claude/dashboard/generate-report.js MiApp-v1.0-20260101-0900 \
  --evidence-only \
  --cp-ids='["CP-auth-010"]'
```

El script:
- convierte cada CP-ID a su slug via `cpIdToFolder` (p.ej. `CP-Matriz_1-12,01,1` → `12_01_1`)
- sobreescribe `execution/{module_id}/{slug}/evidence.html` con el `result.json` actual

### 4.b — Regen final tras último batch

Tras el último batch del run, **esperar que todas las regeneraciones en
background terminen** antes de avanzar a PASO 4.5 (para evitar race con
`generate-report.js` full).

Si cualquiera de las regeneraciones intermedias terminó con exit ≠ 0, reportar
pero no detener — PASO 4.5 regenera el set completo desde cero y corrige.

---

## PASO 4.5 — Regenerar `report.html` global y `runs_index.json`

Tras regenerar las evidencias por CP, refrescar el reporte global y el índice de runs
para que reflejen el resultado de esta re-ejecución. Costo típico: ~2–5s según tamaño
del run.

```bash
node .claude/dashboard/generate-report.js {run_id}
node .claude/dashboard/generate-index.js
```

Si cualquiera de los dos comandos termina con exit ≠ 0 → reportar el error pero no
detener (la ejecución de los CPs y la evidencia por CP ya se completaron; la
regeneración de reportes globales es un efecto secundario).

---

## PASO 4.6 — Actualizar `knowledge/` (UNA sola vez, post-run)

> **Responsabilidad del orquestador, no del executor.** El executor
> solo produce artefactos de evidencia. El knowledge lifecycle
> (cp_registry.execution_history, module_verdicts, nav_map merge) se aplica aquí,
> consolidado por run completo. Beneficia a agentes futuros (design-team,
> strategist, próximos executors) sin sobrecargar al executor actual.

**FIX #11:** invocación **directa via bash** al script `.claude/tools/knowledge-updater.js` — NO sub-agent.
Razón: el sub-agent anterior pagaba ~30-40s de overhead (spawn + lectura de `cp_registry.json`
que puede superar el límite de Read). El script ejecuta las 3 partes (module_verdicts + cp_registry
execution_history + cp_index) en ~2-5s con I/O directo. El skill `.claude/skills/sofka-asdd-atf-web-knowledge-updater/`
sigue existiendo como documentación de referencia — pero NO se invoca desde `/sofka-asdd:qa-web-exec`.

> ⚡ **invocación batch única (recomendada para runs cross-módulo):** invocar el script UNA SOLA VEZ con `--modules-json` que enumera los N módulos a actualizar. El script lee `module_verdicts.json`, `cp_registry.json`, `cp_index.json` UNA vez al inicio, aplica los cambios de TODOS los módulos in-memory, y los escribe UNA vez al final. Esto evita race conditions (que prohíben paralelizar invocaciones single-module) y reduce ~40-60 s en runs de 3+ módulos (1 spawn vs N).

Construir `--modules-json` con un objeto por cada `module_id` único en `cp_targets`:

```bash
# Ejemplo cross-módulo (admin-organization, email-config, job-titles):
MSYS_NO_PATHCONV=1 node .claude/tools/knowledge-updater.js \
  --mode      full \
  --app-name  "{app_name}" \
  --run-id    "{run_id}" \
  --modules-json '[
    {"module_id":"admin-organization","module_result":"docs/testing/atf-web/{run_id}/execution/admin-organization/module_result.json","headless_results":"docs/testing/atf-web/{run_id}/execution/admin-organization/headless_results.json"},
    {"module_id":"email-config","module_result":"docs/testing/atf-web/{run_id}/execution/email-config/module_result.json","headless_results":"docs/testing/atf-web/{run_id}/execution/email-config/headless_results.json"},
    {"module_id":"job-titles","module_result":"docs/testing/atf-web/{run_id}/execution/job-titles/module_result.json","headless_results":"docs/testing/atf-web/{run_id}/execution/job-titles/headless_results.json"}
  ]'
```

Si solo hay 1 módulo, usar la forma legacy (sin `--modules-json`):

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/knowledge-updater.js \
  --mode             full \
  --app-name         "{app_name}" \
  --module-id        "{module_id}" \
  --run-id           "{run_id}" \
  --module-result    "docs/testing/atf-web/{run_id}/execution/{module_id}/module_result.json" \
  --headless-results "docs/testing/atf-web/{run_id}/execution/{module_id}/headless_results.json"
```

Exit 0 → OK (imprime JSON con `verdicts_updated/cp_registry_updated/indices_updated/modules_processed`).
Exit 1 → error fatal → reportar pero continuar (knowledge update no es blocker del run).

Si `nav_learning.enabled` en `session_context` y existe
`{run_folder}/.tmp/nav_session_{batch_id}.json`:

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/nav-learning.js merge \
  --session      {run_folder}/.tmp/nav_session_*.json \
  --nav-map      .claude/agent-memory/{app_name}/navigation_map.json \
  --output       .claude/agent-memory/{app_name}/navigation_map.json \
  --run-id       {run_id}
```

> **Costo:** ~2-5 s por módulo. Se ejecuta fuera del camino crítico del run. El
> beneficio (knowledge actualizado para runs futuros) supera el costo marginal.

---

## PASO 4.6.5 — Nav-learning backfill (red de seguridad post-CP)

> **Por qué existe este paso:** el sub-agent puede bypasear la doctrina
> obligatoria de `nav-learning lookup/record` creando IDs ad-hoc `#__atf_*`
> via `browser_evaluate` para targetear elementos sin pasar por nav-learning.
> Resultado: navigation_map.json inerte aunque los clicks/types funcionaron.
>
> **Qué hace:** escanea cada `result.json` recién escrito, filtra
> interactions con selectores ad-hoc (`/^#__atf_/`) y selectores no-
> persistibles, y sintetiza `nav-learning record` retroactivos para los
> selectores reales (e.g. `input[name='username']`, `[data-test='X']`).
> Las discoveries quedan en la session file y son consumidas por PASO 4.7.a.

> ⚡ **Script atómico INVIOLABLE.** Esta lógica se delega a `run-backfill.js`
> (no se inlinea como bash multilínea con `for` loops). Los escapes Windows/MSYS
> en bloques inline son frágiles y el orquestador puede saltarlos
> intermitentemente — el script atómico evita ese vector.

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/run-backfill.js \
  --run-folder=docs/testing/atf-web/{run_id} --run-id={run_id}
```

**El script:**
1. Detecta todos los `nav_session_*.json` en `{run_folder}/.tmp/`.
2. Por cada session, deriva `module_id` y itera CPs en `headless_results.json`.
3. Por cada CP con `result.json` (status PASS/FAIL), invoca `nav-learning-backfill.js`.
4. Acumula logs en `{run_folder}/.tmp/nav_backfill.log`.
5. Devuelve JSON consolidado a stdout: `{ ok, sessions_processed, cps_processed, total_backfilled, total_skipped, log_file, warnings }`.

**Costo:** ~200-500 ms por CP. Idempotente — si el sub-agent ya hizo `record` runtime,
el upsert solo incrementa `confidence`.

**Skip silencioso:** sin session file (nav_learning disabled) → exit 0 con `sessions_processed: 0`.

---

## PASO 4.7 — Nav-learning merge (siempre) + reconcile (opcional)

> Sin este paso, los selectores **descubiertos** durante el batch quedarían
> solo en `{run_folder}/.tmp/nav_session_*.json` sin llegar al `navigation_map.json`
> global → el próximo `/sofka-asdd:qa-web-exec` los buscaría como MISS de nuevo. `reconcile`
> (más costoso — purga stale, exporta recetas) se ejecuta solo via `/sofka-asdd:qa-web-run` o con
> flag explícito aquí.

### 4.7.a — Merge (siempre, bajo costo)

> ⚡ **Glob amplio (INVIOLABLE):** usar `nav_session_*.json` en una SOLA invocación al merge (no per-módulo). El executor escribe nombres tipo `nav_session_batch{batch_id}.json` (naming por batch) y otros patrones legacy; un glob estrecho como `nav_session_{module_id}*.json` no los captura, dejando knowledge sin persistir. El script `nav-learning.js merge` soporta multi-sesión por glob — agrega discoveries y stats acumuladas internamente.

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/nav-learning.js merge \
  --session "{run_folder}/.tmp/nav_session_*.json" \
  --nav-map ".claude/agent-memory/{app_name}/navigation_map.json" \
  --output ".claude/agent-memory/{app_name}/navigation_map.json" \
  --stats-output "{run_folder}/execution/nav_stats_run.json" \
  --run-id {run_id}
```

- **Glob `nav_session_*.json`** captura: `nav_session_batch1.json`, `nav_session_{module_id}.json`, `nav_session_{module_id}_b1.json`, `nav_session_auth.json` (legacy huérfanas). Todo en 1 sola invocación.
- Si no existe ninguna sesión matching → merge omitido sin error.
- Costo: ~100-300 ms total.
- Beneficio: el próximo `/sofka-asdd:qa-web-exec` encuentra HIT donde este run descubrió.
- `--stats-output` ahora va a `execution/nav_stats_run.json` (cobertura del run, no per-módulo) ya que mergeamos todas las sesiones juntas.

> ⚡ **Paralelizar PASO 4.6 + 4.7.a:** el knowledge-updater (batch único) y el `nav-learning merge` consolidado escriben a archivos disjuntos. Patrón seguro — ambos en paralelo en una sola invocación cada uno (sin loop per-módulo):
>
> ```bash
> ( node .claude/tools/knowledge-updater.js --mode full --app-name {app_name} \
>     --run-id {run_id} --modules-json '{modules_json_array}' > /tmp/_ku.out 2>&1 ) &
> ( node .claude/tools/nav-learning.js merge \
>     --session "{run_folder}/.tmp/nav_session_*.json" \
>     --nav-map ".claude/agent-memory/{app_name}/navigation_map.json" \
>     --output ".claude/agent-memory/{app_name}/navigation_map.json" \
>     --stats-output "{run_folder}/execution/nav_stats_run.json" \
>     --run-id {run_id} > /tmp/_nav.out 2>&1 ) &
> wait
> ```
>
> Ahorro estimado: ~3-5 s vs N invocaciones secuenciales.

### 4.7.b — Reconcile (opcional — solo con flag)

Solo si `appweb.yaml → test_run.exec_reconcile: true` o env var `ATF_EXEC_RECONCILE=1`:

```bash
node .claude/tools/nav-learning.js reconcile \
  --run-folder {run_folder} \
  --module-id {module_id} \
  --nav-map .claude/agent-memory/{app_name}/navigation_map.json \
  --output .claude/agent-memory/{app_name}/navigation_map.json \
  --stats-output {run_folder}/execution/{module_id}/nav_stats_{module_id}.json \
  --run-id {run_id} \
  --min-confidence {min_confidence} \
  --max-alternatives {max_alt} \
  --stale-purge-after-runs {stale_purge}
```

Costo: ~1-3 s por módulo. Ejecuta: ajuste de confidence, purga stale, export de
recetas a `navigation-recipes.md`. **Default: off** — para runs puntuales no vale
la pena. Para runs completos usar `/sofka-asdd:qa-web-run` que siempre lo ejecuta en CONSOLIDACIÓN FINAL.

### 4.7.c — Si nav_learning está disabled

Si `session_context.navigation_learning.enabled === false` → skipear PASO 4.7 completo.

### 4.7.d — Health check post-run

> ⚡ **Detector de degradación silenciosa (no blocker):** tras el merge de PASO 4.7.a,
> ejecutar el health check para que el QA evidencie cuándo el feature `navigation_learning`
> está activo pero inerte (0 lookups + sin abort). Casos cubiertos:
> - **`ok`**: hubo lookups o discoveries → feature funcionó.
> - **`blocked`**: `execution_blocked.json` presente y 0 lookups → abort esperado.
> - **`inert`**: enabled=true, 0 lookups, NO hay abort → degradación silenciosa, **warning al QA**.
> - **`feature_off`**: enabled=false → sin alerta (decisión explícita).

```bash
node .claude/tools/check-nav-learning-health.js --run-id={run_id}
```

Exit codes: 0 (ok/blocked/feature_off/no_run, sin acción) | 2 (`inert` — warning visible). NO bloquea el run.

### Detector de anomalías de ejecución

> Red de seguridad post-batch que escanea `result.json` de cada CP y detecta
> patrones que el watchdog doctrinal del executor pudo no capturar: duración
> > 8 min/CP (probable hung tool call), ≥50% steps NOT_EXECUTED en CPs no
> marcados BLOCKED, evidencia ausente en CPs PASS/FAIL.

```bash
node .claude/tools/detect-anomalies.js --run-id={run_id} --max-cp-minutes=8
```

- Exit 0 siempre (no bloquea). Si encuentra anomalías escribe
  `{run_folder}/post_execution_audit.json` con `reason: execution_anomalies_detected`
  y la lista accionable. Mostrar al QA en banner final si `anomaly_count > 0`:
  ```
  ⚠️  Detectadas {N} anomalía(s) de ejecución — revisar post_execution_audit.json
  ```

### Validador hint-coverage

> Verifica que el sub-agent use los `selector_hints[]` que el preflight inyectó
> en `cp_targets_resolved[].selector_hints`. El lookup runtime no es obligatorio:
> la métrica relevante mide la utilización efectiva de los hints inyectados:
>
>     ratio = hints_used / hints_inyectados
>
> Detecta dos patrones: (a) sub-agent ignora hints válidos y descubre por
> snapshot innecesariamente, (b) hints stale del nav_map que no resuelven en
> runtime y obligan a re-descubrir.

```bash
node .claude/tools/check-hint-coverage.js --run-id={run_id} --threshold=0.7 \
  --output=docs/testing/atf-web/{run_id}/hint_coverage_audit.json
```

- Exit 0 siempre (no bloquea). Si `violations.length > 0`, mostrar al QA:
  ```
  ⚠️  {N} CP(s) con hint-coverage ratio < 0.7 — revisar hint_coverage_audit.json
     (sub-agent ignoró hints válidos o nav_map tiene selectores stale)
  ```
- CPs sin hints inyectados (preflight no encontró HITs en nav_map) → `ratio: null`,
  no se cuentan como violación.
- Threshold default 0.7 (al menos 70% de hints aprovechados).

Tras completar todos los batches, mostrar el resumen:

```
═══════════════════════════════════════════════════════════════════
✅ FAST-PATH COMPLETADO — {run_id}
═══════════════════════════════════════════════════════════════════
Batches ejecutados    : {total_batches}
CPs objetivo          : {total_cps}
Módulos afectados     : {unique module_ids}
Ruta de resultados    : docs/testing/atf-web/{run_id}/execution/

Por módulo afectado:
  {module_id}: docs/testing/atf-web/{run_id}/execution/{module_id}/module_result.json
  ...                                              {passed}/{executed} · veredicto: {verdict}

Reset de artefactos   : cada carpeta {slug}/ se sobreescribe en cada run.
                         Historial de ejecuciones vive en cp_registry.execution_history y ALM.
Evidencias por CP     : ✅ evidence.html regenerado quirúrgicamente (solo los ejecutados)
Reporte global        : ✅ report.html regenerado (PASO 4.5)
Índice de runs        : ✅ runs_index.json + runs_index.html regenerados (PASO 4.5)

Nav-learning merge    : ✅ ejecutado (PASO 4.7.a) — selectores descubiertos consolidados a navigation_map global
Nav-learning reconcile: {✅ ejecutado si test_run.exec_reconcile=true | ⏭️  skipped (default)}

NO se ejecutó si skipped: purga stale, export de recetas. Para eso usar @.claude/commands/sofka-asdd/qa-web-run.md (CONSOLIDACIÓN FINAL).

Revisar evidencias:
  • docs/testing/atf-web/{run_id}/execution/{module}/{slug}/evidence.html
    (los CPs FAIL incluyen la sección ALM copiable renderizada desde result.json → bug_candidate;
     no hay archivos BUG-*.md separados desde el refactor
═══════════════════════════════════════════════════════════════════
```

---

## PASO 6 — Cleanup garantizado del browser MCP (post-run, INVIOLABLE)

> **Por qué existe:** el executor invoca `browser_close()` en su PASO 3.C de cada CP,
> pero el browser_close del MCP **no garantiza** que el proceso `chrome.exe` muera a
> nivel OS. Si el MCP queda atascado o el sub-agente abortó tras un error inesperado,
> chrome.exe queda huérfano consumiendo RAM. Run del dejó 10+ chrome.exe
> orphaned. El script `cleanup-mcp-browser.js` mata por filtro `mcp-chromium` en cmdline
> (no toca el navegador personal del usuario) y borra lockfiles del profile dir.
>
> **Costo en happy path:** 5-100 ms gracias al fast-path interno del script (skip si
> no hay lockfile en ningún profile MCP). En peor caso (residuales reales) hasta 18 s
> en Windows por la enum CIM. Beneficio: garantizar handoff limpio al próximo run.

```bash
node .claude/tools/cleanup-mcp-browser.js --quiet
```

Exit 0 siempre (incluso si mata 0 procesos). NO bloquear el flujo si retorna error —
reportar warning y terminar.

---

**FIN.** No hay CONSOLIDACIÓN FINAL en este prompt.

---

## TRADE-OFFS vs `agent_run.prompt.md`

| Aspecto | `agent_exec` (este) | `agent_run` |
|---|---|---|
| Setup (PASOs 0.x del orquestador) | Saltado | ~15 sub-pasos |
| Validación mínima | 5 checks sobre appweb.yaml + session_context | validate-session.js completo |
| Regen `report.html` global | ✅ **Automática** (PASO 4.5, ~2–5 s) | Automática en cada fase + CONSOLIDACIÓN FINAL |
| Regen `evidence.html` por CP | ✅ **Automática (quirúrgica)** — solo los CPs ejecutados, ~100–700 ms | Automática (todos los CPs del run) |
| Actualización `runs_index` | ✅ **Automática** (PASO 4.5) | Automática |
| Checkpoint | No escribe | Sí — `generate-checkpoint.js` por fase |
| CONSOLIDACIÓN FINAL (nav-learning + index) | No ejecuta | Sí |
| Paralelismo multi-módulo | Secuencial (seguro para browser MCP) | Secuencial en 2C; paralelo en 1C |
| Nav-learning reconcile cross-módulo | No hace | Sí al final |
| **Historial de re-ejecuciones** | Carpeta `{slug}/` se sobreescribe; historial vive en `cp_registry.execution_history` + ALM | Idem |
| **Wall-clock de setup** | **~1–3 s** | **~10–15 s** |

Úsalo cuando ya tienes un run validado y solo necesitas iterar sobre CPs puntuales.
