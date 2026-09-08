# Contrato CLI ASDD — Especificación Formal v2.5

**Versión del contrato:** `2.5.0`
**Target audience:** equipos que mantienen templates ASDD (project-structure, copilot-structure, gemini-structure) y equipos que mantienen el CLI `sofka-ai`.
**Archivo canónico en el template:** `.sofka-asdd/cli-contract.json`

> **Nota de deriva, y por qué esta versión existe.** Esta spec quedó congelada en v1.0 mientras el
> contrato real llegó a 2.4.0, así que **6 de 15 claves no estaban documentadas en ninguna parte** —
> entre ellas `distribution`, donde vivía el hueco más grave de la auditoría VERIFY-002. Peor: el
> algoritmo de referencia de `cli-integration-guide.md` describía un modelo (`copyTree` + recorte)
> **incompatible** con la existencia de esa clave, y ningún documento decía cuál regía. Las secciones
> 3.9 a 3.13 y el §4 cierran esa deriva con el comportamiento verificado en el código del CLI.
>
> Regla que evita la reincidencia: **toda clave nueva del contrato entra con su sección en esta spec
> y su ítem en el checklist de `cli-integration-guide.md` §8, en el mismo cambio.**

## 1. Propósito

El contrato CLI es un **archivo declarativo JSON** que un template ASDD publica para que el CLI `sofka-ai` pueda adoptarlo sin conocimiento previo de su estructura interna.

El contrato responde cuatro preguntas:

1. **Qué debe copiar** el CLI al proyecto destino (bloque `distribution` — allowlist autoritativa, §3.9).
2. **Qué debe preguntar** el CLI al usuario para personalizar el template (bloque `personalize`).
3. **Qué debe limpiar** el CLI después de copiar el template (bloque `clean`).
4. **Qué debe verificar** después de la adopción (bloque `post_install` + checklist).

Al separar "qué hacer" (declarado por el template) de "cómo hacerlo" (implementado por el CLI), el mismo CLI puede adoptar múltiples templates: `project-structure` (Claude Code), `copilot-structure` (GitHub Copilot), `gemini-structure` (Gemini), etc.

## 2. Versionado SemVer

El campo `contract_version` usa **SemVer estricto** (`MAJOR.MINOR.PATCH`):

- **MAJOR** — cambios incompatibles con versiones anteriores del CLI. Agregar una sección nueva obligatoria, renombrar un campo, cambiar el tipo de un campo.
- **MINOR** — cambios compatibles hacia atrás. Agregar un campo opcional, agregar un valor a un enum, agregar un tipo nuevo a `personalize[*].type`.
- **PATCH** — correcciones que no afectan la forma del contrato. Reordenar campos, mejorar mensajes.

### Compatibilidad forward/backward

El CLI debe declarar qué rango de `contract_version` soporta (ej. `>=1.0.0 <2.0.0`). Al leer un contrato:

- Si `contract_version` está dentro del rango soportado → adoptar normalmente.
- Si la versión MINOR es mayor que la soportada → adoptar con warning ("el CLI ignorará campos nuevos").
- Si la versión MAJOR es mayor que la soportada → abortar con error ("actualizá el CLI").
- Si la versión MAJOR es menor que la soportada → el CLI debe tener capa de compatibilidad o abortar.

### Distinción entre `contract_version` y `template.version`

| Campo | Qué representa | Quién lo incrementa |
|---|---|---|
| `contract_version` | Versión del **schema** del contrato (esta spec) | COE Sofka al evolucionar el schema |
| `template.version` | Versión del **template** que se publica | El mantenedor de cada template (project-structure, copilot-structure…) |

Un template puede tener `template.version: 3.4.0` consumiendo `contract_version: 2.5.0`. Son dimensiones ortogonales.

### Historial de versiones del schema

| Versión | Qué introdujo |
|---|---|
| `1.0.0` | `$schema`, `contract_version`, `template`, `compatibility`, `personalize`, `clean`, `create_dirs`, `post_install`, `post_install_message` |
| `2.x` | `distribution`, `naming_convention`, `conditional_install`, `model_strategy`, `file_copy_as`, `file_merge` — **agregadas sin documentar**, recuperadas en esta versión |
| `2.4.0` | Criterio único de `distribution`: runtime + manual + semilla se distribuyen; artefactos del desarrollo del ASDD no |
| `2.5.0` | Piso de Node a `>=22` (MINOR: endurece un requisito ya declarado). `clean.files_to_remove` documenta su criterio de admisibilidad (§3.5.3) tras dos casos de destrucción de contenido del consumidor. Esta spec se pone al día con el contrato real |

## 3. Estructura del contrato — Secciones

### 3.1 `$schema` y `contract_version`

```json
"$schema": "https://sofka.com.co/asdd/contract/v1.0/schema.json",
"contract_version": "1.0.0"
```

- **`$schema`** — URL al JSON Schema que describe este contrato. El CLI puede validar el contrato contra el schema antes de procesarlo.
- **`contract_version`** — SemVer del schema que cumple este documento.

### 3.2 `template`

Metadata del template. Obligatorio.

```json
"template": {
  "id": "project-structure",
  "version": "1.0.1",
  "target_agent": "claude-code",
  "description": "Template oficial ASDD Sofka para proyectos con Claude Code",
  "maintainer": "COE Sofka"
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:-:|---|
| `id` | string kebab-case | sí | Identificador único del template |
| `version` | SemVer | sí | Versión del template |
| `target_agent` | enum | sí | `claude-code` · `github-copilot` · `gemini` · `cursor` · `windsurf` |
| `description` | string | sí | Descripción corta (≤ 140 chars) |
| `maintainer` | string | sí | Organización o equipo responsable |

### 3.3 `compatibility`

Requisitos para adoptar el template. Obligatorio.

```json
"compatibility": {
  "min_cli_version": "2.0.0",
  "platforms": ["darwin", "linux", "windows"],
  "required_tools": ["node>=22", "git>=2.30", "bash"]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `min_cli_version` | SemVer | Versión mínima del CLI requerida |
| `platforms` | array de enum | Sistemas operativos soportados |
| `required_tools` | array de string | Herramientas requeridas en formato `nombre[>=version]`, o el nombre solo cuando no hay piso expresable |

Si el entorno no cumple, el CLI aborta antes de copiar.

> **`required_tools` declara; `checklist.json` verifica.** El gate que el CLI **ejecuta** es
> `checklist.pre_install[*].expect_regex` sobre la salida de `<tool> --version`. Las dos declaraciones
> están acopladas y **deben cambiarse en el mismo commit**: tocar solo `required_tools` deja el
> contrato declarando un piso que el CLI no verifica; tocar solo el checklist deja el contrato
> mintiendo.
>
> **Límite del mecanismo:** un regex sobre la cadena de versión **no puede expresar un piso de
> minor**. `^v(2[0-9])\.` aceptaría `v20.0.0`. Por eso el piso de Node es un **major completo (22)**,
> donde toda minor cumple, en vez de un `>=20.11` con una alternación frágil e inauditable. El piso de
> git (`>=2.30`) es inexpresable por esta vía: el regex solo verifica el major para no rechazar git
> 3.x cuando exista, y la declaración de `required_tools` es la verdad. La solución de fondo es un
> `type: "semver_gte"` en el CLI — seguimiento en `sofka-ia/cli`, bump MINOR de contrato.
>
> **`bash` va sin piso de versión a propósito.** Reglas y skills emiten pipelines POSIX; en Windows
> los provee el Git Bash de Git for Windows. Un `git` sin ese shell (MinGit, git de WSL) satisface
> `git>=2.30` y deja la capa `.md` sin ejecutar.

### 3.4 `personalize`

Array de campos que el CLI debe solicitar al usuario y escribir en archivos del template.

```json
"personalize": [
  {
    "id": "project-name",
    "file": ".sofka-asdd/sofka-asdd.lock",
    "json_path": "project.name",
    "prompt": "Nombre del proyecto (kebab-case)",
    "required": true,
    "type": "string",
    "validate_regex": "^[a-z][a-z0-9-]*$",
    "error_message": "Solo minúsculas, números y guiones. Empieza con letra."
  }
]
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:-:|---|
| `id` | string kebab-case | sí | Identificador único del campo dentro del contrato |
| `file` | string | sí | Ruta relativa al template donde escribir la respuesta |
| `json_path` | string | sí si `file` es JSON | Path dot-notation dentro del JSON (ej. `project.name`) |
| `prompt` | string | sí | Pregunta mostrada al usuario |
| `required` | boolean | sí | Si es obligatorio. Si `false` y vacío, no se escribe |
| `type` | enum | sí | `string` · `enum` · `number` · `boolean` |
| `values` | array | sí si `type=enum` | Valores permitidos |
| `examples` | array | no | Sugerencias mostradas en el prompt |
| `validate_regex` | string | no | Regex que la respuesta debe cumplir |
| `error_message` | string | no | Mensaje si `validate_regex` falla |
| `default` | string | no | Valor por defecto si el usuario no responde |

**Tipos soportados en v1.0:** `string`, `enum`, `number`, `boolean`.
Tipos futuros (compatibles por MINOR): `multiline`, `multi-select`, `path`, `date`.

### 3.5 `clean`

Describe qué borrar/reemplazar tras copiar el template.

```json
"clean": {
  "markers": [ /* bloques con markers HTML para borrar */ ],
  "optional_remove": [ /* rutas que el CLI pregunta antes de borrar */ ],
  "files_to_remove": [ /* archivos que el CLI borra sin preguntar */ ]
}
```

#### 3.5.1 `clean.markers`

Bloques de texto delimitados por comentarios HTML que el CLI debe procesar.

```json
{
  "id": "template-disclaimer",
  "file": "CLAUDE.md",
  "start": "<!-- sofka-asdd:template-disclaimer:start -->",
  "end": "<!-- sofka-asdd:template-disclaimer:end -->",
  "action": "remove",
  "remove_markers": true
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador del bloque (útil para debugging) |
| `file` | string | Archivo que contiene el bloque |
| `start` / `end` | string | Marcadores exactos |
| `action` | enum | `remove` · `replace` (con nuevo texto en `with`) |
| `remove_markers` | boolean | Si `true`, elimina los comentarios además del contenido |

**Convención de markers:** `<!-- sofka-asdd:{id}:start -->` y `<!-- sofka-asdd:{id}:end -->`. Respeta HTML estándar y sobrevive al renderizado Markdown.

#### 3.5.2 `clean.optional_remove`

Rutas que el CLI pregunta al usuario si desea eliminar.

```json
{
  "id": "remove-examples",
  "path": "docs/.example/",
  "prompt": "Eliminar ejemplos en docs/.example/?",
  "description": "Se recomienda mantener como referencia, especialmente en adopcion inicial",
  "default": "keep"
}
```

`default`: `keep` · `remove`. Si el usuario responde por defecto (enter), se aplica.

#### 3.5.3 `clean.files_to_remove`

Array de rutas que el CLI borra **sin preguntar y sin comparar contenido**, con `os.RemoveAll`, después del copy loop.

Es la clave más destructiva del contrato y cumple **dos funciones a la vez**, porque no existe una clave `remove_on_upgrade`:

1. Excluir del destino algo que el copy loop entregó.
2. Limpiar artefactos de instalaciones viejas, que quedarían huérfanos al retirar una entrada de `distribution`.

Por eso **no se puede vaciar** (perdería la función 2) **ni dejar crecer sin criterio** (destruye trabajo del consumidor).

> **Criterio de admisibilidad.** Una entrada solo es válida si su ruta **no puede contener contenido escrito por el consumidor**. Antes de agregar una:
>
> 1. **Que no colisione con `distribution`.** Si colisiona, el CLI copia y después borra: la entrada de distribución queda sin efecto y la decisión se anula en silencio.
> 2. **Que ningún artefacto distribuido escriba en esa ruta.** Un hook o script que el consumidor recibe y que escribe ahí convierte cada upgrade en pérdida de datos.
>
> Ambos criterios los enforza el check `clean-files-to-remove-safety` del validador (nivel `error`).

**Los cuatro casos que motivaron el criterio** — todos estaban en el contrato y todos se retiraron:

| Ruta | Qué rompía |
|---|---|
| `ASDD-MEMORY.md` | Colisionaba con `distribution`, y `CLAUDE.md` declara ese archivo como el índice de memoria del consumidor: el upgrade le borraba su índice |
| `.claude/docs/migrations/` | Colisionaba con `distribution` (`.claude/docs/`): los runbooks de migración nunca llegaban |
| `.asdd-run.json` | Es el checkpoint operativo de corrida del consumidor (ORC-007). 11 artefactos distribuidos lo leen o escriben; el upgrade destruía el estado de la corrida activa |
| `docs/runs/` | Los manifiestos de corrida que escribe el hook distribuido `sofka-asdd-run-manifest.mjs`. El upgrade borraba el historial del consumidor |

Preferir nombres de archivo **exactos** del mantenedor por sobre entradas de directorio: un directorio es donde el consumidor escribe, un nombre exacto no colisiona con la convención ART-001 (`{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`).

### 3.6 `create_dirs`

Directorios a crear en el destino tras la personalización.

```json
"create_dirs": [
  { "path": "docs/specs/", "gitkeep": true }
]
```

- **`path`** — ruta relativa al destino. Debe terminar en `/`.
- **`gitkeep`** — si `true`, crear `.gitkeep` dentro para que git rastree el directorio vacío.

### 3.7 `post_install`

Comandos que el CLI ejecuta tras personalizar y crear dirs.

```json
"post_install": {
  "steps": [
    {
      "id": "validate-template",
      "description": "Correr validador agentico",
      "command": "node .claude/scripts/validate-template.mjs",
      "must_pass": true,
      "on_fail": "rollback"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador del step |
| `description` | string | Texto mostrado al usuario antes de ejecutar |
| `command` | string | Comando a ejecutar en la raíz del destino |
| `must_pass` | boolean | Si `true` y el comando falla, se aplica `on_fail` |
| `on_fail` | enum | `rollback` · `warn` · `abort` |

**`rollback`:** el CLI restaura el destino al estado previo a la adopción (requiere snapshot).
**`warn`:** el CLI reporta el fallo pero continúa.
**`abort`:** el CLI termina con error pero no rollback.

### 3.8 `post_install_message`

Mensaje que el CLI imprime al finalizar exitosamente.

```json
"post_install_message": {
  "en": "Template adopted successfully. ...",
  "es": "Template adoptado exitosamente. ..."
}
```

El CLI elige el idioma según `LANG`/`LC_ALL` o flag explícito.

### 3.9 `distribution` — allowlist autoritativa

Array de rutas relativas a la raíz del template que el CLI copia al destino. Una entrada que termina en `/` es un directorio y se copia recursivamente; el resto son archivos exactos.

```json
"distribution": [
  ".claude/agents/",
  ".claude/scripts/validate-template.mjs",
  "CLAUDE.md",
  ".gitattributes"
]
```

> **Es allowlist, no metadato informativo. Verificado en el código del CLI:**
>
> - `resolveDistributionPaths` prefiere `expandDeclaredPaths` cuando `distribution` no está vacía, y solo cae al walk del árbol completo cuando está ausente o vacía (`internal/app/init.go:514-517`).
> - `expandDeclaredPaths` hace `os.Stat` de cada entrada declarada y **devuelve error si no existe** (`internal/app/init.go:554-557`). Con `post_install.must_pass: true` + `on_fail: rollback`, **una entrada con ruta inexistente aborta la instalación completa.**
>
> Esto resuelve la contradicción de `cli-integration-guide.md`, cuyo paso 6 describía `copyTree(templateSource, destination, exclude=[".git/"])`. Ese modelo **no es el que rige**. Lo que no está en `distribution` no llega al consumidor, punto.

**Consecuencias operativas:**

- Agregar una entrada es seguro: el apply es no-destructivo (§3.13) y nunca pisa un archivo del consumidor que difiera.
- **Quitar una entrada no borra nada** de lo ya instalado. Los archivos quedan huérfanos en los proyectos existentes. La única limpieza disponible es `clean.files_to_remove` (§3.5.3), con su criterio.
- Toda ruta declarada **debe existir en el template**. Un typo o un archivo movido sin actualizar el contrato es una instalación abortada, no un warning.
- El check `cli-runtime-distribution` del validador deriva las dependencias de runtime de los artefactos distribuidos y exige que estén cubiertas, para que un consumidor no reciba una instrucción cuyo script falta.

**Criterio de qué se declara** (v2.4.0): runtime (lo que el agente, un hook o el CLI lee para funcionar), manual (lo que el consumidor lee para operar el ASDD) y semilla (plantillas que copia y llena). **No** se declaran artefactos del desarrollo del propio ASDD: specs del framework, ADRs internos, auditorías, baselines, suites de test.

### 3.10 `file_merge`

Rutas que **no** deben copiarse verbatim porque el consumidor puede tener contenido propio ahí. El copy loop las saltea y una estrategia dedicada las resuelve.

```json
"file_merge": [
  {
    "path": ".gitignore",
    "strategy": "append-unique",
    "when_exists": "merge",
    "when_missing": "create",
    "requires_cli": "0.4.0"
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `path` | string | Ruta relativa. **Debe** estar también en `distribution` |
| `strategy` | enum | `append-unique` — única implementada |
| `when_exists` | enum | `merge` · `skip` |
| `when_missing` | enum | `create` · `skip` |
| `requires_cli` | SemVer | Versión mínima del CLI que implementa la estrategia |

> `append-unique` es textual y **no sirve para todo formato**. En `.gitattributes` gana la **última** regla que matchea, así que un append cambia la semántica según el orden — razón por la que `.gitattributes` se distribuye como copia no-destructiva y no como merge. Un `json-deep-merge` para `package.json` está identificado como necesidad y no implementado.

### 3.11 `file_copy_as`

Entrega un archivo del template bajo **otro nombre** en el destino, para no colisionar con un archivo homónimo del consumidor.

```json
"file_copy_as": [
  { "from": "README.md", "to": "ASDD-README.md", "when_target_exists": "skip" }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `from` | string | Ruta en el template. **Debe** estar en `distribution` |
| `to` | string | Ruta en el destino |
| `when_target_exists` | enum | `skip` · `overwrite` |

El copy loop **saltea `from` bajo su nombre original** a propósito, para que el archivo fuente no quede duplicado junto al renombrado.

### 3.12 `naming_convention`, `conditional_install`, `model_strategy`

Bloques **declarativos que el CLI no ejecuta**: los consume el runtime del template (validador, orquestador) o son documentación para el mantenedor. El CLI los copia como parte del contrato y no los interpreta.

| Bloque | Quién lo consume | Para qué |
|---|---|---|
| `naming_convention` | Check `naming-convention` del validador (strict) | Prefijo `sofka-asdd-` para el template, `{project.name}-` para artefactos del consumidor, con regex por tipo de artefacto |
| `conditional_install` | Documentación + `sofka-asdd-context-budget-lib.mjs` | Declara dependencias externas que **no** se empaquetan y el trigger que las vuelve necesarias (ej. el AI Dev Kit de Databricks cuando `data_platform == azure-databricks`) |
| `model_strategy` | Orquestador vía `.sofka-asdd/sofka-asdd.lock` | Defaults de modelo por fase; la cadena de resolución es `skill_override > agent_pinning > phase_default > frontmatter` |

### 3.13 Semántica de escritura — apply no-destructivo

El CLI **nunca** sobreescribe un archivo del consumidor cuyo contenido difiera del que el template entrega. Cuatro resultados por archivo (`internal/app/file_nondestructive.go`):

| Situación | Resultado | Qué queda en disco |
|---|---|---|
| El destino no existe | `created` | El archivo del template |
| El destino tiene contenido idéntico | `unchanged` | Sin cambios (no-op) |
| Difiere solo en EOL o BOM | `unchanged` | **Sin cambios** — la comparación se hace sobre contenido normalizado (CRLF→LF + strip de BOM) |
| Difiere, y su hash coincide con el baseline registrado | `overwritten` | La versión nueva del template |
| Difiere, sin baseline o con hash distinto | `preserved` | El archivo del consumidor, **más** `<archivo>.asdd-new` con la versión nueva |

El **baseline** es `.sofka-asdd/sofka-asdd.manifest.json`: `sha256(contenido normalizado entregado)` por ruta, que el CLI escribe en cada init/upgrade. Es lo que permite distinguir "sin tocar, pero de una versión vieja" (se actualiza sin fricción) de "el usuario lo editó" (se preserva).

> **Excepción deliberada:** los archivos bajo `.sofka-asdd/` se sobreescriben **siempre**. Son machine-managed; enrutarlos por la vía no-destructiva congelaba el lock en la versión vieja y producía un bucle infinito de "hay actualización disponible".
>
> **Corolario de esa excepción:** el lock del template no lleva el bloque `project` del consumidor, así que el upgrade **debe** recuperar los valores de `personalize[*].json_path` desde el proyecto destino antes de sobreescribir, o la identidad del proyecto se pierde.

## 4. Reglas de validación del CLI

El CLI debe validar antes de procesar:

1. **JSON parseable** — si no, abortar con mensaje del parser.
2. **`$schema` conocido** — si el schema URL no está entre los soportados, warning.
3. **`contract_version` en rango** — ver §2.
4. **`compatibility`** — plataforma y tools presentes.
5. **`personalize[*].file`** — cada archivo referenciado existe en el template copiado.
6. **`personalize[*].json_path`** — si `file` es JSON, el path es escribible (o creable).
7. **`personalize[*].id`** — debe ser **compuesto** (`project-name`, no `name`). `substitutePlaceholders` reemplaza `${id}` y `{{id}}` en todo archivo distribuido, así que un id de una sola palabra colisiona con template literals de código: hoy el template tiene 77 `${name}` en JavaScript que un id `name` corrompería.
8. **`clean.markers[*]`** — cada `start` tiene exactamente un `end` en el archivo.
9. **`clean.files_to_remove[*]`** — no colisiona con `distribution`, y ningún artefacto distribuido escribe en esa ruta (§3.5.3).
10. **`create_dirs[*].path`** — no incluye `..` ni rutas absolutas.
11. **`distribution[*]`** — cada ruta declarada **existe en el template**. Una ruta inexistente aborta la instalación (§3.9), así que se verifica antes de tocar el destino.
12. **`file_merge[*].path` y `file_copy_as[*].from`** — presentes en `distribution`; si no, la estrategia nunca se dispara.

Si alguna validación falla, el CLI no debe tocar el destino.

## 5. Ejemplo completo

Ver `.sofka-asdd/cli-contract.json` del template `project-structure` para el ejemplo vivo.

## 6. Glosario

| Término | Definición |
|---|---|
| **Template** | Repositorio base que el CLI copia y adapta al proyecto consumidor |
| **Adopción** | Proceso completo: clonar → personalizar → limpiar → crear dirs → validar |
| **Contrato** | Archivo `cli-contract.json` que describe la adopción |
| **Checklist** | Archivo `checklist.json` con verificaciones pre/post-instalación |
| **Lock** | Archivo `sofka-asdd.lock` con el manifiesto versionado del template |
| **Marker** | Par de comentarios HTML que delimitan un bloque procesable |
| **Personalización** | Respuestas del usuario escritas en archivos del template |
| **Rollback** | Restauración del destino al estado previo a la adopción |
