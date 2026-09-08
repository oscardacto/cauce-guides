# ADR-{NNN}: {Verbo de Acción} {Objeto} usando {Tecnología/Patrón}

> Estándar Sofka DA_ADE34 — Drivers de Arquitectura.
> Reemplazá los placeholders `{...}` con el contenido real de la decisión.
> Eliminá esta línea de instrucciones antes de publicar.

| Ítem | Contenido |
|---|---|
| **Id** | ADR-{NNN} |
| **Título** | {Verbo de Acción} {Objeto} usando {Tecnología/Patrón} |
| **Estado** | {Propuesta \| Aceptada \| Sustituida por ADR-XXX \| Desaprobada \| Rechazada} |
| **Fecha** | {YYYY-MM-DD} |

## Contexto y Problema

{Describí el entorno específico de la decisión. Incluí:
- El estado **AS-IS** de la arquitectura.
- Los **Drivers de Arquitectura (QAs)** afectados — nombrar el QA específico y su nivel objetivo (ej. "Disponibilidad 99.99%", "Escalabilidad 5x", "Latencia P95 ≤ 80ms").
- Las **Restricciones Técnicas** o de negocio aplicables.
- El **Architecture Concern** (conflicto entre drivers) que esta decisión intenta resolver.}

## Factores Impulsores

- **Prioridad Máxima:** {QAs que se maximizan, ej. "Disponibilidad y Rendimiento"}
- **Restricción:** {Restricciones que se respetan, ej. "No modificar el Core System ni aumentar licencias"}
- {Otros criterios de prioridad explícitos}

## Opciones Consideradas

- **{Opción 1}:** {tecnología/patrón/costo + por qué fue descartada}
- **{Opción 2 — Elegida}:** {tecnología/patrón/costo}
- **{Opción 3}:** {tecnología/patrón/costo + por qué fue descartada}
- **No hacer nada:** {sólo si aplica — explicar por qué no es viable}

## Resultado de la Decisión

Se {implementará | adoptará | estandarizará} **{patrón o tecnología exacta}**
porque {justificación ligada a los Factores Impulsores y la arquitectura
TO-BE}. {Referenciar explícitamente el QA principal y la Restricción que se
satisface — ej. "garantiza la Disponibilidad (99.99%) y respeta la
Restricción de no modificar el Core System Legacy"}.

## Consecuencias

- **Bueno:** {ganancia objetiva — QAs cumplidos, riesgos mitigados, capacidades habilitadas}
- **Bueno:** {…}
- **Malo:** {compromiso objetivo — mayor OpEx, dependencia crítica, complejidad operativa, deuda arquitectónica que se acepta}
- **Malo:** {…}
- **Neutral (si aplica):** {impacto sin ganancia ni costo claro}

## Más Información

- {Referencia a estándar de la industria, catálogo de patrones, paper, RFC, etc.}
- {Documento Sofka relacionado — ej. matriz de dependencias, sizing, evaluación de proveedores}
- {ADR de seguimiento pendiente — ej. "Se requerirá un ADR de seguimiento para definir TTL del cache y mecanismo de invalidación"}
- {Trazabilidad — ej. "Resuelve Architecture Concern AC-007", "Implementa Driver de Negocio DN-012"}
