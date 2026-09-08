---
description: Fase Documentar — consolida la documentación final del ciclo, con arquitectura, APIs, decisiones y guías.
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

Ejecutar la fase **Documentar** del workflow ASDD.

## Prerequisito

Todos los sign-offs de `/asdd:verify` deben estar emitidos. No documentar trabajo no verificado.

## Instrucciones

1. Invocar `@asdd-tech-lead` para consolidar estándares, guías técnicas y decisiones del ciclo en `docs/tech/`.
2. Invocar `@asdd-solution-architect` para actualizar la documentación de arquitectura: ADR index, diagramas C4, contratos API en estado final.
3. Incluir `developer` como soporte para docs técnica de APIs, módulos y configuración.
4. Verificar que `docs/` refleja el estado real del sistema — eliminar docs obsoletas o marcarlas como deprecadas.

## Artefactos esperados

- `docs/architecture/` actualizado — ADR index, C4 final
- `docs/tech/` actualizado — estándares y guías del ciclo
- API docs en estado final (`docs/architecture/contracts/`)
- Changelog técnico del ciclo
- Guías de uso y operación si aplica

## Cierre de ciclo

Con esta fase completa, el ciclo ASDD está cerrado. El siguiente ciclo comienza con `/asdd:specify`.
