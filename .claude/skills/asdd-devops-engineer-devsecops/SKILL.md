---
name: asdd-devops-engineer-devsecops
description: DevSecOps — SAST, DAST y SCA, compliance de políticas, gestión de secretos y enforcement en pipelines CI/CD.
---

## Rol

Ingeniero DevSecOps. Integra seguridad en el ciclo de entrega: escanea vulnerabilidades en código, dependencias e imágenes; verifica compliance de políticas de seguridad; gestiona secretos de forma segura; y enforza gates de seguridad en los pipelines CI/CD. Opera con el código y la infraestructura existente — no diseña arquitecturas (eso corresponde a `asdd-security` y `asdd-cloud-architect`).

## Diferencia con asdd-security

| `asdd-security` | `asdd-devops-engineer-devsecops` |
|---|---|
| Audita arquitectura, revisa diseño, valida compliance regulatorio (OWASP, PCI, HIPAA) | Ejecuta herramientas de escaneo en el pipeline y gestiona secretos en IaC/K8s |
| Produce ADRs de seguridad, threat models, reportes de compliance | Produce reportes de escaneo, configura gates CI, gestiona ExternalSecrets |
| Fase Diseñar y pre-release sign-off | Fases Construir y Verificar (integrado en el pipeline) |

## Responsabilidades del rol (DevSecOps)

| Skill | Responsabilidad |
|---|---|
| `scan_vulnerabilities` | Escanear imágenes Docker (Trivy/Grype), código IaC (Checkov/Semgrep) y dependencias (OWASP Dependency-Check/Snyk) |
| `check_compliance` | Verificar compliance de políticas cloud (AWS Security Hub, Azure Security Center, GCP SCC) |
| `manage_secrets` | Configurar ExternalSecrets Operator, detectar secretos expuestos (gitleaks/trufflehog) y gestionar rotación |
| `enforce_policies` | Configurar gates de seguridad obligatorios en pipelines y policies OPA/Conftest |

## Cuándo activar

- Escaneo de vulnerabilidades en imágenes Docker antes de push a registry.
- Análisis estático de IaC (Terraform/Helm) en busca de misconfigurations.
- Gestión de secretos: configurar ExternalSecrets, SealedSecrets, Vault integration.
- Detección de secretos expuestos en el repositorio.
- Enforcar security gate en pipeline CI/CD antes de deploy a staging/prod.
- Compliance check cloud antes de release.
- Fases: **Construir, Verificar**.

## Escaneo de vulnerabilidades

### Imágenes Docker (Trivy / Grype)

```bash
# Trivy — escanear imagen local
trivy image --severity HIGH,CRITICAL --exit-code 1 myapp:latest

# Trivy — escanear directorio IaC
trivy config --severity HIGH,CRITICAL infra/

# Grype — alternativa
grype myapp:latest --fail-on high

# Integración en GitLab CI
trivy-scan:
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  allow_failure: false
```

### IaC — Checkov / Semgrep

```bash
# Checkov — escanear Terraform
checkov -d infra/ --framework terraform --compact

# Checkov — escanear Kubernetes manifests
checkov -d k8s/ --framework kubernetes

# Semgrep — reglas de seguridad custom
semgrep --config=p/terraform-security infra/
```

### Compliance cloud

```bash
# AWS Security Hub
aws securityhub get-findings --filters '{"RecordState":[{"Value":"ACTIVE","Comparison":"EQUALS"}]}'

# Azure Security Center
az security assessment list --query "[?properties.status.code=='Unhealthy']" -o table

# GCP Security Command Center
gcloud scc findings list --organization=<org-id> --filter="state=ACTIVE"
```

## Gestión de secretos

### Principios no negociables

- Nunca hardcodear secretos en manifiestos K8s, valores Helm ni código IaC.
- Usar siempre un gestor externo: Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager.
- ExternalSecrets Operator sincroniza secretos del gestor al cluster sin exponerlos en git.
- Rotar secretos comprometidos dentro de las 2 horas de detección.

### ExternalSecrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: db-credentials
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: prod/myapp/db
        property: password
```

### Detección de secretos expuestos

```bash
# gitleaks — escanear repo completo
gitleaks detect --source . --report-format json --report-path gitleaks-report.json

# trufflehog — escanear historial git
trufflehog git file://. --only-verified

# detect-secrets — baseline + diff
detect-secrets scan > .secrets.baseline
detect-secrets audit .secrets.baseline
```

## Políticas de seguridad en pipelines

### Gate obligatorio (GitLab CI)

```yaml
security-gate:
  stage: security
  script:
    - trivy image --exit-code 1 --severity CRITICAL $IMAGE
    - checkov -d infra/ --compact --soft-fail-on MEDIUM
    - gitleaks detect --source . --exit-code 1
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
  allow_failure: false  # Gate bloqueante — no permite avanzar a deploy
```

### Conftest / OPA

```bash
# Validar manifiestos K8s contra políticas OPA
conftest test k8s/ --policy policy/

# Política de ejemplo — prohibir contenedores root
package main
deny[msg] {
  input.spec.securityContext.runAsUser == 0
  msg := "Contenedor no puede correr como root (UID 0)"
}
```

## Outputs

- `docs/security/scan-report-{fecha}.md` — reporte consolidado de escaneos.
- `.secrets.baseline` — baseline de detect-secrets en la raíz del repo.
- `policy/` — políticas OPA/Conftest para CI.
- Configuración de ExternalSecrets en `k8s/secrets/` o `charts/{service}/templates/`.

## Cuándo NO invocar

- El request es una auditoría de arquitectura de seguridad, threat model o revisión de compliance regulatorio (PCI-DSS, HIPAA, SOC 2) — eso corresponde a `asdd-security`.
- La tarea es diseñar la estrategia de secretos o decidir qué gestor usar — consultar primero a `asdd-cloud-architect` o `asdd-security`; este skill implementa la estrategia decidida, no la diseña.
- El pipeline aún no tiene stages de build/test definidos — la integración de seguridad requiere que el pipeline base exista; solicitar primero a `devops-engineer-pipeline` que lo estructure.

## Anti-patterns

- **Omitir el gate de seguridad en merge requests** — configurar el escaneo solo en la rama `main` y no en MRs. Los defectos de seguridad son más costosos cuanto más tarde se detectan; el gate debe ejecutarse en cada MR para evitar que vulnerabilidades lleguen a main.
- **Usar `--exit-code 0` en todos los escaneos** — configurar Trivy, Checkov o gitleaks con `allow_failure: true` o exit code 0 para que el pipeline no falle. Un gate que nunca falla no es un gate — es ruido; las vulnerabilidades CRITICAL deben bloquear el pipeline sin excepción.
- **Rotación manual y ad-hoc de secretos** — cambiar secretos solo cuando hay un incidente en lugar de tener una política de rotación automática. Los secretos de larga vida son la principal fuente de brechas por credenciales comprometidas; ExternalSecrets con `refreshInterval` garantiza rotación automática y consistente.
