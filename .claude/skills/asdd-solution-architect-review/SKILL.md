---
name: asdd-solution-architect-review
description: Revisión arquitectónica de diseños y PRs estructurales — alineación con ADRs, cobertura de NFRs, riesgos y roadmap evolutivo.
---

## Propósito

Revisar diseños o PRs estructurales con tres lentes:
1. ¿El cambio respeta los ADRs y NFRs vigentes?
2. ¿Hay deuda nueva o riesgos que requieren roadmap evolutivo?
3. ¿La organización del equipo soporta esta arquitectura (Conway)?

Produce un reporte accionable con hallazgos y recomendaciones, y si aplica un
roadmap evolutivo o recomendación de team topology.

## Cuándo invocar

- PR estructural: nuevos servicios, cambio de stack, refactor cross-módulo.
- Review previo a fase Construir (handoff Diseñar → Construir).
- Auditoría periódica de arquitectura existente.
- Modernización de legado (extraer servicios de un monolito).
- Reorganización de equipos que afecta arquitectura.

## Cuándo NO invocar

- Code review táctico (delegar a `asdd-tech-lead-code-review`).
- Cambios sin impacto estructural (tweaks de UI, fix de bug local).
- Decisión nueva sin diseño aún → usar `architect-tradeoff-analysis` o
  `architect-patterns` primero.

## 3 modos según situación

### Modo 1 — Review checklist (default)

Revisión de un diseño / PR estructural contra checklist estándar.

**Flujo:**
1. Cargar `templates/review-checklist.md` (60+ items Guide específicos: ADR alignment, BC respect, expand-contract, idempotency, DLQ, mTLS, OpenTelemetry, ArchUnit, cognitive load, blue-green/canary, FinOps).
2. Marcar cada item: cumple / no cumple / N/A + comentario.
3. Producir `templates/review-report.md` con findings priorizados.

**Output:** `docs/architecture/reviews/{YYYY-MM-DD}-{titulo}-review.md`.

### Modo 2 — Evolution roadmap

El review identifica deuda mayor o necesidad de modernización. Producto: plan
evolutivo concreto con hitos.

**Flujo:**
1. Identificar el problema (legacy a estrangular, monolito a partir, lib a reemplazar).
2. Aplicar el patrón evolutivo apropiado (Claude conoce el catálogo):
   - **Strangler Fig** (Fowler) — extraer servicios de un monolito gradualmente.
   - **Branch by Abstraction** (Hammant/Humble) — reemplazar implementación interna sin big-bang.
   - **Tácticas de migración:** Expand-Contract, parallel run, feature toggles, blue-green, canary, dual-write, CDC.
3. Producir `templates/evolution-roadmap.md` con hitos verificables y riesgos.

**Output:** `docs/architecture/roadmap/{titulo}-evolution.md`.

### Modo 3 — Team topology / Conway

Hay fricción organizacional que afecta arquitectura. Análisis de Conway's law
y propuesta de topología.

**Flujo:**
1. Diagnóstico Conway: detectar dónde la estructura del equipo está forzando una arquitectura subóptima (síntomas: BC compartido entre 2 equipos, módulo sin owner claro, integración acoplada por la organización).
2. Aplicar Team Topologies (Skelton & Pais) — los 4 tipos de equipo: **Stream-aligned, Enabling, Complicated-Subsystem, Platform**.
3. Aplicar los 3 modos de interacción: **Collaboration, X-as-a-Service, Facilitating**.
4. Producir recomendación: qué equipos, qué interacciones, qué cambios organizacionales se requieren.

**Output:** `docs/architecture/topology/{titulo}-topology.md`.

## Cuándo cargar cada reference

| Modo | Cargar |
|---|---|
| Cualquier modo — checklist Guide | `templates/review-checklist.md` |
| Cualquier modo — formato reporte | `templates/review-report.md` |
| Modo 2 — formato roadmap | `templates/evolution-roadmap.md` |
| Ejemplo Modo 2 — monolito → micro | `examples/review-monolith-decomposition.md` |
| Ejemplo Modo 3 — platform team | `examples/topology-platform-team.md` |

## Salida (Definition of Done)

- [ ] Hallazgos priorizados (P1/P2/P3) con justificación.
- [ ] Cada P1 tiene acción concreta + owner.
- [ ] Si Modo 2: roadmap con ≥3 hitos verificables.
- [ ] Si Modo 3: recomendación de topología + plan de transición.
- [ ] Output guardado en la ruta correspondiente.
