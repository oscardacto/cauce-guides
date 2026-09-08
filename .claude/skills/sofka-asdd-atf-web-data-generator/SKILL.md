---
name: sofka-asdd-atf-web-data-generator
description: Genera sets de datos de prueba desde la documentación funcional — happy path, boundary, inválidos, por rol y carga.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `flow_id` | string | ID del flow |
| `fields` | array | Campos con restricciones conocidas (`field_id`, `field_name`, `field_type`, `is_required`, `documented_constraints`) |
| `doc_text` | string | Documentación funcional para extraer restricciones |
| `scenario_types` | array | `["happy_path","boundary","invalid","role","load"]` |
| `roles` | array | Roles desde credentials.yaml |

---

## PASO 1 — Extraer restricciones documentadas

Buscar en `doc_text`: longitudes ("máximo X chars"), formatos ("formato email", "DD/MM/YYYY"), rangos ("entre X y Y"), enumeraciones. Sin restricciones → heurísticas del PASO 2.

## PASO 2 — Heurísticas por tipo de campo

| Tipo | Boundary | Casos especiales |
|------|----------|-----------------|
| `text` | min:2, max:255 | `""`, `" "`, `<script>alert('xss')</script>`, `' OR '1'='1` |
| `email` | mín válido: `a@b.co` | `sinArroba`, `@sinusuario.com`, `usuario@@dom.com` |
| `password` | ≥8 chars, ≥1 mayúsc/núm/especial | `corta`, `sinmayusculas1!`, `SINMINUSCULAS1!` |
| `number` | min:0, max:9999 | `0`, `-1`, `0.5`, `999999999` |
| `date` | 1900-01-01 a 2099-12-31 | `32/01/2024`, `2024-13-01`, `not-a-date` |
| `file` | válido: PDF/PNG/JPG, max 5MB | EXE, JS, PHP; >5MB |
| `select/enum` | primera/última/media opción | valor inexistente, vacío, null |

## PASO 3 — Set Happy Path

Un dataset con valores válidos por campo: `{ "set_id": "happy_flow_001", "scenario_type": "happy_path", "data": {...} }`.

## PASO 4 — Sets Boundary Values

Un dataset por campo con restricciones cuantificables. Variantes: at_min, below_min, at_max, above_max, empty.

## PASO 5 — Sets Invalid Data

Vacío, formato incorrecto, inyección básica por campo requerido.

## PASO 6 — Sets Role-Based

Referencia al rol (nunca valor real): `{ "role": "admin", "credential_ref": "credentials.yaml#admin", "expected_permissions": [...] }`.

## PASO 7 — Sets Load Testing (si `load` en scenario_types)

Para flows con listas/paginación: lista vacía, primer ítem, última página.

---

## Output

```json
{
  "flow_id": "flow_001",
  "fields_analyzed": 5,
  "fields_with_documented_constraints": 3,
  "fields_with_heuristic_constraints": 2,
  "data_sets": [
    { "set_id": "...", "scenario_type": "happy_path|boundary|invalid|role|load", "data|variants": "..." }
  ],
  "dependencies": [
    { "flow_id": "flow_001", "depends_on": "flow_000", "reason": "..." }
  ]
}
```