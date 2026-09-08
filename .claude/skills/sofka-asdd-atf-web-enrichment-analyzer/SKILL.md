---
name: sofka-asdd-atf-web-enrichment-analyzer
description: Analiza la matriz de CPs, carga reglas de dominio por app y produce el plan de enriquecimiento.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

# Skill: enrichment-analyzer

> ✅ **SKILL AGNÓSTICO.** Las reglas de dominio (entidades
> Tipo A, regex de productos, lista de plan codes, defaults H4) se cargan por
> app desde `docs/testing/atf-web/knowledge/enrichment_rules.{app_name}.yaml` vía el loader
> `tools/lib/enrichment-rules-loader.js`. El orchestrator (`enrich.md`)
> carga el objeto y lo pasa al skill como `enrichment_rules` en el INPUT.
>
> Si el YAML NO existe para la app, el skill corre en **modo degradado**:
> secciones A, B y H4 emiten resultado vacío sin fallar. El resto del pipeline
> (H0 step-splitter, C reescritura de verbos, D Gherkin) funciona idénticamente.
> El fallback es explícito — el plan traerá `degraded_rules: true` y los CPs
> quedarán en `ENRICHED_PARTIAL` con nota "rules file ausente".

---

## INPUT

| Campo | Tipo | Descripción |
|---|---|---|
| `cps` | array | CPs a analizar (pre-filtrados, máx 50) |
| `notebooklm_inventory` | map | Mapa `archivo → status` (RECIBIDO/PENDIENTE) del inventario |
| `data_recipes` | string | Contenido de `data-recipes.md` de la app (catálogo de productos / datos maestros — opcional) |
| `enrichment_rules` | object | Reglas de dominio cargadas por el orchestrator desde `enrichment_rules.{app_name}.yaml`. Schema: `{ type_a_entities[], product_patterns[{name,regex}], plan_codes[], h4_data_defaults: {rules[], always{}}, source, degraded, warnings[] }`. Si `degraded: true` → correr A, B y H4 en modo degradado (resultado vacío). |

## OUTPUT

Array de objetos `enriched_cp` con el schema canónico (ver sección SCHEMA abajo).

---

## PROCESO POR CP

Para cada CP del array `cps`, construir un objeto de enriquecimiento en memoria
aplicando los subpasos A-G. No escribir ningún archivo.

### H0 — Fragmentación de pasos compuestos (AGNÓSTICA — REGLA 13)

**Input:** el `steps_raw` original del CP (puede contener pasos compuestos).
**Output:** el skill NO fragmenta directamente — sólo razona sobre el
resultado esperado y lo refleja en `steps_raw_enriched`. La fragmentación
determinista final la aplica `cp-enricher.js` vía `tools/lib/step-splitter.js`
antes de escribir el matrix.

**Heurística (documental — para que el LLM anticipe el efecto):**

- Conjunciones detectadas: `" Y "` (mayúscula), `", luego "`, `", después "`, `", posteriormente "`.
- Split aplica **solo si** el lado derecho empieza con verbo acción (guardar, crear,
  modificar, verificar, hacer clic, confirmar, etc.) y el lado izquierdo tiene ≥ 12 chars.
- Si `steps_raw` tiene `"Cuando X Y guarda Y"` → el script producirá 2 entradas.
- Si `steps_raw` tiene `"el usuario y el admin son roles"` → NO split (no hay verbo).

**Qué hace el skill:**

1. Al construir `steps_raw_enriched` (sección C abajo), puede MANTENER el paso
   compuesto original tal cual (`"X Y guarda el registro"`) — NO tratar de splittearlo
   manualmente. El script lo fragmentará determinísticamente.
2. Si reescribe el paso compuesto en lenguaje activo, debe preservar la conjunción
   `" Y "` (mayúscula) cuando existan 2 acciones — el splitter la reconocerá.
3. Si prefiere PROPONER la fragmentación en el plan, puede enviar el string ya
   con `\n` separando los sub-pasos — el splitter es idempotente (no re-splitea
   un step que ya es atómico).

**Contrato:** esta heurística NO viola REGLA 8 ("no inventar pasos"). La conjunción
está en el texto escrito por el diseñador del CP; el splitter solo explicita la
sintaxis compuesta.

**Salida esperada:** `auto_inferred.steps_split` con `{applied, input_lines, output_lines, splits_applied}` en cada CP afectado (lo popula el script, no el skill).

---

### A — Clasificar precondiciones (Tipo A / Tipo B)

Leer el campo `preconditions` del CP. Para cada precondición, clasificar:

**Tipo A — Acción del executor:**
Describe una entidad del dominio que el executor puede crear navegando el sistema.
**Señales:** la precondición menciona (match case-insensitive) alguna palabra de
`enrichment_rules.type_a_entities[]`. Si `type_a_entities` está vacío (modo
degradado o app sin rules file) → esta clasificación emite array vacío.

Acción: convertir en paso accionable con verbo en **infinitivo**. Se insertará
al inicio de `steps_raw_enriched`.

Ejemplos de conversión (genéricos):
- `"Fue creada la <entidad_A>"` → `"Crear <entidad_A> nueva"`
- `"Existe un <entidad_A> asociado"` → `"Agregar <entidad_A>"`
- Si la entidad no matchea `type_a_entities` → la precondición se trata como Tipo B.

**Tipo B — Contexto del sistema:**
Describe una regla de negocio, configuración o estado parametrizado que el
executor no puede crear. Señales: menciones a reglas (`RN###`), mapas del
backend, parámetros del sistema, o precondiciones que no matchean entidades
Tipo A.
Acción: NO convertir en paso. Agregar al bloque `Given` de `gherkin_enriched`.

Ejemplos:
- `"Se requiere implementar la validación de la regla RN182"`
  → `"Given el ambiente tiene implementada la validación de la regla RN182"`

Registrar `preconditions_type_a[]` y `preconditions_type_b[]`.

---

### B — Extraer contexto producto + plan del CP

Extraer identificadores de producto y plan codes del CP, usando los patrones
definidos en `enrichment_rules`. El skill NO asume ningún regex; todo viene del
YAML per-app.

#### product_codes (regex-based)
Para cada `{name, regex}` en `enrichment_rules.product_patterns[]`, aplicar el
regex (con flag `g`) a estos campos en orden de prioridad, **el primer campo
con match gana**: 1) `description_verify` 2) `description_func` 3) `gherkin`
4) `preconditions` 5) `steps_raw` 6) `expected_result` 7) `notes` 8) `title`.

Recolectar matches distintos → `product_codes: string[]`.
Si `product_patterns` está vacío → `product_codes: []` y no se emite
`"producto no identificado"` (no aplica).
Si patrones existen pero nada matcheó → `enrichment_notes: "producto no identificado en el CP"`.

#### plan_codes (lista cerrada)
Si `enrichment_rules.plan_codes[]` tiene entradas, buscar match **exacto**
(case-sensitive) de cualquier token de la lista en los mismos campos. Los
tokens matcheados van a `plan_codes: string[]`.
Si la lista está vacía → `plan_codes: []` silencioso.

Guardar en memoria: `cp_context = { product_codes, plan_codes }`.

---

### C — Construir `steps_raw_enriched`

1. Insertar pasos Tipo A al inicio.
2. Cada step debe comenzar con verbo en infinitivo. Conversiones:
   - `"Se ingrese a"` → `"Ingresar a"`
   - `"Se seleccione"` → `"Seleccionar"`
   - `"Se ejecute"` → `"Ejecutar"`
   - `"Se visualicen"` → `"Visualizar"`
   - `"La <entidad> esté en estado X"` → `"Verificar que la <entidad> está en estado X"`
3. Para `"Existe X asociado"`:
   - Entidades que el executor crea → `"Agregar X"`
   - Datos del sistema → `"Verificar que existe X"`
4. Mantener orden lógico. **No agregar pasos no mencionados** (REGLA 8).
5. **No inferir pasos desde `expected_result`** (REGLA 8).

---

### D — Construir `gherkin_enriched`

- `Given` = pasos que el executor crea + líneas Tipo B.
- `When/Then` con lenguaje activo.
- Si `When` tiene múltiples pasos con guiones → separar en líneas `And` independientes.
- No modificar `title` del escenario ni `Feature`.

---

### E — Identificar datos a resolver vía NotebookLM / fuente local

Para cada dato que depende de mapas/tablas del backend de la app:
1. Determinar archivo del inventario.
2. **Si el archivo requiere contexto producto y `product_codes` está vacío → NO formular query.**
3. Construir objeto query:
   ```json
   {
     "dato": "{descripción}",
     "archivo": "{archivo del inventario}",
     "context": { "product_codes": [...], "plan_codes": [...] },
     "query_text": "{query literal}",
     "resultado": null | "PENDIENTE"
   }
   ```
4. Resultado inicial: `null` si inventario dice RECIBIDO, `"PENDIENTE"` si PENDIENTE.

---

### F — Asignar `enrichment_status` preliminar

| Condición | Status |
|---|---|
| CP menciona "SOLO podrá probarse mediante integración" | `NEEDS_REVIEW` |
| No tiene `notebooklm_queries` | `READY` |
| Queries pendientes o null | `ENRICHED_PARTIAL` |

---

### G — Aplicar heurísticas de auto-corrección (H2 → H3 → H1 → H4)

#### H2 — Clasificación action/assertion por paso

Para cada línea de `steps_raw` **original**:
- **Verbos assertion**: Verificar, Validar, Confirmar, Comprobar, Asegurar que → `kind: "assertion"`
- **Verbos action**: Crear, Ingresar, Seleccionar, Agregar, Ejecutar, Guardar, Añadir, Marcar, Desmarcar, Asignar, Navegar → `kind: "action"`
- Sin verbo claro → `kind: "action"` (warning suave).

Para assertions, asignar `role` (A/B/C/D):
- `A` — gate de precondición (primeras 3 assertions, verifica estado inicial)
- `C` — resultado final (última assertion, coincide con `expected_result`)
- `D` — mal ubicada (estado post-acción antes de la acción productora)
- `B` — gate intermedio (ninguna de las anteriores)

#### H3 — Detección de aserciones Tipo D sospechosas

Una aserción es sospechosa si:
1. Menciona estado post-acción (`Pendiente con Error`, `Emitido`, `Vigor`, `Activo/Completado`)
2. La acción productora aparece DESPUÉS o no aparece.

Si `h3_suspicious_assertions.length > 0` → escalar a `NEEDS_REVIEW`.

#### H1 — Reclasificación type Positivo → Negativo

Triple condición:
1. `type == "Positivo"`
2. `"@has_defect"` en `tags[]`
3. Regex match en `title`: `/error|alerta|incumplimiento|no cumple|mensaje de error|bloquea|pendiente con error/i`

Si las 3 → `type_inferred: "Negativo"`. NO modificar campo `type` original.

#### H4 — Inferencia de defaults de datos

Usar `enrichment_rules.h4_data_defaults` para inferir valores por defecto del CP.

**Paso 1 — Aplicar reglas por producto:**
Tomar `product_codes[0]` (primer match de sección B). Para cada regla en
`h4_data_defaults.rules[]`, verificar si `product_codes[0]` empieza con
cualquier prefijo de `rule.when_product_starts_with[]`. La **primera regla**
que matchee gana — copiar todos los pares del `rule.defaults` al objeto
resultado.

**Paso 2 — Aplicar defaults universales:**
Copiar todos los pares de `h4_data_defaults.always` al objeto resultado.
Los valores de `always` tienen precedencia baja (no sobrescriben lo que el
Paso 1 ya puso).

**Degradado:** si `h4_data_defaults.rules` y `h4_data_defaults.always` están
ambos vacíos (o la app no tiene rules file), el objeto resultado queda `{}`
y H4 emite `auto_inferred.h4_data_defaults: {}` sin más.

**Fuente:** la inferencia es auditable — cada valor registrado debe poder
rastrearse al campo `h4_data_defaults` del YAML de la app.

---

## SCHEMA DEL OBJETO ENRIQUECIDO

```json
{
  "cp_id": "...",
  "preconditions_type_a": ["..."],
  "preconditions_type_b": ["..."],
  "steps_raw_enriched": "...",
  "gherkin_enriched": "...",
  "cp_context": {
    "product_codes": ["..."],
    "plan_codes": []
  },
  "notebooklm_queries": [],
  "enrichment_status": "READY | ENRICHED_PARTIAL | NEEDS_REVIEW",
  "enrichment_notes": "...",
  "auto_inferred": {
    "h1_type_reclassification": { "original": "...", "inferred": null, "applied": false, "reason": "..." },
    "h2_steps_classified": [{ "n": 1, "text": "...", "kind": "action", "verb": "..." }],
    "h3_suspicious_assertions": [],
    "h4_data_defaults": {
      "product": "...",
      "plan": "...",
      "currency": "...",
      "source": "enrichment_rules.{app}.yaml"
    }
  }
}
```

---

## REGLAS APLICABLES

- **REGLA 7** — Fidelidad de estructura: schema canónico exacto, sin campos extra.
- **REGLA 8** — Fidelidad de contenido: no inventar pasos, no inferir desde expected_result.
- **REGLA 9** — Anti-inline: nunca editar `cp_modulo_*.json` directamente.
