# Checklist de Adopción — ASDD Template

**Propósito:** confirmar que la adopción del template quedó correcta, paso a paso. Cubre desde pre-requisitos hasta validación final. Es la versión humana de la checklist ejecutable que el CLI corre durante la instalación (`.sofka-asdd/checklist.json`, que vive en el repositorio template y no se copia a tu proyecto).

## Pre-instalación

Antes de correr el CLI verificá:

- [ ] **Node.js ≥ 18 instalado** — `node --version` imprime `v18.x` o superior.
- [ ] **Git ≥ 2.30 instalado** — `git --version` imprime `git version 2.30.x` o superior.
- [ ] **Plataforma soportada** — macOS (darwin), Linux o Windows.
- [ ] **Destino vacío o se usa `--force`** — el CLI no pisa un directorio con contenido salvo que pases `--force`.
- [ ] **Acceso al template upstream** — `git clone` funciona contra el repositorio del template.

### Solo en Windows

Dos ajustes que no son opcionales, aunque el CLI no los verifique:

- [ ] **Shell POSIX disponible** — `bash --version` responde. Los agentes ejecutan
  pipelines POSIX declarados en las reglas y skills (`find … | wc -l` para la detección
  de `codebase_size`, el bloque PRE-FLIGHT de rama, `tr`/`xargs`/`sort` en pre-push).
  Git for Windows lo provee como Git Bash. Tener solo el binario `git` **no alcanza**:
  MinGit y un git instalado únicamente dentro de WSL satisfacen el requisito de versión
  y dejan esa capa sin ejecutar.
- [ ] **Rutas largas habilitadas** — `git config core.longpaths true` en el proyecto (o
  `--global`). El template se mantiene holgado dentro del límite de 260 caracteres de
  Windows, pero los artefactos que los agentes generan bajo
  `docs/testing/atf-web/{run_id}/…` sumados a una raíz profunda (`OneDrive - Empresa`,
  rutas de cliente anidadas) lo cruzan. Sin esto, la escritura del artefacto falla a
  mitad de una corrida.

## Durante la instalación

El CLI te va a pedir las siguientes respuestas (pueden cambiar según versión del template):

- [ ] **Nombre del proyecto** (kebab-case) — ej. `billetera-digital`. Solo minúsculas, números y guiones. Empieza con letra.
- [ ] **Dominio** — fintech · health · insurance · retail · logistics · education · other.
- [ ] **Stack tecnológico** — ej. `node/typescript`, `python/fastapi`, `java/spring`, `go`, `dotnet`.
- [ ] **Descripción corta** (opcional) — una línea describiendo el proyecto.

Luego el CLI te va a preguntar:

- [ ] **Mantener ejemplos en `docs/.example/`?** — recomendado mantener en adopción inicial.
- [ ] **Eliminar propuestas de auditoría del template?** — recomendado eliminar (es historial del template, no del proyecto).

## Post-instalación

Al terminar la adopción el CLI ejecuta automáticamente:

- [ ] **Validador agéntico termina con 0 errores** — si aparece un error, el CLI hace rollback; warnings staged deben quedar documentados.

Verificar manualmente:

### Enforcement git — bloqueante, no opcional

- [ ] **Protected branches configurados en el remoto** — en GitLab/GitHub, para
      `main`, `qa` y `dev`: *Allowed to push = No one*, merge solo vía MR/PR.
      **Es la única capa que un evasor deliberado no puede saltar**: ningún hook
      local, ni nativo ni de Claude Code, corre en el servidor. ADR-007 apoya en
      esta capa toda su aceptación de riesgo, así que sin ella los guards locales
      —que tienen escape hatch por diseño— quedan como única protección.
      Registrar quién la configuró y cuándo.
- [ ] **Hooks nativos instalados** — `node .claude/scripts/sofka-asdd-install-githooks.mjs`
      (agregar `--recurse` si el workspace tiene repos anidados). Verificar con
      `--check` que devuelve `OK`. Enforzan GS-001/002/004/005/007/008/010,
      CORE-009 y ART-001 sin depender del parseo de comandos.
- [ ] **`git --version` ≥ 2.28** — por debajo de esa versión no existe
      `reference-transaction` y GS-004/GS-010 no se evalúan; el resto de los
      hooks funciona igual.

### Artefactos del template

- [ ] **`.sofka-asdd/sofka-asdd.lock` existe** con el manifiesto versionado del template.
- [ ] **`.sofka-asdd/cli-contract.json` existe** con el contrato v1.0.
- [ ] **Disclaimer removido de `CLAUDE.md`** — el bloque entre `<!-- sofka-asdd:template-disclaimer:start -->` y `<!-- sofka-asdd:template-disclaimer:end -->` ya no está.
- [ ] **Estructura `docs/` creada:**
  - [ ] `docs/specs/`
  - [ ] `docs/architecture/decisions/`
  - [ ] `docs/architecture/diagrams/`
  - [ ] `docs/architecture/contracts/`
  - [ ] `docs/tech/`
  - [ ] `docs/testing/`
  - [ ] `docs/qa/`
  - [ ] `docs/security/`
- [ ] **Git inicializado** — `git status` en el destino funciona; `git log` está vacío (nuevo repo).

## Verificar corriendo el validador

Desde la raíz del proyecto consumidor:

```bash
node .claude/scripts/validate-template.mjs
```

Debe terminar con `0 error`. El número de checks evoluciona con el template y
no forma parte del contrato. Los warnings staged conocidos se revisan contra la
guía de adopción correspondiente; nunca se ignoran silenciosamente.

## Qué hacer si algo falla

| Síntoma | Acción |
|---|---|
| CLI aborta con "Node version mismatch" | Instalar Node ≥ 18 con `nvm install 18` o equivalente |
| CLI aborta con "Destination not empty" | Mover/borrar contenido previo, o usar `--force` (pisa todo) |
| `validate-template.mjs` falla post-instalación → CLI hace rollback | Revisar stdout del CLI para ver qué check falló; reportar en el repo del CLI |
| Disclaimer sigue en `CLAUDE.md` | Confirmar que el template está en versión ≥ 1.0.1. Si sí, es bug del CLI |
| Falta algún directorio `docs/` | Verificar `cli-contract.json` → `create_dirs`. Si está listado y no se creó, bug del CLI |
| `post_install` falla por permisos | Verificar que el usuario tiene write en el destino |

Si el error no aparece en esta tabla:

1. Buscar en `.claude/docs/validation.md` → sección Troubleshooting.
2. Correr el validador con `--silent` y redirigir a archivo para diagnóstico.
3. Abrir issue en el repo del CLI con el output completo.

## Siguiente paso

Adopción confirmada. Correr:

```bash
/sofka-asdd:specify
```

Para iniciar el ciclo ASDD con la primera spec.
