---
name: sofka-asdd-atf-web-alm-data-builder
description: Genera result.json por CP con los 12 campos ALM en bug_candidate para FAILs, más steps_log.md. No escribe BUG-*.md.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `mode` | `"fail_evidence"` | Tipo de artefacto a generar |
| `cp` | object | Datos del CP (cp_id, module_id, hu_id, risk_level, tags, steps, status, etc.) |
| `headless_result` | object | Resultado de R2 para este CP (el invocador debe pasarlo YA parseado desde memoria; NO releer `headless_results.json` por CP) |
| `output_dir` | string | Directorio de salida del módulo |
| `run_id` | string | ID del run |
| `module_id` | string | ID del módulo |
| `navigation_learning_enabled` | boolean | Si nav-learning está activo |
| `nav_stats_preloaded` | object (opcional) | Contenido parseado de `nav_stats_{module}.json`. Si viene poblado, el skill NO hace Read. Preferido para batch de CPs . |
| `nav_stats_path` | string (fallback) | Ruta a `nav_stats_{module}.json` — solo usado si `nav_stats_preloaded` está ausente. |
| `evidence_mode` | string | `"failures_only"` \| `"all"` |

---

## Mapeo de severidad

| risk_level | ALM Priority |
|-----------|--------------|
| critical | P1 |
| high | P2 |
| medium | P3 |
| low | P4 |

---

## mode: fail_evidence — result.json + steps_log.md para CPs FAIL (R3.3)

### result.json

```json
{
  "cp_id": "{cp_id}",
  "module_id": "{module_id}",
  "status": "FAIL",
  "hu_id": "{hu_id}",
  "risk_level": "{risk_level}",
  "tags": ["{tags}"],
  "executed_at": "{timestamp}",
  "failed_step": "{N}",
  "error_message": "{mensaje de error de headless_results}",
  "setup_steps": [
    { "n": 1, "playbook_id": "P1", "text": "Crear registro principal con producto XYZ",
      "status": "PASS", "evidence": "setup_01.png",
      "interactions": [{ "page_url": "...", "selector_used": "...", "action_type": "click" }]
    },
    { "n": 2, "playbook_id": "P2", "text": "Marcar checkbox 'Opción avanzada'",
      "status": "PASS", "evidence": "setup_02.png", "interactions": [...] }
  ],
  "steps": [
    { "n": 1, "text": "Given...", "status": "PASS", "evidence": "evidence_01.png",
      "interactions": [{ "page_url": "...", "selector_used": "...", "action_type": "...", "element_label": "..." }]
    },
    { "n": "{N}", "text": "Then...", "status": "FAIL", "evidence": "evidence_{N:02d}.png" }
  ],
  "bug_screenshot": "bug_screenshot_annotated.png",
  "bug_candidate": {
    "title": "CP FAIL: {cp_title}",
    "matrix_ref": "{cp_id}",
    "environment": "{environment}",
    "steps_to_reproduce": "{steps_raw del CP}",
    "expected_result": "{Then esperado}",
    "actual_result": "{error_message}",
    "evidence_files": ["{lista de evidence_*.png}", "bug_screenshot_annotated.png"],
    "priority": "P{N}",
    "labels": ["{tags}", "ATF-executor"],
    "assignee": "",
    "initial_status": "Abierto",
    "project_type": "Bug"
  },
  "nav_learning": {
    "hits": 0, "misses": 0, "discoveries": 0, "skipped": false
  }
}
```

> **12 campos ALM GNP en `bug_candidate`** (REGLA 14 del executor):
> title, matrix_ref, environment, steps_to_reproduce, expected_result,
> actual_result, evidence_files, priority, labels, assignee, initial_status, project_type.
> El template de evidencia renderiza esta información como sección copiable para ALM.

> **`nav_learning`:** Si `{navigation_learning_enabled}` es `true`, extraer stats
> de `nav_stats_preloaded → by_cp[{cp_id}]` (si el invocador lo pasó) o leer
> `nav_stats_{module_id}.json → by_cp[{cp_id}]` como fallback. Si el CP no
> aparece → defaults a 0. Si `navigation_learning_enabled: false` →
> `{ "skipped": true, ... }`.

### steps_log.md

```markdown
# {cp_id} — {título}
**Resultado:** FAIL | **Módulo:** {module_id} | **HU:** {hu_id}
**Risk:** {risk_level} | **Tags:** {tags} | **Ejecutado:** {timestamp}

## Pasos ejecutados
| # | Paso | Resultado | Screenshot |
|---|------|-----------|------------|
| 1 | Given... | PASS | evidence_01.png |
| {N} | Then...  | FAIL | evidence_{N:02d}.png |

## Defecto
**Esperado:** {Then esperado}
**Actual:** {lo que ocurrió}
**Screenshot:** bug_screenshot_annotated.png
```

Ruta de salida: `{output_dir}/{cp_id}/`

---

## mode: blocked_evidence — result.json para CPs BLOCKED (ADR-001 Opción C')

Aplica cuando un CP no pudo ejecutarse por:
- `action: block` de un playbook (limitación ambiental — ej. feature no disponible en el ambiente)
- Fallo del setup_steps de un playbook o su verification
- `assertion_suspicious` detectada (REGLA 21 del executor)

### result.json

```json
{
  "cp_id": "{cp_id}",
  "module_id": "{module_id}",
  "status": "BLOCKED",
  "hu_id": "{hu_id}",
  "risk_level": "{risk_level}",
  "tags": ["{tags}"],
  "executed_at": "{timestamp}",
  "blocked_reason": "precondition_setup_failed: P2 paso 4: ..." |
                    "environmental_limitation: feature requiere integración upstream no disponible" |
                    "assertion_suspicious: paso 3 verifica estado POST-acción",
  "environmental_limitation": true | false,
  "setup_steps": [ /* pasos del playbook ejecutados, incluyendo el que falló si aplica */ ],
  "steps": [],
  "bug_candidate": null
}
```

---

## `setup_steps[]` schema

```json
"setup_steps": [
  {
    "n": 1,
    "playbook_id": "P1",
    "text": "...",
    "status": "PASS" | "FAIL",
    "evidence": "setup_NN.png",
    "interactions": [...]
  }
]
```

**Invariantes:**
- `setup_steps[]` es SEPARADO de `steps[]`. PASS/FAIL del CP se evalúa SOLO sobre `steps[]`.
- `setup_steps[]` solo puede producir BLOCKED si alguno de sus pasos falla.
- NO entra en REGLA DE FIDELIDAD 1:1.
- Evidencia usa prefijo `setup_` vs `evidence_` para steps del CP.
- `bug_candidate.steps_to_reproduce` usa SOLO `steps_raw` del Excel.

---

## Output (general)

```json
{
  "artifact_type": "{mode}",
  "files_written": ["{output_dir}/{cp_id}/result.json", "{output_dir}/{cp_id}/steps_log.md"]
}
```
