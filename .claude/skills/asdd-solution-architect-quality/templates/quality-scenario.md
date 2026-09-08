# Quality Scenario — {Nombre}

**Atributo ISO/IEC 25010:** {ej. Performance Efficiency / Time Behaviour}
**Sistema / Componente:** {…}
**Prioridad:** P1 / P2 / P3
**Fecha:** {YYYY-MM-DD}

## Scenario

| Campo | Valor |
|---|---|
| **Source** | {Quien genera el estímulo: usuario, sistema externo, evento programado} |
| **Stimulus** | {Qué evento ocurre: 5000 req/seg, falla de zona, intento de inyección SQL} |
| **Artifact** | {Componente afectado: servicio X, BD, cluster K} |
| **Environment** | {Dónde y cuándo: producción, alta carga, off-peak} |
| **Response** | {Qué debe hacer el sistema: responder, escalar, notificar, recuperar} |
| **Measure** | {Cómo se valida: métrica + umbral} |

## Ejemplo redactado

> Cuando el {Source} genera {Stimulus} sobre {Artifact} en {Environment},
> el sistema debe {Response}, validable mediante {Measure}.

## Trazabilidad

- **NFR origen:** {acceptance criteria, ticket, restricción}
- **SLO derivado:** ver `{feature}-slos.md`
- **Fitness function:** `tests/architecture/{feature}-fitness.spec.{ext}`
- **ADR(s) relacionados:** ADR-{NNN}

## Status

- [ ] Definido
- [ ] SLO derivado
- [ ] Fitness function implementada
- [ ] En CI con quality gate
- [ ] Revisado trimestralmente
