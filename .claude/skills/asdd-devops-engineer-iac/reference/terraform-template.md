# Terraform — Template base (AWS)

Template copiable para el directorio `infra/`. Incluye backend S3 con locking,
providers pinneados y un módulo VPC como ejemplo.

## `versions.tf`

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "{project}-terraform-state"
    key            = "{env}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "{project}-terraform-locks"
    encrypt        = true
  }
}
```

## `variables.tf`

```hcl
variable "project" {
  type        = string
  description = "Nombre del proyecto"
}

variable "environment" {
  type        = string
  description = "Ambiente (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Ambiente debe ser dev, staging o prod."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR principal de la VPC"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}
```

## `main.tf` — módulo VPC

```hcl
locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-${var.environment}-vpc"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod"

  tags = local.common_tags
}
```

## `outputs.tf`

```hcl
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnets
}
```

## `environments/prod.tfvars`

```hcl
project            = "my-project"
environment        = "prod"
vpc_cidr           = "10.20.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidrs = ["10.20.1.0/24", "10.20.2.0/24", "10.20.3.0/24"]
public_subnet_cidrs  = ["10.20.101.0/24", "10.20.102.0/24", "10.20.103.0/24"]
```

## Comandos típicos

```bash
terraform init -backend-config="key=prod/terraform.tfstate"
terraform plan -var-file=environments/prod.tfvars -out=tfplan
terraform apply tfplan
```
