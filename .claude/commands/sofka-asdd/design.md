---
description: Fase Diseñar — solución técnica y visual, con ADRs, diagramas de arquitectura y wireframes.
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

Ejecutar la fase **Diseñar** del workflow ASDD.

## Prerequisito

Debe existir un spec validado de `/sofka-asdd:analyze`. Sin spec aprobado no se diseña.

## Instrucciones

1. Invocar `@sofka-asdd-solution-architect` para generar ADRs, diagramas C4 y contratos API a partir del spec.
2. Si hay UI en scope, invocar `@sofka-asdd-ux` (wireframes mid-fi) y `@sofka-asdd-ui` (component specs) en paralelo.
3. Incluir como soporte según necesidad:
   - `researcher` — si se necesitan benchmarks o matrices de decisión para fundamentar ADRs
   - `domain-expert` — para validar que el diseño respeta las reglas de negocio del dominio
   - `tech-lead` — para verificar viabilidad técnica y coherencia con estándares
   - `security` — para decisiones de arquitectura con impacto en seguridad
4. Todo ADR debe estar aprobado antes de pasar a Construir.

## Artefactos esperados

- Rutas DESIGN reservadas antes del plan en `docs/architecture/decisions/`,
  con slugs `adr-{NNN}-{titulo}` y basename universal.
- `docs/architecture/diagrams/` — diagramas C4 en Mermaid
- `docs/architecture/contracts/` — OpenAPI / AsyncAPI
- Wireframes (de `@sofka-asdd-ux`) y component specs (de `@sofka-asdd-ui`)

## Siguiente paso

Con todos los ADRs aprobados → `/sofka-asdd:build`
