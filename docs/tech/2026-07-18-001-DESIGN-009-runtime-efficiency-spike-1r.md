# SPIKE-1R — Runtime paralelo y compatibilidad del dispatcher

**Run:** `2026-07-18-001`  
**Slice:** `SPIKE-1R`  
**Estado:** DONE — fases A/B completadas; ADR-018 vuelve a revisión

## 1. Motivo de reapertura

SPIKE-1 lanzó la cadena registrada secuencialmente. Ese modelo sirve para
comparar decisiones de guards, pero no para latencia: Claude Code ejecuta todos
los hooks coincidentes en paralelo, espera su terminación y combina resultados.
Un deny no cancela los hooks hermanos.

Esto también implica que `sofka-collector emit`, instalado globalmente, corre
como proceso independiente y no debe contarse ni integrarse dentro del
dispatcher ASDD.

## 2. Fase A — baseline paralelo corregido

Harness reproducible:

```bash
node .claude/scripts/benchmark-pretool-hooks.mjs --tool Bash --warmups 5 --samples 30
node .claude/scripts/benchmark-pretool-hooks.mjs --tool Edit --warmups 5 --samples 30
```

| Evento | Procesos ASDD | Wall p50 | Wall p95 | Suma handlers p95 |
|---|---:|---:|---:|---:|
| Bash | 7 | 37,99 ms | 40,34 ms | 236,14 ms |
| Edit | 8 | 38,91 ms | 42,08 ms | 280,11 ms |

La suma de handlers es un proxy de fan-out/trabajo concurrente, no CPU. Los
jobs Bash/Edit se ejecutaron serialmente; una captura anterior que lanzó ambos
benchmarks a la vez se descartó por contención cruzada. El gate anterior de
65/72 ms ya se alcanza con la cadena paralela y no demuestra por sí solo el
valor del dispatcher.

## 3. Impacto sobre telemetría

### Invariantes

1. “Un proceso” significa **un proceso de enforcement ASDD**, no un proceso
   total del evento.
2. Hooks globales, locales, de plugins y terceros permanecen independientes.
3. `PostToolUse` queda fuera del alcance de ADR-018.
4. Una tool permitida conserva exactamente un evento collector Pre y uno Post
   correlacionados por `tool_use_id`.
5. Una tool denegada conserva el Pre collector y no genera Post; ese Pre
   huérfano es semántica de lifecycle, no pérdida causada por el dispatcher.
6. El dispatcher no invoca, elimina, reemplaza ni reescribe el input de
   `sofka-collector emit`.

### Límites de las métricas existentes

- `duration_ms` de PostToolUse mide ejecución real de la tool y excluye
  PreToolUse/permisos.
- `hookInfo.hookDurationMs` mide el proceso collector, no los guards ASDD, y se
  toma antes de API-first/buffer.
- M22 Pre→Post puede variar, pero no aísla el overhead del dispatcher.
- Collector no registra hoy `PostToolUseFailure`; es un gap separado.

## 4. Fase B — prototipo ejecutado

Se creó un adapter de spike no registrado que carga los guards actuales dentro
de un único proceso. El prototipo reescribe únicamente el boundary de stdin/exit
en memoria; no es implementación candidata a producción.

| Escenario | Actual p95 | Prototipo p95 | Cambio | Procesos |
|---|---:|---:|---:|---:|
| Bash fast path | 40,34 ms | 38,89 ms | -3,59 % | 7 → 1 |
| Edit representativo | 42,08 ms | 40,54 ms | -3,66 % | 8 → 1 |
| Bash deny peligroso | 40,90 ms | 36,44 ms | -10,90 % | 7 → 1 |

CPU agregada por evento, medida como `(user + sys) / 35` con `time` de Bash:

| Evento | Actual | Prototipo | Cambio |
|---|---:|---:|---:|
| Bash | 235,97 ms | 40,31 ms | -82,92 % |
| Edit | 274,46 ms | 41,17 ms | -85,00 % |

GNU `time -v` no está instalado, por lo que RSS queda explícitamente no
medido. El resultado muestra una mejora modesta de wall-clock y una reducción
grande de procesos/CPU.

### Equivalencia

`test-pretool-dispatcher-prototype.mjs` pasó 7/7 fixtures: allow, dangerous
deny, control de autorización, orchestrator, coautoría, multi-guard de specs y
JSON malformado. Las razones de todas las decisiones con máxima precedencia se
conservan en el resultado combinado.

### Collector

`test-dispatcher-collector-coexistence.mjs` pasó 2/2 escenarios:

- tool permitida: exactamente un Pre y un Post correlacionados;
- tool denegada: exactamente un Pre y ningún Post.

El deny ASDD no suprime el proceso independiente de telemetría.

## 5. Gates confirmados

| Gate | Estado |
|---|---|
| Exactamente un proceso de enforcement ASDD | bloqueante |
| Cero regresiones de allow/ask/deny y reason codes | bloqueante |
| Ejecutar todos los guards aplicables y combinar resultados | bloqueante |
| Collector y hooks ajenos preservados | bloqueante |
| Wall p95 ≤105 % del baseline paralelo del entorno | bloqueante |
| CPU agregada ≤50 % del baseline del entorno | bloqueante donde sea medible |
| RSS | declarar no medido hasta instrumentación cross-platform |

## 6. Resultado actual

SPIKE-1R queda DONE. D2/ADR-018 vuelve a `in_review`, no a aceptado. La
evidencia soporta un dispatcher de un proceso por eficiencia de recursos y
precedencia auditable, no una promesa de gran reducción de wall-clock. D1 y D3
no se reabrieron.
