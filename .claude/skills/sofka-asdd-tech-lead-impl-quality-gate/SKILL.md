---
name: sofka-asdd-tech-lead-impl-quality-gate
description: Calidad continua al escribir código — baseline verde, scope quirúrgico, umbrales SOLID/CC/cobertura. Distinto del gate formal de PR.
---

# Tech Lead — Impl Quality Gate

> Chequeo de calidad continuo que acompaña al agente implementador (`sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend`) durante la fase **Construir**. Verifica que las precondiciones de calidad están en verde antes de la primera edición y que el trabajo en progreso no degrada el baseline.

## Rol

Guardian inline del implementador. No emite el sign-off final (eso es del gate de PR), sino que evita que el código nazca roto: rama dedicada, compilación y tests baseline verdes, anti-patrones preexistentes documentados, reglas activas declaradas y scope quirúrgico publicado. Sin **GATE PASS** explícito, el implementador no escribe código.

## Cuándo activar

**Señales:**
- El usuario u orquestador va a invocar a `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` para implementar una feature, refactor o bugfix.
- Inicio de una nueva sesión de implementación tras `/compact`, `/clear` o reanudación de un run (`ORC-007`).
- Antes de la primera edición sobre un módulo con deuda técnica acumulada.
- Tras escalamiento LIGHT → FULL (`ORC-001-C`) cuando la tarea acotada se vuelve un cambio mayor.

**Fase ASDD:** Construir (`WF-004`).

## Proceso

### Paso 0 — PRE-FLIGHT (rama dedicada)

Aplicar el bloque PRE-FLIGHT estándar (`sofka-asdd-skill-preflight.md`). Si la rama es protegida (`GS-001`) → STOP, sin excepción. No se procede a las siguientes verificaciones.

### Paso 1 — Resolver comando de test y módulo objetivo

```bash
# Test runner del proyecto (ORC-009)
CAPS=".sofka-asdd/testing-capabilities.yaml"
[ -f "$CAPS" ] || echo "WARNING: testing-capabilities.yaml ausente — pedir a devops-engineer-pipeline que lo provisione"

# Módulo objetivo: argumento explícito o auto-detección desde diff
MODULE_ARG="${1:-}"
if [ -z "$MODULE_ARG" ]; then
  BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|.*/||' || echo "main")
  CHANGED=$(git diff --name-only "origin/${BASE_BRANCH}..HEAD" 2>/dev/null || git diff --name-only HEAD)
  echo "Archivos del diff (auto-detección):"
  printf '%s\n' "$CHANGED"
fi
```

Si no hay cambios todavía (rama nueva sin commits) → declarar `BASELINE PARCIAL — sin diff aún` y continuar con verificaciones de baseline igualmente.

### Paso 2 — VERIFICACIÓN: Baseline compilación (BLOQUEANTE)

Ejecutar el comando de build del proyecto (extraído de `.sofka-asdd/testing-capabilities.yaml` o del `CLAUDE.md` del proyecto consumidor). Si falla → `GATE BLOCKED — baseline de compilación roto`. No se puede distinguir errores nuevos de los preexistentes (`sofka-asdd-system-integrity.md`).

### Paso 3 — VERIFICACIÓN: Baseline tests del módulo afectado (BLOQUEANTE)

Ejecutar el test runner del proyecto restringido al módulo objetivo. Reglas (`sofka-asdd-system-integrity.md`):

| Situación | Acción |
|---|---|
| Tests verdes en módulos del diff | ✅ continuar |
| Tests rotos en archivos que NO se tocarán | `BASELINE PARCIAL` con lista exacta; continuar solo si los archivos del scope están verdes |
| Tests rotos en archivos que SÍ se tocarán | `GATE BLOCKED — tests del scope rotos` — STOP |

Regla absoluta: si los tests se pueden arreglar, **se arreglan** (no aceptar como "preexistente").

### Paso 4 — VERIFICACIÓN: Anti-patrones preexistentes (INFORMATIVO)

Escanear el módulo objetivo y documentar el baseline de deuda técnica. El implementador no es responsable de lo preexistente, pero **no puede empeorarlo**. Patrones a buscar (adaptar al stack del proyecto consumidor):

| Categoría | Indicador típico |
|---|---|
| Magic numbers / strings | Literales sin constantes nombradas |
| Funciones largas | Lógica > 30 líneas en una sola función |
| Nesting profundo | Más de 2 niveles de control de flujo anidado |
| Casts inseguros | `as`, type assertions, conversiones forzadas |
| Logs en código de producción | `print`, `console.log`, `System.out` sin logger formal |
| Wildcard imports | Imports `*` que ocultan dependencias |
| Dead code | Funciones, variables o imports no usados |

Publicar la lista con conteos exactos. Si el módulo tenía 0 magic numbers, el trabajo nuevo no puede introducirlos.

### Paso 5 — VERIFICACIÓN: Reglas de calidad activas (BLOQUEANTE)

El implementador publica en chat las **5 reglas más relevantes** para el cambio, citando IDs reales del template:

```
Reglas activas para este cambio:
1. [SRP / OCP / DIP — regla SOLID concreta, no genérica]
2. [Anti-patrón a evitar — específico del módulo]
3. [Cobertura — umbrales del proyecto consumidor: global ≥ 80%, dominio ≥ 90% por defecto]
4. [Seguridad — auth, validación de inputs, secrets — ver sofka-asdd-security]
5. [Naming / estructura — convención del proyecto + .claude/docs/clean-code-solid.md]
```

Si el implementador no logra publicar reglas concretas → no ha leído `.claude/docs/clean-code-solid.md` ni el `CLAUDE.md` del módulo. **BLOQUEANTE**.

### Paso 6 — VERIFICACIÓN: Scope Declaration (BLOQUEANTE)

Publicar la lista exacta de archivos a crear o modificar (`.claude/docs/stabilization-bug-rules.md` — Scope Declaration):

```
Scope Declaration:
- src/path/FileA.ext — razón directa al cambio
- src/path/FileA.test.ext — tests del cambio
- [ningún otro archivo]
```

Si durante la implementación surge necesidad de tocar algo fuera del scope → escalar al usuario antes de editar, nunca silenciosamente.

### Paso 7 — VERIFICACIÓN CONTINUA: durante la edición

Mientras el implementador escribe código (no solo al inicio), reportar pulsos cortos cuando:

| Trigger | Reporte |
|---|---|
| Función excede `CC > 10` | "FUNCIÓN `X` excede CC=12 — extraer o simplificar antes de avanzar" |
| Cobertura del módulo cae bajo umbral | "Cobertura del módulo bajó a 78% — falta test para `Y`" |
| Aparece anti-patrón nuevo | "Introducido magic number en `Z:42` — extraer a constante nombrada" |
| Edición fuera del scope sin justificación | "Edición en `archivo no declarado` — pausar y reportar al usuario" |

Los pulsos son **inline** y breves. No reemplazan code review, lo previenen.

## Umbrales por defecto (ajustables en `CLAUDE.md` del proyecto)

| Métrica | Umbral | Referencia |
|---|---|---|
| Complejidad ciclomática (CC) por función | ≤ 10 | `.claude/docs/clean-code-solid.md` |
| Cobertura global | ≥ 80 % | `.claude/docs/clean-code-solid.md`, `sofka-asdd-system-integrity.md` |
| Cobertura capa dominio | ≥ 90 % | `.claude/docs/clean-code-solid.md` |
| Cobertura capa aplicación | ≥ 85 % | `.claude/docs/clean-code-solid.md` |
| Nesting máximo | 2 niveles | `.claude/docs/clean-code-solid.md` |
| Duplicación (DRY) | Refactor a partir de 3 repeticiones | `.claude/docs/clean-code-solid.md` |
| Función larga | ≤ 30 líneas para lógica pura | `.claude/docs/clean-code-solid.md` |
| Anti-patrones nuevos | 0 incrementales vs baseline | Paso 4 |

## Output — resultado del gate

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IMPL QUALITY GATE — [módulo]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Rama dedicada     : ✅/❌ — [nombre-rama]
  Compilación base  : ✅/❌ — [comando del runner]
  Tests baseline    : ✅/❌ — [X passed, Y failed | PARCIAL: lista]
  Anti-patrones     : [N preexistentes — baseline documentado]
  Reglas activas    : ✅/❌ — [5 declaradas | no publicadas]
  Scope Declaration : ✅/❌ — [N archivos declarados | no publicado]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RESULTADO: ✅ GATE PASS — autorizado a escribir código
             ❌ GATE BLOCKED — [razón exacta]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Persistir en `.asdd-run.json` bajo el step correspondiente de la fase Construir (`ORC-007`) y, si el gate corre tras `/compact`, recuperar estado siguiendo el protocolo de `sofka-asdd-checkpoint-resume.md` (sección "Ante `/compact`, `/clear`, error de API o agotamiento de tokens").

## Reglas absolutas

1. **Sin GATE PASS no se escribe código.** Sin excepción — ni para "un fix de 3 líneas" (alineado con `SBR-003 — Surgical Changes`).
2. **Compilación rota → STOP.** No se puede atribuir errores nuevos vs preexistentes.
3. **Tests rotos en archivos del scope → STOP.** Baseline roto invalida cualquier verificación posterior.
4. **Reglas activas sin declarar → BLOQUEANTE.** Declarar reglas concretas, no genéricas como "voy a seguir SOLID".
5. **Scope sin declarar → BLOQUEANTE.** Sin scope no se puede validar `git diff --name-only HEAD` al final.
6. **Anti-patrones preexistentes documentados:** el cambio no introduce ningún anti-patrón nuevo del tipo ya presente.

## Relación con skills y reglas existentes

| Artefacto | Diferenciación |
|---|---|
| `sofka-asdd-tech-lead-quality-gate` (hermana) | **Gate FORMAL de PR** — corre una sola vez antes de merge/release, emite PASS/FAIL final con cobertura, CC, blockers (fase **Verificar**, `WF-005`). Este skill es el **chequeo CONTINUO** durante implementación (fase **Construir**, `WF-004`). Mismo umbral CC ≤ 10 (`.claude/docs/clean-code-solid.md`). |
| `sofka-asdd-tech-lead-code-review` | Code review puntual sobre PR/diff. Inline-quality es **previo** al review, no lo reemplaza. |
| `sofka-asdd-tech-lead-refactoring-plan` | Plan de deuda técnica para sprints futuros. Aquí solo se documenta el baseline; el plan vive en otro skill. |
| `.claude/docs/clean-code-solid.md` | Fuente de los umbrales SOLID, CC, cobertura, naming. Este skill **opera** sobre esas reglas. |
| `sofka-asdd-system-integrity.md` | Define el deber de baseline verde y dependent module testing. Paso 2 y 3 lo enforzan. |
| `.claude/docs/stabilization-bug-rules.md` | Define Scope Declaration (`SBR-003`) e Impact Map. Paso 6 lo aplica al inicio. |
| `sofka-asdd-skill-preflight.md` | Bloque PRE-FLIGHT estándar para Paso 0. |
| `.claude/docs/developer-test-protocol.md` | Test Coverage Declaration que el implementador publica tras el GATE PASS. |

## Cuándo NO invocar

- **Sign-off final de PR / release** → usar `sofka-asdd-tech-lead-quality-gate` (gate formal).
- **Auditoría de un PR ya cerrado** → usar `sofka-asdd-tech-lead-code-review`.
- **Detectar deuda para un sprint de mejora** → usar `sofka-asdd-tech-lead-refactoring-plan`.
- **Validación de seguridad** → escalar a `sofka-asdd-security-code-scan`.
- **Fase Especificar / Analizar / Diseñar** — este skill aplica solo a Construir; en fases tempranas no hay código que medir.

## Anti-patterns

- **Saltar el gate "por un fix pequeño"** — exactamente ahí nace la deuda. Cambios atómicos también requieren scope y baseline verde (`SBR-003`).
- **Declarar GATE PASS con tests rojos preexistentes** — el baseline roto invalida cualquier medición posterior. Arreglar o reportar; no ignorar (`sofka-asdd-system-integrity.md`).
- **Reglas activas en genérico** — "voy a seguir SOLID" no es una regla, es una promesa. Declarar reglas específicas del módulo y del cambio.
- **Edición silenciosa fuera del scope** — toda edición no declarada se reporta antes de hacerla. Si aparecen archivos fuera del scope al final → `git checkout` o justificación pública (`SBR-003`).
- **Confundir este gate con el de PR** — este corre N veces (inline durante implementación); el de PR corre una vez (formal antes de merge). Roles distintos, no se sustituyen.
