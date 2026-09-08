# guide-ia — ASDD Project Structure

**Template de Agentic Spec Driven Development (ASDD)** para proyectos Guide.

ASDD es la metodología del COE Guide para desarrollo guiado por especificaciones
y agentes de IA especializados: toda acción debe trazarse a una spec aprobada
antes de convertirse en código, y cada fase del ciclo SDLC se asigna a un agente
dedicado con responsabilidades claras.

Este repositorio es un **template listo para adoptar**: al clonarlo en un
proyecto nuevo, quedan disponibles los agentes, skills, commands y rules de
orquestación registrados en `.asdd/asdd.lock` que habilitan el flujo ASDD completo en
Claude Code.

> **Nota sobre GitHub Copilot:** actualmente solo se distribuye la variante
> Claude Code. La variante Copilot está prevista como evolución futura; ver
> `.asdd/asdd.lock` (`variants.copilot.enabled = false`). Si un equipo necesita
> Copilot como único target, abrir un issue — hasta entonces este template
> asume Claude Code como runtime.

## Estructura real del repositorio

```
project-structure/
├── .asdd/                 ← Carpeta con contrato CLI + lock
│   ├── asdd.lock          ← Manifiesto versionado del template
│   ├── cli-contract.json        ← Contrato declarativo v1.0 para guide-ai
│   └── checklist.json           ← Checklist ejecutable pre/post adopción
├── .gitignore
├── CLAUDE.md                    ← Entry point del template (instrucciones del proyecto)
├── README.md                    ← Este archivo
│
└── .claude/                     ← Toda la config agéntica de Claude Code
    ├── settings.json            ← Modelo por defecto, permisos, hooks
    ├── agents/                  ← agentes especializados (ver tabla abajo)
    ├── rules/                   ← 2 reglas: orquestación + workflow ASDD
    │   ├── asdd-orchestration.md   ← ORC-000..006: cómo delegar entre agentes
    │   └── asdd-workflow.md        ← WF-001..006: las 6 fases y sus artefactos
    ├── skills/                  ← skills (formato oficial {nombre}/SKILL.md)
    ├── commands/project/        ← 6 commands, uno por fase ASDD
    └── hooks/                   ← Hooks de protección (ver .claude/settings.json → hooks)
```

> Esta es la estructura **actual** del repositorio. Versiones anteriores del
> README describían subcarpetas `Claude/` y `Copilot/` como variantes paralelas;
> esa arquitectura se simplificó a un solo `.claude/` en la raíz.

## Agentes del template

Los agentes viven en `.claude/agents/{nombre}.md`. Cada uno declara su
modelo, tools permitidos y metodología. Los skills asociados están en
`.claude/skills/{agente}-{skill}/SKILL.md`.

| Agente | Modelo | Skills | Fases ASDD |
|---|---|---|---|
| `asdd-producto`          | `sonnet` | po · pm · ba · funcional                                  | Especificar · Analizar |
| `asdd-solution-architect`         | `opus`   | adr · component-diagram · api-contract · bounded-context  | Diseñar · Documentar |
| `asdd-tech-lead`         | `opus`   | code-review · quality-gate · refactoring                  | Transversal |
| `asdd-ux-ui`             | `opus` † | component-spec · accessibility · design-tokens · responsive | Diseñar · Construir |
| `asdd-developer-frontend` | `sonnet` | feature · unit-test · integration-test · refactoring      | Construir · Documentar |
| `asdd-developer-backend`  | `sonnet` | feature · unit-test · integration-test · refactoring      | Construir · Documentar |
| `asdd-security`          | `opus`   | code-scan · secrets-scan · dependency-audit · compliance  | Transversal |
| `asdd-qa-engineer`       | —  †     | test-strategy · e2e-test · coverage · regression          | Construir · Verificar |
| `asdd-domain-expert`     | `opus`   | fintech · insurance · retail · health · logistics · education | Transversal |
| `asdd-platform-engineer` | `sonnet` † | pipeline · containers · iac · observability               | Construir · Verificar |
| `asdd-researcher`        | `opus`   | spike · benchmark · comparison                            | Especificar · Analizar · Diseñar |
| `asdd-meta`       | `sonnet` | platform                                                  | Meta (governance) |

Los agentes declaran su modelo por **alias** (`opus` · `sonnet` · `haiku`), no por
versión concreta: un identificador de versión se retira y deja al agente apuntando
a algo que ya no existe.

> † Estas tres filas nombran agentes que ya no existen
> `ux-ui` se dividió en `asdd-ui` y `asdd-ux` (ambos `opus`);
> `platform-engineer` es hoy `asdd-devops-engineer` (`sonnet`); y
> `qa-engineer` se reemplazó por `asdd-atf-api-qa-engineer` (`opus`) y
> `asdd-atf-reporting-qa-engineer` (`sonnet`), que **no comparten modelo**,
> así que la fila no admite un valor único.

## Workflow ASDD

```
Especificar → Analizar → Diseñar → Construir → Verificar → Documentar
```

| Fase | Comando | Agentes primarios | Artefactos |
|---|---|---|---|
| Especificar | `/asdd:specify`  | `asdd-producto` · `asdd-domain-expert`  | Project brief, alcance, restricciones |
| Analizar    | `/asdd:analyze`  | `asdd-producto` · `asdd-researcher`     | Requirements, acceptance criteria, specs |
| Diseñar     | `/asdd:design`   | `asdd-solution-architect` · `asdd-ux-ui`         | ADRs, diagramas C4, wireframes |
| Construir   | `/asdd:build`    | `asdd-developer-frontend` · `asdd-developer-backend` · `asdd-ux-ui` | Código, unit/integration tests |
| Verificar   | `/asdd:verify`   | `asdd-qa-engineer` · `asdd-security`    | Test results, security report, QA sign-off |
| Documentar  | `/asdd:document` | `asdd-tech-lead` · `asdd-solution-architect`     | Docs de arquitectura, API docs, guías |

## Cómo adoptar el template

1. Recomendado: usar el CLI `guide-ai adopt <ruta-template> <ruta-destino>`.
   El CLI lee `.asdd/cli-contract.json` y ejecuta la adopción guiada
   (personalización, limpieza de disclaimers, creación de directorios,
   validación). Ver `docs/adoption/cli-integration-guide.md`.
2. Alternativa manual: clonar el repo, copiar `.claude/`, `CLAUDE.md` y
   `.asdd/` en el proyecto destino, y personalizar `CLAUDE.md` con el
   contexto específico del proyecto (stack, dominio, restricciones).
3. Crear la estructura `docs/` esperada por los agentes:
   ```
   docs/
   ├── architecture/{decisions,diagrams,contracts}/
   ├── specs/
   ├── tech/
   ├── testing/
   ├── qa/
   └── security/
   ```
   Estas carpetas **no existen** en este template — las crea el proyecto
   consumidor cuando ejecuta su primer `/asdd:specify`.
4. Ejecutar `/asdd:specify` para iniciar el ciclo ASDD.

## Versionado

La carpeta `.asdd/` contiene tres archivos:

- `asdd.lock` — manifiesto versionado del template:
  - `version`: versión del template
  - `spec`: nombre de la metodología
  - `variants.claude`: config de la variante Claude Code (enabled: true)
  - `variants.copilot`: config de la variante GitHub Copilot (enabled: false — pendiente)
  - `repository`: contadores del propio repo (agentes, skills, rules)
- `cli-contract.json` — contrato declarativo v1.0 que el CLI `guide-ai` lee
  para adoptar el template (ver `docs/adoption/contract-spec.md`).
- `checklist.json` — pasos verificables pre/post adopción.

Al actualizar el template en un proyecto consumidor, compará `.asdd/asdd.lock` con
la versión del repo fuente para saber qué cambió.

## Evolución del template

Este template sigue [SemVer](https://semver.org/lang/es/). Las reglas de
versionado (cuándo bump MAJOR/MINOR/PATCH) y el historial de cambios
están en:

- `ASDD-VERSIONING.md` — política completa (esquema por artefacto,
  compatibility matrix, release process, soporte, FAQ).
- `ASDD-CHANGELOG.md` — historial estructurado formato Keep a Changelog.
- `.claude/docs/migrations/` — guías de migración entre MAJOR versions