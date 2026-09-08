# sofka-ia — ASDD Project Structure

**Template de Agentic Spec Driven Development (ASDD)** para proyectos Sofka.

ASDD es la metodología del COE Sofka para desarrollo guiado por especificaciones
y agentes de IA especializados: toda acción debe trazarse a una spec aprobada
antes de convertirse en código, y cada fase del ciclo SDLC se asigna a un agente
dedicado con responsabilidades claras.

Este repositorio es un **template listo para adoptar**: al clonarlo en un
proyecto nuevo, quedan disponibles los agentes, skills, commands y rules de
orquestación registrados en `.sofka-asdd/sofka-asdd.lock` que habilitan el flujo ASDD completo en
Claude Code.

> **Nota sobre GitHub Copilot:** actualmente solo se distribuye la variante
> Claude Code. La variante Copilot está prevista como evolución futura; ver
> `.sofka-asdd/sofka-asdd.lock` (`variants.copilot.enabled = false`). Si un equipo necesita
> Copilot como único target, abrir un issue — hasta entonces este template
> asume Claude Code como runtime.

## Estructura real del repositorio

```
project-structure/
├── .sofka-asdd/                 ← Carpeta con contrato CLI + lock
│   ├── sofka-asdd.lock          ← Manifiesto versionado del template
│   ├── cli-contract.json        ← Contrato declarativo v1.0 para sofka-ai
│   └── checklist.json           ← Checklist ejecutable pre/post adopción
├── .gitignore
├── CLAUDE.md                    ← Entry point del template (instrucciones del proyecto)
├── README.md                    ← Este archivo
│
└── .claude/                     ← Toda la config agéntica de Claude Code
    ├── settings.json            ← Modelo por defecto, permisos, hooks
    ├── agents/                  ← agentes especializados (ver tabla abajo)
    ├── rules/                   ← 2 reglas: orquestación + workflow ASDD
    │   ├── sofka-asdd-orchestration.md   ← ORC-000..006: cómo delegar entre agentes
    │   └── sofka-asdd-workflow.md        ← WF-001..006: las 6 fases y sus artefactos
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
| `sofka-asdd-producto`          | `sonnet` | po · pm · ba · funcional                                  | Especificar · Analizar |
| `sofka-asdd-solution-architect`         | `opus`   | adr · component-diagram · api-contract · bounded-context  | Diseñar · Documentar |
| `sofka-asdd-tech-lead`         | `opus`   | code-review · quality-gate · refactoring                  | Transversal |
| `sofka-asdd-ux-ui`             | `opus` † | component-spec · accessibility · design-tokens · responsive | Diseñar · Construir |
| `sofka-asdd-developer-frontend` | `sonnet` | feature · unit-test · integration-test · refactoring      | Construir · Documentar |
| `sofka-asdd-developer-backend`  | `sonnet` | feature · unit-test · integration-test · refactoring      | Construir · Documentar |
| `sofka-asdd-security`          | `opus`   | code-scan · secrets-scan · dependency-audit · compliance  | Transversal |
| `sofka-asdd-qa-engineer`       | —  †     | test-strategy · e2e-test · coverage · regression          | Construir · Verificar |
| `sofka-asdd-domain-expert`     | `opus`   | fintech · insurance · retail · health · logistics · education | Transversal |
| `sofka-asdd-platform-engineer` | `sonnet` † | pipeline · containers · iac · observability               | Construir · Verificar |
| `sofka-asdd-researcher`        | `opus`   | spike · benchmark · comparison                            | Especificar · Analizar · Diseñar |
| `sofka-asdd-meta`       | `sonnet` | platform                                                  | Meta (governance) |

Los agentes declaran su modelo por **alias** (`opus` · `sonnet` · `haiku`), no por
versión concreta: un identificador de versión se retira y deja al agente apuntando
a algo que ya no existe.

> † Estas tres filas nombran agentes que ya no existen
> `ux-ui` se dividió en `sofka-asdd-ui` y `sofka-asdd-ux` (ambos `opus`);
> `platform-engineer` es hoy `sofka-asdd-devops-engineer` (`sonnet`); y
> `qa-engineer` se reemplazó por `sofka-asdd-atf-api-qa-engineer` (`opus`) y
> `sofka-asdd-atf-reporting-qa-engineer` (`sonnet`), que **no comparten modelo**,
> así que la fila no admite un valor único.

## Workflow ASDD

```
Especificar → Analizar → Diseñar → Construir → Verificar → Documentar
```

| Fase | Comando | Agentes primarios | Artefactos |
|---|---|---|---|
| Especificar | `/sofka-asdd:specify`  | `sofka-asdd-producto` · `sofka-asdd-domain-expert`  | Project brief, alcance, restricciones |
| Analizar    | `/sofka-asdd:analyze`  | `sofka-asdd-producto` · `sofka-asdd-researcher`     | Requirements, acceptance criteria, specs |
| Diseñar     | `/sofka-asdd:design`   | `sofka-asdd-solution-architect` · `sofka-asdd-ux-ui`         | ADRs, diagramas C4, wireframes |
| Construir   | `/sofka-asdd:build`    | `sofka-asdd-developer-frontend` · `sofka-asdd-developer-backend` · `sofka-asdd-ux-ui` | Código, unit/integration tests |
| Verificar   | `/sofka-asdd:verify`   | `sofka-asdd-qa-engineer` · `sofka-asdd-security`    | Test results, security report, QA sign-off |
| Documentar  | `/sofka-asdd:document` | `sofka-asdd-tech-lead` · `sofka-asdd-solution-architect`     | Docs de arquitectura, API docs, guías |

## Cómo adoptar el template

1. Recomendado: usar el CLI `sofka-ai adopt <ruta-template> <ruta-destino>`.
   El CLI lee `.sofka-asdd/cli-contract.json` y ejecuta la adopción guiada
   (personalización, limpieza de disclaimers, creación de directorios,
   validación). Ver `docs/adoption/cli-integration-guide.md`.
2. Alternativa manual: clonar el repo, copiar `.claude/`, `CLAUDE.md` y
   `.sofka-asdd/` en el proyecto destino, y personalizar `CLAUDE.md` con el
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
   consumidor cuando ejecuta su primer `/sofka-asdd:specify`.
4. Ejecutar `/sofka-asdd:specify` para iniciar el ciclo ASDD.

## Versionado

La carpeta `.sofka-asdd/` contiene tres archivos:

- `sofka-asdd.lock` — manifiesto versionado del template:
  - `version`: versión del template
  - `spec`: nombre de la metodología
  - `variants.claude`: config de la variante Claude Code (enabled: true)
  - `variants.copilot`: config de la variante GitHub Copilot (enabled: false — pendiente)
  - `repository`: contadores del propio repo (agentes, skills, rules)
- `cli-contract.json` — contrato declarativo v1.0 que el CLI `sofka-ai` lee
  para adoptar el template (ver `docs/adoption/contract-spec.md`).
- `checklist.json` — pasos verificables pre/post adopción.

Al actualizar el template en un proyecto consumidor, compará `.sofka-asdd/sofka-asdd.lock` con
la versión del repo fuente para saber qué cambió.

## Evolución del template

Este template sigue [SemVer](https://semver.org/lang/es/). Las reglas de
versionado (cuándo bump MAJOR/MINOR/PATCH) y el historial de cambios
están en:

- `ASDD-VERSIONING.md` — política completa (esquema por artefacto,
  compatibility matrix, release process, soporte, FAQ).
- `ASDD-CHANGELOG.md` — historial estructurado formato Keep a Changelog.
- `.claude/docs/migrations/` — guías de migración entre MAJOR versions