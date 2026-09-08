---
description: ATF Web fase Estrategia — matriz de riesgo, priorización de HUs, instancias paralelas y cobertura de pantallas.
mode: 'agent'
---

Ejecuta el Strategist de forma independiente para generar `execution_plan.json`,
`risk_matrix.json` y `hu_priority.md`. Usa `diagnostics/base_pruebas.md` si existe
(modo full). Si no, degrada a leer directamente las HUs en
`docs/testing/atf-web/requirements/hu-bajo-prueba/` (modo `hu-direct`).

Uso:
  /asdd:qa-web-strategize [--run-id {run_id}]

Ejemplos:
  /asdd:qa-web-strategize
  /asdd:qa-web-strategize --run-id MiApp-v1.0-20260101-0900

Parámetros:
- --run-id: ID de un run existente. Si se omite → se crea nuevo `run_id`.

---

## PASO 1 — Resolver fuente de entrada (Input Resolution Ladder)

1. Si `--run-id` pasado → verificar `docs/testing/atf-web/{run_id}/diagnostics/base_pruebas.md`:
   - EXISTE → `source_mode = "diagnostics-full"` (con assumptions.md) o `"diagnostics-partial"` (sin).
   - NO EXISTE pero `docs/testing/atf-web/requirements/hu-bajo-prueba/` tiene contenido → `source_mode = "hu-direct"`.
   - Ninguna fuente → ERROR: "Sin diagnostics y sin HUs — ejecuta /asdd:qa-web-diagnose o coloca HUs".

2. Si NO `--run-id`:
   - Verificar `docs/testing/atf-web/requirements/hu-bajo-prueba/` tiene ≥1 HU.
     - Sí → modo `hu-direct`.
     - No → ERROR: "docs/testing/atf-web/requirements/hu-bajo-prueba/ vacío".

---

## PASO 2 — Resolver run_id

Cascada (PRIMERA fuente que aplique gana):

1. **CLI `--run-id`** → reusar/crear con `node .claude/tools/session-context.js init-minimal {run_id}`.
2. **`appweb.yaml.run_id`** (campo raíz no vacío) → si `docs/testing/atf-web/{run_id}/session_context.json` existe, reusar; si no, `init-minimal`.
3. **Timestamp nuevo** → construir `run_id = {AppName}-v{version}-{YYYYMMDD}-{HHMM}` y ejecutar `session-context.js init-minimal`.

Mostrar: `🔧 run_id: {run_id} (fuente: cli|appweb.yaml|timestamp_nuevo) | source_mode: {source_mode}`.

> **Por qué leemos `appweb.yaml.run_id`:** los comandos standalone (`/asdd:qa-web-diagnose`, `/asdd:qa-web-strategize`, `/asdd:qa-web-design`) DEBEN leer `appweb.yaml.run_id` como fallback igual que el orchestrator — de lo contrario crearían un `run_id` nuevo cuando el QA esperaba reusar el del flujo principal, dejando artefactos huérfanos.

---

## PASO 2.5 — Pre-check de modo acumulativo

> **Contexto:** `/asdd:qa-web-strategize` soporta sprints incrementales similar a `/asdd:qa-web-diagnose`. Si el run ya tiene `execution_plan.json`, las re-invocaciones preservan `priority`, `notes`, `dependencies_inbound/outbound` y `primary_actor` de los módulos previos. Solo se actualizan `hus[]`, `risk_summary`, `estimated_cps` reflejando el estado actual de las HUs.

```bash
node .claude/tools/strategize-merge.js pre-check --run-id {run_id}
```

Stdout JSON: `{ok, mode: "fresh"|"append", existing_modules[], existing_hus[], snapshot_path}`.

Si `mode: append` → snapshot guardado en `docs/testing/atf-web/{run_id}/strategy/.tmp/pre_strategize_snapshot.json`. El strategist DEBE conocer este snapshot para preservar el trabajo previo del QA.

Pasar al agente como contexto adicional: `pre_strategize_snapshot_path` cuando exista.

---

## PASO 3 — Invocar strategist

```
[CALL] strategist | STANDALONE | instancia 1 | {timestamp ISO}
```

Contexto pasado al agente:
```json
{
  "run_id": "{run_id}",
  "run_folder": "docs/testing/atf-web/{run_id}",
  "session_context_path": "docs/testing/atf-web/{run_id}/session_context.json",
  "standalone_mode": true,
  "source_mode": "{source_mode}",
  "produced_by": "standalone-command"
}
```

El strategist aplica su Input Resolution Ladder (ver PASO 1 del agente):
- Si `source_mode = "diagnostics-full"` o `"diagnostics-partial"` → lee `base_pruebas.md`.
- Si `source_mode = "hu-direct"` → lee HUs directamente desde `functional_docs_folder`.
- Escribe `{strategy_dir}/execution_plan.json`, `{strategy_dir}/risk_matrix.json`,
  `{strategy_dir}/hu_priority.md` con campos `produced_by` + `source_mode` en el header.

```
[DONE] strategist | {timestamp} | modules={N} | critical={N} | high={N}
```

---

## PASO 3.4 — Post-merge consolidación (solo si mode=append)

```bash
node .claude/tools/strategize-merge.js post-merge --run-id {run_id}
```

Si el strategist regeneró el plan completo (no respetó preservación de módulos previos), este script restaura los campos del snapshot pre-strategize sobre los módulos coincidentes. Defensa contra alucinación del agente.

Stdout JSON: `{ok, mode, modules_total, modules_added, modules_preserved, modules_updated, execution_plan_path}`.

- `modules_added` — módulos nuevos en este sprint.
- `modules_preserved` — módulos del plan previo que el strategist OMITIÓ (defensa: se mantienen tal cual).
- `modules_updated` — módulos que existían y se actualizaron (priority/notes preservados, hus/risk_summary refrescados).

---

## PASO 3.45 — Validar flujos E2E

```bash
node .claude/tools/validate-e2e-flows.js --run-id {run_id}
```

Verifica las 8 reglas inviolables del strategist sobre `e2e_flows[]` (ver [`docs/concepts/e2e-flows.md`](../../docs/concepts/e2e-flows.md)):
- R1: `e2e_flows[]` no vacío con ≥2 módulos.
- R2: Cada flow cruza ≥2 módulos.
- R3: `execution_sequence[]` ≥3 steps.
- R4: `objective` y `business_value` no vacíos.
- R5: `category` válido (`functional` | `technical`).
- R6: Funcionales primero en el array.
- R7: Topología — respetar dependencias entre módulos.
- R8: Mínimos — ≥1 happy_path_e2e + (si auth) ≥1 security_e2e.

Modo `warning` por default (exit 0 con violaciones en stderr + JSON). Modo `--enforce` (exit 2 si hay critical) disponible para CI/CD.

Si hay violaciones críticas → loguear al QA y sugerir re-ejecución del strategist. NO bloquea el reporte HTML (que viene en PASO 3.5).

---

## PASO 3.5 — Generar reporte parcial HTML

```bash
node .claude/dashboard/generate-report.js {run_id}
node .claude/dashboard/generate-index.js
```

Output: `docs/testing/atf-web/{run_id}/report.html` con Fase 0 (si existe diagnostics) + Fase 1 (strategy actual) renderizadas; resto de fases pending. `runs_index.html` actualizado. Si alguno falla → loguear stderr y continuar.

---

## PASO 4 — Reportar resultado

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ESTRATEGIA GENERADA (standalone)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   run_id      : {run_id}
   Modo        : {source_mode}
   Módulos     : {N_modules} identificados
   Riesgos     : {N_critical} critical | {N_high} high | {N_medium} medium | {N_low} low
   Outputs     :
     - docs/testing/atf-web/{run_id}/strategy/execution_plan.json
     - docs/testing/atf-web/{run_id}/strategy/risk_matrix.json
     - docs/testing/atf-web/{run_id}/strategy/hu_priority.md
   Reporte HTML: docs/testing/atf-web/{run_id}/report.html (Fase 0 + Fase 1)

{Si source_mode == "hu-direct"}:
⚠️  Modo degradado — estrategia derivada directamente de HUs.
   FRS, INVEST y assumptions NO disponibles. Ejecuta /asdd:qa-web-diagnose --run-id {run_id}
   si necesitas completarlos.

➡️  Siguiente paso sugerido:
   /asdd:qa-web-design --run-id {run_id}           ← diseñar todos los módulos del plan
   /asdd:qa-web-design --module {M} --run-id {run_id}   ← diseñar un módulo específico
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
