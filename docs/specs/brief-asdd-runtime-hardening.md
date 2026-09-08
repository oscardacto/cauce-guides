# Brief: Hardening de rendimiento, contexto y seguridad del runtime ASDD

**Proyecto:** project-structure / Sofka ASDD  
**Fecha:** 2026-07-17  
**Owner:** Maintainers de Sofka ASDD

## ¿Qué construimos?

Evolucionaremos el runtime agéntico de ASDD para reducir latencia, consumo de contexto y compactaciones sin degradar sus controles de gobernanza. El cambio incorpora routing proporcional a la complejidad, carga de capacidades bajo demanda, presupuestos verificables, aprobación vinculada al plan, estado reconciliable e instrumentación y pruebas adversariales.

## ¿Para quién?

- Equipos consumidores del template ASDD que ejecutan tareas cotidianas con Claude Code.
- Maintainers que necesitan prevenir regresiones de contexto, routing y seguridad.
- Auditores que requieren evidencia verificable de aprobación, estado y enforcement.

## Restricciones conocidas

- Plazo: entrega incremental; cada slice debe ser revertible y medible.
- Regulaciones: no se introduce un régimen regulatorio específico; aplican secure-by-default, least privilege y trazabilidad.
- Dependencias: runtime de Claude Code, hooks Node.js sin dependencias externas y contrato de distribución de Sofka ASDD.
- Restricciones técnicas:
  - No forzar Opus para compensar prompts sobredimensionados.
  - Mantener compatibilidad con macOS, Linux y Windows.
  - No retirar una rule del auto-load sin lector explícito y prueba anti-orfandad.
  - No relajar gates destructivos para obtener rendimiento.
  - Los cambios deben poder adoptarse progresivamente.
  - La referencia inicial de medición es ASDD v2.27.4 en `dev`.

## Dominio

general — plataforma interna de ingeniería agéntica.

## Objetivos y resultados esperados

- Reducir el tiempo de primera acción de consultas y cambios atómicos.
- Reducir el piso de contexto heredado por cada subagente.
- Evitar cargar skills ajenas a la fase activa.
- Hacer que toda aprobación sensible sea específica, verificable y de uso único.
- Reconciliar estado declarado con Git y artefactos versionados.
- Impedir regresiones mediante budgets y evals en CI.
- Eliminar confirmaciones repetidas para pasos ya cubiertos por un plan aprobado.
- Permitir corrección en caliente trabajando sobre la rama actual cuando no existe paralelismo real.

## Alcance funcional

1. Routing `TRIVIAL/LIGHT/MEDIUM/FULL` por profundidad y dominio.
2. Carga de skills y referencias bajo demanda.
3. División de agentes monolíticos por fase.
4. Reducción de rules always-on e instrucciones duplicadas.
5. Consolidación posterior de hooks mediante dispatcher por evento.
6. Aprobación vinculada al hash del plan, scope, agente y comandos.
7. Integridad y reconciliación de archivos de estado.
8. Escape hatches temporales, explícitos y auditables.
9. Presupuestos de contexto y métricas de runtime.
10. Evals funcionales, de rendimiento y adversariales.
11. Worktree opt-in: solo por solicitud explícita o paralelismo real con scopes disjuntos.
12. Aprobación de plan como aprobación del lote completo, preservando preguntas genuinas de conocimiento.
13. Documentación de permisos nativos de Claude Code, separándolos de la ceremonia ASDD.
14. Investigación del posible incumplimiento GS-003 antes de modificar la regla de commits.

## Fuera de alcance

- Reescribir la metodología Spec First o eliminar los gates críticos.
- Cambiar el proveedor de modelos o alojar modelos propios.
- Corregir vulnerabilidades exclusivas de plugins Mason inexistentes en este repositorio.
- Corregir los bugs de instalador/collector H12-H13, que pertenecen a otro repositorio.
- Cambiar pipelines de producto de los consumidores.
- Optimizar código de aplicaciones generadas por ASDD.

## Roles técnicos requeridos

- [x] Architect — cambia la arquitectura de orquestación, hooks y carga contextual.
- [x] Security — cambia el modelo de aprobación, confianza y escape hatches.
- [x] Tech Lead — requiere estimación, releases incrementales y control de breaking changes.

## Artefactos de salida

- `docs/specs/brief-asdd-runtime-hardening.md`
- Set spec-per-área del run `2026-07-17-001`.
- ADR de arquitectura para evolución incremental del runtime.
- Implementación, tests y mediciones por slice.

## Fuentes de diagnóstico

- Auditoría interna y plan R4–R7 del 2026-07-07.
- Contraste de seguridad con los audits de Mason del 2026-06-17.
- Diagnóstico de fricción de usuario `2026-07-14-diagnostico-friccion-asdd.md`: sesiones de aproximadamente 3 h, 1 h, 2 h y 15 min; confirma que la fricción acumulativa proviene principalmente de confirmaciones repetidas, routing eager y worktree por defecto.
