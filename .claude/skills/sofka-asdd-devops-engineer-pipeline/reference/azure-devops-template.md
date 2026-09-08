# Azure DevOps — Template base

Template copiable para `azure-pipelines.yml`. Cubre build, test, security,
deploy-staging y deploy-prod con approval gates por ambiente y service
connections declarados.

```yaml
trigger:
  branches:
    include:
      - main
      - develop

variables:
  IMAGE_NAME: $(Build.Repository.Name)
  IMAGE_TAG: $(Build.BuildId)

stages:
  - stage: Build
    displayName: Build & Push
    jobs:
      - job: BuildImage
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: Docker@2
            displayName: Build image
            inputs:
              command: build
              repository: $(IMAGE_NAME)
              tags: $(IMAGE_TAG)
          - task: Docker@2
            displayName: Push image
            inputs:
              command: push
              repository: $(IMAGE_NAME)
              tags: $(IMAGE_TAG)

  - stage: Test
    displayName: Test
    dependsOn: Build
    jobs:
      - job: UnitTest
        pool:
          vmImage: ubuntu-latest
        steps:
          - script: make test:unit
            displayName: Unit tests
      - job: IntegrationTest
        pool:
          vmImage: ubuntu-latest
        services:
          postgres: postgres:15
        steps:
          - script: make test:integration
            displayName: Integration tests

  - stage: Security
    displayName: Security
    dependsOn: Test
    jobs:
      - job: SAST
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: MicrosoftSecurityDevOps@1
            displayName: SAST scan
            inputs:
              categories: code
          - script: make security:deps-audit
            displayName: Dependency audit

  - stage: DeployStaging
    displayName: Deploy Staging
    dependsOn: Security
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/develop'))
    jobs:
      - deployment: DeployStaging
        environment: staging
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - script: make deploy ENV=staging
                  displayName: Deploy to staging

  - stage: DeployProd
    displayName: Deploy Production
    dependsOn: DeployStaging
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployProd
        environment: production
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - script: make deploy ENV=production
                  displayName: Deploy to production
```

## Service connections (Azure DevOps settings)

- `DockerRegistryServiceConnection`: conexión al registry (ACR, Docker Hub).
- `KubernetesServiceConnection`: conexión al cluster de destino.
- Configurar en **Project Settings → Service connections** con alcance mínimo.

## Approval gates

Los approval gates se configuran en **Environments** de Azure DevOps:
- `staging`: aprobación automática (o un approver del equipo).
- `production`: aprobación manual obligatoria por el release manager.

## Variables protegidas (Azure DevOps Library)

- Usar **Variable Groups** con variables `SECRET` habilitadas.
- Referenciar en el pipeline con `$(VARIABLE_NAME)`.
- No declarar secrets directamente en `azure-pipelines.yml`.
