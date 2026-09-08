# B7 — Coordinadores delgados y tools mínimas

## Objetivo

Reducir el contexto inicial de ATF Web y BA Descomponedor sin perder state
machine, invariantes, routing ni contratos de salida; cargar el detalle en el
punto de uso y retirar `tools: all` del coordinador ATF.

## Arquitectura

`.asdd/coordinator-loading.json` declara para cada coordinador:

- core, budget stretch de 2.500 palabras y allowlist exacta;
- rutas condicionales, marcadores contractuales y SHA-256;
- fuente completa de rollback con hash;
- procedimiento de rollback aislado.

Los cores conservan rol/límites, state machine, invariantes críticas, tabla de
routing y contrato de salida. Cada ruta exige lectura **COMPLETA** antes de
actuar; una ruta ausente o mutada falla cerrado.

## ATF Web

El core de 10.644 palabras se reemplazó por uno de 642. Inicialización,
checkpoint, recuperación y consolidación viven en
`.claude/atf-web-steps/orchestrate.md`; diagnóstico, estrategia, diseño,
enrichment, ejecución y knowledge continúan en sus seis phase specs existentes.

La state machine explícita es:

```text
INIT → DIAGNOSE → STRATEGIZE → DESIGN → COVERAGE → ENRICH
     → EXECUTE → KNOWLEDGE → CONSOLIDATE → COMPLETE
```

`tools: all` se reemplazó por
`[Read, Write, Edit, Glob, Grep, Bash, Task]`, la allowlist usada por el
coordinador ATF API. Browser/NotebookLM permanecen en executors o skills de
fase, no en el coordinador. El core prohíbe ejecutar pruebas directamente.

## BA Descomponedor

El core baja de 7.535 a 432 palabras. El cuerpo normativo anterior se
particionó sin pérdida de líneas en:

- `.claude/ba-steps/decompose.md`: fuentes, heurísticas, análisis y checklist;
- `.claude/ba-steps/edt-contract.md`: formato, campos y estados;
- `.claude/ba-steps/decision-lifecycle.md`: incorporación, propagación,
  limpieza y bitácora de decisiones pendientes.

La allowlist BA ya era mínima y se conserva sin ampliación.

## Seguridad, readers y rollback

El check `thin-coordinator-loading` valida como error:

- correspondencia con coordinadores del context budget;
- core ≤2.500, allowlist exacta y ausencia de `all`;
- reader, rutas, frontmatter, hashes y marcadores;
- rollback completo más detallado que el core y con hash estable.

`test-thin-coordinator-loading.mjs` ejecuta 10/10 secuencias
`Read-core → Read-phase → act`, elimina una fase en consumidor aislado y prueba
que no llega a actuar. También demuestra la partición lossless BA y restaura un
coordinador sin tocar al hermano.

Durante esta validación apareció un frontmatter multiline oculto en
`atf-web-steps/execute.md`; se normalizó a scalar plano porque el validador
histórico no inspeccionaba phase specs.

## Métricas

| Métrica | Antes | B7 | Cambio |
|---|---:|---:|---:|
| Cores combinados | 18.179 | 1.074 | -94,09 % |
| Payload inicial combinado | 19.385 | 2.280 | -88,24 % |
| ATF Web core | 10.644 | 642 | -93,97 % |
| BA core | 7.535 | 432 | -94,27 % |
| Mayor agent + skills | 11.073 | 8.905 | -19,58 % |
| Mayor contexto efectivo | 21.289 | 19.121 | -10,18 % |
| Warnings de presupuesto | 12 | 9 | -3 |

Ambos cores cumplen el stretch de 2.500. Todos los payloads iniciales quedan
bajo 10.000; por eso `thin_coordinator_words` e
`initial_agent_plus_skill_words` se promueven a error. Solo
`eager_skills_per_agent` permanece en warning con nueve deudas especializadas.

Fuente: `docs/baselines/2026-07-18-001-b7-thin-coordinators.json`.

## Rollback

Por coordinador: copiar su `rollback_source` sobre el core y retirar solo su
entrada del manifiesto. Las fuentes completas preservan el estado pre-B7 y el
E2E verifica que el coordinador hermano no cambia.

## Resultado

B7 cumple ADR-017 y AB-009: cores delgados, phase specs leídos en el punto de
uso, ausencia de orfandad, tools acotadas, rollback individual y gates de
regresión. B8 puede iniciar.
