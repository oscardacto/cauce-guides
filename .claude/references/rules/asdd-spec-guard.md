# SPEC Guard — Control de Cambios Post-Aprobación

Regla de gobernanza transversal (no exclusiva de la capa BA — ver ADR-006 en
`docs/adoption/`). Aplica a todo agente o rol que intente modificar un archivo
de especificación (`docs/specs/*.md`, incluida `{feature}-funcional.md` del
modelo spec-per-área) cuyo campo `Estado` (§ 0) sea `APROBADA`. Formaliza como
guard explícito el mecanismo de CR que `spec-funcional-template.md` ya
documenta inline (§ 15 — Historial de Cambios Post-Aprobación, ADR-004).

## SPG-001: CR obligatorio antes de editar

Cuando un agente o rol necesita modificar una SPEC con `Estado: APROBADA`:

1. **No editar ninguna sección** hasta completar los pasos 2–5.
2. Ir a **§ 15** del documento (Historial de Cambios Post-Aprobación).
3. Registrar la fila del CR: número correlativo, fecha, sección(es) a modificar, resumen del cambio, origen, quién aprueba.
4. Incrementar el campo `Versión` en **§ 0** (1.0 → 1.1, 1.1 → 1.2, etc.).
5. Proceder con la edición de las secciones correspondientes.
6. Agregar el marcador `[CR-NNN]` inline en cada elemento modificado (ver convención en § 15 de la plantilla).
7. Si el agente pertenece a la capa BA: activar `asdd-ba-change-log` con el tipo de cambio según la sección afectada (ver `.claude/reference/ba/asdd-ba-change-log-contract.md`). Fuera de la capa BA, registrar el cambio según la convención de trazabilidad del proyecto (commit, `.asdd-run.json`, o equivalente).

## SPG-002: Declaración antes de editar (agentes)

Todo agente que vaya a editar una SPEC aprobada debe declarar en el chat, antes del primer tool call Edit/Write:

```
MODIFICACIÓN DE SPEC APROBADA
CR: CR-NNN
Sección: {número y nombre — ej. "6 — Reglas de Negocio"}
Origen: {UAT-NNN | bug | decisión de negocio | corrección de error}
Aprobado por: {nombre + rol}
Resumen: {descripción en una línea del cambio}
```

Sin esta declaración, el agente no puede proceder con la edición.

## SPG-002b: Responsabilidad de apertura del CR

El CR no se abre solo. Dependiendo del origen del cambio, la responsabilidad es:

| Origen del cambio | Quién detecta | Quién alerta | Quién abre el CR |
|---|---|---|---|
| Hallazgo UAT (GAP-INTERNO sobre SPEC APROBADA, capa BA) | `asdd-ba-scope-manager` (skill `uat-classifier`) | → AF | **AF** (manualmente, en § Historial de Cambios) |
| Decisión de alcance INCLUIR sobre SPEC APROBADA (capa BA) | `asdd-ba-scope-manager` (skill `scope-control`) | → AF | **AF** (manualmente, en § Historial de Cambios) |
| Corrección detectada durante implementación (ciclo ASDD del equipo) | `asdd-developer-backend` / `asdd-developer-frontend` | → `asdd-producto` | **`asdd-producto`** (manualmente, en § 15) |
| Solicitud directa del negocio o cliente | Cualquier rol | El rol que recibe la solicitud → owner de la spec | **Owner de la spec** (AF o `asdd-producto`, manualmente, en § 15) |

**Protocolo:**
1. El agente que detecta el cambio **no modifica la SPEC** — alerta al owner de la spec (AF en capa BA, `asdd-producto` en el ciclo ASDD del equipo).
2. El owner abre el CR (completa la fila en § 15, incrementa versión en § 0).
3. El agente implementador (`asdd-ba-specification-lead`, `asdd-producto`, u otro) verifica que el CR está registrado en el Historial de Cambios antes de editar.
4. Al completar el cambio, el agente de capa BA activa `asdd-ba-change-log` con el número CR en la descripción; fuera de BA, se registra en el commit/PR correspondiente (GS-005).

## SPG-003: Modificaciones detectadas sin CR

Si se detecta que una SPEC fue modificada sin CR registrado en § 15 (por ejemplo, al revisar git diff):

1. Reportar al AF y al Tech Lead.
2. Identificar el cambio exacto con `git diff docs/specs/{archivo}.md`.
3. Abrir un CR retroactivo con sufijo `-RETRO`: ej. `CR-001-RETRO`, con la misma estructura de la tabla § 15.
4. Registrar en bitácora con tipo `ESTADO` + nota explícita: "modificación sin CR — retroactivo aplicado".

## SPG-004: Sin excepciones

Las siguientes situaciones **no eximen** del proceso de CR:

| Justificación inválida | Razón |
|---|---|
| "Es un cambio mínimo (typo, ortografía)" | Las reglas de negocio son contractuales — cualquier cambio importa |
| "Lo pidió el cliente directamente" | Igualmente requiere CR para trazabilidad |
| "Es urgente" | El registro de CR toma minutos, no días |
| "La spec estaba mal desde el principio" | Usar origen: `corrección-de-error` en el CR |

## Alcance

**Aplica a:** todo agente con acceso Edit/Write sobre `docs/specs/*.md` (incluida `{feature}-funcional.md`); todo rol humano; cualquier proceso automatizado.

**No aplica a:** SPECs en estado `BORRADOR` o `APROBADA CON OBSERVACIONES` (no están selladas para implementación); los templates canónicos (`spec-funcional-template.md`, `spec-template.md` del skill `asdd-producto-templates`) — son plantillas, no specs concretas.

## Relación con otras reglas

- `.claude/reference/ba/asdd-ba-change-log-contract.md` — define qué tipo registrar por sección modificada (capa BA)
- `asdd-ephemeral-artifacts.md` — no aplica (specs son artefactos perennes)
- `asdd-git-safety.md` — GS-003 sigue aplicando: commit de una SPEC modificada requiere autorización del usuario
- ADR-004 «spec-per-area model» — fuente del mecanismo de CR/§15 que esta regla formaliza como guard (vive en el repositorio del template ASDD, no se distribuye)
