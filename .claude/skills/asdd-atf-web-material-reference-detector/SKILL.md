---
name: asdd-atf-web-material-reference-detector
description: Detecta referencias a HUs, mapas, documentos y Rates en el texto de requerimientos y valida su disponibilidad.
used_by:
  - asdd-atf-web-qa-engineer
---

# Skill: Material Reference Detector

## Inputs

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `document_text` | string | Contenido completo del documento a analizar |
| `document_id` | string | Identificador del documento (ej: "HU-1186") |
| `available_materials` | object | Materiales disponibles: `{ requirements: string[], knowledge_files: string[], knowledge_content: string }` |

## Proceso

### 1. Extracción de referencias por tipo

Escanear el `document_text` buscando los siguientes patrones:

#### HUs referenciadas
- Patrones: `HU[\s-]?\d{3,4}`, `historia[\s]+(de usuario[\s]+)?\d{3,4}`, `HU\s+\d+\s*-\s*`
- Ejemplo: "ver HU 1186", "según la historia 042", "HU-1110 - Siniestros"
- Normalizar a formato: `HU-NNNN` (con guión, sin espacios)
- **Excluir** la HU del propio documento (`document_id`) de los resultados

#### Mapas / Guías del sistema (opcional — app-específico)
- Patrones configurables por app. Ej. regex `\b[A-Z]{3,}[-_]\w+\b` para sistemas que
  usan prefijos como `SYSTEM_Map` o `PLATFORM-Rule`.
- Normalizar a formato consistente (app-específico).

#### Rates (tablas de configuración)
- Patrones: `Rate\s*[-\s]\s*\w+`, `Rate\w+`
- Ejemplo: "Rate - LoanCalMethod", "Rate Parameters", "Rate Email"
- Normalizar a formato: `Rate-NombreDelRate`

#### Documentos externos / APRs / REQTs
- Patrones: `APR\s+\w+`, `REQT\d+`, `REQ\d+`
- Ejemplo: "APR REQT0011", "REQT0015", "REQ0022"
- Normalizar a formato original

#### Tickets ALM
- Patrones: `GPVQI[-\s]\d+`, `ALM[-\s]\w+[-\s]\d+`
- Ejemplo: "GPVQI-1732", "ALM-259"
- Normalizar a formato: `GPVQI-NNNN` o `ALM-NNN`

#### Catálogos / AsCodes
- Patrones: `AsCode\w+`, `catálogo\s+\w+`
- Ejemplo: "AsCodeGuaranteedPayment", "AsCodeLoanCalMethod"
- Normalizar a formato original

#### Códigos de producto comercial
- Patrones: `F\d{3}C\d{3}`
- Ejemplo: "F002C001", "F008C003"
- Normalizar a formato original
- **Nota:** solo registrar como referencia si el producto se menciona como dependencia
  o precondición, no si es el producto bajo prueba en la HU

### 2. Extracción de contexto

Para cada referencia encontrada, extraer **una línea de contexto** — la oración o fragmento
donde aparece la referencia, para entender POR QUÉ se necesita ese material.

Truncar a máximo 120 caracteres.

### 3. Deduplicación

- Si la misma referencia aparece múltiples veces en el documento, consolidar en una sola
  entrada con el contexto más descriptivo
- Agrupar por tipo (hu, mapa, rate, documento, ticket, catalogo, producto)

### 4. Validación de disponibilidad

Para cada referencia, verificar si está disponible:

**Materiales disponibles si:**
- Para HUs: existe un archivo en `available_materials.requirements[]` cuyo nombre contiene
  el número de la HU (ej: "1110" aparece en "1110 - Siniestros...md")
- Para Mapas/Guías: el nombre del mapa aparece mencionado en `available_materials.knowledge_content`
  (texto de app_behavior.md + docs/testing/atf-web/requirements/*.md)
- Para Rates: el nombre del Rate aparece en `available_materials.knowledge_content`
- Para AsCodes: el nombre del AsCode aparece en `available_materials.knowledge_content`
- Para Productos: el código aparece en el inventario de productos de la app (si existe)

**Prioridad de materiales pendientes:**
- `alta` — HUs referenciadas como precondición directa, mapas usados en fórmulas de cálculo
- `media` — documentos de referencia general, tickets ALM informativos
- `baja` — catálogos de configuración, productos mencionados al pasar

### 5. Clasificar prioridad

Si el contexto contiene palabras como "precondición", "se requiere", "debe existir",
"obligatorio", "criterio de aceptación", "fórmula", "cálculo" → prioridad `alta`.

Si contiene "ver también", "referencia", "aplica para", "nota" → prioridad `media`.

Otros → prioridad `baja`.

## Output

Devolver JSON con la siguiente estructura:

> ⚠️ **CASE-SENSITIVE** — Los campos `status` y `priority` DEBEN ser siempre **minúsculas**.
> El dashboard filtra con comparación exacta (`r.status === 'disponible'`).
> Usar `"DISPONIBLE"` o `"Disponible"` hará que el dashboard muestre 0 disponibles.

```json
{
  "source_document": "{document_id}",
  "scan_date": "{ISO date}",
  "references": [
    {
      "id": "MAT-001",
      "type": "hu|mapa|rate|documento|ticket|catalogo|producto",
      "context": "{nombre del material} — {fragmento de texto, max 120 chars}",
      "status": "disponible|pendiente|disponible_indirecto",
      "priority": "alta|media|baja",
      "referenced_by": ["{document_id}"],
      "found_in": "{ruta del archivo donde se encontró, o null si pendiente}"
    }
  ],
  "summary": {
    "total_references": 0,
    "disponibles": 0,
    "pendientes": 0,
    "coverage_pct": 0.0
  }
}
```

> **Campos obligatorios por referencia** (el dashboard accede exactamente estos):
> - `id` — NO usar `ref_id` ni `name` (el nombre va dentro de `context`)
> - `context` — Incluir nombre + descripción corta: `"REQT0003 — fórmulas de Reserva"`
> - `referenced_by` — array de HU-IDs que lo referencian. NO usar `cited_in`
> - `priority` — siempre presente: `alta|media|baja`
> - `found_in` — ruta al archivo si disponible, `null` si pendiente
```

> **Validación de lowercase — CRÍTICA:**
> El agente que invoca este skill (diagnostician) normaliza `status` y `priority` a
> lowercase antes de escribir el archivo final. Sin embargo, este skill DEBE producir
> valores en lowercase desde el origen para evitar discrepancias:
> ```
> ✅ "status": "disponible",  "priority": "alta"
> ❌ "status": "DISPONIBLE",  "priority": "Alta"
> ❌ "status": "Disponible",  "priority": "ALTA"
> ```
> Si el dashboard muestra 0 materiales disponibles pero el JSON tiene referencias,
> la causa más probable es case mismatch en `status`.

## Reglas

- NO escribe archivos — devuelve JSON al agente invocador (diagnostician).
- Si `document_text` vacío o sin referencias detectables → `references: []`, `coverage_pct: 100.0`.
- Códigos de producto (`F\d{3}C\d{3}`) solo se registran si aparecen como dependencia, no si son el producto principal de la HU.
- Para documentos >50,000 chars, procesar por secciones. Priorizar: "A tener en cuenta", "Criterios de Aceptación", "Notas".
