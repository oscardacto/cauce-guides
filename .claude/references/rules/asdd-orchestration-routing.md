# ASDD Orchestration — Routing Avanzado

Escalamiento LIGHT→FULL (ORC-001-C) y auto-detección de codebase_size (ORC-001-D). Complementa `asdd-orchestration.md`.

## ORC-001-C: Protocolo de Escalamiento Universal

**Aplica a todos los agentes invocados en ruta LIGHT — sin excepción.**

Todo agente en ruta LIGHT evalúa al iniciar su trabajo si debe escalar. Si detecta
alguna de las condiciones del contrato universal (ver `asdd-routing-heuristics.md`),
**no continúa la tarea** — retorna al orquestador con señal de escalamiento.

El orquestador, al recibir la señal:

1. Anuncia al usuario: `⚠ Escalamiento LIGHT → FULL: {detalle del agente}`
2. Re-clasifica la tarea como FULL desde la fase recomendada por el agente
3. Registra el escalamiento en `.asdd-run.json` bajo `escalations[]`
4. Continúa el workflow FULL desde ese punto — no reinicia desde cero

El escalamiento **no es un error** — es el mecanismo de auto-corrección del routing.
Un agente que escala correctamente está funcionando bien.

## ORC-001-D: Auto-detección de `codebase_size`

Modificador transversal del comportamiento de los agentes. Determina **cómo**
trabaja un agente dentro de la ruta elegida (no cambia LIGHT/FULL).

### Cuándo ejecutar la detección

Al recibir el **primer request en ruta LIGHT de la sesión**, antes de
invocar al agente delegado, el orquestador resuelve `codebase_size` con la
siguiente cadena de precedencia (mayor a menor):

1. `project_context.maturity` presente en `.asdd/asdd.lock` →
   tomar ese valor, **no ejecutar detección**, escribir
   `auto_detected.overridden_by_lock = true` y `lock_value` en `.asdd-run.json`.
2. `.asdd-run.json` ya tiene `auto_detected` con `detected_at` poblado en
   el run actual → reusar el valor cacheado.
3. Ejecutar auto-detección (ver abajo) y persistir resultado.

La detección se ejecuta **una sola vez por run** (idempotente dentro del
mismo `run_id`). Un nuevo run reejecuta detección (captura crecimiento del
codebase entre sesiones).

### Algoritmo de auto-detección (regla 2-de-3)

Leer umbrales de `detection_thresholds.codebase_size` del lock. Si el
bloque no existe, usar defaults: `source_files=200`, `commits=300`,
`docs_files=30`, `signals_required=2`.

Ejecutar las 3 señales (en paralelo si es viable):

1. **Archivos fuente:** contar archivos que matcheen `source_globs` del lock.
   Comando default:
   `find src/ -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.java" -o -name "*.go" \) | wc -l`
2. **Commits:** `git rev-list --count HEAD` (0 si no es repo git).
3. **Docs:** contar archivos bajo `docs_glob` del lock. Comando default:
   `find docs/ -type f | wc -l` (0 si `docs/` no existe).

Contar cuántas señales superan su umbral (`signals_over_threshold`). Si
ese conteo es **>= `signals_required`** (default 2) → `codebase_size: large`.
Caso contrario → `codebase_size: small`.

### Persistencia

Escribir el resultado en `.asdd-run.json` bajo `auto_detected` (ver schema).
La escritura ocurre **antes** de invocar al agente delegado (write-ahead
checkpoint, consistente con ORC-007 en `asdd-orchestration-ops.md`).

### Comportamiento backwards-compatible

- Si `.asdd/asdd.lock` no tiene `detection_thresholds` →
  usar defaults hardcodeados.
- Si el proyecto no es un repo git → señal `commits = 0` (no falla la
  detección).
- Si `docs/` no existe → señal `docs_files = 0`.
- Si el agente delegado es invocado en ruta FULL → la detección no aplica;
  `auto_detected` queda `null` en `.asdd-run.json` hasta que llegue un request LIGHT.

### Logging visible

Tras ejecutar la detección por primera vez en la sesión, el orquestador
anuncia en una línea antes del anuncio del agente (ORC-008 en `asdd-orchestration-ops.md`):

```
⚙ codebase_size: large (signals: source_files=347, commits=412, docs=45 — 3/3 over threshold)
```

o, si fue por override del lock:

```
⚙ codebase_size: small (lock override — project_context.maturity)
```
