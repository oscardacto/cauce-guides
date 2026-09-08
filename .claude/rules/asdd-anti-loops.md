# Anti-Loop — núcleo always-on

**AL-001..AL-008** son el contrato universal de Circuit-Breaker:

- Máximo dos ciclos de corrección por el mismo fallo; después STOP y escalar.
- No releer archivos ni repetir búsquedas/tests sin nueva hipótesis o cambio.
- Tests completos una vez por checkpoint; preferir focales durante iteración.
- Dos fallos de compilación exigen diagnóstico; dos quiebres de refactor exigen
  rollback o autorización.
- Agentes independientes se lanzan juntos solo si existe plan autorizado y no
  comparten estado mutable.
- Mantener progreso/checkpoints visibles y presupuestos de turnos/reintentos.
- Si el contexto pierde coherencia, checkpoint y compactación; nunca continuar
  inventando estado.

## Carga condicional obligatoria

Antes del primer retry, relanzamiento de agente, ejecución repetida de tests,
compactación o trabajo paralelo, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-anti-loops` y leé
**COMPLETO** `.claude/references/rules/asdd-anti-loops.md`.
Si no puede leerse, no repetir la acción.
