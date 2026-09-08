---
description: Fase Verificar — valida spec, calidad y seguridad. Ningún feature está completo sin este sign-off.
allowed-tools: [Read, Write, Grep, Glob, Bash, Task]
---

Ejecutar la fase **Verificar** del workflow ASDD.

## Prerequisito

La construcción debe tener quality gate PASS del `tech-lead`. Sin ese gate, Verificar no comienza.

## Instrucciones

1. Invocar `atf-api-qa-engineer` para ejecutar la suite de pruebas de API (Playwright/Newman): ejecución, evidencias y clasificación de defectos. Las pruebas de capa (unit/integration/e2e) las ejecuta el `developer` en Construir.
2. Invocar `security` para el ciclo pre-release: secrets scan → code scan → dependency audit → compliance.
3. Incluir como soporte según necesidad:
   - `producto` — validación de acceptance criteria y sign-off funcional
   - `tech-lead` — quality gate final con métricas de código
   - `devops-engineer` — pipeline de release (`devops-engineer-pipeline`), observabilidad y SLOs (`devops-engineer-observability`), tests de infra (`devops-engineer-testing`)
4. El feature solo se considera **DONE** cuando los tres sign-offs están emitidos: `atf-reporting-qa-engineer` QGS PASS + `security` PASS + `producto` acceptance.

## Artefactos esperados

- `docs/testing/report-{feature}-{NNN}.md` — resultados de tests
- `docs/security/review-{feature}-{NNN}.md` — reporte de seguridad
- QA sign-off documentado en el spec o PR
- Quality gate report del `tech-lead`

## Siguiente paso

Con los tres sign-offs — cerrar el ciclo con `/asdd:document`
