# ASDD — Agentic Spec Driven Development
# Claude Code Project Instructions

<!-- sofka-asdd:template-disclaimer:start -->
> **Este es el CLAUDE.md del repositorio template.** El proyecto que adopta ASDD
> lo copia como base y lo personaliza con su stack. Las rutas bajo `docs/` que
> se describen más abajo **no existen en este template**: las crea el consumidor
> en su primer `/sofka-asdd:specify`. En un proyecto real esta nota ya debería
> estar eliminada y esas rutas deberían existir.
<!-- sofka-asdd:template-disclaimer:end -->

Este proyecto sigue **Agentic Spec Driven Development (ASDD)**, la metodología de
Sofka donde agentes de IA especializados guían el desarrollo desde la
especificación hasta la entrega. Toda acción debe trazarse a una spec aprobada.

## Principio fundamental: Spec First

Nunca escribir código de implementación sin una especificación aprobada en
`docs/specs/`. Si no existe spec, invocar primero al agente
`sofka-asdd-producto` o ejecutar `/sofka-asdd:specify`.

## Workflow ASDD

```
Especificar → Analizar → Diseñar → Construir → Verificar → Documentar
```

Cada fase tiene gate propio y no se saltea: brief antes que specs, specs
aprobadas antes que diseño, ADRs aceptadas antes que implementación, QA
sign-off antes de cerrar. Detalle en `.claude/rules/sofka-asdd-workflow.md`.

## Agentes, skills y comandos

El catálogo **no se duplica acá**: el runtime ya inyecta el nombre y la
descripción de cada agente, skill y comando en toda sesión. Repetirlo se paga
dos veces por turno.

- **Qué agente existe y cuándo invocarlo** → su propia descripción.
- **Qué capacidades tiene un agente y cómo se cargan** →
  `.sofka-asdd/capability-loading.json` para los agentes migrados a carga on-demand;
  el resto declara sus skills eager en el `skills:` de su propio frontmatter.
- **Qué agente es primario en cada fase** → `.claude/rules/sofka-asdd-phases-reference.md`.
- **Comandos** → namespace `/sofka-asdd:`: uno por fase, más las familias
  `qa-*` (ATF API), `qa-web-*` (ATF Web), `data-eng-*` (Smart Data) y
  `add-agent` / `add-skill`.
- **Inventario para auditoría** → `node .claude/scripts/validate-template.mjs`.

## Dominio de datos — Smart Data ASDD

Addon opcional para plataformas de datos analíticos (Medallion, Star schema,
Databricks/AWS), activado por `data_platform` en
`.sofka-asdd/sofka-asdd-smart-data.lock` (default `none`). Aporta tres agentes
`sofka-asdd-data-*` con routing propio D0-D7 arbitrado con ORC-001 — ver
`sofka-asdd-data-routing.md`. Los agentes leen directamente el Excel de trabajo
`docs/smart-data/data/smart-data-eng-{cliente}.xlsx`.

## Estructura de documentación

Todos los artefactos ASDD viven en `docs/`:

```
architecture/  ← diseño de sistema · decisions/ (ADRs) · diagrams/ · contracts/
specs/         ← project briefs y especificaciones de features
tech/          ← estándares de código y guías de implementación
testing/       ← estrategias y planes · atf/ y atf-web/ por {run_id}
qa/            ← reportes QA y sign-offs · atf/{run_id}/ reportes finales
security/      ← revisiones de seguridad
```

## Memoria persistente del proyecto

`ASDD-MEMORY.md` en la raíz es el índice de memoria entre sesiones; los archivos
de `.claude/memory/` se consultan bajo demanda. Usarlo para lo que **no se
deriva leyendo el código**: decisiones transversales sin ADR, convenciones
acordadas verbalmente, gotchas de post-mortems y punteros a sistemas externos.

Cada memoria es un archivo `.claude/memory/{slug}.md` con frontmatter
`name/description/type`; el índice solo referencia. No duplicar lo que ya está
en este `CLAUDE.md`, en ADRs o en código.

## Routing Adaptativo

El orquestador clasifica cada request antes de activar el workflow de fases
(`ORC-001-B`):

- **TRIVIAL**: consulta local puntual → ejecución directa, sin subagente.
- **LIGHT**: scope acotado → lectura amplia pero inventariada puede ejecutarse
  directamente; cambios y herramientas especializadas delegan hasta 1 agente.
- **MEDIUM**: investigación o cambio multicomponente → hasta 2 agentes.
- **FULL**: feature, HU, spec, solicitud abierta o alto riesgo → workflow completo.

Todo agente en ruta LIGHT puede escalar a FULL si detecta complejidad oculta
(`ORC-001-C`). Usá `/sofka-asdd:do` para forzar ruta LIGHT explícitamente.
Ver `.claude/rules/sofka-asdd-routing-heuristics.md` para la taxonomía completa.

## Asignación de modelo por fase

El orquestador resuelve el modelo de cada sub-agente antes de invocarlo
(ORC-002-B), siguiendo la cadena
`skill_override > agent_pinning > phase_default > frontmatter`. Los defaults por
fase están en `.sofka-asdd/sofka-asdd.lock` bajo `model_strategy`. Ver
`.claude/docs/adoption/model-strategy.md`.

## Integraciones externas y plugins

`Context7` está activado por default en `.mcp.json`. Los demás MCPs (Figma,
Atlassian, GitHub, Sentry, Slack, Playwright, SonarQube, Azure, Excalidraw)
están **catalogados pero no instalados**, y el template no activa ningún plugin:
el proyecto consumidor decide cuáles adoptar. Catálogos con casos de uso por
agente e instalación en `.claude/docs/mcps-by-domain.md` y
`.claude/docs/plugins-by-role.md`.

## Convención de nomenclatura

Los artefactos del template usan prefijo `sofka-asdd-` (agentes, skills, rules,
hooks; commands bajo `/sofka-asdd:`). Los del proyecto consumidor usan
`{project.name}-`, tomado de `.sofka-asdd/sofka-asdd.lock`. El check 14 del
validador (`naming-convention`, strict) lo verifica; la guía completa está en
`.claude/docs/adoption/naming-convention.md`.

Todo artefacto documental nuevo bajo `docs/**` usa
`{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`: el orquestador abre el run y reserva las
rutas exactas antes del plan, y el agente nunca inventa nombres (ART-001).

## Validación de configuración agéntica

`npm run validate` verifica agentes, skills, hooks, MCPs y manifiesto; `npm test`
corre las suites de comportamiento. Sin dependencias npm; requiere Node >= 22,
`git` en el `PATH` y un shell POSIX (en Windows, Git Bash). Este repositorio no
presupone CI. Ver `.claude/docs/validation.md`.

## Reglas no negociables

- Sin código sin spec aprobada (CORE-001)
- Sin desviaciones silenciosas de la spec (CORE-006)
- Revisión de seguridad obligatoria antes de producción (CORE-007)
- Un feature está hecho solo cuando QA emite sign-off (CORE-008).
  Operacionalmente, "sign-off" = veredicto **PASS** de
  `sofka-asdd-atf-reporting-qa-engineer` en
  `docs/qa/atf/{run_id}/qgs-evaluation.json` (pruebas API), o de
  `sofka-asdd-atf-api-qa-engineer` en `docs/qa/signoff-{feature}.md` para otros
  tipos de prueba.
- Toda decisión significativa se convierte en ADR (CORE-005)
- El orquestador nunca escribe ni usa herramientas de dominio directamente:
  delega los cambios y todo MEDIUM/FULL. TRIVIAL y LIGHT read-only acotado son
  la única ejecución directa permitida. Un `LIGHT atomic_scoped_change` sigue
  delegado, pero el runtime lo autoautoriza para un archivo y un uso, sin pedir
  challenge (CORE-009).
- Si ningún agente cubre el request: informar al usuario, explicar por qué
  ninguno aplica y pedir permiso explícito antes de ejecutar (CORE-010)
