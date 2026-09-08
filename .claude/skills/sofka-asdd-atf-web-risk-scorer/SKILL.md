---
name: sofka-asdd-atf-web-risk-scorer
description: Descompone cada HU o flujo en riesgos por categoría, con narrativa, score severidad por probabilidad y mitigación.
used_by:
  - sofka-asdd-atf-web-qa-engineer
---

## Inputs

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `items` | array | HUs o flujos a analizar (`id`, `title`, `domain_type`, `description`, `has_text_inputs`, `has_financial_data`, `known_findings`, `acceptance_criteria` literales del CA) |
| `scoring_context` | string | `"hu"` · `"flow"` · `"api"` |
| `known_findings` | array | Hallazgos previos a incorporar como riesgos |
| `cross_cutting_mode` | string | `"literal"` (default, apps internas/admin) · `"expanded"` (apps cara al usuario) · `"shift_left"` (apps críticas). Heredado de `appweb.yaml → enrichment.cross_cutting_mode`. |
| `domain_compliance` | array | Marcos regulatorios aplicables al dominio (ej: `["OWASP-Top10", "PCI-DSS", "HIPAA"]`). Heredado de `appweb.yaml → security.compliance` o vacío por default. |

---

## PASO 0 — Categorías de riesgo por dominio

| Dominio | Categorías |
|---------|------------|
| `auth` | Funcionalidad, Seguridad, Rendimiento |
| `catalog/listing` | Funcionalidad, Rendimiento, Localización, Concurrencia |
| `form/crud` | Funcionalidad, Seguridad, Usabilidad |
| `checkout/transaction` | Funcionalidad, Seguridad, Fiabilidad, Rendimiento |
| `profile/account` | Funcionalidad, Seguridad |
| `search` | Funcionalidad, Rendimiento, Seguridad |
| `.claude/dashboard/report` | Funcionalidad, Rendimiento, Fiabilidad |
| `generic` | Funcionalidad, Rendimiento |

---

## PASO 0bis — Clasificación de origen (`source` por risk) — INVIOLABLE

> **Regla anti-alucinación.** Cada risk emitido DEBE clasificarse en uno de tres buckets de origen. Esta clasificación es lo que permite al QA llevar al PO solo lo que requiere validación, sin perder cobertura `shift-left`.

| `source` | Cuándo aplica | `evidence` requerido | tag automático |
|---|---|---|---|
| `hu_literal` | El CA del HU enuncia EXPLÍCITAMENTE el riesgo o la condición que lo desencadena. Ej: CA dice "el sistema rechaza inputs >50 chars" → riesgo de validación de longitud es literal. | cita literal del CA o `known_finding.id` | `[]` (sin tag especial) |
| `compliance_mandatory` | La categoría de riesgo está en `domain_compliance[]` aplicable al dominio. Ej: `OWASP-Top10` → XSS/SQLi siempre obligatorios; `PCI-DSS` → cifrado de PAN siempre obligatorio; `HIPAA` → audit log de acceso a PHI siempre obligatorio. NO depende del CA. | nombre del marco normativo (ej: `"OWASP-Top10:A03"`, `"PCI-DSS-3.2.1:Req-3.4"`) | `["@compliance-mandatory"]` |
| `cross_cutting_inferred` | El riesgo NO está en CA literal NI es compliance mandatorio, pero el agente lo infiere por doctrina técnica (ej: XSS en un campo de texto de app interna sin compliance OWASP). | `null` (no hay evidencia trazable) | `["@cp-derivado", "@requiere-validacion"]` |

### Modo `cross_cutting_mode` controla profundidad de inferencia

| Modo | Cobertura `cross_cutting_inferred` |
|---|---|
| `literal` (default apps internas/admin) | Solo OWASP-Top10 básicos (XSS reflected/stored, SQLi, broken auth) sobre inputs externos. Otros riesgos especulativos (timing, SSRF, CSRF avanzado) → omitidos. |
| `expanded` (apps cara al usuario) | + CSRF, file upload, redirección abierta, header injection. |
| `shift_left` (apps críticas: banking/salud/regulatorio) | + timing attacks, race conditions especulativas, side-channels, downgrade attacks. |

> **A2 confirmado:** `cross_cutting_inferred` se emiten SIEMPRE (no se omiten en modo `literal`) — solo cambia la profundidad/cantidad. El tag `@requiere-validacion` permite que el QA filtre antes de llevar al PO. NO se pierden hallazgos por modo conservador.

---

## PASO 1 — Generar riesgos por categoría (con clasificación `source`)

Por cada categoría aplicable al dominio, generar risk entry con narrativa `dado_que/puede_pasar/provocaría` Y aplicar PASO 0bis para clasificar `source`:

- **Funcionalidad:** flujo principal → componente no responde → usuario bloqueado
  - Default `source: hu_literal` si el CA describe el flujo. Si no → `cross_cutting_inferred`.
- **Seguridad:** input externo/sesión → vector ataque (XSS/SQLi/session) → acceso no autorizado
  - Si `domain_compliance` incluye `OWASP-Top10` → `compliance_mandatory` con `evidence: "OWASP-Top10:A03"` (XSS/SQLi/CSRF clásicos).
  - Si CA enuncia "validar input" o similar → `hu_literal`.
  - Resto (vector especulativo) → `cross_cutting_inferred` + `@requiere-validacion`.
- **Rendimiento:** carga/frecuencia → supera umbral → degradación UX
  - Si `domain_compliance` incluye SLAs documentados → `compliance_mandatory`.
  - Si CA enuncia umbral concreto → `hu_literal`.
  - Resto → `cross_cutting_inferred`.
- **Fiabilidad:** escritura/transacción → fallo parcial → estado inconsistente
- **Localización:** formato regional → omite conversión → error financiero
- **Usabilidad:** acción compleja → UI no comunica estado → abandono
- **Concurrencia:** acceso simultáneo → race condition → datos corruptos

> Para cada risk: poblar `source`, `evidence`, `tags[]` según PASO 0bis. NO omitir estos campos — el dashboard depende de ellos para el filtro `requiere validación PO`.

## PASO 2 — Incorporar known_findings

Cada hallazgo → risk entry adicional con categoría correspondiente, `source: "hu_literal"` (ya hay evidencia), `evidence: known_finding.id`, `tags: []`.

## PASO 3 — severity_score

| Factor | Peso |
|--------|------|
| Transacción financiera / datos sensibles | 4 |
| Auth / gestión de acceso | 4 |
| Modificación/eliminación datos | 3 |
| Flujo crítico negocio | 3 |
| Integración terceros | 2 |
| Lectura datos no sensibles | 2 |
| Soporte / configuración | 1 |
| Informativo / estático | 1 |

Extras: Seguridad con vector identificado +1, Localización con impacto financiero +1, Fiabilidad con pérdida datos +1.
`severity_score = min(4.0, promedio(pesos aplicables))`

## PASO 4 — probability_score

| Factor | Peso |
|--------|------|
| Feature principal / todos los usuarios | 4 |
| Alta frecuencia / tráfico | 4 |
| Múltiples integraciones | 3 |
| Interacciones complejas (wizard, multi-step) | 3 |
| Hallazgo previo | 3 |
| Uso moderado | 2 |
| Uso bajo / nicho | 1 |

`probability_score = min(4.0, promedio(pesos aplicables))`

## PASO 5 — risk_score y risk_level

`risk_score = severity × probability` (1.0–16.0)

| Rango | risk_level |
|-------|------------|
| 12.1–16.0 | `critical` |
| 8.1–12.0 | `high` |
| 4.1–8.0 | `medium` |
| 1.0–4.0 | `low` |

`flow_risk_weight = min(4, ceil(risk_score / 4))` (solo para `scoring_context = "flow"`)

## PASO 6 — brief_description

Formato: `"[Qué puede fallar]: [descripción concreta]. [Impacto]: [consecuencia negocio/usuario]. CAs afectados: [lista]"`
Debe ser autocontenido y claro para lector no técnico. NO genérico.

## PASO 7 — Estrategia de mitigación

| Categoría | Estrategia |
|-----------|-----------|
| Funcionalidad | CPs funcionales (EP, BVA, State Transition); exploración guiada |
| Seguridad | CPs inyección; pruebas sesión; headers |
| Rendimiento | CPs performance (LCP/FID/CLS); carga |
| Fiabilidad | Recuperación ante error; idempotencia |
| Localización | Formato regional; assertión estándar |
| Usabilidad | Mensajes error; heurística Nielsen; a11y |
| Concurrencia | Doble acción; multi-tab |

## PASO 8 — is_critical flag

`true` si: risk_level=critical, O Seguridad con impact critical/high, O Fiabilidad financiera, O known_finding high+.

---

## Output

```json
{
  "hu_risks": [{
    "hu_id": "",
    "risks": [{
      "risk_id": "R-{HU}-{CAT}-{N}",
      "risk_category": "",
      "source": "hu_literal | compliance_mandatory | cross_cutting_inferred",
      "evidence": "cita CA | OWASP-Top10:A03 | known_finding.id | null",
      "tags": ["@compliance-mandatory" | "@cp-derivado" | "@requiere-validacion"],
      "brief_description": "",
      "full_description": { "dado_que": "", "puede_pasar_que": "", "lo_que_provocaria_que": "" },
      "severity_score": 0, "probability_score": 0, "risk_score": 0, "risk_level": "",
      "is_critical": false, "mitigation_strategy": ""
    }]
  }],
  "all_risks_flat": [{
    "risk_id": "", "hu_id": "", "module": "", "risk_category": "",
    "source": "...", "evidence": "...", "tags": [],
    "brief_description": "", "risk_level": "", "risk_score": 0, "is_critical": false
  }],
  "summary": {
    "total_hus_analyzed": 0,
    "total_risks_identified": 0,
    "risks_by_level": {},
    "risks_by_category": {},
    "risks_by_source": { "hu_literal": 0, "compliance_mandatory": 0, "cross_cutting_inferred": 0 },
    "critical_hus": [],
    "known_findings_incorporated": 0,
    "cross_cutting_mode_applied": "literal | expanded | shift_left"
  }
}
```