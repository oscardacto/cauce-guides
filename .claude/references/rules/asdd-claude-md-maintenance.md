# CLAUDE.md Maintenance — Gobernanza

## Qué va en CLAUDE.md

**SÍ:** propósito del módulo, páginas/rutas principales, componentes clave, aggregates, domain events, reglas de negocio críticas, comandos de build/test.
**NO:** procedimientos paso-a-paso (→ skills), reglas de código detalladas (→ `.claude/rules/`), ejemplos extensos (→ `.claude/docs/`).

Presupuesto: 200 líneas por archivo (`claude-md-size` en `validate-template.mjs`, `warn`). Si crece más → partir en docs específicos bajo `.claude/docs/`.

## Responsabilidad

| Nivel | Quién actualiza | Cuándo |
|---|---|---|
| Raíz del proyecto | Usuario / Tech Lead | Cambios en stack, convenciones, módulos |
| Módulo | `asdd-developer-frontend` / `asdd-developer-backend` (implementador) | Ver triggers abajo — mismo commit |

## Triggers obligatorios (mismo commit que el cambio)

Al añadir o renombrar cualquiera de los siguientes → actualizar el `CLAUDE.md` del módulo afectado:

- **Frontend:** páginas nuevas, componentes con lógica de negocio, hooks custom significativos, stores de estado global.
- **Backend:** Aggregates, Value Objects significativos, Domain Events, enums/status públicos, controllers con endpoints nuevos, reglas de negocio nuevas.

Cambios cross-module (≥ 3 módulos) o renombrado/mudanza entre módulos → invocar `asdd-tech-lead` (skill: quality-gate) ANTES del merge.

## Cadencia de auditoría

- **Post-feature** (automático): `asdd-tech-lead` (skill: refactoring) revisa archivos tocados.
- **Quincenal**: auditoría de drift en módulos del sprint con `asdd-tech-lead`.
- **Pre-release**: OBLIGATORIO auditoría completa + fixes aplicados.

## Anti-patrones prohibidos

- CLAUDE.md > 200 líneas → mover detalle a `.claude/docs/`.
- Ejemplos de código en CLAUDE.md → solo referencias a archivos o docs.
- Duplicar información entre raíz y módulo → jerarquizar (raíz para lo transversal, módulo para lo local).
- Commit de código sin actualizar CLAUDE.md del módulo si aplica un trigger.
