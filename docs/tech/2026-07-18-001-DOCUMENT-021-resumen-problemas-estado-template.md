# Resumen de problemas corregidos y estado del template ASDD

**Versión evaluada:** 3.0.0  
**Fecha de consolidación:** 2026-07-23  
**Iniciativa:** ASDD Runtime Efficiency v2 y hardening validado en consumidor  
**Proyecto de validación real:** `aid-bancolombia`

## Objetivo

Consolidar para el equipo los problemas abordados en el template, el ajuste
implementado para cada uno, la evidencia disponible y su estado actual.

### Convención de estado

- ✅ **Probado y funcionando:** cuenta con pruebas automatizadas y, cuando
  aplica, evidencia en el proyecto consumidor.
- 🟡 **Probado y puede mejorar:** el comportamiento base funciona o el problema
  fue reproducido, pero conserva deuda, cobertura pendiente o una validación
  real adicional.

## Resumen de problemas y estado

| Ajuste | Problema que resuelve o intenta resolver | Evidencia | Estado |
|---|---|---|---|
| **Contexto always-on compacto** | Cada conversación cargaba demasiadas reglas y consumía contexto antes de trabajar. | Reducción medida de **16.973 → 5.863 palabras**; validator aprobado. | ✅ Probado y funcionando |
| **Inyección ORC condicional** | El núcleo ORC se repetía en cada prompt, agregando ruido y coste. | El prompt normal pasó de **145 → 0 palabras**; pruebas de conditional injection aprobadas. | ✅ Probado y funcionando |
| **Dispatcher único de hooks** | Cada operación lanzaba múltiples procesos de hooks, aumentando latencia y complejidad. | E2E de dispatcher, coexistencia y fail-closed aprobados; suite consumidora **16/16**. | ✅ Probado y funcionando |
| **Routing TRIVIAL/LIGHT/MEDIUM/FULL** | Consultas simples y auditorías acotadas activaban workflows o agentes innecesarios. | Tests del router aprobados; Prompt 00 real funcionó como LIGHT read-only con cero agentes. | ✅ Probado y funcionando |
| **LIGHT read-only directo** | La doctrina exigía delegar incluso auditorías estrictamente de solo lectura. | Probado en `aid-bancolombia` durante Prompt 00. | ✅ Probado y funcionando |
| **Autorización de planes ligada a operaciones** | Un plan aprobado podía ampliarse indirectamente mediante paths, comandos o identidades distintas. | Tests de scope, modelo, budget, replay, symlinks y runtime identity aprobados. | ✅ Probado y funcionando |
| **Lazy loading de capabilities** | Los agentes cargaban demasiadas skills antes de saber cuáles necesitaban. | E2E de capabilities y loaders aprobado. | 🟡 Funciona, pero 9 agentes todavía superan el target de eager skills |
| **Coordinadores delgados** | BA Descomponedor y ATF Web cargaban instrucciones excesivas permanentemente. | Pruebas de thin coordinators aprobadas. | ✅ Probado y funcionando |
| **Routing de modelos y budgets** | Se usaban agentes, turnos o modelos más costosos de lo necesario. | Tests de Sonnet/Haiku/Opus, budgets y retries aprobados; evaluación real **4/4 por modelo**. | 🟡 Funciona; conviene ampliar la muestra real de coste y latencia |
| **Reconciliación y reanudación de runs** | Las sesiones compactadas o interrumpidas podían repetir fases o perder el estado efectivo. | Tests de reconciliación y consumer E2E aprobados. | ✅ Probado y funcionando |
| **Distribución CLI completa** | Los consumidores podían quedar sin loaders, referencias, BA steps o librerías requeridas. | Gate `cli-runtime-distribution` y POC independiente aprobados. | ✅ Probado y funcionando |
| **Naming universal y bootstrap temprano** | El primer agente intentaba escribir antes de existir un run o inventaba nombres incompatibles. | Tests de bootstrap/naming aprobados; Prompt 01 creó correctamente `2026-07-20-001-SPECIFY-001-brief-aid-bancolombia.md`. | ✅ Probado y funcionando |
| **Disciplina de fuentes del Domain Expert** | Conocimiento externo podía presentarse como hecho del paquete curado. | Probado durante Prompt 01 y corregido en el brief. | 🟡 Funciona doctrinalmente; falta repetir un Specify completo desde cero |
| **Loader relativo/absoluto** | Claude convertía el loader relativo en ruta absoluta y el gate respondía `command-mismatch`. | Test focalizado aprobado tanto en el template como en el POC. | ✅ Probado y funcionando |
| **Diagnósticos del challenge** | Un mismatch se reportaba igual que expiración/replay, haciendo creer que el TTL duraba pocos segundos. | Ahora se distinguen `command-mismatch`, `authorization-expired`, `authorization-replay` y budget mismatch. | ✅ Probado y funcionando |
| **LIGHT atómico autoautorizado** | Una corrección de una fila exigía reiteradamente challenge y `ok`, contradiciendo `requires_confirmation=false`. | Test focalizado: scope exacto, un uso, TTL, loader y rechazo fuera de scope aprobados en template y POC. | 🟡 Falta confirmar el flujo completo en la sesión Claude real |
| **Routing de paths con `spec`/`brief`** | Una corrección atómica que incluye explícitamente la ruta de un brief se eleva a FULL antes de evaluar el scope puntual. | Reproducido con el router; el workaround validado usa el único artefacto del run activo. | 🟡 Probado y pendiente de mejorar |
| **Presupuesto documental** | `CLAUDE.md` y algunos catálogos todavía cargan más contexto del objetivo. | Validator: `CLAUDE.md` tiene 227 líneas frente al presupuesto de 200; nueve warnings eager. | 🟡 Funciona, pero conserva deuda explícita |
| **Rendimiento multiplataforma** | Las métricas principales se tomaron en Linux/WSL2. | Fixtures Windows validan semántica de paths, no rendimiento nativo. | 🟡 Faltan benchmarks en macOS y Windows nativos |

## Estado consolidado

| Clasificación | Cantidad |
|---|---:|
| ✅ Probado y funcionando | 12 |
| 🟡 Probado y puede mejorar | 7 |
| **Total de ajustes evaluados** | **19** |

## Evidencia principal

- `.claude/docs/adoption/runtime-efficiency.md` — guía operativa, métricas y deuda.
- `docs/baselines/asdd-runtime-baseline-final-v2.json` — baseline final.
- `docs/baselines/2026-07-18-001-b9-runtime-integral.json` — benchmark integral.
- `.claude/scripts/test-runtime-efficiency-consumer-e2e.mjs` — consumidor E2E
  16/16.
- `.claude/scripts/test-direct-light-authorization.mjs` — autorización LIGHT
  de scope exacto y uso único.
- `.claude/scripts/test-proportional-router.mjs` — routing proporcional.
- `.claude/scripts/test-run-bootstrap.mjs` — bootstrap y reserva del primer
  artefacto.
- `ASDD-CHANGELOG.md` — alcance consolidado del release 3.0.0.
- `.claude/docs/migrations/2-to-3.md` — cambios incompatibles y migración.

## Próximas mejoras recomendadas

1. Confirmar el flujo LIGHT atómico completo en una conversación Claude real.
2. Dar precedencia al scope atómico cuando un path explícito contiene
   `spec`/`brief`, sin degradar la seguridad del routing.
3. Migrar los nueve agentes que aún superan el target de eager skills.
4. Reducir `CLAUDE.md` al presupuesto de 200 líneas o mover contenido
   especializado a carga condicional.
5. Ejecutar benchmarks equivalentes en macOS y Windows nativos.
6. Repetir Specify desde cero para validar la disciplina de fuentes del Domain
   Expert sin correcciones posteriores.
