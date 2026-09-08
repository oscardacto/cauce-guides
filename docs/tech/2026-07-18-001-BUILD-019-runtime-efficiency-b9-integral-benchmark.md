# B9 — Benchmark integral, evals y E2E final

## Objetivo

Cerrar la verificación integral de Runtime Efficiency v2 comparando el runtime
original con B1–B8, sin mezclar overhead local con latencia del proveedor y sin
persistir prompts, outputs, comandos ni tool inputs.

## Método reproducible

- `benchmark-runtime-integral.mjs`: 5 warm-ups y 30 muestras por escenario
  local; publica p50/p95 y ejecuta cada hook en un proceso aislado.
- `eval-orchestrator-model-routing.mjs`: comparación diagnóstica con Claude CLI,
  safe mode, tools deshabilitadas, salida JSON estructurada y modelos exactos
  `claude-opus-4-8` / `claude-sonnet-4-6`.
- `test-runtime-efficiency-consumer-e2e.mjs`: 16 suites en procesos separados,
  HOME aislado y temporales propios. Cubre POSIX nativo, paths Windows
  sintéticos, espacios, symlinks y repos Git anidados/múltiples.
- Fuente medida: rama `feature/asdd-runtime-efficiency-v2`, commit pre-B9
  `0b5475031efe1464607156a94d4860588530072f`, Node `v24.18.0`, Linux WSL2.

La latencia del proveedor se reporta separada y con una sola muestra por modelo
y escenario; no es un SLO ni una distribución estadísticamente robusta.

## Resultado local

| Métrica | Original / legacy | B9 | Cambio |
|---|---:|---:|---:|
| Always-on words | 16.973 | 5.863 | -65,46 % |
| Prompt normal | 145 | 0 | -100 % |
| Procesos ASDD Bash | 7 | 1 | -85,71 % |
| Procesos ASDD Edit | 8 | 1 | -87,50 % |
| Bash fast-path p95 | 55,57 ms | 35,18 ms | -36,69 % |
| Edit fast-path p95 | 55,70 ms | 33,69 ms | -39,52 % |

El deny productivo conserva p95 de `34,46 ms` para Bash y `33,90 ms` para
Edit. Routing determinista tiene p95 `0,0016 ms` y validación de budget
`0,0140 ms` sobre 1.000 muestras.

El contexto final medido queda en: mayor agente+skills `8.905`, mayor contexto
efectivo `19.159` y 9 warnings. Los gates bloqueantes están verdes; los nueve
agentes especializados todavía sobre el target staged de eager skills siguen
visibles como deuda en warning, no se convirtieron en falsos PASS.

## Comparación real de modelos

Ambos modelos aprobaron `4/4` casos: TRIVIAL sin subagentes, LIGHT atómico,
feature FULL y autorización de alto riesgo FULL/Opus. En esta muestra
diagnóstica Sonnet costó `$0,102729` contra `$0,130354` de Opus (`-21,19 %`),
pero produjo más output y fue más lento (`p50 15.821 ms` contra `6.779 ms`).
Por tanto se valida calidad y ahorro observado, no se promete menor latencia de
proveedor.

La evaluación real expuso dos defectos del propio harness antes del cierre:
la ausencia de `--models` seleccionaba accidentalmente `argv[0]`, y el campo
`subagents` confundía total de workflow con concurrencia. También reveló que el
prompt standalone no contenía la regla canónica que fuerza FULL para escritura
sensible. Los tres puntos quedaron corregidos y la matriz final pasó completa.

## E2E y seguridad

- Consumidor integral: `16/16` suites PASS.
- Dispatcher diferencial, múltiples denies y registro: PASS.
- Collector: par Pre/Post correlacionado para allow y Pre huérfano esperado
  para deny; el dispatcher no reemplaza PostToolUse.
- Rules, capabilities y coordinadores: resolve/load/Read antes de act; missing,
  hash mutado, capability no aprobada y symlink escape bloquean.
- Routing/budgets: TRIVIAL=0, high-risk=FULL/Opus, marcador exacto y telemetría
  sin contenido sensible.

## Gates y limitaciones

Todos los gates ejecutables en este entorno pasan. ADR-018 conserva dos checks
externos obligatorios antes del release: repetir las distribuciones de
rendimiento en macOS nativo y Windows nativo. B9 sí cubre semántica de paths
Windows, pero no atribuye esos fixtures a timing nativo.

Permanecen no observables: schemas de tools/MCP y contexto interno del
proveedor. Los tokens del Claude CLI incluyen overhead del runtime y no se
equiparan con el conteo local de palabras.

## Rollback

Los scripts y el baseline B9 son aditivos. El único cambio de comportamiento es
la alineación del prompt de eval standalone; puede revertirse de forma aislada
sin modificar settings, hooks, guards ni telemetría productiva.

## Evidencia

- `docs/baselines/2026-07-18-001-b9-runtime-integral.json`
- `.claude/scripts/benchmark-runtime-integral.mjs`
- `.claude/scripts/eval-orchestrator-model-routing.mjs`
- `.claude/scripts/test-runtime-efficiency-consumer-e2e.mjs`
- `.claude/scripts/test-runtime-efficiency-nested-git-consumer.mjs`

Resultado: B9 queda cerrado para el entorno medido; DOC-1 puede consolidar el
baseline final manteniendo macOS/Windows nativos como gate explícito de release.
