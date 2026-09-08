---
name: asdd-tech-lead-artifact-audit
description: Audita completitud y trazabilidad de artefactos ASDD (brief, spec, ADR, contrato, gaps). READ-ONLY.
---

# Auditoría de Artefactos ASDD

> **MODO READ-ONLY** — solo audita y reporta. No modifica briefs, specs, ADRs ni contratos. Las correcciones las aplica `asdd-producto`, `asdd-solution-architect` o el agente correspondiente en un turno separado.

Audita los artefactos que produce el flujo ASDD (WF-001 a WF-003) para garantizar que cumplen completitud por fase, son consistentes entre sí y mantienen trazabilidad bidireccional (brief → spec → ADR → contrato). Bloquea el avance a Construir cuando detecta huecos críticos (CORE-001: sin spec aprobada no se codifica).

## Rol

Auditor documental del flujo ASDD. Verifica que cada artefacto cumple su contrato de fase (`asdd-workflow.md` WF-001..WF-006) y que la cadena de trazabilidad entre artefactos no se rompe.

## Cuándo activar

- Antes de iniciar Construir (gate previo a `asdd-developer-frontend` / `asdd-developer-backend`): verificar que existe spec aprobada y artefactos de Diseñar completos (CORE-001, CORE-006).
- Al cerrar la fase Analizar: verificar que el spec resuelve los ≥ 2 gaps documentados o que `gaps-{feature}-{NNN}.md` declara las preguntas abiertas (WF-002).
- Al cerrar la fase Diseñar: verificar que toda decisión técnica significativa tiene ADR aprobado (CORE-005, WF-003).
- Auditoría periódica del directorio `docs/` para detectar drift entre código y artefactos (paralelo a la auditoría de `CLAUDE.md` definida en `asdd-claude-md-maintenance.md`).
- Fases: **Analizar, Diseñar, Verificar** (gate previo a Construir).

## Proceso

1. Determinar el alcance: una feature concreta (`{feature}-{NNN}`) o auditoría general del directorio `docs/`.
2. Inventariar artefactos presentes en `docs/specs/`, `docs/architecture/decisions/`, `docs/architecture/contracts/`, `docs/architecture/diagrams/`.
3. Evaluar cada artefacto contra su checklist de completitud por fase.
4. Verificar trazabilidad bidireccional: cada spec referencia su brief; cada ADR referencia la spec/decisión que lo motivó; cada endpoint del contrato OpenAPI tiene un criterio de aceptación en alguna historia.
5. Clasificar hallazgos por severidad y producir el reporte.

## Checklist por artefacto

### Brief (ruta SPECIFY registrada en `.asdd-run.json`) — WF-001

| Check | Criterio | Severidad |
|---|---|---|
| Existe | El brief existe antes de cualquier `docs/specs/{feature}-{NNN}.md` (hook `asdd-pre-tool-use-analyze-guard` enforza esto) | blocker |
| Alcance explícito | Responde ¿qué construimos?, ¿para quién?, ¿con qué restricciones?, ¿dominio? | blocker |
| Restricciones declaradas | Sección con restricciones de negocio, técnicas y de cumplimiento conocidas | major |
| Contexto de dominio | Referencia al dominio del proyecto y a `asdd-domain-expert` activo | major |
| Sin código de implementación | El brief no contiene snippets ni decisiones técnicas (eso vive en ADR) | suggestion |

### Spec (`docs/specs/{feature}-{NNN}.md`) — WF-002

| Check | Criterio | Severidad |
|---|---|---|
| Brief referenciado | El spec cita la ruta run-trazable exacta del brief del que deriva | blocker |
| User Story + escenarios testables | §1 tiene la User Story y §10 tiene escenarios Gherkin (`Scenario:` Given/When/Then) | blocker |
| Reglas de negocio identificadas | Sección §6 con IDs `RN-001..` tipados `[CORE]` / `[EDGE]` y descripción | major |
| Flujo de Negocio documentado | Sección §4 "Flujo de Negocio" con pasos numerados + máquina de estados (señal del super-spec corporativo, ADR-004 §6.2) | major |
| Restricciones arquitectónicas | Sección poblada si `asdd-solution-architect` participó | major |
| Requisitos de seguridad | Sección poblada si hay PII, auth, cifrado o regulación | blocker (cuando aplica) |
| Granularidad correcta | Un spec por funcionalidad acotada (no specs gigantes que cruzan bounded contexts) | major |
| Gaps gestionados | Si hay ≥ 2 preguntas abiertas, existe `gaps-{feature}-{NNN}.md` (WF-002) | blocker |

### Gap analysis (`docs/specs/gaps-{feature}-{NNN}.md`) — WF-002

| Check | Criterio | Severidad |
|---|---|---|
| Mismo NNN que spec | El número de gaps coincide con el de su spec hermano | major |
| Preguntas explícitas | Cada gap es una pregunta abierta concreta, no una observación | major |
| Estado por gap | Cada gap indica `abierto`, `resuelto`, `descartado` con fecha | suggestion |

### ADR (`docs/architecture/decisions/ADR-NNN-titulo.md`) — WF-003

| Check | Criterio | Severidad |
|---|---|---|
| Numeración correlativa | `ADR-NNN` sin huecos ni duplicados | major |
| Estado declarado | `Propuesta`, `Aceptada`, `Rechazada`, `Reemplazada por ADR-MMM` | blocker |
| Contexto | Sección con el problema o restricción que motiva la decisión | blocker |
| Decisión | Sección con la decisión técnica concreta | blocker |
| Consecuencias | Sección con trade-offs y consecuencias asumidas | major |
| Alternativas consideradas | Mínimo dos alternativas evaluadas con su trade-off | major |
| Decisión significativa | Toda decisión técnica significativa de la fase Diseñar tiene ADR (CORE-005) | blocker |

### Contrato API (`docs/architecture/contracts/{servicio}.yaml`) — WF-003

| Check | Criterio | Severidad |
|---|---|---|
| Sintaxis válida | El YAML/JSON parsea contra schema OpenAPI 3.x o AsyncAPI | blocker |
| Endpoints trazables | Cada endpoint mapea a uno o más criterios de aceptación en specs | major |
| Schemas reutilizados | Tipos comunes viven en `components/schemas`, no inline duplicado | suggestion |
| Auth declarada | `securitySchemes` definido si los endpoints requieren autenticación | blocker (cuando aplica) |
| Versionado | El contrato declara versión (`info.version`) y sigue SemVer | major |

### Diagramas C4 (`docs/architecture/diagrams/`) — WF-003

| Check | Criterio | Severidad |
|---|---|---|
| Niveles correctos | L1 (Context), L2 (Container), L3 (Component) producidos por `asdd-solution-architect`; Deployment producido por `asdd-cloud-architect` | major |
| Mermaid válido | El bloque Mermaid renderiza sin error | blocker |
| Coherencia con código | Componentes nombrados existen en el codebase (cuando ya hay implementación) | major |

## Trazabilidad bidireccional

Verificar las siguientes cadenas. Cada eslabón roto es un hallazgo:

```
brief-{proyecto}.md
  ↓ (cita)
{feature}-{NNN}.md  ←→  gaps-{feature}-{NNN}.md (si ≥ 2 preguntas abiertas)
  ↓ (cita)
ADR-NNN-titulo.md  ←→  decisiones técnicas significativas (CORE-005)
  ↓ (referencia)
{servicio}.yaml  ←→  criterios de aceptación de las historias
  ↓ (informa)
código de producción + tests
```

Reglas de trazabilidad obligatorias:

- Un spec sin brief referenciado → hallazgo blocker (CORE-001).
- Un ADR que no se cita desde ninguna spec ni desde otro ADR → hallazgo major (ADR huérfano, posible deuda documental).
- Un endpoint en contrato API sin criterio de aceptación que lo justifique → hallazgo major.
- Una historia con criterio de aceptación que requiere endpoint inexistente en el contrato → hallazgo blocker (rompe coherencia spec-contrato).
- Una decisión técnica visible en código (stack, librería mayor, patrón) sin ADR → hallazgo major (deuda documental, CORE-005).

## Severidades

| Nivel | Significado | Acción requerida |
|---|---|---|
| **blocker** | Impide avanzar de fase — viola CORE-001, CORE-005 o CORE-006, o rompe trazabilidad spec ↔ contrato | Debe resolverse antes de salir de la fase actual |
| **major** | Deuda documental significativa o incumplimiento de checklist por fase | Debe resolverse antes del sign-off de QA o acordar ticket de seguimiento |
| **suggestion** | Mejora de estructura, claridad o consistencia menor | El owner del artefacto decide |

## Formato del reporte

```markdown
## Auditoría de Artefactos ASDD — {alcance: feature-NNN | docs/}
**Fecha**: {YYYY-MM-DD}
**Auditor**: asdd-tech-lead (skill artifact-audit)

### Inventario
| Artefacto | Ruta | Existe | Fase |
|---|---|---|---|
| Brief | docs/specs/brief-{proyecto}.md | ✓ / ✗ | WF-001 |
| Spec | docs/specs/{feature}-{NNN}.md | ✓ / ✗ | WF-002 |
| Gaps | docs/specs/gaps-{feature}-{NNN}.md | ✓ / ✗ / n/a | WF-002 |
| ADRs | docs/architecture/decisions/ADR-*.md | {lista} | WF-003 |
| Contratos | docs/architecture/contracts/*.yaml | {lista} | WF-003 |
| Diagramas | docs/architecture/diagrams/*.md | {lista} | WF-003 |

### Hallazgos
| ID | Severidad | Artefacto | Hallazgo | Acción sugerida | Owner |
|---|---|---|---|---|---|
| H-001 | blocker | spec-{feature}-001 | No referencia brief-{proyecto}.md | Citar brief en sección "Contexto" | asdd-producto |
| H-002 | major | ADR-007 | Sin sección "Alternativas consideradas" | Documentar 2 alternativas evaluadas | asdd-solution-architect |

### Trazabilidad
- brief → spec: {ok / rota — detalle}
- spec → ADRs: {N decisiones técnicas; M con ADR; cobertura X%}
- spec ↔ contrato: {endpoints sin AC: lista}

### Veredicto
**Resultado**: PASS / FAIL
**Bloqueantes pendientes**: {N}
**Mayores pendientes**: {N}
**Acción requerida para PASS**: {lista concreta o "ninguna"}
```

## Outputs

- `docs/tech/{run_id}-{PHASE}-{SEQ}-artifact-audit-{feature-o-alcance}.md` — reporte completo con inventario, hallazgos, trazabilidad y veredicto. El nombre lo devuelve `asdd-artifact-name.mjs` (ART-001).

## Relación con skills y reglas existentes

- `asdd-tech-lead-code-review`: revisa **código**. Esta skill (artifact-audit) revisa **artefactos documentales ASDD** (specs, ADRs, contratos, briefs). Son complementarias: code-review valida el "qué construimos" frente al "cómo lo construimos"; artifact-audit valida que el "qué" existe, está completo y es trazable.
- `asdd-tech-lead-quality-gate`: emite veredicto sobre **métricas de código** (cobertura, complejidad). Artifact-audit emite veredicto sobre **completitud documental**. Ambos pueden requerirse antes de avanzar a release.
- `asdd-tech-lead-refactoring-plan`: propone plan de mejora sobre **código existente**. Artifact-audit propone plan implícito sobre **deuda documental** vía sus hallazgos.
- `asdd-claude-md-maintenance.md`: regla que gobierna mantenimiento de los `CLAUDE.md` por módulo. Artifact-audit no audita esos archivos — se enfoca en `docs/specs/`, `docs/architecture/`, `docs/qa/`.
- Anclas aplicadas: CORE-001 (sin spec aprobada no se codifica), CORE-005 (toda decisión significativa = ADR), CORE-006 (sin desviaciones silenciosas de la spec), WF-001 a WF-003 (criterios de completitud por fase).

## Cuándo NO invocar

- Se busca revisar código fuente — usar `asdd-tech-lead-code-review`.
- Se busca validar métricas de cobertura/complejidad — usar `asdd-tech-lead-quality-gate`.
- Se busca evaluar el reporte de QA o el QGS de pruebas API — eso lo emite `asdd-atf-reporting-qa-engineer`, no esta skill.
- El proyecto aún no entró en flujo ASDD (no hay `docs/specs/` poblado) — primero ejecutar `/asdd:specify` y `/asdd:analyze`.
- Se busca auditar el `CLAUDE.md` de un módulo — esa responsabilidad está cubierta por `asdd-claude-md-maintenance.md` y la cadencia descrita allí (post-feature, quincenal, pre-release).

## Anti-patterns

- **Auditar sin abrir los archivos** — emitir veredicto desde el listado del directorio. Cada hallazgo debe citar el archivo y la sección o línea concreta donde falta el contenido.
- **PASS con trazabilidad rota** — declarar PASS porque "todos los archivos existen" mientras un spec no referencia su brief o un endpoint del contrato no tiene criterio de aceptación. La existencia del archivo no equivale a su completitud.
- **Severidad inflada** — marcar como blocker mejoras cosméticas (formato, orden de secciones). Blocker es solo lo que viola CORE-001/005/006 o rompe trazabilidad operativa.
- **Auditoría que modifica artefactos** — esta skill es READ-ONLY. Si el auditor "arregla de paso" un spec, contamina la evidencia y desplaza la responsabilidad fuera del owner. Las correcciones las aplica el owner del artefacto en un turno separado.
- **Confundir deuda documental con incompletitud bloqueante** — un ADR retroactivo sobre una decisión ya implementada es deuda (major), no bloqueante (blocker) para avanzar a Verificar. Bloqueante solo lo es cuando viola CORE-001 (spec inexistente o no aprobada antes de Construir).
