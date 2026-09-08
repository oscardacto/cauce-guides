# ASDD Orchestration — Operaciones

Reglas ORC-002 a ORC-009: selección de agentes, modelo, modo de invocación, síntesis y reglas transversales. Complementa `asdd-orchestration.md`.

## ORC-002: Seleccionar Agentes

La matriz completa fase → agentes vive en `asdd-workflow.md` (WF-001 a WF-006), con primarios y soportes por fase.

Regla de inclusión de soporte: un agente soporte se invoca solo si el prompt contiene una señal clara de su dominio (ver cada WF-xxx para los triggers específicos).

## ORC-002-B: Resolver modelo

Antes de invocar un agente vía el Agent tool, el orquestador resuelve el
modelo que usará ese agente aplicando la cadena de precedencia (mayor a menor):

1. `model_strategy.skill_override["{agente}.{skill}"]` — override por skill activo
2. `model_strategy.agent_pinning["{agente}"]` — pin fijo por agente
3. `model_strategy.phase_default["{fase}"]` — default de la fase ASDD actual (viene de ORC-001)
4. Frontmatter `model:` del agente — fallback si `model_strategy` no existe en el lock

Si `model_strategy` no está presente en `.asdd/asdd.lock`, el
orquestador omite la resolución y el sub-agente usa su frontmatter (compatibilidad
backwards sin cambios de comportamiento).

El modelo resuelto se registra en `.asdd-run.json` bajo `resolved_model` del step
correspondiente (ORC-007).

El orquestador global usa `sonnet` desde `.claude/settings.json`. Un riesgo
`high` o escalamiento explícito resuelve `opus` antes de cualquier tool; Haiku
queda limitado a discovery LIGHT permitido o Document según el default de fase.

## ORC-002-C: Budget bloqueante de subagentes

| Ruta | Agentes / concurrentes | Turnos declarados | Reintentos |
|---|---:|---:|---:|
| TRIVIAL | 0 | — | 0 |
| LIGHT | 1 | 10–20 | 1 |
| MEDIUM | 2 | 20–35 | 1 por agente |
| FULL | 3 | 30–50 | 1 por slice |

La fuente versionada es `.asdd/subagent-budget.json`. Todo challenge
declara `budget_policy_version`, ruta, fase, riesgo, confianza y concurrencia;
cada agente declara modelo lógico, `max_turns`, `retries` y, si escala a Opus,
el motivo. El prompt del Agent incluye el marcador exacto devuelto por la
política. Fan-out, modelo, turnos o retry fuera del rango se rechazan y exigen
plan/challenge nuevo. Los frontmatter tienen cap absoluto de 50 turnos.

Solo se paralelizan scopes/outputs disjuntos cuya duración esperada supera el
cold start. Explorer no se antepone si el agente destino puede resolver el
scope con lecturas acotadas. ATF puede abrir batches posteriores solo con work
items independientes, límite explícito y checkpoint por batch.

## ORC-003: Modo de Invocación

| Modo | Cuándo usarlo |
|---|---|
| **Secuencial (Task)** | Outputs interdependientes (A → B → C), 1-2 agentes, o contexto > 50% |
| **Paralelo (Agent Teams)** | Agentes independientes, velocidad > costo de tokens, contexto libre > 100k |

Regla de decisión rápida: si los outputs se necesitan mutuamente → Secuencial. Si son independientes y hay contexto suficiente → Paralelo. Si hay duda → Secuencial.

## ORC-004: Consultar `asdd-meta` (meta-regla)

Antes de invocar una combinación pesada, el orquestador consulta `asdd-meta` cuando:

| Condición | Acción |
|---|---|
| Contexto > 50% y se planea `asdd-developer-frontend`, `asdd-developer-backend` o `asdd-solution-architect` | Consultar antes de invocar |
| 2+ agentes en paralelo (Agent Teams) | Validar que caben en la ventana |
| Un agente produjo output genérico o ignoró contexto | Pedir diagnóstico |
| Inicio de sesión con trabajo complejo planificado | Health check |

`asdd-meta` responde `[ACCION] recomendación` — el orquestador aplica o descarta; el developer tiene la última palabra.

## ORC-005: Sintetizar Resultado

Una vez los agentes completan su trabajo, el orquestador consolida artefactos, explicita conflictos entre outputs y presenta un resumen unificado al developer. **No interpreta ni modifica** los artefactos — los presenta tal como los produjo cada agente.

Al recibir resultados de `asdd-developer-frontend` o `asdd-developer-backend` que contengan los campos `WORKTREE COMMIT` y `Branch`, aplicar el protocolo de handoff completo antes de declarar la fase Construir como completada: ver **ORC-011** en `asdd-orchestration-worktree.md`.

## ORC-007: Checkpoint y Resume (resiliencia de sesión)

El orquestador mantiene `.asdd-run.json` en la raíz como fuente única de verdad del estado del workflow. Persiste ante `/compact`, `/clear`, errores de API y cierres de sesión. Al retomar, consultar `.asdd-run.json` antes de cualquier acción: si la fase está `complete`, no reinvocar; si `in_progress`, continuar desde el primer paso pendiente.

Detalle operacional completo (write-ahead checkpoint, recovery tras compact/clear, schema del state file): ver `asdd-checkpoint-resume.md`.

## ORC-008: Visibilidad de Agentes (regla de transparencia)

**Regla absoluta**: cada acción visible en la conversación debe identificar quién la ejecuta — el orquestador o un agente. Sin excepción.

### Formato de anuncio de agente

Antes de invocar cualquier agente, el orquestador **anuncia en la conversación** en una línea:

```
→ **@asdd-{nombre}** (model: {modelo}, skill: {skill}) — {qué va a hacer en esta invocación}
```

Incluir **siempre** los campos que apliquen:
- `model:` — **siempre obligatorio**, sin excepción
- `skill:` — cuando el agente tiene un skill activo (cualquier agente, no solo producto/domain-expert)
- `role:` — cuando el agente tiene un sub-rol activo (ej. `role: ba`, `role: po` en producto)
- `scope:` — cuando ORC-001-B inyecta scope restriction por `codebase_size: large`

Ejemplos válidos:
```
→ **@asdd-tech-lead** (model: sonnet, skill: quality-gate) — ejecutando quality gate sobre PR
→ **@asdd-producto** (model: sonnet, skill: funcional, role: ba) — mapeando flujo AS-IS
→ **@asdd-developer-backend** (model: sonnet, scope: src/payments/refund.ts) — corrigiendo cálculo de comisión
→ **@asdd-explorer** (model: haiku) — mapeando estructura del módulo de autenticación
```

**Reglas:**
- Siempre antes de la invocación — nunca después
- Una línea máximo — sin párrafos de introducción
- Al completar, anunciar en una línea: `✓ **@asdd-{nombre}** — {artefacto producido o acción completada}`
- El parámetro `name` del Agent tool **siempre debe coincidir** con el nombre del agente ASDD (ej. `name: "asdd-explorer"`) — garantiza que la UI de Claude Code muestre el nombre correcto

### Formato de anuncio del Orquestador ASDD

Cuando el orquestador ejecuta una acción propia (clasificar, anunciar routing, sintetizar, pedir permiso fallback ORC-000-B), identificarse en la conversación como:

```
→ **Orquestador ASDD** — {qué está haciendo}
```

Ejemplos:
```
→ **Orquestador ASDD** — clasificando request como Tipo 3 (Bug con detalle), ruta LIGHT
→ **Orquestador ASDD** — sintetizando artefactos de las fases Analizar y Diseñar
→ **Orquestador ASDD** — escalamiento LIGHT → FULL detectado por asdd-developer-backend
```

### Prohibición del agente built-in `Explore`

**NUNCA usar `subagent_type: "Explore"`** (agente built-in de Claude Code). Para cualquier tarea de discovery o exploración de codebase, usar **siempre** `subagent_type: "asdd-explorer"` con `name: "asdd-explorer"`. El built-in `Explore` omite las reglas ASDD y muestra un nombre incorrecto en la UI.

Si el scope abarca un módulo, usar el path del paquete: `(scope: src/payments/)`. Si la invocación previa al `asdd-explorer` devolvió varios archivos, listar máximo 3 separados por coma; truncar con `…` si son más.

Para ORC-009 (TDD Forwarding — Strict TDD Mode): ver `asdd-orchestration-tdd.md`. Para ORC-010 (Pre-execution Plan Gate con visibilidad de comandos CLI): ver `asdd-orchestration-plan-gate.md`.

## ORC-006: `asdd-domain-expert` Transversal

`asdd-domain-expert` no está ligado a una fase. El orquestador lo incluye como soporte cuando:

- El prompt contiene términos del dominio del proyecto (póliza, KYC, SKU, FHIR, waypoint, etc.), una regla de negocio puede invalidar una decisión técnica, o el dominio tiene regulaciones que afectan diseño/implementación.

El domain-expert activo depende del overlay configurado al inicializar el proyecto (`fintech`, `insurance`, `retail`, `health`, `logistics`, `education`).
