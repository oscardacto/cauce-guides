# B3 — Dispatcher único PreToolUse

## Objetivo

Reemplazar la cadena paralela de procesos ASDD para `Bash|Write|Edit` por un
solo proceso productivo, sin absorber collector ni modificar `PostToolUse`.

## Implementación

- `asdd-pre-tool-dispatcher.mjs` lee y valida stdin una vez e importa 12
  funciones de guard explícitas; no crea procesos hijos ni usa la reescritura
  dinámica del prototipo.
- Ejecuta todos los guards aplicables en el orden de S1, incluso tras un deny.
- Normaliza excepciones/resultados inválidos a deny estable y combina con
  `deny > defer > ask > allow`; conserva todas las razones ganadoras.
- Los guards declaran efectos de autorización, marker y auditoría. El
  dispatcher los ejecuta centralmente y en orden determinista.
- `settings.json` registra exactamente un dispatcher ASDD. `Agent/plan-gate`,
  collector global y `PostToolUse` permanecen fuera del cambio.
- La cadena legacy queda versionada y recuperable temporalmente mediante
  `asdd-pretool-mode.mjs --legacy|--dispatcher`.

## Corrección DFX-001

`spec-check` y `dep-check` dejaron de emitir el protocolo inefectivo
`{decision:"block"}` con exit 0. Sus módulos retornan `deny` y los wrappers
legacy emiten `hookSpecificOutput.permissionDecision="deny"`. La diferencia
es una corrección fail-closed aprobada por S1, no un modo compatible opcional.

## Evidencia

| Gate | Resultado |
|---|---:|
| Oracle merge/efectos/fail-closed | 5/5 PASS |
| Diferencial legacy vs producción | 11/11 PASS |
| DFX-001 focal | 2/2 PASS |
| Collector Pre/Post | 2/2 PASS |
| Registro/imports/rollback | 3/3 PASS |
| Procesos Bash / Edit | 7→1 / 8→1 |
| p95 Bash | 40,33→33,64 ms (-16,59 %) |
| p95 Edit | 41,39→33,17 ms (-19,86 %) |
| CPU Bash | 229,86→33,20 ms/evento (-85,56 %) |
| CPU Edit | 262,20→33,31 ms/evento (-87,30 %) |

Método y resultados completos:
`docs/baselines/2026-07-18-001-b3-pretool-dispatcher.json`.

## Rollback

```bash
node .claude/scripts/asdd-pretool-mode.mjs --legacy
node .claude/scripts/asdd-pretool-mode.mjs --dispatcher
```

El round-trip se prueba sobre una copia temporal de settings y verifica que
`PostToolUse` no cambie. El modo dispatcher queda como configuración default.

## Resultado

B3 cumple ADR-018: no hay regresión p95, CPU queda por debajo del 50 % del
baseline, existe un solo proceso ASDD y no hay diferencias diferenciales no
autorizadas. B4 puede iniciar.
