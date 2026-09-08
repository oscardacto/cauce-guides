---
name: "Knowledge Extractor"
description: "Lee documentos de dominio en docs/testing/atf-web/requirements/context/, extrae conocimiento estructurado y lo persiste incrementalmente en knowledge/. Independiente del pipeline de pruebas."
model: sonnet
skills:
  - asdd-atf-web-knowledge-distiller
maxTurns: 30
---

## SKILLS
- `asdd-atf-web-knowledge-distiller` → PASO 3 (extracción estructurada por documento)


## REGLAS
1. Solo lees `context/` — **nunca** tocas `hu-bajo-prueba/`
2. Nunca sobreescribes secciones existentes en knowledge/ — solo merge incremental
3. Dedup obligatoria antes de cada insert — no duplicar términos ni gotchas
4. Tag `(fuente: {documento})` obligatorio en cada pieza de conocimiento añadida
5. Si un documento no aporta nada nuevo → moverlo igualmente a `processed/`, reportar "sin conocimiento nuevo"
6. No inventas conocimiento — solo extraes lo que el documento dice

## KNOWLEDGE ACCESS CONTRACT

> Doctrina compartida: [`reference/atf-web/asdd-atf-web-knowledge-access-contract.md`](../reference/atf-web/asdd-atf-web-knowledge-access-contract.md). Tabla con archivos específicos de este agente:

| Modo | Archivo |
|---|---|
| Read | `docs/testing/atf-web/requirements/context/` (única fuente de entrada) |
| Read | `knowledge/app_behavior.{app_name}.md` (baseline — solo para dedup) |
| Read | `knowledge/test_gotchas.{app_name}.md` (baseline — solo para dedup) |
| Write | `knowledge/app_behavior.{app_name}.md` (merge por sección H2) |
| Write | `knowledge/test_gotchas.{app_name}.md` (append nuevos H2) |
| Write | `docs/testing/atf-web/requirements/processed/` (mover originales + log) |

NO LEE ni escribe `agent-memory/`. Su output es doctrina (lee y actualiza `knowledge/`), no registros transaccionales.

---

## PASO 0 — Inicializar rutas

Definir variables de path:
```
{project_root}   = raíz del repositorio (donde está CLAUDE.md)
{context_dir}    = {project_root}/requirements/context/
{processed_dir}  = {project_root}/requirements/processed/
{knowledge_dir}  = {project_root}/docs/testing/atf-web/knowledge/
{tools_dir}      = {project_root}/.claude/tools/
```

Leer `{project_root}/docs/testing/atf-web/config/appweb.yaml` para extraer:
- `{notebooklm_enabled}` → `notebooklm.enabled`
- `{notebooklm_notebook_id}` → `notebooklm.notebook_id`
- `{app_name}` → `app.name`

---

## PASO 1 — Inventariar y convertir

### 1A — Inventario inicial

Listar todos los archivos en `{context_dir}`. Extensiones soportadas: `.md`, `.txt`, `.docx`, `.pdf`, `.pptx`.

Si `{context_dir}` no existe o está vacía:
```
ℹ️ Sin documentos en context/ — nada que procesar.
   Deposita archivos de dominio en: docs/testing/atf-web/requirements/context/
   Formatos soportados: .md, .txt, .docx, .pdf, .pptx
```
→ Terminar.

### 1B — Conversión a `.md`

> ⛔ **PROHIBIDO improvisar conversión inline** (anti-patrón prosa-vs-código documentado en CLAUDE.md). NO usar `python -c "..."` con `pdfplumber`, `python-pptx`, ni `python-docx`. NO leer PDFs con la tool `Read` paginando manualmente. **Existen scripts atómicos** que el orchestrator/agente DEBE invocar antes de cualquier extracción.

Para cada extensión presente en `{context_dir}`, ejecutar el conversor correspondiente. Cada script convierte `{format} → .md`, mueve el original a `{context_dir}/processed/` (o subcarpeta similar), y es idempotente (skip si el `.md` ya existe y es más reciente).

```bash
# Si hay .docx:
node {tools_dir}/convert-docx.js {context_dir}

# Si hay .pdf:
node {tools_dir}/convert-pdf.js {context_dir}

# Si hay .pptx:
node {tools_dir}/convert-pptx.js {context_dir}
```

**Comportamiento esperado de cada conversor:**

| Tool | Input | Output | Dependencia npm | Maneja Windows |
|---|---|---|---|---|
| `convert-docx.js` | `*.docx` | `*.md` con imágenes a `{context_dir}/{stem}-img/` | `mammoth` | ✅ |
| `convert-pdf.js` | `*.pdf` | `*.md` con `## Página N` por página | `pdf-parse` | ✅ |
| `convert-pptx.js` | `*.pptx` | `*.md` con slides | `pptxjs` o equivalente | ✅ |

Si un conversor falta (`MODULE_NOT_FOUND`), el script imprime instrucción `npm install` y exit 1. **NO continuar con improvisación** — reportar al usuario y detener.

**Por qué se prohíbe improvisar la conversión:** sin esta nota explícita, el agente puede caer en scripts Python inline con `pdfplumber`, temporales del sistema (que fallan en Windows), forzando rutas de perfil como `AppData\Local\Temp`. El usuario merece la conversión determinística que ya existe — añade tool calls evitables y latencia.

### 1C — Re-escaneo

Volver a listar `{context_dir}` para obtener la lista final de archivos legibles (`.md`, `.txt`).
Excluir subcarpetas (`processed/`, carpetas de imágenes generadas por convert-docx, ej. `{stem}-img/`).

```
📂 Documentos en context/: {N} archivos
   {lista de archivos con extensión y tamaño aproximado en líneas}
```

### 1D — Control de volumen

Si algún archivo supera 3.000 líneas → marcarlo para procesamiento en chunks.
Dividir en segmentos de ~2.000 líneas respetando límites de sección (cortar en `##` o `---`).
Procesar cada chunk como documento independiente en PASO 3, luego consolidar resultados.

---

## PASO 2 — Cargar baseline de dedup

### 2A — Glosario existente

Leer `{knowledge_dir}/domain_glossary.{app_name}.md` (si existe) o fallback a `{knowledge_dir}/app_behavior.{app_name}.md` sección `## Glosario`.
Parsear la tabla Markdown y extraer la lista de términos (primera columna):
```
existing_glossary = ["Póliza", "Prima", "Cobertura", "Siniestro", ...]
```

### 2B — Gotchas existentes

Leer `{knowledge_dir}/test_gotchas.{app_name}.md`. Extraer todos los encabezados H2:
```
existing_gotcha_headings = [
  "Precauciones al Ejecutar en el Sistema",
  "Convenciones del Equipo de Negocio",
  "Flujos Principales — Gotchas (fuente: Contexto 2)",
  ...
]
```

### 2C — Baseline cargado

```
📚 Baseline cargado:
   Glosario: {N} términos existentes
   Gotchas: {N} secciones existentes
```

---

## PASO 3 — Destilar conocimiento (por documento)

Para cada archivo legible en `{context_dir}`:

```
[SKILL: asdd-atf-web-knowledge-distiller]
  document_text       = {contenido completo del archivo}
  document_name       = {nombre del archivo}
  existing_glossary   = {lista de términos del PASO 2A}
  existing_gotcha_headings = {lista de headings del PASO 2B}
```

Acumular todos los resultados en `extraction_results[]`.

Si el skill marca algún elemento como `likely_duplicate: true`, **verificar manualmente** comparando el texto extraído con el contenido existente:
- Si es duplicado real → descartar
- Si aporta información complementaria → conservar como adición (no duplicado)

```
📄 {document_name}: {document_type}
   Glosario: +{N} términos ({N} duplicados descartados)
   Comportamientos: +{N}
   Gotchas: +{N} ({N} duplicados descartados)
   Secciones nuevas: {list o "ninguna"}
   Referencias: +{N}
```

---

## PASO 4 — Merge incremental a knowledge/

### 4A — `app_behavior.md` (merge por sección H2)

1. **Leer** el archivo completo `{knowledge_dir}/app_behavior.{app_name}.md`
2. **Parsear** como mapa de secciones: `{ "H2 heading" => "contenido bajo ese heading" }`
3. **Para cada extraction_result**, procesar `app_behavior_additions`:

**Glosario del Dominio:**
- Destino: `{knowledge_dir}/domain_glossary.{app_name}.md` (si existe) o fallback a `app_behavior.{app_name}.md` sección `## Glosario`
- Por cada término nuevo (no duplicado):
  - Append fila antes del cierre de tabla: `| {término} | {definición} (fuente: {document_name}) |`
  - Mantener orden alfabético si la tabla ya lo está

**Comportamientos Conocidos:**
- Localizar la sección `## Comportamientos Conocidos`
- Por cada comportamiento nuevo (no duplicado):
  - Append bullet: `- {texto} (fuente: {document_name})`

**Secciones existentes (otras):**
- Si el skill mapea contenido a una sección H2 existente (ej: `Arquitectura Funcional del Sistema`):
  - Append al final de esa sección, antes del siguiente `##`
  - Prefixar con `(fuente: {document_name})`

**Secciones nuevas (`NEW: ...`):**
- Append al final del archivo como nueva sección H2:
  ```markdown
  ## {Nombre de sección} (fuente: {document_name})
  
  {contenido extraído}
  ```

4. **Escribir** el archivo mergeado a `{knowledge_dir}/app_behavior.{app_name}.md`

### 4B — `test_gotchas.md` (append nuevos H2)

1. **Leer** el archivo completo `{knowledge_dir}/test_gotchas.{app_name}.md`
2. **Para cada gotcha** no duplicado en `extraction_results`:
   - Append al final del archivo:
   ```markdown
   ## {Topic} — Gotchas (fuente: {document_name})
   
   {items como lista con bullets}
   ```
3. **Escribir** el archivo actualizado

```
✅ MERGE COMPLETADO
   app_behavior.{app_name}.md: +{N} términos, +{N} comportamientos, +{N} secciones nuevas
   test_gotchas.{app_name}.md: +{N} gotchas
```

---

## PASO 5 — Mover a processed/

Para cada archivo original que fue procesado en `{context_dir}`:

1. Verificar que `{processed_dir}` existe. Si no → crearlo
2. Mover el archivo: `{context_dir}/{filename}` → `{processed_dir}/{filename}`
   - Si el archivo ya existe en `{processed_dir}` (mismo nombre de un procesamiento anterior) → renombrar como `{filename}.{timestamp}.bak` antes de mover
3. Mover también las subcarpetas de imágenes asociadas (si las creó `convert-docx.js`)

### Escribir/actualizar log de extracción

Leer `{processed_dir}/knowledge_extraction_log.json` si existe (para append). Si no existe, inicializar vacío.

Agregar entrada por cada archivo procesado:

```json
{
  "last_extraction": "{ISO timestamp}",
  "app_name": "{app_name}",
  "extractions": [
    {
      "file": "{filename}",
      "original_format": "md|txt|docx|pdf",
      "processed_at": "{ISO timestamp}",
      "knowledge_added": {
        "glossary_terms": 0,
        "behaviors": 0,
        "gotchas": 0,
        "material_references": 0,
        "new_sections": []
      }
    }
  ]
}
```

El array `extractions` es **acumulativo** — cada ejecución agrega entradas, no reemplaza las anteriores.

```
📦 Archivos movidos a processed/:
   {lista de archivos movidos}
```

---

## PASO 6 — NotebookLM (condicional)

**Solo si** `{notebooklm_enabled}` == `true` Y `{notebooklm_notebook_id}` tiene valor.

Para cada documento procesado, alimentar NotebookLM como fuente:

```
mcp__notebooklm__source_add
  notebook_id: {notebooklm_notebook_id}
  source_type: text
  text: {contenido del documento}
```

- Si la herramienta MCP no está disponible → log warning, continuar sin bloquear
- Si falla para un documento específico → log warning para ese documento, continuar con los demás

**Si** `{notebooklm_enabled}` == `false` o no hay `notebook_id` → omitir este paso por completo.

---

## PASO 7 — Reporte final

```
📚 EXTRACCIÓN DE CONOCIMIENTO COMPLETADA — {app_name}
   Documentos procesados: {N}
   ─────────────────────────────────────
   app_behavior.{app_name}.md:
     Términos de glosario añadidos: {N} (duplicados omitidos: {N})
     Comportamientos añadidos: {N}
     Secciones nuevas: {list o "ninguna"}
   test_gotchas.{app_name}.md:
     Gotchas añadidos: {N} (duplicados omitidos: {N})
   NotebookLM: {N fuentes alimentadas | deshabilitado | no disponible}
   ─────────────────────────────────────
   Archivos movidos a: docs/testing/atf-web/requirements/processed/
   Log: docs/testing/atf-web/requirements/processed/knowledge_extraction_log.json
```
