---
name: sofka-asdd-developer-safe-refactor
description: Refactoring paso a paso con tests verdes antes y después. Cambio atómico verificado, revert ante 2 quiebres.
---

# Safe Refactor — Mejora de código sin riesgo

> **Principio:** todo refactor debe dejar el sistema con la MISMA funcionalidad y MEJOR calidad. Nunca al revés. Si cambia el comportamiento observable, no es refactor — es feature o fix.

## Rol

Ejecutor disciplinado de refactoring. Aplica un plan ya aprobado mediante pasos atómicos, cada uno con verificación de compilación y tests. Revierte ante el primer quiebre y detiene la sesión a los dos intentos fallidos consecutivos (AL-007).

## Cuándo activar

- Existe un plan en `docs/tech/refactoring-plan-{area}.md` producido por `sofka-asdd-tech-lead-refactoring-plan`
- Hay deuda técnica identificada (alta complejidad ciclomática, violaciones SOLID, duplicación) lista para corregirse
- Antes de agregar una feature en una zona degradada — abrir espacio limpio primero
- Reemplazo de un anti-patrón detectado en code review (`sofka-asdd-tech-lead-code-review`)
- Fase ASDD: **Construir**

## Tipos de refactor soportados

| Tipo | Descripción | Riesgo | Verificación mínima |
|---|---|---|---|
| **Extract function** | Extraer lógica a función privada con nombre descriptivo | Bajo | Compilación + tests del módulo |
| **Extract interface / port** | Crear puerto para desacoplar (DIP) | Medio | Compilación + tests + verificar consumidores |
| **Rename** | Renombrar símbolo en todo el codebase | Medio | Compilación + grep de strings y configs |
| **Move** | Mover archivo o símbolo a otro paquete/módulo | Alto | Compilación + tests + verificación de boundaries |
| **Simplify chain** | Reducir complejidad de cadena (CC > 10) | Alto | Tests completos del módulo |
| **Replace anti-pattern** | Sustituir patrón incorrecto por el correcto | Alto | Tests completos + revisar consumidores |
| **Extract component** | Dividir componente monolítico en piezas más pequeñas | Medio | Compilación + tests + verificación visual si aplica |
| **Extract hook / helper** | Separar lógica reutilizable de un componente o servicio | Medio | Compilación + tests del consumidor |

## Proceso — 5 fases

### Paso 0: PRE-FLIGHT — Rama dedicada (BLOQUEANTE)

Aplicar el bloque PRE-FLIGHT estándar referenciado en `sofka-asdd-skill-preflight.md`:

```bash
# Verificar rama dedicada — NUNCA refactorizar en ramas protegidas (GS-001)
protected="${SOFKA_ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO: estás en '$branch'. Crear rama dedicada antes de refactorizar."
    echo "Sugerencia: git checkout -b refactor/<descripcion>"
    exit 1
  fi
done
echo "Rama OK: $branch"
```

Si el PRE-FLIGHT falla → STOP. Ver GS-001 en `sofka-asdd-git-safety.md`.

### Fase 1: Establecer baseline de tests (ANTES de tocar código)

> **REGLA CRÍTICA:** nunca refactorizar código sin tests que lo cubran. Si no hay red de seguridad → escribirla primero invocando `sofka-asdd-developer-unit-test` o `sofka-asdd-developer-integration-test`.

Resolver el comando de tests desde `.sofka-asdd/testing-capabilities.yaml` (referenciado por ORC-009). Si el archivo no existe, usar el comando declarado en el `CLAUDE.md` del proyecto consumidor.

```bash
# Ejecutar la suite del módulo o archivo a refactorizar
{test_command} {scope_del_modulo} 2>&1 | tail -30
```

**Criterio para proceder:**
- Tests existen y pasan → continuar a Fase 2
- Tests no existen → STOP. Crear red de seguridad antes (`sofka-asdd-developer-unit-test`)
- Tests existen pero fallan → STOP. Arreglar primero (regla "tests fallando — NO aceptar como preexistente" en `sofka-asdd-system-integrity.md`)

Capturar coverage actual como baseline antes del primer cambio — sirve para verificar al cierre que el refactor no eliminó cobertura.

### Fase 2: Scope Declaration y análisis del refactor

Publicar en el chat el scope acotado antes de editar (regla SBR-003 de `.claude/docs/stabilization-bug-rules.md`):

```
Scope Declaration:
- src/path/FileA.{ext} — {razón directa}
- src/path/FileA_test.{ext} — verificación
- [ningún otro archivo]
```

Documentar el plan del refactor:

```markdown
## Refactor Plan

### Target
- **Archivo(s):** {paths}
- **Tipo:** {Extract function / Replace anti-pattern / ...}
- **Motivación:** {issue del code review / violación SOLID / CC > 10 / duplicación}

### Estado actual
- **Tests baseline:** {N tests, todos verdes}
- **Métrica objetivo:** CC actual {valor} → target ≤ 10
- **Consumidores:** {grep de quién usa el símbolo}

### Pasos planificados
1. {paso concreto}
2. {paso concreto}
3. {paso concreto}

### Riesgos
- {qué podría romperse}
- {módulos consumidores afectados}
```

### Fase 3: Refactorizar en pasos atómicos

> **REGLA:** un paso = un cambio pequeño + verificación. Nunca acumular cambios sin verificar entre cada uno.

Para CADA paso del plan:

1. **Aplicar el cambio** — un solo `Edit`/`Write` por paso
2. **Compilar inmediatamente** — usar el comando del proyecto (`tsc --noEmit`, `compile`, `build`, según `testing-capabilities.yaml`)
3. **Si no compila → revertir con `git checkout <archivo>` y replanificar el paso**
4. **Si compila → correr los tests del baseline**: `{test_command} {scope}`
5. **Si los tests fallan → el refactor cambió comportamiento. Revertir con `git checkout <archivo>` y analizar.** No "ajustar el test para que pase"
6. **Si los tests pasan → marcar el paso como completado y continuar**

**Circuit-breaker (AL-007 de `sofka-asdd-anti-loops.md`):** si dos intentos consecutivos rompen los tests con el mismo enfoque → `git checkout` total del archivo, STOP, reportar al usuario y escalar a `sofka-asdd-tech-lead-refactoring-plan` para replanificar.

### Fase 4: Verificación expandida

Tras completar todos los pasos:

```bash
# 1. Tests del módulo completo (no solo del archivo refactorizado)
{test_command} {modulo_completo} 2>&1 | tail -30

# 2. Verificar consumidores (Dependent Module Testing — sofka-asdd-system-integrity.md)
rg "{simbolo_modificado}" src/ -l
# Correr los tests de cada módulo consumidor

# 3. Si el refactor tocó contratos públicos o APIs → verificar boundaries del proyecto
```

**Coverage gate (BLOQUEANTE):** ejecutar coverage del módulo y comparar contra el baseline de Fase 1. Si bajó → el refactor eliminó cobertura → añadir tests para las líneas descubiertas antes de declarar done. Umbrales exactos en el `CLAUDE.md` del proyecto consumidor.

**Scope Verification:** confirmar que solo se tocó lo declarado:

```bash
git diff --name-only HEAD
```

Archivos fuera del Scope Declaration → justificar o `git checkout` (regla SBR-003).

### Fase 5: Reporte de mejora

```markdown
## Safe Refactor Report

### Target
- **Archivo(s):** {paths}
- **Tipo:** {tipo de refactor}
- **Plan ejecutado:** {referencia a docs/tech/refactoring-plan-{area}.md}

### Métricas de mejora
| Métrica | Antes | Después | Mejora |
|---|---|---|---|
| Complejidad ciclomática | {N} | {N} | -{%} |
| Líneas (función/clase) | {N} | {N} | -{%} |
| Violaciones SOLID detectadas | {N} | {N} | ✅ / ⚠ |
| Issues de calidad reportados | {N} | {N} | ✅ / ⚠ |

### Verificación
| Check | Estado |
|---|---|
| Baseline tests verdes (Fase 1) | ✅ |
| Tests del módulo completo verdes | ✅ |
| Tests de consumidores verdes | ✅ / N/A |
| Coverage no bajó respecto al baseline | ✅ |
| Scope Verification limpio | ✅ |

### Pasos ejecutados: {N} (todos verificados individualmente)

### Resultado: ✅ REFACTOR COMPLETE — ZERO REGRESSIONS
```

## Catálogo de refactorings seguros

### 1. Reducir complejidad ciclomática (CC > 10)

Extraer bloques condicionales a funciones privadas con nombres que revelen intención. El switch/case por tipo suele aplanar la complejidad sin cambiar comportamiento.

### 2. Corregir violación SRP (clase con múltiples responsabilidades)

Separar cada responsabilidad en su propia clase o servicio. Una clase grande de N métodos pasa a ser N clases con un foco claro.

### 3. Corregir violación DIP (dominio dependiendo de infraestructura)

Crear un puerto en la capa de dominio e implementar en la capa de infraestructura. El dominio queda libre de detalles técnicos.

### 4. Reemplazar anti-patrón en cadena de operaciones

Sustituir cada anti-patrón por su forma correcta como paso atómico, con verificación de tests entre cada sustitución.

### 5. Consolidar duplicación (DRY)

Solo si el patrón aparece 3+ veces. Extraer a helper compartido en el módulo correspondiente — `shared/` si es cross-módulo, mismo módulo si es interno.

### 6. Extraer componente o subcomponentes

Dividir un componente monolítico en piezas más pequeñas con responsabilidad única. Cada extracción = 1 paso + verificación.

### 7. Extraer hook / helper

Separar lógica de presentación de lógica de negocio. La pieza extraída debe poder testearse independientemente del consumidor.

## Reglas absolutas

1. **Nunca refactorizar sin tests baseline** — si no hay red, crearla primero.
2. **Un paso = un cambio + verificación** — sin excepciones.
3. **Si un paso rompe tests → revertir** — nunca "ajustar el test para que pase".
4. **Medir mejora con métricas reales** — el refactor debe mejorar ALGO medible (CC, líneas, violaciones, duplicación).
5. **No cambiar comportamiento observable** — mismos inputs → mismos outputs. Si necesitas cambiar comportamiento, eso es feature o fix (`sofka-asdd-developer-feature` / `sofka-asdd-developer-bug-fix`).
6. **Máximo 2 ciclos de corrección por paso** — AL-007: dos quiebres consecutivos = revert total + escalar a `sofka-asdd-tech-lead-refactoring-plan`.
7. **Boy Scout Rule sin scope creep** — mejorar lo encontrado dentro del Scope Declaration. Oportunidades fuera del scope se escalan como nuevo ítem al plan, no se mezclan.

## Outputs

- Código mejorado con el comportamiento intacto
- `docs/tech/safe-refactor-report-{area}-{YYYY-MM-DD}.md` con el reporte de Fase 5
- Tests verdes en el módulo completo y en los consumidores detectados
- Coverage igual o superior al baseline

## Relación con skills y reglas existentes

- **`sofka-asdd-tech-lead-refactoring-plan`** (skill hermana): PLANIFICA el refactor — identifica deuda, prioriza por impacto/esfuerzo, produce `docs/tech/refactoring-plan-{area}.md`. **`sofka-asdd-developer-safe-refactor` EJECUTA ese plan** paso a paso con tests verdes y revert disciplinado.
- **`sofka-asdd-developer-refactoring-execute`**: skill hermana del mismo agente, alcance más amplio (aplica un plan completo). `safe-refactor` se especializa en el ciclo de verificación atómica (baseline → cambio → compilación → tests → siguiente) y en el circuit-breaker AL-007.
- **`sofka-asdd-developer-unit-test` / `sofka-asdd-developer-integration-test`**: crean la red de seguridad cuando la Fase 1 detecta que no hay tests.
- **`sofka-asdd-tech-lead-code-review`**: valida el refactor producido antes de mergear.
- **AL-007** (`sofka-asdd-anti-loops.md`): dos quiebres consecutivos del mismo refactor → revert total y escalar. No se reintenta en silencio.
- **SBR-003** (`.claude/docs/stabilization-bug-rules.md`): Scope Declaration y Scope Verification obligatorios — solo se tocan los archivos declarados.
- **`sofka-asdd-system-integrity.md`**: tests verdes antes y después; Dependent Module Testing obligatorio cuando cambia una interfaz o símbolo público.
- **`.claude/docs/clean-code-solid.md`**: Boy Scout Rule, SOLID, complejidad y nesting son los criterios de mejora que justifican un refactor.
- **GS-001** (`sofka-asdd-git-safety.md`): jamás refactorizar en ramas protegidas.
- **ORC-009** (`sofka-asdd-orchestration-tdd.md`): el comando de tests proviene de `.sofka-asdd/testing-capabilities.yaml`.

## Cuándo NO invocar

- No existe plan aprobado del Tech Lead — invocar primero `sofka-asdd-tech-lead-refactoring-plan`.
- El código a refactorizar no tiene tests — escribir red de seguridad primero con `sofka-asdd-developer-unit-test`.
- El cambio agrega funcionalidad o corrige un bug — usar `sofka-asdd-developer-feature` o `sofka-asdd-developer-bug-fix`. Refactor NO cambia comportamiento.
- El refactor cruza límites arquitectónicos no contemplados en ADRs vigentes — escalar a `sofka-asdd-solution-architect` antes de tocar código.

## Anti-patterns

- **Refactor + feature en el mismo commit** — si los tests fallan, no se distingue qué cambio fue la causa. Separar siempre.
- **Cambios grandes sin commits intermedios** — una sesión de 4 horas con un solo commit final es imposible de revertir parcialmente. Commits pequeños con tests verdes después de cada paso.
- **Renombrar masivamente sin verificar referencias en strings y configs** — el IDE renombra código pero no strings hardcodeados, YAML, SQL ni configs. `grep` del nombre completo antes y después.
- **Optimizar sin medición previa** — "este bucle es lento" sin profiler. Refactor por estética sin métricas no justifica el riesgo de regresión.
- **Ajustar el test para que pase tras un cambio** — si el test rojo era correcto, el refactor cambió comportamiento → revertir. Nunca lo contrario.
- **Ignorar consumidores del símbolo modificado** — un Rename "limpio" puede romper consumers en otros módulos. Dependent Module Testing obligatorio (`sofka-asdd-system-integrity.md`).
