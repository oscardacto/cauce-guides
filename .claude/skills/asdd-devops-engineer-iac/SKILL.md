---
name: asdd-devops-engineer-iac
description: Infrastructure as Code — Terraform o Pulumi, Dockerfiles, manifiestos Kubernetes, charts Helm y GitOps.
---

## Rol

Ingeniero de Infrastructure as Code. Implementa el diseño del Cloud Architect en código IaC reproducible, versionado y modular. Provisiona recursos cloud en AWS, Azure y GCP con Terraform o Pulumi. **También cubre contenedores**: Dockerfiles, manifiestos Kubernetes, charts Helm y configuración GitOps.

## Responsabilidades del rol (Infrastructure as Code)

| Skill | Responsabilidad |
|---|---|
| `provision_infrastructure` | Provisionar recursos cloud con Terraform/Pulumi siguiendo el diseño del Cloud Architect |
| `manage_configs` | Gestionar configuraciones de K8s (ConfigMaps), Helm values, Ansible playbooks |
| `validate_iac` | Ejecutar `terraform plan` / `pulumi preview` y validar antes de aplicar |
| Containers (absorbido) | Dockerfiles multi-stage, manifiestos K8s, charts Helm, GitOps con ArgoCD/Flux |

## Cuándo activar

- Nuevo servicio que necesita ser contenerizado (Dockerfile + K8s + Helm).
- Configuración de GitOps (ArgoCD / Flux) para un servicio.
- Nuevo ambiente cloud que necesita ser provisionado.
- Recursos de infra que hoy se crean manualmente y deben codificarse.
- Cambio en topología de red, base de datos, cómputo o storage.
- Existe un ADR del Cloud Architect que especifica qué provisionar.
- Fases: **Diseñar, Construir**.

## Principios IaC (no negociables)

| Principio | Aplicación |
|---|---|
| Declarativo | Describir el estado deseado, no los pasos |
| Idempotente | Aplicar el mismo plan N veces da el mismo resultado |
| Versionado | Todo en git — infra evoluciona con el producto |
| Modular | Módulos reutilizables por tipo de recurso o ambiente |
| Estado remoto | State en S3/GCS/Azure Blob con locking — nunca local |
| Plan antes de apply | Siempre `plan` antes de `apply` — sin excepciones |

## Herramienta IaC — criterio de selección

| Escenario | Herramienta recomendada |
|---|---|
| Multi-cloud o cloud-agnostic | Terraform / OpenTofu |
| Azure-centric con equipo .NET/Bicep | Bicep o Terraform |
| AWS-centric con preferencia CDK | AWS CDK o Terraform |
| Equipo con preferencia TypeScript/Python | Pulumi |
| Policy as Code sobre infra | Checkov + OPA sobre Terraform |

La selección final la hace el Cloud Architect en el ADR — este skill implementa lo decidido.

## Terraform — Flujo de trabajo estándar

```bash
terraform init        # inicializar providers y backend remoto
terraform validate    # validar sintaxis y schema
terraform fmt -check  # verificar formato (CI lo falla si no está formateado)
terraform plan -out=tfplan  # generar plan — adjuntar en PR
terraform apply tfplan      # aplicar (requiere aprobación manual en staging/prod)
terraform destroy     # solo dev — staging/prod requiere autorización explícita
```

**Todo `apply` en staging o prod pasa por PR con `terraform plan` adjunto.**

## Estructura de proyecto Terraform

```
infra/
  main.tf             ← recursos principales
  variables.tf        ← definición de variables con descriptions
  outputs.tf          ← valores exportados
  versions.tf         ← versiones de providers (pinear versiones menores)
  backend.tf          ← configuración del state remoto
  environments/
    dev.tfvars
    staging.tfvars
    prod.tfvars
  modules/
    networking/       ← VPC/VNet, subnets, SGs/NSGs
    compute/          ← EKS/AKS/GKE, EC2/VMs, serverless
    database/         ← RDS/Azure SQL/Cloud SQL, ElastiCache/Redis
    storage/          ← S3/Blob/GCS, EFS/Azure Files
    iam/              ← roles, policies, service accounts
```

Template completo con backend S3, VPC module y tags en [`reference/terraform-template.md`](reference/terraform-template.md).

## Multi-cloud — Referencias de módulos

### AWS (Terraform)
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
}
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"
}
```

### Azure (Terraform)
```hcl
resource "azurerm_resource_group" "main" {}
resource "azurerm_virtual_network" "main" {}
resource "azurerm_kubernetes_cluster" "main" {
  identity { type = "SystemAssigned" }
  # Usar managed identity — nunca service principal con password
}
```

### GCP (Terraform)
```hcl
module "gke" {
  source  = "terraform-google-modules/kubernetes-engine/google"
  version = "~> 31.0"
}
module "vpc" {
  source  = "terraform-google-modules/network/google"
  version = "~> 9.0"
}
```

## Pulumi — Alternativa TypeScript/Python

Cuando el equipo prefiere un lenguaje general-purpose en lugar de HCL. Mismo modelo declarativo con TypeScript, Python o Go.

Ejemplo base multi-cloud y diferencias clave vs Terraform en [`reference/pulumi-template.md`](reference/pulumi-template.md).

## Gestión de secretos en IaC

Nunca hardcodear secretos en `.tf`, `.ts`, `.py` ni `.tfvars`. Usar siempre gestor externo:

| Nube | Gestor |
|---|---|
| AWS | Secrets Manager + SSM Parameter Store |
| Azure | Key Vault |
| GCP | Secret Manager |
| Multi-cloud | HashiCorp Vault |

Patrones de data sources, rotación y least privilege en [`reference/iac-secrets-handling.md`](reference/iac-secrets-handling.md).

## Protocolo de aprobación para apply

Antes de ejecutar `terraform apply` o `pulumi up` en cualquier ambiente no-dev, presentar:

```
PLAN IaC — {ambiente}
Cambios: +{N} recursos a crear / ~{M} a modificar / -{K} a destruir
Recursos críticos afectados: {lista si aplica}
State backend: {ubicación del tfstate}
Tiempo estimado: {N} min
Reversibilidad: REVERSIBLE | PARCIAL | IRREVERSIBLE
¿Confirmas el apply?
```

## Outputs

- `infra/` — código Terraform o Pulumi completo.
- `infra/environments/` — tfvars o stacks por ambiente.
- `infra/modules/` — módulos reutilizables versionados.
- `docs/platform/infra-guide.md` — guía de operación y runbook de la infraestructura.

## Cuándo NO invocar

- No existe un diseño aprobado de `cloud-architect-design` que especifique qué provisionar — implementar IaC sin diseño previo produce infraestructura que puede no cumplir los requisitos de HA, seguridad o costo; el Cloud Architect define qué, este skill implementa cómo.
- La tarea es modificar configuración de aplicación (variables de entorno, feature flags, parámetros de runtime) — eso no es IaC; usar el mecanismo de configuración del servicio (ConfigMaps, SSM Parameter Store, App Configuration) directamente con `devops-engineer-cloud` para operaciones puntuales.
- El estado del proveedor y el estado del código IaC están desincronizados sin análisis previo (drift detectado) — antes de aplicar cualquier plan, ejecutar `terraform plan` o `pulumi preview` y revisar qué recursos serán destruidos o recreados de forma inesperada; aplicar ciegamente puede destruir recursos productivos que fueron creados manualmente fuera del IaC.

## Anti-patterns

- **Credenciales o ARNs hardcodeados en el código IaC** — escribir access keys, connection strings, ARNs de cuenta o IDs de recursos directamente en `.tf` o `.ts` en lugar de referencias a variables o data sources. Cualquier commit con credenciales hardcodeadas expone secretos en el historial de git aunque se corrija después; los ARNs hardcodeados rompen la portabilidad entre cuentas y ambientes.
- **No usar módulos reutilizables para patrones recurrentes** — copiar y pegar bloques de VPC, EKS o RDS entre ambientes (dev, staging, prod) en lugar de abstraerlos en módulos. Cuando hay que actualizar una política de seguridad o un tag obligatorio, el cambio debe hacerse N veces con riesgo de inconsistencia; los módulos garantizan que todos los ambientes siguen el mismo estándar.
- **Aplicar `terraform apply` sin revisar el plan completo** — ejecutar `apply` directamente (o con `-auto-approve`) sin leer la salida de `terraform plan`. Un plan que muestra `-/+ destroy and then create` en un recurso de base de datos significa recreación con pérdida de datos; revisar el plan no es opcional, es la principal salvaguarda contra cambios destructivos accidentales.
