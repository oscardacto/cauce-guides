---
description: ATF API fase Automate — Playwright TS con Bun más paquete Newman; opcional OWASP API y k6 en paralelo.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Task]
---

Ejecutar la fase **Automate** del workflow ATF API.

## Prerrequisito

`test-cases.json` aprobado (output de `/asdd:qa-design`).

## Instrucciones

1. **Plan-gate (ORC-010):** si `delta_status: major` desde Fase 2, solicitar aprobación al usuario antes de proceder.
2. Invocar `@asdd-atf-api-qa-engineer` con scope **Fase 4 (Automate)**.
3. El pipeline ejecuta secuencialmente:
   - `step-5-bun-runner-setup` → scaffolding inicial (Bun + Playwright TS) una vez por run
   - `step-5-playwright-api-scaffolder` → un `.spec.ts` por cada CP
   - `step-5-newman-bridge` → colección Postman/Newman para sanity manual
4. **En paralelo (si flags activos en `appapi.yaml`):**
   - `step_security: true` → `asdd-atf-api-security-owasp-api-checks` (+ `asdd-atf-api-security-zap-runner` si aplica)
   - `step_performance: true` → `asdd-atf-api-performance-k6-script-generator`
5. **Gate de salida:** si Security reporta findings `critical` abiertos → bloquear Fase 5 hasta resolución o aceptación documentada.
6. Actualizar checkpoint.

## Artefactos esperados

- `docs/testing/atf/{run_id}/automation/specs/{wi}-*.spec.ts`
- `docs/testing/atf/{run_id}/automation/postman/{wi}.postman_collection.json`
- `docs/testing/atf/{run_id}/automation/automation-manifest.json`
- (opcional) `docs/testing/atf/{run_id}/security/findings.json`
- (opcional) `docs/testing/atf/{run_id}/performance/scripts/*.js`

## Siguiente paso

`/asdd:qa-execute`
