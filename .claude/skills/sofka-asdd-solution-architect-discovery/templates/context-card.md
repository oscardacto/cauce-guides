# Ficha de Contexto — {Cliente / Producto}

**Fecha de elaboración:** {YYYY-MM-DD}
**Autor:** {arquitecto + entrevistados}
**Próxima revisión:** {YYYY-MM-DD, ~6 meses}

## 1. Sistema y propósito

- **Nombre:** {…}
- **Propósito de negocio:** {1-2 frases}
- **Fase:** Idea / MVP / Producción estable / Escalando / Modernizando
- **Métrica de negocio principal:** {revenue, retention, NPS, costo}
- **Impacto de caída de 1h:** {USD, reputación, regulatorio}

## 2. Stack actual

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Backend | {…} | {…} | {…} |
| Frontend | {…} | {…} | {…} |
| Mobile | {…} | {…} | {…} |
| BD principal | {…} | {…} | {…} |
| Cache | {…} | {…} | {…} |
| Mensajería | {…} | {…} | {…} |
| Cloud | {…} | {…} | {regiones} |
| CI/CD | {…} | — | {deploys/sem} |
| Observability | {…} | — | {logs, métricas, trazas} |

## 3. Arquitectura

- **Estilo actual:** monolito / microservicios / serverless / EDA / híbrido
- **Diagrama vigente:** {link o "no existe"}
- **Bounded contexts identificados:** {lista o "pending"}

## 4. Equipo

| Rol | Cantidad | Senior/Mid/Junior |
|---|---|---|
| Backend devs | {…} | {…} |
| Frontend devs | {…} | {…} |
| QA | {…} | {…} |
| SRE / Ops | {…} | {…} |
| DBA | {…} | {…} |
| Security | {…} | {…} |
| Architect | {…} | {…} |

- **Organización:** squads / capa / monolítica
- **On-call rotation:** sí / no — {detalle}
- **Frecuencia de incidentes 3m:** {número}

## 5. Restricciones

| # | Restricción | Tipo | Dureza | Origen | Vigencia |
|---|---|---|---|---|---|
| 1 | {…} | Regulatoria | Dura | {regulador} | permanente |
| 2 | {…} | Presupuesto | Blanda | CFO | 2026 |

Compliance aplicable: {PCI-DSS, HIPAA, ISO 27001, SOX, GDPR, ninguno}

## 6. Stakeholders

Ver `{cliente}-stakeholders.md` para el detalle. Resumen:

- **Sponsor del engagement:** {nombre, rol}
- **Aprobador final de ADRs:** {nombre, rol}
- **Veto silencioso a vigilar:** {ej. Compliance corporativa}

## 7. Deuda técnica conocida

- {…}
- {…}
- {…}

## 8. Migraciones en curso

| Migración | Estado | % |
|---|---|---|
| {ej. Java 8 → Java 21} | en curso | 40% |

## 9. Gaps detectados durante el discovery

- {pregunta sin respuesta clara y por qué}
- {…}

## 10. Próximos pasos

- [ ] Validar la ficha con {entrevistado}.
- [ ] Profundizar en {tema}.
- [ ] Programar discovery con {stakeholder no entrevistado}.
