# ADR-001 — ORC Enforcement: Modelo de 3 Tiers para Orquestación ASDD

**Estado:** Aceptada  
**Fecha:** 2026-06-18  
**Decisor:** Equipo Guide ASDD  

> **Nota de actualización — 2026-08-03 (run `2026-08-03-001`).** El cuerpo de esta ADR conserva
> la decisión histórica tal como se aceptó el 2026-06-18. Lo que se corrigió son **referencias a
> artefactos que cambiaron de lugar** y la descripción de un mecanismo que ya no se cumple:
>
> - El commit `59975b2` (2026-07-17, *"perf(hooks): consolidate session start guards"*) movió los
>   cuatro hooks Tier C de `.claude/hooks/` a `.claude/scripts/legacy-hooks/` y los consolidó en
>   `.claude/hooks/asdd-session-start-dispatcher.mjs`. Las rutas citadas en la tabla de
>   Tier C, en el diagrama de arquitectura y en la sección de validación apuntaban a archivos
>   inexistentes.
> - **`codebase_size` ya no se computa.** El dispatcher solo **retransmite** el override del lock
>   (`project_context.maturity`, dispatcher líneas 19-22) y no implementa la auto-detección 2-de-3
>   que `ORC-001-D` describe y que el hook legacy sí tenía
>   (`legacy-hooks/asdd-codebase-size.mjs`). Con `maturity: null` en el lock, hoy no se emite
>   ninguna línea de `codebase_size`. La afirmación original de que el dispatcher "computa"
>   `codebase_size` era la deriva más grave de esta ADR.
> - El dispatcher **no escribe** `.asdd-run.json`: solo lo lee para emitir el estado ORC-007
>   (dispatcher líneas 31-34).
>
> Cruce que vale registrar: el mismo commit dejó atrás **dos** consumidores de esas rutas — esta
> ADR y la suite `.claude/scripts/test-orc-tier-c-hooks.mjs`, que falla con `0 PASS / 15 FAIL`
> porque `spawnSync` corre sobre rutas inexistentes. Un movimiento de código sin barrido de
> referencias produce a la vez un test roto y documentación falsa; el runner nuevo (`npm test`)
> es lo que ahora haría visible la mitad de test. Detalle en
> `docs/testing/2026-08-03-001-VERIFY-001-preexisting-test-suite-defects.md` §1 y en
> `docs/testing/2026-08-03-001-VERIFY-003-framework-governance-gaps.md`.

## Resumen ejecutivo

Las 24 reglas ORC (Orquestación ASDD) se cumplían por conducta discrecional del modelo — se perdían tras compactación y era imposible demostrar garantías reales al stakeholder. Se propone un **modelo de 3 tiers** que activa las reglas de forma garantizada al inicio de sesión + post-compactación, separando garantías duras (gates mecánicos) de conducta (reminders), y estado computado (inyectado como hecho).

## Contexto

### El problema: discretion, pérdida, no-demostrabilidad

1. **Discreción del modelo**: las 24 ORC viven como instrucciones narrativas en system prompts y reminders. El modelo "sabe" que no debe ejecutar directamente (`ORC-000`), pero puede ignorarlo si interpreta una petición como urgente o simple.
2. **Pérdida tras `/compact`**: cuando Claude Code compacta el contexto, se pierden los reminders inyectados. La siguiente sesión reinicia sin restricciones activas, a menos que se re-inyecten.
3. **No-demostrabilidad**: un stakeholder pregunta "¿es VERDAD que el orquestador nunca ejecuta directamente?". Sin mecanismo duro, solo podés responder "sí, lo instruimos" — no hay **evidencia operacional** de que sea real.
4. **Inconsistencia de enforcement**: ORC-000 tiene más gravedad que ORC-001-B, pero el modelo las trata igualmente como sugerencias. Sin capas de rigor distintas, no hay diferencia entre "politic" y "crítico".

### Consecuencias de la inacción

- Regressions en sesiones largas (post-compactación olvida los ORC).
- Imposibilidad de auditar cumplimiento: "¿obedece la regla ORC-000?" solo se sabe por introspección del modelo, no por evidencia.
- Confianza erosionada en la gobernanza del workflow ASDD: si el guardrail es "sugerencia", no es guardrail.

## Decisión

Implementar **Enforcement ORC mediante un modelo de 3 Tiers**, cada uno con mecanismo distinto, activados al inicio de sesión (`SessionStart`) y mantenidos tras compactación:

### Tier A: Gates Mecánicos (garantía DURA)

**Responsabilidad:** hook `PreToolUse` bloqueante.

| Regla | Hook | Mecanismo | Exit | Escape hatch |
|---|---|---|---|---|
| **ORC-000** | `asdd-orchestrator-guard.mjs` | Deny `Edit`/`Write` tools + Ask `Bash` (excepto git state queries) | `permissionDecision: deny` para Edit/Write | `ASDD_ORCHESTRATOR_GUARD_DISABLE=1` |
| **ORC-010** | `asdd-plan-gate.mjs` | Consume una autorización estructurada de uso único por agente antes de delegar a `Agent`. Sin lote activo → ask; lote existente con mismatch/replay → deny | `permissionDecision: ask` / `deny` | `ASDD_PLAN_GATE_DISABLE=1` |

**Garantía**: El orquestador **nunca puede ejecutar Edit/Write** sin pasar por su propio proceso de toma de decisiones (aunque lo quiera). El plan-gate bloquea delegaciones sin aprobación reciente. **Duro: no es opción.**

**Costo:** El usuario entiende que hay restricciones; las ve operando. Genera fricciones productivas (deben aprobar planes antes de delegar).

### Tier B: Reminders Conductuales (guía ACTIVA)

**Responsabilidad:** hooks `SessionStart` y `UserPromptSubmit` que inyectan checklists y recordatorios en sistema/usuario prompts.

| Regla | Hook | Contenido | Cuándo se inyecta |
|---|---|---|---|
| ORC-001..011 (núcleo: 11 de 24) | `asdd-session-start-dispatcher.mjs` | Checklist completo de las 24 ORC reformateado como lista de verificación | Inicio de sesión + post-compactación |
| ORC-000, 001, 007, 008, 010 (critico) | `asdd-user-prompt-submit.mjs` | Recordatorio enfocado en las reglas más críticas antes de cada action | Antes de cada agente delegado |

**Garantía**: nada "dura" — el modelo puede ignorar los reminders si _quiere_. Pero **están ahí, siempre, sin que lo pida**, refrescándose tras compactación.

**Costo:** contextual (añade 200-300 tokens por sesión), pero refuerza concientización. El modelo "ve" la regla en cada prompt.

### Tier C: Estado Computado (inyectado como HECHO)

**Responsabilidad:** hooks `SessionStart` dedicados que pre-computan estado, lo validan una sola vez por sesión y lo inyectan como "hecho establecido", no como instrucción.

| Dato | Hook vigente ¹ | Cuándo se computa | Consumidor | Beneficio |
|---|---|---|---|---|
| `codebase_size` (small \| large) | `asdd-session-start-dispatcher.mjs:19-22` | **No se computa.** Solo retransmite `project_context.maturity` del lock; con `maturity: null` no emite ninguna línea | ORC-001-B / ORC-001-D (routing LIGHT vs FULL) | **No se obtiene hoy.** La detección 2-de-3 quedó en `.claude/scripts/legacy-hooks/asdd-codebase-size.mjs`, que no está registrado como hook |
| `model_strategy` (por agente/skill/fase) | `asdd-session-start-dispatcher.mjs:23-26` | Inicio de sesión (una vez), leído de `model_strategy.phase_default` del lock | ORC-002-B (resolución de modelo) | Asignación de modelos automática, sin negociación |
| `strict_tdd` (true \| false) | `asdd-session-start-dispatcher.mjs:27-30` | Inicio de sesión (una vez), leído de `.asdd/testing-capabilities.yaml` | ORC-009 (forwarding a developer/qa) | El estado TDD se comunica sin ambigüedad; no hay "adivinar" |
| `freshness` de `.asdd-run.json` | `asdd-session-start-dispatcher.mjs:31-34` | Inicio de sesión y post-compactación — **lectura, nunca escritura** | ORC-007 (resume de fase anterior) | No se pierde progreso; sesiones largas se resumen sin perder artefactos |

> ¹ **Corrección de referencias — 2026-08-03.** La tabla original citaba cuatro hooks
> independientes bajo `.claude/hooks/`: `asdd-codebase-size.mjs`,
> `asdd-model-strategy.mjs`, `asdd-tdd-state.mjs` y `asdd-state-freshness.mjs`.
> El commit `59975b2` (2026-07-17) los movió a `.claude/scripts/legacy-hooks/` —donde los archivos
> siguen existiendo pero **ya no están registrados en `settings.json`**— y consolidó su salida en
> el dispatcher único. Las rutas originales apuntan hoy a archivos inexistentes y los cuatro
> archivos legacy son código sin consumidor en runtime.

**Garantía**: `model_strategy`, `strict_tdd` y `freshness` se inyectan con certeza. **`codebase_size` ya no.** La afirmación original —"el orquestador NO decide «asumo codebase_size = small»; pre-computa y lo sabe"— dejó de ser cierta con `59975b2`: sin override explícito en el lock no hay dato inyectado, y `ORC-001-D` debe caer en su propia cadena de fallback (override del lock → cache del run → detección → FULL conservador).

**Costo:** negligible (cada hook corre una sola vez por sesión; resultados se cacheán).

---

## Arquitectura de enforcement

```
SessionStart (INICIO DE SESIÓN)
  ├─ Hook: asdd-session-start-dispatcher.mjs (Tier B + C)
  │  ├─ Inyecta sistema prompt: recordatorio del núcleo de ejecución ORC
  │  ├─ LEE del lock: model_strategy.phase_default, project_context.maturity
  │  ├─ LEE testing-capabilities.yaml: strict_tdd
  │  ├─ LEE `.asdd-run.json` para emitir el estado ORC-007  ← NO lo escribe (corr. 2026-08-03)
  │  └─ codebase_size: solo si el lock trae override; sin detección 2-de-3
  └─ Resultado: modelo recibe checklist ORC + estado leído del lock y del disco

PreToolUse (ANTES DE CADA TOOL CALL)
  ├─ Hook: asdd-orchestrator-guard.mjs (Tier A)
  │  └─ Intercept Edit/Write → deny; Bash → ask (excepto git queries)
  ├─ Hook: asdd-plan-gate.mjs (Tier A)
  │  └─ Intercept Agent → ask si hay marcador `.plan-approved` válido
  └─ Resultado: restricciones duras ejecutadas antes de cualquier acción

UserPromptSubmit (ANTES DE PROCESAR PROMPT DEL USUARIO)
  ├─ Hook: asdd-user-prompt-submit.mjs (Tier B)
  │  └─ Inyecta recordatorio de reglas críticas (ORC-000, 001, 007, 008, 010)
  └─ Resultado: modelo procesa el prompt con contexto ORC fresco

Post-compactación (si el usuario ejecuta `/compact`)
  └─ SessionStart se re-ejecuta automáticamente
     └─ Se re-inyectan reminder + estado: nada se pierde
```

---

## Alternativas consideradas y descartadas

### Alt-1: `deny` global en orchestrator-guard (TOT deny, no preguntar)

**Descartado:**
- Rompe ORC-011 (el orquestador **necesita** `git merge --no-ff` / `git status` para sincronizar worktrees).
- No hay "allow-list" de qué Bash commands sí son legítimos → impide git, break tooling.
- Genera falsos positivos constantes ("no puedo ni compilar porque deny Bash").
- Solución frágil: cualquier cambio futuro en ORC-011 requiere re-hacer el deny global.

**Decisión:** keep "ask" en Bash para permitir git-state queries legítimas. El muro duro vive en Edit/Write (esos nunca son "necesarios para el orquestador").

### Alt-2: Plan-gate con `deny` global (ORC-010 bloqueante)

**Descartado:**
- Un "plan" que el orquestador quiere delegar sin aprobación previa sería bloqueado permanentemente.
- No hay mecanismo de "bypass rápido" para tareas urgentes o obvias (ej: fast-path de un feature trivial).
- Aumenta fricción al punto de volverse antiproductivo — cada delegación requeriría aprobación explícita del usuario.

**Decisión:** keep "ask" con TTL (15 min / 900s, configurable). Da ventana para operaciones rápidas sin bloquear cada decisión.

### Alt-3: Hook monolítico gigante en SessionStart

**Descartado:**
- Viola SRP (Single Responsibility Principle). Un hook que computa codebase + modelo + tdd + state es difícil de mantener y testear.
- Si uno de los cómputos falla, todo SessionStart se quiebra (acoplamiento fuerte).
- Complejidad cognitiva alta para futuros cambios.

**Decisión:** hooks chicos por responsabilidad (codebase-size, model-strategy, tdd-state, state-freshness). Cada uno independiente, testeable, reemplazable.

> **Corrección 2026-08-03 — esta alternativa se revirtió en la práctica.** El commit `59975b2`
> (*"perf(hooks): consolidate session start guards"*) adoptó exactamente la Alt-3 descartada aquí:
> los cuatro hooks Tier C más `asdd-session-start.mjs` se consolidaron en el dispatcher
> único `.claude/hooks/asdd-session-start-dispatcher.mjs`, por costo de arranque (cinco
> procesos Node por `SessionStart`). Los archivos originales quedaron en
> `.claude/scripts/legacy-hooks/`. La consecuencia predicha se materializó: al consolidar se
> perdió la detección 2-de-3 de `codebase_size` que el hook legacy sí implementaba, y ni la
> reversión ni la pérdida se registraron en un ADR nuevo. Esta ADR conserva la decisión histórica;
> la reversión no está formalizada y es deuda de ADR abierta (CORE-005).

### Alt-4: Auto-compactación por umbral de contexto

**Descartado:**
- El harness de Claude Code NO dispara hooks PreCompact ni post-compactación con contexto (validado en la codebase).
- El % de contexto no está disponible en inputs de hooks (PreToolUse, UserPromptSubmit) — solo en statusline.
- Mitigación: statusline visible + reminders en cada prompt suplanten el auto-compactación. El usuario **elige** compactar cuando ve el %.

**Decisión:** statusline visible (Tarea 1) + reminders Tier B hacen que el usuario sea consciente y _vea_ cuándo compactar.

---

## Consecuencias

### Positivas ✅

1. **ORC-000 demostrable**: Un stakeholder puede ejecutar una sesión, intentar Edit/Write y ver el deny en tiempo real. Es **evidente operacionalmente**, no solo escrito.
2. **Resiliencia a compactación**: Los ORC no se olvidan tras `/compact`; SessionStart re-inyecta el estado.
3. **Capas de rigor diferenciadas**: ORC-000 (duro, Tier A) se distingue de ORC-001-B (sugerencia, Tier B), reflejando gravedad real.
4. **Trazabilidad de estado**: `.asdd-run.json` registra el progreso de fases y artefactos del run — auditable.
   - **Corrección 2026-08-03:** el dispatcher **no escribe** `.asdd-run.json`; solo lo lee (líneas 31-34). Y `codebase_size` no se detecta, así que no queda registrado por esta vía: `ORC-001-D` prevé cachearlo en el run, pero quien lo escribe es el orquestador, no un hook Tier C.
5. **Escalable**: Agregar un nuevo ORC es trivial (agregar línea al reminder Tier B) o dar más rigor (agregar hook Tier A).

### Limitaciones honestas ⚠️

1. **Tier B es model-discretion**: Los reminders pueden ignorarse si el modelo decide (e.g., interpreta una petición del usuario como override). **No es garantía 100%.**
   - **Mitigación:** Tier A duro bloquea las peores violaciones (Edit/Write, plan sin aprobación). Tier B refuerza conducta, no la impone.
2. **Plan-gate ask + TTL**: Un usuario aprueba un plan, pero luego la sesión se queda abierta 15 min y la autorización expira.
   - **Mitigation:** La aprobación abre una ventana nueva de TTL en vez de heredar el remanente del challenge (ADR-020), así deliberar no descuenta tiempo de ejecución. Escape-hatch por env var para operaciones urgentes.
3. **Strict TDD no está garantizado por mecanismo**: ORC-009 inyecta instrucción `STRICT TDD MODE ACTIVO` en el prompt, pero el modelo podría ignorarlo. El ciclo `RED → GREEN → TRIANGULATE → REFACTOR` depende de conducta.
   - **Mitigation:** El comando de tests sigue siendo obligatorio (`.asdd/testing-capabilities.yaml`). Si los tests fallan, el dev verá el reporte y debe arreglar.

---

## Validación

### Cómo se valida que la decisión se cumple

1. **Tier A**: ejecutar `git checkout -b test/orc-enforcement` y intentar `Write` en el orquestador → debe denegar con `permissionDecision: deny`.
2. **Tier B**: iniciar una sesión nueva, revisar que aparece un recordatorio de ORC en el primer prompt del sistema.
3. **Tier C**: iniciar una sesión nueva y verificar que el dispatcher emite las líneas de estado
   que correspondan al lock (`## ORC-002-B — modelos: …`, `## ORC-009 — STRICT TDD MODE ACTIVO`,
   `## ORC-007 — run …`).
   - **Corrección 2026-08-03:** el criterio original —"registrar el `codebase_size` detectado en
     `.asdd-run.json` y reproducirlo en otra sesión"— **no es ejecutable**. El dispatcher no detecta
     `codebase_size` ni escribe `.asdd-run.json`; con `project_context.maturity: null` en el lock no
     emite ninguna línea de `codebase_size`. Para validarlo hoy hay que fijar el override en el lock
     y comprobar que aparece `## ORC-001-D — codebase_size: {maturity} (lock override)`.

### Impacto en la gobernanza de WI #3607

- El `orchestrator-guard.mjs` con deny/ask + los 5 hooks (plan-gate, codebase-size, model-strategy, tdd-state, state-freshness) **demuestran el enforcement de ORC operacionalmente**.
  - **Corrección 2026-08-03:** la superficie vigente son `.claude/hooks/asdd-orchestrator-guard.mjs`, `.claude/hooks/asdd-plan-gate.mjs` y `.claude/hooks/asdd-session-start-dispatcher.mjs`. Los cuatro Tier C ya no son hooks: viven en `.claude/scripts/legacy-hooks/` sin registro en `settings.json`.
- Documentación (este ADR + `.claude/docs/adoption/statusline.md` + fix de `orchestration-index.md`) **comunica la estrategia** a stakeholders y futuros maintainers.
- `.asdd/asdd.lock` actualizado con conteos reales de hooks **declara el estado de implementación en código**.

---

## Decisión aprobada

El modelo de 3 Tiers se implementa como se describe en "Decisión" y "Arquitectura de enforcement" arriba. Los hooks Tier A y el dispatcher Tier B+C están en `.claude/hooks/` con documentación en `.claude/rules/asdd-orchestration-*.md`. El orquestador y los sub-agentes aplican las reglas respetando esta arquitectura.

> **Corrección 2026-08-03.** La frase original —"todos los hooks Tier A/B/C están en
> `.claude/hooks/`"— dejó de ser cierta con `59975b2`: los cuatro hooks Tier C están en
> `.claude/scripts/legacy-hooks/` y su salida la produce el dispatcher consolidado.

**Siguiente paso**: Mantener este ADR actualizado si futuros WI añaden nuevos ORC o ajustan los mecanismos de enforcement.
