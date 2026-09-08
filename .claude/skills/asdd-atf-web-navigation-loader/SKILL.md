---
name: asdd-atf-web-navigation-loader
description: Carga recetas de navegación en cascada agent-memory, NotebookLM, guías. Gate obligatorio antes de R2 en apps enterprise.
used_by:
  - asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `memory_dir` | string | Ruta a agent-memory de la app |
| `notebooklm_enabled` | boolean | Si NotebookLM está disponible |
| `notebooklm_notebook_id` | string | ID del notebook (si habilitado) |
| `app_name` | string | Nombre de la app bajo prueba |
| `functional_docs_folder` | string | Ruta a HUs |
| `output_dir` | string | Directorio de salida del módulo |
| `requires_auth` | boolean | Si la app requiere login |

---

## PASO 1 — Buscar recetas en agent-memory

Verificar si existe `{memory_dir}/navigation-recipes.md`.

**Si existe:**
```
📍 Recetas de navegación cargadas desde agent-memory
   Archivo: {memory_dir}/navigation-recipes.md
```
Leer el archivo → asignar a `{navigation_recipes}`.
Continuar a PASO 4 (checkpoint).

---

## PASO 2 — Consultar NotebookLM (fallback 1)

**Si `{notebooklm_enabled}` es `true`:**

```
[SKILL: asdd-atf-web-notebooklm-query | mode: resolve]
doubt: "Necesito los pasos exactos de navegación en la app"
query: "¿Cómo se navega paso a paso en {app_name} para realizar estas acciones? Incluir menús, botones, campos y secuencia exacta:
1. Cómo crear el registro principal de la app: menú, selección de tipo/producto, campos obligatorios, cómo guardar
2. Cómo agregar y ejecutar acciones sobre el registro
3. Cómo verificar el estado del registro y sus acciones
4. Cómo acceder al sumario de errores/mensajes
5. Diferencias importantes entre los flujos principales (variantes del flujo por tipo de registro)
Dar la información más específica posible: nombres exactos de menús, etiquetas de botones, orden de los campos."
notebook_id: {notebooklm_notebook_id}
```

**Si la respuesta contiene información útil (no vacía ni genérica):**
- Escribir resultado en `{memory_dir}/navigation-recipes.md` (formato Markdown)
- Asignar a `{navigation_recipes}`
- Log:
```
📍 Recetas de navegación extraídas de NotebookLM y guardadas en agent-memory
   Archivo: {memory_dir}/navigation-recipes.md
   → Se reutilizarán en runs futuros sin consultar NotebookLM
```
Continuar a PASO 4 (checkpoint).

**Si la respuesta es vacía/genérica** → continuar a PASO 3.

**Si `{notebooklm_enabled}` es `false`** → continuar a PASO 3.

---

## PASO 3 — Buscar guías procesadas (fallback 2)

Buscar archivos `Guia*.md` en `{functional_docs_folder}/../processed/`.

**Si se encuentran guías:**
- Leer y asignar a `{navigation_recipes}`

**Si no se encuentran:**
- Asignar `{navigation_recipes}` = `null`
- Log:
```
⚠️ Sin recetas de navegación disponibles — el executor navegará con base en los CPs y el HTML del DOM.
   Para mejorar la precisión: habilitar NotebookLM o crear {memory_dir}/navigation-recipes.md
```

---

## PASO 4 — Checkpoint nav_recipes_status.json

Escribir `{output_dir}/nav_recipes_status.json`:

**Si `{navigation_recipes}` fue cargado:**
```json
{
  "loaded": true,
  "source": "{agent-memory|notebooklm|processed-guides}",
  "file_path": "{ruta del archivo leído}",
  "sections_found": ["{secciones identificadas}"],
  "timestamp": "{ISO}"
}
```

**Si `{navigation_recipes}` es `null`:**
```json
{
  "loaded": false,
  "source": "null",
  "file_path": null,
  "cascade_attempted": ["agent-memory", "notebooklm", "processed-guides"],
  "timestamp": "{ISO}"
}
```

---

## PASO 5 — Gate para apps enterprise

**Si `{navigation_recipes}` es `null` Y `{requires_auth}` es `true`:**
```
🛑 PASO 1.2 FALLIDO — Sin recetas de navegación para app enterprise.
   La ejecución de CPs sin recetas tiene alta probabilidad de bloqueo en apps complejas.
   Archivo: nav_recipes_status.json escrito con loaded:false.
   → Reportar al orquestador y esperar decisión antes de continuar a R2.
```
No proceder a R2 sin confirmación explícita del usuario o del orquestador.
Si el usuario confirma continuar → registrar en log y proceder con `{navigation_recipes} = null`.

---

## Output

```json
{
  "navigation_recipes": "{contenido cargado o null}",
  "loaded": true,
  "source": "{agent-memory|notebooklm|processed-guides|null}",
  "gate_blocked": false
}
```

El agente que invoca usa `{navigation_recipes}` como referencia de CÓMO ejecutar
lo que cada CP pide. La receta NO es script a ejecutar ciegamente — es biblioteca
de procedimientos filtrada por CP en R2.2-B.
