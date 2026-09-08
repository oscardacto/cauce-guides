---
description: ATF Web enriquecimiento — convierte la matriz de CPs en instrucciones deterministas, sin inferencia para el executor.
mode: 'agent'
---

## PROPÓSITO

**Transformar CPs ambiguos (tal como vienen del Excel) en instrucciones de ejecución
deterministas.** El executor que reciba un CP enriquecido tiene CERO decisiones que
tomar — solo sigue pasos literales.

Casos de uso:
- Enriquecer toda la matriz de un módulo antes de ejecutar
- Re-enriquecer después de crear nuevos playbooks (siempre desde `_original.json`)
- Enriquecer un subconjunto de CPs (por ID o por módulo)

---

## PASO 1 — Parsear scope del QA

El QA puede invocar `/asdd:qa-web-enrich` de 3 formas:

| Invocación | Scope | Ejemplo |
|---|---|---|
| `/asdd:qa-web-enrich` (sin argumentos) | Todos los módulos del run activo | Procesa todos los `cp_modulo_*.json` |
| `/asdd:qa-web-enrich @module:Matriz_1` | Un módulo específico | Solo `cp_modulo_Matriz_1.json` |
| `/asdd:qa-web-enrich @cp:CP-Matriz_1-7,02,3` | Un CP específico | Solo ese CP dentro de su módulo |

### Flags opcionales (opt-in deep mode)

| Flag | Tipo | Default | Descripción |
|---|---|---|---|
| `--deep` | boolean | `false` | Activa deep mode para TODOS los CPs del scope. Requiere `appweb.yaml → notebooklm.notebook_id` configurado. Ver [`reference/atf-web/asdd-atf-web-cp-enricher-invariants-deep.md`](../reference/atf-web/asdd-atf-web-cp-enricher-invariants-deep.md). |
| `--flatten` | boolean | `false` | Solo aplica con `--deep`. Fusiona `setup_steps[]` en `steps_raw_enriched` con prefix `[SETUP]` (REGLA 4-DEEP). |

**Cascade de modo (por CP)** — quien gana:
1. `cp.tags["@enrich-deep"]` (CP-level) → deep, ignora flags.
2. `--deep` (run-level) → deep para todos los CPs del scope sin tag opt-out.
3. `appweb.yaml → enrichment.default_mode == "deep"` (app-level) → deep default.
4. Sino → shallow (doctrina actual, baseline 5:09 min preservado).

**Ejemplos:**

```bash
/asdd:qa-web-enrich @cp:CP-M_1-1.1 --deep                # 1 CP en deep
/asdd:qa-web-enrich @module:M_1 --deep                   # módulo completo en deep
/asdd:qa-web-enrich --deep --flatten                     # todos en deep, con flatten
/asdd:qa-web-enrich @module:M_1                          # shallow (default), un solo CP del módulo
                                             # con tag @enrich-deep va igual a deep
```

**Costo proyectado de `--deep`:** ~1-4 queries NotebookLM por CP (~30-60 s/CP).
Para masificación, ver [c:\tmp\1110-experimento-doctrina.md](c:\tmp\1110-experimento-doctrina.md)
sobre templates de query reusables por bloque-evento (~80 queries totales para
HU1110 vs ~7900 sin templates).

**Resolución de paths:**
1. Leer `appweb.yaml` → obtener `run_id` y `app.name`.
2. `design_dir = docs/testing/atf-web/{run_id}/design/`.
3. Según scope:
   - `todos` → buscar todos los `cp_modulo_*_original.json` en `design_dir`.
     Si no existen `_original.json`, usar `cp_modulo_*.json` (el script `cp-enricher.js --backup` los creará).
   - `@module:X` → buscar `cp_modulo_{X}_original.json` (o `cp_modulo_{X}.json`).
   - `@cp:CP-X` → inferir módulo desde el CP-ID, buscar archivo del módulo.

Si el QA no especifica scope, preguntar:
> ¿Quieres enriquecer toda la matriz o un módulo/CP específico?

---

## PASO 2 — Invocar agente unificado

Invocar al agente `CP Enricher` con los parámetros resueltos:

```
[AGENT]
agent: "CP Enricher"
prompt: |
  Lee y ejecuta las instrucciones en:
  {project-root}/.claude/atf-web-steps/enrich.md

  Parámetros:
  - scope: {scope resuelto — "todos" | cp_id | module_id}
  - design_dir: {design_dir}
  - app_name: {app.name}
  - run_id: {run_id}
  - deep_mode: {true si --deep, sino false}
  - flatten_setup: {true si --flatten, sino false}
```

---

## PASO 3 — Verificar resultado

Al terminar el agente, verificar:
1. `enrichment_report.md` existe y tiene huella canónica (REGLA 11).
2. `playbook_coverage.json` existe (análisis de cobertura).
3. Mostrar resumen al QA con stats de READY / ENRICHED_PARTIAL / NEEDS_REVIEW.

Si hay gaps de playbooks:
```
⚠️ Para alcanzar 100% cobertura, crear los playbooks listados en
   playbook_coverage.json y ejecutar /asdd:qa-web-enrich de nuevo.
```
