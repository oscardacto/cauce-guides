---
description: ATF Web fase Diseño — el Design Team produce los casos E2E por módulo desde la estrategia y la cobertura de pantallas.
mode: 'agent'
---

Ejecuta el Design Team de forma independiente para generar
`cp_modulo_{module_id}.json` por cada módulo solicitado. Usa `strategy/execution_plan.json`
si existe (modo `full`), `diagnostics/base_pruebas.md` si está (modo `partial`), o
degrada a leer directamente `docs/testing/atf-web/requirements/hu-bajo-prueba/` (modo `hu-direct`).

Uso:
  /sofka-asdd:qa-web-design --module {module_id} [--run-id {run_id}]
  /sofka-asdd:qa-web-design [--run-id {run_id}]    ← multi-módulo: requiere execution_plan.json

Ejemplos:
  /sofka-asdd:qa-web-design --module M1
  /sofka-asdd:qa-web-design --module M1 --run-id MiApp-v1.0-20260101-0900
  /sofka-asdd:qa-web-design --module Matriz_1 --run-id MiApp-v1.0-20260101-0900
  /sofka-asdd:qa-web-design --run-id MiApp-v1.0-20260101-0900    ← diseña todos los módulos del plan

Parámetros:
- --module: ID de un módulo específico a diseñar. Obligatorio si no hay
  `execution_plan.json`. Opcional si el plan lista los módulos.
- --run-id: ID de un run existente. Si se omite, se crea uno nuevo.

---

## PASO 1 — Validar entrada y resolver modo

1. Si `--module` se pasó:
   - Validar formato `^[A-Za-z0-9_-]+$` (ej: `M1`, `Matriz_1`, `auth`, `job-titles`, `email-config`). El strategist genera `module_id` con guiones derivados del nombre del módulo — el validador los acepta.
   - Modo: `single-module`.

2. Si NO se pasó `--module`:
   - `--run-id` debe existir y tener `docs/testing/atf-web/{run_id}/strategy/execution_plan.json`.
   - Si no existe → ERROR: "Sin --module y sin execution_plan.json no puedo
     determinar qué diseñar. Ejecuta /sofka-asdd:qa-web-strategize primero O pasa --module {id}
     explícitamente".
   - Modo: `multi-module`.

3. Verificar que existe ≥1 HU en `docs/testing/atf-web/requirements/hu-bajo-prueba/` (fuente primaria
   del Input Resolution Ladder del design-team).
   Si vacío → ERROR: "docs/testing/atf-web/requirements/hu-bajo-prueba/ vacío".

---

## PASO 2 — Resolver run_id

Cascada (PRIMERA fuente que aplique gana):

1. **CLI `--run-id`** → reusar/crear con `node .claude/tools/session-context.js init-minimal {run_id}`.
2. **`appweb.yaml.run_id`** (campo raíz no vacío) → si `docs/testing/atf-web/{run_id}/session_context.json` existe, reusar; si no, `init-minimal`.
3. **Timestamp nuevo** → construir `run_id = {AppName}-v{version}-{YYYYMMDD}-{HHMM}` y ejecutar `session-context.js init-minimal`.

Mostrar: `🔧 run_id: {run_id} (fuente: cli|appweb.yaml|timestamp_nuevo)`.

> **Por qué leemos `appweb.yaml.run_id`:** los comandos standalone honran este campo igual que el orchestrator. Sin esa lectura, lanzar `/sofka-asdd:qa-web-design` (sin args) crearía un `run_id` nuevo ignorando el run activo declarado en `appweb.yaml`.

---

## PASO 3 — Resolver `design_mode` por cascada

Para cada módulo a diseñar:
1. `{diagnostics_dir}/base_pruebas_modulo_{M}.md` + `{strategy_dir}/execution_plan_modulo_{M}.json` → `full` (slices).
2. `{diagnostics_dir}/base_pruebas.md` + `{strategy_dir}/execution_plan.json` → `full` (filtrando módulo).
3. `{diagnostics_dir}/base_pruebas.md` (sin execution_plan) → `partial`.
4. Ninguno de los anteriores → `hu-direct` (lee `functional_docs_folder`).

Mostrar al QA antes de invocar:
```
🔧 run_id: {run_id} | módulos a diseñar: {list} | design_mode: {mode por módulo}
```

---

## PASO 3.5 — Pre-check del módulo

Antes de invocar al agente, pre-resolver TODO el contexto que el design-team necesita: knowledge_excerpts (app_behavior + test_gotchas), subset del execution_plan filtrado al módulo, subset del risk_matrix, subset del base_pruebas filtrado a las HUs del módulo. Anti-self-read del agente → menos Reads durante inferencia → menos wall-clock.

```bash
node .claude/tools/design-precheck.js --run-id {run_id} --module {M}
```

Output: `docs/testing/atf-web/{run_id}/.tmp/design_precheck.json`. El path se inyecta al agente vía `precheck_path` en el contexto del PASO 4.

Si falla (run sin session_context, o knowledge inexistente) → loguear stderr y continuar; el agente caerá a Reads tradicionales.

---

## PASO 4 — Invocar design-team **POR HU EN PARALELO**

> **Doctrina:** el comando NO invoca al agente para diseñar el módulo entero de una vez. En su lugar, **procesa HU por HU**. El agente saturaría `max_tokens` del LLM al emitir varias HUs juntas, provocando Write failed + retry con cobertura recortada. Modo `single_hu` da presupuesto cómodo por HU.

> **Paralelismo:** las invocaciones del agente para HUs distintas son INDEPENDIENTES (escriben fragments distintos en `.tmp/design_fragments/cp_modulo_{M}__hu_{hu_id}.json`). Por tanto **DEBEN lanzarse en UN SOLO MENSAJE de Agent tool calls** (paralelismo real del LLM harness, REGLA 19 doctrinal). Spawning secuencial paga ~75-90 s de cold-start por cada HU; en paralelo solo se paga 1 cold-start + la HU más lenta marca el wall-clock total.

### A. Pre-check del módulo (UNA vez antes del paralelo)

```bash
node .claude/tools/design-precheck.js --run-id {run_id} --module {M}
```

Output reutilizable por todas las HUs del módulo. El agente filtra internamente por `target_hu_id`.

### B. Invocar TODOS los design-team del módulo en paralelo (1 mensaje, N Agent tools)

> ⚠️ **REGLA INVIOLABLE:** los N Agent tools (uno por HU) van en **UN SOLO MENSAJE** del comando al harness. Spawning secuencial (mensaje 1 → wait → mensaje 2 → wait → ...) anula el paralelismo y multiplica el wall-clock por el cold-start de cada HU. Mismo patrón que `sofka-asdd-atf-web-qa-engineer.md` FASE 1C (multi-instance design-team) y SECCIÓN 1 § WAVE 0 de `reference/atf-web/sofka-asdd-atf-web-orchestrator-fastpath-rules.md`.

Por cada `hu_id` en `precheck.hus_asignadas[]`, computar:
- `hu_short = hu_id.replace(/-/g, '')` (ej: `HU-1` → `HU1`).
- `cp_id_prefix = "CP-" + module_id + "-" + hu_short + "-"`.
- `fragment_output_path = "docs/testing/atf-web/{run_id}/design/.tmp/design_fragments/cp_modulo_{M}__hu_{hu_id}.json"`.

```
[PARALLEL CALL × N] design-team | STANDALONE | mode=single_hu | module_id={M} | hu=HU-1, HU-2, HU-3, HU-4
```

(Todas las invocaciones Agent tool en el MISMO mensaje del comando — el LLM harness las despacha concurrentes.)

> **Convención `cp_id_prefix`:** Cada CP del fragment será `{cp_id_prefix}{NNN}` con secuencia consecutiva por HU (`001`, `002`...). Ej: `CP-job-titles-HU1-001`, ..., `CP-job-titles-HU2-001`, .... Garantiza convención uniforme entre HUs del módulo sin esquemas ad-hoc.

Contexto pasado a CADA agente (uno por HU):
```json
{
  "run_id": "{run_id}",
  "run_folder": "docs/testing/atf-web/{run_id}",
  "session_context_path": "docs/testing/atf-web/{run_id}/session_context.json",
  "module_id": "{M}",
  "target_hu_id": "{hu_id}",
  "cp_id_prefix": "CP-{M}-{hu_short}-",
  "mode": "single_hu",
  "standalone_mode": true,
  "design_mode_hint": "{full|partial|hu-direct}",
  "produced_by": "standalone-command",
  "precheck_path": "docs/testing/atf-web/{run_id}/.tmp/design_precheck.json",
  "fragment_output_path": "docs/testing/atf-web/{run_id}/design/.tmp/design_fragments/cp_modulo_{M}__hu_{hu_id}.json"
}
```

El agente:
1. Lee `precheck_path`. Filtra `base_pruebas_subset` y `risks_subset` mentalmente a `target_hu_id`.
2. Diseña CPs SOLO para `target_hu_id`. Cobertura inviolable: 1+ CP por CA documentado de la HU.
3. Escribe fragment a `fragment_output_path` con shape parcial (ver `atf-web-steps/design.md` modo single_hu).

```
[DONE] design-team | mode=single_hu | hu={hu_id} | cps={N}
```

### Tras todas las HUs — Merge atómico

```bash
node .claude/tools/design-merge.js --module-id {M} --design-dir "docs/testing/atf-web/{run_id}/sofka-asdd:qa-web-design" --cleanup
```

Acciones del script:
- **Validación estricta P77a:** cada fragment se valida con `JSON.parse()` + scanner de patrones JS prohibidos (`.repeat()`, `.padEnd()`, `Array().fill()`, `${}`, comentarios) ANTES del merge.
- Si algún fragment falla → exit 1 con stderr accionable (HU afectada, patrón detectado, instrucciones de remediación).
- Si todos OK → concat `test_cases[]`, dedup `test_datasets[]` por `ds_id`, union `screens[]` por `url_path`, concat `hu_traceability` (keys CA-HU-N-XX no colisionan), recalcula `cases_by_risk` desde el array (P65 lo reescribirá luego con autoridad), escribe `{design_dir}/cp_modulo_{M}.json` y `screens_{M}.json` atómicamente, limpia fragments con `--cleanup`.

### Si `design-merge.js` falla (INVIOLABLE)

**Exit 1 del script → DETENER el flujo de `/sofka-asdd:qa-web-design`**. Mostrar el stderr completo al QA y abortar el comando.

**PROHIBIDO** al comando `/sofka-asdd:qa-web-design` (o al LLM que lo ejecuta) intentar auto-reparación ad-hoc del fragment:
- ❌ `node -e "const fs=require('fs'); const txt=fs.readFileSync('...').toString().replace(/\\.repeat\\([0-9]+\\)/g,'\"AAAAA...\"'); fs.writeFileSync(...)"` — anti-doctrina prosa-vs-código.
- ❌ `sed -i 's/\\.repeat([0-9]\\+)/.../g' fragment.json` — regex frágil.
- ❌ Cualquier `Edit`/`Write` directo sobre `cp_modulo_*__hu_*.json` para "limpiar" expresiones.

**Acción correcta del QA:**
1. Leer el stderr del script — identifica HU afectada y patrón problemático.
2. Borrar el fragment inválido: `rm docs/testing/atf-web/{run_id}/design/.tmp/design_fragments/cp_modulo_{M}__hu_{HU}.json`.
3. Re-ejecutar `/sofka-asdd:qa-web-design --module {M} --run-id {run_id}` (re-procesa todas las HUs faltantes desde cero — el agente refina su prosa al releer REGLA 8).
4. Si el problema persiste tras 2 reintentos → el QA edita manualmente el fragment expandiendo el literal (ej: `"A".repeat(400)` → `"AAAAA...AAAAA"` con 400 chars literales) Y reporta el incidente para refuerzo doctrinal del agente.


### Modo legacy `full_module`

Si el módulo tiene 1 sola HU asignada → puede invocarse en modo `full_module` (sin loop, sin merge). Para 2+ HUs, **siempre `single_hu`**.

```
[DONE] design-team | {timestamp} | module={M} | cps={N} | design_mode={mode}
```

### Modo multi-module

Iterar sobre `execution_plan.instances[].modules` — en esta primera versión,
ejecutar **secuencial** (la paralelización queda para iteración futura si el QA
lo pide). Para cada módulo: misma invocación que single-module + PASOS 4.3 / 4.4 / 4.5.

---

## PASO 4.3 — Validar cobertura determinísticamente

Tras escribir `cp_modulo_{M}.json`, invocar el validador. **Reescribe** `total_cases`, `cases_by_risk` y `coverage_matrix` con la verdad medida contra `base_pruebas.md` — sin importar lo que el agente haya declarado. Doctrina prosa-vs-código: el LLM emite, el script verifica.

```bash
node .claude/tools/validate-cp-coverage.js \
  --cp-file "{design_dir}/cp_modulo_{M}.json" \
  --base-pruebas "{diagnostics_dir}/base_pruebas.md" \
  --mode warning
```

**Comportamiento (modo warning, default):**
- Exit 0 siempre que el script corra OK.
- Si hay gaps reales (no solo fragmentación informativa) → emite warning a stderr con la lista por HU + porcentaje real. El JSON se actualiza con `coverage_matrix.gaps[]` poblado, incluyendo `covered_ca_ids[]` y `missing_count` por HU (para auto-cura).
- El comando continúa al PASO 4.3.5 (auto-cura).

**Si `base_pruebas.md` no existe** (degradado `hu-direct` sin diagnostics) → script imprime warning a stderr y exit 0 — sin validación posible. Continuar al PASO 4.4.

**Modo `--mode enforce`**: exit 2 si hay gaps reales → comando aborta. Para activar, pasar `--mode enforce` al comando o setear `appweb.yaml.test_run.coverage_enforce: true` (auto-respetado por el comando). Recomendado en pipelines CI/CD.

```bash
# Modo enforce manual (gating duro):
node .claude/tools/validate-cp-coverage.js \
  --cp-file "{design_dir}/cp_modulo_{M}.json" \
  --base-pruebas "{diagnostics_dir}/base_pruebas.md" \
  --mode enforce
# Exit 2 si hay gaps → comando /sofka-asdd:qa-web-design aborta y NO ejecuta PASO 4.4 (registry).
```

---

## PASO 4.3.5 — Auto-cura de cobertura

Si el JSON tras P65 tiene `coverage_matrix.gaps[]` con entries `gap > 0` (no solo fragmentación), el comando intenta auto-cerrar invocando al agente en modo `coverage_completion`.

**Algoritmo:**
1. Leer `coverage_matrix.gaps[]` del cp_modulo_{M}.json.
2. Filtrar gaps reales: `g.gap > 0 && g.kind !== 'fragmentation'`.
3. Si no hay gaps reales → SKIP, ir a PASO 4.4.
4. Para cada `gap` real (máx 1 reintento por HU para evitar loop):
   - Recolectar `existing_cp_ids[]` del cp_modulo (los ya diseñados).
   - Invocar agente con contexto:
     ```json
     {
       "run_id": "{run_id}",
       "module_id": "{M}",
       "target_hu_id": "{gap.hu}",
       "mode": "coverage_completion",
       "missing_count": {gap.gap},
       "covered_ca_ids": {gap.covered_ca_ids},
       "cp_file_path": "{design_dir}/cp_modulo_{M}.json",
       "existing_cp_ids": [...],
       "precheck_path": "docs/testing/atf-web/{run_id}/.tmp/design_precheck.json"
     }
     ```
   - El agente identifica CAs no cubiertos (no en `covered_ca_ids`), diseña CPs adicionales, **append** a `test_cases[]` + `hu_traceability`, reescribe el archivo atómicamente.
5. Re-invocar `validate-cp-coverage.js` sobre el archivo actualizado.
6. Si tras la cura aún hay gaps → emit warning final al QA. **NO segundo reintento** (anti-loop).

**Anti-loop:** máx 1 ronda de auto-cura por invocación de `/sofka-asdd:qa-web-design`. Si el agente no logra cerrar el gap en su segundo intento, el QA decide manualmente.

**Skip explícito:** si el QA lanzó con `--no-auto-heal` (futuro) → skip este paso.

---

## PASO 4.3.7 — Inferencias post-merge sobre el cp_modulo consolidado

> **Por qué post-merge:** los PASOS 3.8 (`tag-bd-cps.js`) y 3.9 (`split-cp-steps.js`) del diseñador design-team están definidos para modo `full_module`. En `single_hu`, cada agente per-HU NO los ejecuta sobre su fragment, y `design-merge.js` no los aplica post-merge. Para garantizar que NINGÚN CP del módulo quede sin tag `@bd` cuando corresponde y sin fragmentación de pasos compuestos, el comando los invoca aquí sobre el `cp_modulo_{M}.json` ya consolidado.

Tras el merge atómico (PASO 4) y la validación de cobertura (PASO 4.3), invocar los 2 scripts deterministas sobre el archivo consolidado. **Paralelos** (mutan distintos campos: `bd_inference` vs `step_split_inference`, no compiten — el último `writeFileSync` gana sobre el otro campo, y ambos hacen merge incremental por CP):

```bash
( node .claude/tools/tag-bd-cps.js --cp-file "{design_dir}/cp_modulo_{M}.json" > /tmp/_bdtag.out 2>&1 ) &
( node .claude/tools/split-cp-steps.js --cp-file "{design_dir}/cp_modulo_{M}.json" > /tmp/_split.out 2>&1 ) &
wait
```

> ⚠️ **Riesgo race-condition:** ambos scripts hacen `readFileSync` + mutación + `writeFileSync` sobre el mismo archivo. Si emiten `writeFileSync` en orden interleaved, uno pierde su mutación. **Mitigación:** ejecutar SECUENCIAL (no paralelo) — el costo extra es ~100-200 ms por script (deterministas, no-LLM). La pseudo-paralelización aquí es premature optimization.

```bash
node .claude/tools/tag-bd-cps.js --cp-file "{design_dir}/cp_modulo_{M}.json"
node .claude/tools/split-cp-steps.js --cp-file "{design_dir}/cp_modulo_{M}.json"
node .claude/tools/recalc-data-needs.js --cp-file "{design_dir}/cp_modulo_{M}.json"
```

Stdout esperado: `{ ok, cps_total, cps_tagged }`, `{ ok, cps_total, cps_split, total_splits }`, `{ ok, before:{total_needs}, after:{total_needs}, mutated }`. Los 3 son idempotentes — re-correr no duplica.

**Sobre `recalc-data-needs.js`:** recalcula `data_needs_summary` determinísticamente desde `test_cases[].data_needs[]`. Es red de seguridad complementaria a la del `design-merge.js` — atrapa casos donde el agente `single_hu` olvidó poblar el summary parcial. Doctrina prosa-vs-código: el LLM emite needs por CP (decisión de dominio), el script agrega el summary (operación determinística).

**Si fallan:** loguear stderr al QA y continuar (no bloquear el reporte). Los CPs sin `@bd` siguen siendo válidos para el executor — solo significa que no se invocará `sofka-asdd-atf-web-db-validator` sobre ellos. Los CPs con pasos compuestos no fragmentados pueden generar 1 screenshot en lugar de 2 (REGLA 1 sutilmente violada, no FAIL).

**Validación de longitudes BVA en datasets (modo warning):**

```bash
node .claude/tools/validate-dataset-lengths.js --cp-file "{design_dir}/cp_modulo_{M}.json"
```

Compara el número declarado en el `label` del dataset (ej: `boundary_at_max_255`, `boundary_above_max_300`) con la longitud real de la cadena más larga en `data{}`. Reporta mismatches a stderr + JSON estructurado. **NO auto-repara** (doctrina prosa-vs-código P77b).

Mismatches comunes detectados:
- `boundary_at_max_N` con `actual !== N` → el LLM contó mal los chars (típico off-by-2/3 en cadenas >100).
- `boundary_above_max_N` con `actual <= N` → el agente entendió mal "above" y emitió exactamente N en lugar de >N.
- `boundary_below_min_N` con `actual >= N` → similar invertido.

**Modo `--enforce`** (no default): exit 2 si hay mismatches → comando aborta. Si activas, los runs con mismatches BVA fallarán hasta corregir el agente o el label.

**Si falla:** loguear stderr al QA y continuar (modo warning default). El QA decide: re-ejecutar la HU específica O corregir el label si la longitud actual es la verdad.

> **Skill `sofka-asdd-atf-web-test-data-needs` (PASO 3.7 del agente):** NO se incluye en este paso porque requiere razonamiento del LLM (clasificación de entidades de dominio, no determinístico). El agente design-team debe invocarlo dentro de cada modo `single_hu`.

---

## PASO 4.4 — Actualizar registry determinísticamente

Tras validar cobertura, mergear el módulo al registry per-app. **El comando es responsable** del registry (NO el agente design-team) — el agente solo escribe `cp_modulo_*.json`.

```bash
node .claude/tools/update-cp-registry.js \
  --cp-file "{design_dir}/cp_modulo_{M}.json" \
  --app-name "{app_name}" \
  --run-id "{run_id}"
```

Acciones del script:
- Upsert por `cp_id`: si nuevo → agrega con `first_designed_run = run_id`; si existe → actualiza `last_modified_run = run_id` y `tags`/`title`/`risk_level`.
- CPs del MISMO `module_id` ausentes en el archivo nuevo → marcar `status: "deprecated"` (preservados, no eliminados).
- CPs de OTROS `module_id` → intactos.

**Exit:** 0 OK · 1 fatal. Si falla → loguear stderr al QA y continuar a PASO 4.5 (no bloquear el reporte).

---

## PASO 4.6 — Coverage check de pantallas vs Flujos E2E

> **Por qué se ejecuta aquí:** verificar que las pantallas de los CPs estén cubiertas por algún `e2e_flow.execution_sequence[]` cierra el ciclo design ↔ strategy. Como script atómico invocado por `/sofka-asdd:qa-web-design` post-merge, garantiza que el chequeo se ejecute incluso cuando `/sofka-asdd:qa-web-strategize` corre standalone.

```bash
node .claude/tools/strategize-coverage.js --run-id {run_id}
```

Stdout JSON: `{ok, modules_designed, e2e_flows_count, screens_total, screens_covered, screens_uncovered, coverage_pct, coverage_report_path}`. Persiste reporte en `docs/testing/atf-web/{run_id}/strategy/screen_coverage.json`.

Heurística de cobertura: una pantalla está cubierta si su `url_path` aparece (substring o último segmento significativo) en `e2e_flow.entry_url` o en algún `execution_sequence[].action`. Conservadora: si el strategist describe pantallas en lenguaje natural sin mencionar URLs, esas pantallas se reportan como no cubiertas.

**Modos:**

- **default (warning)** — exit 0, JSON con gaps. Loguear stderr al QA. Sugiere re-ejecutar /sofka-asdd:qa-web-strategize con énfasis en URLs O usar `--add-coverage-flows`.
- **`--add-coverage-flows`** — añade automáticamente `E2E-COVER-N` (type=`coverage_fill_e2e`, category=`technical`) al `execution_plan.e2e_flows[]` para cada pantalla huérfana. Mutación atómica del plan. Útil para cerrar el ciclo sin re-ejecutar el strategist completo.
- **`--enforce`** — exit 2 si hay pantallas sin cubrir → comando aborta. Recomendado en CI/CD una vez el flujo se valide.

**Si fallan:** loguear stderr al QA y continuar al PASO 4.5 (no bloquear el reporte HTML).

> **Doctrina:** ver [`docs/concepts/e2e-flows.md`](../../docs/concepts/e2e-flows.md) § "Reglas inviolables".

---

## PASO 4.5 — Generar reporte parcial HTML

```bash
node .claude/dashboard/generate-report.js {run_id}
node .claude/dashboard/generate-index.js
```

Output: `docs/testing/atf-web/{run_id}/report.html` con Fases 0/1/1C renderizadas según existan; Fases 1D/2C `pending`. `runs_index.html` actualizado. Si alguno falla → loguear stderr y continuar.

---

## PASO 5 — Reportar resultado

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 DISEÑO COMPLETO (standalone)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   run_id      : {run_id}
   Módulos     : {N_modules}
   CPs totales : {N_cps}
   Modo        :
     - M1: {mode} ({N_cps_m1} CPs)
     - M2: {mode} ({N_cps_m2} CPs)
   Outputs     :
     - docs/testing/atf-web/{run_id}/design/cp_modulo_M1.json
     - docs/testing/atf-web/{run_id}/design/cp_modulo_M2.json
   Reporte HTML: docs/testing/atf-web/{run_id}/report.html (Fases 0/1/1C según disponibles)

{Si algún design_mode != "full"}:
⚠️  Algunos módulos se diseñaron en modo degradado:
   - partial: risk_level asignado por heurística (ejecuta /sofka-asdd:qa-web-strategize para afinar)
   - hu-direct: sin diagnostics ni strategy (ejecuta /sofka-asdd:qa-web-diagnose y /sofka-asdd:qa-web-strategize para
     completar la cadena)

➡️  Siguiente paso sugerido:
   /sofka-asdd:qa-web-exec run_id={run_id} custom_tags=["@cp:CP-{M}-001"]   ← ejecutar CPs puntuales
   /sofka-asdd:qa-web-run                                  ← pipeline completo (detectará artefactos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
