---
description: Fase Construir — implementa la solución con código, tests y documentación técnica alineados al diseño aprobado.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Task, TodoWrite]
---

Ejecutar la fase **Construir** del workflow ASDD.

## Prerequisito

Deben existir ADRs aprobados de `/sofka-asdd:design` y el set spec-per-área del feature (WF-002 cerrado con Gate DOR). Sin diseño aprobado no se implementa. El orquestador puebla `.asdd-run.json.phases.build.index_ref` con la ruta al INDEX del feature antes de delegar al primer agente.

## Instrucciones (loop guiado por `index_ref` — ADR-004 §7.1)

Construir se ejecuta como un loop determinista dirigido por el INDEX del feature:

1. Leer `.asdd-run.json.phases.build.index_ref` → ruta al INDEX; leer el INDEX → obtener áreas `pending` cuyas dependencias ("Depende de") estén todas en `done`.
2. Elegir la próxima área según el grafo de olas: **Ola 1** (`seguridad`, `diseno`, `backend`, `data` — sin dependencias entrantes, en paralelo verificando ORC-011-A) → **Ola 2** (`frontend` depende de `diseno`+`backend`; `devops` depende de `backend`) → **Ola 3** (`qa` depende de `backend`+`frontend`).
3. Delegar al agente dueño del área. El agente lee **una sola vez** el spec-funcional (contenido cross-área) + su `spec-{area}` e implementa cambios mínimos alineados con el diseño — sin creatividad arquitectónica propia:
   - `developer-backend` / `developer-frontend` (skill `feature`) → código de dominio/aplicación/infra o de presentación.
   - `ui` (+ `ux`) → área `diseno`: componentes hi-fi, tokens, wireframes. **`diseno` NO usa worktree** — produce artefactos de diseño, no ejecuta ORC-011.
   - `atf-api-qa-engineer` / `atf-web-qa-engineer` → área `qa`: automatización de pruebas.
   - `devops-engineer` → área `devops`: infra/IaC, pipelines, DevSecOps.
4. Modo de ejecución: un developer trabaja sobre la rama actual. Worktree se
   activa solo por pedido explícito o para 2+ developers paralelos con scopes
   disjuntos verificados por ORC-011-A (ADR-010).
5. Al terminar cada área que produjo código en worktree, el orquestador aplica ORC-011 (validación + merge + cleanup). Para trabajo sobre rama actual omite el handoff de worktree. En ambos modos, **solo el orquestador** actualiza el estado del área en el INDEX a `done` con timestamp y commit SHA (R-INDEX-5). Checkpoint en `.asdd-run.json` (ORC-007) y volver al paso 1 hasta que todas las áreas queden `done`/`n/a`.

Soporte según necesidad: `tech-lead` (code review incremental y quality gate), `domain-expert` (validar reglas del dominio). Consultar `meta` si el contexto supera el 50% antes de combinar developers + otros agentes pesados.

## Artefactos esperados

- Código implementado en el repositorio (por área, según el `spec-{area}`)
- Unit tests (skill `developer-unit-test`)
- Integration tests (skill `developer-integration-test`)
- INDEX actualizado con el progreso por área (estados `done` + historial)
- Docs técnica inline y en `docs/tech/`

## Siguiente paso

Con quality gate de `tech-lead` en PASS → `/sofka-asdd:verify`
