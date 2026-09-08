---
description: ATF Web fase Diagnóstico — testabilidad de HUs con INVEST y FRS, base de pruebas, supuestos y referencias.
mode: 'agent'
---

Ejecuta el Diagnostician de forma independiente sobre las HUs en
`docs/testing/atf-web/requirements/hu-bajo-prueba/`. Genera `base_pruebas.md`, `assumptions.md` y
`testability_score.md` en un `run_id` existente o nuevo. No invoca al
Orquestador ni al resto del pipeline.

Uso:
  /sofka-asdd:qa-web-diagnose [--run-id {run_id}]

Ejemplos:
  /sofka-asdd:qa-web-diagnose
  /sofka-asdd:qa-web-diagnose --run-id MiApp-v1.0-20260101-0900

Parámetros:
- --run-id: ID de un run existente (reusa su session_context.json). Si se omite,
  se crea un `run_id` nuevo con formato `{AppName}-v{version}-{YYYYMMDD}-{HHMM}`
  derivado de `appweb.yaml`.

---

## PASO 1 — Validar entrada

1. Verificar que `docs/testing/atf-web/requirements/hu-bajo-prueba/` existe y contiene ≥1 archivo
   (`.md`, `.txt`, `.pdf`, `.docx`).
   Si está vacía → ERROR: "docs/testing/atf-web/requirements/hu-bajo-prueba/ vacío — coloca al menos
   una HU antes de ejecutar /sofka-asdd:qa-web-diagnose".

2. Verificar que `docs/testing/atf-web/config/appweb.yaml` existe y tiene `app.name` + `app.version`.
   Si no → ERROR: "appweb.yaml no configurado".

---

## PASO 2 — Resolver run_id

> **Resolución del `run_id`:** los comandos standalone honran `appweb.yaml.run_id` cuando no hay `--run-id` CLI, igual que el orchestrator. Sin esa lectura, ejecutar `/sofka-asdd:qa-web-diagnose` (sin args) crearía un `run_id` nuevo ignorando el run activo declarado en `appweb.yaml`, duplicando HUs ya procesadas y disparando `fresh` en lugar de `append`.

Cascada (PRIMERA fuente que aplique gana):

1. **CLI `--run-id`** (prioridad más alta):
   - Si se pasó → ese gana, sin leer `appweb.yaml.run_id`.
   - Verificar `docs/testing/atf-web/{run_id}/session_context.json`:
     - Existe → reusar.
     - No existe → `node .claude/tools/session-context.js init-minimal {run_id}`.

2. **`appweb.yaml.run_id`** (fallback intermedio):
   - Si NO se pasó `--run-id` Y `appweb.yaml` tiene un campo raíz `run_id: "..."` no vacío:
     - Verificar `docs/testing/atf-web/{run_id}/session_context.json`:
       - Existe → reusar (modo más común — el QA editó `appweb.yaml` para indicar el run activo).
       - No existe → `node .claude/tools/session-context.js init-minimal {run_id}`.

3. **Timestamp nuevo** (último recurso):
   - Si NO `--run-id` CLI Y NO `appweb.yaml.run_id`:
     - Leer `appweb.yaml` → `app.name`, `app.version`.
     - Construir `run_id = {AppName}-v{version}-{YYYYMMDD}-{HHMM}` (timestamp actual).
     - `node .claude/tools/session-context.js init-minimal {run_id}`.

4. **Banner OBLIGATORIO** (incluye fuente del run_id para diagnóstico transparente):
```
🔧 run_id resuelto: {run_id}  (fuente: cli|appweb.yaml|timestamp_nuevo)
🔧 run_folder    : docs/testing/atf-web/{run_id}/
```

---

## PASO 2.5 — Pre-check de modo acumulativo

> **Contexto:** `/sofka-asdd:qa-web-diagnose` soporta sprints incrementales. Si el run ya tiene HUs procesadas, las nuevas se appendean sin destruir lo previo. Identidad de HU = título extraído por el agente (slug). Ver `tools/diagnose-merge.js` para la lógica determinística.

**A) Backfill condicional** — si el run tiene artefactos previos (`base_pruebas.md`) PERO no tiene `processed_hus.json` (run antiguo), reconstruir el registro:

```bash
[ -f "docs/testing/atf-web/{run_id}/diagnostics/base_pruebas.md" ] && \
  [ ! -f "docs/testing/atf-web/{run_id}/diagnostics/processed_hus.json" ] && \
  node .claude/tools/diagnose-merge.js backfill --run-id {run_id} || true
```

**B) Pre-check** — obtener el modo y contadores:

```bash
node .claude/tools/diagnose-merge.js pre-check --run-id {run_id} > docs/testing/atf-web/{run_id}/diagnostics/.tmp/pre_check.json
```

Output esperado en `pre_check.json`:
- `mode`: `"fresh"` (run nuevo o sin registro) | `"append"` (sprint incremental).
- `existing_hus[]`: HUs ya procesadas (con `title_slug`, `title`, `source_file`).
- `existing_sup_ids[]`, `existing_pq_ids[]`, `existing_mat_ids[]`: IDs ya asignados.
- `resolved_pq_ids[]`: PQs con status `resuelta` o `parcial` — **conservar**, NO regenerar.
- `counters`: `next_sup`, `next_pq`, `next_mat` — IDs a usar para HUs nuevas.

---

## PASO 3 — Invocar diagnostician

```
[CALL] diagnostician | STANDALONE | instancia 1 | {timestamp ISO}
```

Contexto pasado al agente:
```json
{
  "run_id": "{run_id}",
  "run_folder": "docs/testing/atf-web/{run_id}",
  "session_context_path": "docs/testing/atf-web/{run_id}/session_context.json",
  "standalone_mode": true,
  "produced_by": "standalone-command",
  "pre_check_path": "docs/testing/atf-web/{run_id}/diagnostics/.tmp/pre_check.json",
  "merge_mode": "{mode del pre-check: fresh | append}"
}
```

El diagnostician:
1. **Lee primero `pre_check.json`** — trae pre-resueltos:
   - `inline_context.{app_name, app_url, app_version, app_environment, notebooklm_enabled, notebooklm_notebook_id, functional_docs_folder, diagnostics_dir}` — usar EN LUGAR DE leer `appweb.yaml`/`config.yaml`.
   - `knowledge_excerpts.{app_behavior, test_gotchas}` — usar EN LUGAR DE leer `docs/testing/atf-web/knowledge/*.{app}.md`.
   - `mode`, `existing_hus[]`, `counters`, `resolved_pq_ids[]` (modo merge).
2. Solo lee `design_context.json` (o `session_context.json`) si necesita campos NO provistos en `inline_context`.
3. Verifica `functional_docs_folder` (vía `inline_context`) — detecta HUs disponibles.
4. Ejecuta el Input Resolution Ladder: `docs/testing/atf-web/requirements/hu-bajo-prueba/` es la fuente primaria obligatoria.

**Si `mode == "fresh"`** (comportamiento clásico):
- Procesar todas las HUs encontradas.
- Escribir directamente `base_pruebas.md`, `assumptions.md`, `preguntas_cliente.md`, `material_references.json`, `testability_score.md`.

**Si `mode == "append"`**:
- Por cada HU encontrada en archivos, calcular `title_slug` del título extraído.
- Si `title_slug` está en `existing_hus[]` → **omitir** (ya procesada, preservar lo previo).
- Si `title_slug` es nuevo → **procesar**: asignar SUP/PQ/MAT desde `counters.next_*` consecutivos, escribir fragmento en `{diagnostics_dir}/.tmp/fragments/{title_slug}.md` con frontmatter + secciones canónicas (ver agente diagnostician PASO 4.7 para el shape exacto).
- **NO** tocar artefactos finales (`base_pruebas.md`, etc.) — el script `diagnose-merge.js post-merge` los ensamblará.
- Si NO hay HUs nuevas (todas ya procesadas) → reportar `[NOOP] sin HUs nuevas` y NO escribir fragmentos.

```
[DONE] diagnostician | {timestamp} | FRS={N}% | gate={READY|CONDITIONAL|BLOCKED}
```

---

## PASO 3.4 — Post-merge atómico

Si el agente operó en `merge_mode == "fresh"` → **omitir este paso**, los artefactos ya están escritos.

Si el agente operó en `merge_mode == "append"` Y escribió ≥1 fragmento en `.tmp/fragments/`:

```bash
node .claude/tools/diagnose-merge.js post-merge --run-id {run_id}
```

Acciones del script:
- Lee fragmentos `.tmp/fragments/*.md`.
- Mergea atómicamente en los 5 artefactos finales (escritura via `*.tmp` + rename).
- Recalcula FRS global = promedio simple de FRS individuales por HU.
- Re-evalúa gate (≥75 → READY · ≥50 → CONDITIONAL · <50 → BLOCKED).
- Actualiza `processed_hus.json` con las nuevas HUs.
- Limpia `.tmp/fragments/`.

**Exit codes:** 0 OK · 1 fatal (fragment inválido, archivo corrupto) · 2 noop (sin fragmentos = ninguna HU nueva). Si exit 1 → mostrar stderr al QA, NO regenerar reporte HTML.

---

## PASO 3.5 — Generar reporte parcial HTML

Tras los outputs canónicos del Diagnostician, generar el reporte HTML del run. `generate-report.js` detecta automáticamente las fases completadas (busca `diagnostics/`, `strategy/`, `design/`, `execution/`) y renderiza cada fase con estado `done`/`pending`/`skipped`.

```bash
node .claude/dashboard/generate-report.js {run_id}
node .claude/dashboard/generate-index.js
```

Output: `docs/testing/atf-web/{run_id}/report.html` (parcial — solo Fase 0 con datos; resto pending) + `docs/testing/atf-web/runs_index.html` actualizado.

Si alguno de los 2 scripts falla → loguear el error en stderr y continuar al PASO 4 (no bloquear el reporte al QA por un fallo de dashboard).

---

## PASO 4 — Reportar resultado

Mostrar al QA:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔎 DIAGNÓSTICO COMPLETO (standalone)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   run_id      : {run_id}
   FRS         : {frs}%
   Gate        : {READY|CONDITIONAL|BLOCKED}
   HUs         : {N_hus} analizadas
   Outputs     :
     - docs/testing/atf-web/{run_id}/diagnostics/base_pruebas.md
     - docs/testing/atf-web/{run_id}/diagnostics/assumptions.md
     - docs/testing/atf-web/{run_id}/diagnostics/testability_score.md
   Reporte HTML: docs/testing/atf-web/{run_id}/report.html (parcial — Fase 0 con datos)

➡️  Siguiente paso sugerido:
   /sofka-asdd:qa-web-strategize --run-id {run_id}        ← priorizar + calcular riesgos
   /sofka-asdd:qa-web-design --module {M} --run-id {run_id}   ← saltar a diseño directo
   /sofka-asdd:qa-web-run                                  ← ejecutar pipeline completo (detectará artefactos existentes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Si el gate es BLOCKED → incluir la razón reportada por el diagnostician y NO sugerir continuar — pedir al QA ajustar las HUs.
