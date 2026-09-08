---
name: sofka-asdd-tech-lead-integration-validator
description: Valida POST-cambio que contratos, eventos, transiciones de estado y consumidores siguen sanos.
---

# Integration Validator

> **Modo: READ-ONLY.** Esta skill no modifica archivos. Solo lee, analiza y produce un reporte de validación de integraciones.

## Rol

Validador de integraciones funcionales **post-cambio**. Recorre los flujos end-to-end entre módulos, servicios o capas afectadas y verifica que el comportamiento real (no solo el contrato declarado) sigue siendo correcto: shapes alineados, transiciones legales, errores manejados, permisos consistentes y estados de UI/cliente cubiertos.

Complementa la regla **Dependent Module Testing** de `sofka-asdd-system-integrity.md`: donde esa regla obliga a *ejecutar* los tests de los consumidores, esta skill *inspecciona* la integración y reporta las brechas antes de que los tests las descubran (o cuando los tests no existen aún).

## Cuándo activar

Señales en el prompt:

- "validá la integración entre {servicio A} y {servicio B}"
- "el cambio en el contrato/DTO/evento, ¿rompe consumers?"
- "verificá que el flujo end-to-end sigue funcionando"
- "validá permisos/roles antes del merge"
- Tras modificar un puerto de dominio, un DTO público, un evento publicado, un endpoint o un enum de estado

**Fase ASDD primaria:** Verificar (WF-005). Secundaria: cierre de Construir (WF-004) antes del quality-gate cuando el cambio cruza límites de módulo.

**Ruta:** se invoca en ruta LIGHT cuando el scope es un par módulo↔consumidor identificado, o como soporte dentro de FULL para features que tocan más de un bounded context.

## Diferenciación con skills hermanas (lectura obligatoria antes de invocar)

- **`sofka-asdd-solution-architect-cross-impact`**: mapea impacto **PRE-cambio** — ¿quién consume esto si lo modifico? Produce el set de consumidores a revisar. Sale a buscar el riesgo.
- **`sofka-asdd-tech-lead-integration-validator` (esta skill)**: valida **POST-cambio** — ¿las integraciones siguen sanas después de modificar? Recorre flujos y reporta brechas. Confirma que el riesgo no se materializó.
- **`sofka-asdd-tech-lead-code-review`**: revisa el diff dentro de un PR (estilo, patrones, seguridad básica). No recorre flujos cross-módulo.
- **`sofka-asdd-tech-lead-quality-gate`**: emite veredicto PASS/FAIL contra umbrales de métricas (cobertura, complejidad). Consume el reporte de esta skill si el gate exige cero blockers de integración.

Si la pregunta es "¿qué se rompe si cambio X?" → cross-impact. Si es "¿se rompió algo tras cambiar X?" → integration-validator.

## Proceso

### Paso 0 — PRE-FLIGHT (ligero, esta skill no escribe código)

No requiere rama dedicada (modo READ-ONLY). Sí aplica:

1. **Scope Declaration** (`sofka-asdd-skill-preflight.md`): publicar en el chat qué módulos, archivos y flujos se van a validar antes de empezar a leer.
2. **Límite de lectura**: aplicar el patrón de 3 capas de `sofka-asdd-anti-loops.md` — `grep` para localizar, `glob` para confirmar, `read` con `offset/limit` solo sobre la sección relevante. No leer archivos completos > 200 líneas.

### Paso 1 — Enumerar flujos end-to-end

Por cada cambio detectado en la spec o el diff, identificar los flujos cliente→servicio→repositorio o publisher→consumer que lo atraviesan:

```
Flujo: [{rol}] ejecuta [{acción}] sobre [{recurso}]
  1. Cliente: handler/hook invoca {acción} → request al servicio
  2. Servicio: controller/handler recibe → caso de uso procesa → adapter persiste o publica
  3. Servicio: responde {2xx | 4xx | 5xx} o publica evento {tópico, payload}
  4. Cliente / consumer: procesa respuesta o consume evento → actualiza estado
  5. Usuario / sistema downstream: ve {resultado, error, estado vacío, loading}
```

Cada flujo identificado se anota como fila en el reporte. Sin flujos enumerados → no se pueden validar capas.

### Paso 2 — Validar cada capa del flujo

Aplicar las checklists del bloque siguiente. Cada item se marca PASS / FAIL / N/A con evidencia archivo:línea. Sin evidencia archivo:línea → no contar como validado (regla **SBR-001**: think before coding — afirmaciones sin fuente son alucinación).

### Paso 3 — Verificar contratos contra la fuente

Para cada par cliente↔servicio o publisher↔consumer:

- Buscar el endpoint o handler con `Grep` en el lado servidor.
- Buscar el cliente/consumer con `Grep` en el lado cliente.
- Comparar shape, tipos, requeridos/opcionales, enums y errores declarados **campo a campo**.
- Si existe contrato declarado (OpenAPI/AsyncAPI en `docs/architecture/contracts/`), validar que ambos lados están alineados con él.

### Paso 4 — Producir el reporte

Emitir el reporte estructurado (sección "Outputs"). Veredicto explícito:

- **PASS**: todos los flujos validados, sin blockers.
- **FAIL**: al menos un blocker (contrato roto, transición ilegal, permiso inconsistente, 500 sin manejo cliente).

Sin "PASS con observaciones". Si hay blocker → FAIL.

## Checklists por capa

### A. Alineación de contrato (request/response, evento)

| Item | Verificar |
|---|---|
| Path/URL o tópico | Cliente y servicio (o publisher y consumer) usan el mismo identificador exacto |
| Método HTTP / tipo de mensaje | Coincide en ambos lados |
| Query params / headers | Nombres, tipos, requerido vs opcional alineados |
| Request body / payload | Field-by-field: nombres, tipos, anidación, nullability |
| Response body | Coincide con la interfaz/DTO del cliente — sin campos huérfanos en ninguno de los dos lados |
| Versionado | Si el contrato tiene versión, ambos lados usan la misma |

### B. Permisos y autorización

| Item | Verificar |
|---|---|
| Roles declarados | El guard del cliente lista los mismos roles que la autorización del servidor |
| Navegación condicional | Menús, links y botones se ocultan para roles no autorizados |
| Manejo de 401/403 | Cliente reacciona con redirect o mensaje claro, no con error genérico |
| Auditoría | Acciones sensibles (escritura, borrado, cambio de estado) quedan trazadas server-side |

### C. Transiciones de estado

> Fuente de verdad: el ADR o la máquina de estados documentada en `docs/architecture/decisions/` o `docs/architecture/diagrams/`. NUNCA validar transiciones de memoria.

| Item | Verificar |
|---|---|
| Valores del enum | Cliente usa exactamente los mismos códigos que el servicio (case-sensitive) |
| Etiquetas localizadas | El cliente mapea TODOS los estados posibles (sin fallthrough a "desconocido") |
| Transiciones legales | Las transiciones disparadas desde el cliente son alcanzables desde el estado actual según la máquina de estados |
| Optimistic updates | Si existen, se revierten ante error del servidor |

### D. Manejo de errores (Bugs que los Agentes Introducen — `.claude/docs/stabilization-bug-rules.md`)

| Item | Verificar | Bug relacionado |
|---|---|---|
| 400 / 422 (validación) | Cliente muestra mensajes por campo, no error genérico | Silent data corruption |
| 404 (no encontrado) | Mensaje de estado vacío amigable | — |
| 409 (conflicto) | Retry o mensaje claro al usuario | Race condition |
| 5xx / timeout | Mensaje genérico + correlation ID, sin volcado crudo | Retry storm |
| Reintentos | Con backoff exponencial + jitter, no en loop | Retry storm |
| Auth context | El servidor usa el token verificado, no datos del request | Auth context leak |
| Recursos en error | Listeners, suscripciones, handles cerrados ante error | Memory leak |

### E. Paginación y filtrado

| Item | Verificar |
|---|---|
| Parámetros de página | Cliente envía `page`/`size` (o equivalente) que el servidor entiende |
| Metadatos | Cliente consume `totalElements`/`totalPages` u homólogos sin recalcularlos |
| Filtros | Nombres y formatos coinciden (búsqueda, estado, rango de fechas) |
| Orden | Formato del `sort` o equivalente coincide en ambos lados |

### F. Estados del cliente (loading / empty / error / success)

| Estado | Verificar |
|---|---|
| Loading | Skeleton, spinner o equivalente — nunca pantalla en blanco |
| Empty | Mensaje descriptivo + acción sugerida — nunca tabla vacía sin contexto |
| Error | Mensaje amigable + acción de retry o correlation ID — nunca volcado crudo |
| Success | Confirmación visible o transición de UI clara |
| Refetch | Estrategia explícita (pull-to-refresh, auto-retry con backoff, invalidación de cache) |

### G. Transformación de datos

| Item | Verificar |
|---|---|
| Fechas | Servidor envía ISO-8601; cliente formatea con locale (no muestra ISO crudo) |
| Enums | Servidor envía código; cliente mapea a etiqueta localizada (ortografía: `sofka-asdd-spanish-orthography.md`) |
| Nulls | Campos nullable del servidor manejados en el cliente con optional chaining o fallback |
| Identificadores | Formato consistente (sin trimming, sin cambio de case, sin truncado silencioso) |

### H. Eventos asíncronos (si aplica)

| Item | Verificar |
|---|---|
| Schema del evento | Publisher y consumer usan el mismo schema (referencia AsyncAPI si existe) |
| Idempotencia | Consumer maneja duplicados sin efectos colaterales |
| Orden | Si el orden importa, hay garantía (partition key, secuencia, dedupe) |
| Dead-letter | Mensajes malformados o irrecuperables van a DLQ, no se pierden silenciosamente |
| Manejo de fallo downstream | Reintento con backoff, no retry storm |

## Outputs

Archivo único: `docs/tech/integration-validation-{feature|módulo}-{YYYY-MM-DD}.md`.

Estructura obligatoria:

```markdown
# Integration Validation — {feature o módulo}

**Fecha**: {YYYY-MM-DD}
**Scope**: {módulos, servicios o flujos validados}
**Veredicto**: PASS | FAIL

## Flujos validados

| # | Flujo | Rol/Actor | Cliente → Servicio (o Pub → Sub) | Estado |
|---|---|---|---|---|
| 1 | … | … | … | PASS / FAIL |

## Alineación de contrato

| Artefacto cliente | Artefacto servicio | Resultado | Brecha (archivo:línea) |
|---|---|---|---|

## Permisos

| Endpoint / acción | Roles servidor | Guard cliente | Resultado |
|---|---|---|---|

## Cobertura de errores

| Endpoint | 400 | 404 | 409 | 5xx | Loading | Empty |
|---|---|---|---|---|---|---|

## Transiciones de estado

| Estado origen | Transición disparada | Permitida en máquina de estados | Cliente la maneja |
|---|---|---|---|

## Hallazgos

| # | Severidad | Flujo | Brecha (archivo:línea) | Fix sugerido |
|---|---|---|---|---|
| 1 | blocker / major / suggestion | … | … | … |

## Resumen
- Flujos validados: N
- PASS: N
- FAIL: N
- Blockers abiertos: N
- Brechas de manejo de errores: N
```

Severidades alineadas con `sofka-asdd-tech-lead-code-review`:

- **blocker**: contrato roto, transición ilegal disparable, permiso inconsistente que expone datos, 5xx sin manejo cliente, evento sin DLQ. Veredicto → FAIL.
- **major**: estado vacío sin manejar, paginación inconsistente, mensaje de error crudo. Veredicto → FAIL si el flujo es crítico, sino major abierto.
- **suggestion**: mejoras de UX o consistencia menor. No bloquea.

## Relación con reglas y skills existentes

- **`sofka-asdd-system-integrity.md` (Dependent Module Testing)** — esta skill **complementa** la regla: identifica qué consumidores hay que testear y qué brechas tienen *antes* o *después* de correr la suite. La regla obliga a ejecutar los tests; la skill produce el mapa de qué falta probar.
- **`.claude/docs/stabilization-bug-rules.md` (Bugs que los Agentes Introducen)** — la checklist D se mapea 1:1 con la tabla de patrones que el revisor verifica activamente (silent data corruption, race condition, retry storm, auth context leak, etc.).
- **`sofka-asdd-orchestration-routing.md` (ORC-001-C, escalamiento)** — si esta skill detecta que el scope real cruza más módulos o requiere ADR para resolver, **escala al orquestador** con motivo `scope_mayor` o `requiere_adr`.
- **`sofka-asdd-anti-loops.md` (Patrón de 3 capas)** — modo de lectura obligatorio: `grep` → `glob` → `read` con `offset/limit`. Sin esto, el reporte satura contexto y degrada la precisión.
- **`sofka-asdd-spanish-orthography.md`** — al validar transformación de datos (capa G), verificar que las etiquetas localizadas tienen ortografía correcta (tildes, signos dobles, palabras sin tilde marcadas).
- **`sofka-asdd-workflow-build.md` (WF-005)** — fase Verificar; el reporte alimenta el quality-gate del tech-lead y el sign-off del QA antes del merge a release.
- **`sofka-asdd-solution-architect-cross-impact`** — ejecutar PRIMERO para tener el set de consumidores. Esta skill consume ese set y lo recorre.

## Cuándo NO invocar

- No hay un cambio concreto que validar (sin diff, sin spec) — la skill recorre flujos sobre un cambio específico, no audita el codebase entero.
- El cambio es interno a un solo módulo y no toca contratos, eventos ni interfaces públicas — basta con `sofka-asdd-tech-lead-code-review`.
- Solo hace falta saber qué se rompería si se modifica algo — usar `sofka-asdd-solution-architect-cross-impact` (impacto PRE-cambio).
- Se busca decisión sobre métricas de cobertura/complejidad — usar `sofka-asdd-tech-lead-quality-gate`.
- Se busca revisión de seguridad — escalar a `sofka-asdd-security-code-scan`.
- No existe un contrato declarado ni una máquina de estados documentada — primero pedir a `sofka-asdd-solution-architect` que produzca el ADR; sin fuente de verdad no se puede validar (regla **SBR-001**).

## Anti-patterns

- **Validar de memoria** — afirmar "esta transición es legal" sin citar el ADR o la máquina de estados. Sin evidencia archivo:línea → marcar como N/A, no como PASS (regla SBR-001).
- **PASS con observaciones** — el veredicto es binario. Si hay blocker, es FAIL. Si solo hay suggestions, es PASS limpio. Los grises ocultan riesgo.
- **Recorrer un solo lado del flujo** — leer únicamente el cliente o únicamente el servidor. La validación es por definición end-to-end; ambos lados deben revisarse.
- **Reescribir el ADR en el reporte** — si la máquina de estados está en `docs/architecture/`, el reporte la referencia, no la duplica. Duplicar genera drift.
- **Modificar código durante el análisis** — esta skill es READ-ONLY. Si se descubre un bug, se reporta como blocker; si se descubre código a limpiar, se escala como `sofka-asdd-tech-lead-refactoring-plan` (regla del Diagnóstico Read-Only en `.claude/docs/stabilization-bug-rules.md`).
- **Marcar como blocker un asunto de estilo** — los blockers son ruptura real (contrato, transición, permiso, manejo de 5xx). El estilo es `suggestion`.
- **Saltar el Impact Map** — empezar a validar sin haber consultado a `sofka-asdd-solution-architect-cross-impact` o sin haber leído la spec del cambio. Sin saber qué consumidores existen, el reporte es incompleto.
