# Ficha de Contexto — Plataforma Clínica Vital

**Fecha:** 2026-03-04
**Autor:** Arquitecto Guide + CTO Vital
**Próxima revisión:** 2026-09-04

## 1. Sistema y propósito

- **Nombre:** Vital Clinical Platform (web + portal pacientes + integraciones HIS)
- **Propósito:** Historia clínica electrónica (EHR) para clínicas medianas en EE. UU. Foco en pediatría y medicina familiar.
- **Fase:** Producción, expandiendo a 80 clínicas (de 35 actuales).
- **Métrica principal:** clínicas activas + tiempo promedio de carga del EHR (target P95 ≤ 1.5s).
- **Impacto caída 1h:** ~USD 25k + alto impacto reputacional (médicos sin acceso a historia clínica).

## 2. Stack actual

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Backend | .NET | 8 | Migrando de .NET 6 |
| Frontend | React | 18 | TypeScript |
| Mobile | — | — | Solo web responsive |
| BD principal | SQL Server | 2022 | Azure SQL managed |
| BD imagenología | Blob Storage | — | DICOM directos |
| Cache | Azure Redis | 6 | — |
| Mensajería | Service Bus | — | Topics + cola DLQ |
| Cloud | Azure | — | East US 2 + West US 3 DR |
| CI/CD | Azure DevOps + ArgoCD | — | 4-5 deploys/sem |
| Observability | Application Insights | — | OK |

## 3. Arquitectura

- **Estilo:** Microservicios moderados (12 servicios) + frontend SPA + BFF.
- **Diagrama vigente:** Structurizr workspace, actualizado mensualmente.
- **Bounded contexts:** Patient, Encounter, Prescription, Imaging, Billing, Identity, Notification, Audit. Pending: Telemedicine.

## 4. Equipo

| Rol | Cantidad | Mix |
|---|---|---|
| Backend devs | 9 | 4 Sr / 5 Mid |
| Frontend devs | 5 | 2 Sr / 3 Mid |
| QA | 3 | 1 Sr / 2 Mid |
| SRE | 2 | 1 Sr / 1 Mid |
| DBA | 0 | Outsourced consult |
| Security | 1 | Sr (HIPAA compliance officer) |
| Architect | 1 | CTO actúa como arquitecto |

- **Organización:** 3 squads (clinical, billing, platform).
- **On-call:** 4 personas en rotación semanal.
- **Incidentes 3m:** 5 (1 sev1, 4 sev2). Sev1 fue caída de Service Bus — RCA en ese cluster.

## 5. Restricciones

| # | Restricción | Tipo | Dureza | Origen | Vigencia |
|---|---|---|---|---|---|
| 1 | HIPAA — toda PHI cifrada at-rest e in-transit, BAA con cada provider | Regulatoria | Dura | HHS | permanente |
| 2 | HL7 FHIR R4 obligatorio para integraciones con HIS externos | Contractual | Dura | clientes hospitalarios | permanente |
| 3 | RTO ≤ 2h, RPO ≤ 15 min | Contractual | Dura | SLA con clínicas | permanente |
| 4 | Solo Azure (acuerdo corporativo) | Técnica | Dura | grupo dueño | hasta 2028 |
| 5 | Cloud spend ≤ USD 18k/mes | Presupuesto | Blanda | CFO | mensual |
| 6 | Apps deben pasar SOC 2 Type II audit | Regulatoria | Dura | clientes enterprise | anual |

Compliance: HIPAA, SOC 2 Type II, HL7 FHIR R4.

## 6. Stakeholders

Sponsor: CTO. Aprobador ADRs P1: CTO + HIPAA Officer. Veto silencioso: clientes hospitalarios grandes (vía SLA).

## 7. Deuda técnica

- 2 servicios aún en .NET 6 (deadline: junio 2026).
- BD de Imaging crece 1.2 TB/mes — sin política de archivado.
- Logs centralizados pero scrubbing de PHI inconsistente — riesgo HIPAA identificado.
- Tests de integración con FHIR mock pero no contra HIS reales — gaps en regression.

## 8. Migraciones en curso

| Migración | Estado |
|---|---|
| .NET 6 → .NET 8 | 75% |
| Auth custom → Microsoft Entra B2C | 40% |
| Logs locales → Application Insights centralizado | 100% (completado Q4 2025) |

## 9. Gaps del discovery

- Estrategia de archivado para Imaging (DICOM) — sin owner técnico.
- BAA con Datadog (si se evalúa migrar) — sin precedente interno.
- Plan de respuesta a breach HIPAA — runbook existe pero no probado.

## 10. Próximos pasos

- [ ] Validar ficha con HIPAA Officer.
- [ ] Discovery del bounded context Imaging para atacar el crecimiento.
- [ ] Revisar SOC 2 audit pending para identificar nuevos gaps.
