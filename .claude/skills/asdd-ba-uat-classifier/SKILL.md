---
name: asdd-ba-uat-classifier
description: Clasifica hallazgos UAT y los enruta a su dueño. No muta la SPEC. Se activa dentro de asdd-ba-scope-manager.
---

> Rutas en **Layout B** (carpeta por nodo) — ver `.claude/reference/ba/asdd-ba-specs-layout.md`.

Skill de clasificación de hallazgos UAT del `asdd-ba-scope-manager`. Convierte una lista heterogénea de defectos, comentarios y observaciones de negocio en un inventario estructurado con clasificación, severidad y acción requerida.

> Referencia los elementos de la spec por **nombre**: `RN-NNN`, Flujo de Negocio, escenarios Gherkin (en `spec-qa`), Actores y Permisos, RNFs; el campo `Estado` vive en Metadatos y los cambios post-aprobación en el Historial de Cambios Post-Aprobación (`CR-NNN`). Nunca por número de sección absoluto.

## Cuándo se activa

- El stakeholder completó una sesión de UAT y entregó una lista de hallazgos.
- Se recibieron comentarios de validación del DVF con correcciones o dudas.
- Se necesita priorizar qué corregir antes del siguiente ciclo.
- Fase SDLC BA: **Fase 5 — Gestión de Hallazgos UAT**.

## Entradas

- Lista de hallazgos del stakeholder (texto libre, planilla o notas).
- Spec del feature (`docs/specs/{codigo}-{slug}/funcional-{codigo}.md` y slices).
- DVF (`docs/specs/{codigo}-{slug}/dvf-{codigo}.md`).

## Taxonomía de clasificación

El eje **tipo** describe la *naturaleza* del hallazgo (DEF/GAP/ALCANCE/DUDA) o el *artefacto* afectado (DATO/UX). Los de artefacto se resuelven por la pregunta "¿vive en la spec?" (ver Proceso), no se dejan ambiguos.

### Por tipo de hallazgo

| Tipo | Código | Definición |
|---|---|---|
| Defecto funcional | `DEF` | El sistema hace algo diferente a lo especificado |
| Gap de especificación | `GAP` | La spec no cubrió un escenario que el negocio necesita |
| Cambio de alcance | `ALCANCE` | El negocio quiere algo más allá de lo acordado |
| Duda / consulta | `DUDA` | El stakeholder no entiende cómo funciona algo — no es un defecto |
| Mejora de UX | `UX` | El flujo funciona pero la experiencia podría ser mejor |
| Dato incorrecto | `DATO` | Un valor, mensaje o etiqueta específica está equivocado |

> **Subtipos de `GAP` (test observacional — no es juicio de legitimidad):**
>
> | Subtipo | Test | Ruta |
> |---|---|---|
> | `GAP-INTERNO` | El hueco está dentro de un flujo, `RN-NNN` o escenario Gherkin **ya escrito** (rama faltante, caso borde no redactado, criterio ausente) | → `asdd-ba-specification-lead` directo |
> | `GAP-EXTERNO` | El hueco introduce un flujo, capacidad, rol o salida que la spec **no contempla en absoluto** | → skill hermano `asdd-ba-scope-control` primero |
>
> **Fail-safe:** ante duda INTERNO/EXTERNO → `GAP-EXTERNO`. Este skill NO decide si el hueco debe incluirse — solo si ya estaba escrito o no. La legitimidad la decide `asdd-ba-scope-control`.

### Por severidad

| Severidad | Código | Criterio |
|---|---|---|
| Bloqueante | `[B]` | Impide completar el proceso de negocio principal |
| Crítico | `[C]` | Afecta un flujo importante pero hay workaround |
| Moderado | `[M]` | Afecta la experiencia pero no bloquea ni pone en riesgo datos |
| Menor | `[L]` | Cosmético, estético o preferencia del usuario |

### Por origen funcional

| Origen | Descripción |
|---|---|
| `SPEC` | Error en la especificación funcional |
| `IMP` | Implementación no siguió la spec — **provisional**: confirmar con dev/QA |
| `REQ` | El requisito original era incompleto o ambiguo |
| `UX_DISENO` | Problema en el diseño de interacción, no en la lógica |

> El origen `IMP` vs `SPEC` requiere contrastar código contra spec — vista de dev/QA. Este skill (capa funcional) puede evaluar `SPEC` vs `REQ`; marca `IMP` como **provisional** y lo confirma el equipo de desarrollo/QA. No lo aseveres como definitivo.

## Proceso

1. Leer la lista de hallazgos del stakeholder (texto libre, notas, correos).
2. Para cada hallazgo: asignar tipo, severidad y origen (con `IMP` provisional).
3. Identificar duplicados/relacionados y agruparlos.
4. **`ALCANCE`** → marcar "fuera del alcance acordado"; no clasificar como defecto; enrutar al skill hermano `asdd-ba-scope-control`.
5. **`GAP`** → aplicar test de subtipo. INTERNO → identificar el elemento (RN/Flujo/Gherkin) y enrutar a `asdd-ba-specification-lead`. EXTERNO → enrutar a `asdd-ba-scope-control`.
6. **`DATO`/`UX`** → ¿el valor/flujo vive en la spec? Sí → tratar como GAP-INTERNO (cambia spec + bitácora). No (solo código/UI) → desarrollo, sin bitácora.
7. **`DEF` origen `SPEC`** → reclasificar como GAP-INTERNO (no dejarlo como defecto de implementación).
8. **`DUDA`** → si es solo aclaración con spec clara: cerrar sin bitácora. **Si la confusión rastrea a una spec ambigua/contradictoria** → escalar a `asdd-ba-scope-control` como potencial `AMBIGÜEDAD` (no inventar la aclaración).
9. **Hallazgo de área NO funcional** → si toca `spec-seguridad`, `spec-backend` u otra área, enrutar al **dueño de esa área** (security, backend…); no forzarlo al mapeo de bitácora funcional.
10. Determinar el tipo de bitácora según la tabla "Mapeo UAT → bitácora".
11. Generar el reporte clasificado con acciones por dueño.
12. **Activar `asdd-ba-change-log`** por cada hallazgo que modifique la spec — propagando siempre `H-NNN` y `Tipo UAT origen`.

## Mapeo UAT → bitácora (reconciliado a spec-per-área)

> **Pre-condición:** verificar el `Estado` en Metadatos de la spec afectada.
> - `BORRADOR` / `APROBADA CON OBSERVACIONES` → proceder según la tabla.
> - `APROBADA` → el cambio requiere **CR previo**. Alertar al AF: *"Este hallazgo modifica una spec aprobada. Debe abrirse un CR en el Historial de Cambios Post-Aprobación antes de que `asdd-ba-specification-lead` aplique el cambio (ver `asdd-spec-guard.md` SPG-001)."* No derivar a specification-lead hasta confirmar el CR.

El tipo de bitácora se determina por el **elemento de la spec tocado**, no por criterio libre:

| Tipo UAT | Condición | Ruta | ¿Bitácora? | Tipo de bitácora |
|---|---|---|---|---|
| `GAP` (INTERNO) | hueco dentro de algo ya escrito | specification-lead | Sí | por elemento (ver abajo) |
| `GAP` (EXTERNO) | introduce algo no contemplado | scope-control | Solo si INCLUIR | `ALCANCE` + tipo por elemento |
| `ALCANCE` | cualquiera | scope-control | `ALCANCE` siempre; +tipo si INCLUIR | `ALCANCE` (+tipo) |
| `DEF` origen `IMP` (provisional) | la spec era correcta | desarrollo | No | — |
| `DEF` origen `SPEC` | la spec estaba mal | reclasificar a GAP-INTERNO | Sí | por elemento |
| `DATO` vive en la spec | valor en `RN-NNN` o Gherkin | specification-lead | Sí | `REGLA` o `CRITERIO` |
| `DATO` solo código/UI | no toca la spec | desarrollo | No | — |
| `UX` toca el Flujo de Negocio | cambia el flujo | specification-lead / scope-control si es flujo nuevo | Sí | `FLUJO` |
| `UX` cosmético | no toca la spec | desarrollo/diseño | No | — |
| `DUDA` (spec clara) | cualquiera | aclaración | No | — |
| `DUDA` (revela ambigüedad) | rastrea a spec poco clara | scope-control (`AMBIGÜEDAD`) | Según decisión | por elemento si se corrige |
| Área NO funcional | toca `spec-seguridad`/`spec-backend`/etc. | dueño del área | N/A (fuera de bitácora BA-funcional) | — |

**Regla de tipo por elemento:** `RN-NNN` (incl. validaciones de campo) → `REGLA`; Flujo de Negocio / máquina de estados → `FLUJO`; escenario Gherkin (`spec-qa`) → `CRITERIO`; Actores y Permisos → `ACTOR`; RNF → `RNF`; contenido de `spec-seguridad` → dueño security (no bitácora funcional); Metadatos/DOR → `ALCANCE` (escalar a scope-control). `ESTADO` nunca nace en UAT. Un hallazgo que toca varios elementos genera una entrada por elemento.

**Trazabilidad:** todo hallazgo que llegue a bitácora propaga su `H-NNN` y `Tipo UAT origen` a la entrada `BC-NNN`. Esa es la clave que el registro de lecciones usa para correlacionar hallazgos con cambios.

## Formato del reporte de hallazgos

```
## Reporte de Hallazgos UAT — {feature}
Fecha de sesión: {fecha} | Stakeholder: {nombre/rol}
Total: {N} | Bloqueantes: {N} | Críticos: {N}

### Tabla de hallazgos
| ID | Descripción | Tipo | Severidad | Origen | Acción requerida |
|----|-------------|------|-----------|--------|-----------------|
| H-001 | {descripción} | DEF | [B] | IMP (prov.) | Corregir implementación referenciando RN-007 |
| H-002 | {descripción} | ALCANCE | [M] | REQ | Fuera de alcance → skill scope-control |

### Hallazgos de alcance (decisión del BA humano / scope-control)
- H-NNN: {descripción} → {impacto estimado si se incluye}

### Acciones por dueño
- asdd-ba-specification-lead: {IDs} — scope-control (mismo agente): {IDs}
- Equipo de desarrollo: {IDs} — Dueño de área no funcional: {IDs}

### Criterio de cierre del ciclo UAT
- Todos los [B] resueltos: {pendiente/completo}
- Todos los [C] resueltos o aceptados: {pendiente/completo}
```

## Write boundary

Escribís ÚNICAMENTE `docs/specs/_proyecto/hallazgos-uat-{feature}.md` y las entradas de bitácora (vía skill). **NUNCA** mutás la spec, el glosario ni el INDEX — las correcciones las aplica `asdd-ba-specification-lead` tras el CR del AF.

## Checklist de salida

- [ ] Cada hallazgo tiene tipo, severidad y origen (IMP marcado provisional)
- [ ] Cada GAP tiene subtipo (INTERNO/EXTERNO); ante duda → EXTERNO
- [ ] Ningún GAP-EXTERNO enrutado a specification-lead sin pasar por scope-control
- [ ] `ALCANCE` separado de defectos — nunca mezclados
- [ ] Hallazgos de área no funcional enrutados a su dueño, no forzados a bitácora funcional
- [ ] `DUDA` que revela ambigüedad escalada a scope-control (`AMBIGÜEDAD`)
- [ ] Tipo de bitácora resuelto por elemento tocado (no por número de sección)
- [ ] `asdd-ba-change-log` activado por cada hallazgo que modifica la spec, con H-NNN y Tipo UAT origen
- [ ] Estado de la spec verificado; si APROBADA, alertado el requisito de CR (SPG-001)
- [ ] No se mutó ningún artefacto ajeno

## Anti-patterns

- **Todo es un defecto** — clasificar `ALCANCE` como `DEF` infla los bugs y distorsiona el scope.
- **Severidad por emoción** — la severidad la determina el impacto en el proceso de negocio, no el tono del stakeholder.
- **Hallazgos sin dueño** — un reporte sin acciones asignadas no produce cambio.
- **Aseverar origen IMP** — declarar que el defecto es de implementación sin la vista de dev/QA. Es provisional.
- **Apropiarse de hallazgos ajenos** — forzar al mapeo funcional un hallazgo de seguridad/backend. Enrutar al dueño del área.
