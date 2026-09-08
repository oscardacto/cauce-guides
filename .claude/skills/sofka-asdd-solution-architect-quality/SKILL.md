---
name: sofka-asdd-solution-architect-quality
description: Convierte NFRs vagos en atributos ISO/IEC 25010 medibles, con SLOs, SLIs y fitness functions ejecutables en CI.
---

## Propósito

Transformar NFRs vagos en atributos de calidad medibles, priorizados y
verificables automáticamente. Pipeline:

```
NFR vago → atributo ISO/IEC 25010 → quality scenario → SLO/SLI → fitness function
```

El output alimenta tradeoff-analysis (criterios), ADRs (atributos drivers),
review (verificación) y se ejecuta en CI como quality gate.

## Cuándo invocar

- Acceptance criteria del PO contienen palabras vagas ("rápido", "seguro", "escalable").
- Handoff Producto → Arquitecto cuando los NFRs no están cuantificados.
- Decisión de tradeoff que requiere atributos medibles como criterios.
- Drift detectado en producción (latencia subió, error rate creció).
- Auditoría de calidad en fase Verificar — validar fitness functions vigentes.

## Cuándo NO invocar

- NFRs ya cuantificados, validados y vivos en pipeline.
- Decisión sin impacto en atributos de calidad (refactor cosmético).
- Bug fix puntual.

## Metodología en 5 fases

### Fase 1 — NFR elicitation

**Workflow Sofka — 3 preguntas por NFR vago:**

1. ¿Bajo qué condiciones / volumen?
2. ¿Qué métrica lo expresa?
3. ¿Qué umbral es aceptable y cuál es crítico?

**Tabla CORE de traducciones vago → cuantitativo (atributos más comunes):**

| Atributo | Vago | Cuantificado |
|---|---|---|
| Performance | "Rápido" | P95 ≤ 200ms en endpoint /X bajo carga normal (5k RPS) |
| Reliability | "Disponible siempre" | Uptime mensual 99.9% (43m downtime/mes permitido) |
| Reliability | "Recupera rápido" | RTO ≤ 1h, RPO ≤ 5min |
| Security | "Seguro" | SAST sin findings sev high+; vulns críticas patched ≤ 7 días |
| Security | "Datos protegidos" | Cifrado AES-256 at rest + TLS 1.2+ in transit; KMS rotation 90 días |
| Maintainability | "Mantenible" | Cyclomatic complexity ≤ 10/función promedio; deploy frequency ≥ 1/día |
| Scalability | "Escalable" | Crece linealmente hasta 10× carga actual (escalado horizontal) |
| Cost | "Costo controlado" | Cloud spend ≤ USD X/mes con budget alerts a 80% / 100% |

**Anti-patrones Sofka — NFRs:**

1. **NFR sin contexto:** "P95 ≤ 200ms" sin decir en qué endpoint, bajo qué carga, en qué entorno.
2. **Umbrales arbitrarios:** "5 9s" sin justificar el costo.
3. **Mezclar SLI con SLO:** SLI es la métrica, SLO es el target — documentar separados.
4. **Atribuir sin evidencia:** "el sistema debe ser seguro" sin pen test, SAST, training.
5. **NFRs no priorizados:** intentar maximizar 8 atributos a la vez = ninguno se logra.

### Fase 2 — Mapeo a ISO/IEC 25010

Mapear cada NFR cuantificado a uno (a veces dos) de los 8 atributos
ISO/IEC 25010: **Functional Suitability, Performance Efficiency,
Compatibility, Usability, Reliability, Security, Maintainability,
Portability**. Esto:

- Detecta NFRs "huérfanos" (no encajan → revisar).
- Permite priorizar atributos según el negocio.
- Revela gaps (atributos críticos sin NFR documentado).

Priorizar top 3-5 atributos por sistema. Más es ruido.

### Fase 3 — Quality scenarios formato SEI

Para cada NFR top, escribir un quality scenario formato SEI:

```
[Source, Stimulus, Artifact, Environment, Response, Measure]
```

Plantilla en `templates/quality-scenario.md`. Esto vuelve operativo el atributo
y prepara el siguiente paso.

### Fase 4 — SLO/SLI

Cargar `templates/slo-sli.md`.

Para los top 3 atributos, definir:
- SLI (indicator): la métrica concreta y fórmula.
- SLO (objective): el target a cumplir (ej. "P95 < 200ms en /checkout").
- Error budget: 1 - SLO (ej. SLO 99.9% mensual → error budget 43m de downtime/mes).
- Alert burn rate: cuándo despertarse (ej. consumiendo 2× el burn esperado en 1h).

### Fase 5 — Fitness functions

Para cada SLO o invariante arquitectónico, escribir un test ejecutable en CI
(concepto Fitness Functions de Ford / Parsons / Kua):

| Atributo | Tipo de fitness function |
|---|---|
| Performance | k6, JMeter, Gatling — load test con thresholds |
| Maintainability | ArchUnit, dependency-cruiser, ts-arch — invariantes estructurales |
| Security | SAST (SonarQube, Semgrep), dependency scanning (Dependabot, Snyk), secret scanning (gitleaks) |
| Reliability | Chaos tests (LitmusChaos), gameday playbooks |
| Operability | Runbook tests, alert validation |

Cada fitness function en CI = quality gate. Falla = build rojo.

## Output

- `docs/architecture/quality/{feature}-attributes.md` — top atributos + scenarios
- `docs/architecture/quality/{feature}-slos.md` — SLO/SLI con error budgets
- `tests/architecture/{feature}-fitness.spec.{ext}` — fitness functions ejecutables

## Cuándo cargar cada reference

| Situación | Cargar |
|---|---|
| Plantilla scenario SEI | `templates/quality-scenario.md` |
| Plantilla priority matrix de atributos | `templates/priority-matrix.md` |
| Plantilla SLO/SLI | `templates/slo-sli.md` |
| Ejemplo SLO/SLI checkout | `examples/slo-sli-checkout.md` |
| Ejemplo ArchUnit (invariantes Sofka) | `examples/archunit-example.md` |
| Ejemplo dependency-cruiser (reglas Sofka) | `examples/dependency-cruiser-example.md` |
