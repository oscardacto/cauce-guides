# SPIKE-1 — Benchmark y thresholds de Runtime Efficiency v2

**Run:** `2026-07-18-001`
**Slice:** `SPIKE-1`
**Estado:** REOPENED — latencia de hooks invalidada; contexto y conteos conservan validez
**Fuente:** commit `39c8293`, rama `feature/asdd-runtime-efficiency-v2`

## 1. Preguntas

1. ¿Cuál es la latencia local p50/p95 de las cadenas actuales de hooks?
2. ¿Cuánto contexto always-on y eager debe contar el gate corregido?
3. ¿Son alcanzables los targets provisionales del brief?
4. ¿Qué límites deben ser absolutos y cuáles relativos al entorno?

## 2. Entorno y método

- Linux WSL2 x86_64, kernel 6.18.33.2.
- Node v24.18.0.
- 20 procesadores lógicos y 11,8 GiB de memoria visible.
- 5 muestras de warm-up + 30 muestras medidas.
- Percentil nearest-rank.
- Operación Bash: `git status`.
- Operación Edit: evento representativo no autorizado; se ejecutó
  sintéticamente la cadena registrada completa, sin aplicar la edición.
- No se midió latencia del proveedor LLM, red, tool schemas ni MCP schemas.

> **Corrección 2026-07-18:** el método ejecutó Bash/Edit en secuencia. Claude
> Code ejecuta todos los hooks coincidentes en paralelo y combina sus
> resultados después de que todos terminan. Por tanto, los p50/p95 de esta
> sección no representan wall-clock operacional. Se conservan únicamente como
> evidencia del costo secuencial acumulado. La corrección vive en
> `2026-07-18-001-DESIGN-009-runtime-efficiency-spike-1r.md`.

Resultados procesables:
`docs/baselines/2026-07-18-001-spike-1-runtime-benchmark.json`.

## 3. Resultados

### Hooks — resultados secuenciales invalidados para runtime

| Evento | Procesos | p50 | p95 | Media |
|---|---:|---:|---:|---:|
| Bash — cadena completa | 7 | 128 ms | 132 ms | 128,6 ms |
| Edit — cadena completa | 8 | 139 ms | 143 ms | 139,2 ms |
| UserPromptSubmit | 1 | 20 ms | 21 ms | — |
| SessionStart dispatcher | 1 | 25 ms | 27 ms | — |

Estos valores no permiten concluir una reducción de al menos 40% del wall-clock.
Sí confirman 7–8 arranques Node y trabajo acumulado repetido, que deben medirse
separadamente de la latencia percibida.

### Contexto

| Métrica | Valor |
|---|---:|
| Always-on | 16.973 palabras |
| CLAUDE.md | 2.108 |
| Rules globales | 14.865 |
| UserPromptSubmit normal | 145 palabras |
| SessionStart con run activo | 93 palabras |

### Payload eager corregido

| Agente | Skills eager | Total agente + skills | Agente + skill individual mayor |
|---|---:|---:|---:|
| Tech Lead | 13 | 20.351 | 3.013 |
| UI | 8 | 18.472 | 9.659 |
| Solution Architect | 13 | 14.111 | 3.281 |
| ATF Web QA | 0 | 10.679 | 10.679 |

La carga de una capability reduce Tech Lead y Architect por debajo de 3.500
palabras sin adelgazar sus skills. UI requiere un límite inicial de 10.000 por
su skill `hifi-builder`; bajar a 8.000 exige partir esa skill. ATF Web requiere
adelgazar el coordinador, no lazy skills.

### Herramientas de medición

| Comando | p50 | p95 |
|---|---:|---:|
| `asdd-runtime-metrics.mjs` | 31 ms | 32 ms |
| `validate-template.mjs` | 118 ms | 126 ms |

El costo de medir es suficientemente bajo para validación local por slice.

## 4. Thresholds confirmados para Design

| Métrica | Bloqueante | Stretch |
|---|---:|---:|
| Always-on | ≤8.000 palabras | ≤6.000 |
| Prompt normal | ≤40 palabras | 0 sin señal |
| Procesos ASDD PreToolUse | 1 | 1 |
| Bash p95 local | RETRACTADO hasta SPIKE-1R-B | — |
| Edit p95 local | RETRACTADO hasta SPIKE-1R-B | — |
| p95 cross-platform | RETRACTADO hasta SPIKE-1R-B | — |
| Skills eager por agente | ≤1 | 0 cuando no hay capability activa |
| Agente + skill inicial | ≤10.000 palabras | presupuesto específico por rol |
| Coordinador delgado | ≤3.500 palabras | ≤2.500 |
| Subagentes TRIVIAL | 0 | 0 |
| Regresiones routing/seguridad | 0 | 0 |

Los milisegundos absolutos son gates del entorno de referencia. En otros
entornos manda el ratio relativo y el límite estructural de procesos.

## 5. Decisiones derivadas

- **D1:** usar presupuesto por capas y declarar componentes no medidos; extender
  carga condicional a capabilities y coordinadores.
- **D2:** un dispatcher por evento, módulos puros y pruebas diferenciales.
- **D3:** default Sonnet, escalamiento por riesgo y presupuestos por ruta; no
  usar Opus para compensar contexto sobredimensionado.

## 6. Limitaciones

- Palabras no equivalen exactamente a tokens; sirven como unidad determinista.
- La latencia LLM probablemente domina la respuesta total, pero el overhead de
  hooks se paga en cada tool call y sí es controlable.
- La medición de Edit es una cadena sintética completa; Claude Code puede cortar
  antes ante deny.
- Los schemas de tools/MCP permanecen como `unmeasured_components`.
- Los resultados deben repetirse en Windows/macOS durante B9.

## 7. Conclusión

SPIKE-1 confirma contexto y fan-out, pero no permite fijar thresholds de
latencia de hooks. Los objetivos provisionales se ajustan así:

- always-on: **8.000 bloqueante / 6.000 stretch**, no 6.000 como único gate;
- coordinadores: **3.500 bloqueante / 2.500 stretch**;
- latencia: pendiente del baseline paralelo y del prototipo de dispatcher.

SPIKE-1 queda reabierto solo para D2. D1 y D3 conservan la evidencia que no
depende de la semántica de hooks.

