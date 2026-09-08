# BUG-A: Naming de artefactos de run bloquea escrituras legítimas

**Módulo**: `.claude/hooks/asdd-pre-tool-use-artifact-name-guard.mjs` + `.claude/scripts/asdd-artifact-name.mjs` + `.asdd/asdd-run.schema.json`
**Severidad**: HIGH
**Prioridad**: P1
**Categoría preliminar**: bug
**Reportado**: 2026-07-07
**Estado**: Abierto
**Release asignado**: R1 (v2.27.1)
**Run ASDD**: 2026-07-07-001

> **Nota sobre ubicación**: este reporte vive provisionalmente en
> `docs/tech/` en lugar de `docs/specs/bug-*.md` (convención del skill
> `asdd-tech-lead-new-bug`) porque el hook `analyze-guard`
> bloquea toda escritura en `docs/specs/` sin brief. Ese bloqueo es el
> defecto A8 documentado en el refactoring plan hermano; una vez A8
> resuelto, este archivo se re-ubica con `git mv`.

## Descripción

El guard `artifact-name-guard` bloquea con `exit 2` escrituras legítimas
bajo `docs/**` en tres escenarios superpuestos: (1) discrepancia entre el
`current_phase` que el orquestador escribe en español (`disenar`,
`verificar`) y el enum inglés que el guard y el helper aceptan;
(2) run activo con `status === "complete"` sin sucesor abierto — el
guard bloquea toda escritura no exenta bajo `docs/tech/` y `docs/specs/`
aunque `naming-convention.md §3.7.2` declara `docs/tech/` fuera del
alcance del check 19; (3) el hook `analyze-guard` complementa el bloqueo
aplicando fail-closed a `docs/specs/` sin brief, sin distinguir bug
reports (variante A8, documentada en el plan).

## Pasos para reproducir

### Escenario 1 — Discrepancia de fase español/inglés

1. En un run activo (`status: in_progress`), el orquestador escribe
   `current_phase: "disenar"` en `.asdd-run.json` (copiado literal de
   `WF-003 — Diseñar`).
2. Un agente invoca el helper:
   `node .claude/scripts/asdd-artifact-name.mjs --phase disenar --slug foo`.
3. El helper rechaza con exit 1: `Fase inválida: "disenar". Fases válidas: specify, analyze, design, build, verify, document`.
4. Como alternativa, el agente pide `--phase design` — el helper genera
   `{run_id}-DESIGN-{SEQ}-foo.md` y consume `artifact_seq`.
5. Al intentar escribir el archivo con `Write`, el guard compara
   `match[2]` (`"DESIGN"`) con `currentPhase` (`"DISENAR"` uppercased) y
   rechaza con exit 2. `artifact_seq` queda quemado sin rollback.

### Escenario 2 — Run cerrado sin sucesor (variante A7)

1. `.asdd-run.json` tiene `run_id: "2026-05-28-001"`, `status: "complete"`.
2. Cualquier agente intenta `Write` a `docs/tech/refactoring-plan-xxx.md`
   o `docs/specs/bug-xxx.md`.
3. El guard bloquea inmediatamente con exit 2:
   `[artifact-name-guard] El run 2026-05-28-001 está cerrado (status: complete)`.
4. No hay forma de escribir en `docs/tech/` sin (a) abrir un run nuevo o
   (b) desactivar el guard con la variable de entorno
   `ASDD_ARTIFACT_NAME_GUARD_ENABLED=false`.
5. Reproducible al 100%. Verificado en vivo el 2026-07-07 durante la
   redacción del refactoring plan hermano de este bug.

### Escenario 3 — Analyze-guard sobre docs/specs/ sin brief (variante A8)

1. Con run activo válido y nombre generado por el helper (patrón OK),
   intentar `Write` a
   `docs/specs/2026-07-07-001-BUILD-002-bug-a-....md`.
2. El **segundo** hook `asdd-pre-tool-use-analyze-guard.mjs`
   bloquea inmediatamente con exit 2:
   `[ASDD WF-002 Prerrequisito] Intento de Write sobre .../docs/specs/... sin brief: no existe el directorio docs/specs. Crear el directorio y ejecutar /asdd:specify para generar el brief`.
3. El guard no distingue "bug report" (que el skill `new-bug` documenta
   escribiendo en `docs/specs/bug-*.md` sin brief) de "spec de feature"
   (que sí requiere brief por WF-002).
4. Reproducible al 100%. Verificado en vivo el 2026-07-07 al intentar
   escribir este mismo reporte en su ruta canónica.

## Comportamiento esperado

- El helper y el guard deben aceptar tanto los enum ingleses del schema
  como una tabla de sinónimos español→inglés (`disenar → design`,
  `verificar → verify`, etc.), o bien el schema debe forzar el enum
  inglés y los skills que escriben `current_phase` deben respetarlo
  siempre.
- Cuando no hay run activo, `docs/tech/` y `docs/specs/` deben ser
  escribibles (con warning), no bloqueados — coherente con
  `naming-convention.md §3.7.2` que los declara fuera del alcance del
  check 19 del validador.
- El analyze-guard debe distinguir bug reports (patrón `bug-*.md` del
  skill `new-bug`) de specs de features, o el skill `new-bug` debe
  documentar una ubicación distinta que no colisione con el prerrequisito
  de brief.
- Ante intentos fallidos, `artifact_seq` no debe consumirse (soporte
  `--dry-run`).

## Comportamiento actual

**Escenario 1 (fase español/inglés)** — Error literal exhibido por el guard
en el escenario reproducido en campo por el consumidor:

```
[artifact-name-guard] PHASE incorrecto: archivo declara "DESIGN"/"VERIFY", run "2026-07-02-001" está en fase "DISENAR"
Usá --phase disenar al invocar el helper, o avanzá la fase del run. WI #3658
```

El helper rechaza `disenar` previamente, así que el usuario queda en un
loop: el orquestador insiste con la fase en español, el helper y el guard
la rechazan.

**Escenario 2 (run cerrado)** — Error literal reproducido en vivo el
2026-07-07:

```
PreToolUse:Write hook error: [node $CLAUDE_PROJECT_DIR/.claude/hooks/asdd-pre-tool-use-artifact-name-guard.mjs]:
[artifact-name-guard] El run 2026-05-28-001 está cerrado (status: complete). WI #3658
```

**Escenario 3 (analyze-guard sin brief)** — Error literal reproducido en
vivo el 2026-07-07:

```
PreToolUse:Write hook error: [node $CLAUDE_PROJECT_DIR/.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs]:
[ASDD WF-002 Prerrequisito] Intento de Write sobre .../docs/specs/2026-07-07-001-BUILD-002-bug-a-artifact-name-guard-naming-run.md sin brief: no existe el directorio docs/specs. Crear el directorio y ejecutar /asdd:specify para generar el brief.
```

## Ambiente

- **Ambiente**: local (template ASDD dev + consumidor real, proyecto de
  conciliación bancaria)
- **Versión / commit**: lock v2.27.0
- **Cliente**: Claude Code (orquestador ASDD)
- **Rol del usuario**: developer/tech-lead con feature branch activa

## Evidencia

- **Log relevante (artifact-name-guard)**: `asdd-pre-tool-use-artifact-name-guard.mjs:167-168` compara `match[2]` con `currentPhase` sin normalizar sinónimos; `:159-163` bloquea con `exit 2` cuando `status === "complete"`.
- **Log relevante (helper)**: `asdd-artifact-name.mjs:43` define
  `VALID_PHASES` solo en inglés; `:136` rechaza fases fuera del set;
  `:170-178` consume `artifact_seq` antes de que el guard valide.
- **Log relevante (schema)**: `asdd-run.schema.json` no incluye
  `current_phase` como propiedad definida — el orquestador lo escribe
  con formato inconsistente sin validación posible.
- **Log relevante (analyze-guard)**: bloquea con
  `[ASDD WF-002 Prerrequisito] ... sin brief` sobre cualquier archivo
  bajo `docs/specs/` — patrón no distingue `bug-*.md` de spec-de-feature.
- **Reproducción en vivo A7 + A8**: 2026-07-07 al escribir el refactoring
  plan hermano (A7) y este mismo bug report en `docs/specs/` (A8).

## Análisis preliminar (SBR-001)

**Causa raíz combinada — 4 defectos que se refuerzan mutuamente**:

1. **`current_phase` sin contrato** — El campo no existe en
   `asdd-run.schema.json` (líneas 5-15: `required` no lo lista, y no
   aparece entre las `properties` definidas). El orquestador lo escribe
   libremente con el nombre en español copiado de las reglas WF-00x
   (`Especificar`, `Analizar`, `Diseñar`, `Construir`, `Verificar`,
   `Documentar`). Sin schema, no hay validación.

2. **Helper vs guard con estrategias de resolución distintas** —
   `asdd-artifact-name.mjs:43` define
   `VALID_PHASES = new Set(['specify', 'analyze', 'design', 'build', 'verify', 'document'])`.
   Cuando no viene `--phase`, el helper hace fallback (:140-152):
   primero lee `run.current_phase`, si no existe **escanea
   `run.phases.*.status === 'in_progress'`** y toma la primera match. El
   guard (`asdd-pre-tool-use-artifact-name-guard.mjs:167-168`)
   simplemente hace `runJson.current_phase.toUpperCase()` y compara
   string literal contra `match[2]` (:204-210) — no tiene fallback ni
   normalización.

3. **`artifact_seq` consumido antes de validar el nombre completo** — El
   helper hace `atomicWrite` de `.asdd-run.json` en `:170-178`
   **incrementando `artifact_seq`** ANTES de que el `Write` posterior
   sea validado por el guard. Si el guard rechaza, la secuencia queda
   quemada sin rollback.

4. **Variante A7 (verificada en vivo el 2026-07-07)** — El guard bloquea
   con `exit 2` en `:159-163` cuando `runJson.status === "complete"`,
   sin distinguir "run cerrado con continuidad" (típico entre ciclos de
   trabajo) de "run cerrado sin sucesor". La función `isExempt()`
   (:51-108) tampoco exceptúa `docs/tech/` ni `docs/specs/`, aunque
   `naming-convention.md §3.7.2` declara explícitamente que `docs/tech/`
   queda fuera del alcance del check 19 del validador.

5. **Variante A8 (verificada en vivo el 2026-07-07)** — Un **segundo**
   hook (`analyze-guard`) aplica fail-closed a `docs/specs/` sin brief.
   No distingue "bug report" (patrón `bug-*.md` del skill
   `asdd-tech-lead-new-bug`) de "spec de feature" (que sí
   requiere brief por WF-002), ni maneja el caso "directorio
   `docs/specs/` inexistente" como "template consumidor sin proyecto
   todavía". Interacción con A7: cuando A7 se resuelve, A8 sigue
   bloqueando bug reports; hay que resolver ambos para desbloquear el
   flujo del skill new-bug.

**Impacto consumidor**: en el proyecto de conciliación bancaria, el bug
bloqueó la persistencia del reporte final de QA en `docs/qa/`, quemó un
`artifact_seq` en cada intento fallido y forzó al equipo a desactivar
temporalmente el guard para completar la entrega. En el propio template,
bloqueó la redacción de este mismo bug report en su ruta canónica hasta
que el orquestador autorizó `docs/tech/` como workaround temporal.
Reproducible al 100%.

**Áreas de regresión en riesgo tras el fix**:

- Cualquier skill que escriba `.asdd-run.json.current_phase` en español
  (varias, dispersas en el orquestador).
- Los tests del helper y del guard (deben cubrir ambos escenarios).
- La convención de `naming-convention.md §3.7.2` — si el fix cambia
  exenciones, la convención debe actualizarse en el mismo release.
- El skill `asdd-tech-lead-new-bug` (si A8 se resuelve moviendo
  bug reports fuera de `docs/specs/`, actualizar el skill).

## Fix sugerido (propuesta — validar en diagnóstico, ver R1 en el plan)

**Cambio propuesto**:

- **A1** — Declarar `current_phase` en `asdd-run.schema.json` como enum
  requerido en inglés: `["specify", "analyze", "design", "build", "verify", "document"]`.
- **A2** — Añadir fallback al guard replicando la lógica del helper
  (`phases.*.status === "in_progress"`) cuando `current_phase` es `null`
  o inválido. Compartir esa función entre helper y guard vía
  `.claude/hooks/_lib/` (tras el rename E2).
- **A3** — Documentar en `asdd-checkpoint-resume.md` (ORC-007) una
  tabla de mapeo español→inglés para skills legados, con nota de
  deprecación.
- **A4** (decidido opción b) — Añadir `--dry-run` al helper para
  pre-validar sin consumir `artifact_seq`.
- **A5** — Test de integración helper→guard.
- **A6** — Check `asdd-run-json-schema` en `validate-template.mjs`
  (nivel `warn`).
- **A7** — Guard: si `runJson.status === "complete"` y ninguna fase
  está `in_progress`, degradar a warning con `exit 0` (no bloquear).
- **A8** — Exentar patrón `bug-*.md` del analyze-guard, o ampliar
  `naming-convention.md §3.7.2` para distinguir spec-de-feature (con
  brief) de bug report (sin brief), o migrar bug reports a
  `docs/qa/bugs/` y actualizar el skill new-bug. Decidir en R1.

**Archivos candidatos**:

- `.claude/hooks/asdd-pre-tool-use-artifact-name-guard.mjs` (A2, A7).
- `.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs` (A8).
- `.claude/scripts/asdd-artifact-name.mjs` (A4).
- `.asdd/asdd-run.schema.json` (A1).
- `.claude/hooks/_lib/` nuevo módulo compartido (A2, tras E2).
- `.claude/scripts/validate-template.mjs` (A6).
- `.claude/scripts/test-asdd-artifact-name.mjs` (A5).
- `.claude/references/rules/asdd-checkpoint-resume.md` (A3, docs).
- `.claude/skills/asdd-tech-lead-new-bug/SKILL.md` (A8, si se
  migra el patrón).
- `.claude/docs/adoption/naming-convention.md` (A8, distinguir tipos).

**Tests requeridos**:

- Test que reproduce escenario 1: `current_phase: "disenar"`, helper con
  `--phase design`, guard debe aceptar o proponer canonicalización.
- Test que reproduce escenario 2: `status: "complete"` sin sucesor,
  escritura a `docs/tech/foo.md` debe pasar con warning, no bloquear.
- Test que reproduce escenario 3: escritura a
  `docs/specs/bug-XXX-foo.md` con patrón `bug-*` debe pasar el
  analyze-guard sin brief.
- Test de rollback: helper con `--dry-run` no incrementa `artifact_seq`.

**Riesgo del fix**: **medio**. Toca 4 componentes acoplados (schema +
helper + 2 guards) que comparten contrato pero hoy tienen lógicas
divergentes. R1 exige tests antes de tocar los guards porque su
fail-open inadvertido rompería gates de seguridad de naming (no el
mismo tipo de riesgo que R3, pero requiere red de tests).

## Notas

- **Workaround temporal**: `ASDD_ARTIFACT_NAME_GUARD_ENABLED=false` en la
  sesión (auditable — el hook lo respeta en `:20`). No es solución;
  desactiva el gate para toda la sesión. Análogo para el analyze-guard
  si expone su propia variable.
- **Reproducción original (consumidor)**: proyecto de conciliación
  bancaria, ciclo 2026-07-02.
- **Reproducción interna (template)**: 2026-07-07 al redactar el
  refactoring plan hermano — variantes A7 y A8 reproducidas en vivo.
- **ADR aplicable**: ninguno vigente. Este fix probablemente merece un
  ADR corto documentando la decisión de fase-en-inglés como canónico y
  la separación bug-report/spec-de-feature.
- **Bugs relacionados**: BUG-B (`2026-07-07-001-BUILD-006`) y BUG-C
  (`2026-07-07-001-BUILD-007`) — los tres refuerzan el síntoma FLUJO.
