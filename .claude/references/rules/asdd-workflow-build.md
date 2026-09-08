# ASDD Workflow — Construir, Verificar, Documentar

Fases WF-004 a WF-006 del ciclo ASDD. Complementa `asdd-workflow.md` (WF-001 a WF-003).

## WF-004: Construir — `/asdd:build`

Implementa la solución diseñada alineada con Diseñar.

**Pre-condición TDD**: El orquestador lee `.asdd/testing-capabilities.yaml` antes de delegar (ORC-009). Si `strict_tdd: true`, el Developer sigue el ciclo RED→GREEN→TRIANGULATE→REFACTOR del módulo `strict-tdd.md`.

**Loop de Construir guiado por `index_ref` (ADR-004 §7.1):** cuando el feature se analizó con el modelo spec-per-área (WF-002-STRUCT), Construir se ejecuta como un loop determinista dirigido por el INDEX del feature. Pre-condición operativa: `.asdd-run.json.phases.build.index_ref` está poblado apuntando al INDEX; si no lo está, el orquestador lo puebla al abrir Construir (antes de delegar al primer agente). Una iteración por área:

1. El orquestador lee `.asdd-run.json.phases.build.index_ref` → obtiene la ruta al INDEX.
2. Lee el INDEX → lista las áreas con estado `pending` cuyas dependencias (columna "Depende de") están todas en `done`. Si no hay ninguna → esperar `in_progress` o escalar `blocked`.
3. Elige la próxima área según el grafo de olas: **Ola 1** (`seguridad`, `diseno`, `backend`, `data` — sin dependencias entrantes, arrancan en paralelo verificando ORC-011-A) → **Ola 2** (`frontend` depende de `diseno`+`backend`; `devops` depende de `backend`) → **Ola 3** (`qa` depende de `backend`+`frontend`).
4. Anuncia la delegación (ORC-008) y el agente elegido lee **una sola vez** el spec-funcional (cachea en su contexto) + su `spec-{area}`, e implementa según su rol.
5. El agente trabaja sobre la rama actual por defecto. Reporta `WORKTREE COMMIT`/`Files`/`Branch` solo si worktree fue activado por pedido explícito o por 2+ developers paralelos con scopes disjuntos (ADR-010/ORC-011-A). **Excepción: `diseno` NO usa worktree** — `asdd-ux` + `asdd-ui` producen artefactos de diseño, no código de runtime.
6. El orquestador aplica ORC-011 (validación + merge + cleanup) solo para áreas que produjeron código en worktree.
7. **Solo el orquestador escribe el INDEX** (R-INDEX-5): cambia el estado del área a `done` con timestamp y commit SHA, hace append al Historial de estado y recalcula el metadata block. Developers y demás sub-agentes nunca escriben el INDEX — reportan estado vía payload de retorno.
8. Checkpoint en `.asdd-run.json` (ORC-007) y vuelta al paso 2 hasta que todas las áreas queden `done` o `n/a`.

| Rol | Agente · cuándo |
|---|---|
| Primario | `asdd-developer-frontend` · **señal: componentes, páginas, hooks, estado de UI, estilos, accesibilidad** — implementación de capa de presentación |
| Primario | `asdd-developer-backend` · **señal: dominio, aplicación, infraestructura, APIs, repositorios, migraciones** — implementación de capa de backend |
| Primario | `asdd-ui` · **señal: componentes de interfaz, prototipo hi-fi, design tokens** — construye componentes React/Vite, vistas hi-fi, mocks; entrega handoff a developer y QA |
| Primario | `asdd-atf-api-qa-engineer` · **señal: automatización de pruebas API** — scaffolding Playwright/Newman, generación de `.spec.ts` por CP, opcionalmente OWASP API checks y scripts k6; produce artefactos bajo `docs/testing/atf/{run_id}/automation/` |
| Soporte | `asdd-ux` · flujos visuales mid-fi o arquitectura de información pendiente de completar en Construir |
| Soporte | `asdd-tech-lead` · code review incremental, quality gate, refactoring plan |
| Soporte | `asdd-devops-engineer` · cambios en infra/IaC (`devops-engineer-iac`), pipelines (`devops-engineer-pipeline`), DevSecOps (`devops-engineer-devsecops`) o remediación de incidentes (`devops-engineer-cloud`) |
| Soporte | `asdd-domain-expert` · validar que respeta reglas del dominio |

**Paralelismo de developers**: cuando Construir requiere 2 o más developers en paralelo, el orquestador DEBE verificar primero que los scopes de archivos no se solapan (ORC-011-A). Si no hay intersección, activa worktrees; si hay intersección, ejecuta en lotes secuenciales sobre la rama actual. Ver ADR-010 y `asdd-orchestration-worktree.md`.

**Artefactos**: código, unit tests, integration tests, docs técnica inline. Si Strict TDD activo: tabla de evidencia TDD en `docs/testing/tdd-evidence-{feature}-{NNN}.md`. Si ATF API activo: specs Playwright en `docs/testing/atf/{run_id}/automation/`. **Completitud**: código pasa quality gate del `asdd-tech-lead` y tests verdes.

## WF-005: Verificar — `/asdd:verify`

Valida cumplimiento de spec y estándares. Sin sign-off aquí, nada se considera completo.

**Pre-condición TDD**: El orquestador inyecta el estado TDD (ORC-009). Si `strict_tdd: true`, el QA-Engineer ejecuta la auditoría de cumplimiento del módulo `.claude/skills/asdd-developer-feature/strict-tdd-verify.md` antes del sign-off.

| Rol | Agente · cuándo |
|---|---|
| Primario | `asdd-atf-api-qa-engineer` · **señal: ejecución de pruebas API** — corre suite Playwright/Newman, captura evidencias redactadas, clasifica defectos (bug/precondition/env_issue/script_issue); deja corrida en `status: ready_for_report` |
| Primario | `asdd-atf-reporting-qa-engineer` · **señal: sign-off QA API** — evalúa Quality Gate Score (QGS), emite veredicto PASS/FAIL; es la fuente de verdad del sign-off formal para pruebas de API |
| Primario | `asdd-security` · pre-release — SAST, secrets, dependencies, compliance |
| Soporte | `asdd-ui` · **señal: auditoría visual UI** — audita WCAG, responsive, principios de diseño y contenido sobre los componentes construidos; produce reportes en `docs/ui/` |
| Soporte | `asdd-ux` · **señal: auditoría UX** — revisa brechas, valida que el flujo implementado resuelve el problem statement; activa `ux-gap-auditor` |
| Soporte | `asdd-producto` · acceptance criteria y QA sign-off funcional |
| Soporte | `asdd-tech-lead` · quality gate final — métricas de código |
| Soporte | `asdd-devops-engineer` · pipeline de release (`devops-engineer-pipeline`), observabilidad y SLOs (`devops-engineer-observability`), testing de infra (`devops-engineer-testing`), DevSecOps pre-release (`devops-engineer-devsecops`) |

**Artefactos**: test results, security report, QA sign-off, quality gate report, regression baseline. Si ATF API activo: `docs/testing/atf/{run_id}/execution/`, `docs/qa/atf/{run_id}/qgs-evaluation.json`. Si Strict TDD activo: reporte de auditoría TDD en `docs/qa/tdd-audit-{feature}-{NNN}.md` con veredicto PASS/FAIL. **Completitud**: `asdd-atf-reporting-qa-engineer` QGS PASS + `asdd-security` PASS + `asdd-producto` firma acceptance criteria.

## WF-006: Documentar — `/asdd:document`

Consolida la documentación final del ciclo.

| Rol | Agente · cuándo |
|---|---|
| Primario | `asdd-atf-reporting-qa-engineer` · **señal: reporte final de pruebas API** — renderiza reporte ejecutivo HTML/MD, genera backlog Jira/ADO con defectos clasificados; produce artefactos en `docs/qa/atf/{run_id}/` |
| Primario | `asdd-ux` · **señal: narrativa de hallazgos UX** — produce deck ejecutivo y 1-pager por audiencia; activa `ux-executive-storytelling` |
| Primario | `asdd-ui` · **señal: documentación del design system** — genera reporte consolidado de tokens, componentes, auditorías y handoff final; produce `docs/ui/design-system-summary.md` y actualiza `docs/specs/handoff-to-developer.md` con la versión final |
| Primario | `asdd-tech-lead` · consolidar estándares y decisiones |
| Primario | `asdd-solution-architect` · arquitectura final, ADR index, C4 actualizado |
| Soporte | `asdd-developer-backend` · docs técnica de APIs, módulos, configuración |

**Artefactos**: docs de arquitectura, ADR index, API docs, guías de uso, changelog técnico. Si ATF API activo: `docs/qa/atf/{run_id}/final-report.md`, `final-report.html`, `defects-ready-for-jira-ado.json`. **Completitud**: `docs/` refleja el estado real del sistema post-ciclo.

## Referencia rápida — agentes por fase: ver `asdd-phases-reference.md`.
