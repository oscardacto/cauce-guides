# Reglas compartidas del pipeline CP Enricher

> **Propósito:** Single Source of Truth para los invariantes que deben respetar
> el agente unificado (`cp-enricher`), el skill (`enrichment-analyzer`) y el
> script determinístico (`cp-enricher.js`).
>
> **Aplicabilidad por capa:**
>
> | REGLA | Agente (cp-enricher) | Skill (enrichment-analyzer) | Script (cp-enricher.js) |
> |---|---|---|---|
> | 7 — Fidelidad de estructura | ✅ | ✅ | ✅ (ya aplica al escribir) |
> | 8 — Fidelidad de contenido | ✅ | ✅ | — |
> | 9 — Anti-inline | ✅ | ✅ | — |
> | 10 — Prohibido escribir outputs | ✅ | ✅ | N/A (el script ES el output) |
> | 11 — Huella auditable (stdout + primera línea del reporte) | ✅ | — | ✅ (genera la huella) |
> | 12 — Huella auditable de resoluciones NotebookLM | ✅ | — | ✅ (verifica cross-ref al aplicar) |
> | 13 — Fragmentación de pasos compuestos (agnóstica) | — | ✅ (documenta en H0, no aplica) | ✅ (aplica via `tools/lib/step-splitter.js`) |

---

## REGLA 7 — FIDELIDAD DE ESTRUCTURA

Los objetos JSON producidos por el pipeline deben respetar exactamente el esquema
canónico definido en la spec del agente correspondiente. NO agregar wrappers,
metadatos adicionales ni campos de conveniencia.

**Aplica a:**
- Agente unificado: el plan consolidado (`enrichment_plan_{module_id}.json`) debe contener
  exactamente `{ module_id, source_file, generated_at, enriched_cps[] }`. Sin campos extra.
- Los objetos dentro de `enriched_cps[]` deben tener exclusivamente los campos
  canónicos definidos en el schema del skill `enrichment-analyzer`, más los campos
  añadidos por `augment-plan-with-playbooks.js` (`auto_inferred.preconditions_playbook[]`,
  `auto_inferred.preconditions_source`) y el flatten (`setup_steps_count`).
- Cuando `--flatten` está activo, cada CP puede incluir `setup_steps_count: N` indicando
  cuántos pasos `[SETUP]` fueron prepended a `steps_raw_enriched`.

**Racional:** `cp-enricher.js` consume una forma estable. Cambios silenciosos de esquema
rompen el script sin error claro.

---

## REGLA 8 — FIDELIDAD DE CONTENIDO

No inventar pasos, títulos ni datos que no existan en el CP original.

Específicamente:
- No modificar `title` del CP ni del escenario Gherkin.
- No inferir pasos desde `expected_result` — solo reescribir los pasos que ya existen
  en `steps_raw` con lenguaje activo.
- La resolución de NotebookLM solo sustituye marcadores de datos, nunca inventa pasos nuevos.

**Racional:** El contrato con el equipo de negocio es que el Excel refleja
exactamente lo que ellos diseñaron. Agregar pasos rompe auditabilidad y confunde el
review.

---

## REGLA 9 — ANTI-INLINE PARA TRANSFORMACIONES

Los agentes LLM NUNCA editan `cp_modulo_*.json` directamente. Toda modificación de
la matriz ocurre exclusivamente vía `cp-enricher.js`, invocado por el orquestador.

**Aplica a:** Agente unificado (cp-enricher), skill (enrichment-analyzer).

**Racional:** separar análisis (LLM) de aplicación (script determinístico) permite
huella auditable y previene alucinación.

---

## REGLA 10 — PROHIBIDO ESCRIBIR OUTPUTS DEL SCRIPT (INVIOLABLE)

Los dos archivos siguientes son output EXCLUSIVO de `cp-enricher.js`:
- `cp_modulo_*.json` (matriz enriquecida)
- `enrichment_report.md` (reporte de ejecución)

Está **TERMINANTEMENTE PROHIBIDO** que cualquier agente LLM (cp-enricher,
enrichment-analyzer, o cualquier otro) los escriba usando `Write`, `Edit`,
`NotebookEdit` o cualquier otro mecanismo directo, **sin importar**:
- El agente falla → detener y reportar, NO reemplazar.
- El volumen de CPs es alto → procesar en más bloques, NO escribir inline.
- El QA pide ir rápido → el rápido siempre es el script.
- El script reporta un error → detener y diagnosticar, NO improvisar output alternativo.

**Si un agente detecta que escribió alguno de esos archivos:**
1. Detenerse inmediatamente.
2. Reportar al stdout del agente: `VIOLACIÓN REGLA 10 — output escrito inline`.
3. Eliminar el archivo inline.
4. En el caso del worker, NO escribir el sentinel `.done` — el orchestrator detectará el fallo.

---

## REGLA 11 — HUELLA AUDITABLE (STDOUT + REPORTE)

`cp-enricher.js` inserta una huella verificable en dos lugares:

1. **stdout** — línea literal:
   ```
   signature           : generated-by: cp-enricher.js v{x.y.z} (source-sha: {hash})
   ```

2. **Primera línea de `enrichment_report.md`**:
   ```html
   <!-- generated-by: cp-enricher.js | version: {v} | run: {ISO-timestamp} | source-sha: {hash} -->
   ```

**El agente unificado (cp-enricher) DEBE verificar ambas antes de declarar éxito.**

Si alguna huella falta → el reporte es **inválido sin excepción**. Reportar al QA:
- `SCRIPT NO EJECUTADO — stdout canónico ausente` (si falta stdout).
- `Reporte sin huella canónica — posible violación REGLA 10` (si falta en el reporte).

---

## REGLA 12 — HUELLA AUDITABLE DE RESOLUCIONES NOTEBOOKLM (INVIOLABLE)

Toda `notebooklm_query` propagada al plan con `resultado ≠ null` y `≠ "PENDIENTE"`
DEBE producir una entrada verificable en `{design_dir}/notebooklm_query_log.json`:

```json
{
  "timestamp": "{ISO 8601}",
  "source": "notebooklm" | "local",
  "source_file": "{archivo consultado}",
  "notebook_id": "{uuid o null si local}",
  "query_text": "{query literal enviada}",
  "response_snippet": "{primeros ~500 chars de la respuesta cruda}",
  "resolved_value": "{valor final inyectado en el plan}",
  "propagated_to_cp_ids": ["CP-...", "..."]
}
```

**Regla de oro:** *"Sin huella en el log → no se puede inyectar valor."*

Si el orchestrator no consiguió invocar la fuente (MCP caído, CSV ausente, etc.), el
resultado DEBE quedar en `null` y el status del CP en `ENRICHED_PARTIAL`. No existen
excepciones.

**Está TERMINANTEMENTE PROHIBIDO:**
- Inyectar valores por inferencia del modelo ("yo creo que son los tipos estándar").
- Copiar un valor observado en otro CP sin consultar la fuente para el contexto actual.
- Elevar `ENRICHED_PARTIAL` → `READY` sin la entrada de log correspondiente.

### Verificación programática

`cp-enricher.js` **bloquea programáticamente** la aplicación del plan si detecta
una `notebooklm_query.resultado` no-null sin entrada correspondiente en el log. La
función `enforceRegla12()` del script recorre todas las queries resueltas y verifica
que cada (cp_id, source_file) esté cubierto.

**Exit code 1 con mensaje explícito** si la verificación falla. No es posible generar
un output inválido por violación de REGLA 12 — el script lo previene.

### Patrón que previene

Sin esta verificación, un plan consolidado podría mostrar `resultado` no-null
mientras los fragmentos de workers tienen `resultado: null` — promoviendo CPs a
`READY` con valores inventados (no consultados contra fuentes). La verificación
programática del script bloquea ese patrón: sin entrada en el log de queries, no
se puede inyectar valor al plan.

---

## REGLA 13 — FRAGMENTACIÓN DE PASOS COMPUESTOS (AGNÓSTICA)

Cuando una línea de `steps_raw` contiene una **conjunción explícita** seguida de
un **verbo acción**, el enricher DEBE fragmentarla en entradas separadas de
`steps_raw[]` durante la aplicación del plan. Esto garantiza que el executor
emita 1 screenshot por acción atómica (REGLA 1 — fidelidad 1:1 en ejecución)
incluso cuando el diseñador del CP escribió 2 acciones en una sola línea.

**Conjunciones reconocidas:**
- `" Y "` (mayúscula, con espacios)
- `", luego "`, `" luego de "`
- `", después "`, `", despues "`
- `", posteriormente "`, `" posteriormente "`

**Salvaguardas (anti-false-positive):**
- El lado derecho debe empezar con un **verbo acción** del lexicon
  parametrizado en `tools/lib/step-splitter.js` (guardar, crear, modificar,
  verificar, etc.) o con un sujeto conocido + verbo (`el usuario guarda`,
  `el sistema calcula`).
- El lado izquierdo debe tener ≥ 12 caracteres (evita falsos positivos tipo
  `"Guardar Y validar"` que en realidad son un header).
- Si ninguna conjunción pasa las salvaguardas, el step permanece como está.

**NO viola REGLA 8** (fidelidad de contenido / no inventar pasos): la conjunción
está literalmente escrita por el diseñador. El splitter sólo explicita la
sintaxis compuesta — no inventa intención ni añade contenido nuevo.

**Aplica a:**

| Capa | Responsabilidad |
|---|---|
| `tools/lib/step-splitter.js` | **Fuente única de verdad** (determinista). Expone `splitStepsRaw()` + `splitStep()`. Tiene self-test CLI (`node step-splitter.js`). |
| `cp-enricher.js` | Invoca `splitStepsRaw()` al aplicar `steps_raw_enriched` del plan. Registra `auto_inferred.steps_split` + stats globales en el reporte. |
| `enrichment-analyzer` skill (H0) | Documenta el comportamiento esperado para que el LLM NO intente fragmentar a mano (evita alucinación). El skill puede preservar `" Y "` en el output — el script lo procesa al final. |

**Campo de auditoría (por CP afectado):**

```json
"auto_inferred": {
  "steps_split": {
    "applied": true,
    "input_lines": 1,
    "output_lines": 2,
    "splits_applied": 1
  }
}
```

**Agnosticismo:** esta regla usa sólo patrones del español estándar + un
lexicon genérico de verbos. Funciona para VITAL (seguros), Fogafin (finanzas),
SauceDemo (retail) y cualquier app en español sin configuración app-specific.
Para ampliar el lexicon con verbos de dominio (ej. jerga bancaria), editar
`ACTION_VERBS` en `tools/lib/step-splitter.js` — el cambio beneficia a todas
las apps por igual.

---

## Cómo actualizar estas reglas

1. Editar este archivo.
2. Si cambia la semántica de alguna regla → verificar que los 3 agentes + el script
   siguen siendo consistentes.
3. Si se agrega una regla nueva → actualizar la tabla de aplicabilidad al inicio.
4. Si una regla aplica a una nueva capa → agregar la referencia en la spec del agente
   correspondiente.

**No duplicar el contenido en las specs de los agentes.** Cada agente referencia las
reglas que le apliquen por ID, no reescribe el texto.
