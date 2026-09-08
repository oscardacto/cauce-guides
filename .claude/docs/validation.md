# Validación de Configuración Agéntica — ASDD Template

## 1. Introducción

Este template incluye un validador cross-OS (`.claude/scripts/validate-template.mjs`) que verifica la **consistencia interna** de la configuración agéntica: YAML frontmatter, referencias cruzadas entre agentes, skills y MCPs, integridad de JSON, y budgets de tamaño.

- **Cuándo se ejecuta:** manualmente con `node .claude/scripts/validate-template.mjs`. Este repositorio no incluye ni presupone un proveedor de CI.
  > **Invocación según dónde estés.** En un **proyecto que adoptó el ASDD**, usá siempre la forma
  > `node …`: `package.json` **no se distribuye** (pisaría el tuyo), así que los atajos `npm run *` no
  > existen ahí. En el **repositorio template** están disponibles `npm run validate`, `npm test` y
  > `npm run hash:regen`. Este documento usa la forma `npm run *` cuando habla de tareas exclusivas del
  > mantenedor, y la forma `node …` cuando la tarea también aplica a un consumidor.
- **Por qué importa:** una configuración agéntica rota produce comportamientos erráticos de Claude Code (agentes que no se invocan, skills ausentes, hooks silenciosos). Ejecutarlo antes de compartir cambios evita que el fallo llegue a otros developers que adopten el template.
- **Filosofía:** el validador es agnóstico al estado del repo — no valida contra contadores fijos, sino contra consistencia del filesystem actual. Funciona igual en este template upstream y en cualquier proyecto downstream que lo adopte.

## 2. Los checks del validador

Al momento de escribir esto el validador corre **39 checks**. La tabla de abajo
documenta en detalle los **12 fundacionales**; la lista autoritativa y vigente es
siempre el output del validador, que imprime cada check con su nombre y su
nivel, y cierra con una línea `Summary`. Para saber cuántos checks hay hoy, correr
el comando y contarlos ahí — este documento no mantiene el número a mano, porque
se desactualiza cada vez que se agrega un check.

| # | Nombre | Nivel | Qué valida | Cómo arreglar si falla |
|---|---|---|---|---|
| 1 | `yaml-frontmatter` | strict | Frontmatter YAML parseable en agentes, skills y commands | Corregir la línea indicada (formato `key: value` o `key: [a, b]`) |
| 2 | `skills-structure` | strict | Cada skill vive en `.claude/skills/{nombre}/SKILL.md` | Mover `skills/x.md` a `skills/x/SKILL.md` o crear el `SKILL.md` faltante |
| 3 | `asdd-counts` | warn | Contadores del manifest `.asdd/asdd.lock` coinciden con filesystem | Actualizar `variants.claude.{agents,skills,rules,commands}` en `.asdd/asdd.lock` |
| 4 | `skill-references` | strict | Todo `skills: [x]` en un agente apunta a un SKILL.md existente | Crear el skill faltante o quitar la referencia del frontmatter del agente |
| 5 | `mcp-references` | strict | Todo `mcpServers: [name]` en un agente existe en `.mcp.json` | Agregar el server a `.mcp.json` o quitar la referencia del agente |
| 6 | `json-files` | strict | `.mcp.json`, `.claude/settings*.json`, `.asdd/asdd.lock`, `.asdd/cli-contract.json`, `.asdd/checklist.json` son JSON válido | Validar sintaxis (comas, comillas, llaves balanceadas) |
| 7 | `hooks-executable` | strict | Los `.mjs` bajo `.claude/hooks/` están en modo `100755` **en el índice de git** | `git update-index --chmod=+x .claude/hooks/<archivo>.mjs` (funciona en los tres SO) |
| 8 | `rules-size` | warn | Cada regla en `.claude/rules/*.md` ≤ 100 líneas | Dividir la regla o mover detalles a un skill de reference |
| 9 | `no-hardcoded-paths` | strict | Ningún archivo de config contiene rutas absolutas del directorio de usuario (macOS `/Users`, Linux `/home`, Windows `C:\Users`) | Reemplazar por rutas relativas o la variable `{project-root}` |
| 10 | `claude-md-size` | warn | `CLAUDE.md` ≤ 200 líneas | Mover contenido detallado a skills con progressive disclosure |
| 11 | `cli-contract` | strict | `.asdd/cli-contract.json` cumple schema v1.0 (bloques requeridos, `personalize[*]` válido) | Corregir el contrato según `docs/adoption/contract-spec.md` |
| 12 | `markers-integrity` | strict | Todos los markers `<!-- asdd:ID:start/end -->` están balanceados | Agregar el marker faltante o eliminar el huérfano |
| 13 | `clean-files-to-remove-safety` | strict | Que ninguna entrada de `clean.files_to_remove` colisione con `distribution` ni nombre una ruta donde escriba un artefacto distribuido. El CLI la aplica con `os.RemoveAll` incondicional después de copiar | Quitar la entrada o restringirla a nombres de archivo exactos del mantenedor — criterio completo en `docs/adoption/contract-spec.md` §3.5.3 |

**Niveles:** `strict` = el proceso termina con exit 1. `warn` = se reporta pero no bloquea, salvo que se corra con `--strict`.

> Los checks que no están en la tabla se autodocumentan en el output (`naming-convention`, `model-strategy`, `routing-config`, `context-budget`, etc.). Los que necesitan contexto adicional tienen subsección propia: higiene de referencias en §2.1, portabilidad cross-OS en §2.2, integridad de hashes SHA-256 en §2.3, integridad de la distribución en §2.4.

### 2.0. Piso de contexto always-on

El runtime inyecta en **toda** sesión el nombre y la descripción de cada skill,
agent y command, para que el modelo pueda elegir una sin leer su cuerpo. Junto
con `CLAUDE.md`, `.claude/rules/` y los literales que inyectan los hooks, eso es
el **piso always-on**: se paga en cada turno y se vuelve a pagar entero en cada
subagente que arranca en blanco.

| Nombre | Nivel | Qué valida |
|---|---|---|
| `skill-description-budget` | warn | Cada descripción de skill, agent y command contra su límite en `.asdd/context-budget.json` → `targets.{skill,agent,command}_description_chars`. Reporta el promedio por superficie |

La medición del piso completo no es un check sino una herramienta:

```bash
node .claude/tools/measure-context-footprint.mjs            # tabla por componente
node .claude/tools/measure-context-footprint.mjs --json     # para CI
node .claude/tools/measure-context-footprint.mjs --strict   # exit 1 si excede el límite
```

Cuenta bytes en disco, que es lo reproducible; la medición **autoritativa** de lo
que el runtime carga de verdad sigue siendo `/context` dentro del proyecto. Los
valores medidos quedan escritos en `measured_components` de
`.asdd/context-budget.json`.

**Hay dos límites, y miden cosas distintas.** Confundirlos deja el piso sin
gobernar mientras el validador muestra verde.

| Medición | Qué cubre | Quién la mide | Techo |
|---|---|---|---|
| `targets.always_on_core_words` | `CLAUDE.md` + `.claude/rules/**` | `asdd-context-budget-lib.mjs`, vía el check `context-budget` | 8.000, stage `error` |
| `measured_components.always_on_floor_words` | el piso completo: núcleo + descripciones always-on de skills, agents y commands + inyección de hooks | `measure-context-footprint.mjs`, que ningún check invoca | **ninguno, a propósito** |

El límite del núcleo se fijó con 5.825 palabras observadas y nunca cubrió el resto.

El piso completo **se mide y se reporta, pero no se gobierna con un número**. Esto
es un marco agéntico: cuánto piso es aceptable depende del alcance que el proyecto
instale, y no es lo mismo un consumidor que usa las 164 skills que uno que hace
solo backend. Un techo inventado no gobierna nada — obliga a justificar cada
palabra contra una cifra que nadie decidió, y enseña a saltear el gate. Si algún
día se decide un techo, alcanza con agregar `always_on_floor_words` a `targets`:
la herramienta lo toma sola.

Lo que sí es un defecto, y por eso rompe `--strict`, es que el número esté mal:
ver la guarda contra deriva más abajo.

La inyección de hooks se mide por rama, no por suma: las señales mutuamente
excluyentes (los cuatro intents de plan, y dominio `data`/`software`/ambiguo) se
cobran por la mayor, porque ningún turno las recibe todas. Si el hook consulta
una señal cuya guarda el medidor no reconoce, el reporte lo dice en vez de
descontarla en silencio. `test-context-footprint.mjs` cubre las tres cosas.

Criterio al escribir una descripción: solo tiene que **discriminar** —los
sustantivos propios (Gherkin, OpenAPI, Medallion, WCAG, axe-core, ISTQB), qué
produce y la frontera contra el artefacto vecino (`NO para X → usar Y`). Los
números de ADR, las rutas de salida, la mecánica de invocación y la
justificación arquitectónica van en el cuerpo, que se carga cuando el artefacto
se usa.

### 2.1. Checks de higiene de referencias (hooks y agentes/skills)

Dos checks `strict` adicionales cierran la clase de bugs "artefacto instalado pero referencia rota o muerta" — comportamientos que pasan silenciosos hasta que un agente "no hace nada" o un hook nunca dispara.

| Nombre | Qué valida | Cómo arreglar si falla |
|---|---|---|
| `hooks-registration` | Cruza `.claude/hooks/*.mjs` contra los `command` registrados en el bloque `hooks` de `.claude/settings.json`. Falla si un hook en disco **no está registrado** (hook muerto) o si una ruta registrada **no existe** en disco. | Registrar el hook bajo `settings.json` → `hooks` (evento + `command`), o eliminar el `.mjs` si quedó obsoleto. |
| `agent-skill-references` | En `commands`/`rules`/`agents`/`skills`: detecta **identidades deprecadas** (`qa-engineer`, `ux-ui`, `asdd-expert` y sus sub-formas, podadas en versiones previas) y, en `commands`/`rules`, **invocaciones** de agente/skill que no resuelven a un artefacto instalado. Excluye `.claude/evals/` (fixtures congelados). | Repuntar la referencia al agente/skill sucesor correcto, o eliminarla. |

**Caso de regresión que motivó `hooks-registration` (#3596):** el hook `asdd-pre-tool-use-analyze-guard.mjs` se creó en v2.16.0 pero quedó **fuera** del bloque `hooks` de `settings.json` → nunca se ejecutaba (hook muerto). Este check lo detecta al ejecutar el validador: reporta `.claude/hooks/asdd-pre-tool-use-analyze-guard.mjs — on disk but NOT registered`. La misma clase cubre las referencias fantasma de `build.md`/`verify.md` (#3610) y los handoffs rotos a skills inexistentes.

> **Nota de resolución:** un nombre corto (`developer-frontend`, `developer-backend`, `tech-lead`) resuelve por prefijo (`asdd-developer-frontend`, `asdd-developer-backend`); un skill corto (`feature`, `quality-gate`) resuelve por sufijo (`asdd-developer-feature`). Solo se marcan los que no resuelven por ninguna vía ni son una identidad deprecada conocida.

### 2.2. Checks de portabilidad cross-OS

Tres checks cierran la clase de defectos "funciona en la máquina del autor y se
rompe en otro sistema operativo o en otro checkout". Nacieron de defectos reales,
no de una revisión teórica.

| Nombre | Nivel | Qué valida | Por qué |
|---|---|---|---|
| `hash-eol-normalization` | error | Que todo hashing de contenido **leído de disco** pase por `.claude/scripts/lib/asdd-hash-normalize-lib.mjs` (`readNormalized` / `normalizeForHash`), o normalice CRLF→LF inline si es CommonJS y no puede importar la lib | Sin normalizar, el mismo archivo produce hashes distintos según el checkout (CRLF en Windows, LF en Linux) y el manifiesto queda irreproducible |
| `hook-command-shape` | error | Que los hooks de `.claude/settings.json` usen forma **exec** (`"command": "node"` + `"args": [...]`) y que el script exista | En forma shell, `node $CLAUDE_PROJECT_DIR/...` sin comillas se parte por word-splitting con cualquier ruta que tenga un espacio, y rompe todos los hooks a la vez, en silencio |
| `path-separator-safety` | warn | Detecta concatenación de rutas nativas con `/` (ej. `join(...) + '/x'`, o `relative(...)` comparado contra un literal con `/`) | En Windows `join()` devuelve `\`, así que la comparación nunca matchea y el guard deja pasar todo sin emitir ningún mensaje |

`path-separator-safety` está en `warn` **a propósito**: es el único de los tres con
riesgo real de falsos positivos, porque el `/` es correcto y obligatorio cuando el
otro lado del booleano es un string posix que no viene de la API `path` del SO
(manifiestos, config, env vars, output de `git`, regexes de comandos shell, URLs).
Se promueve a `error` en una pasada posterior. Su única exención es un allowlist a
nivel de **archivo** (hoy **5 archivos**, cada uno con su razón) más el pragma de
línea. **No hay exenciones por prefijo**: existió una para `.claude/tools/` completo
que dejaba 88 archivos fuera del check de un solo golpe; al removerla el barrido pasó
de 105 a **193 fuentes** con 0 hallazgos, así que la exención no protegía nada real.

`hash-eol-normalization` reconoce **tres formas** de llegar al hash, y ninguna
depende de un AST: la lectura cruda inline dentro del `.update`, el identificador
simple asignado desde una lectura cruda, y —desde la tercera forma— el helper local
de un salto (`const h = (x) => createHash(...).update(x)`), cuya verificación se
traslada a sus call sites. La tercera existe porque un helper de una línea escondía
un sitio real que hasheaba bytes crudos de disco. Lo que el check **no** puede
correlacionar (más de un salto, propiedad de objeto, reasignación) no se reporta como
verificado: se cuenta aparte y el conteo va en el mensaje del check, porque "no pude
correlacionarlo" no es lo mismo que "está normalizado".

**Pragmas de escape.** Son marcadores de línea, pensados para los casos donde el
idioma señalado es el correcto:

| Pragma | Check | Cuándo usarlo |
|---|---|---|
| `asdd-hash-raw-bytes` | `hash-eol-normalization` | Hashear bytes crudos es lo correcto: el contenido **no** viene de disco sino de memoria (un comando de commit, el JSON de un plan de autorización), donde el hash **debe** ser sensible a cada byte |
| `asdd-posix-path` | `path-separator-safety` | El `/` es legítimo porque el otro lado es un string posix por contrato |
| `asdd-allow-abs-path` | `no-hardcoded-paths` | La ruta absoluta es prosa documental o un ejemplo, no configuración real |

Colocá el pragma **en la misma línea que matchea** — es la posición que funciona en
los tres checks. `no-hardcoded-paths` acepta además la línea inmediatamente
anterior. `path-separator-safety` ignora por sí solo las líneas que empiezan con
`//` o `*`, porque los comentarios citan el idioma peligroso justamente para
explicarlo.

### 2.3. Integridad de hashes SHA-256

Dos manifiestos de `.asdd/` almacenan hashes SHA-256 del contenido de los
archivos que referencian, para que un agente no pueda cargar una referencia
alterada sin que el validador lo note. Hoy son **29 ítems con hash**:

| Manifiesto | Campo | Cantidad | Check que lo verifica |
|---|---|---|---|
| `.asdd/rule-loading.json` | `entries[].reference_sha256` | 17 | `conditional-rule-loading` |
| `.asdd/coordinator-loading.json` | `coordinators.*.rollback_sha256` | 2 | `thin-coordinator-loading` |
| `.asdd/coordinator-loading.json` | `coordinators.*.routes[].sha256` | 10 | `thin-coordinator-loading` |

Son **2 checks** (con 3 sitios de verificación). Un tercer check,
`hash-eol-normalization` (§2.2), no verifica estos valores: garantiza que el código
que los calcula normalice, que es la condición para que sean reproducibles.

**Cómo regenerarlos — única forma admitida:**

```bash
npm run hash:regen
```

Es `.claude/scripts/asdd-regen-hashes.mjs`. Usa la **misma** función de
normalización que el validador, así que generador y verificador no pueden divergir.
Es idempotente: correrlo dos veces seguidas no produce diff la segunda vez, porque
el hash se calcula sobre el contenido normalizado del archivo en disco,
independiente del valor que ya estuviera guardado. Escribe de forma atómica y sale
con código 1 si alguna ruta referenciada no existe.

> **PROHIBIDO regenerar a mano.** No usar `sha256sum`, `certutil` ni `Get-FileHash`
> sobre el archivo crudo: hashean los bytes de disco sin normalizar EOL ni quitar el
> BOM, y contaminan el manifiesto con un valor que solo coincide en la máquina donde
> se generó. Así entraron 5 hashes de rutas de `asdd-atf-web-qa-engineer`
> almacenados como *rendering* CRLF: pasaban en Windows y fallaban en CI con
> checkout LF. `.gitattributes` por sí solo no alcanza — depende de que cada
> checkout lo respete.

**Cuándo hay que regenerar:** cuando cambia el contenido de una referencia
on-demand (`rule-loading.json`), de un archivo de rollback o de una ruta de
coordinador (`coordinator-loading.json`). Si editaste uno de esos archivos y no
regeneraste, el validador falla con `SHA-256 mismatch` (ver §8).

### 2.4. Integridad de la distribución

`distribution` en `.asdd/cli-contract.json` es la lista de lo que el
template entrega. El CLI la usa en las dos direcciones: copia lo que está en la
lista y **retira del proyecto del consumidor lo que dejó de estar**, salvo que el
archivo tenga ediciones propias. Eso vuelve destructiva una equivocación que antes
era inocua: una entrada que se cae de la lista —un conflicto de merge resuelto de
menos, una reescritura— elimina esa ruta de todos los proyectos que la tenían.

Tres checks cubren la clase. Los tres son `error`.

| Check | Qué garantiza | Cómo arreglar si falla |
|---|---|---|
| `distribution-regression` | Toda ruta que el template alguna vez entregó sigue cubierta, o está declarada como movida, o tiene una razón escrita de por qué se retiró | Restaurar la entrada en `distribution`; o declarar el `moves` que la reubica; o registrar el retiro con su razón en el mapa `RETIRED` del check |
| `moves-coherence` | Cada `moves` declarado es coherente con la distribución: la clave va en la raíz del contrato, el origen ya no se entrega y el destino existe | Corregir la declaración según lo que indique el hallazgo |
| `provenance-freshness` | `.asdd/asdd-provenance.json` está al día. Es lo que permite al CLI reconocer contenido viejo del template y actualizarlo en lugar de dejar un `.asdd-new` al lado | `npm run provenance:regen` y commitear |

`distribution-regression` compara la distribución de hoy contra la de cada release
publicada y contra los tips de las ramas distribuibles, expandiendo cada entrada
histórica a los archivos que existían en ese punto — comparar las listas entrada
por entrada daría falsos positivos cada vez que un directorio se pasa a archivos
enumerados. No reporta un archivo retirado *dentro* de un directorio que se sigue
distribuyendo: ahí la declaración no cambió.

**En un proyecto consumidor estos dos últimos checks se saltan, y lo dicen.**
`provenance-freshness` y `distribution-regression` necesitan la historia del
repositorio template, que un consumidor no tiene: sus tags contienen el contrato
del template porque viene distribuido, así que compararlos daría hallazgos ciertos
pero ajenos. El validador lo detecta por la ausencia del tooling de mantenedor y
reporta `skipped` en vez de un verde silencioso.

## 3. Uso local

**Prerequisito:** Node.js >= 22. No hay dependencias npm.

**macOS / Linux:**

```bash
node .claude/scripts/validate-template.mjs
```

**Windows (PowerShell / CMD):**

```powershell
node .claude\scripts\validate-template.mjs
```

**Windows (Git Bash / WSL):** mismo comando que Linux.

Ninguna de las tres formas requiere Git Bash. Ni el validador ni el runner de tests
dependen de un shell POSIX: el único comando externo que ejecutan es `git ls-files`,
sin sintaxis POSIX (`2>/dev/null`, `|| true`), así que corre igual bajo `cmd.exe`,
PowerShell o Git Bash. Los requisitos reales son Node >= 22 y `git` en el `PATH`.
Git Bash **sí** hace falta para el snippet del hook de pre-commit de §6, que usa
heredoc y `chmod` — comandos que no existen en `cmd.exe`.

**Flags:**

- `--strict` — también falla si hay warnings (útil antes de release).
- `--silent` — solo imprime errores (ideal para hooks y `grep`).
- `--help` — muestra uso.

**Ejemplo de output real** (abreviado en el medio; cada check imprime su propia
línea, y por eso el output es la lista autoritativa):

```
[ OK ] yaml-frontmatter — YAML frontmatter valid in 229 files
[ OK ] skills-structure — skill directories follow {name}/SKILL.md convention
[ OK ] asdd-counts — manifest counts match filesystem
[ OK ] skill-references — all skill references resolve
[ OK ] mcp-references — all mcpServers references resolve
[ OK ] json-files — JSON config files parse correctly
[ OK ] hooks-executable — 18 hook(s) con bit de ejecución en el índice de git
[ OK ] rules-size — 18 rule file(s) within size budget
[ OK ] no-hardcoded-paths — no hardcoded absolute paths in tracked config files (escape hatch: mark the line or the one above with asdd-allow-abs-path)
[WARN] claude-md-size — CLAUDE.md has 227 lines (budget 200)
       · 227 lines > 200 (consider moving content to skills)
...
[ OK ] hash-eol-normalization — 14 sitio(s) de hashing revisado(s), todos correlacionados; contenido de disco normalizado cross-OS (escape: asdd-hash-raw-bytes)
[ OK ] hook-command-shape — 6 hook(s) de .claude/settings.json en forma exec con script existente
[ OK ] path-separator-safety — 193 fuente(s) sin idiomas de separador inseguro (allowlist: 5 archivo(s); escape: asdd-posix-path)

Summary: 35 ok, 2 warn, 1 error
```

Algunos checks miden el estado local del repo, no el del template: `claude-md-size`
depende de cuánto creció tu `CLAUDE.md`, y `asdd-run-reconciliation` refleja el
`.asdd-run.json` del ciclo en curso. Un hallazgo en esos dos se interpreta contra tu
repo, no como un defecto del template.

**Ejemplo con errores:**

```
[ERR ] skill-references — all skill references resolve
       · .claude/agents/architect.md references skill "architect-adrx" (not found at .claude/skills/architect-adrx/SKILL.md)
[WARN] claude-md-size — CLAUDE.md has 267 lines (budget 200)
       · 267 lines > 200 (consider moving content to skills)

Summary: 8 ok, 1 warn, 1 error
```

### 3.1. Suite de tests del template (`npm test`)

El validador verifica la **consistencia** de la configuración; `npm test` verifica el
**comportamiento** de los scripts y hooks. Son controles distintos y ninguno
reemplaza al otro.

```bash
npm test
```

Es `.claude/scripts/asdd-run-test-suites.mjs`. Descubre y ejecuta las **45
suites** `.claude/scripts/test-*.mjs` (descubrimiento dinámico y alfabético — no hay
lista que mantener).

> Este runner es el control que faltaba. Las 45 suites estaban commiteadas y no
> existía ningún comando que las ejecutara: por eso una tanda de defectos de
> portabilidad cross-OS llegó a estar en el repo sin que nada la señalara. Una suite
> que nadie corre no es un control, es documentación.

**Ejecución estrictamente secuencial — no paralelizar.** Las suites comparten estado
global mutable dentro del repo: escriben en `.claude/.runtime/` (entre otros, el
directorio de autorizaciones de commit) y leen/escriben `.asdd-run.json`. En paralelo
se pisan entre sí y producen fallos fantasma irreproducibles. Paralelizar requiere
primero aislar ese estado por proceso.

**Timeout: 300 s por suite.** El número sale de mediciones, no de una estimación. La
suite más lenta es `test-git-guards-cwd`, que inicializa ~62 repos fixture con
operaciones git reales sobre disco: se midió en **81 s, 101 s y 106 s** con disco
libre y **más de 180 s** (abortada) bajo contención de I/O, en la misma máquina.
Esa varianza de ~2,2× entre el mejor y el peor caso es la razón del margen amplio.
Si una suite empieza a acercarse al techo, medirla y reportarla **antes** de subir el
timeout: un timeout que crece sin explicación esconde un defecto.

**El baseline de fallos conocidos.** `.claude/scripts/asdd-test-baseline.json`
(`schema_version` 2) declara los **3 fallos conocidos** hoy, cada uno con causa raíz,
clasificación, severidad y prioridad, duración típica medida, `expected_status` y el
documento de referencia. Registra también en qué plataforma y fecha se midió.

Es **declaración, no supresión**: el runner imprime todos los fallos con las últimas
30 líneas de salida, y cuando quedan rojos lo dice explícitamente. Un baseline no
oculta nada; solo distingue lo ya diagnosticado de lo nuevo.

**Semántica de exit code** (con baseline activo) — cuatro categorías:

| Situación | Exit | Por qué |
|---|---|---|
| Fallo baselineado, en el **modo declarado** (`expected_status`: `FAIL` o `TIMEOUT`) | 0 | Es exactamente el defecto ya diagnosticado |
| Fallo **nuevo**, no baselineado | 1 | Regresión. Arreglar el defecto, no agregarlo al baseline |
| Suite baselineada que falla en un **modo distinto** al declarado | 1 | El baseline absorbe una causa raíz concreta, no cualquier forma de fallar. Un `TIMEOUT` donde se declaró `FAIL` puede ser un cuelgue nuevo |
| **Baseline obsoleto**: una suite declarada como fallo conocido ahora pasa | 1 | Un baseline viejo es un fallo del control, no una buena noticia silenciosa. Quitar la entrada y actualizar el documento de referencia |

**Flags:**

- `--no-baseline` (alias `--raw`) — ignora el baseline y reporta el estado crudo
  (exit 1 si algo falla). Es el modo para **re-medir** el baseline desde cero.
- `--list` — imprime las suites que se ejecutarían, sin ejecutarlas.
- Cualquier argumento que no empiece con `--` filtra por substring del nombre:
  `npm test git-guards orc-tier` corre solo esas.

## 4. Cómo adoptar el template en cualquier proyecto

1. **Descargar/copiar el template:**

   ```bash
   git clone <URL-del-template> mi-proyecto
   cd mi-proyecto
   rm -rf .git   # remover historia del template
   ```

2. **Crear tu repositorio:**

   ```bash
   git init
   git add .
   git commit -m "chore: adopt ASDD template"
   ```

3. **Configurar tu remote:**

   ```bash
   git remote add origin <URL-de-tu-remote>
   git push -u origin main
   ```

4. **Validar la configuración:**

   ```bash
   npm run validate
   ```

5. **Si falla:** corregir los errores reportados (la tabla en §2 indica cómo) y volver a ejecutar el comando.

6. **Primer commit del proyecto:** a partir de aquí podés personalizar `CLAUDE.md`, ajustar agentes al stack de tu proyecto, agregar skills específicos, etc. El validador seguirá cuidando que la config no se rompa.

## 5. Automatización externa opcional

El template no incluye configuración de ningún proveedor de CI. Si el proyecto consumidor desea automatizar la validación, debe invocar el mismo comando desde su plataforma elegida:

```bash
node .claude/scripts/validate-template.mjs
```

La automatización pertenece al repositorio consumidor y no modifica el contrato del template.

## 6. Pre-commit hook local (opcional)

Si querés que el validador corra en cada commit local (nada garantiza esto, es decisión de cada developer):

**macOS / Linux:**

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
node .claude/scripts/validate-template.mjs --silent
EOF
chmod +x .git/hooks/pre-commit
```

**Windows (Git Bash):** los mismos comandos funcionan en Git Bash.

Para saltear el hook ante un commit urgente: `git commit --no-verify`.

## 7. Cómo agregar checks propios

El script core es intencionalmente mínimo y estable. Si tu proyecto necesita validaciones adicionales (ej. "todos los agentes deben tener `mcpServers: [context7]`"), crear un archivo paralelo `.claude/scripts/validate-custom.mjs` con tus checks e invocarlo desde el comando o automatización que elija el consumidor:

```bash
node .claude/scripts/validate-template.mjs
node .claude/scripts/validate-custom.mjs
```

Esto mantiene el upgrade path del template limpio: cuando se actualice `validate-template.mjs` no pisa tus checks propios.

## 8. Troubleshooting

| Error | Causa probable | Solución |
|---|---|---|
| `ENOENT: no such file or directory, scandir '.claude/skills'` | El template no se copió completo | Verificar que `.claude/` esté en el repo y que no esté en `.gitignore` |
| `yaml-frontmatter` falla con "missing frontmatter delimiters" | Falta `---` al inicio/fin | Agregar bloque YAML frontmatter completo al archivo |
| `yaml-frontmatter` falla con "cannot parse ..." | Sintaxis inválida en frontmatter (tabs mezclados, valores sin quotes con `:`) | Ajustar a formato plano `key: value` |
| `skill-references` reporta skill inexistente | Agente declara skill que no existe en `.claude/skills/` | Crear el skill o quitarlo del frontmatter del agente |
| `mcp-references` reporta MCP indefinido | Agente referencia MCP no declarado | Agregar el server a `.mcp.json` o quitar del agente |
| `hooks-executable` falla | El hook está en modo `100644` en el índice de git (típico de un hook creado en Windows, donde el bit no existe en el working tree) | `git update-index --chmod=+x .claude/hooks/<archivo>.mjs` y commitear. Funciona en los tres SO; `chmod +x` solo sirve en Linux/macOS. El check lee el índice, no el working tree, justamente para poder fallar en Windows |
| `no-hardcoded-paths` reporta coincidencia en un archivo de documentación | La doc incluye un path como ejemplo | Si es legítimo, mover el archivo dentro de `docs/` (excluido del check) |
| `cli-contract` reporta `contract_version must be SemVer` | Formato inválido en `.asdd/cli-contract.json` | Ajustar a `MAJOR.MINOR.PATCH` según `docs/adoption/contract-spec.md` §2 |
| `markers-integrity` reporta start sin end | Marker `<!-- asdd:X:start -->` sin su `<!-- asdd:X:end -->` | Agregar el end donde corresponde o eliminar el start |
| `SHA-256 mismatch` en `conditional-rule-loading` o `thin-coordinator-loading` | **Caso 1 (lo habitual):** el archivo referenciado cambió legítimamente y falta regenerar el hash. **Caso 2:** el hash almacenado está contaminado con un *rendering* CRLF, porque se regeneró a mano con `sha256sum` / `certutil` / `Get-FileHash` sobre los bytes crudos | Correr `npm run hash:regen` (§2.3). Para distinguir los casos: si el hash del contenido **normalizado** no coincide pero el del **mismo contenido convertido a CRLF** sí, es el caso 2 — el manifiesto estaba contaminado y la regeneración lo corrige de forma definitiva. Si ninguno de los dos coincide, el archivo cambió de verdad: revisar el diff antes de regenerar |
| `hash-eol-normalization` falla en un sitio nuevo | Se agregó código que hashea contenido leído de disco sin normalizar | Usar `readNormalized` / `normalizeForHash` de la lib compartida. Si el contenido viene de memoria y el hash **debe** ser byte-sensible, marcar la línea con `asdd-hash-raw-bytes` (§2.2) |
| `hook-command-shape` reporta forma shell | Un hook de `settings.json` usa `command` con la ruta y los argumentos en un solo string | Pasarlo a forma exec: `"command": "node"` + `"args": [...]` (§2.2) |
| `path-separator-safety` marca una línea legítima | El `/` es correcto porque el otro lado es un string posix por contrato (manifiesto, config, env var, output de git, regex shell, URL) | Marcar esa línea con `asdd-posix-path`. Si el archivo entero opera sobre strings posix, agregarlo al allowlist **por archivo** del check con su razón — nunca reintroducir una exención por prefijo de directorio |
| `clean-files-to-remove-safety` falla | Una entrada de `clean.files_to_remove` colisiona con `distribution` (el CLI copia y después borra, anulando la decisión) o nombra una ruta donde escribe un artefacto distribuido (el `os.RemoveAll` del upgrade destruye contenido del consumidor) | Quitar la entrada, o restringirla a nombres de archivo exactos del mantenedor. El criterio completo está en `docs/adoption/contract-spec.md` §3.5.3 |
| `cli-runtime-distribution` falla con "distribution omite X" | Un artefacto distribuido referencia un script de `.claude/scripts/**` o `.claude/hooks/**` que el CLI no copia: el consumidor recibiría la instrucción sin el script | Agregar la ruta a `distribution` en `.asdd/cli-contract.json`. Si la omisión es deliberada, declararla en el mapa `DEFERRED` (decisión de distribución pendiente) o `CITED_ONLY` (la ruta es una cita de procedencia, no un comando ejecutable) con su razón — ambos se listan siempre en el mensaje del check |
| `npm test` sale con exit 1 y todos los fallos figuran en el baseline | Una suite baselineada falló en un **modo** distinto al declarado, o una baselineada ahora **pasa** (baseline obsoleto) | Leer el veredicto del runner: distingue las dos situaciones. No reescribir `expected_status` para silenciar un desvío de modo — diagnosticar primero (§3.1) |
| La automatización externa falla y local pasa | Diferencia de versión de Node o de checkout | Asegurar Node >= 22 y revisar la configuración del consumidor |
| Un hash falla solo en la automatización externa y localmente pasa | El checkout del runner normaliza EOL distinto que el local | Confirmar que el hash se generó con `npm run hash:regen` y no a mano (§2.3) |

---

Última actualización: agosto 2026.
