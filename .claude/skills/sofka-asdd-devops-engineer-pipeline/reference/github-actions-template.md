# GitHub Actions — Template base

Template copiable para `.github/workflows/ci.yml`. Implementa los 5 stages
ASDD: build, test, security, deploy-staging, deploy-prod. Adaptar comandos
(`make build`, `make test:*`) al stack del proyecto.

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: make build

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Unit tests
        run: make test:unit
      - name: Integration tests
        run: make test:integration
      - name: Coverage check
        run: make test:coverage

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: SAST scan
        uses: github/codeql-action/analyze@v3
      - name: Dependency audit
        run: npm audit --audit-level=high

  deploy-staging:
    needs: [test, security]
    if: github.ref == 'refs/heads/develop'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: make deploy ENV=staging

  deploy-prod:
    needs: [test, security]
    if: github.ref == 'refs/heads/main'
    environment: production
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: make deploy ENV=production
```

## Secrets requeridos (GitHub Environments)

| Ambiente | Secret | Propósito |
|---|---|---|
| staging | `DEPLOY_TOKEN_STAGING` | Credencial para el deploy en staging |
| production | `DEPLOY_TOKEN_PROD` | Credencial para el deploy en prod |
| ambos | `REGISTRY_URL`, `REGISTRY_USER`, `REGISTRY_PASSWORD` | Container registry |

Usar "Environment protection rules" en producción para exigir aprobación
manual antes del deploy.
