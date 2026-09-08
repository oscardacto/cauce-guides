---
name: asdd-atf-web-enrich-deep-cp
description: Enriquecimiento profundo opt-in de un CP — steps imperativos auto-suficientes con cita NotebookLM.
used_by:
  - asdd-atf-web-qa-engineer
---

# Skill: enrich-deep-cp

> **Modo:** opt-in dentro del enrich pipeline. Solo se invoca si:
> (a) el CP tiene tag `@enrich-deep` en `cp.tags[]`, O
> (b) el run se lanzó con flag `--deep`, O
> (c) `appweb.yaml → enrichment.default_mode == "deep"`.
>
> **Aplica:** [`reference/atf-web/asdd-atf-web-cp-enricher-invariants-deep.md`](../../reference/atf-web/asdd-atf-web-cp-enricher-invariants-deep.md) — REGLA 8-DEEP, REGLA 4-DEEP, REGLA 14-DEEP.
>
> **Reusa:** [`notebooklm-query`](../asdd-atf-web-notebooklm-query/SKILL.md) para queries individuales.
>
> **Origen:** experimento manual sobre CP 1.1 HU1110 (Siniestros) — pasó de 6 steps genéricos a 17 steps imperativos auto-suficientes con cita NLM.

---

## INPUT

| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| `cp` | object | Sí | Objeto CP completo del `cp_modulo_*_original.json` (con campos `cp_id`, `funcional`, `descripcion_funcional`, `caracteristicas`, `precondiciones`, `steps_raw`, `expected_result`, `tags[]`, etc. Schema canónico del enrich shallow) |
| `notebook_id` | string | Sí | UUID del cuaderno NotebookLM (de `appweb.yaml → notebooklm.notebook_id` o pasado explícito) |
| `qa_data` | array | No | Datos concretos que aporta el QA: `[{clave: "Póliza objetivo", valor: "V0000000220748"}, ...]`. Si vacío, se omite la inyección de datos |
| `app_name` | string | Sí | Para resolver `agent-memory/{app}/notebooklm-inventory.md` y `knowledge/app_behavior.{app}.md` (contexto local previo a NLM) |
| `flatten_setup` | boolean | No (default: false) | Si true, fusiona `setup_steps[]` en `steps_raw_enriched` con prefix `[SETUP]` (REGLA 4-DEEP) |
| `max_queries` | number | No (default: 4) | Tope de queries NLM por CP. Si se alcanza sin resolver todos los huecos, devuelve `DEEP_PARTIAL` |

## OUTPUT

```json
{
  "status": "DEEP_READY | DEEP_PARTIAL | FAILED",
  "cp_id": "...",
  "steps_raw_enriched": ["paso 1", "paso 2", ...],
  "auto_inferred": {
    "deep_mode": true,
    "deep_query_log_refs": ["q1_uuid", "q2_uuid", ...],
    "flatten_origin": [...] | null,
    "preconditions_origin": [{"step_index": 0, "from": "precondicion_1"}, ...],
    "expected_result_origin": [{"step_index": 14, "from": "expected_result"}, ...]
  },
  "query_log_entries": [
    {
      "uuid": "q1_uuid",
      "timestamp": "ISO8601",
      "query_text": "...",
      "response_snippet": "...",
      "resolved_value": "...",
      "sources_used": ["source_id_1", "source_id_2"]
    }
  ],
  "gaps": [
    {"step_index": 5, "reason": "no_nlm_coverage", "fallback": "[GAP — sin huella NotebookLM]"}
  ],
  "metrics": {
    "queries_launched": 0,
    "steps_original": 0,
    "steps_enriched": 0,
    "sources_unique": 0
  }
}
```

**El skill NO escribe archivos.** El caller (agent_cp-enricher) recibe este objeto
y lo merge al plan consolidado. La escritura final del `cp_modulo_*.json` es
responsabilidad de `cp-enricher.js` (REGLA 9 / REGLA 10 del enrich shallow se
mantienen).

---

## PROCESO POR CP (4 fases secuenciales)

### Fase 1 — Análisis de huecos

**Objetivo:** detectar qué conocimiento NO está en el CP original y qué
debe inferirse para que un agente IA ejecute sin alucinar.

Para cada step de `cp.steps_raw`, clasificar el hueco:

| Categoría | Señal | Acción |
|---|---|---|
| **Navegación abstracta** | "Ingresar a", "Ubicar", "Acceder a", sin módulo/pestaña/botón literal | Query NLM sobre ruta exacta de navegación |
| **Valor de catálogo no resuelto** | "el tipo de X", "la opción Y" sin enumerar opciones | Query NLM sobre valores válidos del catálogo |
| **Verificación implícita** | "Validar que el sistema permite ...", "Verificar el resultado esperado" | Mover el contenido de `expected_result` a steps numerados al final |
| **Trigger ambiguo** | "Se ejecuta automáticamente ...", sin actor claro | Query NLM CRÍTICA: ¿quién dispara? ¿usuario o sistema? |
| **Precondición mecánica** | en `cp.precondiciones`, ej. "La póliza está en estado X" | Convertir en step de verificación previa numerado |
| **Producto/caso excluido** | "no aplica para X", "excepto Y" | Convertir en step de validación blocker antes del flujo |

Output de la fase 1: `gaps_detected[]` con shape:
```json
{ "step_index_origen": 4, "categoria": "trigger_ambiguo", "query_propuesta": "..." }
```

### Fase 2 — Diseño de batería de queries

Convertir `gaps_detected[]` en queries para NotebookLM, ordenadas por prioridad:

1. **CRÍTICAS PRIMERO** — la query que define la forma del flujo (ej. trigger
   ambiguo). Si esta queda mal, todo lo demás se cae.
2. **NAVEGACIÓN END-TO-END** — 1 query consolidada que cubra la ruta completa
   con datos del QA inyectados.
3. **DATOS PUNTUALES** — valores de catálogo, productos excluidos, mapas.

**Tope `max_queries`:** consolidar queries cuando sea posible para no exceder.
Empíricamente, 4 queries cubren un CP completo. Si los huecos exceden 4,
producir `DEEP_PARTIAL` y enumerar los `gaps` no resueltos en el output.

**Cada query debe:**
- Citar literalmente el contexto del CP (descripcion_funcional + precondiciones
  + steps_raw + expected_result + notas).
- Incluir `qa_data` cuando aplique.
- Pedir respuesta literal con citas a sources, NO paráfrasis.
- Solicitar valor concreto, no genérico.

### Fase 3 — Ejecución de queries

Invocar el skill `notebooklm-query` para cada query. **Mantener el mismo
`conversation_id`** entre queries del mismo CP — cada query construye sobre la
anterior.

```
[SKILL: asdd-atf-web-notebooklm-query]
mode: query
notebook_id: {notebook_id}
query: {query_n}
conversation_id: {anterior, o null si es primera}
fallback: true
```

Tras cada respuesta:
1. Capturar `conversation_id` para reusar en siguiente query.
2. Anotar `sources_used`.
3. Guardar entrada para `query_log_entries[]` con shape de REGLA 12.
4. Verificar si la respuesta resolvió el hueco. Si no, agregar follow-up
   (cuenta contra `max_queries`).

**Errores:**
- Si NLM retorna `unavailable` → status `FAILED`. NO inferir steps sin
  cobertura NLM.
- Si NLM retorna `empty` después de fallback → marcar el hueco como GAP,
  continuar con los demás.

### Fase 4 — Construcción del array enriquecido

Producir `steps_raw_enriched[]` siguiendo este orden canónico:

1. **Steps de validación previa** — convertir cada precondición de
   `cp.precondiciones` en un step imperativo con verbo `Verificar` /
   `Confirmar`. Marcar con `✋ Si no se cumple → status BLOCKED`. Anotar
   `preconditions_origin[]`.

2. **Steps de validación de exclusiones** — si el CP excluye productos/casos
   (precondición tipo "NO es de los productos X, Y, Z"), convertir en step
   con marca de blocker.

3. **Steps de navegación + acción** — reescribir cada step de `cp.steps_raw`
   en lenguaje imperativo, inyectando:
   - Módulos/menús/pestañas/botones literales (de queries NLM).
   - Valores concretos de catálogo (de queries NLM o `qa_data`).
   - Datos del QA (póliza, cliente, etc.).
   Cada step nuevo (no derivable del original) debe registrarse en
   `deep_query_log_refs[]`.

4. **Steps de procesamiento** — si el CP tiene un paso "ejecutar/procesar"
   ambiguo, expandirlo según el flujo OIPA/sistema concreto (ej.
   "Click Guardar → Click ícono Play").

5. **Steps de verificación final** — convertir `cp.expected_result` en
   steps numerados de verificación. Cada elemento del expected_result
   (póliza cambia a estado X, cobertura cambia a Y, etc.) es 1 step
   independiente. Anotar `expected_result_origin[]`.

**Reglas de redacción de cada step:**
- Empieza con verbo en infinitivo o imperativo (Iniciar, Navegar, Verificar,
  Hacer clic, Seleccionar, Capturar, Confirmar, Registrar...).
- Incluye TODO el conocimiento inline (módulo, pestaña, botón literal,
  valores válidos).
- NO incluye citas inline en el texto del step (la trazabilidad va en
  `deep_query_log_refs[]`).
- Steps de verificación con condición blocker incluyen marca textual
  `✋ Si X → status BLOCKED`.

### Salida de la fase 4

Construir el objeto OUTPUT (shape arriba). Validar:
- Cada step nuevo (no presente en steps_raw original) tiene al menos 1 entrada
  en `deep_query_log_refs[]`. Si falla → ese step entra a `gaps[]` con marca.
- Si `gaps.length > 0` → status `DEEP_PARTIAL`.
- Si `gaps.length == 0` Y `queries_launched > 0` → status `DEEP_READY`.
- Si `queries_launched == 0` (todos los huecos resueltos por contexto local
  pre-NLM) → también `DEEP_READY`.

---

## CONTRATO CON CP-ENRICHER.JS

El skill devuelve el objeto OUTPUT al caller (`agent_cp-enricher`). El agente
debe insertarlo en el plan consolidado bajo el CP correspondiente:

```json
{
  "cp_id": "...",
  "steps_raw_enriched": [...],   // ← del skill
  "auto_inferred": {
    "deep_mode": true,           // ← marcador
    "deep_query_log_refs": [...],
    ...
  },
  "enrichment_status": "DEEP_READY | DEEP_PARTIAL"
}
```

Y agregar las `query_log_entries[]` al `notebooklm_query_log.json` global del
módulo (para que `enforceRegla8Deep()` valide).

---

## REGLAS APLICABLES

| Regla | Fuente | Aplicación |
|---|---|---|
| REGLA 8-DEEP | asdd-atf-web-cp-enricher-invariants-deep.md | Inferencia con cita NLM obligatoria por step nuevo |
| REGLA 4-DEEP | asdd-atf-web-cp-enricher-invariants-deep.md | Flatten opcional setup → steps |
| REGLA 14-DEEP | asdd-atf-web-cp-enricher-invariants-deep.md | Sin opt-in → comportamiento shallow intacto |
| REGLA 12 | asdd-atf-web-cp-enricher-invariants.md | Toda resolución NLM con entrada en log (heredada) |
| REGLA 9 | asdd-atf-web-cp-enricher-invariants.md | El skill NO escribe archivos (heredada) |

---

## EJEMPLO MÍNIMO (CP 1.1 HU1110, validado experimentalmente)

**Input:**
```json
{
  "cp": {
    "cp_id": "CP-M_1-1.1",
    "funcional": "HU1110 CA 1",
    "descripcion_funcional": "Habilitar la ejecución automática de la actividad Apertura de siniestro para coberturas de riesgo Fallecimiento en los estados habilitados de la póliza",
    "caracteristicas": "[Vigor - Vigor] Habilitación de la actividad Apertura de siniestro automática",
    "precondiciones": "1. La póliza está en estado \"Vigor - Vigor\"\n2. La póliza no es de los productos profesionales F002C001, F002C002 ni F008C003",
    "steps_raw": "1. Ingresar a OIPA con un usuario válido\n2. Ubicar la póliza objetivo a través del módulo de búsqueda\n3. Ingresar a la pantalla de la póliza\n4. Verificar que la póliza está en estado \"Vigor - Vigor\"\n5. Se ejecuta automáticamente la actividad Apertura de siniestro seleccionando una cobertura asociada al riesgo Fallecimiento (mapa OIPA-ClaimCovRelated)\n6. Validar el resultado esperado descrito a continuación",
    "expected_result": "El sistema permite ejecutar de forma automática la actividad Apertura de siniestro\n\nNota: el estado \"Anulada - Siniestrada por fallecimiento en trámite\" es para cuando tengo siniestros para las coberturas I0003 y I0009 cuando es riesgo es Fallecimiento y muerte accidental",
    "tags": ["@enrich-deep"]
  },
  "notebook_id": "8392756a-147f-4932-ad7c-83dd3b497cf9",
  "qa_data": [{"clave": "Póliza objetivo", "valor": "V0000000220748"}],
  "app_name": "GNPVital"
}
```

**Output esperado** (resumen — 17 steps con trazabilidad):
- 4 queries NLM lanzadas (trigger, navegación, formulario+comportamiento, productos excluidos).
- 17 steps en `steps_raw_enriched`, ninguno en `gaps`.
- Status: `DEEP_READY`.
- Métrica: 6 → 17 steps (+183%).

Output completo de referencia: [c:\tmp\1110-cp-1.1-enriquecido.md](c:\tmp\1110-cp-1.1-enriquecido.md)
(experimento manual del que motivó la creación de este skill).

---

## CUÁNDO NO USAR ESTE SKILL

- App sin `notebook_id` configurado → usar shallow (este skill retorna `FAILED`).
- App con `notebooklm.enabled: false` y `default_mode: shallow` → no opt-in,
  no se invoca.
- CP cuyo `steps_raw` ya es auto-suficiente y validado → no hay valor agregado;
  el shallow lo deja como está.
- Pipeline con presupuesto de tiempo crítico (smoke runs) — deep agrega
  ~30-60s por CP por las queries NLM. Para 1 CP es despreciable; para 1976
  CPs es masivo. Usar templates de query reusables por bloque temático
  (ver `c:\tmp\1110-experimento-doctrina.md` opción de masificación).
