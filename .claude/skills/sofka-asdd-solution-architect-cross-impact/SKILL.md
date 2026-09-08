---
name: sofka-asdd-solution-architect-cross-impact
description: Blast radius PRE-cambio — mapea consumidores y módulos impactados antes de tocar código. READ-ONLY.
---

# Cross-Impact (Blast Radius PRE-cambio)

> Modo **READ-ONLY**. Este skill solo analiza y reporta — no modifica archivos. Genera el mapa de impacto que alimenta la `Scope Declaration` (SBR-001/SBR-003) antes de que `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` empiece a editar.

## Rol

Analista de impacto cruzado. Dado un cambio propuesto sobre un símbolo, contrato o módulo compartido, identifica TODOS los consumidores (mismo repo y cross-repo) y los clasifica por severidad de impacto antes de la implementación.

## Cuándo activar

Señales típicas:

- Se va a modificar una interfaz, puerto de dominio, modelo o contrato de API.
- Se va a renombrar o mover un símbolo público (clase, función, tipo, enum).
- Cambio en el shape de un payload (request/response, evento, mensaje, schema de DB).
- Cambio de roles, permisos, status codes o reglas de validación compartidas.
- Antes de elaborar un ADR que reemplace o desactive un componente existente.
- El Impact Map exigido en `.claude/docs/stabilization-bug-rules.md` (SBR — "Impact Map") detecta consumidores en módulos distintos y la tarea escala a ruta FULL.

**Fase ASDD**: **Diseñar** (decisión informada sobre el alcance del cambio) y como pre-condición de **Construir** (alimenta la `Scope Declaration` antes de implementar).

## Proceso

### Paso 0 — PRE-FLIGHT

Este skill es READ-ONLY y no crea ni modifica archivos en el repo. Aplica el bloque de Scope Declaration de `sofka-asdd-skill-preflight.md` (sección "Skills de verificación"): publicar en chat la lista de símbolos/módulos a inspeccionar antes de empezar. **No** requiere rama dedicada.

### Paso 1 — Inventario de cambios propuestos

Listar explícitamente lo que va a modificarse:

- Símbolos públicos (clases, funciones, tipos, enums) que cambian firma o se renombran.
- Endpoints HTTP cuya URL, método, request body, response body o status code se modifica.
- Eventos o mensajes (asíncronos) cuyo payload o topic cambia.
- Modelos persistidos (entidades, tablas, colecciones) cuyo schema se altera.
- Reglas de autorización (roles, permisos, scopes) que cambian.

Si el cambio aún no está acotado a símbolos concretos → primero invocar `sofka-asdd-solution-architect-discovery` o `sofka-asdd-explorer` para acotar.

### Paso 2 — Búsqueda de consumidores (pattern-agnostic)

Para cada símbolo o contrato listado en el Paso 1, ejecutar la batería de búsquedas. Adaptar las extensiones y patrones al stack real del proyecto.

| Tipo de cambio | Patrón de búsqueda sugerido |
|---|---|
| Símbolo público (clase / función / tipo) | `rg "\bSymbolName\b" -l` |
| Implementadores de interfaz / contrato | `rg "implements InterfaceName\|extends BaseName" -l` |
| Endpoint HTTP | `rg "/path/del/endpoint" -l` (con variaciones de método y prefijos) |
| Tipo de evento / mensaje | `rg "EventName\|topic-name" -l` |
| Schema persistido | `rg "table_name\|collection_name\|EntityName" -l` |
| Roles / permisos | `rg "ROLE_NAME\|PermissionName" -l` |
| Constantes / enums compartidos | `rg "ENUM_VALUE\|EnumType\." -l` |

Reglas:

- Búsqueda exhaustiva pero acotada: si un grep no devuelve resultados → verificar el nombre exacto del símbolo antes de declararlo "sin consumidores" (AL-002, AL-003 prohíben re-ejecutar el mismo patrón sin variación).
- Si el proyecto tiene múltiples repos o módulos relacionados, repetir la búsqueda en cada uno; documentar el alcance del barrido.
- No leer archivos completos para confirmar uso: leer **solo las líneas de coincidencia** + 5 de contexto (regla de 3 capas Grep → Glob → Read).

### Paso 3 — Clasificación por severidad

Cada consumidor detectado se clasifica:

| Severidad | Criterio | Acción esperada |
|---|---|---|
| **Breaking** | El cambio rompe la compilación o el contrato (firma incompatible, campo removido, status code cambiado, rol revocado) | El consumidor debe modificarse en el mismo ciclo de cambio (GS-006). Si no se puede → **rediseñar** el cambio para mantener compatibilidad o coordinar despliegue. |
| **Behavioral** | Compila pero el comportamiento cambia (orden de campos, nullability, semántica de un valor, defaults) | El consumidor debe re-testearse. Documentar el cambio semántico en el ADR. |
| **Cosmetic / no-impact** | Cambio interno sin efecto observable (renombrado de variable local, refactor sin cambio de firma) | Sin acción para el consumidor, pero queda en el reporte para trazabilidad. |

### Paso 4 — Verificación de tests dependientes

Aplicar `sofka-asdd-system-integrity.md` ("Dependent Module Testing — OBLIGATORIO"):

- Por cada consumidor `Breaking` o `Behavioral`, identificar la suite de tests que lo cubre.
- Marcar en el reporte los tests que deben re-ejecutarse después del cambio (los específicos del consumidor, no la suite completa).
- Si un consumidor crítico no tiene cobertura → bandera adicional en el reporte (gap de cobertura previo al cambio).

### Paso 5 — Decisión de routing

Con el mapa completo, recomendar la ruta de implementación:

- **Mismo módulo + sin Breaking cross-módulo** → ruta LIGHT, el cambio puede seguir como `Tipo 2` o `Tipo 3` de `sofka-asdd-routing-heuristics.md`.
- **Cross-módulo o Breaking en consumidores** → escalar a ruta **FULL** desde fase Diseñar (ORC-001-B y contrato de escalamiento de `sofka-asdd-orchestration.md`). El reporte queda como insumo del ADR.
- **Rompe contrato externo** (API pública, evento publicado, schema de DB con datos vivos) → escalar a FULL con `sofka-asdd-solution-architect` como primario y coordinar con `sofka-asdd-producto` para gestión de versiones.

## Tabla de tipos de cambio y dependencias a buscar

| Cambio propuesto | Qué buscar (consumidores) | Riesgo principal |
|---|---|---|
| Renombrar / mover símbolo público | Importadores, referencias por nombre completo, reflexión por string | Compilación rota cross-módulo |
| Cambiar firma de método público | Llamadores con argumentos posicionales, mocks que reemplazan el método | Breaking en consumidores externos |
| Quitar campo de DTO / payload | Lectores del campo (mapeos, validaciones, UI bindings) | Errores silenciosos en runtime |
| Añadir campo obligatorio a DTO | Productores del payload (clientes, tests, fixtures, generadores) | Validaciones fallan en producción |
| Cambiar tipo de un campo | Casts, parsings, comparaciones por igualdad estricta | Errores de type / silent coercion |
| Cambiar status code o código de error | Manejadores de error en clientes, lógica de retry | Retries inadecuados, UX inconsistente |
| Cambiar URL / método de endpoint | Clientes HTTP que la consumen, configuraciones, gateways | 404 en clientes desplegados |
| Modificar payload de evento | Consumidores del topic, deserializadores, contratos schema-registry | Mensajes descartados o crash de consumer |
| Cambiar schema de persistencia | Migraciones pendientes, queries que usan los campos, índices, ORMs/repos | Pérdida de datos, downtime de migración |
| Cambiar rol / permiso requerido | Clientes que invocan con ese rol, configuración de auth, tests de autorización | Falla silenciosa de autorización |

La tabla es punto de partida. Adaptar las búsquedas a las convenciones del proyecto consumidor (sin asumir un stack específico).

## Outputs

- `docs/architecture/cross-impact-{cambio}.md` con el siguiente formato:

```markdown
# Cross-Impact — {nombre del cambio}

**Fecha**: {YYYY-MM-DD}
**Modo**: READ-ONLY
**Cambios analizados**: {lista del Paso 1}
**Alcance del barrido**: {módulos / repos inspeccionados}

## Resumen
- Total de consumidores detectados: N
- Breaking: N · Behavioral: N · Cosmetic: N
- Ruta recomendada: LIGHT / FULL
- Tests dependientes a re-ejecutar: N

## Detalle por consumidor

| # | Archivo:línea | Símbolo / Contrato | Severidad | Acción requerida | Test que lo cubre |
|---|---|---|---|---|---|
| 1 | `src/foo/Bar.ext:42` | `BarService` | Breaking | Actualizar llamada al método | `src/foo/Bar.test.ext` |
| 2 | … | … | … | … | … |

## Gaps de cobertura previos al cambio
- {Consumer sin test asociado — bandera al PR/ADR}

## Decisión de routing
- {Recomendación de LIGHT vs FULL con justificación}

## Riesgos abiertos
- {Cualquier consumidor que el barrido no pudo confirmar}
```

El reporte alimenta directamente la `Scope Declaration` (SBR-001/SBR-003), el ADR si lo hay y el plan de migración para consumidores externos.

## Relación con skills y reglas existentes

- **`.claude/docs/stabilization-bug-rules.md` — Impact Map (SBR-001 a SBR-004)**: el Impact Map del módulo de estabilización es **diff-driven** y reactivo (busca consumidores del símbolo a tocar *durante* un fix). Este skill amplía esa lógica a **análisis PRE-cambio**: corre antes de existir diff, para decidir si la modificación se hace y con qué alcance. La Scope Declaration que SBR-003 exige al implementador se alimenta del reporte de este skill cuando el cambio cruza módulos.
- **`sofka-asdd-system-integrity.md` — Dependent Module Testing**: la sección "Tests de módulos CONSUMIDORES" de `.claude/references/rules/sofka-asdd-system-integrity.md` exige re-ejecutar tests de consumers después del cambio. Este skill produce *de antemano* la lista exacta de consumers y sus tests, evitando que el implementador "descubra" los consumers tras compilar.
- **`.claude/docs/developer-test-protocol.md`**: el reporte de cross-impact lista los consumers cuya cobertura debe verificarse en la Test Coverage Declaration del developer.
- **`sofka-asdd-orchestration.md` — ORC-001-B / `sofka-asdd-orchestration-routing.md` — ORC-001-C**: este skill alimenta la decisión LIGHT vs FULL antes de delegar al developer. Si detecta Breaking cross-módulo → activa el contrato universal de escalamiento (ESCALAMIENTO REQUERIDO, motivo: `scope_mayor`).
- **`sofka-asdd-solution-architect-review`**: cuando hay un PR estructural, `review` puede pedir este skill como evidencia previa.
- **`sofka-asdd-solution-architect-api-contract`**: cuando el cambio toca un contrato API, los dos skills se complementan — `api-contract` define el contrato nuevo, `cross-impact` mapea quién lo consume.
- **`sofka-asdd-explorer`**: si el cambio aún no está acotado a símbolos concretos, `explorer` precede a este skill para localizar el área. `cross-impact` toma los símbolos identificados y mide su radio.
- **Anti-loops (AL-002, AL-003)**: no releer archivos ni re-ejecutar las mismas búsquedas; cada patrón se ejecuta una sola vez y se documenta el resultado.

## Cuándo NO invocar

- Cambio puramente interno a una función privada sin firma pública afectada — el riesgo cross-módulo es nulo.
- Bug fix de un typo en una constante local — usar fix directo (ruta LIGHT, Tipo 3).
- Validación POST-cambio del comportamiento funcional — eso es responsabilidad del flujo de QA en fase Verificar.
- Auditoría amplia de calidad del codebase — usar `sofka-asdd-tech-lead-refactoring-plan`.
- Cuando ya existe un Impact Map reciente del mismo símbolo y no hay cambios en consumidores — releer el reporte previo en lugar de regenerarlo.

## Anti-patterns

- **Confiar en el IDE como mapa de impacto** — el "Find usages" del IDE falla con reflexión, strings, configuraciones externas y consumidores cross-repo. Este skill busca explícitamente esos casos.
- **Declarar "sin impacto" con 0 resultados de un solo grep** — si la búsqueda no devuelve nada, validar el nombre exacto del símbolo y probar variantes antes de cerrar el análisis.
- **Saltar el barrido por "evidente"** — los símbolos "obvios" suelen tener consumidores en módulos que el implementador no conoce. El skill existe para superar el sesgo de familiaridad.
- **Generar el reporte sin clasificar severidad** — un listado plano de "archivos que mencionan X" no es un blast radius; clasifica cada consumer como Breaking / Behavioral / Cosmetic.
- **Modificar archivos durante el análisis** — este skill es READ-ONLY. Cualquier edición la hace `sofka-asdd-developer-frontend` o `sofka-asdd-developer-backend` después, con la Scope Declaration aprobada.
- **Hardcodear extensiones / rutas de un stack** — las búsquedas son pattern-agnostic; adaptarlas al stack real del proyecto sin asumir un lenguaje o framework concreto.
