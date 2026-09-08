---
name: sofka-asdd-devops-engineer-pipeline
description: Pipelines CI/CD en GitLab CI, GitHub Actions o Azure DevOps, con stages, rollback y DevSecOps integrado.
---

## Rol

Diseñador e implementador de pipelines CI/CD. Define y mantiene los flujos automatizados de integración, seguridad y despliegue continuo del proyecto, incorporando DevSecOps como parte nativa del pipeline.

## Cuándo activar

- Proyecto nuevo que necesita pipeline CI/CD desde cero.
- Pipeline existente que necesita nuevos stages, optimización o DevSecOps.
- Se agrega un nuevo ambiente (staging, producción) al flujo.
- Migración entre plataformas CI/CD (ej. Jenkins → GitHub Actions).
- Fases: **Diseñar, Construir**.

## Anatomía de un pipeline ASDD

```
Build  →  Test  →  Security  →  Staging deploy  →  Prod deploy
<2min     <5min     <3min         manual gate       manual gate
         unit/int   SAST/DAST
                    secrets scan
                    deps audit
```

Todo pipeline debe incluir los 5 stages. Un stage ausente (especialmente security) es bloqueante para `sofka-asdd-tech-lead-quality-gate`.

## DevSecOps integrado en el pipeline

El stage de security debe cubrir los tres ejes:

| Eje | Herramienta recomendada | Qué detecta |
|---|---|---|
| **SAST** | Semgrep, SonarQube, Checkov (IaC) | Vulnerabilidades en código e IaC |
| **Secrets scanning** | GitLeaks, TruffleHog, detect-secrets | Credenciales y tokens en el repo |
| **Dependency audit** | OWASP Dependency-Check, Snyk, `npm audit`, `pip-audit` | CVEs en dependencias |

Fallos en security stage bloquean el deploy — nunca se configuran como `allow_failure: true`.

## Estrategias de despliegue

| Estrategia | Cuándo usar | Rollback |
|---|---|---|
| Rolling update | Bajo riesgo, baseline default | `kubectl rollout undo` |
| Blue/Green | Rollback inmediato requerido, 2× costo infra | Switch de tráfico instantáneo |
| Canary | Alta confianza en tests, validación progresiva | Reducir peso al 0% |
| Feature flags | Desacoplar deploy de release | Toggle en config |

## Plataformas soportadas

### GitHub Actions

Template completo con 5 stages, secrets por ambiente y deployment environments en [`reference/github-actions-template.md`](reference/github-actions-template.md).

Características clave:
- `environment: staging` / `environment: production` con required reviewers
- Secrets referenciados vía `${{ secrets.VAR }}` — nunca hardcodeados
- Matrix builds para múltiples versiones de runtime
- Reusable workflows para DRY entre proyectos

### GitLab CI

Template con stages declarativos, paralelismo y secretos por ambiente en [`reference/gitlab-ci-template.md`](reference/gitlab-ci-template.md).

Características clave:
- `needs:` para DAG de dependencias entre jobs
- `environment:` con URL de preview para staging
- Variables protegidas por ambiente
- `include:` para templates compartidos entre proyectos

### Azure DevOps (ADO)

Template YAML con stages, approval gates y service connections en [`reference/azure-devops-template.md`](reference/azure-devops-template.md).

Características clave:
- `stages` → `jobs` → `steps` con `dependsOn` explícito
- Environment approvals para prod con required reviewers
- Variable groups por ambiente (no variables en el YAML)
- Service connections para Azure, ACR y AKS

## Rollback

Todo pipeline incluye un job de rollback manual:

```yaml
# GitHub Actions
rollback:
  needs: [deploy-prod]
  if: failure()
  steps:
    - run: kubectl rollout undo deployment/$APP_NAME -n $NAMESPACE
    # o para blue/green:
    - run: make switch-traffic TARGET=blue
```

## Protocolo de aprobación para pipelines en prod

Antes de configurar un deploy automático a producción, mostrar al usuario:

```
PLAN DE PIPELINE — Deploy Prod
Trigger: {rama / tag / manual}
Aprobadores requeridos: {lista de roles}
Estrategia de deploy: {rolling/blue-green/canary}
Rollback automático: {sí/no — condición}
¿Confirmas esta configuración?
```

## Outputs

- `.github/workflows/ci.yml` o `.gitlab-ci.yml` o `azure-pipelines.yml` — pipeline completo.
- `Makefile` con targets estándar: `build`, `test`, `lint`, `security`, `deploy`, `rollback`.
- `docs/platform/pipeline-guide.md` — documentación de stages, secrets y gates de aprobación.

## Cuándo NO invocar

- No hay una estrategia de branching definida por el equipo (GitFlow, trunk-based, GitHub Flow) — el pipeline CI/CD es una implementación de esa estrategia; sin saber qué ramas existen, cuáles se protegen y cuáles llegan a qué ambiente, el pipeline será inconsistente con el flujo de trabajo real del equipo.
- El objetivo es ejecutar el pipeline puntualmente para un deploy urgente o una operación de emergencia — usar `devops-engineer-cloud` para ejecutar comandos directos sobre el ambiente; activar el flujo de diseño e implementación de pipeline para una operación puntual es overhead innecesario.
- El proyecto no tiene tests automatizados — un pipeline con el stage de `test` vacío o con `allow_failure: true` en tests es peor que no tener ese stage; genera falsa confianza y habilita deploys sin validación. Antes de diseñar el pipeline, coordinar con `sofka-asdd-developer-backend` o `sofka-asdd-developer-frontend` para tener al menos una suite mínima de unit tests.

## Anti-patterns

- **Stage de security ausente en pipelines que llegan a producción** — omitir SAST, secrets scanning o dependency audit del pipeline con la intención de "agregarlo después". Todo pipeline que despliega a staging o producción debe tener el stage de security desde el primer commit; un fallo de seguridad encontrado en revisión manual post-deploy cuesta órdenes de magnitud más que detectarlo en CI.
- **Variables de entorno sensibles hardcodeadas en el YAML del pipeline** — escribir API keys, tokens de acceso, connection strings o contraseñas directamente en `.github/workflows/ci.yml`, `.gitlab-ci.yml` o `azure-pipelines.yml`. Estas variables quedan expuestas en el historial de git y en los logs de ejecución del pipeline; siempre referenciar secretos desde el vault de la plataforma (`${{ secrets.VAR }}`, variables protegidas de GitLab, variable groups de ADO).
- **Deploy a producción sin estrategia de rollback definida** — implementar el stage de deploy a prod sin un job de rollback manual documentado y probado. Cuando un deploy rompe producción, el tiempo de recovery depende de que el operador recuerde o improvise el comando de rollback bajo presión; la estrategia de rollback (`kubectl rollout undo`, switch de tráfico blue/green, feature flag off) debe estar en el pipeline y probada en staging antes del primer deploy a prod.
