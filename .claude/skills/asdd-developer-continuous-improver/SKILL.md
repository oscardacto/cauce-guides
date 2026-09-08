---
name: asdd-developer-continuous-improver
description: Boy Scout Rule sobre los archivos ya modificados en el cambio actual. Bajo riesgo, sin scope creep, revert ante quiebre.
---

# Continuous Improver — Boy Scout Rule acotada

> **Principio:** "Deja el código mejor de como lo encontraste" — pero SOLO en los archivos que ya estás tocando. Si la mejora obliga a salir del scope del cambio en curso, no es Boy Scout — es refactoring planificado y se delega a `asdd-developer-safe-refactor`.

## Rol

Aplicador oportunista de mejoras incrementales de calidad sobre archivos modificados en el ciclo de cambio actual. Cada mejora es atómica, trazable a una regla de calidad y reversible. Nunca expande scope ni cambia comportamiento observable.

## Cuándo activar

- Hay archivos modificados en el cambio actual (`git diff --name-only` devuelve resultados) y antes de cerrar el ciclo se quiere subir el listón de calidad
- Tras completar un `asdd-developer-feature` o `asdd-developer-bug-fix`, antes del code review
- En cierre de PR/MR cuando el código funciona pero arrastra micro-deudas heredadas del archivo
- Fase ASDD: **Construir** (cierre incremental, no apertura de nueva tarea)

## Principios no negociables

1. **Solo archivos ya modificados** en el cambio actual. NUNCA archivos que el ciclo no tocó (regla SBR-003 de `.claude/docs/stabilization-bug-rules.md`).
2. **Mejoras de bajo riesgo**: no cambian comportamiento, no cambian signatures públicas, no rompen tests existentes.
3. **Cada mejora trazable** a una regla de `.claude/docs/clean-code-solid.md` (SOLID, KISS, YAGNI, Boy Scout) o a un estándar declarado en el `CLAUDE.md` del proyecto consumidor.
4. **Una mejora = pocas líneas**. Si una mejora toca más de 5 líneas o cruza una capa arquitectónica → ya no es Boy Scout, es refactor y se escala a `asdd-tech-lead-refactoring-plan` + `asdd-developer-safe-refactor`.
5. **Baseline verde antes y después**. Si el baseline está rojo → STOP (regla "tests fallando" de `asdd-system-integrity.md`).

## Mejoras permitidas (catálogo agnóstico de stack)

> Aplicar solo si la regla es coherente con los estándares del proyecto consumidor. Si el `CLAUDE.md` del proyecto define otra convención, gana la del proyecto.

| Categoría | Mejora | Justificación |
|---|---|---|
| Imports | Eliminar imports no usados, ordenar por grupos, eliminar wildcards | Clean Code — legibilidad |
| Magic values | Reemplazar literales repetidos por constantes nombradas | `.claude/docs/clean-code-solid.md` — sin magic numbers/strings |
| Logging | Mensajes en inglés, parametrizados, con contexto suficiente | `.claude/docs/clean-code-solid.md` — logs en inglés |
| Naming | Renombrar variables o métodos privados con nombres descriptivos | Clean Code — mínimo 3 caracteres, descriptivos |
| Guard clauses | Convertir `if/else` profundos en early returns | `.claude/docs/clean-code-solid.md` — nesting máximo 2 niveles |
| Dead code | Eliminar código comentado, variables sin uso, ramas inalcanzables | Clean Code — sin dead code |
| Catch vacíos | Reemplazar `catch` silencioso por log + manejo explícito | Clean Code — sin efectos secundarios ocultos |
| Method references | Sustituir lambdas triviales por referencias a método cuando el lenguaje lo permita | Legibilidad |
| Tipos débiles | Reemplazar tipos genéricos demasiado laxos por tipos específicos | Robustez |
| Accesibilidad | Agregar atributos de accesibilidad faltantes en componentes UI ya tocados | Estándares de accesibilidad del proyecto |
| Tokens de diseño | Reemplazar valores hardcodeados (colores, espaciados) por tokens del sistema de diseño | Consistencia visual |
| Anotaciones de docs | Agregar anotaciones de schema/contract faltantes en DTOs ya tocados | Documentación de contratos |
| Tests | Mejorar nombres descriptivos y comentarios AAA en tests del archivo modificado | ISTQB — legibilidad de pruebas |
| Mensajes al usuario | Corregir ortografía en español (tildes, signos dobles) si aparece texto visible | `asdd-spanish-orthography.md` |

## Prohibido (alto riesgo — escalar)

- Cambiar signatures de funciones, métodos o componentes públicos → es breaking change, requiere ADR
- Mover archivos o reorganizar estructura de carpetas → es refactor estructural (`asdd-developer-safe-refactor`)
- Cambiar lógica de negocio o flujos → es feature o fix, no Boy Scout
- Tocar archivos no modificados en el cambio actual → viola SBR-003 (surgical changes)
- Refactorizar componentes grandes o clases enteras → escalar a `asdd-tech-lead-refactoring-plan`
- Cambiar estilos visuales o tokens del sistema de diseño globalmente → es trabajo de UI, no Boy Scout

## Proceso

### Paso 0: PRE-FLIGHT — Rama dedicada (BLOQUEANTE)

Aplicar el bloque PRE-FLIGHT estándar referenciado en `asdd-skill-preflight.md`:

```bash
# Verificar rama dedicada — NUNCA aplicar mejoras en ramas protegidas (GS-001)
protected="${ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO: estás en '$branch'. Crear rama dedicada antes de aplicar mejoras."
    exit 1
  fi
done
echo "Rama OK: $branch"
```

Si falla → STOP. Ver GS-001 en `asdd-git-safety.md`.

### Paso 1: Baseline verde (BLOQUEANTE)

Resolver el comando de tests desde `.asdd/testing-capabilities.yaml` (referenciado por ORC-009 en `asdd-orchestration-tdd.md`). Si el archivo no existe, usar el comando declarado en el `CLAUDE.md` del proyecto consumidor.

```bash
# 1. Compilación limpia del scope tocado
{compile_command} 2>&1 | tail -10

# 2. Tests del módulo modificado
{test_command} {scope_modulo} 2>&1 | tail -20
```

**Decisión:**
- Baseline verde → continuar al Paso 2
- Baseline rojo → STOP. Reportar al usuario. NO aplicar mejoras sobre baseline roto — contamina el diagnóstico y oculta regresiones (regla "tests fallando" de `asdd-system-integrity.md`).

### Paso 2: Listar archivos del cambio actual

```bash
git diff --name-only HEAD
```

El conjunto resultante es el **scope cerrado**. Cualquier mejora fuera de este conjunto está prohibida (SBR-003).

Publicar Scope Declaration en el chat:

```
Scope Declaration (Boy Scout):
- src/path/FileA.{ext} — N mejoras candidatas
- src/path/FileB.{ext} — N mejoras candidatas
- [ningún otro archivo]
```

### Paso 3: Aplicar mejoras una a una con verificación

Para CADA archivo del scope y CADA mejora candidata del catálogo:

1. **Aplicar la mejora** — un solo `Edit` por mejora, pocas líneas (≤ 5)
2. **Compilar inmediatamente** — `{compile_command}`
3. Si no compila → `git checkout <archivo>` y descartar esa mejora; documentar como "no aplicable"
4. Si compila → correr tests del módulo: `{test_command} {scope_modulo}`
5. Si los tests fallan → `git checkout <archivo>` y descartar la mejora. **NO ajustar el test** — el test rojo demuestra que la "mejora" cambió comportamiento, por lo tanto no era Boy Scout
6. Si los tests pasan → marcar la mejora como aplicada y continuar con la siguiente

**Circuit-breaker (AL-006 de `asdd-anti-loops.md`):** si el mismo tipo de mejora falla 2 veces en archivos distintos → STOP. Analizar causa raíz antes de seguir. No reintentar el mismo enfoque en silencio.

**Límite de turnos:** este skill aplica mejoras pequeñas. Si tras 10-12 mejoras aplicadas la sesión sigue creciendo → cerrar el lote, reportar y dejar el resto para una invocación posterior. No saturar el contexto (secciones "Presupuesto de Turnos por Agente" y "Compactación Proactiva" en `.claude/references/rules/asdd-anti-loops.md`).

### Paso 4: Verificación expandida

Tras aplicar todas las mejoras candidatas:

```bash
# 1. Tests completos del módulo
{test_command} {modulo_completo} 2>&1 | tail -20

# 2. Scope Verification — confirmar que SOLO se tocó lo declarado (SBR-003)
git diff --name-only HEAD
```

Si aparecen archivos fuera del Scope Declaration original → justificar o revertir cada uno.

### Paso 5: Reporte

```markdown
## Continuous Improver Report — {ciclo / PR / HU}

### Scope
- Archivos modificados originalmente: {N}
- Archivos con mejoras aplicadas: {N}

### Mejoras aplicadas
| Archivo | Categoría | Líneas | Verificación |
|---|---|---|---|
| src/.../FileA.{ext} | Magic values → constantes | 3 | ✅ tests verdes |
| src/.../FileA.{ext} | Guard clause | 5 | ✅ tests verdes |
| src/.../FileB.{ext} | Imports ordenados | 4 | ✅ tests verdes |

### Mejoras descartadas (revertidas)
| Archivo | Categoría | Motivo del revert |
|---|---|---|
| src/.../FileC.{ext} | Rename privado | Test rojo — cambio de comportamiento detectado |

### Verificación final
| Check | Estado |
|---|---|
| Baseline verde antes (Paso 1) | ✅ |
| Tests del módulo verdes después | ✅ |
| Scope Verification limpio | ✅ |
| Cero cambios fuera del scope original | ✅ |

### Resultado: ✅ MEJORAS APLICADAS — ZERO REGRESSIONS
```

## Outputs

- Archivos del scope mejorados sin cambio de comportamiento observable
- Tests del módulo verdes (igual o más estables que el baseline)
- Reporte breve en el chat con el resumen del Paso 5; opcionalmente persistir en `docs/tech/boy-scout-{feature}-{YYYY-MM-DD}.md` si el equipo lo requiere para trazabilidad

## Relación con skills y reglas existentes

- **`asdd-developer-safe-refactor`** (skill hermana — diferenciación clave): `safe-refactor` es **refactor dirigido y planificado**, ejecuta un plan aprobado del Tech Lead con pasos atómicos y métricas de mejora (CC, SOLID, duplicación). `continuous-improver` es **mejora oportunista acotada a archivos ya tocados** en el cambio en curso (Boy Scout), sin ampliar scope ni requerir plan previo. Si una mejora candidata excede 5 líneas o cruza capas → escalar a `safe-refactor`.
- **`asdd-tech-lead-refactoring-plan`** (skill hermana): planifica refactorings de mayor alcance. Cuando este skill detecta deuda fuera del scope del ciclo, abre un ítem en ese plan en lugar de tocarla.
- **`asdd-developer-feature` / `asdd-developer-bug-fix`**: skills hermanas que producen el cambio principal. `continuous-improver` se invoca DESPUÉS, sobre los archivos que esos skills modificaron.
- **`asdd-developer-unit-test` / `asdd-developer-integration-test`**: si el baseline del Paso 1 muestra que el archivo no tiene tests, este skill NO procede — se invoca primero a uno de esos para crear red de seguridad.
- **`asdd-tech-lead-code-review`**: valida que las mejoras aplicadas cumplen los estándares del proyecto antes del merge.
- **`.claude/docs/clean-code-solid.md`**: catálogo de reglas (SOLID, KISS, YAGNI, Boy Scout, nesting, magic values, dead code) que justifican cada mejora candidata.
- **SBR-002 y SBR-003** (`.claude/docs/stabilization-bug-rules.md`): Simplicity First y Surgical Changes — mínimo código, solo archivos declarados, Scope Verification obligatorio al cierre.
- **AL-006** y secciones "Presupuesto de Turnos por Agente" + "Compactación Proactiva" (`.claude/references/rules/asdd-anti-loops.md`): dos fallos del mismo tipo de mejora → STOP y análisis; lanzar mejoras en lotes pequeños para no saturar contexto.
- **`asdd-system-integrity.md`**: tests verdes antes y después; nunca operar sobre baseline rojo.
- **`asdd-spanish-orthography.md`**: si una mejora toca texto visible al usuario, debe respetar tildes y signos dobles.
- **GS-001** (`asdd-git-safety.md`): nunca aplicar mejoras directamente en ramas protegidas.
- **ORC-009** (`asdd-orchestration-tdd.md`): el comando de tests proviene de `.asdd/testing-capabilities.yaml`.

## Cuándo NO invocar

- No hay archivos modificados en el ciclo actual (`git diff --name-only HEAD` está vacío) — sin scope no hay Boy Scout.
- Las mejoras detectadas exceden 5 líneas o cruzan capas arquitectónicas — usar `asdd-tech-lead-refactoring-plan` + `asdd-developer-safe-refactor`.
- El cambio principal aún no está terminado o tiene tests rojos — primero cerrar la implementación (`asdd-developer-feature`/`bug-fix`) y dejar baseline verde.
- El archivo no tiene tests que cubran las líneas a mejorar — crear red de seguridad antes (`asdd-developer-unit-test`).
- Se quiere mejorar archivos heredados que el ciclo NO tocó — eso es deuda técnica del backlog, no Boy Scout: registrar en `docs/tech/refactoring-plan-{area}.md`.
- El stack o las convenciones del proyecto contradicen el catálogo de mejoras — respetar el `CLAUDE.md` del proyecto consumidor; este skill es agnóstico, no impone reglas sobre las del equipo.

## Anti-patterns

- **Scope creep silencioso** — empezar mejorando un archivo del cambio y "de paso" tocar uno vecino que no estaba en el diff original. Viola SBR-003 y rompe la trazabilidad del PR.
- **Renombrar símbolos públicos como "mejora"** — un rename cambia signatures y rompe consumers no testeados. Siempre escalar a `asdd-developer-safe-refactor` con Dependent Module Testing.
- **Ajustar el test para que la mejora pase** — si el test rojo aparece tras la mejora, el comportamiento cambió → revertir la mejora, NUNCA el test. El test rojo es la evidencia de que la mejora no era Boy Scout.
- **Acumular muchas mejoras sin verificar entre cada una** — perder trazabilidad de qué cambio rompió qué test. Una mejora = un `Edit` + compilar + tests + decisión.
- **"Mejorar" estilo visual sin coordinar con UI** — colores, espaciados o tokens del sistema de diseño no son Boy Scout, son decisiones del equipo de diseño (skills de `asdd-ui`).
- **Mezclar Boy Scout con el commit principal del feature/fix** — el reviewer no distingue qué cambio es funcional y qué es cosmético. Mejor commits separados o, al menos, mensaje de commit que liste explícitamente las mejoras aplicadas.
- **Aplicar mejoras sobre baseline rojo "porque el test ya fallaba"** — viola la regla de `asdd-system-integrity.md`: tests rojos siempre se arreglan antes; no se acepta como "preexistente".
