# Convención de Nomenclatura — ASDD Sofka

Guía oficial para nombrar agentes, skills, commands, hooks y rules en
proyectos ASDD. Versión: template `2.0.0`.

## 1. Por qué importa

Un proyecto Claude Code mezcla tres fuentes de configuración agéntica:

1. El **template ASDD Sofka** (agentes base como `architect`, skills como `adr`).
2. El **proyecto consumidor** (agentes/skills propios del dominio).
3. **Plugins externos** del marketplace de Claude Code.

Sin convención, estos tres espacios colisionan: un agente `security` del
template se mezcla con uno `security` de un plugin, y el orquestador no sabe
cuál invocar. La convención de v2.0 resuelve esto con **3 namespaces
disjuntos**, enforzados por el validador.

### Beneficios

- **Observabilidad** — ver un nombre y saber de inmediato su origen.
- **Sin colisiones** — plugins e integraciones no pisan artefactos del template.
- **Auditabilidad en CI** — el check 14 rechaza artefactos sin prefijo.
- **Portabilidad** — un proyecto puede instalar plugins nuevos sin miedo.

## 2. Los 3 namespaces

| Namespace | Prefijo | Quién lo crea | Ejemplo |
|---|---|---|---|
| Template ASDD | `sofka-asdd-` | COE Sofka | `sofka-asdd-solution-architect` |
| Proyecto consumidor | `{project.name}-` | Dev del proyecto | `checkout-backend-fraud-detector` |
| Plugins externos | propio del plugin | Equipo del proyecto | `security-guidance:owasp-review` |

El `project.name` sale de `.sofka-asdd/sofka-asdd.lock → project.name` y debe
cumplir la regex `^[a-z][a-z0-9-]{1,30}$`.

## 3. Convenciones por tipo de artefacto

### 3.1 Agentes

**Patrón del template:** `sofka-asdd-{role}`
**Patrón del proyecto:** `{project.name}-{role}`

Buenos:

- `sofka-asdd-solution-architect` (del template)
- `sofka-asdd-meta` (del template, ex `asdd-expert`)
- `checkout-backend-fraud-detector` (del proyecto)
- `insurance-portal-regulation-checker` (del proyecto)

Malos:

- `architect` → falta prefijo, colisiona con plugins
- `CheckoutFraudDetector` → no es kebab-case (Claude Code espera kebab-case)
- `agent_v2` → el nombre no indica origen ni responsabilidad

### 3.2 Skills

**Patrón del template:** `sofka-asdd-{agent-role}-{skill-name}`
**Patrón del proyecto:** `{project.name}-{agent-role-or-domain}-{skill-name}`

Buenos:

- `sofka-asdd-solution-architect-adr` — skill del template para ADRs
- `sofka-asdd-developer-unit-test` — skill del template para unit tests
- `checkout-backend-payment-idempotency-check` — skill del proyecto
- `checkout-backend-developer-pci-validator` — skill del proyecto que
  extiende al `sofka-asdd-developer-backend`

Malos:

- `architect-adr` → falta prefijo, colisiona con plugins
- `CheckoutBackendPaymentCheck` → no es kebab-case
- `payment-processor` → ambiguo, ¿del template o del proyecto?

### 3.3 Commands

**Patrón del template:** `/sofka-asdd:{action}` (archivo en `.claude/commands/sofka-asdd/{action}.md`)
**Patrón del proyecto:** `/{project.name}:{action}` (archivo en `.claude/commands/{project.name}/{action}.md`)

Buenos:

- `/sofka-asdd:specify` (fase Especificar del template)
- `/sofka-asdd:design` (fase Diseñar)
- `/checkout-backend:deploy` (acción propia del proyecto)
- `/insurance-portal:regulatory-audit` (acción propia)

Malos:

- `/project:specify` → namespace genérico, reemplazado en v2.0
- `/specify` → sin namespace, colisiona con plugins
- `/checkout-backend-deploy` → falta separador `:` entre namespace y acción

### 3.4 Hooks

**Patrón del template:** `sofka-asdd-{lifecycle}-{purpose}.mjs`
**Patrón del proyecto:** `{project.name}-{lifecycle}-{purpose}.mjs`

Buenos:

- `sofka-asdd-pre-tool-use-dangerous-bash.mjs` (bloquea bash destructivos)
- `sofka-asdd-pre-tool-use-spec-check.mjs` (spec guard)
- `checkout-backend-pre-tool-use-pci-check.mjs` (valida PCI compliance antes de Write/Edit)
- `insurance-portal-post-tool-use-audit-log.mjs` (log de cambios para auditoría)

Malos:

- `pre-tool-use-check.mjs` → falta prefijo, genérico
- `my-hook.mjs` → nombre no indica lifecycle ni propósito
- `hook.js` → extensión equivocada (debe ser `.mjs` para ES modules)

### 3.5 Rules

**Patrón del template:** `sofka-asdd-{topic}.md`
**Patrón del proyecto:** `{project.name}-{topic}.md`

Buenos:

- `sofka-asdd-orchestration.md` (reglas del orquestador)
- `sofka-asdd-workflow.md` (6 fases ASDD)
- `checkout-backend-pci-compliance.md` (reglas PCI del proyecto)
- `insurance-portal-regulatory.md` (reglas regulatorias propias)

Malos:

- `orchestration.md` → falta prefijo
- `rules.md` → genérico, no indica dominio ni origen

> **Hogar de las rules (ADR-005):** las rules **universales** (git-safety, anti-loops, data-boundary, etc.) y de **orquestación** (orchestration*, workflow*, routing*) viven en `.claude/rules/` — **auto-cargadas** en cada sesión y heredadas por los sub-agentes. Las rules de **dominio** (específicas de un pipeline, ej. ATF Web, Smart Data) viven en `.claude/reference/{domain}/` — un directorio **no auto-cargado** — y los agentes de ese dominio las leen por path explícito cuando la fase lo requiere. El naming (`sofka-asdd-{topic}.md`) es idéntico en ambos casos; solo cambia el directorio. Ver `docs/adoption/ADR-005-conditional-rule-loading.md`.

### 3.6 Memory files

**Patrón:** `{slug}.md` en `.claude/memory/` — sin prefijo obligatorio.

Los memory files son propiedad del usuario activo (no del template ni del
proyecto). Claude Code los carga desde `ASDD-MEMORY.md` como índice. El check 14
no los valida.

Buenos:

- `.claude/memory/user-role.md`
- `.claude/memory/project-scope.md`
- `.claude/memory/feedback-testing.md`

### 3.7 Artefactos de documentación

Los artefactos de documentación del ciclo ASDD se dividen en dos categorías
según si su ciclo de vida es por-run o durable.

#### 3.7.1 Artefactos generados por agentes (naming run-trazable universal)

Patrón: **`{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`**

| Componente | Valor | Ejemplo |
|---|---|---|
| `run_id` | ID del run activo en `.asdd-run.json` (formato `YYYY-MM-DD-NNN`) | `2026-06-18-001` |
| `PHASE` | Fase del schema en MAYÚSCULA (`SPECIFY`, `ANALYZE`, `DESIGN`, `BUILD`, `VERIFY`, `DOCUMENT`) | `DESIGN` |
| `SEQ` | Contador monotónico `artifact_seq` del run state, 3 dígitos con cero-padding | `003` |
| `slug` | Descripción breve en kebab-case; puede conservar semver con puntos cuando el contrato de dominio lo exige | `naming-run-trazable`, `contract-gold-1.0.0` |

Ejemplos: `2026-06-18-001-DESIGN-003-adr-001-routing.md` y
`2026-06-18-001-DESIGN-004-c4-contexto.puml`.

**Artefactos de run (CON prefijo):**

| Tipo | Directorio | Slug de referencia |
|---|---|---|
| Spec de feature | `docs/specs/` | `{slug-del-feature}` |
| Gap analysis | `docs/specs/` | `gaps-{slug-del-feature}` |
| TDD evidence | `docs/testing/` | `tdd-evidence-{slug-del-feature}` |
| TDD audit | `docs/qa/` | `tdd-audit-{slug-del-feature}` |
| Security review | `docs/security/` | `security-review-{slug-del-feature}` |
| Tech traceability | `docs/tech/` | `traceability-{slug-del-feature}` |
| Diagramas C4/component | `docs/architecture/diagrams/` | `c4-{nivel}-{slug}` |
| Contratos API | `docs/architecture/contracts/` | `contract-{servicio}` |
| Bounded context | `docs/architecture/` | `bounded-context-{slug}` |
| Tradeoff / discovery | `docs/architecture/` | `tradeoff-{slug}` / `discovery-{slug}` |
| UX flows / problem-statement | `docs/design/` | `ux-flow-{slug}` / `problem-statement-{slug}` |
| Narrativas UX / design-audit | `docs/design/` | `narrative-{slug}` / `design-audit-{slug}` |
| Spike / benchmark / comparison | `docs/architecture/` | `spike-{slug}` / `benchmark-{slug}` |
| Cloud design | `docs/architecture/` | `cloud-design-{slug}` |
| HU / plan-HU | `docs/specs/` | `hu-{slug}` / `plan-hu-{slug}` |
| Brief | `docs/specs/` | `brief-{slug-proyecto}` |
| ADR | `docs/architecture/decisions/` | `adr-{NNN}-{slug}` |
| Manifest de run | `docs/runs/` | `run-manifest` (SEQ `000`, reservado por bootstrap) |
| ATF / Smart Data / documentación técnica | Su carpeta semántica bajo `docs/` | slug del artefacto |

**Reglas:**

- **D1 — Carpetas semánticas**: el prefijo da trazabilidad-por-run; la carpeta da tipo.
  Los artefactos siguen viviendo en sus carpetas semánticas habituales
  (`docs/specs/`, `docs/tech/`, etc.). El prefijo `{run_id}-{PHASE}-{SEQ}-`
  no reemplaza la carpeta — la complementa.
- **D2 — SEQ derivado, nunca manual**: el `SEQ` se deriva del campo
  `artifact_seq` del run state (`.asdd-run.json`). El helper
  `.claude/scripts/sofka-asdd-artifact-name.mjs` es la **única forma
  correcta** de obtener el nombre; los skills lo invocan, nunca estampan a mano.
- **D3 — PHASE de la lista del schema**: usar solo los tokens definidos en
  `.sofka-asdd/asdd-run.schema.json → phases` (`specify`, `analyze`, `design`,
  `build`, `verify`, `document`), en MAYÚSCULA. No inventar tokens nuevos.
- **D4 — Reserva antes del plan**: el orquestador deriva cada nombre antes de
  emitir ORC-010-A e incluye la ruta exacta en `scope[]` y en el prompt. Para
  artefactos posteriores al brief usa:
  ```bash
  ARTIFACT_NAME=$(node .claude/scripts/sofka-asdd-artifact-name.mjs \
    --phase {fase} --slug {slug})
  ```
  y usa `$ARTIFACT_NAME` para construir el scope exacto. El agente recibe la
  ruta ya resuelta y no recalcula el nombre. NUNCA estampar el patrón a mano.

**Cobertura universal (D5):**

- Todo archivo **nuevo** generado por agentes bajo `docs/**` lleva el patrón,
  sin excepciones por tipo, carpeta o extensión. Incluye brief, specs, ADRs,
  diagramas, planes, reportes, evidencia, ATF, Smart Data y manifest.
- La única exclusión funcional es código/configuración de implementación fuera
  de `docs/**` (`src/`, tests de código, IaC, scripts, etc.).
- Los archivos históricos existentes no se renombran; la política aplica en el
  momento de crear un archivo nuevo.
- **Efímeros** (`.tmp/`) no se nombran ni se registran en el manifest del run.

**Nota de consolidación (D6):** este patrón **supera** el sufijo `{NNN}` por-tipo
de #3574 (para artefactos de run; ADR conserva su NNN propio) y **absorbe**
la necesidad de fecha de #3595 (la fecha ya viene en `run_id`).
Migración: aplica a artefactos **nuevos**; no renombrar artefactos existentes.
El identificador durable de tipo (por ejemplo `adr-001`) vive dentro del slug.

#### 3.7.2 Legado durable (solo lectura/migración)

Artefactos cuyo ciclo de vida trasciende un run individual, o artefactos
**existentes** creados antes de la adopción del naming run-trazable que **no
se renombran** (D6):

| Tipo | Directorio | Patrón | Nota |
|---|---|---|---|
| **Brief** | `docs/specs/` | `brief-{proyecto}.md` | Solo archivo histórico pre-política. |
| **ADR** | `docs/architecture/decisions/` | `ADR-{NNN}-{titulo}.md` | Solo archivo histórico; ADR nuevo lleva identidad dentro del slug universal. |
| **ATF API** | `docs/testing/atf/{run_id}/` | estructura propia ATF | Solo legado; archivo ATF nuevo usa prefijo universal. |
| Artefactos legado | `docs/specs/`, `docs/testing/`, etc. | `{tipo}-{feature}-{NNN}.md` | Patrón pre-existente. Los artefactos existentes con sufijo NNN NO se renombran (D6). El check 19 los acepta como nombres legado válidos. |

Los patrones de la tabla se aceptan únicamente para archivos existentes. No son
fallbacks válidos para una creación nueva. Si no hay run activo, primero se
ejecuta el bootstrap; no se crea `brief-{proyecto}.md`, `ADR-{NNN}.md` ni otro
nombre durable clásico.

**ADR**: el NNN sigue siendo parte de la identidad, pero para ADRs nuevos vive
en el slug: `{run_id}-DESIGN-{SEQ}-adr-{NNN}-{titulo}.md`.

**Artefactos legado y migración**: el check 19 del validador acepta tanto el
patrón legado (`{tipo}-{feature}-{NNN}`, sufijo `-NNN`) como el patrón nuevo
(prefijo run `{run_id}-{PHASE}-{SEQ}-{slug}`) para no romper migraciones. Los
artefactos existentes no se renombran; los nuevos deben usar §3.7.1 en toda
carpeta bajo `docs/**`.

## 4. Extender agentes del template con skills del proyecto

Escenario común: **"Quiero agregar un skill al `sofka-asdd-developer-backend` que
valide idempotencia en mis endpoints de pago".**

Pasos concretos:

1. Crear el skill en la ubicación convencional:

   ```bash
   mkdir -p .claude/skills/checkout-backend-developer-idempotency
   touch .claude/skills/checkout-backend-developer-idempotency/SKILL.md
   ```

2. Agregar frontmatter válido:

   ```yaml
   ---
   name: checkout-backend-developer-idempotency
   description: Valida idempotencia en endpoints POST de pagos. Usa como criterio que toda transacción repetida con el mismo idempotency-key retorne el mismo resultado sin efectos secundarios.
   ---

   # Checklist de idempotencia

   ## Qué validar

   1. ...
   ```

3. Editar `.claude/agents/sofka-asdd-developer-backend.md` (o `sofka-asdd-developer-frontend.md` según corresponda) y agregar el skill al
   array `skills:`:

   ```diff
   - skills: [sofka-asdd-developer-feature, sofka-asdd-developer-unit-test, sofka-asdd-developer-integration-test, sofka-asdd-developer-refactoring-execute]
   + skills: [sofka-asdd-developer-feature, sofka-asdd-developer-unit-test, sofka-asdd-developer-integration-test, sofka-asdd-developer-refactoring-execute, checkout-backend-developer-idempotency]
   ```

4. Validar:

   ```bash
   node .claude/scripts/validate-template.mjs
   # Expected: 14 ok, 0 warn, 0 error
   ```

   El check 14 acepta el skill porque empieza con `{project.name}-`
   (`checkout-backend-`). El check 4 resuelve la referencia al encontrar
   `.claude/skills/checkout-backend-developer-idempotency/SKILL.md`.

## 5. Cuándo crear agente propio vs extender agente del template

| Situación | Recomendación |
|---|---|
| Necesito un rol nuevo no cubierto por los 11 del template | Agente propio `{project.name}-{role}` |
| Necesito capacidad adicional de un rol existente | Skill propio `{project.name}-{role}-{skill}` |
| Necesito auditar un aspecto específico del dominio | Agente propio |
| Necesito flujo diferente al ASDD estándar | Command propio `/{project.name}:{phase}` |
| Necesito protección transversal | Hook propio `{project.name}-{lifecycle}-{purpose}.mjs` |
| Quiero cambiar cómo funciona `sofka-asdd-solution-architect` | **NO** override — crear agente nuevo `{project.name}-architect-{variant}` |
| Necesito reglas de negocio estables | Rule propia `{project.name}-{topic}.md` |

Principio general: **extender es más barato que duplicar**. Si el problema
se resuelve con un skill adicional, preferir skill sobre agente nuevo.
Un skill cuesta ~100 tokens siempre cargados (description) + body bajo demanda;
un agente cuesta frontmatter + system prompt en cada invocación.

## 6. Restricciones técnicas

- **`project.name` regex**: `^[a-z][a-z0-9-]{1,30}$`
  - Solo minúsculas, números, guiones
  - Empieza con letra
  - Entre 2 y 31 caracteres
  - Prefijo final: `{project.name}-` (agrega el guión)
- **Todos los nombres en kebab-case** (oficial Claude Code — ver docs de
  subagentes y skills).
- **Longitud máxima práctica**: 50 chars para un nombre completo. Más largo y
  la invocación `@nombre-muy-largo-con-muchos-componentes` se vuelve incómoda.
- **IDs internos** (CORE-001..008, ORC-000..006, WF-001..006) **no se
  prefijan** — son identificadores semánticos de reglas, no artefactos
  referenciables por Claude Code.
- **Un guión entre componentes**, nunca dos:
  `sofka-asdd-solution-architect-adr` sí, `sofka--asdd--architect` no.

## 7. Excepciones — qué NO se prefija

- **MCPs externos**: Context7, Figma, Azure, Sentry, etc. Mantienen su
  nombre oficial. Se declaran en `.mcp.json` con `mcpServers: {context7: ...}`.
- **Archivos estándar Claude Code**: `settings.json`, `CLAUDE.md`,
  `ASDD-MEMORY.md`, `.mcp.json` — nombres fijados por Claude Code.
- **Memory files** (`.claude/memory/*.md`) — pertenecen al usuario.
- **Plugins del marketplace**: siguen su propio namespace (generalmente
  `{plugin-name}:{action}`).
- **IDs internos** de reglas (CORE/ORC/WF) — no son artefactos de filesystem.

## 8. Cheat sheet

```
┌────────────────────────────────────────────────────────┐
│ NAMESPACE RULES (v2.0)                                 │
├────────────────────────────────────────────────────────┤
│ Template:   sofka-asdd-{kind}                          │
│ Proyecto:   {project.name}-{kind}                      │
│ Command:    /{namespace}:{action}                      │
│ Extensión:  {project.name}-{template-role}-{skill}     │
│ Plugin:     {propio del plugin}                        │
└────────────────────────────────────────────────────────┘

Ejemplos lado a lado:
  sofka-asdd-solution-architect         vs  checkout-backend-fraud-detector
  sofka-asdd-solution-architect-adr     vs  checkout-backend-architect-adr (ext)
  /sofka-asdd:specify          vs  /checkout-backend:deploy
  sofka-asdd-orchestration.md  vs  checkout-backend-pci-compliance.md
```

## 9. FAQ

**¿Qué pasa si renombro mi proyecto?**
Tenés que renombrar todos los artefactos propios del proyecto con el nuevo
prefijo. Es una migración interna — conviene hacerlo con un script sed similar
al de `.claude/docs/migrations/1-to-2.md`. Los artefactos del template no se tocan.

**¿Puedo tener artefactos sin prefijo?**
No. El check 14 del validador es **strict** — rechaza cualquier artefacto
en `.claude/{agents,skills,commands,hooks,rules}/` que no tenga prefijo
válido (`sofka-asdd-` o `{project.name}-`). Memory files quedan exentos.

**¿Qué pasa si `project.name` tiene espacios o mayúsculas?**
El check 14 rechaza primero la regex. Corregir en `.sofka-asdd/sofka-asdd.lock`
para cumplir `^[a-z][a-z0-9-]{1,30}$` y volver a correr.

**¿Se pueden instalar 2 plugins con nombres parecidos?**
Sí, cada plugin tiene su propio namespace (`{plugin-name}:{action}`). Si
dos plugins colisionan, es problema del marketplace, no de tu proyecto.

**¿Cómo sé si un agente viene del template o del proyecto?**
Mirá el prefijo: `sofka-asdd-` → template, `{project.name}-` → proyecto.
Si hay duda, `grep -rn "^name:" .claude/agents/` muestra todos.

**¿Puedo override un agente del template?**
No directamente. Hay dos opciones: (a) crear un agente nuevo con un nombre
distinto (`{project.name}-architect-v2`) y usarlo en vez del base; (b) pedir
al COE una mejora del template (PR al repo `project-structure`).

**¿Qué pasa si adopto el template en un monorepo?**
Cada subproyecto declara su propio `project.name` en su `.sofka-asdd/`. Los
artefactos propios de cada subproyecto llevan ese prefijo. Los artefactos
del template viven típicamente en la raíz del monorepo con prefijo
`sofka-asdd-`.

**¿Puedo importar agentes de otros proyectos Sofka?**
Si los agentes tienen prefijo `{other-project.name}-`, sí — copiarlos tal
cual. Pero recomendación: **no hagas eso**. Si un agente vale la pena
compartir, proponé incorporarlo al template (`sofka-asdd-*`).

**¿El validador rechaza artefactos sin prefijo?**
Sí. Check 14 `naming-convention` es `strict`: si hay un agente, skill,
command, hook o rule sin prefijo válido, el validador sale con exit 1.

**¿Qué pasa si necesito un nombre sin prefijo por integración externa?**
Documentarlo en `docs/audit/.exceptions.md` del proyecto con razón y
vigencia. El check 14 no tiene mecanismo de bypass — habría que ajustarlo
si la excepción es permanente. Discutir en revisión de COE antes de hacerlo.

## 10. Tutorial — crear tu primer agente personalizado

Supongamos que `checkout-backend` quiere un agente `fraud-detector` que
detecte patrones fraudulentos en transacciones de pago.

### Paso 1 — Crear el archivo

```bash
mkdir -p .claude/agents
touch .claude/agents/checkout-backend-fraud-detector.md
```

### Paso 2 — Frontmatter

```yaml
---
name: checkout-backend-fraud-detector
description: Detecta patrones fraudulentos en transacciones de pago usando reglas de negocio propias de checkout-backend. Invocar en fase Verificar ante transacciones sospechosas o cambios en la lógica de autorización.
model: claude-sonnet-4-6
tools: [Read, Grep, Glob]
maxTurns: 50
effort: medium
---

Agente especializado en detección de fraude en transacciones.
...
```

### Paso 3 — System prompt del agente

Breve (~80-150 líneas):

```markdown
## Responsabilidades

- Analizar logs de transacciones en busca de patrones sospechosos
- Validar que las reglas de autorización cumplen políticas PCI-DSS
- ...

## Metodología

### Fase 1 — Recolección
1. Listar transacciones del período bajo análisis
2. ...

### Fase 2 — Análisis
...

## Definition of Done

- [ ] Reporte de patrones detectados en `docs/security/fraud-analysis/`
- [ ] Recomendaciones priorizadas (P1/P2/P3)
- [ ] ...
```

### Paso 4 — Validar

```bash
node .claude/scripts/validate-template.mjs
# Expected: 14 ok, 0 warn, 0 error
```

### Paso 5 — Invocar

```
@checkout-backend-fraud-detector analiza transacciones del último sprint
```

El orquestador delega al agente por nombre explícito.

## 11. Cambios respecto a v1.x

Si venís de v1.0.x, el cambio clave es:

| Antes (v1.x) | Ahora (v2.0) |
|--------------|--------------|
| `architect`, `developer`, `tech-lead`... | `sofka-asdd-solution-architect`, `sofka-asdd-developer-frontend`, `sofka-asdd-developer-backend`... |
| `architect-adr`, `developer-feature`... | `sofka-asdd-solution-architect-adr`, `sofka-asdd-developer-feature`... |
| `/project:specify` | `/sofka-asdd:specify` |
| `asdd-expert` | `sofka-asdd-meta` (rename de rol) |
| Validador 13 checks | Validador 14 checks (naming-convention strict) |

Ver `.claude/docs/migrations/1-to-2.md` para el procedimiento de migración.

## 12. Referencias

- Anthropic — Subagents (https://code.claude.com/docs/en/sub-agents)
- Anthropic — Skills (https://code.claude.com/docs/en/skills)
- Anthropic — Commands (https://code.claude.com/docs/en/slash-commands)
- ASDD-VERSIONING.md — sección 10 Convención de nomenclatura
- .claude/scripts/validate-template.mjs — check 14 implementation
- .sofka-asdd/cli-contract.json — bloque `naming_convention`
