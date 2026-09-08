# Guía de Integración CLI — ASDD Templates

**Audiencia:** equipo que mantiene el CLI `guide-ai` y equipos que publican templates ASDD.
**Versión del contrato objetivo:** `1.0.0`

## 1. Overview arquitectónico

El CLI `guide-ai` es **genérico y multi-template**. No conoce la estructura interna de cada template: lee un contrato declarativo (`cli-contract.json`) y lo ejecuta.

```
+---------------------+        +-------------------------+
|  CLI guide-ai       | reads  |  template               |
|  (generic executor) | -----> |  .asdd/           |
|                     |        |    asdd.lock      |
|                     |        |    cli-contract.json    |
|                     |        |    checklist.json       |
+---------------------+        +-------------------------+
          |
          | applies contract
          v
+---------------------+
|  destination repo   |
|  (personalized)     |
+---------------------+
```

Templates actuales y futuros:

| Template | Target agent | Estado |
|---|---|---|
| `project-structure` | `claude-code` | v1.0.1 — publicado |
| `copilot-structure` | `github-copilot` | Pendiente — misma contract spec |
| `gemini-structure` | `gemini` | Pendiente — misma contract spec |

Todos exponen la misma interfaz (`.asdd/cli-contract.json` + `checklist.json`).

## 2. Responsabilidades

### Qué hace el CLI (una sola implementación, todos los templates)

- Detectar `contract_version` y validar compatibilidad.
- Preguntar campos de `personalize` al usuario.
- Escribir respuestas en archivos del template usando `json_path`.
- Procesar `clean.markers` (buscar start/end, borrar bloque y opcionalmente los markers).
- Procesar `clean.optional_remove` preguntando al usuario.
- Crear directorios declarados en `create_dirs` (con `.gitkeep` si aplica).
- Ejecutar `post_install.steps` en orden; aplicar `on_fail` si falla.
- Correr `checklist.pre_install` y `checklist.post_install`.
- Hacer rollback si es necesario (snapshot de destino antes de aplicar).
- Inicializar git en destino (`git init` sin copiar `.git` del template).

### Qué declara el template (varía por template)

- Metadata (`template.id`, `version`, `target_agent`).
- Requisitos de compatibilidad.
- Campos a preguntar (nombre, dominio, stack, etc.).
- Bloques a limpiar (disclaimers específicos del template).
- Directorios a crear (estructura esperada por los agentes del template).
- Comandos post-install (validadores propios).
- Checklist de aceptación.

## 3. Algoritmo de adopción — pseudocódigo de referencia

```
function adoptTemplate(templateSource, destination, options):
    // 1. Leer declaraciones del template
    contract = readJSON(join(templateSource, ".asdd/cli-contract.json"))
    checklist = readJSON(join(templateSource, ".asdd/checklist.json"))

    // 2. Validar contract
    validateSchema(contract)
    assertContractVersionSupported(contract.contract_version)
    assertCompatibility(contract.compatibility)

    // 3. Pre-install checks
    for step in checklist.pre_install:
        result = runPreInstallCheck(step)
        if !result.ok:
            abort("Pre-install check failed: " + step.id)

    // 4. Verificar destino
    if !directoryEmpty(destination) and !options.force:
        abort("Destination not empty. Use --force to overwrite.")

    // 5. Snapshot para rollback
    snapshot = snapshotDestination(destination)

    try:
        // 6. Copiar SOLO lo declarado en contract.distribution — allowlist
        //    autoritativa, NO copia total del árbol. Ver contract-spec.md §3.9.
        //    Una entrada con ruta inexistente aborta la instalación.
        //    La escritura es no-destructiva: nunca pisa un archivo del consumidor
        //    que difiera; la versión nueva queda como <archivo>.asdd-new. Ver §3.13.
        for path in contract.distribution:
            assertExists(join(templateSource, path))   // si falta → abort
        copyDeclared(templateSource, destination, contract.distribution,
                     skip=fileMergePaths + fileCopyAsSources)

        // 7. Personalize — preguntas al usuario
        answers = {}
        for field in contract.personalize:
            answer = promptUser(field)
            if field.validate_regex:
                assertMatch(answer, field.validate_regex, field.error_message)
            answers[field.id] = answer

            targetFile = join(destination, field.file)
            if field.file.endsWith(".json"):
                writeJsonPath(targetFile, field.json_path, answer)
            else:
                writeTextReplacement(targetFile, field.json_path, answer)

        // 8. Clean — procesar markers
        for marker in contract.clean.markers:
            targetFile = join(destination, marker.file)
            if marker.action == "remove":
                removeMarkedBlock(targetFile, marker.start, marker.end, marker.remove_markers)
            elif marker.action == "replace":
                replaceMarkedBlock(targetFile, marker.start, marker.end, marker.with, marker.remove_markers)

        // 9. Clean — optional remove
        for optional in contract.clean.optional_remove:
            userChoice = askYesNo(optional.prompt, default=optional.default)
            if userChoice == "remove":
                removePath(join(destination, optional.path))

        // 10. Clean — files_to_remove (sin preguntar)
        for filePath in contract.clean.files_to_remove:
            removePath(join(destination, filePath))

        // 11. Create dirs
        for dir in contract.create_dirs:
            mkdirP(join(destination, dir.path))
            if dir.gitkeep:
                writeFile(join(destination, dir.path, ".gitkeep"), "")

        // 12. Post-install steps
        for step in contract.post_install.steps:
            result = execute(step.command, cwd=destination)
            if step.must_pass and result.exitCode != 0:
                if step.on_fail == "rollback":
                    restoreSnapshot(destination, snapshot)
                    abort("Rollback: step " + step.id + " failed")
                elif step.on_fail == "abort":
                    abort("Step " + step.id + " failed")
                elif step.on_fail == "warn":
                    warn("Step " + step.id + " failed (continuing)")

        // 13. Post-install checklist
        for step in checklist.post_install:
            result = runPostInstallCheck(destination, step)
            if !result.ok:
                warn("Post-install check failed: " + step.id)

        // 14. Inicializar git del destino
        gitInit(destination)

        // 15. Mensaje final (idioma segun LANG)
        locale = detectLocale()
        message = contract.post_install_message[locale] or contract.post_install_message.en
        printSuccess(message)

    catch error:
        if snapshot:
            restoreSnapshot(destination, snapshot)
        throw error
```

### Subrutinas clave

**`writeJsonPath(file, path, value)`** — parsea JSON, escribe `value` en `path` dot-notation, serializa preservando formato.

**`removeMarkedBlock(file, start, end, removeMarkers)`** — encuentra `start` y `end` en el archivo. Si `removeMarkers=true`, borra desde el inicio de la línea de `start` hasta el final de la línea de `end` (incluidos). Si `false`, borra solo el contenido entre ambos.

**`snapshotDestination(destination)`** — si el destino ya tenía archivos, copiar a directorio temporal. Si estaba vacío, el "snapshot" es simplemente la marca "empty".

**`runPreInstallCheck(step)`** — ejecuta `step.check` según tipo:
- `node --version` / `git --version` → ejecuta comando, compara stdout con `expect_regex`.
- `directory_empty_or_force_flag` → chequea flag `--force` del CLI.

**`runPostInstallCheck(destination, step)`** — según `step.check`:
- `file_exists` → `fs.existsSync(join(destination, step.path))`.
- `json_field_not_empty` → lee JSON, navega `step.field`, verifica valor no vacío.
- `pattern_absent` → lee archivo, verifica que `step.pattern` no aparece.
- `dirs_exist` → verifica cada path en `step.paths`.
- `exit_code_zero` → ejecuta `step.command`, verifica exit code 0.

## 4. Manejo de versionado CLI vs contrato

El CLI declara qué rango de contratos soporta:

```javascript
// en el CLI
const SUPPORTED_CONTRACTS = ">=1.0.0 <2.0.0";
```

Tabla de decisión al leer un contrato:

| Situación | Acción del CLI |
|---|---|
| `contract_version=1.0.0`, CLI soporta `>=1.0.0 <2.0.0` | Adoptar normalmente |
| `contract_version=1.2.0`, CLI soporta `>=1.0.0 <2.0.0` | Adoptar con warning (CLI ignora campos nuevos) |
| `contract_version=2.0.0`, CLI soporta `>=1.0.0 <2.0.0` | Abortar: "Actualizá el CLI" |
| `contract_version=0.9.0`, CLI soporta `>=1.0.0 <2.0.0` | Abortar: "Template usa versión legacy" |

Recomendación: el CLI mantiene una **matriz de compatibilidad** en la documentación del CLI, no hardcodeada. Cuando libera una nueva major, publica el rango.

## 5. Política de errores y rollback

### Errores recuperables
- **Pre-install check fails:** abortar antes de tocar destino. Mensaje claro con cómo resolverlo (instalar Node, liberar directorio).
- **User cancels prompt:** rollback si hay snapshot, abortar.

### Errores no recuperables
- **Archivos corruptos durante copy:** rollback + abort.
- **`post_install` con `on_fail=rollback`:** restaurar snapshot.
- **`post_install` con `on_fail=abort`:** dejar estado actual, mensaje al usuario explicando qué pasó.

### Idempotencia

El CLI debe ser idempotente en la medida de lo posible:

- Escribir dos veces el mismo valor en un JSON path → mismo resultado.
- Procesar un marker ya removido → no-op (no fallar).
- Crear un directorio que ya existe → no-op.
- Ejecutar un `post_install` comando → responsabilidad del comando (ej. el validador es idempotente por diseño).

Si el usuario interrumpe con Ctrl-C a mitad de la adopción, el CLI debe capturar SIGINT, ejecutar rollback y salir limpiamente.

## 6. Testing: cómo el equipo CLI prueba contra templates

### Test de integración — flujo happy-path

```bash
# Setup
TEMPLATE_DIR=$(git clone https://gitlab.com/guide/project-structure /tmp/t-source)
DEST_DIR=/tmp/t-dest
mkdir -p "$DEST_DIR"

# Ejecutar CLI en modo no-interactivo (respuestas predefinidas)
guide-ai adopt "$TEMPLATE_DIR" "$DEST_DIR" \
  --answer project-name=mi-proyecto-test \
  --answer project-domain=fintech \
  --answer project-stack=node/typescript \
  --no-prompt-optional

# Aserciones
test -f "$DEST_DIR/.asdd/asdd.lock"
jq -e '.project.name == "mi-proyecto-test"' "$DEST_DIR/.asdd/asdd.lock"
! grep -q "asdd:template-disclaimer:start" "$DEST_DIR/CLAUDE.md"
test -d "$DEST_DIR/docs/specs"
(cd "$DEST_DIR" && node .claude/scripts/validate-template.mjs)
```

### Test de rollback

```bash
# Simular post-install que falla
DEST_DIR=/tmp/t-rollback
mkdir -p "$DEST_DIR"
echo "preexisting" > "$DEST_DIR/marker.txt"

# Usar un template mock que fuerza failure en post_install
guide-ai adopt "$TEMPLATE_MOCK_FAILING" "$DEST_DIR"

# El archivo preexistente debe seguir ahí (rollback correcto)
test -f "$DEST_DIR/marker.txt"
# El CLI no debe haber dejado archivos del template
! test -f "$DEST_DIR/CLAUDE.md"
```

### Test cross-template

El mismo test suite debe correr contra cada template (project-structure, copilot-structure, gemini-structure). Si uno falla, es regresión del CLI o del template.

## 7. Tabla de responsabilidades

| Acción | CLI | Template |
|---|:-:|:-:|
| Definir qué se personaliza | | X |
| Preguntar al usuario | X | |
| Validar respuestas con regex | X | |
| Escribir respuestas en archivos | X | |
| Definir markers HTML | | X |
| Procesar markers | X | |
| Definir directorios ASDD | | X |
| Crear directorios | X | |
| Definir comandos post-install | | X |
| Ejecutar comandos post-install | X | |
| Manejar rollback | X | |
| Inicializar git en destino | X | |
| Validar consistencia agéntica | | X (via `validate-template.mjs`) |
| Mensaje final al usuario | | X (declara) / X (imprime) |

## 8. Checklist para mantener un template compatible

Cada vez que se libera una nueva versión de un template:

- [ ] `contract_version` en `cli-contract.json` apunta al schema que usa.
- [ ] `template.version` incrementado según cambios (SemVer).
- [ ] **Toda clave nueva del contrato tiene su sección en `contract-spec.md`** y su ítem en esta lista, en el mismo cambio. Es cómo 6 de 15 claves quedaron indocumentadas.
- [ ] **`distribution` refleja el criterio vigente** (runtime + manual + semilla; nada del desarrollo del ASDD) y **cada ruta declarada existe en disco** — una que falte aborta la instalación.
- [ ] **`clean.files_to_remove` cumple su criterio de admisibilidad** (`contract-spec.md` §3.5.3): no colisiona con `distribution` y ningún artefacto distribuido escribe en esas rutas.
- [ ] **`file_merge[*].path` y `file_copy_as[*].from` están en `distribution`**; si no, la estrategia nunca se dispara.
- [ ] `personalize` cubre todos los campos que el template necesita personalizar, **con ids compuestos** (`project-name`, no `name` — colisiona con template literals de código).
- [ ] `clean.markers` cubre todos los bloques específicos del template.
- [ ] `create_dirs` refleja la estructura ASDD esperada.
- [ ] `post_install` incluye el validador del template.
- [ ] `checklist.json` verifica el resultado final, y **su `expect_regex` de versiones concuerda con `compatibility.required_tools`** — el checklist es el gate que se ejecuta de verdad.
- [ ] `node .claude/scripts/validate-template.mjs` da **0 errores** en el template (39 checks al 2026-08; el conteo vivo está en `.claude/docs/validation.md`, no se replica acá para no driftear).
- [ ] **El tag `v{template.version}` existe y está pusheado.** Sin el tag, `reconstructLegacyBaseline` no puede reconstruir el baseline de esa versión y todo upgrade desde ella produce `.asdd-new` en masa.
- [ ] Test de integración del CLI pasa contra este template.

## 9. Evolución futura

Cambios compatibles (MINOR) previstos:

- Agregar `type: multi-select` en `personalize` (checklist con varias opciones).
- Agregar `clean.replace_strings` (reemplazos simples sin markers).
- Agregar `post_install.steps[*].env` (variables de entorno por step).

Cambios incompatibles (MAJOR) evitar hasta 2026-Q4:

- Renombrar campos existentes.
- Cambiar el formato de `json_path` (ej. a JSONPath estándar `$.project.name`).

## 10. Referencias

- Spec formal: `docs/adoption/contract-spec.md`
- Schema JSON: `https://sofka.com.co/asdd/contract/v1.0/schema.json` (a publicar)
- Template de referencia: `project-structure` (este repo)
- CLI: `guide-ai` (repo `/IA/ASDD/cli`)
