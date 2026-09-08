# ADR-011 — Excepción de ORC-000 para los documentos vivos de Smart Data

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico: `docs/architecture/decisions/ADR-011-orc-000-smart-data-living-documents.md`.
> `docs/adoption/` es zona exenta de guards. El orquestador reubica al mergear.

- **Estado:** **Aceptada**
- **Fecha:** 2026-08-20
- **Deciders:** equipo maintainer del template — decisión de política tomada tras el
  reporte `BUG-REPORT-smart-data-procedimiento-c.md` (ISSUE-7, 2026-08-19).
- **Contexto relacionado:** ADR-002 (aislamiento del flujo Smart Data), ADR-003
  (exenciones de dominio en `analyze-guard` y `artifact-name-guard`, Amendments 1–3).
- **Convención de numeración:** el último es `ADR-010-refactor-consolidador-capa-ba.md`;
  este es el siguiente secuencial → **ADR-011**.

---

## Contexto

El flujo Smart Data se basa en **documentos vivos**: los artefactos producidos en
Discover (`smart-data-eng-discovery-{cliente}.md`, `smart-data-eng-governance-assessment-{cliente}.md`,
`smart-data-eng-dictionary-{cliente}.md`) no son entregables de una sola escritura —
se actualizan continuamente a lo largo del engagement, y **el tracking de estado del
engagement vive dentro de esos archivos**.

Tres momentos del flujo escriben sobre ellos:

| Momento | Qué hace | Por qué no puede delegarse |
|---|---|---|
| **Procedimiento C** — cierre de gaps | El orquestador presenta un gap, el usuario responde, la resolución se registra **en ese mismo turno** | Es un protocolo de conversación: los gaps se presentan **uno por vez**. Un subagente por gap es inviable |
| **Procedimiento Sync** — delta del Excel | Actualiza los mismos documentos con lo que cambió en el `.xlsx` | Escribe en el `## Historial de sincronización` de cada artefacto tocado |
| **Publish** — cierre | Deja assessment, diccionario y diseño en su estado final | Actualiza artefactos existentes, no crea |

El criterio de avance a Design es **cero gaps `conversation` sin resolver** — y ese
estado vive dentro del documento. Si la escritura falla o queda a medias, el criterio
de avance no puede verificarse contra el estado real del artefacto.

## Problema

ORC-000 deniega `Edit`/`Write` al hilo principal **sin excepciones**
(`sofka-asdd-orchestrator-guard.mjs`, deny duro). En el Procedimiento C no hay agente
que medie: la actualización del documento vivo es parte del protocolo de conversación
del propio orquestador.

Resultado observado (sesión 2026-08-19, registrar la resolución de un gap): **4
intentos por distintas rutas** — `Edit` denegado por ORC-000, delegación bloqueada,
PowerShell bloqueado por el sandbox, y finalmente Bash + Python3. La ruta que funcionó
no es reproducible entre entornos: *"no hay garantía de que en otra sesión la ruta 4
esté disponible"*. Un gate sin salida contractual empuja a rutas alternativas no
determinísticas — el mismo patrón que ADR-003 Amendment 3 documenta para el
`artifact-name-guard`.

## Decisión

Los artefactos `smart-data-eng-*` bajo `docs/specs/` (incluido `contracts/`) y
`docs/architecture/` quedan **exentos del deny de ORC-000 para `Edit`/`Write` desde el
hilo principal**.

La excepción exige **tres condiciones acumulativas** sobre el archivo destino:

1. **Ruta:** relativa al proyecto, empieza por `docs/specs/` o `docs/architecture/`.
2. **Prefijo:** el basename empieza por `smart-data-eng-`.
3. **Contrato:** `isDataArtifact(basename)` — el SSOT de nombres del dominio
   (`.claude/hooks/_lib/smart-data-naming.mjs`), el mismo que ya consumen el
   `analyze-guard` y el `artifact-name-guard`.

Quitar cualquiera de las tres abre la grieta más de lo necesario.

## Alternativas descartadas

- **(a) Delegar cada escritura a `data-governance`.** Un subagente por gap, y los
  gaps se presentan uno por vez — multiplica invocaciones para una edición puntual
  cuyo contenido ya está resuelto en la conversación.
- **(b) `SOFKA_ASDD_ORCHESTRATOR_GUARD_DISABLE=1`.** Apaga el guard **entero**
  (también Bash) y sin rastro por archivo — es el escape hatch de emergencia, no una
  política.

## Alcance de la grieta

Qué queda escribible desde el hilo principal que antes no lo estaba: **solo** archivos
cuyo nombre cumple el contrato Data bajo las dos raíces declaradas. En concreto:

```
docs/specs/smart-data-eng-{tipo}-{cliente}.md
docs/specs/contracts/smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md
docs/architecture/smart-data-eng-design-{cliente}.md
```

Por qué es aceptable:

- El `artifact-name-guard` sigue validando el nombre contra el contrato del dominio
  (ADR-003 Amendment 3) — la excepción de ORC-000 no exime del naming.
- `data-eng-validate` sigue siendo solo-lectura más el sign-off: su único escribible
  es `smart-data-eng-validate-signoff-{cliente}.md`, que ya cae dentro del alcance
  por ruta y nombre — no necesita regla adicional.
- Todo lo demás (código, specs software, ADRs, cualquier otra ruta o nombre) recorre
  exactamente el mismo deny que hoy.

Salvedad conocida y aceptada: el contrato de nombres no distingue `{tipo}` de
`{cliente}`, así que nombres incompletos pasan (ver ADR-003 / plan del Reporte 1).
La barrera real es la raíz de ruta.

## Consecuencias

- **CORE-009 deja de ser absoluto.** El principio "el orquestador nunca escribe"
  tiene ahora una excepción de dominio declarada, acotada por ruta y contrato. Se
  dice explícitamente acá, no por omisión. El texto de CORE-009 en `CLAUDE.md` **no
  se modifica**: la excepción se declara en ORC-000
  (`.claude/rules/sofka-asdd-orchestration.md` y su referencia), que es su
  operacionalización.
- **No se generaliza a otros dominios.** ATF no lo pidió y no lo necesita: escribe
  desde Node, no con `Edit`. Cualquier dominio futuro que necesite documentos vivos
  requiere su propio ADR.
- ISSUE-8 (sandbox vs. rutas con espacios en PowerShell) se resuelve por
  consecuencia: con `Edit` disponible en el primer intento, la rama de escrituras por
  shell deja de recorrerse.

## Enforcement

- **Código:** `.claude/hooks/sofka-asdd-orchestrator-guard.mjs` — la excepción vive
  dentro de la rama `isEdit || isWrite` de `getOrchestratorGuardDecision()`, antes
  del deny.
- **Regla:** `.claude/rules/sofka-asdd-orchestration.md` (núcleo) y
  `.claude/references/rules/sofka-asdd-orchestration.md` (Límites absolutos) declaran
  la excepción — código y norma dicen lo mismo.
- **Test:** `.claude/scripts/test-orchestrator-guard-data.mjs` protege la excepción y
  su acotamiento (casos permitidos y denegados). Sin ese test, la próxima auditoría
  la remueve — es exactamente lo que pasó con la cláusula #8 del
  `artifact-name-guard` (ADR-003 Amendment 3).
