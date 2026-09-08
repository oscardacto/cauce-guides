# Spec DevOps — Budgets, observabilidad y entrega incremental

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | DevOps Engineer |
| Prerrequisito | Contratos backend y seguridad |
| Dependencias | backend |
| Secciones cubiertas | §5 SLA operacional y §7 SLO/pipeline |
| Output esperado | Gates CI, métricas, dashboards y rollout/reversión |

> Ver `...-backend.md` §5 para los componentes técnicos y `...-seguridad.md` §11 para redacción y escape hatches.

## 5. SLA operacional y monitoreo

Métricas mínimas por escenario:

- Tiempo hasta primera acción.
- Duración de clasificación y plan gate.
- Duración de spawn por agente.
- Tokens/palabras de entrada por contexto global, agente y skills.
- Cantidad de hooks/procesos por tool call.
- Compactaciones y relecturas.
- Cantidad de agentes y skills activadas.
- Bypasses y fallos de autorización.

Las métricas se comparan por ruta (`TRIVIAL/LIGHT/MEDIUM/FULL`) y por dominio.

## 7. SLOs operacionales, pipeline y alertas

| ID | SLO/Gate |
|---|---|
| DEVOPS-001 | CI falla si `context-budget` excede un límite sin excepción vigente. |
| DEVOPS-002 | CI ejecuta evals de routing, aprobación, carga de references y guards críticos. |
| DEVOPS-003 | Cada release incluye baseline y comparación posterior reproducible. |
| DEVOPS-004 | Una regresión >10% en payload o latencia del escenario baseline requiere revisión. |
| DEVOPS-005 | Los slices se liberan con feature flag/config y plan de reversión. |
| DEVOPS-006 | Escape hatch activo en release genera bloqueo salvo aprobación break-glass. |

### Estrategia de rollout

1. Introducir medición sin cambiar comportamiento.
2. Activar budgets inicialmente en warning y promoverlos a error tras calibración.
3. Entregar routing TRIVIAL detrás de configuración conservadora.
4. Migrar agentes uno por uno a carga on-demand.
5. Consolidar rules y hooks solo con evals verdes.
6. Retirar compatibilidad de texto plano después de ventana de migración.

### Criterios de completitud del área

- [x] Métricas y SLOs definidos.
- [x] Gate CI y rollout incremental especificados.
- [x] Reversión y compatibilidad contempladas.
