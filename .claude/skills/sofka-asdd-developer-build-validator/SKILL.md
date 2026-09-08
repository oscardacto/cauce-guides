---
name: sofka-asdd-developer-build-validator
description: Corre el build declarado en testing-capabilities.yaml para verificar compilación limpia. Gate rápido post-implementación.
---

# Build Validator

> Gate rápido de compilación post-implementación: detecta si hay un build que ejecutar, corre el comando declarado y reporta fallos sin modificar código.

## Rol

Validador de build read-only. Detecta por presencia de config si hay un build que ejecutar, corre el comando declarado en `.sofka-asdd/testing-capabilities.yaml` y produce un reporte estructurado. **Nunca corrige código** — solo diagnostica. **No infiere comandos por stack.**

## Cuándo activar

- Tras una edición o creación de archivos de código, antes de declarar la tarea como hecha
- Como paso previo al code review (`sofka-asdd-tech-lead-code-review`) o al quality gate (`sofka-asdd-tech-lead-quality-gate`)
- Cuando un agente termina una iteración y necesita confirmar que el sistema aún compila
- Fases: **Construir** (gate rápido post-implementación) y **Verificar** (pre-merge)

## Resolución del comando — orden de precedencia

El comando de build **siempre** proviene de la configuración del proyecto, nunca se infiere del stack:

1. **`.sofka-asdd/testing-capabilities.yaml`** — si existe, tomar de allí `build.command` y `runner.command`. Es la fuente de verdad del proyecto consumidor (alineado con **ORC-009**).
2. **`CLAUDE.md` del proyecto** — leer la sección de "comandos de build/test" si está declarada.
3. **Detección por presencia de config** — solo para decidir *si* hay un build pendiente; nunca para inferir el comando.

### Detección por presencia de config (mínima, agnóstica)

La detección por marcadores es **solo de presencia** — confirma que hay un build que ejecutar, **no** mapea config → comando (esa lógica por-stack NO vive en el core del template).

Archivos de config reconocidos (presencia): `package.json`, `pom.xml`, `build.gradle` / `build.gradle.kts`, `go.mod`, `*.csproj` / `*.sln`, `Cargo.toml`, `pyproject.toml` / `setup.py`.

- Hay config **y** `testing-capabilities.yaml` (o `CLAUDE.md`) declara el comando → ejecutar ese comando.
- Hay config pero **ningún comando declarado** → reportar `UNKNOWN_STACK` y solicitar declararlo en `.sofka-asdd/testing-capabilities.yaml`. El skill **no infiere** el comando del stack.
- No hay ninguna config reconocida → `UNKNOWN_STACK`.

> El template es stack-agnóstico: el comando concreto **siempre** proviene de `.sofka-asdd/testing-capabilities.yaml` (o del `CLAUDE.md` del proyecto). La presencia de config solo indica *que* hay que compilar, no *cómo*.

## Proceso (orden estricto)

### Paso 0 — PRE-FLIGHT ligero

El skill es read-only sobre el código: no crea ni modifica archivos del proyecto. Sin embargo, si está corriendo en una rama protegida, anunciarlo en el reporte (no bloquea — solo informa, porque el skill no commitea). El gate duro de rama vive en `sofka-asdd-skill-preflight.md` para skills que escriben código.

### Paso 1 — Resolver el comando

1. Leer `.sofka-asdd/testing-capabilities.yaml` si existe → extraer `build.command`.
2. Si no, leer `CLAUDE.md` del proyecto → buscar comando declarado.
3. Si no, detectar por **presencia** de config (lista anterior): confirma que hay un build, pero **no infiere** el comando.
4. Si **ningún** método resuelve un comando → reportar `UNKNOWN_STACK` y solicitar al usuario o al `sofka-asdd-tech-lead` que declare el build en `testing-capabilities.yaml`.

### Paso 2 — Identificar archivos modificados

Determinar el scope del cambio para informar al reporte:

```bash
git diff --name-only HEAD          # cambios staged/unstaged
git diff --name-only HEAD~1        # último commit
```

### Paso 3 — Ejecutar el build/compile

Ejecutar el comando resuelto **una sola vez**. Capturar exit code, stdout y stderr.

**Regla AL-006 (`sofka-asdd-anti-loops.md`)**: si el comando falla, **no relanzarlo en loop**. Reportar el primer fallo con causa. Solo se reintenta tras cambio de enfoque o tras corrección por parte del implementador.

### Paso 4 — Validaciones adicionales (si están declaradas)

Si `testing-capabilities.yaml` declara `linter.command` o `typecheck.command` distintos del build, ejecutarlos **acotados a los archivos modificados** cuando el linter lo soporta. No ejecutar el linter sobre todo el codebase si la herramienta permite scope por archivo.

### Paso 5 — Decisión de resultado global

| Compile/build | Linter | Resultado global |
|---|---|---|
| PASS | PASS o no declarado | **PASS** |
| PASS | FAIL | **FAIL** (lint con errores) |
| FAIL | cualquier | **FAIL** (compilación rota) |

## Reglas críticas

- **Nunca corregir código** — solo diagnosticar y reportar. La corrección la hace `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` según el tipo de código afectado.
- **Nunca inferir el comando por stack** — el comando se declara en `testing-capabilities.yaml`; la detección solo confirma presencia de config.
- **Nunca ejecutar `git commit`, `git push`, `git reset`** ni ningún comando que modifique el repo. Respetar **GS-001**, **GS-002**, **GS-003**.
- **Nunca ejecutar `npm install`**, `mvn dependency:resolve` ni equivalentes que muten el lockfile o el cache de dependencias.
- **Nunca ignorar fallos como "preexistentes"**: aplica la regla absoluta de `sofka-asdd-system-integrity.md` — un test o build que falla cuenta como FAIL aunque "ya fallaba en la rama base".
- **Mantener el reporte conciso** — incluir solo los errores relevantes, no el output completo del comando.

## Formato del reporte

```markdown
## Build Validation Report

### Config detectada
- Origen del comando: testing-capabilities.yaml | CLAUDE.md
- Config presente: {archivo(s) marcador encontrados}
- Comando ejecutado: `{comando declarado}`

### Archivos en el scope
- {lista de archivos modificados}

### Compilación
- Estado: PASS | FAIL
- Errores: {lista archivo:línea — descripción, si hay}

### Lint / Typecheck (si aplica)
- Estado: PASS | FAIL | NO_DECLARED
- Errores: N | Warnings: N

### Resultado global
- PASS — el cambio compila limpio. Listo para code review / quality gate.
- FAIL — requiere corrección por el agente implementador (sofka-asdd-developer-frontend o sofka-asdd-developer-backend) (detalles arriba).
- UNKNOWN_STACK — hay config pero ningún comando declarado; declarar en testing-capabilities.yaml.
```

## Outputs

- Reporte en chat para el orquestador o el agente que lo invocó
- Opcional: si la corrida pertenece a un workflow FULL, el resultado se registra en `.asdd-run.json` bajo el step correspondiente (responsabilidad del orquestador, no de este skill)

## Relación con skills y reglas existentes

- **`sofka-asdd-system-integrity.md`** — operacionaliza el punto 1 ("compilación limpia antes de declarar trabajo completo"). Este skill es la herramienta concreta que ejecuta esa verificación.
- **`.sofka-asdd/testing-capabilities.yaml`** y **ORC-009 (TDD forwarding)** — fuente única de verdad de los comandos. El skill consume, no redefine.
- **AL-006 (`sofka-asdd-anti-loops.md`)** — dos fallos del mismo build con la misma causa = stop y análisis, no retry.
- **`sofka-asdd-developer-unit-test`**, **`sofka-asdd-developer-integration-test`** — hermanos del mismo agente. Estos **escriben tests**; el build-validator **ejecuta el build/typecheck** y reporta. No compite con ellos.
- **`sofka-asdd-tech-lead-code-review`** y **`sofka-asdd-tech-lead-quality-gate`** — consumidores naturales. El build-validator es gate **rápido** previo; el quality gate evalúa métricas más amplias (cobertura, complejidad).
- **GS-001, GS-002, GS-003** (`sofka-asdd-git-safety.md`) — el skill no toca git más allá de `git diff --name-only`. No commitea, no resetea, no fuerza push.

## Cuándo NO invocar

- No hay archivos modificados — no hay nada que validar; volver a invocar tras la edición.
- Se requiere verificación de cobertura, complejidad ciclomática o deuda técnica — eso es `sofka-asdd-tech-lead-quality-gate`.
- Se requiere análisis de seguridad estático — eso es `sofka-asdd-security-code-scan`.
- Se requiere ejecutar la suite completa de tests con cobertura — eso es responsabilidad del runner declarado en `testing-capabilities.yaml`, no de este gate rápido.

## Anti-patterns

- **Hardcodear comandos del stack** — `npx tsc --noEmit`, `mvn compile`, `./gradlew build` literales en el skill. El template es stack-agnóstico: el comando siempre se resuelve desde `testing-capabilities.yaml`.
- **Inferir el comando a partir del marcador** — mapear `package.json → tsc`, `pom.xml → mvn compile`, etc. es lógica por-stack y NO vive en el core. La detección es solo de presencia.
- **Corregir el código que falla** — el validador diagnostica, no implementa. Tocar código aquí viola **ORC-000** (delegación pura: cada agente con su rol).
- **Retry en loop ante el mismo fallo** — viola **AL-006**. Dos fallos del mismo build con la misma causa raíz = stop y reportar.
- **PASS con tests "preexistentes" rotos** — la regla absoluta de `sofka-asdd-system-integrity.md` lo prohíbe: si falla, FAIL, sin excepciones por antigüedad del bug.
- **Ejecutar el suite completo cuando se puede acotar por archivo** — desperdicia tokens y tiempo; el linter y el typecheck soportan scope por archivo en la mayoría de stacks.
- **Modificar dependencias o lockfiles** — `npm install`, `mvn -U`, `cargo update` cambian el estado del repo. El validador es read-only sobre código y read-only sobre dependencias.

## Nota sobre alcance de la detección

La detección es **mínima y agnóstica**: solo presencia de config, sin lógica por-stack. El comando concreto **siempre** se declara en `.sofka-asdd/testing-capabilities.yaml` (o el `CLAUDE.md` del proyecto). La profundización por stack (cómo compilar cada tecnología) NO vive en el core del template: es responsabilidad del proyecto consumidor declararla. Esto mantiene el `build-validator` stack-agnóstico (#3583).
