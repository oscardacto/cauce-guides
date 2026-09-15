---
name: asdd-single-active-run-limitation
description: El framework ASDD no puede suspender un run in_progress para abrir uno nuevo, y el guard de Write en docs/** no admite naming legado para escritura nueva — juntos bloquean documentar hallazgos de gobernanza que surgen en medio de un feature no relacionado.
type: reference
---

Dos hallazgos relacionados, encontrados el 2026-09-15 al intentar archivar un ADR de gobernanza (rename sofka-asdd- a asdd-, hallazgos de la capa de verificación) en medio de un run activo (2026-07-28-001) que pertenece a un feature no relacionado (functional-agents-producto-integration).

**Hallazgo 7 — sin suspensión de run:** `asdd-run-bootstrap.mjs` solo crea un run nuevo si `.asdd-run.json` no existe o el run activo tiene `status: complete`. No existe ningún script que archive o suspenda un run `in_progress` para abrir uno paralelo. Marcarlo `complete` a mano sería falso (el run seguía en `analyze`, con 4 pasos pendientes y un `resume_hint` para un equipo receptor).

**Hallazgo 8 — el guard de naming no admite legado en escritura nueva:** `asdd-pre-tool-use-artifact-name-guard.mjs` (vía `asdd-pre-tool-dispatcher.mjs`) deniega con `PreToolUse` cualquier `Write` bajo `docs/**` cuyo basename no siga `{run_id}-{PHASE}-{SEQ}-{slug}.{ext}`. La única exención es `smart-data-eng-*`. No hay rama de código que permita el patrón legado `ADR-{NNN}-{titulo}.md` para un archivo nuevo, aunque la documentación de naming lo describe como válido para archivos existentes — la ambigüedad entre "legado aceptado" y "legado nunca para creación nueva" se resuelve en el guard a favor de lo segundo, sin excepción.

**Combinados:** un ADR de gobernanza que surge en medio de un feature no relacionado no tiene, hoy, ninguna ruta de archivo legítima — ni bajo el run activo (contamina su historia), ni como archivo legado (el guard lo bloquea), ni abriendo un run nuevo (no hay mecanismo de suspensión).

**Estado del ADR-023 (verificadores que declaran ok sin haber evaluado):** redactado, revisado y aprobado en conversación. Sin archivo en el repositorio — pendiente de una ruta legítima. No se fuerza con un bypass del guard (sin auditoría en PreToolUse) ni se archiva bajo el run equivocado.

**Qué falta:** un mecanismo real de suspensión/pausa de run, o una vía de naming legítima para artefactos de gobernanza que no pertenecen a ningún run activo. Ninguno de los dos existe hoy.
