# Spec QA — regresiones de binding de autorizaciones de plan

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | QA de runtime/tooling |
| Prerrequisito | Specs funcional, backend y seguridad del run 002 |
| Dependencias | backend y seguridad |
| Output esperado | Harnesses deterministas sin red y evidencia E2E controlada |

## 7. RNFs de calidad

- Tests deterministas con directorio runtime temporal y limpieza garantizada.
- Sin red, sin comandos destructivos y sin depender de un agente real.
- Cobertura de allow, ask y deny de cada hook modificado.
- Compatibilidad de paths POSIX/Windows y espacios en paths de fixture.

## 10. Escenarios de aceptación

```gherkin
Scenario: El lote autorizado permite al agente y sus operaciones exactas
  Given un plan canónico con un único agente, scope y comando sensible
  And un challenge vigente aprobado por el usuario
  When se lanza ese agente y opera sobre el path y comando declarados
  Then el runtime permite las operaciones
  And la entrada de lanzamiento no puede reutilizarse

Scenario: Un scope distinto no hereda la aprobación
  Given un plan aprobado para `.claude/hooks/a.mjs`
  When el agente intenta editar `.claude/scripts/lib/a.mjs`
  Then el hook rechaza con `scope-mismatch`
  And no cae a una aprobación genérica

Scenario: Un comando extendido no hereda la aprobación
  Given el plan autoriza `node .claude/scripts/test-plan-gate-hook.mjs`
  When el agente propone ese comando seguido de un segundo comando mutante
  Then el hook rechaza con `command-mismatch`

Scenario: Un segundo agente no reclama una entrada usada
  Given el primer `agent_id` ya reclamó la autorización del tipo aprobado
  When otro `agent_id` del mismo tipo intenta editar
  Then el hook rechaza con `runtime-identity-mismatch`

Scenario: Datos de hook incompletos fallan cerrados
  Given existe una autorización ASDD vigente
  When una escritura no contiene agent_id, agent_type o file_path
  Then el hook no permite la operación sensible

Scenario: La autorización de lanzamiento no cubre git commit
  Given un lote ASDD aprobado
  When el agente intenta `git commit`
  Then GS-003 continúa solicitando su challenge separado
```

## Criterios de done

- La suite de librería cubre emisión, duplicados, consumo único, expiración y
  comparación de scope/comandos.
- La suite de hooks cubre payloads reales/representativos de `Agent`, `Edit`,
  `Write` y Bash con `agent_id`/`agent_type`.
- Las suites existentes de ORC, guards Git y `validate-template` siguen verdes.
- Un E2E manual en la copia temporal verifica que cambiar un archivo declarado
  obliga a presentar y aprobar un plan nuevo.
