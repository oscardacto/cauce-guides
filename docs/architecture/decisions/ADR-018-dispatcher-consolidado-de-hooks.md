# ADR-018 — Dispatcher consolidado de hooks PreToolUse

Fecha: 2026-07-18 | Estado: Aceptada
Deciders: Maintainers ASDD
Relacionado con: ADR-001, ADR-015, run `2026-07-18-001`, D2

## Contexto

Cada Bash inicia siete procesos Node ASDD y cada Write/Edit ocho. SPIKE-1 midió
la cadena en secuencia, pero Claude Code ejecuta todos los hooks coincidentes en
paralelo. Esa latencia quedó invalidada para representar el runtime.

SPIKE-1R-A corrigió el baseline:

- Bash paralelo aislado: p50 37,99 ms, p95 40,34 ms;
- Edit paralelo aislado: p50 38,91 ms, p95 42,08 ms.

Una captura preliminar 63,14/60,89 ms se descartó porque lanzó ambos jobs de
benchmark simultáneamente y añadió contención cruzada.

Los scripts vuelven a parsear stdin y pueden repetir resolución de Git, estado,
specs y autorización. El fan-out acumulado sigue siendo 7–8 procesos.

SPIKE-1R-B probó un adapter de un proceso sin activarlo en settings:

- Bash fast path: p95 38,89 ms (-3,59 %), CPU -82,92 %;
- Edit representativo: p95 40,54 ms (-3,66 %), CPU -85,00 %;
- Bash deny: p95 36,44 ms (-10,90 %);
- corpus diferencial 7/7 y coexistencia collector 2/2.

La justificación primaria es reducción de procesos/CPU y contexto compartido;
la mejora de wall-clock es secundaria y modesta.

Además, `sofka-collector emit` se instala globalmente como hook independiente.
Claude Code lo ejecuta en paralelo con los guards ASDD incluso cuando uno de
ellos deniega la tool. La consolidación no puede absorber ni eliminar esa
telemetría.

## Decisión propuesta

### 1. Un proceso de enforcement ASDD por evento

`.claude/settings.json` registrará un único
`sofka-asdd-pre-tool-dispatcher.mjs` para `Bash|Write|Edit`. El dispatcher
importará guards como módulos y no creará procesos Node hijos.

Este límite excluye expresamente hooks globales, locales, de plugins, de
telemetría y de terceros. El collector conserva procesos independientes
`PreToolUse` y `PostToolUse`; `PostToolUse` queda fuera del alcance del ADR.

### 2. Guards modulares

Cada guard expone una función pura o explícitamente effectful:

```js
check(event, sharedContext) =>
  { decision: "allow" | "ask" | "deny", reason, message?, effects? }
```

Los módulos no leen stdin, no llaman `process.exit` y no resuelven Git por su
cuenta. Los effects autorizados se ejecutan centralmente.

El adapter dinámico de SPIKE-1R-B es únicamente evidencia y nunca se registra.
B3 debe extraer exports explícitos y testeables; queda prohibido llevar a
producción la reescritura de source/data URLs usada por el prototipo.

### 3. Contexto lazy compartido

El dispatcher construye una vez:

- root y tool normalizada;
- clasificación del comando;
- Git context, solo para operación Git relevante;
- run/spec context, solo para Write/Edit o gate aplicable;
- authorization context, solo para operación protegida.

### 4. Precedencia

Orden obligatorio:

1. payload/schema y dangerous operation;
2. root/path/symlink;
3. branch y controles Git;
4. autorización de plan/capability/scope/command;
5. spec/analyze/design/artifact guards;
6. coautoría/pre-push/pre-PR cuando la operación concreta aplica;
7. orchestrator policy.

El dispatcher ejecuta **todos los guards ASDD aplicables** antes de decidir. No
corta ante el primer deny: la cadena actual ejecuta hermanos en paralelo y
algunos guards tienen efectos consumibles/auditables; cortar cambiaría esa
semántica.

Después combina resultados con precedencia `deny > defer > ask > allow`. Conserva
todas las razones de la decisión ganadora en orden determinista. Esto no cancela
hooks externos: Claude Code los ejecuta en paralelo y combina sus resultados al
finalizar.

### 5. Equivalencia y rollback

Antes del reemplazo se ejecuta un corpus diferencial contra cadena anterior y
dispatcher. Toda diferencia se aprueba explícitamente. La cadena anterior
permanece recuperable por un flag temporal durante B3/B9, sin convertirse en
escape hatch permanente.

### 6. Gates confirmados

- exactamente un proceso de enforcement ASDD por evento;
- todos los guards aplicables se ejecutan y sus razones ganadoras se conservan;
- collector y hooks ajenos preservados sin duplicación;
- `PostToolUse` intacto;
- wall p95 ≤105 % del baseline paralelo del mismo entorno;
- CPU agregada ≤50 % del baseline donde sea medible;
- RSS se declara no medido hasta instrumentación cross-platform;
- cero diferencias de seguridad/routing no aprobadas.

B9 repite rendimiento en Windows/macOS antes de release; no se fija un absoluto
portable de milisegundos.

## Alternativas consideradas

- **Mantener scripts separados:** rechazada por costo lineal por tool call.
- **Dispatcher que usa child_process:** rechazada; centraliza configuración pero
  no reduce procesos.
- **Eliminar guards redundantes sin consolidar:** insuficiente y riesgoso.
- **Daemon persistente:** diferido; agrega lifecycle, IPC y estado compartido
  innecesarios para alcanzar el objetivo.
- **Paralelizar módulos dentro del dispatcher:** rechazada para B3; los guards
  actuales son principalmente síncronos y algunos tienen effects. Un proceso
  secuencial que ejecuta todos los aplicables pasó el gate sin introducir
  worker threads ni orden no determinista.

## Consecuencias

**Positivas:** menos procesos/CPU, una sola lectura de evento/contexto,
precedencia auditable y p95 sin regresión en el spike.
**Costo:** refactor de hooks a módulos y harness diferencial/paralelo.
**Riesgo:** un guard lento puede serializar el pipeline; se mitiga ejecutando
solo guards aplicables, contexto lazy, gate p95 por entorno, S1 y rollback.
**Compatibilidad:** el wrapper conserva protocolo Claude Code y Node estándar;
collector y hooks ajenos permanecen fuera del dispatcher y reciben el payload
original directamente de Claude Code.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-18 | — | Propuesta | SPIKE-1 confirmó 7–8 procesos; sus p95 secuenciales se consideraron inicialmente válidos. |
| 2026-07-18 | Propuesta | Propuesta — retornada a SPIKE/Design | Se corrigió la semántica paralela y se exigió compatibilidad con collector. |
| 2026-07-18 | Propuesta — retornada a SPIKE/Design | Propuesta — lista para aprobación | SPIKE-1R-B validó un proceso, p95 sin regresión, CPU -83/-85 %, diferencial 7/7 y collector 2/2. |
| 2026-07-18 | Propuesta — lista para aprobación | Aceptada | Aprobación explícita del usuario después de revisar la evidencia de Design. |
