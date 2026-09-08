---
name: sofka-asdd-producto-new-hu
description: Scaffolding de UNA historia de usuario testable con Given/When/Then, criterios de aceptación y notas técnicas.
---

# New HU — Scaffold de historia de usuario

> Crea un archivo de historia de usuario único y testable bajo `docs/specs/hu/`, alineado al template ASDD, listo para entrar al workflow de Analizar (WF-002).

## Rol

Plantillador de historias. Produce **una** HU con su ID, descripción narrativa, criterios de aceptación en Given/When/Then y notas técnicas mínimas. No analiza el set completo del backlog (eso es `sofka-asdd-producto-po`).

## Cuándo activar

- El brief del proyecto ya existe (`docs/specs/brief-{proyecto}.md`) y se necesita arrancar una HU concreta para refinamiento.
- El prompt dice: "crea la HU de…", "arma la historia para…", "genera la US-XXX".
- Fase ASDD: **Analizar** (`WF-002`) — paso previo al refinamiento profundo del PO.

## Cuándo NO invocar

- Hay que **analizar o refinar un set completo** de historias y priorizarlas → usar `sofka-asdd-producto-po`.
- Hay que mapear procesos AS-IS / TO-BE o elicitar reglas de negocio → usar `sofka-asdd-producto-ba` primero.
- Hay que generar el **brief del proyecto** (alcance global) → usar `sofka-asdd-producto-pm` con la plantilla de `sofka-asdd-producto-templates`.
- No existe brief aprobado en `docs/specs/` → STOP. Sin brief, la HU no tiene contexto de validación (CORE-001). Solicitar `/sofka-asdd:specify` primero.

## Proceso

### 1. Verificar precondiciones

- Confirmar que existe `docs/specs/brief-{proyecto}.md` (regla `WF-002` exige brief aprobado).
- Identificar el módulo o bounded context al que pertenece la HU (sale del brief o del prompt del usuario).

### 2. Derivar el ID de la HU

- Listar HUs existentes del módulo: `Glob docs/specs/hu/HU-{MODULE}-*.md`.
- El siguiente ID = mayor `NNN` existente + 1, formato `HU-{MODULE}-{NNN}` (ej: `HU-PAYMENTS-003`).
- Si es la primera HU del módulo → `HU-{MODULE}-001`.
- El prefijo `{MODULE}` se acuerda en el brief o se infiere del bounded context (mayúsculas, sin guiones, máx 12 caracteres).

### 3. Usar la ruta reservada (D4 — naming run-trazable)

El orquestador reserva antes del plan la ruta ANALYZE con slug
`hu-${MODULE,,}-${NNN}`. Usarla literalmente. Si falta, detenerse con `PLAN
UPDATE REQUERIDO`.

### 4. Escribir el archivo

- **Ruta**: target exacto declarado en `scope[]` y en el prompt.
- Usar el template de la sección **"Plantilla"** de abajo.
- Mantener la trazabilidad obligatoria: cada criterio de aceptación tiene ID `AC-NN`, y la HU referencia las reglas de negocio (`RN-NNN`) o casos de uso (`CU-NNN`) del spec si ya existen.

### 5. Validar la HU producida (checklist)

| Validación | Regla |
|---|---|
| ID único, sin colisión | `Glob` previo descartó duplicados |
| Rol del actor descrito en términos de negocio, no técnicos | `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` (principio 6 — contexto) |
| Cada AC en formato Given/When/Then medible | `istqb-quality-culture` principio 1 (presencia, no ausencia) |
| Vocabulario semántico preservado (`debe`, `nunca`, `máximo`, etc.) | Alineado con `sofka-asdd-producto-po` — sección "Vocabulario" |
| Ortografía española correcta (tildes, signos dobles) | `sofka-asdd-spanish-orthography.md` |

### 6. Reportar al usuario

- Devolver la ruta del archivo creado.
- Recordar el siguiente paso: invocar `sofka-asdd-producto-po` para validar y refinar la HU en el contexto del backlog, o `sofka-asdd-producto-funcional` si se requieren casos de uso detallados (`CU-NNN`).

## Checklist de calidad de la HU (antes de cerrar)

| Dimensión | Validación |
|---|---|
| Actor | Un rol de negocio reconocible (no "el sistema", no "el desarrollador") |
| Acción | Verbo + objeto concreto del dominio |
| Valor | Razón explícita de negocio (no "porque sí", no técnica) |
| Criterios de aceptación | ≥ 2 escenarios en Given/When/Then, con resultado verificable |
| Boundary values declarados | Si el flujo involucra rangos, fechas, límites — listarlos explícitos |
| Error states declarados | Al menos un escenario negativo o de borde por AC |
| Dependencias | HUs predecesoras o servicios externos listados (si aplica) |

## Plantilla

```markdown
# HU-{MODULE}-{NNN}: {Título corto en imperativo}

**Módulo / Bounded Context**: {nombre del módulo}
**Sprint**: pendiente de asignación
**Prioridad**: pendiente
**Estimación**: pendiente
**Brief de referencia**: `docs/specs/brief-{proyecto}.md`

## Historia de usuario

**Como** {rol de negocio},
**quiero** {acción concreta sobre el sistema},
**para** {valor de negocio u objetivo medible}.

## Criterios de aceptación

### AC-01: {nombre descriptivo del criterio}

- **Dado** {precondición o contexto del actor}
- **Cuando** {acción que ejecuta el actor}
- **Entonces** {resultado observable y medible}
- **Y** {efecto colateral verificable, si aplica}

### AC-02: {nombre del criterio — escenario alterno o de borde}

- **Dado** {precondición}
- **Cuando** {acción}
- **Entonces** {resultado esperado}

### AC-03: {escenario negativo / manejo de error}

- **Dado** {precondición que rompe la regla}
- **Cuando** {acción}
- **Entonces** {mensaje o estado de error esperado}

## Reglas de negocio referenciadas

- `RN-NNN`: {descripción si ya existe en spec; "pendiente de elicitar" si no}

## Notas técnicas

- **Backend**: {endpoints, eventos de dominio o servicios afectados — alto nivel}
- **Frontend**: {páginas, componentes o flujos afectados — alto nivel}
- **Datos**: {migraciones o cambios de schema, sí/no + descripción}
- **Seguridad**: {roles autorizados, datos sensibles involucrados}

## Dependencias

- {HU predecesora, si aplica}
- {Servicio externo o integración requerida, si aplica}

## Diseño y referencias visuales

- {Enlace a wireframes o prototipo de `docs/design/wireframes/`, si existen}
- {Enlace a Figma, si aplica — el handoff lo gestiona `sofka-asdd-ui`}

## Definition of Done

- [ ] Todos los criterios de aceptación verificados con tests automatizados
- [ ] Métricas de aceptación evaluadas (latencia, disponibilidad, etc. — si aplica)
- [ ] Documentación funcional actualizada
- [ ] Sign-off de Product Owner registrado
```

## Outputs

- `docs/specs/hu/HU-{MODULE}-{NNN}_{kebab-case-titulo}.md` — archivo de historia de usuario único, listo para refinamiento.

## Relación con skills y reglas existentes

| Skill / Regla | Relación |
|---|---|
| `sofka-asdd-producto-po` | **Hermano — diferenciación clave**: `po` analiza y prioriza el **set completo** del backlog y valida entregas; `new-hu` solo **scaffolding rápido de UNA historia** con su template. Después de `new-hu`, el flujo natural es invocar `po` para refinar y priorizar. |
| `sofka-asdd-producto-funcional` | Posterior a `new-hu` cuando la HU requiera casos de uso detallados (`CU-NNN`) con flujos principal, alternativo y excepción. |
| `sofka-asdd-producto-ba` | Anterior a `new-hu` si las reglas de negocio aún no están elicitadas o si falta mapeo AS-IS / TO-BE. |
| `sofka-asdd-producto-templates` | `new-hu` produce un **artefacto granular** (una HU); `templates` provee la estructura del brief y del spec global del feature. Complementarios, no sustitutos. |
| `WF-002` (`sofka-asdd-workflow.md`) | Fase Analizar — exige brief aprobado antes de generar specs y HUs. `new-hu` es uno de los primeros artefactos del paso. |
| `sofka-asdd-atf-api-qa-engineer.md (embedded: ISTQB Cultura de Calidad)` | Aplica principios 1 (presencia, no ausencia), 3 (shift-left) y 6 (contexto) en la redacción de los AC. |
| `sofka-asdd-spanish-orthography.md` | Ortografía obligatoria en toda la HU (tildes, signos dobles). |
| `CORE-001` (`CLAUDE.md`) | Sin brief aprobado, no se generan HUs. Este skill verifica la precondición antes de escribir. |

## Anti-patterns

- **HU sin brief de referencia** — generar una HU "porque el usuario la pidió" sin un brief aprobado en `docs/specs/`. Viola `CORE-001` (sin spec, sin código) y produce historias sin contexto de validación. Si el brief no existe → STOP y solicitar `/sofka-asdd:specify`.
- **Criterios de aceptación no testeables** — "el sistema debe responder rápido", "la interfaz debe ser intuitiva". Reformular siempre en Given/When/Then con magnitud verificable. Alineado con `sofka-asdd-producto-po` — sección anti-patterns.
- **Historia técnica disfrazada de HU de negocio** — "Como desarrollador quiero refactorizar el módulo X…". Las HU describen valor para un actor de negocio. Refactorings van por `sofka-asdd-tech-lead-refactoring-plan`.
- **Generar varias HUs en una sola invocación** — `new-hu` produce **una** historia. Si el prompt sugiere un set completo, escalar a `sofka-asdd-producto-po` con el brief como input.
- **Inventar `RN-NNN` o `CU-NNN` sin trazabilidad** — si las reglas o casos de uso aún no están elicitados, marcar explícitamente "pendiente de elicitar". Crear IDs ficticios rompe la trazabilidad del spec consolidado.
- **Omitir escenarios de borde y de error** — toda HU debe declarar al menos un AC negativo o de borde (alineado con `.claude/docs/developer-test-protocol.md` — AVF / error states). Sin esto, el implementador no puede derivar tests completos.
