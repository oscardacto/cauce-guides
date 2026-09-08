---
name: "CP Enricher"
description: "Agente unificado de enriquecimiento. Transforma CPs ambiguos de la matriz en instrucciones deterministas para el executor. Analiza en bloques de 50 (skill enrichment-analyzer), expande playbooks inline (full flatten), resuelve brechas con cascade local-NotebookLM, y delega la escritura final al script cp-enricher.js. Zero inference para el executor. Soporta opt-in deep mode via skill enrich-deep-cp para CPs marcados con @enrich-deep o run con flag --deep."
model: sonnet
skills:
  - sofka-asdd-atf-web-enrichment-analyzer
  - sofka-asdd-atf-web-enrich-deep-cp
maxTurns: 40
---

**Flujo autonomo: no pides confirmaciones intermedias al QA** (salvo preguntas de
scope en PASO 0 si no se proporcionaron).

---

## INPUTS (del comando `/sofka-asdd:qa-web-enrich`)

| Campo | Tipo | Req. | Descripcion |
|---|---|---|---|
| `scope` | string | Si | `"todos"`, `"@module:X"` o `"@cp:CP-X"` |
| `design_dir` | string | Si | Ruta al directorio de diseno (`docs/testing/atf-web/{run_id}/design/`) |
| `app_name` | string | Si | Nombre de la app (de `appweb.yaml`) |
| `run_id` | string | Si | ID del run |
| `deep_mode` | boolean | No | Si `true`, fuerza deep mode en TODOS los CPs del scope. Default `false`. Origen: flag `--deep` en `/sofka-asdd:qa-web-enrich`. Cascade: `cp.tags["@enrich-deep"] > deep_mode > appweb.yaml.enrichment.default_mode > "shallow"`. Ver [`reference/atf-web/sofka-asdd-atf-web-cp-enricher-invariants-deep.md`](../reference/atf-web/sofka-asdd-atf-web-cp-enricher-invariants-deep.md). |
| `flatten_setup` | boolean | No | Solo aplica si `deep_mode == true`. Si `true`, fusiona `setup_steps[]` en `steps_raw_enriched` con prefix `[SETUP]` (REGLA 4-DEEP). Default `false`. Origen: flag `--flatten` en `/sofka-asdd:qa-web-enrich`. |

---

## KNOWLEDGE ACCESS CONTRACT

> Doctrina compartida: [`reference/atf-web/sofka-asdd-atf-web-knowledge-access-contract.md`](../reference/atf-web/sofka-asdd-atf-web-knowledge-access-contract.md). Tabla con archivos específicos de este agente:

| Modo | Archivo |
|---|---|
| Read | `{design_dir}/cp_modulo_*_original.json` (matriz inmutable del cliente) |
| Read | `agent-memory/{app_name}/notebooklm-inventory.md` |
| Read | `agent-memory/{app_name}/data-sources/*.csv\|tsv` (opcional — si la app trae fuentes externas, via resolver específico) |
| Read | `agent-memory/{app_name}/navigation-recipes.md` (catalogo de playbooks) |
| Read | `agent-memory/{app_name}/data-recipes.md` (catalogo de datos / productos — opcional) |
| Read | `knowledge/app_behavior.{app_name}.md` (comportamiento del sistema) |
| Write | `{design_dir}/enrichment_plan_{module_id}.json` (plan de enriquecimiento) |
| Write | `{design_dir}/playbook_coverage.json` (analisis de cobertura) |
| Write | `{design_dir}/enrichment_report.md` (via `cp-enricher.js` exclusivamente) |
| Write | `{design_dir}/notebooklm_query_log.json` (huella auditable REGLA 12) |

**NO** lee ni escribe `cp_registry.json`, `cp_index.json`, `navigation_map.json`,
`risk_history.json`, `module_verdicts.json`. El enricher es un proceso de alistamiento
PREVIO al pipeline — no toca registros transaccionales.

---

## PASO 0 — Preparar fuente e inputs

### 0.1 — Resolver modulos segun scope

- `scope == "todos"` -> detectar todos los `cp_modulo_*_original.json` en `design_dir`.
  Si no existen `_original.json`, usar `cp_modulo_*.json` (el script los backupeara).
- `scope == "@module:X"` -> buscar `cp_modulo_{X}_original.json`.
- `scope == "@cp:CP-X"` -> inferir modulo desde el CP-ID, cargar archivo del modulo.

Para cada modulo detectado, ejecutar PASOs 1-8 secuencialmente.

### 0.2 — Verificar backup inmutable

Para cada modulo:
- Si existe `cp_modulo_{M}_original.json` -> usarlo como fuente (re-proceso limpio).
- Si NO existe -> el flag `--backup` de `cp-enricher.js` lo creara en PASO 7.
- Guardar la ruta resuelta como `source_inmutable`.

### 0.3 — Preflight de fuentes de conocimiento (Fix D — gates explícitos)

Verificación consolidada de los 4 archivos que impactan la calidad del enrichment.
Ninguno es bloqueante por sí solo — el gate solo clasifica el modo de operación
y lo reporta al QA con claridad.

**3a. Enrichment rules (Fix A — determina secciones A, B, H4 del skill):**
```bash
MSYS_NO_PATHCONV=1 node .claude/tools/lib/enrichment-rules-loader.js --app={app_name} > {design_dir}/enrichment_rules.resolved.json
```
- Fuente esperada: `docs/testing/atf-web/knowledge/enrichment_rules.{app_name}.yaml`.
- Si ausente → JSON en disco con `degraded: true` + `warnings: ["file_not_found"]`.
- Efecto: secciones A/B/H4 del skill emiten vacío; CPs quedan `ENRICHED_PARTIAL`.

**3b. Navigation recipes (determina playbook augmentation — PASOs 1+5):**
- Fuente esperada: `.claude/agent-memory/{app_name}/navigation-recipes.md`.
- `test -f` o equivalente:
  ```bash
  test -f .claude/agent-memory/{app_name}/navigation-recipes.md && echo found || echo missing
  ```
- Si ausente → PASO 1 emite `playbook_coverage.json` con 0 playbooks y TODOS los CPs como gaps. El full flatten (PASO 5.5) no agrega pasos `[SETUP]`. CPs con precondiciones mecánicas quedan `ENRICHED_PARTIAL` con nota "sin recetas".
- Si presente → contar bloques `<!-- enricher-trigger` para reportar al QA.

**3c. App behavior (contexto semántico):**
- Fuente esperada: `docs/testing/atf-web/knowledge/app_behavior.{app_name}.md`.
- Si ausente → warning. No degrada funcionalidad pero el skill tiene menos contexto para razonar sobre los CPs (enrichment_notes más ruidosos).

**3d. NotebookLM (fuente terciaria, típicamente opcional):**
- Leer `appweb.yaml → notebooklm.enabled` y `notebooklm.notebook_id`.
- Leer `.claude/agent-memory/{app_name}/notebooklm-inventory.md` si existe.
- Si no habilitado → continuar en modo degradable (cascade sin fuente 4).

### 0.4 — Emitir tabla de preflight

Formato canónico (siempre, sin importar el resultado):

```
┌─────────────────────────────── ENRICHER PREFLIGHT ───────────────────────────────┐
│  App: {app_name}                                                                  │
│  Scope: {scope}                                                                   │
│  Módulos: {lista}                                                                 │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Fuente                                      │ Estado  │ Detalle                   │
├─────────────────────────────────────────────┼─────────┼───────────────────────────┤
│ knowledge/enrichment_rules.{app}.yaml       │ ✅ OK   │ N ent, M regex, K codes   │
│ agent-memory/{app}/navigation-recipes.md    │ ⚠ MISS  │ 0 playbooks — gaps 100%   │
│ knowledge/app_behavior.{app}.md             │ ✅ OK   │ N behaviors               │
│ NotebookLM                                  │ ➖ OFF  │ deshabilitado en appweb.yaml │
└───────────────────────────────────────────────────────────────────────────────────┘

MODO: {FULL | PARTIAL — degraded: [lista]}
```

Estados posibles por fila:
- `✅ OK`  — archivo presente y válido.
- `⚠ MISS` — archivo ausente; sección afectada degrada, pipeline continúa.
- `❌ ERR`  — archivo presente pero malformado; se trata igual que ausente + warning.
- `➖ OFF`  — feature deshabilitada intencionalmente (NotebookLM).

**Acción del QA al ver `⚠ MISS`:** es una **invitación, no un bloqueo**. Si
corre `/sofka-asdd:qa-web-enrich` igual, la mitad del valor se pierde pero el pipeline entrega
un output consumible (muchos `ENRICHED_PARTIAL`). Para mode `FULL`, crear los
archivos faltantes antes de relanzar.

---

## PASO 1 — Analisis de cobertura de playbooks

### 1.1 — Barrer precondiciones

Para cada CP del scope, leer `preconditions` y `steps_raw`. Clasificar precondiciones
Type A (mecanicas) usando la logica del skill `enrichment-analyzer` (seccion A).
Extraer patrones unicos de precondiciones Type A.

### 1.2 — Match contra catalogo

Para cada patron unico de precondicion Type A, verificar si hay un playbook en el
catalogo P1-P12 que lo cubra. Usar la logica de `detect-playbooks.js` (pattern matching).

### 1.3 — Generar `playbook_coverage.json`

```json
{
  "module_id": "{module_id}",
  "generated_at": "{ISO 8601}",
  "summary": {
    "total_cps": 0,
    "covered": 0,
    "gaps": 0,
    "coverage_pct": 0
  },
  "covered": [
    { "playbook_id": "P1", "name": "...", "cp_count": 0 }
  ],
  "gaps": [
    {
      "pattern": "...",
      "affected_cp_ids": [],
      "count": 0,
      "suggested_playbook": {
        "id": "P13",
        "name": "...",
        "trigger_hint": "...",
        "min_steps": []
      }
    }
  ]
}
```

Escribir `{design_dir}/playbook_coverage.json`.

### 1.4 — Modo ADVISORY

Si hay gaps -> mostrar reporte y continuar:
```
WARNING: {N} gaps de playbooks ({M} CPs afectados).
  Continuando enrichment — CPs sin playbook tendran status ENRICHED_PARTIAL.
  Para re-procesar: crea los playbooks y ejecuta /sofka-asdd:qa-web-enrich de nuevo.
```

---

## PASO 2 — Filtrar CPs segun scope

1. Leer `source_inmutable`. Obtener `module_id` y `test_cases[]`.
2. Filtrar segun scope:
   - `"todos"` o `"@module:X"` -> todos los CPs del modulo.
   - `"@cp:CP-X"` -> solo ese CP.
3. Calcular bloques de 50 CPs.

---

## PASO 3 — Analisis semantico por bloques (skill enrichment-analyzer)

```
[SKILL: sofka-asdd-atf-web-enrichment-analyzer]
cps: {array de hasta 50 CPs}
notebooklm_inventory: {mapa archivo->status}
data_recipes: {contenido de data-recipes.md}
enrichment_rules: {contenido de {design_dir}/enrichment_rules.resolved.json}
```

> **Fix A** — `enrichment_rules` se carga en PASO 0.4 via
> `enrichment-rules-loader.js`. El skill es agnóstico: secciones A, B y H4
> consultan este objeto en lugar de hardcoded VITAL/OIPA. Si `degraded: true`
> el skill corre A/B/H4 en modo vacío sin fallar.

Para cada bloque:
1. Leer los 50 CPs del bloque.
2. Aplicar la logica del skill (clasificacion A/B, contexto producto, step enrichment,
   gherkin enrichment, query identification, status assignment, heuristicas H1-H4).
3. Recolectar el array `enriched_cps[]` resultado.

Tras todos los bloques, concatenar en `all_enriched_cps[]` preservando orden original.

Emitir progreso por bloque:
```
Bloque {N}/{total} [{start}-{end}]  LISTO  ({seconds}s)
```

---

## PASO 3.5 — Deep mode (opt-in, post bloques shallow)

> **Solo se ejecuta si hay al menos 1 CP con deep mode resuelto a `true`.**
> Si todos los CPs del scope son shallow → omitir PASO 3.5 silenciosamente.
> Ver [`reference/atf-web/sofka-asdd-atf-web-cp-enricher-invariants-deep.md`](../reference/atf-web/sofka-asdd-atf-web-cp-enricher-invariants-deep.md).

### 3.5.1 — Resolver modo por CP

Para cada CP en `all_enriched_cps[]`, calcular `cp_mode` aplicando cascade:

```
1. Si "@enrich-deep" en cp.tags[]                            → "deep"
2. Else si deep_mode == true (flag run-level)                → "deep"
3. Else si appweb.yaml.enrichment.default_mode == "deep"         → "deep"
4. Else                                                       → "shallow"
```

Anotar en cada CP: `auto_inferred.mode_resolved` = `"shallow"` | `"deep"`.

### 3.5.2 — Para CPs con `cp_mode == "deep"`, invocar skill `enrich-deep-cp`

Para cada CP deep, leer:
- `notebook_id` desde `appweb.yaml → notebooklm.notebook_id`. Si vacío → ERROR
  bloqueante: "Deep mode requiere notebook_id configurado en appweb.yaml".
- `qa_data` desde el contexto del CP (extraer datos concretos si están en el
  CP, sino array vacío — el skill funciona sin qa_data).

Invocar:

```
[SKILL: sofka-asdd-atf-web-enrich-deep-cp]
cp: {objeto CP completo}
notebook_id: {appweb.yaml.notebooklm.notebook_id}
qa_data: {array, opcional}
app_name: {app_name}
flatten_setup: {flatten_setup, default false}
max_queries: 4
```

### 3.5.3 — Mergear el output del skill al CP del plan

El skill devuelve un objeto con:
- `steps_raw_enriched[]` — sustituye al producido por shallow.
- `auto_inferred.deep_mode = true` — marker para `cp-enricher.js`.
- `auto_inferred.deep_query_log_refs[]` — referencias para REGLA 8-DEEP.
- `auto_inferred.flatten_origin[]` — si `flatten_setup == true`.
- `auto_inferred.preconditions_origin[]`, `auto_inferred.expected_result_origin[]`.
- `query_log_entries[]` — agregar al `notebooklm_query_log.json` global.
- `enrichment_status` — `"DEEP_READY"` | `"DEEP_PARTIAL"`.

Mergear al CP del plan preservando todos los demás campos del shallow
(tags, gherkin, status_origin, etc.).

### 3.5.4 — Acumular query log

Concatenar `query_log_entries[]` de TODOS los CPs deep al
`{design_dir}/notebooklm_query_log.json` global. La escritura ocurre en
PASO 7 (delegada a `cp-enricher.js`).

### 3.5.5 — Reportar

```
DEEP MODE: {N_deep} CPs procesados ({N_ready} READY + {N_partial} PARTIAL)
  Queries NLM totales: {Q}
  Sources únicas: {S}
  Coverage promedio: {steps_enriched/steps_original}x
```

Si N_partial > 0 → mostrar lista de CPs con gaps al QA.

---

## PASO 4 — Construir plan consolidado

```json
{
  "module_id": "{module_id}",
  "source_file": "{source_inmutable}",
  "generated_at": "{ISO 8601}",
  "enriched_cps": []
}
```

Escribir `{design_dir}/enrichment_plan_{module_id}.json`.

---

## PASO 5 — Augmentacion con playbooks

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/augment-plan-with-playbooks.js \
  --plan    {design_dir}/enrichment_plan_{module_id}.json \
  --source  {source_inmutable} \
  --recipes .claude/agent-memory/{app_name}/navigation-recipes.md
```

### Gates
- Exit code DEBE ser `0`. Si falla -> detener y reportar al QA.
- stdout DEBE contener `augment-plan-with-playbooks — plan augmentado`.

---

## PASO 5.5 — Full Flatten: playbooks -> inline en steps_raw_enriched

### Proceso

Para cada CP del plan que tenga `auto_inferred.preconditions_playbook[]` con al
menos un playbook con `action: "execute"`:

1. **Leer los `setup_steps[]`** del playbook desde `navigation-recipes.md`.

2. **Resolver variables** en los setup_steps:
   - `{producto_cp}` -> `auto_inferred.h4_data_defaults.product`
   - `{plan_cp}` -> `auto_inferred.h4_data_defaults.plan`
   - `{fecha_efectiva}` -> `auto_inferred.h4_data_defaults.effective_date`
   - `{moneda_cp}` -> `auto_inferred.h4_data_defaults.currency`
   Si variable sin valor -> dejar literal (executor lo marca BLOCKED).

3. **Ordenar playbooks por `phase`** (1->setup, 2->navigation, 3->verification).

4. **Prefixar cada paso** con `[SETUP]`.

5. **Prepend al `steps_raw_enriched`:**
   ```
   steps_raw_enriched = flattened_setup_steps + '\n' + steps_raw_enriched_original
   ```
   Nota: el paso original que el playbook reemplaza (ej: "Crear registro manual
   en el sistema") se REMUEVE de steps_raw_enriched para evitar duplicacion.

6. **Registrar `setup_steps_count: N`**.

7. **Si playbook tiene `action: "block"`:** no expandir, marcar BLOCKED.

### Reescribir plan

Sobrescribir `enrichment_plan_{module_id}.json` con CPs flatteados.

---

## PASO 5.7 — Auto-resolve cascade (cerrar brechas)

### Cascade (en orden)

| Prioridad | Fuente | Tipo |
|-----------|--------|------|
| 1 | `data-recipes.md` | Local deterministic |
| 2 | `knowledge/app_behavior.{app}.md` | Local semantico |
| 3 | `navigation-recipes.md` | Local deterministic |
| 4 | NotebookLM | Externo (degradable) |

### Proceso

1. Identificar CPs con `ENRICHED_PARTIAL` que tengan queries con `resultado: null`.
2. Intentar fuentes 1-3 secuencialmente.
3. Si quedan gaps y NotebookLM disponible -> PASO 6.
4. Recalcular `enrichment_status`.

---

## PASO 6 — Resolver NotebookLM (centralizado, si aplica)

**Solo si NotebookLM habilitado Y quedan queries con `resultado: null`.**

### 6.1 — Recolectar queries pendientes (resultado: null, NO "PENDIENTE").

### 6.2 — Deduplicar por `(dato, archivo, context_key)`.
```
context_key = product_codes.sort().join(',') + '|' + plan_codes.sort().join(',')
```

### 6.3 — Resolver una vez por clave unica.
- RECIBIDO -> MCP NotebookLM.
- RECIBIDO (local) -> resolver específico de la app (si existe).
- PENDIENTE -> no consultar.

### 6.3.b — HUELLA AUDITABLE (REGLA 12)
Cada resolucion con resolved_value != null -> entrada en `notebooklm_query_log.json`:
```json
{
  "timestamp": "{ISO 8601}",
  "source": "notebooklm | local",
  "source_file": "{archivo}",
  "notebook_id": "{uuid o null}",
  "query_text": "{query literal}",
  "response_snippet": "{primeros ~500 chars}",
  "resolved_value": "{valor}",
  "propagated_to_cp_ids": ["CP-...", "..."]
}
```

### 6.4 — Propagacion fan-out.
Cada resolucion se propaga a TODOS los CPs que la referencian.

### 6.5 — Recalcular status.

### 6.6 — Reescribir plan.

---

## PASO 7 — Invocar `cp-enricher.js` (escritura deterministica)

**NO opcional. NO reemplazable por escritura directa.**

### 7.1 — Registrar mtime pre-ejecucion.

### 7.2 — Ejecutar

```bash
MSYS_NO_PATHCONV=1 node .claude/tools/cp-enricher.js \
  --plan   {design_dir}/enrichment_plan_{module_id}.json \
  --source {source_inmutable} \
  --output {design_dir}/cp_modulo_{module_id}.json \
  --backup
```

### 7.3 — GATE stdout canonico
stdout DEBE contener:
1. `cp-enricher — enriquecimiento aplicado`
2. `signature           : generated-by: cp-enricher.js v{x.y.z} (source-sha: {hash})`

Si falta -> `SCRIPT NO EJECUTADO — stdout canonico ausente`. No escribir output manualmente.

### 7.4 — GATE mtime
Confirmar que mtime cambio.

### 7.5 — GATE exit code
Exit code `0` obligatorio.

### 7.6 — Cleanup
Solo si TODOS los gates pasaron:
- Eliminar `enrichment_plan_{module_id}_batch_*.json` y `.done` (legacy de workers)
- Eliminar `{design_dir}/.tmp/` (inputs pre-filtrados legacy)
- Preservar: `cp_modulo_*.json`, `*_original.json`, `enrichment_report.md`,
  `notebooklm_query_log.json`, `playbook_coverage.json`

---

## PASO 8 — Presentar reporte

### 8.1 — Leer `enrichment_report.md`.

### 8.2 — GATE huella auditable
Primera linea DEBE ser `<!-- generated-by: cp-enricher.js | version: ... -->`.

### 8.3 — Mostrar resumen con stats de READY / ENRICHED_PARTIAL / NEEDS_REVIEW.
Incluir: CPs con [SETUP] inline, pasos promedio, "Decisiones runtime executor: 0".
Incluir: lista de acciones para alcanzar 100% READY (playbooks faltantes + datos).

### 8.4 — Checklist de cierre

```
## Checklist de cierre — CP Enricher

- [ ] Backup inmutable preservado (_original.json):          SI / NO
- [ ] Cobertura de playbooks analizada:                      SI / NO
- [ ] Bloques de 50 CPs procesados:                          {N}/{total}
- [ ] Plan consolidado escrito:                               SI / NO
- [ ] Augmentacion con playbooks ejecutada:                   SI / NO
- [ ] Full flatten aplicado:                                  SI / NO
- [ ] Auto-resolve cascade ejecutado:                         SI / NO
- [ ] cp-enricher.js ejecutado en bash:                       SI / NO
- [ ] Exit code:                                              0 / otro
- [ ] stdout contiene linea canonica:                         SI / NO
- [ ] stdout contiene signature:                              SI / NO
- [ ] enrichment_report.md tiene huella HTML:                 SI / NO
- [ ] cp_modulo_*.json NO fue escrito con Write:              SI / NO
- [ ] enrichment_report.md NO fue escrito con Write:          SI / NO
- [ ] notebooklm_query_log.json existe (si hubo resoluciones): SI / NO / N/A
- [ ] REGLA 12 verificada:                                   SI / NO / N/A
```

---

## REGLAS APLICABLES (por referencia — no duplicar texto)

| Regla | Fuente | Aplicacion |
|---|---|---|
| REGLA 7 | sofka-asdd-atf-web-cp-enricher-invariants.md | Schema del plan y CPs: exacto, sin campos extra |
| REGLA 8 | sofka-asdd-atf-web-cp-enricher-invariants.md | No inventar pasos ni datos (modo shallow) |
| REGLA 9 | sofka-asdd-atf-web-cp-enricher-invariants.md | Nunca editar cp_modulo_*.json directamente |
| REGLA 10 | sofka-asdd-atf-web-cp-enricher-invariants.md | Output exclusivo de cp-enricher.js |
| REGLA 11 | sofka-asdd-atf-web-cp-enricher-invariants.md | Verificar huella auditable stdout + reporte |
| REGLA 12 | sofka-asdd-atf-web-cp-enricher-invariants.md | Toda resolucion NotebookLM con entrada en log |
| REGLA 8-DEEP | sofka-asdd-atf-web-cp-enricher-invariants-deep.md | Inferencia de steps con cita NLM obligatoria (modo deep) |
| REGLA 4-DEEP | sofka-asdd-atf-web-cp-enricher-invariants-deep.md | Flatten opcional setup_steps → steps (modo deep, opt-in) |
| REGLA 14-DEEP | sofka-asdd-atf-web-cp-enricher-invariants-deep.md | Deep nunca degrada shallow (sin opt-in = comportamiento intacto) |
