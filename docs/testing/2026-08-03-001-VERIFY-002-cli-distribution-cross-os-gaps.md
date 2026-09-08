# Huecos del contrato del CLI de distribución — traspaso post-remediación cross-OS

| Campo | Valor |
|---|---|
| **Tipo de documento** | Auditoría de artefactos / traspaso técnico (read-only) |
| **Autor** | `asdd-tech-lead` — capability `asdd-tech-lead-artifact-audit` |
| **Fecha** | 2026-08-03 |
| **Rama** | `fix/os-compatibility` |
| **`run_id`** | `2026-08-03-001` |
| **Fase** | VERIFY |
| **Alcance auditado** | `.asdd/cli-contract.json` (contract_version `2.3.0`), `.asdd/checklist.json`, `docs/adoption/contract-spec.md`, `docs/adoption/cli-integration-guide.md`, `ASDD-VERSIONING.md`, `.claude/scripts/**`, `.claude/hooks/**` |
| **Veredicto** | **FAIL** — 1 hallazgo bloqueante para la distribución, 2 mayores |

## Nota de alcance (leer antes que el resto)

Los tres huecos documentados aquí están **fuera del alcance** de la remediación de
compatibilidad cross-OS ejecutada en esta rama (fases 1 a 5b: normalización de EOL/BOM en el
hashing, 4 sitios de separador de ruta fail-closed, 3 guards de gobernanza fail-open, 9 defectos
de producción y 6 del harness de test; veredicto idéntico verificado en Windows y en WSL Fedora,
`32 ok / 2 warn / 1 error`).

Están fuera de alcance porque **ninguno de los tres se puede cerrar solo en este repositorio**:

- El hueco 1 sí es una sola línea en este repositorio, pero su efecto depende de la semántica de
  la clave `distribution`, que **no está especificada en ningún documento de este repo** (ver
  hallazgo transversal H-0). Hasta confirmarlo con el equipo del CLI no se puede garantizar el
  resultado.
- El hueco 2 exige cambiar dos declaraciones acopladas (`cli-contract.json` y `checklist.json`) y,
  para expresar el piso correcto, exige un cambio en el **mecanismo de verificación del CLI**.
- El hueco 3 es un cambio coordinado de contrato (v2.4) entre este repositorio y `guide-ia/cli`,
  que tiene versionado de contrato propio.

Este documento es el **traspaso** a quien tome ese trabajo. Es read-only: no modifica el
contrato, el checklist ni los documentos de adopción.

> **Advertencia de distribución sobre este mismo documento.** `docs/testing/` es una entrada de
> `distribution` (`.asdd/cli-contract.json`, entrada 47 de 54) y **no** figura en
> `clean.files_to_remove`. Es decir, este archivo — contenido interno del mantenedor del
> template — se copiaría a cada proyecto consumidor. Ver H-0.4.

## Resumen

| # | Hueco | Severidad | Esfuerzo | Repositorio responsable | Bloqueado por CLI |
|---|---|---|---|---|---|
| **H-0** | Deriva de `contract-spec.md` (v1.0) respecto al contrato real (v2.3.0): 6 de 15 claves sin documentar, entre ellas `distribution` | **blocker** | Bajo–Medio | Template | No |
| **1** | `.gitattributes` no está en `distribution`: la política de EOL no llega a ningún proyecto consumidor | **blocker** | **Muy bajo** (1 línea) | Template | **No** |
| **2** | `required_tools` declara `node>=18`: piso en fin de vida, declarado en 4 sitios distribuidos que pueden divergir, y el mecanismo de verificación no puede expresar un piso de minor | **major** | Bajo (template) + Medio (CLI) | Template + CLI | Parcial |
| **3** | Sin manifiesto de hashes: el CLI no puede distinguir "igual a la versión anterior" de "modificado por el usuario", así que sobreescribe siempre | **major** | Alto | Template + CLI (contract v2.4) | **Sí** |

Ranking por relación impacto/esfuerzo: **1 → 0 → 2 → 3**. El hueco 1 es el único que se resuelve
íntegramente en este repositorio sin esperar al CLI, y es el que corta la reproducción de la clase
de defecto que acabamos de cerrar.

---

## H-0 — Hallazgo transversal: la especificación del contrato quedó atrás del contrato

Este hallazgo no estaba en el encargo. Apareció al investigar los puntos 3 y 4 y es
**precondición** de los huecos 1 y 3: sin él, cualquier cambio al contrato es a ciegas.

### Evidencia

`docs/adoption/contract-spec.md:1` se titula "Contrato CLI ASDD — Especificación Formal **v1.0**".
El contrato real declara `contract_version: "2.3.0"` (`.asdd/cli-contract.json:3`).

Comparando las 15 claves de primer nivel del contrato contra las menciones en la spec:

| Clave del contrato | Documentada en `contract-spec.md` |
|---|:-:|
| `contract_version` | sí (§2, §3.1) |
| `template` | sí (§3.2) |
| `compatibility` | sí (§3.3) |
| `personalize` | sí (§3.4) |
| `clean` | sí (§3.5) |
| `create_dirs` | sí (§3.6) |
| `post_install` | sí (§3.7) |
| `post_install_message` | sí (§3.8) |
| `$schema` | **no** |
| **`distribution`** | **no** |
| `naming_convention` | **no** |
| `conditional_install` | **no** |
| `model_strategy` | **no** |
| `file_copy_as` | **no** |
| `file_merge` | **no** |

Búsqueda literal de `distribution` en ambos documentos de mantenedor:
`docs/adoption/contract-spec.md` → **0 ocurrencias**; `docs/adoption/cli-integration-guide.md` →
**0 ocurrencias**.

### H-0.1 — El algoritmo de referencia contradice la existencia de `distribution`

`docs/adoption/cli-integration-guide.md:89-90`, paso 6 del pseudocódigo de adopción:

```
// 6. Copiar template (excluye historia git del template)
copyTree(templateSource, destination, exclude=[".git/"])
```

El algoritmo documentado copia **el árbol completo** salvo `.git/`, y recorta después con
`clean.files_to_remove` (paso 10, líneas 120-122). Bajo ese modelo, `.gitattributes` y
`package.json` **sí** llegarían al consumidor, y el arreglo del hueco 1 sería innecesario. Bajo un
modelo de allowlist regida por `distribution`, **no** llegan, y el arreglo es obligatorio.

Los dos modelos son incompatibles y **ambos están presentes en este repositorio**: uno en la guía,
el otro implícito en las 54 entradas de `distribution`. La implementación real vive en
`guide-ia/cli`, fuera de este repositorio.

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** Que el CLI implemente `distribution` como allowlist
> autoritativa (y no como metadato informativo) no es verificable desde este repositorio.
> **Es la primera pregunta a resolver con el equipo del CLI**, porque determina si el hueco 1
> es un defecto real o un falso positivo. La coexistencia de `clean.files_to_remove` con 12
> entradas — que solo tiene sentido si algo se copió de más — es evidencia *circunstancial* a
> favor del modelo `copyTree`, no prueba.

### H-0.2 — El checklist de mantenimiento del template está desactualizado

`docs/adoption/cli-integration-guide.md:299`:

```
- [ ] `node .claude/scripts/validate-template.mjs` pasa 12/12 en el template.
```

El validador hoy corre **35 checks** (`32 ok, 2 warn, 1 error` en la corrida de referencia de esta
rama). El checklist §8 tampoco menciona `distribution`, `file_merge` ni `file_copy_as`, así que un
mantenedor que lo siga al pie de la letra **no revisa** la clave donde vive el hueco 1.

### H-0.3 — No existe ADR sobre distribución ni sobre versionado del contrato

Inventario verificado:

- `docs/architecture/decisions/`: ADR-001, ADR-010 a ADR-020. Ninguno trata distribución,
  adopción, contrato CLI ni EOL.
- `docs/adoption/`: ADR-002 a ADR-010. Ninguno trata distribución ni contrato CLI.

El artefacto más cercano a una decisión registrada es `docs/adoption/contract-spec.md`, que es una
**especificación**, no un ADR: no declara contexto, alternativas evaluadas ni consecuencias.
Por CORE-005, la decisión de distribuir por allowlist declarativa (y su alternativa, copia total
más recorte) es una decisión técnica significativa **sin ADR** — deuda documental **major**.

`ASDD-VERSIONING.md:20` y `:41` sí reconocen `contract_version` como uno de los ejes de versionado,
y §8 (líneas 144-157) define el formato de las guías de migración MAJOR. Pero
`ASDD-VERSIONING.md` está en `clean.files_to_remove` y `.claude/docs/migrations/` también, así que **la
política de actualización no se distribuye al consumidor**.

### H-0.4 — Contenido interno del mantenedor se distribuye vía `docs/testing/`

`distribution` incluye `docs/testing/` completo (entrada 47). `clean.files_to_remove` excluye
selectivamente `.claude/memory/` (2 archivos), `.claude/docs/migrations/`, `docs/runs/`, `.claude/evals/`,
`ASDD-MEMORY.md`, `ASDD-VERSIONING.md`, `docs/adoption/cli-integration-guide.md`,
`docs/adoption/contract-spec.md`, `.asdd-run.json` y 2 ADRs internos — pero **no** el contenido de
`docs/testing/`, que hoy acumula artefactos de verificación del propio template (incluido este
documento).

Nótese la asimetría: `create_dirs` ya crea `docs/testing/` con `.gitkeep` (entrada 8 de
`create_dirs`), así que el consumidor tendría el directorio **sin necesidad** de recibir su
contenido.

#### Decisión del maintainer (2026-08-03) — `docs/**` se distribuye vacío

El maintainer resolvió H-0.4 con un criterio más amplio que el hallazgo original:

> Toda la carpeta `docs/` — excepto `docs/.example/` — debe distribuirse completamente
> limpia. Ninguna documentación de mantenimiento del template llega al consumidor. Si el
> proyecto consumidor ya tiene documentos en esas rutas, se conservan tal como los tiene
> el consumidor.

Traducido al contrato, la decisión tiene dos partes independientes:

**(a) La allowlist de `docs/**` se reduce a dos entradas.** De las 22 entradas `docs/**` de
`distribution`, sobreviven `docs/.example/` (entrada 27) y `docs/.gitkeep` (entrada 28). Las
20 restantes (entradas 29-48) salen.

**(b) `docs/**` nunca sobrescribe.** El consumidor es el dueño de su `docs/`. La semántica
requerida es la de `file_copy_as` (`when_target_exists: "skip"`), no la copia incondicional
del paso 6 del pseudocódigo de `cli-integration-guide.md` — lo que refuerza H-0.1.

##### Consecuencia medida — 27 referencias colgantes en 11 archivos que sí se distribuyen

Aplicar (a) literalmente sobre el contrato actual deja **27 referencias a rutas
inexistentes** en archivos que el consumidor sí recibe. Medición sobre los 633 archivos
distribuidos que no son `docs/**`:

| Archivo distribuido que referencia | Rutas que dejarían de existir | Refs |
|---|---|---|
| `ASDD-CHANGELOG.md` | 11 rutas de `docs/adoption/` y `docs/` raíz | 11 |
| `CLAUDE.md` | `.claude/docs/adoption/model-strategy.md`, `.claude/docs/adoption/naming-convention.md`, `.claude/docs/mcps-by-domain.md`, `.claude/docs/plugins-by-role.md`, `.claude/docs/validation.md` | 5 |
| `.claude/references/rules/asdd-git-safety.md` | `docs/adoption/ADR-007-git-guards-threat-model-reenfoque.md` | 1 |
| `.claude/references/rules/asdd-spec-guard.md` | `docs/adoption/ADR-004-spec-per-area-model.md` | 1 |
| `.claude/commands/asdd/qa-web-setup-app.md` | `.claude/docs/adoption/atf-web-setup-dependencies.md` | 1 |
| `.claude/reference/coordinators/asdd-atf-web-qa-engineer-rollback.md` | `.claude/docs/adoption/atf-web-setup-dependencies.md` | 1 |
| `.claude/hooks/asdd-user-prompt-submit.mjs` | `.claude/docs/adoption/smart-data-integration-plan.md` | 1 |
| `.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs` | `docs/smart-data/data/smart-data-cliente.xlsx` | 1 |
| `.mcp.recommended.json` | `.claude/docs/adoption/mcps-quickstart.md` | 1 |
| `.gitignore` | `docs/smart-data/data/smart-data-cliente.xlsx` | 1 |
| `.asdd/workspace.json` | `.claude/docs/adoption/worktree.md` | 1 |

Dos de esas referencias viven en **código de hook** y dos en **reglas que el consumidor
carga en runtime** — no son prosa que se pueda dejar colgando.

`docs/testing/` es el caso opuesto y **confirma** la decisión: sus 136 referencias son
agentes que *escriben* artefactos ahí, no documentación que alguien lea. `create_dirs`
(entrada 8) ya crea el directorio con `.gitkeep`, así que sacarlo de `distribution` no
rompe nada. Lo mismo aplica a `docs/tech/`, `docs/qa/` y `docs/security/`, que ya solo
están en `create_dirs`.

##### Resolución propuesta — separar por audiencia, no por carpeta

La decisión es correcta y la contradicción es aparente. Se resuelve reconociendo que hoy
`docs/` mezcla dos cosas que no tienen la misma audiencia:

1. **Espacio de artefactos del consumidor** — lo que ASDD *escribe* siguiendo ART-001
   (`docs/specs/`, `docs/architecture/`, `docs/tech/`, `docs/testing/`, `docs/qa/`,
   `docs/security/`). Debe llegar **vacío**, y `create_dirs` ya lo cubre.
2. **Manual del framework** — lo que el consumidor *lee* para operar ASDD
   (`docs/adoption/*`, `.claude/docs/validation.md`, `.claude/docs/mcps-by-domain.md`,
   `.claude/docs/plugins-by-role.md`). No es documentación de mantenimiento: CLAUDE.md la
   referencia como parte del onboarding y dos reglas la citan en runtime.

Mover el grupo 2 a `.claude/docs/` — que ya está en `distribution` (entrada 5) y que la
propia regla `asdd-claude-md-maintenance.md` designa como destino del detalle que no
cabe en CLAUDE.md — cierra las dos mitades sin conflicto: `docs/**` queda genuinamente
vacío salvo `.example/`, y las 27 referencias se actualizan en el mismo cambio.

**Migración requerida** (owner: Template):

| Paso | Detalle |
|---|---|
| 1 | Mover 18 archivos de manual a `.claude/docs/`: los 14 de `docs/adoption/` que hoy se distribuyen, `docs/architecture/decisions/ADR-020-*`, `.claude/docs/mcps-by-domain.md`, `.claude/docs/plugins-by-role.md`, `.claude/docs/validation.md` |
| 2 | Mover `docs/smart-data/data/smart-data-cliente.xlsx` a `docs/.example/` — es una plantilla semilla, no manual |
| 3 | Actualizar las 27 referencias (2 de ellas en código de hook, 2 en reglas de runtime) |
| 4 | Reducir la allowlist `docs/**` de `distribution` a `docs/.example/` + `docs/.gitkeep` |
| 5 | Declarar en el contrato la política no-sobrescritura de (b) para `docs/**` |
| 6 | Sacar de `distribution` los artefactos de mantenimiento puro sin destino nuevo: `docs/testing/` |

Los artefactos de mantenimiento que ya estaban excluidos vía `clean.files_to_remove`
(`docs/runs/`, `.claude/docs/migrations/`, `docs/adoption/cli-integration-guide.md`,
`docs/adoption/contract-spec.md`, los 2 ADR-001 internos) pasan a estar cubiertos
estructuralmente por la allowlist reducida, lo que hace redundantes esas entradas de
`clean` y elimina la clase de error de "olvidé excluir el artefacto nuevo".

### Recomendación H-0

| Acción | Owner | Prioridad |
|---|---|---|
| Actualizar `contract-spec.md` a v2.3: documentar `distribution`, `file_merge`, `file_copy_as`, `naming_convention`, `conditional_install`, `model_strategy`, `$schema`. Declarar explícitamente si `distribution` es allowlist autoritativa | Template | 1 |
| Corregir el paso 6 del pseudocódigo de `cli-integration-guide.md` para que refleje el modelo real | Template + CLI (acuerdo) | 1 |
| Actualizar el checklist §8 (conteo de checks y claves a revisar) | Template | 2 |
| Escribir ADR de distribución y versionado del contrato (CORE-005) | `asdd-solution-architect` | 2 |
| **DECIDIDO** — reducir la allowlist `docs/**` a `docs/.example/` + `docs/.gitkeep` y mover el manual del framework a `.claude/docs/` (ver "Decisión del maintainer" arriba) | Template | 1 |
| Declarar la política no-sobrescritura de `docs/**` en el contrato (`when_target_exists: "skip"`) | Template + CLI (acuerdo) | 2 |

---

## Hueco 1 — `.gitattributes` no está en `distribution`

**Severidad: blocker. Esfuerzo: muy bajo. Owner: Template. No requiere cambios en el CLI.**

### Evidencia

`distribution` tiene **54 entradas**. Las 6 de nivel raíz (sin separador de ruta) son:

```
ASDD-CHANGELOG.md
CLAUDE.md
.gitignore
.mcp.json
.mcp.recommended.json
README.md
```

| Archivo | En `distribution` |
|---|:-:|
| `.gitignore` | **sí** |
| `.gitattributes` | **no** |
| `package.json` | **no** |

`.gitattributes` existe en este repositorio (creado en la fase 1 de la remediación) y está
*tracked* en el índice, pero todavía **no está en `HEAD`** — forma parte del trabajo sin commitear
de esta rama. Declara política de EOL scoped por extensión: `text eol=lf` para 25 patrones de
código/config/docs, `text eol=crlf` para `*.ps1`, `*.psm1`, `*.bat`, `*.cmd`, y `binary` para 13
patrones binarios incluido `*.xlsx`.

### Impacto en proyectos consumidores

Sin esa entrada, **ningún proyecto consumidor recibe la política de EOL**, y la clase de defecto
que esta remediación cerró se sigue reproduciendo en cada proyecto de la compañía y de cada
cliente que adopte el template.

Magnitud del daño que esta clase ya causó **dentro** de este template, para dimensionar:

- **5 hashes** de `.asdd/coordinator-loading.json` estaban almacenados como rendering CRLF
  (regenerados en Windows y commiteados con el valor local). Pasaban en Windows y **fallaban en
  Linux/CI**. Sobre un total de **21 entradas de hash bajo validación** (9 en
  `rule-loading.json` → `entries[].reference_sha256`; 12 en `coordinator-loading.json` →
  `rollback_sha256` y `routes[].sha256` de los coordinadores
  `asdd-atf-web-qa-engineer` y `asdd-ba-functional-architect`), son **casi una cuarta
  parte del universo hasheado**.
- **16 ítems** reportaban `SHA-256 mismatch` falso en Windows.
- **124 archivos** tienen CRLF commiteado **dentro del repositorio**, no solo en el working tree.

Ese último número se refina con medición directa sobre el índice en el momento de esta auditoría:

```
git ls-files --eol  →  974 archivos de texto en el índice
                       99 con  i/crlf
                       25 con  i/mixed
                      ---
                      124 con CRLF commiteado (99 puros + 25 mixtos)
```

Distribución por extensión de esos 124: **81 `.js`**, 38 `.md`, 2 `.html`, 1 `.py`, 1 `.json`,
1 `.css`.

Estado actual de esos archivos en la rama: `attr/text eol=lf` ya aplica y el working tree reporta
`w/lf`, con 151 modificaciones sin *stage* pendientes en la rama — consistente con una
renormalización en curso en disco, pendiente de commit. **El blob del índice sigue en CRLF hasta
que esa renormalización se commitee.**

### Factor agravante — `post_install` con `must_pass` y `on_fail: rollback`

```json
"post_install": { "steps": [{
  "id": "validate-template",
  "command": "node .claude/scripts/validate-template.mjs",
  "must_pass": true,
  "on_fail": "rollback"
}]}
```

Un `SHA-256 mismatch` falso durante la adopción **aborta la instalación completa con rollback**.
No es un warning cosmético: es una adopción fallida.

Mitigación parcial ya lograda: `.claude/scripts/lib/` **sí** está en `distribution`, así que el
consumidor recibe `asdd-hash-normalize-lib.mjs`, y `validate-template.mjs` (también
distribuido) la importa en la línea 15 y la aplica en su lector (`const read = (f) =>
normalizeForHash(...)`, línea 63). El validador distribuido, por tanto, ya es CRLF/BOM-insensible.

Eso reduce el riesgo del validador, pero **no reemplaza a `.gitattributes`**: la protección en
código cubre solo los bytes que el validador hashea, mientras la política de EOL cubre todo lo
demás — scripts POSIX que el consumidor agregue, sus propios artefactos hasheados, sus binarios y
su herramienta de CI.

### Opciones evaluadas

| Opción | Trade-off | Veredicto |
|---|---|---|
| **A. Agregar `.gitattributes` a `distribution`** | 1 línea. Nulo riesgo de regresión en el template. Su efecto depende de H-0.1: si el CLI ya hace `copyTree`, la entrada es redundante pero inocua | **Recomendada** |
| **B. Agregarlo también a `file_merge` con `append-unique`** (como `.gitignore`) | Respeta un `.gitattributes` propio del consumidor. Pero `append-unique` sobre reglas de EOL puede producir precedencia ambigua: en `.gitattributes` gana la **última** regla que matchea, así que un append cambia semántica según el orden. `requires_cli: "0.4.0"` ya está soportado por la estrategia | Descartada en primera iteración; reconsiderar solo si aparecen consumidores con `.gitattributes` propio |
| **C. Dejarlo fuera y confiar en la normalización en código (fase 2)** | Cero trabajo. Deja la protección dependiendo de que cada herramienta futura recuerde normalizar. Antipatrón simétrico al de la sección "Qué NO hacer" | Descartada |
| **D. Distribuir `package.json` para llevar `engines`** | Colisiona con el `package.json` del consumidor, que es suyo. Requeriría `file_merge` con estrategia de merge de JSON, que el contrato no tiene | Descartada — ver hueco 2 |

### Recomendación

1. Agregar la entrada `.gitattributes` a `distribution`, junto a `.gitignore`.
2. Resolver H-0.1 con el equipo del CLI **antes** de dar el hueco por cerrado: si `distribution`
   no es allowlist, la entrada no cambia nada y el arreglo real es otro.
3. En este repositorio, confirmar que la renormalización del índice (`git add --renormalize .`)
   queda commiteada en esta rama; de lo contrario los 124 blobs con CRLF siguen ahí y el template
   distribuye el problema que la política pretende prevenir.
4. Documentar `.gitattributes` en `.claude/docs/adoption/adoption-checklist.md` como artefacto que el
   consumidor recibe y no debe borrar.

---

## Hueco 2 — El piso de Node declarado: en fin de vida, multiplicado y no expresable

**Severidad: major. Esfuerzo: bajo en el template, medio en el CLI. Owner: Template + CLI.**

Este hueco resultó más ramificado de lo que planteaba el encargo, y en un punto **la premisa
requiere corrección**. Lo separo en tres sub-hallazgos.

### H-2.a — Corrección de la premisa: el runtime distribuido no exige Node 20.11

El encargo planteaba que `node>=18` es *técnicamente insuficiente* porque el código usa
`import.meta.dirname` (Node ≥ 20.11; en Node 18 devuelve `undefined` y el fallo se manifiesta
como `TypeError` opaco). El barrido confirma el uso de la API — **20 ocurrencias en 17 archivos** —
pero también que **ninguno de esos archivos está en `distribution`**. Todos son scripts de test,
benchmark o eval que se quedan en el repositorio del mantenedor:

```
.claude/scripts/benchmark-pretool-hooks.mjs:9
.claude/scripts/benchmark-runtime-integral.mjs:8
.claude/scripts/benchmark-prompt-injection.mjs:6
.claude/scripts/eval-orchestrator-model-routing.mjs:6
.claude/scripts/test-conditional-orc-injection.mjs:10
.claude/scripts/test-conditional-rule-loading.mjs:10
.claude/scripts/test-cli-runtime-distribution.mjs:8
.claude/scripts/test-dispatcher-dfx-001.mjs:10
.claude/scripts/test-dispatcher-collector-coexistence.mjs:15
.claude/scripts/test-lazy-capability-loading.mjs:17
.claude/scripts/test-pretool-dispatcher-prototype.mjs:9, :13
.claude/scripts/test-pretool-dispatcher-registration.mjs:9
.claude/scripts/test-pretool-dispatcher.mjs:9, :11, :16
.claude/scripts/test-runtime-efficiency-consumer-e2e.mjs:7
.claude/scripts/test-runtime-efficiency-nested-git-consumer.mjs:8
.claude/scripts/test-subagent-budget-routing.mjs:20
.claude/scripts/test-thin-coordinator-loading.mjs:10
```

Los scripts **distribuidos** resuelven su directorio con el patrón compatible desde Node 10:

```
.claude/scripts/asdd-resolve-workspace.mjs:53   const HERE = dirname(fileURLToPath(import.meta.url));
.claude/scripts/asdd-run-bootstrap.mjs:17       const HERE = dirname(fileURLToPath(import.meta.url));
```

**Conclusión:** el piso de Node ≥ 20.11 aplica al **harness del mantenedor**, no al runtime que
recibe el consumidor. `node>=18` no es *funcionalmente* incorrecto para el consumidor hoy. El piso
real del runtime distribuido, según el barrido completo, es **Node ≥ 16.9** (detalle en la tabla
de abajo). Sigue siendo cierto que el piso está mal declarado, pero **el motivo dominante es
seguridad y fin de vida, no funcionalidad**.

Barrido completo de APIs con piso alto sobre `.claude/scripts/`, `.claude/hooks/` y
`.claude/tools/`:

| API | Piso de Node | Ocurrencias en artefactos **distribuidos** (`archivo:línea`) | Ocurrencias solo en el harness |
|---|---|---|---|
| `import.meta.dirname` | 20.11 | **ninguna** | 20 en 17 archivos (lista arriba) |
| `Object.hasOwn` | 16.9 | `.claude/hooks/asdd-pre-tool-dispatcher.mjs:38` · `.claude/scripts/lib/asdd-frontmatter-lib.mjs:142` · `.claude/scripts/lib/asdd-run-reconciliation-lib.mjs:76` | `test-pretool-dispatcher-contract.mjs:11` |
| `.at(-1)` | 16.6 | `.claude/scripts/lib/asdd-frontmatter-lib.mjs:10` | `benchmark-pretool-hooks.mjs:113` |
| `??=` | 15.0 | `.claude/scripts/lib/asdd-plan-authorization-lib.mjs:429` · `asdd-resolve-workspace.mjs:334` · `asdd-run-bootstrap.mjs:138`, `:167` | `asdd-pretool-mode.mjs:34` |
| `.replaceAll()` | 15.0 | presente (28 ocurrencias en total, no desglosadas — el piso ya está cubierto por `??=`) | — |
| `structuredClone` | 17.0 | **ninguna** | `test-lazy-capability-loading.mjs:114` · `test-reconcile-run-state.mjs:103` |
| `realpathSync.native` | 9.2 | `asdd-resolve-workspace.mjs:42` | — |
| `.flatMap()` | 11.0 | presente (20 ocurrencias) | — |
| `Object.groupBy` / `Map.groupBy` | 21.0 | **ninguna** — el único match de `.groupBy` (`.claude/tools/db-adapters/mock-adapter.js:166`) es una propiedad de objeto propio, **falso positivo** | — |
| `.findLast`, `.toSorted`, `.toReversed`, `Array.fromAsync`, `AbortSignal.timeout`, `fs.cp` | 18–22 | **ninguna** | ninguna |

### H-2.b — Nuevo hallazgo: el piso está declarado en 4 sitios distribuidos que pueden divergir

El encargo apuntaba a `compatibility.required_tools`. Hay **un segundo sitio acoplado** que el CLI
consume en el mismo flujo de adopción, y **dos más** de documentación, todos distribuidos:

| Sitio | Valor actual | ¿Se distribuye? |
|---|---|:-:|
| `.asdd/cli-contract.json:14` → `compatibility.required_tools` | `["node>=18", "git>=2.30"]` | sí (`.asdd/` completo) |
| `.asdd/checklist.json:9` → `pre_install[0].expect_regex` | `^v(1[89]\|[2-9][0-9])\.` | sí (`.asdd/` completo) |
| `.claude/dashboard/package.json:16-18` → `engines.node` | `>=18` | sí (`.claude/dashboard/`) |
| `.claude/docs/validation.md:47` y `:186` (prosa) | `Node.js >= 18` | sí |
| `docs/adoption/contract-spec.md:87` (ejemplo de la spec) | `node>=18` | no (`clean.files_to_remove`) |
| `package.json` de la raíz | **sin `engines`** | no |

El `checklist.json` es el que el CLI ejecuta de verdad:
`docs/adoption/cli-integration-guide.md:171` documenta que `runPreInstallCheck` corre
`node --version` y compara stdout con `expect_regex`. Y `contract-spec.md:97` establece la
semántica de `required_tools`: *"Si el entorno no cumple, el CLI aborta antes de copiar"*.

**Consecuencia:** cambiar solo `required_tools` no sube el piso — el gate efectivo es el regex del
checklist. Si se cambia uno y no el otro, el contrato declara una cosa y el CLI hace otra.
Confirma, además, que la premisa del encargo es correcta en su punto central:
`compatibility.required_tools` (más `checklist.json`) **es** el lugar correcto para el piso,
porque `package.json` no se distribuye y su `engines` no lo vería nadie.

### H-2.c — Nuevo hallazgo: el mecanismo de verificación no puede expresar un piso de minor

`expect_regex: "^v(1[89]|[2-9][0-9])\\."` compara la **cadena** de `node --version`. Ese mecanismo
tiene un límite estructural: **no puede expresar "≥ 20.11"**. Un regex como
`^v(2[0-9]|[3-9][0-9])\.` aceptaría `v20.0.0`, que carece de `import.meta.dirname`. Expresar un
piso de minor por regex requiere una alternancia frágil y difícil de auditar.

El mismo defecto afecta a git: `^git version 2\.` acepta git 2.0 (no cumple el `>=2.30` declarado
en el contrato) y **rechazaría git 3.x** cuando exista. El regex es a la vez demasiado laxo y
demasiado estrecho.

### H-2.d — Estado de la línea Node 18

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** El encargo afirma que Node 18 llegó a *end-of-life* y no
> recibe parches de seguridad. **No es verificable desde este repositorio** y no se registra fecha
> aquí a propósito. El calendario de soporte de Node cambia y debe consultarse en la fuente
> oficial (`nodejs.org`, página de releases anteriores / *release schedule*) **en el momento de
> decidir el piso**. La recomendación de abajo se sostiene sin depender de una fecha concreta,
> porque se apoya en un argumento independiente: elegir un piso de **major** completo evita el
> límite estructural de H-2.c.

### Opciones evaluadas

| Opción | Trade-off | Veredicto |
|---|---|---|
| **A. Subir a `node>=22` en contrato + checklist, regex `^v(2[2-9]\|[3-9][0-9])\.`** | Un major completo: todas las minors de 22.x tienen `import.meta.dirname`, así que **elimina el problema de H-2.c sin cambiar el CLI**. Alinea harness y runtime en un solo piso. Costo: excluye entornos empresariales que aún estén en 18/20 | **Recomendada** |
| **B. Subir a `node>=20.11` con regex de alternancia de minors** | Piso mínimo técnicamente exacto. Pero el regex resultante es frágil y no auditable; hereda H-2.c en vez de resolverlo | Descartada |
| **C. Reemplazar `expect_regex` por comparación semver en el CLI** (`type: "semver_gte"`) | Solución de fondo: cualquier piso futuro se declara sin acrobacias de regex. Requiere cambio en el CLI y bump MINOR de contrato | **Recomendada como seguimiento**, no bloqueante para A |
| **D. Declarar dos pisos: uno de runtime (consumidor) y uno de harness (mantenedor)** | Es lo más fiel a la realidad medida (≥16.9 vs ≥20.11). Pero duplica la superficie de declaración y el consumidor no gana nada por instalar una línea vieja | Descartada — se documenta la distinción aquí y basta |
| **E. Añadir `engines` al `package.json` de la raíz** | No sirve como gate: `package.json` no se distribuye y npm por defecto solo emite warning ante `engines` incumplido | Descartada como gate; útil solo como señal para el mantenedor |

### Recomendación

1. Subir el piso a **`node>=22`** en `compatibility.required_tools` **y** en
   `checklist.json` → `pre_install[0].expect_regex` → `^v(2[2-9]|[3-9][0-9])\.`, **en el mismo
   commit**. Verificar contra el calendario oficial de Node en el momento de decidir (H-2.d).
2. Alinear los sitios de documentación distribuidos: `.claude/dashboard/package.json` → `engines.node`,
   `.claude/docs/validation.md:47` y `:186`. Y el ejemplo de `contract-spec.md:87` aunque no se distribuya,
   para que el mantenedor no lo replique.
3. Corregir el regex de git a algo que exprese `>=2.30` de verdad, o migrar a comparación semver.
4. Abrir seguimiento en `guide-ia/cli` para `type: "semver_gte"` en `checklist.pre_install`
   (opción C) — bump MINOR de contrato, sin urgencia si se adopta A.

---

## Hueco 3 — Sin manifiesto de hashes, el CLI no puede hacer merge selectivo

**Severidad: major. Esfuerzo: alto. Owner: Template + CLI (contract v2.4). Bloqueado por el CLI.**

### Evidencia — el contrato no tiene ninguna noción de contenido

Búsqueda literal sobre el JSON completo de `.asdd/cli-contract.json`:

| Clave buscada | Ocurrencias |
|---|:-:|
| `sha`, `hash`, `checksum`, `merge_strategy`, `upgrade`, `eol`, `crlf`, `encoding`, `normalize`, `bom`, `integrity`, `diff`, `overwrite`, `update` | **0** |
| `line` | 2 — ambas coincidencias parciales dentro de `.claude/docs/adoption/statusline.md` y de un valor no relacionado |
| `verify` | 1 — el valor `"verify"` del enum de fases ASDD, sin relación con integridad |

Lo único que existe para tratar archivos preexistentes:

- **`file_merge`: una sola entrada.** `.gitignore` con `strategy: "append-unique"`,
  `when_exists: "merge"`, `when_missing: "create"`, `requires_cli: "0.4.0"`.
- **`file_copy_as`: una sola entrada.** `README.md` → `ASDD-README.md` con
  `when_target_exists: "skip"`.
- **Todo lo demás en `distribution` es copia plana que sobreescribe.**

Es decir: **el CLI no compara contenido, sobreescribe.** Nunca detectó cambios falsos por cambio de
sistema operativo porque no detecta cambios en absoluto. Coherente con el algoritmo de referencia
(`copyTree` en el paso 6) y con el paso 4, que solo distingue *destino vacío* de
*destino ocupado + `--force`*: **no hay flujo de actualización, solo adopción con sobreescritura**.

`docs/adoption/cli-integration-guide.md` §9 "Evolución futura" (líneas 302-313) prevé tres cambios
MINOR (`multi-select` en `personalize`, `clean.replace_strings`, `post_install.steps[*].env`) y
**ninguno** relacionado con hashes, merge o actualización. Confirma que este hueco no tiene diseño
previo: **hay que proponerlo de cero**, no referenciar algo existente.

Lo que sí existe, y es lo más cercano a una política de actualización, es
`ASDD-VERSIONING.md:165-169`:

> **¿Cómo actualizo mi proyecto al último template?** Usá `guide-ai update` si el CLI lo soporta, o
> compará tu `.asdd/asdd.lock.version` contra la versión del repo fuente. Si el bump
> es PATCH o MINOR, copiar los archivos modificados es seguro. Si es MAJOR, seguí
> `.claude/docs/migrations/{N-1}-to-{N}.md`.

Ese texto **es exactamente la fricción** que este hueco describe ("copiar los archivos
modificados" a mano), condicionada a un `guide-ai update` cuyo soporte no se afirma. Y
`ASDD-VERSIONING.md` está en `clean.files_to_remove`, igual que `.claude/docs/migrations/`: **el consumidor
no recibe ni la FAQ de actualización ni las guías de migración**.

### La necesidad que queda abierta

Planteada por el mantenedor del framework: al actualizar de una versión del ASDD a la siguiente, el
usuario no debería tener que resolver a mano un merge por cada archivo cuya única diferencia sea el
carácter invisible de fin de línea. Lo deseable es que el CLI pueda responder *"¿el archivo que el
usuario tiene es exactamente el de la versión anterior?"* y, si la respuesta es sí, sobreescribir
sin fricción; reservando el merge para los archivos con diferencia real de contenido.

Para eso el CLI necesita hashes por archivo y por versión, y el contrato no publica ninguno.

| Repositorio | Qué necesita aportar |
|---|---|
| **Template (este)** | Publicar un manifiesto de hashes por archivo en cada release, calculado **con normalización**. La lib `.claude/scripts/lib/asdd-hash-normalize-lib.mjs` (fase 2) ya implementa exactamente esa normalización — CRLF→LF y strip de BOM. Y `npm run hash:regen` ya es el generador idempotente |
| **CLI (`guide-ia/cli`)** | Consumir el manifiesto y decidir sobreescritura vs merge por archivo. Sería **contract v2.4** |

La pieza del template está más cerca de lo que parece: la normalización ya es fuente única de
verdad compartida entre validador y generador, por diseño explícito. El generador
(`.claude/scripts/asdd-regen-hashes.mjs:36`) importa `readNormalized` de la lib; el validador
(`.claude/scripts/validate-template.mjs:15`) importa `normalizeForHash` de la misma lib y la aplica
en su lector único (línea 63). El comentario de cabecera del generador (líneas 9 y 15) documenta el
porqué: los hashes *"se regeneraban a mano con `sha256sum`/`certutil`/`Get-FileHash`, y así fue
como"* entró la contaminación; validador y generador **nunca** deben reimplementar la
normalización.

### H-3.a — Nuevo hallazgo: el generador de hashes no se distribuye, y el fallo no dice qué hacer

`.claude/scripts/asdd-regen-hashes.mjs` **no está en `distribution`** (de los 67 `.mjs` de
`.claude/scripts/`, solo **10** se distribuyen individualmente, más `lib/` completo). `package.json`
tampoco se distribuye, así que **`npm run hash:regen` no existe para el consumidor**.

Pero el consumidor **sí** recibe los archivos hasheados (`.asdd/` completo) y sus objetivos
(`.claude/references/` es la entrada 8 de `distribution`), y **sí** recibe el validador que
verifica los 21 hashes. Si un consumidor personaliza una referencia de regla — algo que el template
no prohíbe — el validador falla con un mensaje sin remediación:

```
.claude/scripts/validate-template.mjs:856    details.push(`${entry.name}: reference SHA-256 mismatch`);
.claude/scripts/validate-template.mjs:1001   details.push(`${name}: rollback SHA-256 mismatch`);
.claude/scripts/validate-template.mjs:1021   details.push(`${name}.${route.name}: SHA-256 mismatch`);
```

Ninguno menciona un regenerador. Y con `post_install.must_pass: true` + `on_fail: rollback`, en el
momento de la adopción eso es una instalación abortada sin salida documentada.

Nota tranquilizadora del mismo barrido: se verificó que **ninguno** de los 7 scripts no
distribuidos con aspecto de runtime (`asdd-artifact-runtime`, `asdd-context-budget`,
`asdd-pre-tool-dispatcher-prototype`, `asdd-pretool-mode`,
`asdd-reconcile-run-state`, `asdd-regen-hashes`, `asdd-runtime-metrics`) es
referenciado desde artefactos distribuidos (agentes, skills, rules, references, commands, hooks,
`settings.json`, `.asdd/`, `.claude/docs/validation.md`, `CLAUDE.md`). No hay referencias colgantes:
la allowlist es coherente en ese aspecto. El problema de H-3.a es la **ausencia de una vía de
remediación**, no una referencia rota.

### Análisis de magnitud — esto matiza la urgencia

Con `core.autocrlf=true` git ya almacena LF **dentro** del repositorio y materializa CRLF en disco.
Así que los blobs commiteados de un consumidor típico probablemente ya estén en LF, y escribirle
archivos LF **no produciría diff**. La fricción real vendría solo de archivos con CRLF commiteado
en el repo — en este template encontramos **124 sobre 974 archivos de texto (12,7 %)**: dos órdenes
de magnitud menos que el total si se mira archivo por archivo del árbol completo, pero **no cero**.

> **HIPÓTESIS — REQUIERE VALIDACIÓN.** Que la contaminación de un consumidor real sea de magnitud
> comparable al 12,7 % medido aquí **no se midió sobre ningún proyecto consumidor**. Tampoco se
> midió cuántos consumidores tienen `core.autocrlf=true` frente a `input` o `false`, que es la
> variable que determina si hay diff. Antes de invertir en el manifiesto conviene medir
> `git ls-files --eol | grep -cE "i/crlf|i/mixed"` sobre 2-3 proyectos consumidores reales: es una
> línea de comando y decide si el hueco 3 es prioridad o deuda tolerable.

### Opciones evaluadas

| Opción | Trade-off | Veredicto |
|---|---|---|
| **A. Manifiesto de hashes normalizados por release + `merge_strategy` por archivo en el CLI** | Resuelve el problema de raíz y habilita un `update` real. Requiere: generar y versionar el manifiesto en cada release del template, publicar el de la versión N-1, y lógica nueva en el CLI. Contract v2.4 (MINOR, clave opcional → compatible hacia atrás por `contract-spec.md:24`) | **Recomendada, condicionada** a la medición de magnitud |
| **B. Reutilizar el mecanismo existente `file_merge` archivo por archivo** | Cero cambios en el CLI (`requires_cli: "0.4.0"` ya soportado). Pero `append-unique` es la única estrategia implementada y no aplica a la mayoría de archivos; declarar 54 entradas a mano es inmantenible | Descartada |
| **C. Que el CLI normalice EOL en memoria antes de comparar, sin manifiesto** | Elimina el ruido de EOL sin publicar hashes. Más simple que A. Pero solo responde "¿difiere?", no "¿difiere de la versión anterior o de la que yo edité?" — sigue sin poder distinguir personalización legítima de contenido intacto | **Recomendada como paso 1 de A** — entrega el 80 % del valor con una fracción del costo |
| **D. Documentar la fricción y no automatizar** | Costo casi nulo. Traslada el trabajo manual al consumidor en cada actualización. Aceptable solo si la medición de magnitud da cerca de cero | Fallback |

### Recomendación

1. **Medir primero** (una línea de comando, ver la hipótesis de arriba) antes de comprometer
   esfuerzo alto. La decisión entre A, C y D depende de ese número.
2. Si se avanza, hacerlo por etapas: **opción C** (normalizar en memoria antes de comparar, en el
   CLI) y solo después **opción A** (manifiesto). C ya elimina el ruido de EOL, que es el problema
   concreto reportado.
3. Cerrar H-3.a de forma independiente y barata: distribuir
   `.claude/scripts/asdd-regen-hashes.mjs`, o bien enriquecer los tres mensajes de
   `SHA-256 mismatch` del validador con la instrucción de remediación. Es un arreglo del template,
   sin dependencia del CLI.
4. Registrar la decisión como ADR (CORE-005), dado que H-0.3 confirma que no existe ninguno sobre
   distribución.

---

## Secuencia recomendada

El criterio es: **primero lo que se resuelve solo en este repositorio, después lo que necesita
acuerdo con el CLI, y solo al final lo que necesita un bump de contrato.**

| Orden | Acción | Repositorio | Bloqueado por CLI | Justificación |
|:-:|---|---|:-:|---|
| **1** | Agregar `.gitattributes` a `distribution` (hueco 1) | Template | **No** | Una línea. Corta la reproducción de la clase de defecto en todos los consumidores. Mejor relación impacto/esfuerzo del documento |
| **2** | Confirmar que la renormalización del índice queda commiteada en esta rama | Template | No | Sin esto, el template distribuye 124 blobs con CRLF y la política nueva no cambia nada |
| **3** | Subir el piso de Node a `>=22` en contrato **y** checklist, en el mismo commit (hueco 2, opción A) | Template | **No** | La opción A esquiva el límite del regex sin tocar el CLI. Barato y cierra un piso en fin de vida |
| **4** | Alinear los sitios de documentación del piso: `.claude/dashboard/package.json`, `.claude/docs/validation.md:47` y `:186` | Template | No | Evita que los 4 sitios distribuidos divergan entre sí |
| **5** | Distribuir `asdd-regen-hashes.mjs` o enriquecer los mensajes de mismatch (H-3.a) | Template | No | Da al consumidor una salida ante un fallo que hoy aborta la instalación |
| **6** | Actualizar `contract-spec.md` a v2.3 documentando las 6 claves ausentes, en especial la semántica de `distribution` (H-0) | Template | No | Precondición para que los pasos 7-9 no sean a ciegas |
| **7** | Resolver con el equipo del CLI si `distribution` es allowlist o si rige `copyTree` (H-0.1) | Template + CLI | Sí (pregunta) | Determina si el paso 1 tuvo efecto real. **No bloquea el paso 1**, que es inocuo en ambos escenarios |
| **8** | Medir la contaminación CRLF en 2-3 proyectos consumidores reales | Template + consumidores | No | Decide si el hueco 3 amerita esfuerzo alto |
| **9** | Hueco 3, opción C: normalización en memoria antes de comparar, en el CLI | CLI | Sí | Entrega la mayor parte del valor sin manifiesto |
| **10** | Hueco 3, opción A: manifiesto de hashes + `merge_strategy`. Contract v2.4 | Template + CLI | Sí | Esfuerzo alto, condicionado al paso 8 |
| **11** | ADR de distribución y versionado del contrato (H-0.3, CORE-005) | `asdd-solution-architect` | No | Registra las decisiones de los pasos 1-10 |

Los pasos **1 a 6** se ejecutan íntegramente en este repositorio, sin esperar al CLI.
Cubren el hueco 1 completo, el hueco 2 en su parte accionable, H-3.a y H-0.

---

## Qué NO hacer

Antipatrones concretos, cada uno con el incidente o el mecanismo que lo justifica.

### 1. Distribuir `.gitattributes` **sin** la normalización en código de la fase 2

La política de `.gitattributes` protege solo si cada checkout la respeta: si un consumidor clona
con una configuración que la ignora, si la borra por considerarla ruido del template, o si un
submódulo/worktree no la hereda, la protección desaparece **silenciosamente** y el fallo reaparece
como `SHA-256 mismatch` en CI. La normalización en código
(`.claude/scripts/lib/asdd-hash-normalize-lib.mjs`) es la defensa que no depende de
configuración externa. Son **capas complementarias, no alternativas**: `.gitattributes` previene
que el contenido divergente entre al repositorio; la lib garantiza que, si entró, el veredicto no
cambie según el sistema operativo. Quitar cualquiera de las dos reintroduce la clase de defecto.

### 2. Regenerar hashes a mano con `sha256sum` (o `certutil`, o `Get-FileHash`)

Es exactamente cómo entraron los 5 hashes contaminados de
`.asdd/coordinator-loading.json`. Esas herramientas hashean **bytes crudos de disco**, así
que en Windows con `core.autocrlf=true` producen el hash del rendering CRLF local, que pasa en
Windows y falla en Linux/CI. El único camino soportado es **`npm run hash:regen`**
(`.claude/scripts/asdd-regen-hashes.mjs`), que importa `readNormalized` de la lib compartida
y es idempotente. El propio encabezado del script documenta este incidente en sus líneas 9 y 15
para que no vuelva a pasar.

### 3. Subir `required_tools` sin subir el regex de `checklist.json` (o al revés)

El gate que el CLI ejecuta de verdad es `checklist.json` → `pre_install[0].expect_regex`
(`docs/adoption/cli-integration-guide.md:171`). Cambiar solo `required_tools` deja el contrato
declarando un piso que el CLI no verifica; cambiar solo el checklist deja el contrato mintiendo.
**Mismo commit, siempre.** Ver H-2.b.

### 4. Expresar un piso de minor con un regex de versión

`^v(2[0-9]|[3-9][0-9])\.` **no** significa "≥ 20.11": acepta `v20.0.0`, que carece de
`import.meta.dirname`. Si se necesita precisión de minor, la respuesta es cambiar el mecanismo a
comparación semver en el CLI, no construir una alternancia de regex cada vez más frágil. Ver
H-2.c. El mismo error ya está presente en el gate de git (`^git version 2\.` acepta 2.0 y
rechazaría 3.x).

### 5. Añadir claves nuevas al contrato sin actualizar `contract-spec.md`

Es cómo llegamos a que 6 de 15 claves — incluida `distribution`, donde vive el hueco más grave —
no estén documentadas en ninguna parte, y a que el algoritmo de referencia del CLI contradiga la
existencia de esa clave. El checklist de `cli-integration-guide.md` §8 no la menciona, así que un
mantenedor que lo siga **no la revisa**. Toda clave nueva del contrato entra con su sección en la
spec y su ítem en el checklist, en el mismo cambio.

### 6. Declarar el hueco 3 resuelto por haber publicado el manifiesto

El manifiesto es la mitad del template. Sin la lógica de decisión en el CLI
(`merge_strategy` por archivo), publicarlo no cambia el comportamiento de ninguna actualización:
el CLI seguiría sobreescribiendo. Es un cambio coordinado o no es nada.

### 7. Cerrar el hueco 1 antes de responder H-0.1

Agregar la línea es correcto e inocuo en ambos escenarios, y **debe hacerse ya** (paso 1 de la
secuencia). Lo que no se puede hacer es marcar el hueco como verificado sin confirmar que
`distribution` es allowlist autoritativa: si el CLI hace `copyTree`, la entrada no cambió nada y
el problema real está en otro lado.

---

## Nota de alcance final

### Qué se hizo en este documento

- Se validó, sobre el estado real del repositorio en la rama `fix/os-compatibility`, la evidencia
  de los tres huecos aportada en el encargo. **Toda se confirmó**, con dos refinamientos
  cuantitativos: el 124 se descompone en 99 `i/crlf` + 25 `i/mixed` sobre 974 archivos de texto
  en el índice (12,7 %), y los 21 hashes bajo validación se desglosan en 9 de `rule-loading.json`
  y 12 de `coordinator-loading.json`.
- Se respondieron los 4 puntos de investigación encargados (resultados en H-2.a, hueco 3, H-0.1,
  H-0.3).
- Se **corrigió** un punto de la premisa: el piso de Node ≥ 20.11 aplica al harness del
  mantenedor, no al runtime distribuido, cuyo piso real medido es ≥ 16.9 (H-2.a).
- Se añadieron hallazgos no previstos: H-0 completo (deriva de la spec, contradicción del
  algoritmo de referencia, ausencia de ADR, distribución de `docs/testing/`), H-2.b (4 sitios de
  declaración del piso), H-2.c (límite estructural del regex) y H-3.a (generador no distribuido +
  mensaje de fallo sin remediación).
- Se evaluaron opciones con trade-off y se emitió recomendación explícita por hueco, más una
  secuencia priorizada por relación impacto/esfuerzo y por dependencia del CLI.

### Qué NO se hizo

- **No se modificó ningún artefacto.** El documento es read-only por la capability aplicada
  (`asdd-tech-lead-artifact-audit`). No se tocó `cli-contract.json`, `checklist.json`,
  `contract-spec.md`, `cli-integration-guide.md` ni ningún script.
- **No se corrigió ninguno de los tres huecos** — están fuera del alcance de la remediación
  cross-OS, según la nota de alcance inicial.
- **No se verificó el comportamiento real del CLI.** `guide-ia/cli` es otro repositorio, no
  disponible en esta sesión. Todo lo relativo a su implementación está marcado como hipótesis.
- **No se midió ningún proyecto consumidor real.** Las magnitudes citadas son del template.
- **No se consultó el calendario oficial de soporte de Node.** Las afirmaciones sobre fin de vida
  quedan marcadas como hipótesis, sin fechas inventadas (ART-004).
- **No se ejecutó ningún commit.** GS-003 exige autorización propia y explícita.
- No se tocó el error preexistente del validador
  (`asdd-run-reconciliation — build.index_ref falta o no existe`) ni se silenciaron los 2 warn de
  deuda preexistente.

### Reglas aplicadas

ART-001 (nombre de artefacto run-trazable) · ART-003 (capability cargada como primera operación) ·
ART-004 (afirmaciones no verificables marcadas como hipótesis) · CORE-005 (deuda de ADR reportada)
· GS-001 (rama no protegida verificada) · GS-003 (sin commit) ·
`asdd-spanish-orthography.md`.
