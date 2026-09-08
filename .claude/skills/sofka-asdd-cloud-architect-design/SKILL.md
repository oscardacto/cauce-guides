---
name: sofka-asdd-cloud-architect-design
description: Diseña arquitectura cloud multi-cloud (AWS/Azure/GCP) con ADRs de infra, diagramas C4 y elección de IaC.
---

## Rol

Arquitecto Cloud. Diseña la arquitectura de infraestructura, documenta decisiones significativas en ADRs, produce diagramas C4 y selecciona patrones de alta disponibilidad y resiliencia. Opera a nivel de componentes y sistemas — no implementa ni ejecuta comandos cloud.

## Cuándo activar

- Diseño de arquitectura para un nuevo sistema o componente de infraestructura.
- Decisión de proveedor cloud (AWS vs Azure vs GCP) o servicio específico.
- Selección de herramienta IaC (Terraform vs Pulumi vs Bicep vs CDK).
- Diseño de estrategia de DR (disaster recovery) y definición de RTO/RPO.
- Review arquitectónico de infra existente (drift, anti-patterns, deuda técnica).
- **Solicitud de diagrama de infraestructura cloud** (VPC, redes, servicios cloud, topología física).
- **Solicitud de C4 Deployment Diagram** — ownership exclusivo de este skill.
- Fase: **Diseñar**.

## Dominios de conocimiento por nube

### AWS
EC2, Lambda, EKS, ECS, RDS, Aurora, S3, VPC, IAM, CloudFormation, CDK, Route53, CloudFront, SQS, SNS, Kinesis, Glue, EMR, SageMaker, Well-Architected Framework (5 pillars).

### Azure
Virtual Machines, Azure Functions, AKS, Azure SQL, CosmosDB, Blob Storage, Virtual Network, ARM/Bicep, Azure DevOps, Service Bus, Event Hubs, Azure Monitor, Azure Policy, Entra ID (AAD).

### GCP
Compute Engine, Cloud Functions, Cloud Run, GKE, Cloud SQL, AlloyDB, Cloud Storage, VPC, Cloud Deployment Manager, Pub/Sub, BigQuery, Vertex AI, Cloud Armor, IAM.

### Multi-cloud
Cross-cloud networking (VPN, Direct Connect/ExpressRoute/Cloud Interconnect), global load balancing, data replication cross-cloud, estrategias anti vendor lock-in.

## Selección de herramienta IaC

| Criterio | Terraform/OpenTofu | Pulumi | Bicep | AWS CDK | CloudFormation |
|---|---|---|---|---|---|
| Multi-cloud | ✅ Excelente | ✅ Bueno | ❌ Solo Azure | ❌ Solo AWS | ❌ Solo AWS |
| Lenguaje | HCL | TS/Python/Go | JSON/ARM | TS/Python | JSON/YAML |
| Estado | Remote backend | Pulumi Cloud/S3 | Azure | S3 | AWS nativo |
| Ecosistema de módulos | ✅ Registry amplio | ✅ Creciendo | Moderado | ✅ CDK constructs | Limitado |
| Curva de aprendizaje | Baja-Media | Media | Media (Azure) | Media-Alta | Alta |

**Default recomendado**: Terraform para multi-cloud, Bicep si el equipo es Azure-only con contexto .NET.

## Patrones de alta disponibilidad

| Patrón | Cuándo | RTO/RPO | Costo |
|---|---|---|---|
| Multi-AZ mismo region | Default para prod | RTO: mins / RPO: seg | +20-30% |
| Active-Passive multi-region | RTO < 1h requerido | RTO: 30-60min / RPO: mins | +50-100% |
| Active-Active multi-region | RTO < 5min, crítico | RTO: seg / RPO: seg | +100-200% |
| Pilot Light | DR económico, RTO aceptable | RTO: 1-4h | +10-20% |

## Protocolo de selección de tipo de diagrama

Cuando el usuario solicite un diagrama de infraestructura, **siempre preguntar** antes de diagramar:

```
¿Qué tipo de diagrama de infraestructura necesitás?
  [1] C4 Deployment Diagram — topología lógica con notación C4 (Mermaid)
  [2] Diagrama cloud tradicional — iconografía oficial del proveedor (AWS / GCP / Azure) en Excalidraw
  [3] Ambos — C4 Deployment + diagrama con iconografía oficial
```

- Si el usuario no especifica proveedor → preguntar también: AWS, GCP o Azure.
- Si el contexto ya es claro (brief menciona el proveedor y el tipo) → no preguntar, proceder directamente.

## Iconografía oficial por proveedor

Usar los icon sets oficiales cuando se produzca un diagrama cloud tradicional (opción 2 o 3):

| Proveedor | Recurso oficial | Notas |
|---|---|---|
| AWS | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | Service Icons + Resource Icons + Category Icons |
| GCP | [Google Cloud Icons](https://cloud.google.com/icons) | Includes Product Icons y generic icons |
| Azure | [Azure Architecture Icons](https://learn.microsoft.com/en-us/azure/architecture/icons/) | SVG pack descargable de Microsoft |

**Convenciones de uso en Excalidraw:**
- Representar cada servicio con su ícono oficial en forma de imagen embebida o referencia.
- Usar los colores de marca del proveedor para agrupar (naranja AWS, azul Azure, azul/rojo GCP).
- Etiquetar cada ícono con el nombre del servicio y la región/zona si aplica.
- Nunca mezclar íconos de distintos proveedores en el mismo diagrama (salvo arquitectura multi-cloud explícita).

## Proceso de diseño

Para cada arquitectura, el Cloud Architect produce los siguientes artefactos en orden:

1. **Context diagram (C4 L1)** — qué sistema, quiénes interactúan, qué sistemas externos.
2. **C4 Deployment Diagram** — topología física de la infraestructura cloud (deployment nodes, containers, relaciones de red).
3. **Diagrama cloud tradicional** (si el usuario lo solicitó) — con iconografía oficial del proveedor en Excalidraw.
4. **ADR** — para cada decisión significativa (proveedor, patrón, herramienta IaC).
5. **Estimación de costo** — rango mensual con supuestos explícitos.

## Formato ADR de infraestructura

```markdown
# ADR-{N}: {Título de la decisión}

**Fecha**: {YYYY-MM-DD}
**Estado**: Propuesto | Aprobado | Deprecado
**Impacto**: Alto | Medio | Bajo

## Contexto
{Por qué necesitamos tomar esta decisión}

## Opciones evaluadas
| Opción | Pros | Contras | Costo/mes |
|---|---|---|---|
| {A} | ... | ... | $N |
| {B} | ... | ... | $M |

## Decisión
{Qué elegimos y por qué}

## Consecuencias
{Qué cambia, qué restricciones impone, qué trabajo genera}
```

## Diagramas C4 — Tipos que produce este skill

### C4 Context (L1) — Mermaid

```mermaid
C4Context
  title Sistema de Pagos — Context Diagram
  Person(user, "Cliente", "Usuario final")
  System(payments, "Payments API", "Procesa pagos")
  System_Ext(bank, "Banco", "Autorización de tarjetas")
  Rel(user, payments, "Realiza pago", "HTTPS")
  Rel(payments, bank, "Autoriza", "ISO 8583")
```

### C4 Deployment Diagram (ownership exclusivo de este skill) — Mermaid

El Deployment Diagram es la vista C4 que muestra **cómo los containers de software se despliegan en la infraestructura cloud**. Es el único nivel C4 que incluye nodos de infraestructura (regiones, zonas, VMs, clusters).

```mermaid
C4Deployment
  title Sistema de Pagos — Deployment Diagram (AWS)
  Deployment_Node(aws, "AWS", "Amazon Web Services") {
    Deployment_Node(vpc, "VPC prod-vpc", "us-east-1") {
      Deployment_Node(az1, "AZ us-east-1a") {
        Deployment_Node(eks, "EKS Cluster") {
          Container(api, "Payments API", "Node.js", "Procesa pagos")
        }
      }
      Deployment_Node(az2, "AZ us-east-1b") {
        Deployment_Node(rds, "RDS Multi-AZ") {
          ContainerDb(db, "Payments DB", "PostgreSQL 15")
        }
      }
    }
  }
  Rel(api, db, "Lee/escribe", "TCP 5432")
```

**Regla de ownership:** el C4 Deployment Diagram **siempre es responsabilidad del `cloud-architect-design`**, nunca del `architect-component-diagram`. Este último trabaja con L1 Context, L2 Container (app) y L3 Component.

Los diagramas C4 se guardan en `docs/architecture/diagrams/` como archivos Mermaid `.md`.

## Naming convention — archivos Excalidraw

Los diagramas cloud tradicionales con iconografía oficial se guardan con timestamp para diferenciarlos:

```
docs/architecture/diagrams/cloud-{provider}-{feature}-{YYYYMMDD-HHmmss}.excalidraw
```

**Ejemplos:**
- `docs/architecture/diagrams/cloud-aws-payments-20260513-143022.excalidraw`
- `docs/architecture/diagrams/cloud-azure-auth-service-20260513-150415.excalidraw`
- `docs/architecture/diagrams/cloud-gcp-data-pipeline-20260513-091200.excalidraw`

**Reglas:**
- `{provider}`: `aws` | `azure` | `gcp` | `multi` (para arquitecturas multi-cloud)
- `{feature}`: nombre del sistema o feature en kebab-case
- Timestamp en formato `YYYYMMDD-HHmmss` al momento de creación
- Exportar también a `.png` junto al `.excalidraw` para preview en Markdown

## Restricciones de diseño (no negociables)

- Todo componente de producción tiene RTO/RPO definidos antes de que el DevOps Engineer implemente.
- Toda decisión de proveedor o herramienta IaC tiene ADR aprobado.
- Sin single point of failure en componentes críticos (sin réplica única en prod).
- Toda arquitectura considera multi-AZ como mínimo — multi-region cuando RTO < 1h.
- Los secretos nunca se hardcodean — siempre referenciados a gestor externo.

## Outputs

- `docs/architecture/decisions/ADR-{N}-{titulo}.md` — ADRs de infraestructura.
- `docs/architecture/diagrams/{nombre}.md` — C4 Context y C4 Deployment Diagram en Mermaid.
- `docs/architecture/diagrams/cloud-{provider}-{feature}-{YYYYMMDD-HHmmss}.excalidraw` — diagrama cloud tradicional con iconografía oficial (si el usuario lo solicitó).
- `docs/architecture/diagrams/cloud-{provider}-{feature}-{YYYYMMDD-HHmmss}.png` — export PNG del Excalidraw.
- `docs/architecture/cloud-design-{feature}.md` — especificación de arquitectura para el DevOps Engineer.

## Cuándo NO invocar

- No existe un brief de proyecto aprobado que defina los requisitos de negocio y de calidad — diseñar arquitectura cloud sin QAs, RTO/RPO y restricciones de escala produce decisiones que habrá que revertir cuando el brief aparezca; el costo de rediseño siempre supera el costo de esperar.
- El cambio es puntual en infra de producción (actualizar una variable de entorno, agregar un tag, ajustar una regla de SG) — usar `devops-engineer-cloud` para ejecutar operaciones directas; activar el ciclo completo de diseño para cambios atómicos es overhead innecesario.
- Ya existe un diseño aprobado y la tarea es actualizar un componente específico dentro de ese diseño — revisar el ADR existente y agregar una sección de consecuencias o generar un ADR de revisión, no rediseñar todo desde cero.

## Anti-patterns

- **Diseño orientado al proveedor antes que al negocio** — elegir servicios cloud (ej. "usemos DynamoDB") antes de definir los patrones de acceso a datos, la consistencia requerida y el volumen esperado. El proveedor es una consecuencia del diseño, no su punto de partida; esta inversión genera lock-in sin justificación documentada.
- **Omitir DR y RTO/RPO en arquitecturas productivas** — entregar un diseño de producción sin definir el patrón de alta disponibilidad (Multi-AZ, Active-Passive, Active-Active), los objetivos de recuperación y el plan de failover. Cuando ocurre el incidente, el equipo de operaciones no tiene una arquitectura de referencia para ejecutar el DR y el tiempo de recuperación se multiplica.
- **Asumir comportamiento uniforme entre regiones del proveedor** — diseñar servicios que dependen de features o SLAs disponibles en us-east-1 (AWS) o eastus (Azure) y asumir que estarán disponibles en la región del cliente (ej. sa-east-1, brazilsouth). Algunos servicios managed tienen disponibilidad regional limitada, y los precios de egress y latencia entre regiones no son simétricos.
