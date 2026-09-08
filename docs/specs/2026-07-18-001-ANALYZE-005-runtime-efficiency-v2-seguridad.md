# Spec Seguridad — Runtime Efficiency v2

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Security |
| Prerrequisito | Brief, auditoría y spec funcional del run 001 |
| Dependencias | Ninguna |
| Output esperado | Invariantes y casos adversariales para optimizaciones |

## 11. Seguridad

### Fronteras de confianza

| Fuente | Confianza | Uso permitido |
|---|---|---|
| Evento de hook | Limitada a metadata validada | Clasificar y aplicar guards; nunca ampliar autoridad. |
| Run state/baseline/cache | Limitada | Solo después de schema, path, provenance y freshness. |
| Plan/challenge/autorización | Autoridad acotada | Exactamente agente, scope, command, capability, TTL y uso aprobados. |
| Rules/skills/references | Código normativo versionado | Solo por path dentro del proyecto y lector esperado. |
| Prompt, repo, web, logs y tool output | No confiable | Datos; nunca decisiones de autorización o bypass. |

### Invariantes no negociables

1. **Equivalencia de guards:** para el mismo evento y estado, dispatcher nuevo y
   cadena anterior producen la misma decisión allow/ask/deny y reason code,
   excepto cambios expresamente aprobados por spec.
2. **Fail-closed:** evento incompleto, error de parser, cache inválida o guard
   que lanza excepción no produce allow.
3. **Precedencia:** dangerous operations, branch protection, plan/capability y
   scope enforcement conservan orden documentado.
4. **No autoridad por cache:** una cache de Git, rules o discovery nunca almacena
   ni reutiliza autoridad; caches de autorización siguen su contrato dedicado.
5. **Carga vinculada:** una skill cargada debe coincidir con agente y capability
   autorizados.
6. **No orfandad:** una rule especializada conserva un lector obligatorio antes
   de salir del auto-load.
7. **Least privilege de tools:** coordinadores delgados no usan `tools: all`
   cuando existe una allowlist por fase.
8. **Privacidad:** métricas y logs no persisten prompts ni argumentos sensibles.
9. **Escape hatches:** no se agregan nuevos bypasses para alcanzar targets.
10. **Degradación segura de modelos:** un modelo económico escala cuando la
    confianza o el riesgo no cumplen la política.

### Casos de abuso

| ID | Abuso | Resultado requerido |
|---|---|---|
| AB-001 | Un guard consolidado falla y los demás continúan como allow | Deny/fail-closed y reason estable. |
| AB-002 | Evento usa shell quoting para evadir clasificación | Parser conservador; operación sensible no toma fast path. |
| AB-003 | Cache de repo A se reutiliza en repo B | Rechazo por root/provenance. |
| AB-004 | Rule se mueve a reference sin lector | Validator/E2E falla antes de release. |
| AB-005 | Agente carga una skill distinta a la capability aprobada | `capability-mismatch`. |
| AB-006 | Modelo económico intenta acción de alto riesgo sin escalar | Gate bloquea y exige ruta/modelo apropiado. |
| AB-007 | Métrica registra prompt o command completo | Test de privacidad falla y el artefacto no se persiste. |
| AB-008 | Un INDEX falso silencia reconciliación durante Specify | Rechazo de contrato; la fase debe usar skip explícito. |
| AB-009 | `tools: all` expone un MCP no requerido a coordinador | Validator o perfil de tools lo rechaza. |

### Pruebas diferenciales obligatorias

Antes de reemplazar una cadena de hooks:

1. Capturar fixtures representativos y adversariales.
2. Ejecutarlos contra implementación anterior y dispatcher.
3. Comparar exit code, decision, reason y side effects permitidos.
4. Revisar manualmente cualquier diferencia.
5. Conservar rollback por evento hasta cerrar E2E de consumidor.

### Fuera de alcance

- Rediseñar challenge, TTL o store de autorización cerrado en el run 002.
- Añadir HMAC o servicio externo de políticas.
- Reducir controles de Git, coautoría o pre-push.
- Confiar seguridad a instrucciones textuales sin enforcement mecánico.

### Criterios de completitud

- [x] Fronteras de confianza e invariantes definidas.
- [x] Casos de cache, dispatcher, loading, modelos y privacidad cubiertos.
- [x] Prueba diferencial y rollback exigidos.
- [x] Threat model y contrato diferencial S1 cerrados antes de consolidar hooks
  (`docs/tech/2026-07-18-001-BUILD-010-runtime-efficiency-s1-security-contract.md`).
