# ASDD Orchestration Routing — núcleo always-on

- **ORC-001-C:** todo agente LIGHT puede escalar. Al recibir
  `ESCALAMIENTO REQUERIDO`, detener ese intento, conservar progreso, registrar
  la causa y reclasificar; no reiniciar ni tratarlo como error.
- **ORC-001-D:** `codebase_size` modifica el scope, no la fase. Usar primero el
  override del lock, luego cache del run y finalmente detección 2-de-3. En
  codebase grande, LIGHT limita lectura y dependencias; scope no resoluble
  escala a FULL. La detección es una vez por run y se checkpointa antes de
  delegar.

## Carga condicional obligatoria

Antes de una ruta LIGHT, detección de tamaño o escalamiento, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-orchestration-routing`
y leé **COMPLETO**
`.claude/references/rules/asdd-orchestration-routing.md`. Sin lectura,
escalá a FULL de forma conservadora.
