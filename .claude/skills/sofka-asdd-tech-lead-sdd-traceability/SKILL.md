---
name: sofka-asdd-tech-lead-sdd-traceability
description: Matriz de trazabilidad spec a código y tests. Un ítem sin evidencia bloquea el quality gate.
---

# Matriz de Trazabilidad spec → código → test

> Garantiza que **toda** especificación aprobada (CORE-001) quedó cubierta por código y tests, sin desviaciones silenciosas (CORE-006). No se admite cierre con ítems en estado `❌` ni `⚠️ parcial`.

## Rol

Auditor de trazabilidad. **Solo lectura**: mapea cada elemento rastreable de la spec a su evidencia concreta y emite veredicto **COMPLETO** o **INCOMPLETO**. No modifica código.

## Cuándo activar

- Al cierre de **Construir** (WF-004), antes de invocar el quality gate, para que el implementador resuelva gaps.
- En **Verificar** (WF-005), como verificación independiente del Tech Lead antes del sign-off de QA (CORE-008).
- Antes de un push asociado al cierre de una spec — si la matriz no está **COMPLETA**, no autorizar push (relaciona con GS-008).
- Bajo demanda cuando se sospecha que una historia quedó incompleta.

## Entrada

- Ruta de la spec a verificar. Puede ser un artefacto nuevo de run
  (ej. `docs/specs/2026-06-18-001-ANALYZE-002-mi-feature.md`) o uno legado
  (ej. `docs/specs/{feature}-{NNN}.md`). Ambos patrones son válidos.
- Sin argumentos explícitos: detectar la spec asociada a la rama actual
  buscando en `docs/specs/` por nombre de rama o WI. Si no se puede resolver
  → reportar el error al usuario y detenerse.
- ADRs referenciados en la spec (`docs/architecture/decisions/ADR-*.md`).

## Ítems rastreables (mapeo spec → evidencia)

> **Vocabulario del super-spec corporativo (ADR-004 §6.3).** El template corporativo Sofka eliminó `CU-\d+`, `HU-\d+` y `AC-\d+` como IDs propios. Este skill **no** parsea esos prefijos. El mapeo vigente de IDs rastreables es:
>
> | ID | Origen | Cómo se obtiene |
> |---|---|---|
> | `RN-NNN` | Reglas de Negocio §6 (tipadas `[CORE]` / `[EDGE]`) | Parseo directo del ID; el tipo `[CORE]`/`[EDGE]` **no** altera la extracción |
> | `SCN-NNN` (sintético) | Escenarios Gherkin §10 (spec-qa), sin ID en la spec | Derivado del **orden de aparición** de cada `Scenario:` en §10 (SCN-001 = primer `Scenario:`, SCN-002 = segundo, …) |
> | `GAP-NNN` | Decisiones Requeridas y Gaps §14 (spec-funcional) | Parseo directo del ID |
> | `CR-NNN` | Historial de Cambios Post-Aprobación §15 (spec-funcional) | Parseo directo del ID; marcadores inline `[CR-NNN]` en el elemento modificado |
>
> El Flujo de Negocio (§4) se rastrea por su descripción/numeración, **no** por un ID `CU-`.

| Origen en spec ASDD | Tipo de evidencia esperada | Prefijo ID |
|---|---|---|
| Escenarios de aceptación (§10 spec-qa, `Scenario:` Gherkin sin ID) | Test que ejecuta el escenario; ID sintético `SCN-{NNN}` por orden de aparición del `Scenario:` en §10 | `SCN-NNN` |
| Reglas de Negocio (§6, tipadas `[CORE]` / `[EDGE]`) | Test que valida la regla; código de dominio que la enforza | `RN-NNN` |
| Plan técnico (endpoints, DTOs, schemas, migraciones) | Archivo de producción en la ruta esperada | `TEC-NN` |
| Requisitos de seguridad (roles, validación, PII, cifrado) | Anotación de autorización, validador, sanitización, ausencia de PII en logs | `SEC-NN` |
| Requisitos UX (estados de UI, accesibilidad, mensajes en español) | Componente con estados loading/empty/error/success, atributos `aria-*`, labels en español (regla `sofka-asdd-spanish-orthography`) | `UX-NN` |
| ADRs aplicables | Implementación respeta la decisión del ADR (estructura, patrón, librería elegida) | `ADR-NN` |
| Gaps abiertos (§14) resueltos en un `spec-{area}` o arrastrados a Verificar | Resolución en código/test o nota de carrying | `GAP-NNN` |
| Cambios post-aprobación (§15) con marcador inline `[CR-NNN]` | Elemento (RN/escenario/área) modificado que refleja el cambio | `CR-NNN` |
| Escenarios QA — happy path | Test E2E o integración con happy path por rol | `QA1-NN` |
| Escenarios QA — boundary values | Test unitario/integración con valor de borde explícito (PE/AVF de `.claude/docs/developer-test-protocol.md`) | `QA2-NN` |
| Escenarios QA — transiciones de estado | Test verificando la transición exacta | `QA3-NN` |
| Escenarios QA — error states | Test verificando 400/401/403/404/409/500/timeout | `QA4-NN` |
| Escenarios QA — regresión | Test cubriendo el área en riesgo identificada | `QA5-NN` |
| Estándares de calidad del proyecto | Cumplimiento verificable por Grep negativo o lectura puntual | `STD-NN` |

- `RN-NNN`, `GAP-NNN`, `CR-NNN` son IDs **propios de la spec** → si la spec los trae, **reutilizarlos**; no renumerar.
- `SCN-NNN` es **sintético y order-fragile**: se re-deriva en cada corrida desde el orden de los `Scenario:` en §10. Si se reordenan los escenarios, los `SCN-NNN` se renumeran — comportamiento aceptado por diseño (ADR-004 §6.3), no un defecto a "corregir".

## Proceso (5 fases)

### Fase 1 — Localizar y parsear la spec

1. Resolver la ruta desde los argumentos o desde el contexto de rama.
2. Leer la spec completa con `Read` (máximo 200 líneas por llamada — regla **AL-002**, **AL-003** de `sofka-asdd-anti-loops`).
3. Extraer cada ítem rastreable y asignar su ID según la tabla anterior (los `RN`/`GAP`/`CR` provienen de la spec; los `SCN-NNN` se derivan por orden de aparición de cada `Scenario:` en §10).
4. Leer los ADRs referenciados solo en las secciones relevantes (`offset`/`limit`).

### Fase 2 — Buscar evidencia por ítem (estrategia de 3 capas)

Aplicar la estrategia de tokens de `sofka-asdd-anti-loops` (Grep → Glob → Read selectivo):

1. **Grep** por el ID del ítem, palabras clave del enunciado, nombre del DTO/endpoint/regla.
2. **Glob** para confirmar la ubicación del archivo si Grep apunta a uno.
3. **Read** con `offset`/`limit` solo si hace falta confirmar el contenido (≤ 200 líneas).

Patrones por tipo:

| Tipo | Patrón sugerido |
|---|---|
| `SCN` / `QA1..5` | Grep en directorios de tests del proyecto (`**/*test*`, `**/*spec*`, `**/*e2e*`) por palabras clave del `Scenario:` (§10) o por el ID `SCN-NNN`/`QA-NNN` |
| `RN` | Grep por palabras clave del enunciado de la regla (§6) en código de dominio que la enforza y en tests que la validan |
| `TEC` | Grep por nombre del controller/handler/DTO/schema/migración esperado en el código de producción |
| `SEC` | Grep por anotación o middleware de autorización con el rol correcto; ausencia de PII en logs |
| `UX` | Grep por estados (`isLoading`, `isError`, render condicional para empty), atributos `aria-*`, textos en español con tildes correctas |
| `ADR` | Grep por la estructura/patrón/librería decidida en el ADR |
| `STD` | Grep negativo de antipatrones declarados (por ejemplo, ausencia de `console.log`, ausencia de `any` cuando el proyecto lo prohíba) |

Reglas anti-bucle:

- Si tras **2 patrones distintos** no se encuentra evidencia → marcar `❌ sin evidencia` y continuar (AL-002, AL-003).
- Si la evidencia existe pero es débil (un test cubre el escenario adyacente, no el exacto) → `⚠️ parcial` con justificación.

### Fase 3 — Validar cobertura semántica

No basta con que exista el archivo. La evidencia debe **probar** que el ítem se cumple:

- **Tests**: leer el cuerpo del `it`/`test` y confirmar que verifica lo que pide el escenario (§10) o la regla de negocio (§6). Un test llamado `rejectsInvalidLength` para un escenario que pide "rechaza identificador con longitud > N" debe verificar **explícitamente** longitud `> N`, no un caso adyacente.
- **Código**: leer el bloque relevante y confirmar que la implementación satisface el ítem. Un endpoint con la anotación de autorización correcta cubre el SEC respectivo solo si los roles coinciden con los pedidos.
- **Escenario Gherkin (§10) / `SCN-NNN`**: alinear con el contrato del **Test Coverage Declaration** del implementador (regla del protocolo `.claude/docs/developer-test-protocol.md`). Si el implementador declaró un test por escenario pero el test no cubre el `Scenario:` correspondiente → `⚠️ parcial`.

### Fase 4 — Construir matriz

Formato obligatorio (publicar en chat y archivar):

```markdown
## Matriz de Trazabilidad — {nombre de la spec}

### Resumen
- Ítems totales: N
- Cubiertos (✅): X
- Parciales (⚠️): Y
- Sin evidencia (❌): Z
- Cobertura: P% (X / N)
- Veredicto: COMPLETO | INCOMPLETO

### Detalle

| ID | Origen | Ítem (resumen) | Evidencia | Estado |
|----|--------|----------------|-----------|--------|
| SCN-001 | SCN | Usuario registra solicitud con identificador válido | `tests/registration.spec.ts:45 it("happy path identificador 13 dígitos")` | ✅ |
| SCN-002 | SCN | Sistema rechaza identificador con longitud > 13 | — | ❌ |
| QA4-01 | Error state | POST /requests con identificador inválido → 400 | `RequestHandlerTest:120 returns400OnInvalidId` (valida 13, no > 13) | ⚠️ parcial — cubre adyacente |
| TEC-01 | Plan | Endpoint POST /api/v1/requests | `RequestHandler:34 route("POST", "/requests")` | ✅ |
| SEC-01 | Seguridad | Solo rol X puede crear solicitud | `RequestHandler:33 authorize("role_x")` | ✅ |
| UX-01 | UX | Pantalla con 4 estados | `RequestList:20-65 cubre 3/4 (falta empty)` | ⚠️ parcial |
| ADR-04 | ADR | Persistencia con repositorio paginado | `RequestRepository.findPaged(...)` | ✅ |

### Ítems sin evidencia (bloqueantes)
1. **SCN-002** — Sistema rechaza identificador con longitud > 13. Sin test ni validador encontrado.
   - Patrones buscados: `Grep "length.*> ?13"`, `Grep "InvalidLengthException"`, `Glob "**/IdValidator*"`. Sin resultados.
   - Acción sugerida: el implementador (sofka-asdd-developer-backend o sofka-asdd-developer-frontend) debe agregar validador y test unitario antes del quality gate.

### Ítems parciales (revisión requerida)
1. **QA4-01** — el test cubre el caso límite (13), no el caso fuera de rango (> 13). Extender o crear test.
2. **UX-01** — falta render condicional para estado empty.
```

### Fase 5 — Veredicto y handoff

| Veredicto | Condición | Siguiente paso |
|---|---|---|
| **COMPLETO** | 100% en `✅`, sin `⚠️` ni `❌` | Autoriza avanzar al quality gate (`sofka-asdd-tech-lead-quality-gate`) o al sign-off de QA (`sofka-asdd-atf-api-qa-engineer` / `sofka-asdd-atf-reporting-qa-engineer`) según WF-005 |
| **INCOMPLETO** | Al menos 1 ítem en `❌` o `⚠️` | Bloqueante. Devolver al implementador (sofka-asdd-developer-backend / sofka-asdd-developer-frontend) con la matriz como punch list, según el contrato CORE-006 (sin desviaciones silenciosas) |

## Reglas de uso

- **Solo lectura**. Este skill nunca modifica código ni tests; reportar y archivar es su único output.
- No marcar `✅` si la evidencia existe pero no cubre semánticamente el ítem. La duda → `⚠️ parcial`.
- Si la spec carece de IDs estables → asignar IDs sintéticos pero anotar en el reporte que la spec original necesita IDs para futuras iteraciones (corregible por `sofka-asdd-producto-po`).
- Sección de la spec vacía cuando había cambios de código asociados (por ejemplo, requisitos de seguridad sin contenido y código nuevo en endpoints sensibles) → reportar como hallazgo de la spec, no como ítem cubierto.
- Aplicar **AL-002**, **AL-003** y la estrategia de 3 capas: nunca releer un archivo ya leído en el mismo turno; máximo 200 líneas por Read.
- Si tras 2 patrones distintos no aparece evidencia → marcar `❌` y avanzar (no entrar en bucle).

## Outputs

- Matriz publicada en chat (obligatorio).
- Artefacto en `docs/tech/` derivando el nombre con el helper (D4, `naming-convention.md §3.7.1`):
  ```bash
  ARTIFACT_NAME=$(node .claude/scripts/sofka-asdd-artifact-name.mjs \
    --phase verify --slug traceability-{feature})
  ```
  Si no hay run activo, fallback legado: `docs/tech/traceability-{feature}-{NNN}.md`.
  El artefacto contiene la matriz, los bloques de bloqueantes y parciales, y la línea final exacta:

  ```text
  Veredicto: COMPLETO | INCOMPLETO — Cobertura: P% (X/N) — Bloqueantes: Z — Parciales: Y
  ```

## Relación con skills y reglas existentes

- **`sofka-asdd-tech-lead-code-review`** — revisa calidad técnica del diff (naming, patrones, legibilidad). Esta skill, en cambio, audita la **cobertura del contrato spec ↔ implementación**: no opina sobre estilo, sino sobre completitud. Ambas se complementan en Verificar.
- **`sofka-asdd-tech-lead-quality-gate`** — evalúa métricas objetivas (cobertura global, complejidad, blockers). La matriz de trazabilidad es **prerrequisito**: si está INCOMPLETA, el quality gate no debe emitir PASS.
- **`.claude/docs/developer-test-protocol.md`** (regla del proyecto) — exige al implementador publicar un **Test Coverage Declaration** mapeando cada AC → archivo:método. Esta skill verifica que esa declaración se cumplió en la realidad del repo.
- **`sofka-asdd-atf-api-qa-engineer`** — produce trazabilidad de los escenarios QA bajo `docs/testing/atf/{run_id}/`. Esta skill **consolida** AC + TEC + SEC + UX + ADR + escenarios QA del cliente y los del pipeline en una sola matriz a nivel de spec.
- **Reglas citadas**: **CORE-001** (sin código sin spec aprobada), **CORE-006** (sin desviaciones silenciosas), **CORE-008** (un feature solo está hecho con sign-off QA), **WF-004**/**WF-005** (cierre de Construir y entrada a Verificar), **AL-002**/**AL-003** (anti-bucle en relectura y búsqueda), **GS-008** (gate pre-push), **ORC-007** (checkpoint y resume — el estado de la matriz se referencia desde `.asdd-run.json` cuando aplica).

## Cuándo NO invocar

- No existe spec aprobada para el cambio en curso — la trazabilidad presupone un contrato; sin spec, escalar a `sofka-asdd-producto-po` para generarla (CORE-001).
- Se busca revisión de estilo o patrones del diff — usar `sofka-asdd-tech-lead-code-review`.
- Se busca evaluación de cobertura cuantitativa global — usar `sofka-asdd-tech-lead-quality-gate`.
- Se busca auditoría de seguridad — escalar a `sofka-asdd-security-code-scan`.
- El cambio aún está en mitad de Construir y el código no es estable — esperar al cierre de WF-004.

## Anti-patterns

- **Marcar `✅` por nombre del test** — un `it("validates input")` no cubre `AC-02` si el body no verifica el escenario exacto del AC. Leer el cuerpo del test antes de aprobar.
- **Renumerar IDs propios de la spec** — si la spec ya trae `RN-001`, `GAP-001` o `CR-001`, reusarlos. Renumerarlos rompe la trazabilidad con el Test Coverage Declaration del implementador y con los reportes ATF. Excepción: `SCN-NNN` es sintético y order-fragile — se re-deriva por orden de `Scenario:` en cada corrida (ADR-004 §6.3), no se "preserva".
- **Veredicto COMPLETO con ítems parciales** — `⚠️ parcial` también bloquea. La regla es binaria: o todo verde, o INCOMPLETO.
- **Bucle infinito de exploración** — si 2 patrones distintos no encuentran evidencia, marcar `❌` y continuar. Buscar un tercer patrón viola AL-003.
- **Reescribir la spec para que "encaje"** — si la spec está mal o vacía en una sección, reportar como hallazgo, no completarla desde esta skill (no es su rol).
