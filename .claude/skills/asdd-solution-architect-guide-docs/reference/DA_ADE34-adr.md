# DA_ADE34 — Architecture Decision Record (ADR)
**Solución:** {nombre-solucion} | **Fecha:** {YYYY-MM-DD}

## ADR-{NNN}: {Verbo} {Objeto} usando {Tecnología/Patrón}

| Campo | Valor |
|---|---|
| **ID** | ADR-{NNN} |
| **Título** | {nombre auto-explicativo: "Adoptar X para resolver Y"} |
| **Estado** | Propuesta / Aceptada / Sustituida / Desaprobada |
| **Fecha** | {YYYY-MM-DD} |

### Contexto y Problema
{Describe el entorno de la decisión. Incluir: QAs afectados, restricciones técnicas o Architecture Concern que se intenta resolver. Referenciar DA_ADE35.}

### Factores Impulsores
- **QAs prioritarios:** {ej. Disponibilidad (QA-01), Rendimiento (QA-02)}
- **Restricciones respetadas:** {ej. RT-01 — No modificar Core System}
- **Concern resuelto:** {ej. AC-01 — Seguridad vs Rendimiento}

### Opciones Consideradas
| Opción | Descripción | Pro | Contra |
|---|---|---|---|
| A | {tecnología/patrón A} | {ventaja} | {desventaja} |
| B | {tecnología/patrón B — elegida} | {ventaja} | {desventaja} |
| C | No hacer nada | Costo cero | {impacto de no actuar} |

### Resultado de la Decisión
**Opción elegida: {B}** — {justificación en 1-2 oraciones: por qué es la única viable que cumple los QAs sin violar las restricciones}.

### Consecuencias
- **Positivas:** {QAs que se cumplen, riesgos que se mitigan}
- **Negativas:** {compromisos: mayor OpEx, complejidad, latencia adicional}
- **Neutrales:** {cambios que no son ni buenos ni malos}

### Más Información
- {Estándar o patrón de referencia}
- {Enlace a spike o benchmark si existe en docs/architecture/spikes/}
