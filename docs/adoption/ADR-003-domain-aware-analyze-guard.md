# ADR-003 — Analyze-guard domain-aware: artefacto de entrada según dominio

> **⚠ UBICACIÓN PROVISIONAL.** Hogar canónico: `docs/architecture/decisions/ADR-003-domain-aware-analyze-guard.md`. Vive en `docs/adoption/` porque los guards WF-002/WF-003 y `artifact-name-guard` bloquean escrituras en `docs/architecture/` y `docs/specs/` sin run activo. El developer que implemente este ADR debe mover el archivo al hogar canónico como último paso.

- **Estado:** Propuesta
- **Fecha:** 2026-07-02
- **Deciders:** _(pendiente — requiere aprobación explícita del usuario/maintainer del template)_
- **Autor:** asdd-solution-architect
- **Rama de trabajo:** `fix/smart-data-brief-equivalent` (creada desde `dev @ 902ad5b`)
- **Relacionados:** ADR-001 (ORC enforcement 3-tiers), ADR-002 (Smart Data flow isolation — Aceptada, v2.25.0). Este ADR es **complementario** a ADR-002, no lo sustituye.
- **Convención de numeración:** ADR-001 y ADR-002 existen; este es el siguiente secuencial → **ADR-003**.

---

## Contexto

Smart Data v2.25.0 se mergeó y liberó (MRs !181→dev, !182→qa, !183→main, tag `v2.25.0`). Las 3 capas anti-interferencia diseñadas en ADR-002 pasaron los tests de sesión real (casos A/B/C/D — dev↔data no se contaminan; ante ambigüedad genuina el orquestador desambigua citando ADR-002).

**Gap descubierto en el test del Caso C (flujo Data end-to-end):** el hook `asdd-pre-tool-use-analyze-guard.mjs` (WF-002) bloquea `Write` sobre `docs/specs/**` si no existe algún `brief-*.md` — comportamiento correcto para software transaccional (donde el brief lo produce `asdd-producto`), pero **incorrecto para Data**: los agentes Data no pueden persistir sus artefactos (`smart-data-eng-discovery-{cliente}.md`, `smart-data-eng-design-{cliente}.md`, `smart-data-eng-governance-assessment-{cliente}.md`, etc.). El flujo corre pero no escribe → el trabajo se pierde.

### Citas de la reunión con el autor de Smart Data (Augusto, científico de datos — 2026-07-02)

Verbatim del transcript analizado:

- *"en data no hay un analista de especificación"* — el brief como práctica no existe en el dominio. No hay analista que lo produzca.
- *"el humano trabaja con su archivo Excel y de ahí en adelante los agentes hacen absolutamente todo"* — el insumo humano es un Excel vivo `smart-data-eng-{cliente}.xlsx`; el humano NO edita los .md.
- *"el orquestador lo único que te puede tocar es esto [el Excel], nada más"* — el Excel es el único artefacto tocable por el humano; los .md son output derivado con "Historial de sincronización" auditable.

Solución preferida por el autor (y anunciada por Andrés en la reunión):

> *"me toca agregarle esta regla para que él diga: 'ah bueno, no tengo el brief, pero esto no es de software, esto es de data, entonces necesito esto… ah, esto sí está, entonces por este lado me voy y escribo la información'"*

Es decir: **guard consciente de dominio**, no exención ciega ni cambio de directorio.

### Estructura del Excel (auditada del binario `smart-data-eng-cliente.xlsx` en `origin/feat/smart-data`)

8 pestañas con dropdowns y validaciones: (1) Guía instrucciones para el humano, (2) Stakeholders, (3) Propuesta — "fuente de verdad" del discover, (4) Restricciones, (5) Fuentes, (6) Plataforma, (7) Diccionario (18 columnas Bronze→Silver, exclusivo de `asdd-data-governance`), (8) Tablas de consumo (Gold). El Excel encapsula lo que en software sería el brief + parte del discovery.

## Decisiones tomadas antes de este ADR (locked)

Se documentan porque condicionan el diseño de la regla:

- El Excel sanitizado se porta al template como **plantilla** en `docs/smart-data/data/smart-data-eng-cliente.xlsx`.
- `.gitignore` en `docs/smart-data/data/` para archivos reales de clientes (excepto la plantilla).
- Sanitización previa al port (responsabilidad del developer, fuera del alcance de este ADR): `docProps.lastModifiedBy` con nombre real, "María Restrepo" + email en Stakeholders, y "fincondor" solo como ejemplo de filename en la Guía.

## Decisión

**El hook `asdd-pre-tool-use-analyze-guard.mjs` se vuelve *domain-aware*, manteniendo su invariante fundamental** ("sin artefacto de entrada de la fase Especificar no se escribe en la carpeta protegida de la fase Analizar"), pero el **artefacto de entrada depende del dominio del archivo que se intenta escribir**:

| Dominio del `.md` a escribir | Artefacto de entrada requerido | Ubicación |
|---|---|---|
| Software transaccional (default) | `brief-*.md` (ya existente) | `docs/specs/brief-*.md` |
| Smart Data | Excel del cliente (nuevo) | `docs/smart-data/data/smart-data-eng-{cliente}.xlsx` |

Se preserva la semántica del guard: la fase Analizar sigue teniendo un pre-requisito duro; solo cambia **qué cuenta como pre-requisito** según el tipo de artefacto que se produce.

### Alternativas evaluadas

- **Alt-A — Exención por directorio o filename para Smart Data.** Descartada: elimina el gate por completo para Data (no valida nada) y contradice la doctrina del framework ("cada fase tiene un artefacto de entrada verificable").
- **Alt-B — Cambiar la ubicación de output de Data a un directorio no protegido** (ej. `docs/data/`). Descartada: rompe la simetría del framework (todas las specs viven en `docs/specs/`) y obliga a duplicar toda la doctrina Data en un árbol paralelo. Fue evaluado y rechazado por Augusto en la reunión ("los .md los generan los agentes y quedan al lado del Excel es aún peor, mezcla trabajo humano y agentic").
- **Alt-C — Domain-aware guard (esta ADR).** Elegida. Mantiene la ubicación canónica `docs/specs/`, respeta la invariante del framework, y refleja fielmente la realidad del dominio Data ("el Excel ES el equivalente al brief").

## Spec exacta de la regla (implementable)

Diseñada para no depender de parsing frágil por posición del filename (los slugs `{tipo}` y `{cliente}` pueden ser multi-palabra: `governance-assessment-acme-retail` → posiciones ambiguas). El guard **deriva la lista de clientes conocidos del filesystem** y usa sufijo-match sobre esa lista.

### Constantes

- `SMART_DATA_INPUT_DIR` = `docs/smart-data/data/` (configurable via `ASDD_SMART_DATA_INPUT_DIR`).
- `SMART_DATA_TEMPLATE` = `smart-data-eng-cliente.xlsx` (el filename literal — NO cuenta como cliente).
- `SMART_DATA_MD_PREFIX_RE` = `/^smart-data-eng-[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\.md$/i` (regex de "candidato a artefacto Data"; matchea `smart-data-eng-{tipo}-{cliente}.md` con `tipo` y `cliente` como slugs kebab-case).

### Algoritmo

Se ejecuta al inicio del hook, antes de la validación existente de brief. **La lógica actual del hook para software no se toca**.

```
1. Si tool_name no ∈ {Write, Edit} → exit 0. (comportamiento actual)
2. Si el path NO está bajo docs/specs/ → exit 0. (comportamiento actual)
3. Si el filename matchea "brief-*.md" → exit 0. (comportamiento actual — briefs son el pre-requisito)
4. NUEVO — clasificar dominio del .md:
   a. Si el filename matchea SMART_DATA_MD_PREFIX_RE → dominio = Data. Continuar en 5.
   b. Si no → dominio = software. Ir al bloque software existente (findBriefFile). Comportamiento actual intacto.
5. NUEVO — validar pre-requisito Data:
   a. Listar SMART_DATA_INPUT_DIR. Si no existe → BLOQUEAR con mensaje M1.
   b. Filtrar entradas: xlsx que coincidan con "smart-data-eng-*.xlsx" Y NO sean SMART_DATA_TEMPLATE.
      → set `clientes` = { extraer "{cliente}" del filename de cada xlsx encontrado, siendo "{cliente}" el sufijo tras "smart-data-eng-" y antes de ".xlsx" }.
   c. Si `clientes` está vacío → BLOQUEAR con mensaje M2.
   d. Extraer del filename del .md el sufijo tras el último "-" que precede a ".md" NO — método frágil. Usar sufijo-match:
      Para cada c ∈ clientes, verificar si el filename del .md TERMINA en "-" + c + ".md".
      Si ALGÚN c matchea → exit 0 (permitir Write).
      Si NINGÚN c matchea → BLOQUEAR con mensaje M3.
```

### Mensajes de bloqueo (accionables, en español, para el usuario final)

- **M1** — `[ASDD WF-002 Data] No existe la carpeta docs/smart-data/data/. Crearla y agregar tu Excel de cliente (copiar de docs/smart-data/data/smart-data-eng-cliente.xlsx y renombrar a smart-data-eng-{cliente}.xlsx) antes de escribir artefactos Data.`
- **M2** — `[ASDD WF-002 Data] No se encontró ningún Excel de cliente en docs/smart-data/data/. La plantilla smart-data-eng-cliente.xlsx no cuenta como cliente. Copiala como smart-data-eng-{cliente}.xlsx (donde {cliente} es el slug de tu cliente en kebab-case) y completá su contenido antes de escribir artefactos Data.`
- **M3** — `[ASDD WF-002 Data] El archivo {path} no matchea ningún cliente conocido en docs/smart-data/data/. Clientes detectados: {lista}. Renombrá el .md para que termine en -{cliente}.md donde {cliente} corresponde a uno de los Excel disponibles, o creá primero el Excel del cliente.`

### Casos edge — decisiones explícitas

1. **¿La plantilla `smart-data-eng-cliente.xlsx` cuenta como habilitante?** **NO.** Filtrada en el paso 5b. Justificación: la plantilla es genérica; si contara, el gate sería falso positivo permanente (existe siempre en el template). El flujo real requiere el Excel del cliente concreto.
2. **`.md` con prefijo `smart-data-eng-` pero sin sufijo de cliente reconocido** (ej. `smart-data-eng-notes.md`, `smart-data-eng-generic.md`). Cae en el paso 5d → BLOQUEAR con M3. Motivación: el naming es ambiguo — el guard no auto-clasifica lo que no coincide con un cliente real.
3. **`.md` bajo `docs/specs/` sin prefijo `smart-data-` y sin `brief-`** (ej. `feature-x.md` sin brief). Comportamiento actual del hook — cae al bloque software y bloquea por falta de brief. **No se altera.**
4. **Múltiples clientes activos** (ej. `smart-data-eng-acme.xlsx` + `smart-data-eng-globex.xlsx`). El guard permite Write de artefactos que terminen en `-acme.md` O `-globex.md`. Cada cliente habilita su propia familia de outputs. Sin cross-talk.
5. **Cliente con nombre multi-palabra** (ej. `smart-data-eng-acme-retail.xlsx` → `clientes = {"acme-retail"}`). El sufijo-match funciona porque compara el string literal completo `-acme-retail.md`, no divide por guiones.
6. **`Edit` sobre un .md existente**: mismo tratamiento que `Write`. Correcto — permite continuar refinando el output Data solo si el Excel del cliente sigue presente.

### Prueba manual del algoritmo con casos reales del dominio

| Archivo `.md` a escribir | xlsx en `docs/smart-data/data/` | Resultado esperado |
|---|---|---|
| `smart-data-eng-discovery-acme.md` | `smart-data-eng-cliente.xlsx` (solo plantilla) | BLOQUEADO (M2) |
| `smart-data-eng-discovery-acme.md` | `smart-data-eng-cliente.xlsx` + `smart-data-eng-acme.xlsx` | PERMITIDO |
| `smart-data-eng-governance-assessment-acme-retail.md` | `smart-data-eng-acme-retail.xlsx` | PERMITIDO (sufijo `-acme-retail.md`) |
| `smart-data-eng-build-run-acme.md` | `smart-data-eng-globex.xlsx` (otro cliente) | BLOQUEADO (M3) |
| `smart-data-eng-validate-signoff-globex.md` | `smart-data-eng-acme.xlsx` + `smart-data-eng-globex.xlsx` | PERMITIDO (matchea `-globex.md`) |
| `smart-data-eng-notes.md` | `smart-data-eng-acme.xlsx` | BLOQUEADO (M3 — no matchea cliente) |
| `brief-checkout.md` | — | PERMITIDO (es brief, comportamiento actual intacto) |
| `feature-checkout.md` | ninguno relevante + sin briefs | BLOQUEADO (regla actual software — falta brief) |
| `feature-checkout.md` | ninguno relevante + `brief-x.md` presente | PERMITIDO (regla actual software — comportamiento intacto) |

## Alcance del cambio (archivos a tocar por el developer)

Cambio quirúrgico. **Cinco archivos**, ordenados por dependencia:

1. **`.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs`** — implementar el algoritmo (~40-60 líneas nuevas: helpers `isSmartDataArtifact`, `listClientesFromInputDir`, `matchesKnownCliente` + orquestación en `main()` antes del check de brief). Preservar la ruta software actual sin modificarla. Agregar variable env `ASDD_SMART_DATA_INPUT_DIR` (default: `docs/smart-data/data`) para consistencia con `ASDD_SPECS_DIR`.

2. **`docs/smart-data/data/smart-data-eng-cliente.xlsx`** — plantilla sanitizada del Excel (portada desde `origin/feat/smart-data` con las 4 correcciones de PII enumeradas en "Decisiones tomadas antes de este ADR"). La sanitización es responsabilidad del developer, no del arquitecto.

3. **`.gitignore`** — reglas nuevas al final de la sección adecuada:
   ```
   # Smart Data — archivos reales de cliente (la plantilla SÍ se versiona)
   docs/smart-data/data/*.xlsx
   !docs/smart-data/data/smart-data-eng-cliente.xlsx
   docs/smart-data/data/~$*.xlsx
   ```
   El patrón `~$*.xlsx` cubre lockfiles temporales de Excel.

4. **`.claude/rules/asdd-data-workflow.md`** — actualizar la fase D1 (discover) para declarar **explícitamente** el Excel como artefacto de entrada obligatorio de la fase Especificar-Data, con el path canónico `docs/smart-data/data/smart-data-eng-{cliente}.xlsx`. Una sección/línea corta al inicio de D1: *"Artefacto de entrada obligatorio: `docs/smart-data/data/smart-data-eng-{cliente}.xlsx` (equivalente al `brief-*.md` en software transaccional). Referenciado por `asdd-pre-tool-use-analyze-guard` — ver ADR-003."* Esto convierte la regla del guard en la aplicación del contrato ya declarado por la SSOT del dominio.

5. **`.asdd/asdd-smart-data.lock`** — resolver la nota stale que aún dice "pendiente PR3" (heredada del port original v2.25.0). Actualizar la sección relevante para reflejar que el port está completo y agregar referencia a este ADR-003 en un campo `related_adrs` o comentario dedicado.

**No se tocan** el hook `design-guard`, el `artifact-name-guard`, ni ningún archivo bajo `.claude/agents/` o `.claude/references/rules/asdd-data-routing.md`. Este cambio es aditivo dentro del hook analyze-guard y una línea documental en el workflow Data.

## Actualización de la regla Data — SSOT del requisito

Sí, `asdd-data-workflow.md` **debe** declarar explícitamente el Excel como artefacto de entrada de D1. Sin esa línea, el guard sería una restricción "sorpresa" imposible de descubrir leyendo la doctrina Data — el usuario que lee el workflow no sabría que necesita el Excel para persistir. Con la línea declarada, el guard **implementa** un contrato ya explícito en la SSOT (patrón que ya usan otros guards del framework).

## Criterios de aceptación / tests (para el gate del tech-lead)

Los 5 tests que el tech-lead debe verificar antes de aprobar la implementación:

- **(a)** `Write docs/specs/smart-data-eng-discovery-acme.md` con `docs/smart-data/data/` inexistente O solo con la plantilla → **BLOQUEADO** con mensaje accionable M1 o M2.
- **(b)** `Write docs/specs/smart-data-eng-discovery-acme.md` con `docs/smart-data/data/smart-data-eng-acme.xlsx` presente → **PERMITIDO** (exit 0).
- **(c)** `Write docs/specs/feature-checkout.md` (software) SIN brief presente → **BLOQUEADO** por falta de brief (regresión — comportamiento actual conservado).
- **(d)** `Write docs/specs/feature-checkout.md` CON un `brief-*.md` presente → **PERMITIDO** (regresión — comportamiento actual conservado).
- **(e)** Regresión de los **7 tests de no-interferencia** de ADR-002 §D.3 sobre este estado integrado → **7/7 verdes** (dev↔data no se contaminan; ambigüedad desambigua). Confirmar que el cambio al analyze-guard no afecta las descripciones de agentes ni las reglas de arbitraje ORC↔D0-D7 ya validadas en v2.25.0.

**Casos adicionales recomendados** (no bloqueantes para el sign-off, útiles para robustez):

- **(f)** `Write docs/specs/smart-data-eng-build-run-acme.md` con solo `smart-data-eng-globex.xlsx` (cliente distinto) → BLOQUEADO con M3 y lista `{globex}` en el mensaje.
- **(g)** `Write docs/specs/smart-data-eng-governance-assessment-acme-retail.md` (cliente multi-palabra) con `smart-data-eng-acme-retail.xlsx` → PERMITIDO.
- **(h)** Env override `ASDD_ANALYZE_GUARD_ENABLED=false` → todos los Writes en `docs/specs/**` pasan (escape hatch conservado).

## Riesgos residuales

- **RR-1 — Descubrimiento del gate.** Un usuario nuevo del dominio Data puede intentar escribir un artefacto sin el Excel y confundirse ante M2. Mitigación: mensaje accionable con path exacto de la plantilla + `asdd-data-workflow.md` declara el requisito en su sección D1. Aceptado.
- **RR-2 — Cliente con nombre que colisiona parcialmente con otro** (ej. `acme` y `acme-retail`). El sufijo-match `-{cliente}.md` es sensible al string completo: `foo-acme.md` matchea solo `acme`, no `acme-retail`. Riesgo real: `foo-acme-retail.md` matchea `acme-retail` (bien) y también matchearía la subcadena `retail` si existiera un cliente `retail` — la regla exige matchear el sufijo completo con guion previo, así que `-acme-retail.md` NO matchea `retail` (falta el guion previo al `retail`: sería `-retail.md`). Aceptado, cubierto por el algoritmo.
- **RR-3 — Excel del cliente ausente durante ejecuciones automatizadas / CI.** Si un pipeline intenta re-generar artefactos Data sin el `.xlsx` presente (porque está gitignoreado), el guard bloqueará. Mitigación: documentar en `asdd-data-workflow.md` que las corridas automatizadas del dominio Data requieren el Excel presente en el checkout (secret o mount). Aceptado.

## Consecuencias

- **Positivas:** desbloquea la persistencia real de los agentes Data (el Caso C ya no falla silenciosamente); el guard sigue siendo verificable y auditable; el contrato "cada fase tiene un artefacto de entrada" se preserva. La doctrina Data queda explícita en su SSOT (`asdd-data-workflow.md`) sin depender de conocimiento tácito.
- **Negativas / costos:** el `analyze-guard` gana ~50 líneas de lógica (todavía es tratable, <200 líneas totales). Un usuario que renombre incorrectamente su Excel sufre el bloqueo — trade-off aceptado a cambio del gate real.
- **Compatibilidad:** cambio 100% aditivo para software. Ningún flujo transaccional existente cambia comportamiento. Los 7 casos de no-interferencia de ADR-002 se preservan sin tocar sus fuentes.

## Referencias

- ADR-002 — Aislamiento del flujo Smart Data (Aceptada, en producción v2.25.0). Este ADR NO lo sustituye — lo complementa cerrando el gap de persistencia identificado durante la validación.
- `asdd-pre-tool-use-analyze-guard.mjs` — hook a modificar.
- `asdd-data-workflow.md` — SSOT del dominio Data que declara el Excel como artefacto de entrada de D1.
- `.claude/skills/asdd-solution-architect-guide-docs/` — convención de ADR aplicada (naming, estados, ciclo de vida).

## Amendment 2026-07-02 — exención de cadena (artifact-name-guard + spec-size-guard)

**Contexto adicional.** Tras publicar el guard domain-aware en 2.25.1–2.25.2 y validar la plantilla en un consumidor real (nova-foods), se detectó un deadlock: el `analyze-guard` permite el Write del artefacto Data, pero otros hooks PreToolUse de la cadena lo siguen bloqueando por reglas propias del dominio software:

- **`asdd-pre-tool-use-artifact-name-guard.mjs`** exige que todo archivo bajo `docs/**` con ≥ 3 segmentos siga el naming `{YYYY-MM-DD}-{NNN}-{PHASE}-{NNN}-` de run activo. Los artefactos Data (`smart-data-eng-{tipo}-{cliente}.md` en `docs/specs/`, `docs/data/`, etc.) no siguen ese patrón porque el flujo Data no usa el ciclo Especificar→Analizar del dominio software — su ciclo D0–D7 tiene sus propios artefactos.
- **`asdd-pre-tool-use-spec-size-guard.mjs`** aplica umbrales de 300 líneas, ≤ 5 CU y ≤ 1 aggregate sobre `docs/specs/*.md`. Las semánticas CU/aggregate no aplican al dominio Data — un discovery o dictionary del cliente puede superar 300 líneas legítimamente (inventario de fuentes, catálogo de campos).

**Decisión.** Ambos hooks agregan una **exención Data** en su función `isExempt()` / `isExemptFile()` que reconoce el patrón `/^smart-data-eng-.+-[a-z0-9][a-z0-9_-]*\.md$/i` sobre el basename (la MISMA regex que `isDataArtifactFile` del analyze-guard). Cuando matchea → `return true` (exento) + log a stderr no-bloqueante:

```
[{hook}] Exención Data (ADR-003): {basename} — gate Data validado por analyze-guard.
```

**Racional.** El `analyze-guard` es **el único gate del dominio Data**: valida que exista el Excel del cliente como equivalente-brief (M1/M2/M3) y corre ANTES de los otros dos hooks en el orden de `settings.json`. Duplicar la validación del Excel en `artifact-name-guard` y `spec-size-guard` viola SRP; excluirlos por regex sobre el basename es correcto porque la exención solo aplica cuando el filename tiene la forma canónica del dominio Data — y esa forma ya fue validada por analyze-guard contra el registry de clientes en filesystem.

**Casos cubiertos por el harness de cadena** (`.claude/scripts/test-guards-chain-data.mjs`):

- 6 tipos de artefactos Data (`discovery, governance-assessment, dictionary, design, build-run, validate-signoff`) × cliente `nova-foods` CON Excel → los 3 hooks devuelven exit 0 en cadena.
- Discovery > 300 líneas → `spec-size-guard` sale exit 0 (exención Data). Sin la exención, bloquearía.
- Regresión software: spec sin naming de run bajo `docs/specs/**/*.md` con ≥ 3 segmentos → `artifact-name-guard` sigue bloqueando. Spec software > 300 líneas → `spec-size-guard` sigue bloqueando. Spec software sin brief → `analyze-guard` sigue bloqueando.
- Sin Excel del cliente → `analyze-guard` corta la cadena en M2 antes de que los otros dos hooks evalúen.

**Consecuencia.** El flujo Smart Data queda operativo end-to-end en consumidores: los agentes Data pueden persistir sus artefactos sin colisionar con los guards del dominio software, manteniendo el analyze-guard como single source of truth del gate Data.

**Referencias.**

- `asdd-pre-tool-use-artifact-name-guard.mjs` — `isExempt()` con cláusula #8 (exención Data).
- `asdd-pre-tool-use-spec-size-guard.mjs` — `isExemptFile()` con verificación smart-data-eng-* antes del match de run naming.
- `.claude/scripts/test-guards-chain-data.mjs` — harness de cadena (nuevo en 2.25.3).
- `.claude/scripts/test-analyze-guard-domain-aware.mjs` — 15/15 casos originales del guard preservados.

## Amendment 2 — 2026-07-02

Consolidación tras el ciclo 2.25.1 → 2.25.3 en consumidor real: se detectaron dos edges (naming multi-parte + candados mecánicos redundantes) y una omisión doctrinal (falta racional explícito de las exenciones del dominio). Este amendment cierra los tres.

### 1. Naming SSOT (`hooks/_lib/smart-data-naming.mjs`)

La regex del patrón Data (`/^smart-data-eng-.+-[a-z0-9][a-z0-9_-]*\.md$/i`) estaba **triplicada** en los tres hooks de la cadena PreToolUse (analyze-guard, artifact-name-guard, spec-size-guard). Además, el sufijo-match del analyze-guard (`endsWith('-{cliente}.md')`) falla con el naming canónico DC-004 de contratos versionados:

```
docs/specs/contracts/smart-data-eng-contract-{capa}-{cliente}-{X.Y.Z}.md
                                                          └───────┘
                                                    puntos del semver
```

Los puntos del semver no pasan el charclass `[a-z0-9_-]` y el sufijo del filename termina en `-{cliente}-{X.Y.Z}.md`, no en `-{cliente}.md`.

**Solución:** módulo ESM `hooks/_lib/smart-data-naming.mjs` centraliza el reconocimiento con dos funciones puras:

- `isDataArtifact(basename)` — reconoce ambos patrones (general y contrato DC-004).
- `matchesClient(basename, clients)` — sufijo-match version-aware: soporta `-{cliente}.md` y `-{cliente}-{X.Y.Z}.md`.

Los tres hooks importan el módulo con `import { … } from "./lib/smart-data-naming.mjs"`. Muere la regex triplicada. Regex **estrictas** — no se aflojan más allá de estos dos patrones (riesgo: debilitar el enforcement de specs software).

Cobertura: harness `.claude/scripts/test-guards-chain-data.mjs` extendido a 16 casos (agrega contrato semver con Excel, contrato multi-palabra `acme-retail-2.3.1`, contrato de cliente inexistente → M3). Casos originales del guard (15) preservados.

### 2. Permission-mode fuera de los agentes Data

Los agentes `asdd-data-architect` y `asdd-data-governance` declaraban `permissionMode: plan` en su frontmatter. Es un **candado mecánico redundante** con:

- **ORC-010-A** (`asdd-orchestration-plan-gate.md`) — el gate de aprobación del orquestador ya obliga a analizar-primero antes de escritura.
- **Prosa/skills de los propios agentes** — el comportamiento "diseñar, nunca ejecutar" está explícito en su rol y en cada skill.

El permission mechanic los hace inoperables (Write y Edit están en `tools[]` pero el modo restringido bloquea la escritura). Se elimina de ambos. `asdd-data-eng-databricks` no lo tenía — no se toca.

**Convención del template** (nueva): ningún agente escritor debe fijar `permissionMode` restrictivo. Enforcement mecánico en `validate-template.mjs`:

- **Check nuevo `agent-permission-mode`** (severidad `error`) — falla si un agente declara `Write` o `Edit` (o `NotebookEdit`/`MultiEdit`) en `tools:` **y** tiene `permissionMode` en `{plan, readonly, ask}`. Mensaje ES claro: "agente con capacidad de escritura no debe fijar permissionMode: … — el gate de aprobación es del orquestador (ORC-010-A) y de la prosa/skills, no del permission mechanic". Verificado: con el fix aplicado pasa (20/20 agentes); simulando la regresión detecta el bug con 1 finding.

### 3. Racional de las exenciones de dominio Data (decisión explícita)

Amendment 1 introdujo las exenciones de `artifact-name-guard` y `spec-size-guard` para artefactos Data. Este apartado documenta **por qué** — no es descuido:

Los artefactos Data quedan **fuera** del naming de run (`{run_id}-{PHASE}-{SEQ}`) y del size-split (300L / 5 CU / 1 aggregate) porque su **modelo de trabajo es distinto** del ciclo software:

- **Archivo vivo con upsert por sync**, no N archivos por corrida. El agente Data lee el Excel del cliente y actualiza el `.md` en su lugar (procedimiento Sync). No hay "corridas de spec" que produzcan artefactos versionados por fecha; hay UN documento por tipo × cliente que evoluciona.
- **Trazabilidad vía frontmatter y build-run**, no vía naming de fecha: cada artefacto tiene `generated_by` + `generated_on` en su frontmatter, un "Historial de sincronización" al pie, y `smart-data-eng-build-run-{cliente}.md` acumula la traza de las corridas de ingeniería. Añadir `{run_id}-{PHASE}-{SEQ}-` al filename romperia el sync (colisionaría con el basename esperado por los agentes Data).
- **Estructura sin semántica CU/aggregate**: un diccionario de datos, un discovery de fuentes o un contrato Silver no se dividen por "caso de uso" ni "aggregate raíz". Partir un diccionario destruiría su condición de SSOT (el equipo cliente edita el Excel; el `.md` refleja ese Excel completo). Los umbrales de 300L / 5 CU / 1 aggregate son válidos para specs software, no para artefactos Data.

**Corolario:** si a futuro se quiere partición o trazabilidad de corridas para Data, es **decisión de diseño del addon v2 de Smart Data** (con su autor), no una extensión de los guards de software. El template mantiene aislados los dos modelos.

### Referencias operativas

- `.claude/hooks/_lib/smart-data-naming.mjs` — SSOT del reconocimiento.
- `.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs` — usa `isDataArtifact` + `matchesClient`.
- `.claude/hooks/asdd-pre-tool-use-artifact-name-guard.mjs` — usa `isDataArtifact` en `isExempt()` (cláusula #8).
- `.claude/hooks/asdd-pre-tool-use-spec-size-guard.mjs` — usa `isDataArtifact` al inicio de `isExemptFile()`.
- `.claude/scripts/validate-template.mjs` — check `agent-permission-mode` (severidad `error`).
- `.claude/scripts/test-guards-chain-data.mjs` — 16 casos incluye contrato semver, multi-palabra y M3 por cliente inexistente.

## Amendment 3 — 2026-08-18 · Reconciliación tras la regresión de v3.0.0

La cláusula de exención descrita en el Amendment 2 fue **removida sin registro**
en `5c425b3` (*feat: enforce universal run artifact naming*, v3.0.0), junto con
las otras ocho cláusulas de `isExempt()`. El harness creado para impedirlo
(`test-guards-chain-data.mjs`) fue reescrito en el mismo commit y siguió en
verde, por lo que la regresión no se detectó durante seis semanas.

**Estado actual:** la exención se restauró cableando `isDataArtifact()`, la misma
función que el analyze-guard ya consumía. La exención vive ahora en
`getArtifactNameDecision()` (inmediatamente después de `isExempt()`, antes de
leer `.asdd-run.json`), no dentro de `isExempt()` como la cláusula #8 original.
El guard exige además que el nombre empiece por `smart-data-eng-`. El contrato
filtra por prefijo y forma general; no valida que el nombre esté completo.

**Consecuencia normativa:** ART-001 se corrigió para declarar la excepción de
dominio explícitamente. Los dos documentos vuelven a decir lo mismo.
