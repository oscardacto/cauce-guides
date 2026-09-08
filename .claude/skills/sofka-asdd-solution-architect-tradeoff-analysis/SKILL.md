---
name: sofka-asdd-solution-architect-tradeoff-analysis
description: Trade-offs entre alternativas con ATAM-lite, matriz ponderada y registro de riesgos. Previo a escribir un ADR.
---

## Propósito

Hacer explícitos los trade-offs entre alternativas viables y registrar los
riesgos. Produce evidencia trazable para que el ADR resultante no sea opinión
del arquitecto sino consecuencia de criterios.

## Cuándo invocar

- Hay ≥2 alternativas viables para una decisión arquitectónica.
- Antes de escribir un ADR con sección "Alternativas evaluadas" no trivial.
- Decisiones buy-vs-build.
- Selección de stack con impacto a +2 años.
- Cliente exige trazabilidad de la decisión (auditoría, compliance).

## Cuándo NO invocar

- Una sola alternativa viable — registrar contexto en el ADR y seguir.
- Decisión táctica sin impacto arquitectónico (qué linter usar).
- Decisión ya tomada por restricción dura (no hay tradeoff real).

## Metodología en 6 fases

### Fase 1 — Definir alternativas (≤4)

Más de 4 alternativas suele indicar que el problema no está bien acotado o que
hay alternativas claramente inferiores que conviene descartar antes.

Para cada alternativa documentar: nombre, descripción 1 párrafo, supuestos.

### Fase 2 — Listar quality attributes a evaluar

Tomar los atributos relevantes del contexto (de la ficha de discovery o del
backlog de NFRs).

Si los NFRs no están definidos o son vagos, **invocar primero**
`sofka-asdd-architect-quality` para cuantificarlos.

Atributos típicos: performance, scalability, security, maintainability,
operability, cost, time-to-market, team-fit.

### Fase 3 — Matriz de decisión

Método: matriz simple ponderada (MCDA básico). **Para proyectos del COE,
la matriz simple ponderada es suficiente** — AHP/TOPSIS son overkill.

Pasos:
- Asignar peso a cada atributo (suma = 100%). Pesos típicos: crítico 25-35%, importante 15-20%, deseable 5-10%.
- Scoring 1-5 por celda (1 muy malo, 5 muy bueno). **Cada celda debe tener una justificación corta** (1 línea). Sin justificación, el score es opinión.
- Calcular score ponderado: `Σ peso(criterio) × score(alt, criterio)`.

**Reglas Sofka de interpretación:**

| Diferencia entre top 2 | Acción |
|---|---|
| > 20% | Decisión robusta. Decidir. |
| 10-20% | Considerar sensitivity analysis. |
| < 10% | **Sensitivity analysis OBLIGATORIO.** |

**Sensitivity analysis — cuándo aplicar:**

- Top alternativa gana por <5-10% de margen.
- Hay desacuerdo sobre los pesos (PO dice "TTM es 30%", CTO dice "TTM es 15%").
- Decisión irreversible o costosa.

**Método sensitivity:** variar peso de cada atributo ±5% / ±10% y recalcular ranking; si el ganador cambia con un cambio menor, la decisión es frágil **respecto a ese atributo**. También sensitivity por score (variar ±1 en celdas críticas) y por inclusión/exclusión de atributos.

**Heurísticas Sofka:**

1. **Documentar el sensitivity en el ADR** si la decisión es importante. Auditores y futuros lectores agradecen entender la robustez.
2. **No abusar.** Sensitivity de cada celda en cada decisión es overkill — usar para decisiones P1.
3. **Cuando todo es sensible**, el problema está mal definido — volver a discovery o quality.

**Anti-patrones:**

- Pesos elegidos para favorecer una alternativa ("ajusto los pesos hasta que gane Postgres") → invalida el método.
- Criterios redundantes (Performance + Latency + Throughput) → sobrepesan implícitamente.
- Scoring sin evidencia.
- Ocultar la matriz al equipo — debe ser revisable y discutible.

### Fase 4 — ATAM-lite (opcional)

Si la decisión tiene múltiples atributos en tensión y stakeholders enfrentados,
aplicar ATAM-lite (síntesis del SEI ATAM):

- **Scenarios concretos** (estímulo + respuesta + medida).
- **Sensitivity points:** qué decisiones impactan cada atributo.
- **Tradeoff points:** decisiones que mejoran un atributo y empeoran otro.
- **Risks y non-risks** explícitos.

### Fase 5 — Risk register

Para cada riesgo identificado en alternativas: probabilidad × impacto +
estrategia (mitigar / transferir / aceptar / evitar) + owner + fecha de
revisión. Categorías de riesgo típicas: técnico, organizacional, operacional,
financiero, regulatorio, vendor, seguridad.

Plantilla en `templates/risk-register.md`.

### Fase 6 — Handoff a `sofka-asdd-architect-adr`

Producir el output (matriz + riesgos) y dejarlo enlazado desde el ADR
resultante. El ADR cita la matriz, no la duplica.

## Output

- `docs/architecture/decisions/tradeoffs/{decision}-matrix.md` (matriz + scoring + sensitivity)
- `docs/architecture/decisions/tradeoffs/{decision}-risks.md` (risk register)
- (Opcional) `docs/architecture/decisions/tradeoffs/{decision}-atam.md` si se hizo ATAM-lite

## Cuándo cargar cada reference

| Situación | Cargar |
|---|---|
| Plantilla matriz | `templates/decision-matrix.md` |
| Plantilla risk register | `templates/risk-register.md` |
| Ejemplos | `examples/tradeoff-postgres-vs-mongo.md`, `examples/tradeoff-monolith-vs-micro.md` |
