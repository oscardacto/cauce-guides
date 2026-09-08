---
name: asdd-atf-web-knowledge-distiller
description: Destila un documento de dominio en conocimiento estructurado por categoría. Devuelve JSON, nunca escribe archivos.
used_by:
  - asdd-atf-web-qa-engineer
---

# asdd-atf-web-knowledge-distiller

## Inputs

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `document_text` | string | Sí | Contenido completo del documento a analizar |
| `document_name` | string | Sí | Nombre del archivo fuente (para tagging `(fuente: ...)`) |
| `existing_glossary` | string[] | Sí | Términos ya existentes en `domain_glossary.{app_name}.md` o `app_behavior.md` sección `## Glosario` (para dedup) |
| `existing_gotcha_headings` | string[] | Sí | Encabezados H2 existentes en `test_gotchas.md` (para dedup semántica) |

---

## Proceso

### 1 — Clasificar tipo de documento

Determinar el tipo principal del documento:

| Tipo | Señales |
|------|---------|
| `business_rules` | Reglas de negocio, validaciones, fórmulas, umbrales, condiciones |
| `glossary` | Definiciones de términos, catálogos de conceptos, taxonomías |
| `onboarding` | Guías de incorporación, procesos del equipo, convenciones de trabajo |
| `architecture` | Diagramas, componentes, integraciones, infraestructura, flujos técnicos |
| `process` | Flujos de trabajo, procedimientos, pasos operativos, checklists |
| `mixed` | Combina 2+ tipos anteriores — extraer todas las categorías aplicables |

### 2 — Extraer por categoría

Para cada categoría aplicable, extraer elementos del documento:

| Categoría | Qué buscar | Destino |
|-----------|-----------|---------|
| `business_rules` | Reglas explícitas, validaciones, umbrales, condiciones IF-THEN | `app_behavior.md` → nueva H2 o `Comportamientos Conocidos` |
| `domain_glossary` | Pares término-definición, acrónimos, nomenclatura del dominio | `domain_glossary.{app_name}.md` (si existe) o `app_behavior.md` → `## Glosario` |
| `known_actors` | Roles, perfiles, usuarios del sistema, stakeholders | `app_behavior.md` → nueva H2 o sección existente |
| `known_modules` | Módulos funcionales, sub-sistemas, componentes del sistema | `app_behavior.md` → `Arquitectura` o nueva H2 |
| `credential_references` | Patrones de credenciales, roles de acceso, perfiles de prueba | `app_behavior.md` → sección relevante |
| `api_endpoints` | Endpoints, servicios, integraciones externas | `app_behavior.md` → nueva H2 |
| `data_schemas` | Entidades, campos, tipos de dato, validaciones de formato | `app_behavior.md` → nueva H2 |
| `nfr_thresholds` | Umbrales de performance, SLAs, tiempos de respuesta, capacidades | `app_behavior.md` → sección relevante |
| `conventions_detected` | Nomenclatura, formatos, estándares del equipo, idioma | `test_gotchas.md` → como gotcha de convenciones |

### 3 — Extraer gotchas

Identificar advertencias, caveats y trampas de testing:

- Frases clave: "cuidado con", "tener en cuenta", "no confundir", "excepción", "caso especial", "error común", "validación especial", "comportamiento inesperado"
- Condiciones de borde mencionadas explícitamente
- Diferencias entre comportamiento esperado y real documentadas
- Dependencias temporales o de orden que afectan pruebas
- Limitaciones técnicas del sistema

Cada gotcha se agrupa por tema y se destina a `test_gotchas.md` como nueva sección H2.

### 4 — Extraer comportamientos del sistema

Identificar patrones de comportamiento observables:

- Comportamientos de UI (campos calculados, validaciones, refresh)
- Patrones de navegación (menús, tabs, modales)
- Tiempos de carga o respuesta documentados
- Flujos de estado (transiciones, estados válidos/inválidos)

Se destinan a `app_behavior.md` → `Comportamientos Conocidos` o sección H2 específica.

### 5 — Mapear a sección H2 destino

Para cada pieza de conocimiento extraída, asignar la sección H2 de `app_behavior.md` donde debe insertarse:

| Tipo de conocimiento | Sección H2 destino | Formato |
|---------------------|-------------------|---------|
| Términos/definiciones | `domain_glossary.{app_name}.md` o `## Glosario` | Fila de tabla: `\| {término} \| {definición} \|` |
| Comportamientos de sistema | `Comportamientos Conocidos` | Bullet: `- {comportamiento}` |
| Arquitectura/módulos | `Arquitectura del Sistema` o `Arquitectura Funcional` | Prosa o lista |
| Patrones de navegación | `Patrones de Navegacion Comunes` | Lista numerada |
| Elementos de UI | `Elementos de UI Tipicos del Sistema` | Bullet list |
| Sin sección existente | `NEW: {Tema descriptivo}` | El agente creará una nueva H2 |

### 6 — Marcar duplicados probables

Para cada elemento extraído, comparar contra los inputs `existing_glossary` y `existing_gotcha_headings`:

- **Glosario:** Si el término (case-insensitive) ya existe en `existing_glossary` → `likely_duplicate: true`
- **Gotchas:** Si el topic del gotcha tiene overlap semántico significativo (>70% de conceptos clave coinciden) con algún heading en `existing_gotcha_headings` → `likely_duplicate: true`
- **Otros:** Si el texto extraído repite información ya cubierta por un término o gotcha existente → `likely_duplicate: true`

El flag es una **sugerencia** — el agente invocante toma la decisión final.

---

## Output

```json
{
  "document_name": "{nombre del archivo}",
  "document_type": "business_rules|glossary|onboarding|architecture|process|mixed",

  "app_behavior_additions": {
    "Glosario del Dominio": [
      {
        "term": "{término}",
        "definition": "{definición concisa}",
        "likely_duplicate": false
      }
    ],
    "Comportamientos Conocidos": [
      {
        "text": "{comportamiento observable del sistema}",
        "likely_duplicate": false
      }
    ],
    "NEW: {Nombre de sección nueva}": [
      {
        "text": "{contenido para la nueva sección}"
      }
    ]
  },

  "gotchas_additions": [
    {
      "topic": "{Tema del gotcha — nombre descriptivo para H2}",
      "items": [
        "{gotcha 1 — texto conciso y accionable}",
        "{gotcha 2}"
      ],
      "likely_duplicate": false
    }
  ],

  "material_references": [
    {
      "type": "mapa|hu|documento|rate|ticket|catalogo|producto",
      "id": "{identificador detectado}",
      "context": "{nombre del material} — {fragmento donde se referencia, max 120 chars}"
    }
  ],

  "summary": {
    "glossary_terms": 0,
    "behaviors": 0,
    "gotchas": 0,
    "new_sections": [],
    "material_references": 0
  }
}
```

### Reglas del output

1. **Incluir solo lo extraído** — omitir campos vacíos o con arrays/objetos sin contenido
2. **Concisión:** Cada `text` o `definition` debe ser autocontenido y conciso (max ~200 chars). Parafrasear, no copiar párrafos enteros
3. **Accionabilidad:** Los gotchas deben ser accionables para un QA — no abstracciones teóricas
4. **Idioma:** Todo en español
5. **No inventar:** Solo extraer lo que el documento dice explícita o implícitamente. No inferir conocimiento que no esté sustentado en el texto
