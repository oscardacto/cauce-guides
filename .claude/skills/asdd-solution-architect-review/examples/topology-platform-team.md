# Team Topology — Crear Platform Team para plataforma Wallet

**Fecha:** 2026-04-15
**Autor:** Arquitecto + CTO
**Contexto:** Modo 3 (team topology) tras review de fricción entre squads.

## Diagnóstico Conway

### Org actual

- 5 stream-aligned squads (Wallet, Ledger, Onboarding, Notifications, Pagos).
- 1 SRE team de 3 personas, modelo "ticketing": cada squad pide capacidad, entornos, secrets, dashboards.
- 1 Security team de 2 personas, modelo "review post-hoc": entran al final del PR estructural.

### Síntomas

- Lead time for changes: 4-6 días promedio (DORA: Medium-Low).
- 60% de tickets a SRE son repetitivos: nuevos secrets, nuevos dashboards, nuevos namespaces.
- 3 squads reportaron en retro que esperar a SRE bloquea releases.
- Security descubre issues tarde — re-trabajo cuando ya hay PRs aprobados.
- Cada squad reinventa observability, retry policies, circuit breakers.

### Hipótesis Conway

Hay "jobs to be done" comunes (CI/CD, observability, secrets, security baseline)
que el modelo ticketing de SRE no escala. Necesidad de **Platform Team** que
provea X-as-a-Service.

## Recomendación

### 1. Crear Platform Team (5-7 personas)

Composición sugerida:
- 2 platform engineers (k8s, networking, IaC).
- 2 SREs (observability, oncall del platform).
- 1 security engineer (baselines, secrets management).
- 1 developer experience engineer (CLI internal, golden paths, docs).

**Responsabilidades:**
- CI/CD pipelines reutilizables.
- Observability stack como servicio.
- Secrets management vía API.
- Baseline de seguridad enforced (policies, OPA).
- Self-service developer portal (Backstage o similar).

**No responsable de:**
- Lógica de negocio de las squads.
- On-call de los servicios de las squads.
- Ticketing (modelo X-as-a-Service, no ticket-driven).

### 2. Reasignar SRE actual

- 2 SREs migran al Platform Team (focus en observability + golden paths).
- 1 SRE se mantiene como **enabling team** temporal (3-6 meses) ayudando a las squads a adoptar las prácticas del platform.

### 3. Embed Security pattern

Security team adopta modo **enabling**:
- Workshops de threat modeling con squads (1 sesión por squad cada 2 meses).
- Policies-as-code en Platform → enforced automáticamente en PRs.
- Security review solo para cambios estructurales mayores (no en cada PR).

### 4. Modos de interacción

| Pair de equipos | Modo recomendado |
|---|---|
| Stream-aligned ↔ Platform | X-as-a-Service |
| Stream-aligned ↔ Security (enabling) | Facilitating (durante 6 meses) |
| Stream-aligned ↔ Stream-aligned | X-as-a-Service en boundaries estables; Collaboration cuando se descubre boundary nuevo |
| Platform ↔ Security | Collaboration (temporal, hasta consolidar policies) |

## Plan de transición (no big-bang)

### Mes 1
- Comunicación a la organización.
- Selección de líder del Platform Team.
- Hiring / movilización interna (si aplica).
- Discovery: ¿qué dolor concreto resuelve cada squad? Top 3 priorizar.

### Meses 2-3
- Platform Team build de los top 3 servicios self-service:
  - Pipeline reutilizable (golden path).
  - Observability dashboard auto-generado.
  - Secrets self-service.
- 1 squad piloto adopta los nuevos servicios.

### Meses 4-6
- Otras 2 squads migradas.
- SRE 1 (enabling) trabaja en transferir conocimiento.
- Métricas: lead time, deploy frequency, % tickets reducidos.

### Meses 7-12
- Las 5 squads usan platform.
- Enabling SRE termina su misión.
- Security en modo X-as-a-Service vía policies-as-code.
- Retrospectiva del cambio.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Platform Team se vuelve "ops with new name" | Contratar líder con experiencia en plataformas internas; definir KPIs explícitos (lead time, NPS de devs). |
| R2 | Squads siguen pidiendo tickets en vez de usar self-service | Comunicación + bloqueo gradual de tickets para servicios self-service disponibles. |
| R3 | Costo de invertir en plataforma sin ROI inmediato | Roadmap con quick wins en mes 2-3 para mostrar valor. |
| R4 | Re-implementación accidental de tooling existente | Inventario de lo que cada squad ya construyó; reusar antes de reescribir. |

## KPIs de éxito (12 meses)

- **Lead time for changes:** 4-6 días → ≤ 2 días.
- **Deploy frequency:** semanal → diaria por squad.
- **% tickets repetitivos a SRE:** 60% → ≤ 15%.
- **NPS interno de devs sobre platform:** ≥ 60.
- **Cobertura de policies-as-code en PRs:** ≥ 80%.

## Approvers

- [x] CTO
- [x] Arquitecto
- [ ] Lead SRE (consulta)
- [ ] Lead Security (consulta)
