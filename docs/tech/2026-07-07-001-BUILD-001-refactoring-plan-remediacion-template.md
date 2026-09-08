# Refactoring Plan — Remediación del Template ASDD (post-auditoría + bugs de campo)

**Generado**: 2026-07-07
**Esfuerzo total estimado**: XL (7 releases atómicos)
**Autor**: sofka-asdd-tech-lead (skill refactoring-plan)
**Rama**: fix/3-bugs-consumidor-r1-naming
**Run ASDD**: 2026-07-07-001

## Contexto

La auditoría de rendimiento del template (~2026-06) identificó 3 síntomas
transversales: **LENTO** (fan-out de 5-6 hooks Node por tool-call; ORC-000
fuerza delegación mandatoria = cold-start de 60-90s por spawn de sub-agente),
**CONTEXTO-COSTO** (bloques "always-on" reenviados en cada sesión y en cada
spawn de sub-agente sin poda) y **FLUJO** (gates declarados "inviolables" en
las reglas sin enforcement mecánico real detrás — el enforcement vive en
prosa, no en código — y context-rot por sobre-inyección de reglas).

La verificación puntual del 2026-07-07 sobre el lock v2.27.0 confirma avances
parciales y deuda nueva:

- El bloque always-on bajó ~57% (95.1k→~40.8k tokens) gracias a #3671 y
  ADR-005 (5 reglas ATF-web movidas a `.claude/reference/`, estado aún
  `Propuesta`).
- ORC-000 (delegación pura) sigue intacto; el routing sigue siendo binario
  LIGHT/FULL sin dispatcher por dominio; el plan-gate (ORC-010) es
  decorativo — solo pregunta "ok" sin verificar que hubo un plan real
  presentado antes de escribir el marcador de aprobación.
- La fragmentación de reglas ORC EMPEORÓ: 15 archivos con 56 referencias
  cruzadas entre sí, dificultando mantenerlas coherentes.
- `.asdd-run.json` (trackeado en git) creció a ~40KB de historia acumulada
  de sesiones — sin poda ni archivado.
- El validador del template no tiene ningún check de presupuesto de
  contexto; no hay evals automatizados sobre los gates críticos.
- `.gitlab-ci.yml` se declara como existente en `CLAUDE.md` pero no existe
  en el repo.
- `model_strategy.agent_pinning` está vacío en el lock (sin pins reales
  para agentes mecánicos como `explorer` o `meta`).
- `stripStringLiterals` usa la bandera `/g` solo para comillas dobles; las
  comillas simples se procesan sin `/g` en `pre-pr-gate.mjs:55` y
  `pre-push-gate.mjs:50` — bug de regex, ver Release R4.
- `dep-check` usa un parser de `go.mod` para archivos Gradle — falso
  negativo estructural en proyectos Gradle.
- La spec de `atf-web-qa-engineer` tiene 1.624 líneas — muy por encima del
  límite operativo de las demás reglas/specs del template.

A esto se suman **3 bugs de campo** reportados por un consumidor real
(proyecto de conciliación bancaria, arquitectura multi-repo con repos
anidados) que **confirman empíricamente el síntoma FLUJO**: los gates de
seguridad y naming existen en la prosa de las reglas, pero su
implementación mecánica (hooks) tiene supuestos que no sobreviven al uso
real en campo. Ver los reportes hermanos BUG-A/B/C (artefactos
`2026-07-07-001-BUILD-002/003/004`) para el diagnóstico verificado línea
por línea.

**Lección clave del revert de Smart-Data (commit `bcdab3f`)**: reglas
transversales **sin lector explícito** no son lazy-loadables a
`.claude/reference/` sin romper su enforcement — solo las reglas que
declaran un lector concreto en su skill/hook (como las 5 reglas ATF-web
movidas por ADR-005) sobreviven el patrón de carga perezosa. Cualquier
release de este plan que mueva contenido a `reference/` debe primero
identificar su lector explícito o descartar el movimiento.

## Nota de verificación en vivo (2026-07-07, durante la escritura de este plan)

Al redactar este mismo artefacto se reprodujo una variante adicional y más
directa del síntoma FLUJO / Bug A: el repo tenía un run cerrado
(`.asdd-run.json` → `run_id: 2026-05-28-001`, `status: "complete"`) sin que
existiera ningún run nuevo abierto para este ciclo de trabajo. El hook
`sofka-asdd-pre-tool-use-artifact-name-guard.mjs` leyó ese archivo y, al
encontrar `status === "complete"`, **bloqueó con `exit 2` la escritura de
este mismo documento** — incluyendo `docs/tech/` y `docs/specs/`, que no
están en la lista de exenciones (`isExempt()`) aunque el propio
`naming-convention.md §3.7.2` documenta a `docs/tech/` como "fuera del
alcance del check 19 por convención del template". Es decir: el hook y
la convención documentada están desalineados, y el bug se dispara incluso
sin necesidad de que exista una discrepancia de `current_phase` — basta
con un run previo cerrado y ninguno nuevo abierto. Este hallazgo se
registra como evidencia adicional de Bug A (ver reporte hermano `BUG-A`)
y como ítem A7 en el release R1.

## Los 7 releases atómicos

Unidad de entrega = cambio coherente completo, con tests, revertible de un
solo golpe. No se mezclan bugs de campo con quick wins de auditoría dentro
del mismo release salvo cuando comparten archivo (ver R1).

### R1 (v2.27.1) — Bug A: naming de artefactos de run

- **A1**: declarar `current_phase` en `asdd-run.schema.json` como enum en
  inglés (`specify | analyze | design | build | verify | document`).
- **A2**: fallback del guard escaneando `phases.*.status === "in_progress"`
  (misma lógica de resolución que ya usa el helper) cuando `current_phase`
  es `null`.
- **A3**: tabla de mapeo español→inglés documentada en ORC-007
  (`sofka-asdd-checkpoint-resume.md`) para las fases que el orquestador
  históricamente escribió en español (copiadas de WF-00x).
- **A4**: **DECIDIDO — opción b**: agregar `--dry-run` al helper
  `sofka-asdd-artifact-name.mjs` para pre-validar el nombre sin consumir
  `artifact_seq` (evita quemar secuencia en intentos fallidos).
- **A5**: test de integración helper → guard (nombre generado por el
  helper siempre pasa el guard).
- **A6**: check `asdd-run-json-schema` en `validate-template.mjs` (nivel
  `warn`).
- **A7 (nuevo, verificado en vivo el 2026-07-07)**: el guard bloquea con
  `exit 2` cualquier escritura no exenta bajo `docs/**` cuando
  `runJson.status === "complete"`, sin distinguir "run cerrado sin
  sucesor" de "run cerrado con continuidad". Fix: si no hay ningún run con
  `status !== "complete"`, el guard debe degradar a advertencia (`exit 0`
  con warning a stderr) en vez de bloquear — igual que ya hace cuando
  `current_phase` es `null` (líneas 196-201 del hook). Bloquear
  permanentemente la escritura en `docs/tech/` y `docs/specs/` porque el
  último run se cerró es un fail-closed desproporcionado para artefactos
  que la propia convención (`naming-convention.md §3.7.2`) declara fuera
  del alcance del check 19.
- Nota: R1 también degrada `artifact-name-guard` de fail-closed a warning
  cuando no hay ningún run activo (`status !== "complete"` en ninguno) —
  quick win de la auditoría, mismo archivo que A1-A7.
- **A8 (nuevo, verificado en vivo el 2026-07-07)**: el hook
  `sofka-asdd-pre-tool-use-analyze-guard.mjs` aplica fail-closed a **todo**
  `docs/specs/` cuando no existe brief, sin distinguir:
  (a) spec de feature (que legítimamente requiere brief según WF-002), de
  (b) bug report (que el skill `sofka-asdd-tech-lead-new-bug` documenta
      escribiendo en `docs/specs/bug-*.md` sin exigir brief), de
  (c) directorio `docs/specs/` inexistente en un template consumidor
      todavía sin proyecto.
  Error literal reproducido: `[ASDD WF-002 Prerrequisito] Intento de Write
  sobre .../docs/specs/2026-07-07-001-BUILD-002-bug-a-....md sin brief:
  no existe el directorio docs/specs. Crear el directorio y ejecutar
  /sofka-asdd:specify para generar el brief`. Opciones de fix a evaluar
  en R1: (i) exentar el patrón `bug-*.md` del analyze-guard —
  bajo-riesgo, coherente con el skill new-bug; (ii) ampliar
  `naming-convention.md §3.7.2` distinguiendo "spec-de-feature" (requiere
  brief) de "bug report" (no requiere), y ajustar el hook a esa
  distinción; (iii) migrar bug reports a `docs/qa/` o `docs/tech/bugs/`
  y actualizar el skill new-bug. Como consecuencia operativa temporal,
  los 3 bug reports hermanos de este plan (BUG-A/B/C) quedaron
  provisionalmente en `docs/tech/` en vez de `docs/specs/`; una vez A8
  esté implementado, un `git mv` los reubica en su hogar definitivo.
- Incluye **E2 (decidido: sí)**: rename de `.claude/hooks/lib/` a
  `.claude/hooks/_lib/` con actualización de todos los imports relativos.

### R2 (v2.27.2) — Bug C: co-autoría de IA se escapa a MRs

- **C1**: ampliar la allowlist de `isTargetCommand()` — agregar
  `glab mr update`, `glab mr edit`, `gh pr edit`, `glab api
  merge_requests`, `gh api pulls`.
- **C2**: detectar el patrón `"🤖 Generated with Claude" | "by Claude" |
  "Anthropic"` como regla independiente del trailer `Co-Authored-By`.
- **C3**: registrar el guard también en el matcher `Write`, con filtro de
  paths que excluya `test/`, `spec/`, `__tests__/` (para no bloquear
  fixtures de test que contienen el string a propósito).
- **C4**: actualizar el skill `sofka-asdd-tech-lead-create-mr` para
  reforzar la prohibición con ejemplos de los vectores nuevos.
- **C5**: tests extendidos cubriendo cada vector de escape identificado en
  el diagnóstico (BUG-C).

### R3 (v2.28.0) — Bug B: guards git ciegos a repos anidados (CRÍTICO)

Precedido de una red de tests de los 3 guards git afectados (F0 parcial —
baseline de regresión antes de tocar código de seguridad).

- **B1**: helper compartido `.claude/hooks/_lib/git-command-cwd.mjs` con
  `resolveEffectiveCwd(command, inputCwd)` que parsea `cd X &&`,
  `git -C X` y `parseInlineEnvVar` (prefijos `VAR=1 comando`).
- **B2-B4**: aplicar el helper en `guard-branch.mjs`, `pre-push-gate.mjs`
  (incluye el cálculo de `git diff` y la resolución del marcador
  `.claude/.prepush-validated` en el repo efectivo, no en el repo raíz) y
  `pre-pr-gate.mjs`.
- **B5**: el skill `sofka-asdd-tech-lead-pre-push` escribe el marcador en
  el repo correcto (el mismo que resuelve el helper).
- **B6**: tests con estructura de repos anidados reproduciendo el caso de
  campo (raíz-config + proyectos/{iac,db,drive-sync} como repos propios).
- **B7**: documentar el comportamiento en `sofka-asdd-git-safety.md`.

**Mitigación de seguridad obligatoria**: cuando el parseo del comando es
ambiguo (por ejemplo, `cd` con variable sin resolver), evaluar **tanto** el
repo resuelto **como** el repo raíz y bloquear si **cualquiera** de los dos
está en rama protegida. Fail-closed siempre — nunca degradar a fail-open
para resolver este bug.

### R4 (v2.28.x) — Quick wins de auditoría

- Agregar `.asdd-run.json` a `.gitignore` + `git rm --cached` + short-circuit
  en `run-manifest` cuando `status === "complete"` (no seguir escribiendo
  historia sobre un run cerrado).
- Eliminar la inyección duplicada de contexto: la tabla ORC de 4.7KB en
  `session-start.mjs:64-114` (una vez por arranque de sesión) se solapa con
  el "NÚCLEO ORC" de 616B en `user-prompt-submit.mjs:142-153` (una vez por
  turno) — consolidar en una sola fuente.
- Corregir `/g` faltante en el reemplazo de comillas simples de
  `stripStringLiterals` (`pre-pr-gate.mjs:55`, `pre-push-gate.mjs:50`).
- Parser real de Gradle en `dep-check` (hoy usa el parser de `go.mod`).
- Poblar `model_strategy.agent_pinning` (`explorer → haiku`,
  `meta → haiku`) y `skill_override` para skills mecánicos.
- Corregir `CLAUDE.md` (referencia a `.gitlab-ci.yml` inexistente) y los
  `sofka-asdd-counts` del lock (hooks 21→20, commands 40→38).
- Subir el check `sofka-asdd-counts` de `warn` a `error`.

### R5 (v2.29.0) — P1 delegación/routing (palanca #1 de velocidad)

- Ruta **TRIVIAL** (`ORC-000-T`) con candado conservador: cambio atómico
  de 1 archivo → developer en modelo `haiku`, cero compuertas de escritura
  otorgadas al orquestador.
- Reescritura de ORC-000: de "sin excepción" a "delegación por defecto con
  excepción TRIVIAL auditada y trazada en `.asdd-run.json`".
- Routing **bidimensional**: profundidad (`TRIVIAL/LIGHT/MEDIUM/FULL`) ×
  dominio/módulo (`software/qa/devops/data`), generalizando el patrón
  ADR-002 de Smart Data. El matching de dominio opera **solo** sobre el
  prompt del usuario, nunca sobre resultados de herramientas (lección de
  falsos positivos del hook `data` en la sesión del 2026-07-07).
- Whitelist de comandos Bash read-only en `orchestrator-guard`.
- Plan-gate honesto: el marcador de aprobación solo se escribe tras un
  plan real presentado al usuario, y se consume al usarlo (no persiste
  entre pasos).

### R6 (v2.29.x) — Consolidación de reglas ORC

- Reducir de 15 archivos / 56 referencias cruzadas a 3 archivos (`core`,
  `routing`, `workflow`).
- Stubs de 1 línea en las rutas viejas para las referencias que sigan
  vivas durante la migración.
- Actualizar `session-start.mjs` para leer desde la fuente consolidada.

### R7 (v2.30.0) — P2 restante + red anti-regresión

- Split de la spec `atf-web-qa-engineer` (1.624 → ~600 líneas núcleo +
  referencias).
- Formalizar ADR-005 (`Propuesta` → `Aceptada`) con la distinción explícita
  regla-con-lector vs. transversal-sin-lector (evita repetir el revert de
  Smart-Data).
- Presupuesto de contexto declarado en el lock + check `context-budget` en
  `validate-template.mjs`.
- Smoke-evals de los gates críticos (branch guard, push gate, PR gate,
  artifact-name guard).
- Crear el `.gitlab-ci.yml` real que `CLAUDE.md` ya declara.

## Matriz release × síntoma que resuelve

| Release | LENTO | CONTEXTO-COSTO | FLUJO |
|---|---|---|---|
| R1 | — | — | ✅ (gates naming/run) |
| R2 | — | — | ✅ (gate co-autoría) |
| R3 | — | — | ✅ (gates git — crítico) |
| R4 | parcial | ✅ | ✅ (determinismo) |
| R5 | ✅ (principal) | ✅ | ✅ (routing por módulo) |
| R6 | parcial | ✅ | ✅ (atención/fragmentación) |
| R7 | — | ✅ | ✅ (anti-regresión) |

## Matriz impacto × esfuerzo por release

| Release | Impacto | Esfuerzo | Cuadrante |
|---|---|---|---|
| R1 | Alto (desbloquea flujo real de escritura de artefactos) | Bajo-Medio | Quick win |
| R2 | Alto (compliance/atribución, ya materializado en campo) | Bajo | Quick win |
| R3 | Crítico (bloquea 100% de commits legítimos en repos anidados) | Medio | Prioridad máxima |
| R4 | Medio (contexto + determinismo) | Bajo | Quick win |
| R5 | Muy alto (palanca de velocidad, 60-90s por spawn) | Alto | Épica |
| R6 | Medio (mantenibilidad, reduce fragmentación) | Medio | Balanceado |
| R7 | Medio (anti-regresión, evita repetir errores) | Medio-Alto | Balanceado |

## Decisiones tomadas

- **A4 = opción b**: `--dry-run` en el helper de naming en vez de otras
  alternativas evaluadas.
- **E2 = sí**: rename `.claude/hooks/lib/` → `.claude/hooks/_lib/`.
- El routing bidimensional (profundidad × dominio) se resuelve **dentro**
  de P1 (R5), no como release separado.
- El multiplexado de hooks (P3 del diseño original de la auditoría) se
  **descarta / posterga**: ROI malo (~375ms de ahorro medido) frente a la
  palanca de 60-90s de R5, y riesgo de introducir fragilidad sobre gates
  de seguridad que hoy corren como procesos Node independientes.

## Decisiones abiertas

- Umbrales de TTL para marcadores (`.claude/.prepush-validated`,
  plan-gate) — sin definir aún.
- Si CORE-001/CORE-006/CORE-007/CORE-008 suben a gate mecánico (hook) o
  permanecen como conducta reforzada por prosa en las reglas.
- Gap central sin resolver en esta ronda: herencia de contexto por spawn
  en ruta FULL — próxima palanca de optimización tras cerrar R1-R7.

## Riesgos

- Repetir el revert de Smart-Data si se lazy-loadea contenido a
  `reference/` sin verificar que existe un lector explícito (ver Contexto).
- Tocar guards git sin red de tests (por eso R3 exige F0 parcial antes de
  cualquier cambio de código).
- Baseline de contexto obsoleto — recalcular medición antes de cada
  release que toque presupuesto de contexto (R4, R6, R7).

## Trazabilidad

- R1, R2, R3 → bug reports (artefactos hermanos `2026-07-07-001-BUILD-002`
  BUG-A, `-003` BUG-B, `-004` BUG-C).
- Origen: auditoría (artifact `ec45251a`) + diseño (`afd045d1`) +
  verificación en vivo 2026-07-07 (este documento, incluyendo el hallazgo
  A7 reproducido durante su propia escritura).
