# Pulumi — Template base (TypeScript / AWS)

Alternativa a Terraform. Pulumi usa lenguajes generales (TypeScript, Python,
Go, C#) en lugar de HCL. Ideal si el equipo ya domina uno de esos lenguajes.

## `index.ts`

```typescript
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const env = pulumi.getStack();           // dev | staging | prod
const projectName = pulumi.getProject();

const commonTags = {
  Project: projectName,
  Environment: env,
  ManagedBy: "Pulumi",
};

const vpc = new aws.ec2.Vpc(`${env}-vpc`, {
  cidrBlock: config.require("vpcCidr"),
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { ...commonTags, Name: `${projectName}-${env}-vpc` },
});

export const vpcId = vpc.id;
```

## Config por stack

```bash
# Pulumi.dev.yaml
config:
  aws:region: us-east-1
  myproject:vpcCidr: "10.10.0.0/16"

# Pulumi.prod.yaml
config:
  aws:region: us-east-1
  myproject:vpcCidr: "10.20.0.0/16"
```

## Comandos típicos

```bash
pulumi stack select dev
pulumi preview     # equivalente a terraform plan
pulumi up          # equivalente a terraform apply
pulumi destroy     # solo en no-prod
```

## Diferencias con Terraform

| Aspecto | Terraform | Pulumi |
|---|---|---|
| Lenguaje | HCL (declarativo) | TS/Python/Go/C# (imperativo con modelo declarativo) |
| Loops y lógica | `for_each`, `count` | Nativo del lenguaje |
| Testing | `terratest` externo | Jest/Vitest nativo |
| Comunidad | Mayor | Creciente |
| Backend state | S3/GCS/Azure Blob | Pulumi Cloud o self-hosted |
| Learning curve | Empinada al principio | Usa el lenguaje que el equipo ya conoce |

## Cuándo elegir Pulumi sobre Terraform

- Equipo con fuerte experiencia TS/Python y poca con HCL.
- Lógica compleja de infra que Terraform no expresa bien (loops anidados,
  cálculos dinámicos).
- Queremos tests unitarios de la infra con el mismo framework del código.

## Cuándo elegir Terraform sobre Pulumi

- Proyectos existentes con módulos Terraform de la comunidad.
- Equipo ya operando con Terraform (no migrar por migrar).
- Compliance que exige `terraform plan` textual en PRs.
