---
name: asdd-atf-web-test-data-needs
description: Identifica los datos que requiere cada CP, su origen de provisionamiento, dependencias entre CPs y factibilidad.
used_by:
  - asdd-atf-web-qa-engineer
  - asdd-atf-web-qa-engineer
---

## Inputs

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `preconditions` | string | Precondiciones del CP |
| `steps` | array/string | Pasos del CP |
| `expected_result` | string | Resultado esperado |
| `cp_id` | string | Identificador del CP |
| `hu_id` | string | HU de origen |
| `domain_context` | string | Conocimiento del dominio (app_behavior.md, test_gotchas.md) |

## Proceso

### 1. Detectar entidades de datos requeridas

Escanear `preconditions` y `steps` buscando patrones. Las entidades son dependientes
del dominio de la app; el `domain_context` (input del skill) guía la detección. Patrones
genéricos que siempre aplican:

| Entidad | Patrones |
|---------|----------|
| **Usuario/Actor** | "usuario", "cliente", "cuenta", "perfil", "rol" |
| **Objeto de negocio** | "registro", "documento", "transacción", "item", "ítem" |
| **Catálogo** | "catálogo", "producto", "plan", "tipo", "categoría" |
| **Dato relacional** | IDs, códigos, referencias cruzadas |
| **Datos sensibles** | "credencial", "contraseña", "token", "dato bancario", "tarjeta" |
| **Configuración** | "mapa", "Rate", "tabla", "configuración", "parámetro" |
| **Credenciales** | "usuario", "credencial", "rol" |

Además de estos patrones genéricos, el skill debe aprovechar los patrones
específicos que aparezcan en `domain_context` (app_behavior.{app}.md) para la app bajo prueba.

### 2. Extraer requisitos específicos

Estado requerido, atributos específicos, montos/rangos, relaciones entre entidades.

### 3. Clasificar origen de provisionamiento

| Origen | Código | Criterio |
|--------|--------|---------|
| **Pre-existente** | `pre_existente` | Catálogos, configuraciones, datos maestros (debe estar en el ambiente de pruebas) |
| **Crear en prueba** | `crear_en_prueba` | Registros creables via UI/API (usuarios, transacciones, documentos) |
| **Solicitar al cliente** | `solicitar_cliente` | Credenciales, roles especiales, datos sensibles (solo el cliente provee) |
| **Automatizar** | `automatizar` | Datos masivos (>10 registros similares) |
| **Dependencia CP** | `dependencia_cp` | El dato lo produce otro CP |

### 4. Detectar dependencias entre CPs

Frases como "registro emitido" → depende de CP de emisión. "usuario creado" → depende de
CP de creación. Registrar cp_id si identificable; si no, dejar referencia genérica.

### 5. Evaluar factibilidad

| Score | Criterio |
|-------|---------|
| `alta` | Todo `pre_existente` o `crear_en_prueba` |
| `media` | Algún `solicitar_cliente` o `automatizar` |
| `baja` | Entidad crítica `solicitar_cliente` sin resolución |

### 6. Clasificar prioridad

En precondiciones → `critical`. En pasos intermedios → `important`. En notas/resultado → `nice_to_have`.

## Output

```json
{
  "cp_id": "{cp_id}", "hu_id": "{hu_id}",
  "data_needs": [
    {
      "entity": "Usuario|Objeto de negocio|...",
      "requirement": "Descripción específica",
      "provisioning": "pre_existente|crear_en_prueba|solicitar_cliente|automatizar|dependencia_cp",
      "priority": "critical|important|nice_to_have",
      "estimated_setup_min": 5
    }
  ],
  "dependencies": [ { "depends_on": "CP-xxx", "dependency_type": "output_as_input", "entity": "..." } ],
  "feasibility": { "score": "alta|media|baja", "blockers": [], "estimated_setup_min": 15, "needs_client_action": false }
}
```

## Reglas
- NO escribe archivos — devuelve JSON al agente invocador.
- Precondiciones vacías → `data_needs: []`, `feasibility.score: "alta"`.
- Estimaciones orientativas: crear usuario/registro simple ~5min, flujo compuesto ~10min, configuración avanzada ~3min, solicitar credenciales externas ~24h.