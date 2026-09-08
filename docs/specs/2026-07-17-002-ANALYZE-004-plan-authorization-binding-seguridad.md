# Spec Seguridad — autorización de plan vinculada a ejecución

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Security |
| Prerrequisito | Brief y spec funcional del run 002 |
| Dependencias | Ninguna |
| Output esperado | Contrato de seguridad y casos de abuso para la remediación |

## 11. Seguridad

### Fronteras de confianza

| Fuente | Confianza | Uso permitido |
|---|---|---|
| Evento de hook de Claude Code | Alta para identidad/tool metadata disponible | Asociar ejecución y aplicar enforcement. |
| Challenge y authorization store efímeros | Limitada | Solo tras schema/expiración y validaciones locales. |
| Plan mostrado al usuario | Intención aprobable | Su hash define la entrada, no sustituye la verificación al ejecutar. |
| Texto de agente, repo, web o logs | No confiable | Nunca define agente, scope o comando autorizado. |

### Contrato de autorización

Una entrada autorizada debe enlazar de manera inmutable:

- `request_id` y `plan_hash` canónico;
- `agent` único en el plan;
- `scope[]` y `commands[]` normalizados;
- expiración y nonce;
- estado de lanzamiento único y, tras la primera operación sensible, la
  identidad runtime `agent_id` reclamada.

Reglas obligatorias:

1. La aprobación `ok` solo puede materializar el challenge activo y vigente.
2. La entrada no se selecciona por "primer agente libre": tipo y contexto deben
   coincidir exactamente.
3. El lanzamiento consume una vez; repetirlo es replay.
4. `Write`/`Edit` compara la ruta canonizada contra el scope aprobado.
5. Bash sensible compara el comando normalizado contra la lista aprobada.
6. Un mismatch explícito no degrada a una autorización nativa genérica: se
   rechaza y pide un plan/challenge nuevo.
7. Ausencia de `agent_id`, `agent_type`, path o command donde se requieren es
   fail-closed.
8. El mecanismo no autoriza `git commit`, escapes hatches ni cambios de
   settings de Claude Code.

### Casos de abuso

| ID | Abuso | Resultado requerido |
|---|---|---|
| AB-001 | Reutilizar la autorización para lanzar el mismo tipo de agente | Rechazo `replay`. |
| AB-002 | Lanzar otro tipo de agente | Rechazo `agent-mismatch`. |
| AB-003 | Editar `lib/x.mjs` cuando se aprobó `hooks/x.mjs` | Rechazo `scope-mismatch`. |
| AB-004 | Usar path con `..`, prefijos engañosos o symlink | Resolver/canonizar y rechazar fuera de raíz/scope. |
| AB-005 | Ejecutar `npm test; rm -rf ...` con aprobación solo de `npm test` | Rechazo `command-mismatch`. |
| AB-006 | Mismo tipo con otro `agent_id` después de reclamar la ejecución | Rechazo `runtime-identity-mismatch`. |
| AB-007 | Estado vencido, inválido o incompleto | Rechazo fail-closed. |

### Fuera de alcance deliberado

La firma HMAC del store, cambio de TTL y token visible de confirmación requieren
un threat model propio y no se mezclan con este arreglo. El origen humano de
`ok` sigue siendo UserPromptSubmit; esta remediación evita que ese `ok` se
expanda a operaciones distintas de su plan.

### Criterios de completitud

- [x] Límite de confianza y propiedades fail-closed definidos.
- [x] Casos de replay, path traversal y command injection definidos.
- [x] La brecha E2E trazada a controles verificables.
