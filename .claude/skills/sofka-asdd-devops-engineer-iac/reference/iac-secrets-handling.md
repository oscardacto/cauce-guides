# Secretos en IaC — Patrones

Nunca hardcodear secretos en archivos de infraestructura. Este documento lista
los patrones correctos para inyectar secretos en recursos Terraform/Pulumi.

## Regla base

- Nunca: `password = "hardcoded"` en `.tf` o `.ts`.
- Nunca: secretos en `terraform.tfvars` committeado.
- Siempre: referenciar gestor externo (AWS Secrets Manager, HashiCorp Vault,
  SSM Parameter Store, Azure Key Vault, GCP Secret Manager).

## AWS Secrets Manager (Terraform)

```hcl
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "/${var.environment}/database/password"
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.environment}-db"
  engine     = "postgres"

  username = "app_user"
  password = data.aws_secretsmanager_secret_version.db_password.secret_string

  # ...
}
```

## AWS SSM Parameter Store

```hcl
data "aws_ssm_parameter" "api_key" {
  name            = "/${var.environment}/external-api/key"
  with_decryption = true
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project}-api"
  # ...
  environment {
    variables = {
      API_KEY = data.aws_ssm_parameter.api_key.value
    }
  }
}
```

## HashiCorp Vault

```hcl
provider "vault" {
  address = var.vault_addr
}

data "vault_kv_secret_v2" "db" {
  mount = "secret"
  name  = "${var.environment}/database"
}

resource "aws_db_instance" "main" {
  password = data.vault_kv_secret_v2.db.data["password"]
}
```

## Rotación automática

Para secretos rotables (credenciales DB, API keys):

1. Configurar rotación en el gestor (Secrets Manager tiene Lambda de rotación).
2. La aplicación debe re-leer el secreto periódicamente (no cachearlo 24h).
3. Documentar ventana de rotación en el ADR correspondiente.

## Least privilege en IAM

El rol que ejecuta Terraform/Pulumi:
- **Dev/Staging**: permisos amplios sobre recursos del ambiente.
- **Prod**: permisos mínimos — solo los recursos específicos que toca. Usar
  `aws_iam_policy_document` con `Resource` explícito.

```hcl
data "aws_iam_policy_document" "terraform_exec" {
  statement {
    effect  = "Allow"
    actions = ["rds:DescribeDBInstances", "rds:ModifyDBInstance"]
    resources = [
      "arn:aws:rds:${var.region}:${var.account_id}:db:${var.project}-${var.environment}-*"
    ]
  }
}
```

## Nunca hacer

```hcl
# INCORRECTO — hardcoded
password = "changeme"

# INCORRECTO — secreto en variable plana
variable "db_password" {
  default = "changeme"
}

# INCORRECTO — secreto en tfvars committeado
# terraform.tfvars
db_password = "changeme"
```

## Detección en pipeline

Integrar `gitleaks` o `trufflehog` en el pipeline de IaC para bloquear commits
con secretos accidentales antes del merge.
