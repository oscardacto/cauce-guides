# Brief: ASDD Runtime Efficiency v2

**Proyecto:** project-structure / Sofka ASDD  
**Fecha:** 2026-07-18  
**Owner:** Maintainers de Sofka ASDD  
**Run:** `2026-07-18-001`

## ¿Qué construimos?

Evolucionaremos el runtime ASDD para reducir su costo mecánico y contextual
remanente después del hardening de los runs `2026-07-17-001` y
`2026-07-17-002`. La iniciativa corregirá primero la medición efectiva y luego
optimizará hooks, contexto always-on, carga de skills, coordinadores y selección
de modelos sin degradar seguridad, autorización, trazabilidad ni routing.

## ¿Para quién?

- Equipos consumidores que necesitan menor tiempo de primera acción y sesiones
  más largas antes de compactar.
- Maintainers que necesitan presupuestos reales, repetibles y bloqueantes.
- Autores de agentes y skills que necesitan límites claros de contexto,
  capabilities y turnos.
- Auditores que requieren demostrar que las optimizaciones no relajan controles.

## Problema y evidencia

La auditoría
`docs/tech/2026-07-18-001-SPECIFY-001-runtime-performance-audit.md`
encontró:

- 16.973 palabras always-on.
- 145 palabras repetidas por prompt normal.
- siete procesos Node por `Bash` y ocho por `Write/Edit`.
- un gate que no cuenta skills declaradas como arrays YAML inline.
- payloads iniciales de 20.351 palabras para Tech Lead, 18.472 para UI y
  14.111 para Solution Architect, sin sumar contexto global.
- un coordinador ATF Web de 10.679 palabras con `tools: all`.
- un modelo global Opus aunque existe routing por fase.

La línea base procesable vive en
`docs/baselines/asdd-runtime-baseline-v2.json`.

## Objetivos y resultados esperados

1. Medir el contexto efectivo sin falsos mínimos.
2. Reducir procesos y lecturas repetidas por tool call.
3. Reducir el contexto global sin dejar reglas huérfanas.
4. Cargar solo la capability necesaria para la tarea activa.
5. Reducir el tamaño inicial de coordinadores sin perder invariantes.
6. Usar modelos proporcionales a complejidad y riesgo.
7. Limitar fan-out, turnos y reintentos de subagentes.
8. Impedir regresiones mediante benchmarks, evals y E2E de consumidor.

## Alcance funcional

1. Parser YAML correcto para skills en bloque e inline.
2. Métrica de contexto efectivo:
   `global + agent + skills + command + hook injection`, dejando tool schemas
   como campo explícitamente no medido hasta disponer de telemetría.
3. Dispatcher consolidado por evento `PreToolUse`.
4. Fast paths que eviten Git, filesystem scans y parsing no aplicables.
5. Inyección ORC compacta y condicional.
6. Reducción segura de rules always-on siguiendo ADR-005.
7. Lazy skills para Tech Lead, UI, Solution Architect, Producto, UX y DevOps.
8. Coordinadores delgados para ATF Web y BA Descomponedor.
9. Modelo económico para orquestación y escalamiento por fase/riesgo.
10. Presupuesto por ruta para subagentes, turnos, reintentos y concurrencia.
11. Sincronización automática de inventarios para reducir drift documental.
12. Baseline antes/después y gates de no regresión.
13. Reconciliación consciente de fase: no exigir INDEX durante Specify y
    exigirlo desde el cierre de Analyze.

## Fuera de alcance

- Reabrir o reescribir los runs cerrados `2026-07-17-001` y
  `2026-07-17-002`.
- Relajar plan authorization, GS-003, protección de ramas o dangerous Bash.
- Rediseñar la lógica funcional de ATF API, ATF Web o Smart Data.
- Modularizar el instalador/CLI y distribuir addons por perfiles; será una
  iniciativa separada.
- Activar CI externo. Este template declara validación local; una integración
  externa requiere alcance explícito posterior.
- Cambiar de proveedor de modelos.

## Restricciones conocidas

- **Plazo:** entrega incremental por slices pequeños, medibles y revertibles.
- **Regulaciones:** no aplica una regulación sectorial; sí aplican least
  privilege, secure-by-default, trazabilidad y fail-closed.
- **Dependencias:** Claude Code, Node.js, contrato del template, lock ASDD,
  hooks y formato de frontmatter de agentes/skills.
- **Compatibilidad:** macOS, Linux y Windows.
- **Medición:** los targets del baseline v2 son provisionales hasta completar un
  spike repetible con p50/p95.
- **Seguridad:** el dispatcher no puede cambiar el orden ni la semántica de los
  guards sin spec y pruebas adversariales.
- **Carga condicional:** ninguna rule o skill puede salir del contexto inicial
  si no existe un lector/resolver verificable y prueba anti-orfandad.
- **Estado:** caches y autorizaciones deben conservar binding de agente, scope,
  comando, capability, TTL y uso.

## Criterios de éxito provisionales

| Métrica | Base | Objetivo inicial |
|---|---:|---:|
| Contexto always-on | 16.973 palabras | ≤6.000 |
| Inyección normal por prompt | 145 palabras | ≤40 o 0 |
| Procesos ASDD PreToolUse | 7–8 | 1; telemetría y hooks ajenos excluidos |
| Fast path puntual de hooks | ~142 ms | ≤50 ms |
| Skills eager por agente | hasta 13 | 0–1 |
| Tech Lead inicial | 20.351 palabras | ≤8.000 |
| ATF Web coordinador | 10.679 palabras | ≤2.500 |
| Subagentes en TRIVIAL | 0 | 0 |
| Regresiones de seguridad/routing | 0 conocidas | 0 |

Los valores definitivos se fijarán en Analyze/Design después del spike.

## Dependencias y antecedentes

- Run `2026-07-17-001`: runtime hardening original.
- Run `2026-07-17-002`: binding de autorizaciones y lazy capabilities de
  developers.
- ADR-005: carga condicional de rules.
- ADR-015: binding de autorización en operaciones.
- `.sofka-asdd/context-budget.json`: límites estructurales actuales.
- `docs/baselines/asdd-runtime-baseline.json`: gate anterior.

## Riesgos principales

| Riesgo | Mitigación esperada |
|---|---|
| Rule huérfana al reducir auto-load | Lector explícito + test de integridad + E2E consumidor |
| Dispatcher cambia orden de guards | Contrato de precedencia + pruebas diferenciales |
| Cache reutiliza autoridad | Provenance, TTL, scope y fail-closed |
| Modelo económico reduce calidad | Evals por ruta + escalamiento determinista |
| Agente delgado omite invariantes | Phase specs obligatorios + prueba de carga |
| Target agresivo crea texto críptico | Medir precisión, no solo tamaño |

## Mapa preliminar de dominios

| Área | Aplica | Motivo |
|---|---|---|
| Funcional | Sí | Define experiencia observable, fricción y comportamiento por ruta |
| Backend/runtime | Sí | Hooks, parsers, loaders, routing y métricas |
| Seguridad | Sí | Guards, autorización, caches y least privilege |
| QA | Sí | Benchmarks, evals, adversarial y E2E consumidor |
| DevOps | No inicialmente | No se introduce automatización externa |
| Frontend | No | No hay interfaz de producto |
| Diseño UX/UI | No | No hay experiencia visual |
| Datos | No | No se modifica plataforma analítica |

## Roles técnicos requeridos

- [x] Architect — decisiones transversales de contexto, hooks y modelos.
- [x] Security — preservación de autorización, guards y fail-closed.
- [x] Tech Lead — deuda técnica, slices y compatibilidad.

## Decisiones arquitectónicas previstas

- **Enmendar ADR-005**, no duplicarlo, para generalizar carga condicional a
  skills y coordinadores.
- Crear ADR de presupuesto de contexto efectivo si Analyze confirma que la
  fórmula y thresholds serán contrato estable.
- Crear ADR del dispatcher consolidado si el spike confirma la arquitectura.
- Crear ADR de routing de modelos solo si el cambio será política estable del
  template.
- No crear ADR para bug fixes de parser, reducción textual o tests.

## Artefactos de salida

- `docs/tech/2026-07-18-001-SPECIFY-001-runtime-performance-audit.md`
- `docs/baselines/asdd-runtime-baseline-v2.json`
- Este brief.
- Set spec-per-área funcional/backend/seguridad/QA e INDEX en Analyze.
- ADRs confirmados por las specs, no anticipados por conveniencia.
- Implementación, benchmarks y evidencia por slice.

## Gate de salida de Specify

- [x] Problema sustentado en evidencia.
- [x] Línea base procesable creada.
- [x] Alcance y fuera de alcance explícitos.
- [x] Dominios preliminares identificados.
- [x] Runs anteriores preservados como antecedentes.
- [ ] Brief revisado por el usuario.
