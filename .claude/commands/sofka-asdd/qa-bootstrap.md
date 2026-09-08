---
description: Inicia una corrida ATF API desde HU y Swagger/OpenAPI/Postman — run_id, Work Items y run-manifest.
allowed-tools: [Read, Write, Edit, Glob, Grep, Task]
---

Ejecutar la fase **Bootstrap** del workflow ATF API.

## Prerrequisitos

Al menos uno de estos insumos en `docs/testing/atf/requirements/`:

1. HU en texto, Markdown, PDF o DOCX
2. Swagger / OpenAPI 3.x / Postman collection
3. Reglas de negocio, criterios de aceptación o contexto técnico

Y `docs/testing/atf/config/appapi.yaml` con al menos `app.url`, `app.version`, `cycle.type: baseline`.

## Instrucciones

1. Invocar `@sofka-asdd-atf-api-qa-engineer` con scope **Fase 0 + Fase 1**.
2. El pipeline ejecuta:
   - **Fase 0 (Intake & Routing):** carga `appapi.yaml` + `credentials.yaml` + `.sofka-asdd/sofka-asdd-atf.lock` vía `shared-config-loader` · clasifica LIGHT vs FULL (este command fuerza FULL) · inicializa o reanuda checkpoint.
   - **Fase 1 (Bootstrap):** deriva `run_id` (formato `{app.name}-v{version}-{YYYYMMDD}-{HHmm}`) o usa el pre-asignado si el dashboard lo inyectó · verifica `checkpoint.json` previo (ofrece reanudar via `/sofka-asdd:qa-resume` si aplica) · particiona el paquete en Work Items (`wi-001`, `wi-002`, …) · mapea dependencias entre WIs · consolida preguntas abiertas con criticidad · escribe `run-manifest.md` y `checkpoint.json`.
3. Si hay preguntas críticas bloqueantes → `status: blocked`, esperar al usuario.
4. Si no hay bloqueos → activar fase **Analyze** automáticamente (Fase 2 del pipeline).

## Artefactos esperados

- `docs/testing/atf/{run_id}/run-manifest.md`
- `docs/testing/atf/{run_id}/checkpoint.json`

## Siguiente paso

Una vez bootstrap aprobado → `/sofka-asdd:qa-analyze` (o continúa automáticamente).
