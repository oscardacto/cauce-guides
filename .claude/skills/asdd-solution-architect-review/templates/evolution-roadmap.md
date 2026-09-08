# Evolution Roadmap — {Iniciativa}

**Fecha:** {YYYY-MM-DD}
**Autor:** {arquitecto}
**Contexto del review:** ver `{titulo}-review.md`
**Patrón principal:** Strangler Fig / Branch by Abstraction / Big Bang Rewrite

## Estado actual

{1-2 párrafos. Diagnóstico del legacy / problema arquitectónico.}

## Estado objetivo

{1-2 párrafos. Cómo querés que se vea el sistema al final del roadmap.}

## Estrategia

{Patrón elegido y por qué. Justificación frente a alternativas descartadas.}

## Hitos verificables

### Hito 1 — {Título corto} ({fecha objetivo})

- **Outcome esperado:** {qué cambia, qué se puede afirmar al cumplirse}
- **Métrica de éxito:** {ej. 10% del tráfico migrado al nuevo sin regresiones}
- **Tareas técnicas clave:**
  - [ ] {…}
  - [ ] {…}
- **Riesgos:** {…}
- **Owner:** {nombre / equipo}

### Hito 2 — {…} ({fecha objetivo})

- **Outcome:** {…}
- **Métrica de éxito:** {…}
- **Tareas:**
  - [ ] {…}
- **Owner:** {…}

### Hito 3 — {…} ({fecha objetivo})

{…}

### Hito N — Apagar legacy ({fecha objetivo})

- **Outcome:** legacy 0% del tráfico, código removido del repo, docs actualizadas.
- **Métrica:** auditoría de uso del legacy = 0 referencias activas.

## Métricas globales del roadmap

- **% del tráfico en sistema nuevo:** target X% al hito N.
- **Error rate del nuevo vs legacy:** ≤ legacy.
- **Latencia P95 del nuevo:** ≤ legacy + 10%.

## Riesgos del roadmap

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | {Paridad funcional rota} | Media | Alto | Tests E2E + traffic mirroring antes de cutover |
| R2 | {Costo doble durante migración} | Alta | Medio | Deadline de cutover por hito |
| R3 | {Pérdida de motivación equipo} | Media | Medio | Hitos pequeños + celebración de cada cutover |

## Definition of Done del roadmap

- [ ] Todos los hitos completados.
- [ ] Legacy apagado (sin referencias activas).
- [ ] ADR final documentando el cierre del roadmap.
- [ ] Documentación del nuevo sistema completa.
- [ ] Equipo ejecutando con autonomía sin shadowing.

## Sponsors

- {Sponsor del engagement}
- {Tech Lead del equipo}
- {Lead Architect}

## Revisiones programadas

- Revisión mensual del progreso vs hitos.
- Revisión trimestral con sponsor.
