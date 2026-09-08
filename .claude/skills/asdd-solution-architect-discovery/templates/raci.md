# RACI — Decisiones arquitectónicas

**Cliente / Producto:** {…}
**Fecha:** {YYYY-MM-DD}

## Matriz

| Decisión / Actividad | R | A | C | I |
|---|---|---|---|---|
| ADR de stack tecnológico | {Arquitecto} | {Lead Architect} | Tech Lead, Security, DBA | CTO, PO |
| ADR de pattern (CQRS, sagas) | {Arquitecto} | {Lead Architect} | Tech Lead | CTO |
| Cambio de cloud provider | {Lead Architect} | CTO | Arquitecto, Security, Finance | Equipo |
| Diseño detallado de feature | {Tech Lead} | Arquitecto | Devs | PO |
| Definición de NFRs / quality gates | {Arquitecto} | {Lead Architect} | Tech Lead, QA, PO | CTO |
| Aprobación de PR estructural | {Arquitecto} | {Lead Architect} | Tech Lead | Equipo |
| Cambio de schema en BD productiva | {DBA} | Tech Lead | Arquitecto, Security | PO |
| Aceptación de excepción a NFR | PO | CTO | Arquitecto, Security | Equipo |

## Leyenda

- **R (Responsible):** quien hace el trabajo.
- **A (Accountable):** un único accountable por fila — quien responde por el resultado.
- **C (Consulted):** se consulta antes de decidir; comunicación bidireccional.
- **I (Informed):** se informa después de la decisión; comunicación unidireccional.

## Reglas operativas

1. **Una sola A por fila** — si hay dos, no hay accountability real.
2. **Ningún C ni I sin razón** — si nadie va a leer el ping, sacarlo de la lista.
3. **Revisar la matriz cada 6 meses** o cuando haya cambio organizacional.
4. **Escalación:** si el A está bloqueado, el escalation path se define explícitamente abajo.

## Escalation path

1. Tech Lead → Arquitecto del equipo
2. Arquitecto → Lead Architect / Architect Council
3. Lead Architect → CTO

Para temas de seguridad / compliance, escalar también a CISO / Compliance Officer.
