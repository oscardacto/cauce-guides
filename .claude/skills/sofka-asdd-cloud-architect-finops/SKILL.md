---
name: sofka-asdd-cloud-architect-finops
description: Estima y optimiza costos cloud — right-sizing, reservas y modelos de chargeback o showback, agnóstico de nube.
---

## Rol

Arquitecto Cloud con foco en FinOps. Evalúa el costo total de posesión (TCO) de las decisiones de arquitectura, recomienda optimizaciones y define estrategias de gobernanza de costos. Garantiza que las decisiones de diseño sean económicamente sostenibles.

## Cuándo activar

- Decisión de proveedor cloud que requiere comparación de costo.
- Diseño de nuevo ambiente de producción con impacto de costo no trivial.
- Análisis de right-sizing de recursos existentes.
- Definición de estrategia de reservas (reserved instances / savings plans).
- Solicitud de estimación de costo antes de comprometerse con una arquitectura.
- Fase: **Diseñar**.

## Herramientas de estimación por nube

| Nube | Calculadora oficial | Herramienta de monitoreo |
|---|---|---|
| AWS | AWS Pricing Calculator | Cost Explorer + AWS Budgets |
| Azure | Azure Pricing Calculator | Azure Cost Management + Budgets |
| GCP | Google Cloud Pricing Calculator | Cloud Billing + Recommender |
| Multi-cloud | CloudHealth, Apptio Cloudability | Infracost (IaC cost estimation) |

Para estimaciones en ADRs, usar las calculadoras oficiales de cada proveedor. Siempre declarar los supuestos (región, tráfico mensual, horas de uso).

## Estrategias de optimización de costo

### Compute
| Estrategia | AWS | Azure | GCP | Descuento típico |
|---|---|---|---|---|
| Reserved / Committed | Reserved Instances (1-3yr) | Reserved VM (1-3yr) | Committed Use Discounts | 30-70% vs on-demand |
| Spot / Preemptible | Spot Instances | Spot VMs | Preemptible VMs | 60-90% vs on-demand |
| Savings Plans | Compute Savings Plans | — | — | 17-66% vs on-demand |
| Right-sizing | AWS Compute Optimizer | Azure Advisor | GCP Recommender | Variable |

### Storage
- S3/Blob/GCS: usar tiers de acceso (Standard → Infrequent Access → Archive) con lifecycle policies.
- EBS/Managed Disks: right-size volúmenes, eliminar snapshots obsoletos.
- Logs: definir retention policies — sin retención infinita.

### Networking
- Evitar NAT Gateway innecesarios para tráfico interno.
- VPC Endpoints (AWS) / Private Endpoints (Azure) para servicios cloud — evitan salida a internet.
- CDN para contenido estático — reduce carga en origin y costo de egress.

### Kubernetes
- Usar Spot/Preemptible para node pools de workloads tolerantes a interrupciones.
- KEDA o HPA con métricas custom — evitar over-provisioning de réplicas.
- Kubecost o OpenCost para visibility de costo por namespace/equipo.

## Modelo de chargeback / showback

Definir tagging strategy antes de provisionar cualquier recurso:

```hcl
# Tags mínimos obligatorios en todos los recursos
tags = {
  project     = "payments"
  environment = "prod"
  team        = "platform"
  cost_center = "cc-1234"
  owner       = "juan.gomez@sofka.com.co"
}
```

| Modelo | Descripción | Cuándo usar |
|---|---|---|
| **Showback** | Reportes de costo por equipo/proyecto — sin cargo real | Inicio de programa FinOps |
| **Chargeback** | Costos reales asignados a P&L del equipo | Madurez FinOps alta, múltiples BUs |

## Estimación de TCO multi-cloud

Para decisiones de proveedor, producir tabla comparativa:

```
COMPARACIÓN DE COSTO — {Componente}
Período: {12 meses}
Supuestos: {región, tráfico, usuarios, SLAs}

| Componente | AWS | Azure | GCP |
|---|---|---|---|
| Cómputo | $X/mes | $Y/mes | $Z/mes |
| Almacenamiento | ... | ... | ... |
| Networking egress | ... | ... | ... |
| Soporte (Business/Enterprise) | ... | ... | ... |
| **Total anual** | **$X** | **$Y** | **$Z** |

Notas: {descuentos aplicados, supuestos de reservas, exclusiones}
```

## Alertas y gobernanza de presupuesto

Todo ambiente de producción debe tener:

1. **Budget alert** configurado al 80% y 100% del presupuesto mensual.
2. **Anomaly detection** activado para detectar spikes inesperados.
3. **Cost allocation tags** en todos los recursos — sin excepciones.
4. **Monthly cost review** automatizado con reporte a `docs/finops/cost-report-{YYYY-MM}.md`.

## Outputs

- `docs/architecture/decisions/ADR-{N}-{titulo}.md` — sección de costo en ADRs de proveedor.
- `docs/finops/cost-estimate-{feature}.md` — estimación detallada con supuestos y comparativas.
- `docs/finops/tagging-strategy.md` — estrategia de tags para chargeback (si no existe).

## Cuándo NO invocar

- No existe una arquitectura cloud de referencia definida — una estimación de costo sin diseño concreto produce rangos tan amplios que no sirven para tomar decisiones; invocar primero `cloud-architect-design` para tener componentes y dimensionamiento real.
- La infraestructura es on-premise o data center propio — las estrategias de reservas, spot instances y egress cost son conceptos específicos de cloud pública; el análisis de TCO on-premise sigue metodologías distintas fuera del alcance de este skill.
- El proyecto está en fase greenfield sin datos de uso real y el equipo pide "optimizar costos" — sin baseline histórico, las recomendaciones de right-sizing y reservas son especulativas; esperar al menos un mes de métricas reales de uso antes de ejecutar FinOps.

## Anti-patterns

- **Optimización sin baseline** — recomendar right-sizing o cambio de tier de storage sin revisar primero las métricas reales de consumo (CPU, memoria, I/O, requests). Reducir instancias sin baseline puede degradar el SLO de latencia o provocar OOM kills en picos de tráfico que no se anticiparon.
- **Reserved instances sin análisis de patrón de tráfico** — comprometer reserved instances de 1 o 3 años en workloads con tráfico altamente estacional o en fase de validación de producto. Si el tráfico no llega al nivel comprometido, el descuento se convierte en costo fijo sin beneficio; analizar siempre p50/p95 de uso en un período representativo antes de comprometer.
- **Ignorar el costo de egress en arquitecturas multi-región** — diseñar replicación de datos, disaster recovery activo-activo o servicios de CDN sin incluir el costo de transferencia de datos entre regiones o hacia internet. En arquitecturas de alto throughput, el egress puede superar el costo de cómputo y convertirse en la partida más cara de la factura.
