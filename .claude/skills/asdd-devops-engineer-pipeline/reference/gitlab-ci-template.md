# GitLab CI — Template base

Template copiable para `.gitlab-ci.yml`. Cubre build, test, security,
deploy-staging y deploy-prod con estrategia por rama (`develop` → staging,
`main` → prod manual).

```yaml
stages:
  - build
  - test
  - security
  - deploy-staging
  - deploy-prod

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

build:
  stage: build
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker push $DOCKER_IMAGE

test:unit:
  stage: test
  script: make test:unit
  coverage: '/Coverage: \d+\.\d+%/'

test:integration:
  stage: test
  services:
    - postgres:15
  script: make test:integration

security:sast:
  stage: security
  include:
    - template: Security/SAST.gitlab-ci.yml

security:dependencies:
  stage: security
  script: make security:deps-audit

deploy:staging:
  stage: deploy-staging
  environment:
    name: staging
    url: https://staging.example.com
  script: make deploy ENV=staging
  only: [develop]

deploy:prod:
  stage: deploy-prod
  environment:
    name: production
    url: https://example.com
  script: make deploy ENV=production
  only: [main]
  when: manual
```

## Variables protegidas (GitLab CI/CD settings)

- `DEPLOY_TOKEN_STAGING`, `DEPLOY_TOKEN_PROD`: protegidas + enmascaradas.
- `CI_REGISTRY_*`: provistas por GitLab automáticamente.
- Usar entornos `staging` y `production` con approvers configurados.
