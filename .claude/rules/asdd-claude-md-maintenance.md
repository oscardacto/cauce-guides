# CLAUDE.md Maintenance — núcleo always-on

**SÍ va:** propósito del módulo, rutas y componentes clave, aggregates, domain
events, reglas de negocio críticas, comandos de build y test. **NO va:**
procedimientos paso a paso (skills), reglas de código detalladas
(`.claude/rules/`), ejemplos extensos (`.claude/docs/`).

- **Triggers obligatorios** — en el mismo commit que el cambio, actualizar el
  CLAUDE.md del módulo al agregar o renombrar páginas, componentes con lógica,
  hooks o stores globales; aggregates, value objects, domain events, enums
  públicos, endpoints o reglas de negocio. Cambios en ≥3 módulos o mudanzas entre
  módulos pasan por `asdd-tech-lead` antes del merge.
- **Anti-patrones prohibidos:** ejemplos de código embebidos, duplicar entre raíz y
  módulo, y commitear sin actualizar el CLAUDE.md que un trigger exige. Presupuesto
  de tamaño: 200 líneas (`claude-md-size` en `validate-template.mjs`, `warn`).

## Carga condicional obligatoria

Antes de auditar drift de CLAUDE.md o cerrar un feature que dispare un trigger, ejecutá
`node .claude/scripts/asdd-resolve-rule.mjs asdd-claude-md-maintenance` y leé **COMPLETO**
`.claude/references/rules/asdd-claude-md-maintenance.md`. Si el resolver o la lectura fallan: STOP, sin cerrar el feature.
