---
name: sofka-asdd-unit-test-design
description: Diseña casos unitarios con técnicas ISTQB y mutación lógica. Produce Test Coverage Declaration y skeleton AAA.
---

# Unit Test Design — Diseño Sistemático de Casos (ISTQB + mutación lógica)

> Escribir tests ad-hoc produce cobertura de líneas pero no de comportamiento. Los defectos viven en los bordes y combinaciones que nadie pensó probar. Este skill aplica técnicas formales para enumerar esos casos **antes** de que se escriba el código de test, y declara explícitamente qué mutaciones lógicas debe matar la suite resultante.

## Rol

Diseñador de casos de prueba unitarios. Clasifica la lógica bajo prueba, selecciona la técnica ISTQB correcta, enumera bordes y esquinas, produce la Test Coverage Declaration obligatoria del protocolo de developer-test y entrega skeletons AAA listos para que `sofka-asdd-developer-unit-test` los implemente en RED→GREEN.

## Cuándo activar

Señales:

- Antes de crear o ampliar la suite unitaria de una clase, función pura, hook, componente o servicio de dominio
- Spec con acceptance criteria definidos y reglas de negocio testables — CASO A del protocolo (`.claude/docs/developer-test-protocol.md`)
- Bug puntual / hotfix sin spec — CASO B del protocolo (derivación obligatoria con PE/AVF/error states)
- El feature requiere alta fortaleza de tests (capa de dominio, reglas críticas) y se quiere validar la suite contra mutación lógica antes de implementar

Fase ASDD: **Construir** (`WF-004` en `sofka-asdd-workflow-build.md`), bloque previo a `sofka-asdd-developer-unit-test`. También admisible en **Diseñar** (`WF-003`) cuando el spec define reglas de negocio numéricas o de transición de estado y conviene anticipar la matriz de casos.

PRE-FLIGHT: ligero. Este skill **no crea código fuente** — solo documentación de diseño en `docs/testing/` y skeletons indicativos. No se aplica el bloque completo de `sofka-asdd-skill-preflight.md`; el PRE-FLIGHT obligatorio lo ejecuta el implementador en `sofka-asdd-developer-unit-test`.

## Proceso

### Fase 1 — Clasificar la lógica bajo prueba

Leer el código o el spec del elemento bajo diseño e identificar su tipo. La tabla determina la técnica primaria; el resto son complementos.

| Tipo de lógica | Técnica primaria | Complemento |
|---|---|---|
| Validador con formato (identificadores, email, teléfono) | PE | AVF en longitud |
| Rango numérico (porcentaje, monto, edad) | AVF | PE para clases inválidas |
| Condicional múltiple (2+ predicados booleanos) | Tabla de Decisión | PE por clase |
| Entidad con ciclo de vida (status machine) | Transición de Estado | PE para eventos inválidos |
| Transformador / mapper de datos | PE en cada campo | Edge cases por tipo |
| Componente UI con datos remotos | 4 estados (loading / success / error / empty) | PE para variantes |
| Servicio de orquestación / caso de uso | Happy path + bloque de errores externos | AVF en timeouts / reintentos |
| Hook / componente de formulario | AVF en campos con límites | PE para validadores |

Publicar la clasificación en el chat antes de continuar:

```
Clasificación de [nombre]:
- Tipo: [tipo identificado]
- Inputs: [lista de parámetros / props / campos]
- Outputs: [return type / efectos observables / estado renderizado]
- Invariantes: [condiciones que deben mantenerse siempre]
- Técnicas seleccionadas: [PE | AVF | TD | TE | combinación] — justificación
```

### Fase 2 — Aplicar técnicas ISTQB

Las técnicas se aplican según el contrato resumido en `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` (principios 1, 4, 6) y el catálogo profundo de `sofka-asdd-atf-api-step-3-istqb-test-techniques`. Aquí se aplican a la unidad de código, no al endpoint.

**PE — Partición de Equivalencia.** Para cada input identificable:

1. Clases válidas: valores representativos que el dominio acepta (cada enum es su propia clase).
2. Clases inválidas: `null`, `undefined`, tipo incorrecto, valor fuera del dominio, valor del dominio rechazado por regla de negocio.
3. Mínimo 1 caso por clase. No repetir representantes del mismo grupo.

**AVF — Análisis de Valores Frontera.** Para cada restricción `[a, b]` (numérica, longitud, fecha):

| Valor | Clase | Resultado esperado |
|---|---|---|
| `a - 1` | fuera (menor) | rechazo |
| `a` | frontera mínima | aceptación |
| `a + 1` | dentro mínimo | aceptación |
| `b - 1` | dentro máximo | aceptación |
| `b` | frontera máxima | aceptación |
| `b + 1` | fuera (mayor) | rechazo |

Casos especiales siempre obligatorios cuando aplica el tipo: `0`, `1`, `-1`, valor máximo del tipo, string vacío `""`, string solo whitespace `" "`, string con 1 carácter, string con `max + 1` caracteres.

**TD — Tabla de Decisión.** Cuando la lógica tiene 2 o más condiciones que interactúan:

1. Listar condiciones booleanas `C1, C2, …, Cn`.
2. Generar `2^n` combinaciones.
3. Marcar combinaciones imposibles (eliminar columnas).
4. Para cada columna superviviente: determinar la acción esperada.
5. Combinar columnas con igual resultado (don't care).
6. Una prueba por columna final.

**TE — Transición de Estado.** Para entidades con ciclo de vida:

1. Enumerar estados: `[INITIAL, …, FINAL]`.
2. Por cada transición válida `(estado origen + evento) → estado destino`: 1 caso.
3. Por cada transición inválida: 1 caso que espera excepción o rechazo.
4. Caso especial: transición desde estado final.

### Fase 3 — Sweep de bordes (obligatorio para toda lógica)

Sin importar la técnica primaria, recorrer este barrido. La lista se publica en chat antes de los casos generados.

| Eje | Bordes obligatorios |
|---|---|
| Nulos / vacíos | `null`, `undefined`, `""`, `" "`, `[]`, `{}` |
| Numéricos | `0`, `-1`, máximo del tipo, mínimo del tipo, infinito / NaN si aplica |
| Strings | 1 carácter, longitud exacta del límite, límite + 1, caracteres especiales (acentos, no-ASCII, intentos de inyección literales como `"'; DROP TABLE--"`, `"<script>"`), solo números en campo de texto |
| Colecciones | vacía, 1 elemento, 2 elementos (cuando hay lógica de plural), tamaño máximo |
| Fechas | hoy, ayer, futuro lejano, fecha inválida (`31 de febrero`) |

### Fase 4 — Casos de esquina (corner cases)

Los corner cases son combinaciones peligrosas: dos o más inputs en su frontera al mismo tiempo. Patrón: tomar pares de bordes de la Fase 3 que interactúen lógicamente.

Ejemplos:

- Campo de texto `null` y campo numérico en su máximo.
- Colección vacía y usuario sin permisos.
- Fecha igual a hoy y estado `EXPIRED`.
- `amount = 0` y tipo `REQUIRED`.
- Dos campos string en su longitud máxima simultáneamente.

### Fase 5 — Error states obligatorios

Aplicable a todo endpoint, caso de uso, acción o efecto con dato remoto. Es el bloque que el protocolo `.claude/docs/developer-test-protocol.md` CASO B exige explícitamente.

| Estado | Backend (HTTP) | Frontend / cliente |
|---|---|---|
| Input inválido | 400 / 422 | validación de entrada |
| No autorizado | 401 / 403 | ruta protegida / rol incorrecto |
| No encontrado | 404 (si el recurso puede no existir) | estado `empty` |
| Conflicto | 409 (si hay unicidad) | — |
| Error externo | 500 / timeout | estado `error` |

### Fase 6 — Test Coverage Declaration (artefacto bloqueante)

Antes de entregar al implementador, producir el bloque exacto definido en `.claude/docs/developer-test-protocol.md`. Es el contrato que el implementador debe satisfacer; menos tests que los declarados al cerrar = bloqueante.

```
Test Coverage Declaration — [ClaseOMódulo]:
Origen: CASO A — Acceptance criteria IDs: AC-NNN..AC-MMM
      | CASO B — self-derived (no hay spec con criterios de aceptación)

Tests a implementar:
- [T01] [PE válido / AVF límite / TD columna / TE transición / error state / corner case] — [descripción]
- [T02] ...
- [T0N] ...
Total declarado: N tests
```

### Fase 7 — Skeleton AAA por caso

Para cada caso de la declaración, generar el esqueleto `Arrange → Act → Assert` con naming `should [VERB] when [CONDITION]`. El nombre debe leerse como un requisito funcional, no como una descripción del código.

```
describe('{NombreUnidad}', () => {
  describe('{método o comportamiento}', () => {
    it('should {comportamiento esperado} when {condición}', () => {
      // Arrange — input representativo de la clase / borde + mocks que reflejen el contrato real
      // Act — llamada a la unidad bajo prueba
      // Assert — verificación específica (no "verifica que funcione")
    });
  });
});
```

El framework concreto lo elige el implementador en función del `test_command` del proyecto, leído desde `.sofka-asdd/testing-capabilities.yaml` (`ORC-009`). Este skill produce skeletons indicativos, no código vinculado a un runner concreto.

### Fase 8 — Evaluación por mutación lógica (sin herramienta)

El objetivo de este bloque es estimar la fortaleza de la suite **antes** de implementarla, sin depender de ninguna herramienta de mutación específica. Es una revisión agnóstica de stack: ¿qué mutaciones lógicas, si se introdujeran al código de producción, deberían hacer fallar al menos un caso de la declaración?

Catálogo mínimo de mutaciones lógicas a considerar:

| Mutación | Original → Mutante | Caso que debe matarla |
|---|---|---|
| Frontera condicional | `x > 0` → `x >= 0` | AVF con `x = 0` |
| Frontera condicional inversa | `x < max` → `x <= max` | AVF con `x = max` |
| Negación condicional | `if (cond)` → `if (!cond)` | PE con un valor por rama |
| Reemplazo de operador relacional | `==` → `!=`, `<` → `>` | TD con combinaciones que dependen del operador |
| Reemplazo de operador aritmético | `+` → `-`, `*` → `/` | caso con resultado distinto bajo cada operador |
| Eliminación de invocación | quitar llamada a método con efecto | caso que verifica el efecto observable |
| Reemplazo de retorno | `return x` → `return null` / `return defaultValue` | caso que aserciona el valor exacto retornado |
| Cambio de estado destino | transición `A → B` → `A → C` | TE para esa transición específica |

Para cada mutación del catálogo aplicable al código bajo diseño, registrar:

```
| Mutación | Ubicación lógica | Caso que la mata |
|---|---|---|
| Frontera > → >= | regla de saldo mínimo | T07 (AVF con saldo = 0) |
| Negación de cond | gate de autorización | T03 (PE rol no permitido) |
```

Mutaciones sin caso asignado → gap. Agregar el caso faltante a la declaración antes de cerrar el diseño.

> Este bloque sustituye intencionalmente cualquier dependencia de una herramienta concreta. El template ASDD es stack-agnóstico; herramientas de mutación específicas se documentan en el `CLAUDE.md` del proyecto consumidor cuando estén disponibles.

## Outputs

| Artefacto | Ruta sugerida |
|---|---|
| Test design report con clasificación, técnicas, bordes, corner cases, error states y declaración | `docs/testing/unit-test-design-{feature}-{NNN}.md` |
| Test Coverage Declaration extraída (bloque autoejecutable) | dentro del mismo reporte, sección dedicada |
| Tabla de mutaciones lógicas vs casos | sección dedicada del reporte |
| Skeletons AAA por caso | sección dedicada del reporte, agnóstica de runner |

El sufijo `-NNN` sigue la convención de artefactos del template (`naming-convention.md §3.7`).

## Relación con skills y reglas existentes

- `sofka-asdd-developer-unit-test` **implementa** los tests del diseño. Este skill **diseña** los casos antes. Sin diseño, el implementador deriva ad-hoc; con diseño, implementa contra una Test Coverage Declaration explícita.
- `.claude/docs/developer-test-protocol.md` define el contrato de la Test Coverage Declaration (CASOS A y B, PE/AVF, error states obligatorios). Este skill produce el artefacto exacto que el protocolo exige.
- `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` aporta los principios (presencia ≠ ausencia, pesticida, shift-left) que justifican por qué diseñar antes que escribir tests.
- `sofka-asdd-atf-api-step-3-istqb-test-techniques` aplica las mismas técnicas a endpoints HTTP en el pipeline ATF API. Este skill las aplica al nivel de unidad de código.
- `sofka-asdd-atf-api-step-4-test-case-designer` genera CPs ejecutables contra contrato OpenAPI. Este skill genera casos unitarios contra contrato de la unidad de código.
- `sofka-asdd-system-integrity.md` exige que toda modificación pase los tests del módulo y de los consumidores. Este skill se ejecuta antes para garantizar que esos tests existen y son significativos.
- `ORC-009` (`sofka-asdd-orchestration-tdd.md`) decide si la sesión está en Strict TDD Mode; en ese modo el diseño es bloqueante: no se escribe código de producción sin la declaración previa.
- `WF-004` (`sofka-asdd-workflow-build.md`) ubica este skill en la fase Construir, antes de `sofka-asdd-developer-unit-test`.

## Cuándo NO invocar

- Ya existe una Test Coverage Declaration aprobada para la unidad — pasar directo a `sofka-asdd-developer-unit-test`.
- La unidad bajo prueba cruza múltiples colaboradores reales (DB, red, filesystem) — el diseño correcto es integration test; usar `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` con el skill `integration-test` según corresponda.
- El alcance es prueba de API REST contra contrato OpenAPI — usar `sofka-asdd-atf-api-step-4-test-case-designer` (pipeline ATF API), no este skill.
- El alcance es definir la suite end-to-end o flujos cross-módulo — no es unitario; escalar a `WF-005` con `sofka-asdd-atf-api-qa-engineer`.
- La unidad aún no existe ni hay spec — primero `sofka-asdd-producto` (skill `po`) genera AC, o `sofka-asdd-developer-feature` inicia el diseño.

## Anti-patterns

- **PE sin clases inválidas.** Cubrir solo "valores típicos" deja las branches de error sin test. Cada input requiere al menos una clase inválida explícita (`null`, tipo incorrecto, fuera de dominio).
- **AVF sin el caso fuera del límite.** Probar `min` y `max` sin `min - 1` ni `max + 1` no detecta off-by-one. La AVF es de 6 puntos, no de 2.
- **Tabla de decisión sin reducir.** Generar las `2^n` combinaciones brutas sin marcar imposibles produce tests redundantes que el implementador descarta arbitrariamente. Reducir antes de declarar.
- **Transición de estado sin transiciones inválidas.** Solo el camino feliz deja un set de defectos que solo aparecen en producción cuando un evento llega en orden no previsto.
- **Skeletons con assertions ambiguas.** `expect(result).toBeTruthy()` o `assert(result != null)` pasan con cualquier output. La assertion debe verificar el valor o efecto exacto declarado en el caso.
- **Test Coverage Declaration sin trazabilidad.** Cada caso debe mapear a un AC (CASO A) o a una técnica + borde (CASO B). Casos sin justificación se eliminan o se justifican.
- **Diseñar contra implementación, no contra contrato.** Leer el código de producción y derivar tests "que pasen" deja la suite acoplada a detalles internos. El diseño debe partir del comportamiento esperado (spec, AC, regla de negocio).
- **Mutaciones lógicas sin caso asignado.** Listar mutaciones en el reporte y dejar la columna "caso que la mata" vacía es un gap explícito. Cada mutación del catálogo aplicable necesita un caso, o se documenta por qué no aplica.
