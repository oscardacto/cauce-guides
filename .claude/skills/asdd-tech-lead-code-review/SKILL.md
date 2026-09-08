---
name: asdd-tech-lead-code-review
description: Revisa código contra estándares, naming y patrones del proyecto, con severidad explícita por comentario.
---

## Rol

Revisor de código. Evalúa calidad, adherencia a estándares y correctitud técnica de cambios en el codebase.

## Cuándo activar

- PR abierto o código nuevo/modificado listo para revisión
- Antes de mergear cualquier cambio a la rama principal
- Fases: **Analizar, Diseñar, Build, Verificar** (transversal)

## Proceso

1. Leer el diff o los archivos modificados
2. Evaluar contra los estándares del proyecto (`CLAUDE.md`, reglas en `.claude/docs/clean-code-solid.md` y `.claude/rules/asdd-git-safety.md`)
3. Clasificar cada hallazgo por severidad
4. Producir el reporte de review

## Criterios de evaluación

| Dimensión | Qué revisar |
|---|---|
| Naming conventions | Variables, funciones, clases, archivos siguen el patrón del proyecto |
| Adherencia a patrones | El código sigue la arquitectura y patrones definidos en ADRs |
| Legibilidad | Funciones cortas, responsabilidad única, sin lógica oculta |
| Seguridad básica | Sin secrets hardcodeados, inputs validados en boundaries |
| Tests | Cambios de comportamiento tienen cobertura de test asociada |

## Reglas core aplicadas

Las siguientes reglas de `.claude/rules/` son criterios de evaluación obligatorios en todo review.

### SOLID (`.claude/docs/clean-code-solid.md`)

| Principio | Qué verifica el reviewer |
|---|---|
| **SRP** | Cada clase, componente o hook tiene una sola razón para cambiar |
| **OCP** | La extensión se hace por composición/props/variantes — no modificando código existente |
| **LSP** | Las implementaciones de una interfaz son intercambiables sin romper el contrato |
| **ISP** | Las interfaces son pequeñas y enfocadas — no hay métodos no usados por los implementadores |
| **DIP** | La capa de dominio depende de abstracciones (puertos); la infraestructura las implementa |

### Clean Code (`.claude/docs/clean-code-solid.md`)

- **Naming descriptivo** — mínimo 3 caracteres, revela intención (variables, funciones, clases)
- **Funciones cortas** — complejidad ciclomática ≤ 10; referencia de longitud: ≤ 30 líneas para lógica pura
- **DRY** — 3+ repeticiones del mismo bloque → extraer abstracción
- **Guard clauses** — nesting máximo 2 niveles; early returns sobre if/else anidados
- **Sin magic numbers/strings** — literales con significado deben estar en constantes nombradas
- **Sin dead code** — sin código comentado, variables sin uso, ramas inalcanzables

### Git Safety (`asdd-git-safety.md`)

- **GS-004 — Naming de ramas** — prefijos válidos: `feature/`, `fix/`, `hotfix/`, `chore/`, `refactor/`, `test/`, `docs/` + descripción en kebab-case; máximo 60 caracteres
- **GS-005 — Conventional commits** — todo commit usa prefijo convencional: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`; scope opcional entre paréntesis

## Severidades

| Nivel | Significado | Acción requerida |
|---|---|---|
| **blocker** | Impide el merge — bug, violación crítica de patrón, seguridad | Debe resolverse antes de mergear |
| **major** | Deuda técnica significativa o incumplimiento de estándar | Debe resolverse o acordar ticket de seguimiento |
| **suggestion** | Mejora de legibilidad o estilo, no crítica | El autor decide |

## Outputs

- `docs/tech/{run_id}-{PHASE}-{SEQ}-review-{PR-id}.md` — reporte con hallazgos clasificados por severidad. El nombre lo devuelve
  `node .claude/scripts/asdd-artifact-name.mjs --phase {fase} --slug review-{PR-id}` (ART-001, enforzado por el guard de naming y por el hook nativo `pre-commit`)
- Comentarios inline si el contexto es un diff específico

## Cuándo NO invocar

- No hay diff/PR concreto para revisar — el code review necesita un cambio puntual; auditoría general del codebase es `tech-lead-refactoring-plan`.
- Se busca decisión sobre métricas de calidad pre-merge (cobertura, complejidad) — usar `tech-lead-quality-gate`.
- Se busca evaluación de seguridad — escalar a `security-code-scan`.


## Anti-patterns

- **Review por estilo personal** — "yo lo hubiera escrito así". Si no viola estándar del proyecto ni introduce bug, es opinión, no review. Marcar como `suggestion` (no `blocker` ni `major`).
- **Aprobar sin leer el diff** — "LGTM" en un PR de 800 líneas. Si el PR es demasiado grande para revisar a fondo, exigir que se divida.
- **Bloquear sin alternativa** — "este código es feo" sin proponer mejora concreta. Cada `blocker` debe incluir el "qué hacer en su lugar".
- **Ignorar tests del PR** — el code review incluye verificar que los tests cubren el cambio, no solo que el código compila. PR sin tests adicionales para lógica nueva → blocker.

