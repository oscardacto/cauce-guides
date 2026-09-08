# Reglas del enrich profundo (deep mode) — opt-in

> **Propósito:** SSOT para los invariantes que aplican EXCLUSIVAMENTE cuando un CP
> se procesa en modo `deep`. Las reglas del enrich shallow
> ([sofka-asdd-atf-web-cp-enricher-invariants.md](sofka-asdd-atf-web-cp-enricher-invariants.md)) **siguen vigentes** en
> shallow y son la doctrina default. Este archivo solo aplica cuando hay opt-in
> explícito (flag `--deep` o tag `@enrich-deep` en el CP).
>
> **Cuándo usar deep mode:** cuando el enrich shallow produce pasos genéricos no
> auto-suficientes para ejecución agéntica (porque los CPs originales asumen
> conocimiento implícito de la app). Deep infiere steps de navegación + validación
> inline desde NotebookLM con cita auditable.
>
> **Aplicabilidad por capa:**
>
> | REGLA | Skill enrich-deep-cp | Skill enrichment-analyzer | Agent cp-enricher | Script cp-enricher.js |
> |---|---|---|---|---|
> | 8-DEEP — Inferencia con cita NLM obligatoria | ✅ produce | ✅ enruta CPs `@enrich-deep` | ✅ flag `--deep` global | ✅ valida cita en plan |
> | 4-DEEP — Flatten opcional setup → steps | ✅ produce | — | — | ✅ acepta flatten=true |
> | 14-DEEP — Modo deep nunca cambia output del shallow | ✅ default opt-in | ✅ sin flag = shallow | ✅ sin flag = shallow | ✅ idem |

---

## REGLA 8-DEEP — INFERENCIA DE STEPS CON CITA NLM OBLIGATORIA

Sustituye REGLA 8 (anti-inferencia) **solo cuando `enrich_mode == "deep"`**.

**Permitido en deep mode:**
- Inferir steps que no están literalmente en `steps_raw` original, derivándolos
  de `precondiciones`, `expected_result`, `caracteristicas` o `descripcion_funcional`.
- Inyectar conocimiento de navegación (módulos, pestañas, botones literales) que
  no está en el CP, siempre que provenga de NotebookLM o de las fuentes locales
  documentadas en `app_behavior.{app}.md` / `navigation-recipes.md`.
- Resolver valores de catálogo concretos (ej. `"Fallecimiento por enfermedad"`)
  derivados de NotebookLM.
- Consolidar verificaciones del `expected_result` como steps de validación final
  numerados dentro del flujo.

**Inviolable — anti-alucinación:**

Cada step inferido (presente en `steps_raw_enriched` y AUSENTE en `steps_raw`
original) DEBE tener una entrada correspondiente en
`{design_dir}/notebooklm_query_log.json` cuyo `resolved_value` cubra
semánticamente el contenido del step. Sin esa entrada → el plan es **inválido**.

**Verificación programática:**
- `cp-enricher.js` extiende `enforceRegla12()` con `enforceRegla8Deep()`.
- Si detecta un step en `steps_raw_enriched` no derivable del original ni del log
  → exit 1 con mensaje:
  `VIOLACIÓN REGLA 8-DEEP — step inferido sin huella NotebookLM en CP {cp_id}`.

**Estados resultantes (extienden el set actual):**
- `DEEP_READY` — todos los steps inferidos tienen cita NLM.
- `DEEP_PARTIAL` — al menos 1 step inferido sin cita; ese step queda con
  marker `[GAP — sin huella NotebookLM]` y el CP NO va al executor en deep mode
  (el QA decide si baja a shallow o agrega knowledge).

---

## REGLA 4-DEEP — FLATTEN OPCIONAL DE SETUP_STEPS EN STEPS

Sustituye REGLA 4 (separación strict setup_steps vs steps) **solo cuando**:
- `enrich_mode == "deep"` Y
- el CP tiene tag `@flatten-setup`, O
- el run se invocó con flag `--deep --flatten`.

**Permitido:**
- Fusionar `setup_steps[]` (playbooks de precondición) como steps `[1..N]` al
  inicio del flujo, dentro de `steps_raw_enriched` con prefix `[SETUP]`.
- El campo `setup_steps[]` queda igualmente poblado para retro-compatibilidad,
  pero `steps_raw_enriched` ahora es la SSoT para el executor.

**Inviolable:**
- `auto_inferred.flatten_origin[]` debe registrar qué steps de `steps_raw_enriched`
  vienen del flatten:
  ```json
  "flatten_origin": [
    {"step_index": 0, "source": "playbook:P3", "step_in_playbook": 1},
    {"step_index": 1, "source": "playbook:P3", "step_in_playbook": 2},
    {"step_index": 2, "source": "steps_raw_original", "step_in_original": 1}
  ]
  ```
- El conteo final de `steps[]` que el executor verá DEBE coincidir con
  `steps_raw_enriched.length` (REGLA 1 de executor-invariants se mantiene).

**Auditoría retro-comp:**
- Sin tag `@flatten-setup` → comportamiento de REGLA 4 original (setup_steps
  separados).

---

## REGLA 14-DEEP — DEEP NUNCA DEGRADA SHALLOW (INVIOLABLE)

El opt-in al deep mode debe ser **siempre explícito** y **no debe afectar
ningún CP** sin opt-in. Reglas operativas:

1. Sin flag `--deep` Y sin tag `@enrich-deep` en `cp.tags[]` → el CP se procesa
   en modo shallow EXACTAMENTE como antes. Doctrina actual intacta.
2. El shape del `cp_modulo_*.json` final no cambia para CPs shallow. Cero
   campos nuevos, cero modificaciones de campos existentes para esos CPs.
3. Para CPs deep, los campos nuevos (`auto_inferred.deep_mode: true`,
   `auto_inferred.deep_query_log_refs[]`, `auto_inferred.flatten_origin[]`)
   son ADITIVOS — solo presentes si el CP fue procesado en deep.
4. El executor lee el mismo `cp_modulo_*.json` y NO necesita saber si fue
   shallow o deep — `steps_raw_enriched` es contractualmente self-sufficient
   en ambos modos.
5. Métricas baseline (ej. 5:09 min para un run continuation con 1 CP shallow)
   no deben degradarse. Cualquier overhead de deep ocurre **antes** de la
   ejecución (en fase enrich), nunca durante FASE 2C.

---

## Activación (3 niveles, cascade tag > flag > default)

```yaml
# Nivel app — appweb.yaml (default por app)
enrichment:
  default_mode: "shallow"   # shallow (default) | deep
  notebook_id: "..."        # requerido si default_mode = deep

# Nivel run — flag CLI
/sofka-asdd:qa-web-enrich --deep                          # todos los CPs del scope en deep
/sofka-asdd:qa-web-enrich --module M_1 --deep             # módulo específico en deep
/sofka-asdd:qa-web-enrich --deep --flatten                # deep + flatten setup_steps

# Nivel CP — tag en steps_raw del JSON
{ "cp_id": "...", "tags": ["@enrich-deep"] }
{ "cp_id": "...", "tags": ["@enrich-deep", "@flatten-setup"] }
```

**Resolución del modo (por CP):**
1. Si `cp.tags` contiene `@enrich-deep` → modo deep.
2. Else si run se invocó con `--deep` → modo deep.
3. Else si `appweb.yaml → enrichment.default_mode == "deep"` → modo deep.
4. Else → modo shallow (doctrina actual).

---

## Cómo extender estas reglas

1. Agregar nueva regla aquí con sufijo `-DEEP`.
2. Si la regla aplica a `cp-enricher.js` → ampliar `enforceRegla8Deep()` o
   crear hermano (`enforceReglaXDeep()`).
3. Si aplica a `enrich-deep-cp` skill → referenciar por ID en su prosa, no
   duplicar texto.
4. Si la regla **modifica** una regla existente del shallow:
   - Documentar explícitamente cuál sustituye y bajo qué condición.
   - NUNCA editar `sofka-asdd-atf-web-cp-enricher-invariants.md` (shallow). Esa doctrina es estable.
5. Mantener REGLA 14-DEEP como invariante: cualquier patch que introduzca
   regresión en shallow debe revertirse.
