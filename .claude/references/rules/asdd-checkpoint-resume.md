# ASDD Checkpoint y Resume

Detalle operacional de la regla **ORC-007** (`asdd-orchestration.md`).
Define cómo el orquestador persiste y recupera el estado del workflow ASDD
en curso a través de `/compact`, `/clear`, errores de API y cierres de sesión.

`.asdd-run.json` en la raíz del proyecto es la **fuente única de verdad** del
estado del workflow. Persiste ante cualquier reset de contexto.

## Al iniciar sesión o tras cualquier reset de contexto

1. Verificar si existe `.asdd-run.json` en la raíz del proyecto.
2. **Si existe y `status ≠ "complete"`** → leer el archivo, presentar resumen
   de estado y proponer retomar. Ejecutar `/asdd:resume`. **No reiniciar
   desde cero.**
3. **Si no existe o `status = "complete"`** → crear nuevo run con
   `run_id: YYYY-MM-DD-NNN`.

## Write-ahead checkpoint (durante el workflow)

Después de que un agente completa una fase, **antes de invocar el siguiente**:

- Marcar la fase como `complete` con timestamp y lista de artefactos
  producidos.
- Registrar `completed_steps` dentro de una fase `in_progress`.
- Actualizar `resume_hint` con la siguiente acción concreta en una línea.
- Escribir `current_phase` en `.asdd-run.json` con el token **en inglés**
  del enum del schema (`.asdd/asdd-run.schema.json`) — nunca el
  nombre de la fase en español usado en las reglas `WF-00x`.

### Mapeo español → inglés de `current_phase` (Bug A ítem A3)

`current_phase` **SIEMPRE** se escribe con el token en inglés del enum del
schema, alineado con las claves de `phases`. Las reglas `WF-00x` nombran las
fases en español (`Especificar`, `Analizar`, `Diseñar`, `Construir`,
`Verificar`, `Documentar`) porque son user-facing; ese nombre nunca se
copia literal al JSON.

| Fase (WF-00x, español) | `current_phase` (schema, inglés) |
|---|---|
| Especificar | `specify` |
| Analizar | `analyze` |
| Diseñar | `design` |
| Construir | `build` |
| Verificar | `verify` |
| Documentar | `document` |

Si `current_phase` está ausente o no matchea el enum (por ejemplo, un skill
legado lo escribió en español), el helper de naming
(`.claude/scripts/asdd-artifact-name.mjs`) y el guard
(`.claude/hooks/asdd-pre-tool-use-artifact-name-guard.mjs`) comparten
la misma lógica de fallback vía `.claude/hooks/_lib/run-phase-resolver.mjs`:
escanean `phases.*.status === "in_progress"` y toman la primera fase válida
encontrada.

## Antes de invocar un agente para una fase

Verificar en `.asdd-run.json` el status de esa fase:

- `complete` → **no reinvocar** — leer sus artefactos directamente, saltar
  al siguiente paso.
- `in_progress` → leer `completed_steps` y `pending_steps`, continuar desde
  el primer paso pendiente.
- `pending` → invocar normalmente.

## Ante `/compact`, `/clear`, error de API o agotamiento de tokens

`.asdd-run.json` persiste en disco. Al retomar:

1. Ejecutar `/asdd:resume` — reconstruye contexto mínimo desde
   artefactos ya producidos.
2. **No releer** archivos ya procesados en fases `complete`.
3. Consultar `asdd-meta` solo si el contexto a cargar supera el 50%.

Ver schema del state file en `.asdd/asdd-run.schema.json`.
