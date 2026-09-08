# Spec Backend — binding verificable de autorizaciones de plan

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Solution Architect + Developer de tooling/runtime |
| Prerrequisito | Spec funcional y contrato de seguridad del run 002 |
| Dependencias | `...-004-...-seguridad.md` |
| Output esperado | Estado de autorización, hooks de enforcement y pruebas unitarias |

> Ver `2026-07-17-002-ANALYZE-004-plan-authorization-binding-seguridad.md`
> §11 para el contrato de seguridad. Este slice no lo redeclara.

## 5. Contrato técnico

### Hecho observado

`consumeAuthorization(agent)` recibe solo una cadena y
`asdd-plan-gate.mjs` le pasa únicamente `subagent_type`. Aunque el store
persiste `scope`, `commands`, `plan_hash` y `request_id`, el consumo no los
verifica. La prueba E2E confirmó que un cambio de archivos posterior al plan
continúa pasando el gate.

### Estado mínimo propuesto

Cada entrada conserva `request_id`, `plan_hash`, `agent`, `scope`, `commands`,
`expires_at`, `launch_used_at` y una identidad de ejecución reclamada. La
emisión rechaza tipos de agente duplicados y normaliza arrays antes de hashear.

El consumo se separa en dos operaciones explícitas:

1. `consumeLaunchAuthorization({ agent })`: usado solo por PreToolUse `Agent`;
   exige coincidencia exacta y marca el lanzamiento una vez.
2. `authorizeAgentOperation({ agent_id, agent_type, tool_name, tool_input })`:
   usado por PreToolUse de operaciones sensibles de subagentes. Comprueba
   expiración, tipo, path de `Write`/`Edit` y command de Bash antes de permitir.

La primera operación sensible de una ejecución reclama de forma atómica la
identidad runtime `agent_id`. Un `agent_id` posterior de igual tipo no puede
heredar la entrada. Si el payload de Claude Code no incluye `agent_id` o
`agent_type`, el hook no permite operaciones sensibles.

### Alcance de operaciones

- `Write` y `Edit`: resolver el `file_path` contra la raíz del proyecto y
  compararlo por segmentos de path, no por prefijo textual. Un scope de archivo
  autoriza solo ese archivo; un scope terminado en `/` autoriza descendientes.
- `Bash`: aplicar el binding únicamente a comandos mutantes o de entrega; las
  lecturas allow-listed de subagentes se mantienen fuera del contrato para no
  convertir discovery en un bloqueo. La comparación de comandos sensibles es
  exacta después de la normalización definida en diseño.
- `Agent`: no obtiene permiso para un tipo no listado ni para un segundo
  lanzamiento de la misma entrada.

## 9. Notas de implementación server-side

- Añadir un único hook de autorización de operaciones al matcher existente
  `Edit|Write|Bash`; no registrar un hook global por artefacto.
- El plan-gate conserva `ask` como interacción nativa cuando no existe lote
  ASDD válido. Para una entrada ASDD existente con mismatch, debe fallar cerrado
  y explicar que se requiere un plan nuevo, no caer silenciosamente al `ask`.
- Actualizar en conjunto librería, plan-gate, settings, tests y cualquier
  consumidor de las firmas; no aceptar cambios parciales de API.

## 13. Controles y auditoría

- No registrar el contenido completo de los comandos ni de los archivos.
- Exponer para tests razones estables: `agent-mismatch`, `scope-mismatch`,
  `command-mismatch`, `replay`, `expired`, `missing-runtime-identity`.
- Mantener el almacenamiento bajo `.claude/.runtime/` efímero y no trackeado.

## Criterios de completitud

- [x] Punto de consumo defectuoso identificado.
- [x] Contrato de operaciones separado del lanzamiento.
- [x] Paths y comandos definidos como enforcement, no como metadata pasiva.
- [x] Compatibilidad y fallo cerrado especificados.
