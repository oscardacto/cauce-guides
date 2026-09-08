# Auditoría técnica: rendimiento del runtime ASDD

**Run:** `2026-07-18-001`  
**Fecha de captura:** 2026-07-17  
**Rama evaluada:** `feature/asdd-runtime-hardening` en `8e7e047`  
**Alcance:** velocidad de respuesta, contexto, tokens, subagentes, skills, rules,
hooks, modelos y MCPs del template `project-structure`.

## 1. Propósito

Persistir la evidencia que motiva **ASDD Runtime Efficiency v2** sin reabrir los
runs cerrados `2026-07-17-001` y `2026-07-17-002`. Esta auditoría describe
el estado observado; el brief y las specs posteriores definen lo que deberá
cambiar.

## 2. Método

La evaluación fue estática y local:

1. Conteo de palabras y bytes de `CLAUDE.md`, rules, agents, skills, commands
   y hooks.
2. Ejecución de `.claude/scripts/sofka-asdd-runtime-metrics.mjs`.
3. Recalculo independiente de `agent + skills`, soportando listas YAML inline
   y de bloque.
4. Conteo de hooks aplicables a `Bash`, `Write` y `Edit` desde
   `.claude/settings.json`.
5. Medición puntual del fast path de los siete hooks de un `git status`
   seguro. Esta cifra es evidencia diagnóstica, no un benchmark p50/p95.
6. Medición de palabras emitidas por `SessionStart` y `UserPromptSubmit`.
7. Ejecución de `npm run validate`.

Los valores procesables están en
`docs/baselines/asdd-runtime-baseline-v2.json`.

## 3. Línea base observada

| Métrica | Valor |
|---|---:|
| Contexto always-on | 16.973 palabras |
| `CLAUDE.md` | 2.108 palabras |
| 16 rules globales | 14.865 palabras |
| Inyección `SessionStart` | 85 palabras |
| Inyección normal `UserPromptSubmit` | 145 palabras por turno |
| Hooks por `Bash` | 7 procesos Node |
| Hooks por `Write/Edit` | 8 procesos Node |
| Suma puntual de arranque de hooks para `git status` | ~142 ms |
| Mayor payload recalculado `agent + skills` | Tech Lead: 20.351 palabras |
| Validación del template | 26 OK, 2 warnings, 0 errores |

### Payloads relevantes de agentes

| Agente | Agente | Skills eager | Total inicial |
|---|---:|---:|---:|
| Tech Lead | 597 | 19.754 | 20.351 |
| UI | 2.762 | 15.710 | 18.472 |
| Solution Architect | 1.437 | 12.674 | 14.111 |
| ATF Web QA | 10.679 | 0 | 10.679 |
| BA Constructor | 1.870 | 7.037 | 8.907 |
| Producto | 736 | 8.104 | 8.840 |

Estos totales no incluyen las 16.973 palabras globales ni schemas de tools/MCP.

## 4. Hallazgos

### H-01 — El gate de contexto subestima skills inline

`.claude/scripts/lib/sofka-asdd-context-budget-lib.mjs` reconoce únicamente:

```yaml
skills:
  - skill-a
```

No reconoce la forma YAML válida y predominante:

```yaml
skills: [skill-a, skill-b]
```

Por ello, la métrica publicada `largest_agent_with_skills_words=11108` es un
falso mínimo. La corrección de esta medición debe preceder cualquier gate nuevo.

### H-02 — El piso global sigue siendo alto

`CLAUDE.md + .claude/rules/**` suma 16.973 palabras. Las reglas más costosas
son `git-safety`, `orchestration-plan-gate`, `workflow`,
`orchestration`, `routing-heuristics` y `anti-loops`.

El principio de ADR-005 sigue vigente: una rule solo sale del auto-load si su
contenido normativo conserva un lector explícito o queda reducido a un núcleo
always-on con detalle bajo demanda.

### H-03 — Los hooks multiplican procesos por operación

`Bash` ejecuta siete procesos Node y `Write/Edit` ocho. Los hooks vuelven a
parsear stdin y algunos vuelven a resolver Git, estado o specs. Incluso cuando
todos toman el fast path, el costo de procesos se acumula por cada tool call.

### H-04 — Se repite contexto de orquestación por turno

`sofka-asdd-user-prompt-submit.mjs` emite un núcleo ORC de 145 palabras aun
cuando no hay señal especial. En una conversación de veinte turnos agrega
aproximadamente 2.900 palabras repetidas al historial.

### H-05 — Lazy loading parcial

Frontend y backend ya cargan capabilities bajo demanda. Tech Lead, UI,
Solution Architect, Producto, UX y DevOps conservan múltiples skills eager,
aunque una tarea normal consume una fracción de ellas.

### H-06 — Agentes monolíticos y permisos amplios

ATF Web QA contiene 10.679 palabras y declara `tools: all`, a pesar de que ya
existen phase specs en `.claude/atf-web-steps/`. BA Descomponedor contiene
7.537 palabras. Ambos son candidatos a coordinadores delgados con contratos
cargados por fase.

### H-07 — Modelo global sobredimensionado

`.claude/settings.json` usa `claude-opus-4-8` como modelo global, mientras
el lock ya define una estrategia por fase. Routing, síntesis y consultas
triviales no necesitan necesariamente el modelo de mayor costo.

### H-08 — Addons y MCP baseline amplían el footprint

El template registra 24 agentes, 153 skills y 40 commands. ATF API, ATF Web y
Smart Data se distribuyen junto al core. Además, Context7 está activo por
default mediante `npx -y`. La modularización de distribución es valiosa, pero
se separa de este primer alcance para no mezclar runtime con adopción/CLI.

### H-09 — El reconciliador no respeta el ciclo de vida de fases

Al activar el run `2026-07-18-001` en fase Specify, `npm run validate`
reportó `build.index_ref — falta o no existe`. El check
`asdd-run-reconciliation` exige un INDEX de Build aun cuando Analyze todavía
no lo ha producido.

No se creó un INDEX ficticio ni se apuntó `build.index_ref` al brief para
silenciar el error. La corrección debe hacer que el reconciliador se omita antes
de existir un INDEX válido y se vuelva obligatorio desde el cierre de Analyze.

**Resolución B2 (2026-07-18):** corregido mediante un reconciliador compartido
con matriz de fase. Specify/Analyze activo omiten explícitamente sin INDEX;
Analyze completo y fases posteriores lo exigen. Evidencia:
`2026-07-18-001-BUILD-012-runtime-efficiency-b2-phase-reconciliation.md`.

## 5. Prioridad de corrección

### P0 — Medición y overhead mecánico

1. Parsear frontmatter YAML completo.
2. Medir contexto efectivo combinado.
3. Consolidar hooks por evento en un solo proceso.
4. Crear benchmarks repetibles y gates de regresión.
5. Alinear reconciliación y validación con la fase activa.

### P1 — Contexto y razonamiento

1. Reducir rules always-on sin dejar contratos huérfanos.
2. Hacer condicional la inyección ORC.
3. Generalizar lazy skills.
4. Adelgazar coordinadores monolíticos.
5. Aplicar routing de modelos por complejidad.
6. Establecer presupuestos de subagentes y turnos.

### P2 — Distribución

1. Perfiles instalables de capabilities.
2. MCPs opt-in.
3. Generación automática de tablas para evitar drift documental.

## 6. Objetivos provisionales

Estos valores son hipótesis de diseño; un spike debe validarlos antes de
convertirlos en gates bloqueantes.

| Métrica | Base | Objetivo provisional |
|---|---:|---:|
| Contexto always-on | 16.973 palabras | ≤6.000 |
| Inyección normal por prompt | 145 palabras | ≤40 o 0 |
| Procesos PreToolUse por operación | 7–8 | 1 |
| Overhead puntual fast path | ~142 ms | ≤50 ms |
| Skills eager por agente | hasta 13 | 0–1 |
| Tech Lead, agente + skills inicial | 20.351 palabras | ≤8.000 |
| ATF Web coordinador | 10.679 palabras | ≤2.500 |
| Subagentes en TRIVIAL | 0 | 0 |
| Regresiones de routing/seguridad | 0 conocidas | 0 |

## 7. Restricciones de seguridad

- No reducir latencia desactivando guards críticos.
- El dispatcher consolidado debe conservar orden determinista y fail-closed.
- Ninguna cache puede ampliar autorización ni sobrevivir fuera de su scope.
- Ninguna rule puede moverse sin lector explícito y prueba anti-orfandad.
- El lazy loading debe mantener binding entre plan, agente, capability y
  operación.
- Los runs cerrados no se reabren ni se reescriben.

## 8. Evidencia de validación

`npm run validate` produjo:

- 26 checks OK.
- 2 warnings:
  - cinco rules exceden 150 líneas;
  - `CLAUDE.md` tiene 216 líneas frente al presupuesto de 200.
- 0 errores.

Esta captura corresponde al repositorio antes de abrir el nuevo run. Con
`2026-07-18-001` activo en Specify, el mismo comando produce 25 OK, 2 warnings
y 1 error por H-09. Esa diferencia queda preservada como caso de regresión para
la futura corrección.

## 9. Referencias

- `docs/specs/brief-asdd-runtime-hardening.md`
- `docs/specs/2026-07-17-001-ANALYZE-006-asdd-runtime-hardening-index.md`
- `docs/specs/2026-07-17-002-ANALYZE-006-plan-authorization-binding-index.md`
- `docs/adoption/ADR-005-conditional-rule-loading.md`
- `docs/baselines/asdd-runtime-baseline.json`
- `.sofka-asdd/context-budget.json`
