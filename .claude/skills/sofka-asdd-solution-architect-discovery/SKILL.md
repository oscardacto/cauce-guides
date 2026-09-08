---
name: sofka-asdd-solution-architect-discovery
description: Captura el contexto técnico del cliente — stack, restricciones, stakeholders, equipo y deuda, en ficha reusable.
---

## Propósito

Capturar el contexto técnico del cliente para que el resto de los skills de
Arquitectura tomen decisiones informadas. Sin discovery, el agente decide en
el vacío y produce arquitectura genérica.

El output (ficha de contexto + stakeholders + restricciones) se referencia
desde ADRs, tradeoff analyses, quality scenarios y reviews.

## Cuándo invocar

- Inicio de un engagement nuevo con un cliente.
- Onboarding técnico de un proyecto heredado de otro equipo.
- Otro skill (tradeoff, patterns, review) reporta `context_gaps`.
- Cambio mayor de stakeholders (nuevo VP, nuevo CTO, nuevo PO).
- Auditoría posterior a 6-12 meses para refrescar la ficha.

## Cuándo NO invocar

- El brief inicial ya trae stack + restricciones + stakeholders explicitados.
- Decisión puntual sin necesidad de re-mapear el contexto.
- Pre-venta donde aún no hay acceso al cliente — anotar como gap.

## Metodología en 4 fases

### Fase 1 — Inventario stack + equipo + madurez

Cargar `reference/interview-script.md` para usar el guion estructurado.

Capturar:
- Stack actual (lenguajes, frameworks, BD, cloud, CI/CD).
- Tamaño y composición del equipo (front, back, ops, QA, data).
- Madurez de prácticas (testing, observability, IaC, deployment frequency).
- Deuda técnica conocida (legacy, migraciones a medias).
- Stack target / restricciones de stack ("solo .NET", "sin Java").

### Fase 2 — Restricciones duras y blandas

Identificar y documentar restricciones por categoría:

- **Regulatorias (duras):** PCI-DSS (tarjetas), HIPAA (salud EE.UU.), GDPR / Habeas Data local, SOX (empresas listadas NYSE/NASDAQ), ISO/IEC 27001, **reguladores LATAM** (Superintendencia Financiera Colombia, Sernac Chile, etc.).
- **Contractuales (duras):** SLAs con clientes finales (uptime, latencia, RPO/RTO), exclusividad de proveedor, penalizaciones, auditorías obligadas.
- **Técnicas (semi-duras):** stack obligatorio o vetado, cloud único, on-prem forzoso, sistemas legacy intocables, versiones mínimas/máximas, compatibilidad backwards.
- **Organizacionales:** tamaño y madurez del equipo, velocidad de aprendizaje, política de outsourcing, jornadas/on-call.
- **Presupuesto (blandas):** cloud spend mensual, costo de licencias, capex vs opex, TCO vs costo inicial.
- **Tiempo (blandas):** deadline regulatorio, deadline de mercado, ventana de migración, hitos contractuales.
- **Alcance (auto-impuestas):** "MVP en 8 semanas sin features X/Y/Z", "sólo módulo de checkout".

**Formato Sofka para documentar cada restricción** (6 campos obligatorios):

- **Tipo:** Regulatoria | Contractual | Técnica | Organizacional | Presupuesto | Tiempo | Alcance
- **Dureza:** Dura (no negociable) | Semi-dura (negociable con costo) | Blanda (preferencia)
- **Origen:** quién la impone (regulador, cliente, CTO)
- **Impacto en arquitectura:** qué decisiones bloquea o fuerza
- **Costo de levantarla:** USD, tiempo, riesgo si se ignora
- **Vigencia:** fecha hasta la cual aplica, o "permanente"

**Anti-patrones Sofka — restricciones:**

1. **Restricciones implícitas** que el cliente da por obvias y el arquitecto no captura → re-trabajo.
2. **Mezclar dureza** — tratar deadlines blandos como duros bloquea exploraciones legítimas.
3. **Restricciones impuestas por el arquitecto** sin explicitarlo → confusión cuando el equipo cuestiona.
4. **No revisar restricciones** a 6 meses — algunas expiran o cambian.

**Compliance — coordinación con cliente:** cuando se detecta regulación financiera (SOX, ICFR, regulador LATAM), trabajar con el equipo de Internal Audit del cliente desde el discovery; pedir el último report SOX 404 si existe (muestra qué controles ya están implementados); identificar al CISO y al Controller (CFO area) como stakeholders clave.

### Fase 3 — Stakeholders

Producir:
- Lista de stakeholders con rol y poder de decisión.
- Power/Interest matrix (`templates/stakeholder-power-interest.md`).
- RACI para decisiones arquitectónicas (`templates/raci.md` — ya viene con RACI Sofka pre-rellenada para 8 decisiones arquitectónicas).

**Heurísticas operativas Sofka — stakeholders:**

1. **Identificar al "veto silencioso"** — quien no aparece en reuniones pero puede bloquear (Compliance, Security corporativa, Finance).
2. **Mapear a quién depende cada stakeholder** — el CTO depende del CFO si el ticket es grande.
3. **Detectar facciones** — equipos con visiones técnicas opuestas (microservicios vs monolito, AWS vs on-prem).
4. **Stakeholder sponsor** — siempre identificar UNO que pelee por el engagement internamente.

### Fase 4 — Output: Context Card

Consolidar todo lo anterior en `templates/context-card.md` y guardar en el
proyecto del cliente.

## Output

- `docs/architecture/context/{cliente}-context-card.md` (ficha principal)
- `docs/architecture/context/{cliente}-stakeholders.md`
- `docs/architecture/context/{cliente}-constraints.md`

## Cuándo cargar cada reference

| Situación | Cargar |
|---|---|
| Guion de entrevista al cliente | `reference/interview-script.md` |
| Plantilla ficha de contexto | `templates/context-card.md` |
| Plantilla RACI (Sofka pre-rellenada) | `templates/raci.md` |
| Plantilla power/interest | `templates/stakeholder-power-interest.md` |
| Ejemplos rellenos | `examples/context-card-banca.md`, `examples/context-card-clinical.md` |
