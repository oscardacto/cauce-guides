# B4 — Routing e inyección ORC condicional

## Objetivo

Eliminar la repetición del núcleo ORC en cada `UserPromptSubmit` sin degradar
routing, seguridad, aprobación de challenges ni recuperación post-compact.

## Implementación

`sofka-asdd-user-prompt-submit.mjs` clasifica cada prompt en tres modos:

| Modo | Condición | Salida |
|---|---|---|
| `none` | turno normal sin señal | cero bytes/palabras |
| `specialized` | challenge consumido, autorización sensible, Figma, Data, Software o ambigüedad | solo recordatorio especializado |
| `full` | recuperación explícita del núcleo ORC | núcleo completo |

El núcleo base continúa entregándose en `SessionStart`, que Claude Code vuelve
a ejecutar después de compactación. El modo `full` es un mecanismo adicional
de recuperación explícita, no la ruta normal.

Los módulos de autorización se importan de forma lazy únicamente para prompts con forma de aprobación. La aprobación ORC-010 conserva el orden atómico existente: el hook intenta
consumir el challenge antes de construir el perfil y, si lo consume, emite el
recordatorio especializado del lote aprobado. Un `ok` sin challenge no crea
autoridad ni genera contexto.

## Seguridad y anti-orfandad

- Los regex de autorización, Figma, Data y Software no se relajaron.
- La ambigüedad Data↔Software sigue obligando a preguntar, nunca autoelige.
- La regresión anti-orfandad ejecuta `SessionStart` con evento post-compact y
  exige núcleo + taxonomía `TRIVIAL/LIGHT/MEDIUM/FULL`.
- El perfil puro y la salida real del proceso se prueban por separado.
- Los guards PreToolUse siguen siendo enforcement independiente; este cambio
  solo reduce texto inyectado.

## Evidencia

Benchmark: 5 warm-ups + 30 muestras por escenario, proceso aislado por evento.

| Escenario | Antes | B4 | Cambio | p95 local |
|---|---:|---:|---:|---:|
| Normal | 145 palabras | 0 | -100 % | 67,46 ms |
| Figma | 221 | 76 | -65,61 % | 74,85 ms |
| Autorización sensible | 201 | 56 | -72,14 % | 74,80 ms |
| Ambigüedad Data↔Software | 236 | 91 | -61,44 % | 70,09 ms |
| Recuperación explícita | n/a | 145 | n/a | 72,13 ms |

El valor canónico `hook_injection_words` cambia de 145 a 0 para el turno
normal; el mayor contexto efectivo medido baja en las mismas 145 palabras.

Fuentes:

- `docs/baselines/2026-07-18-001-b4-conditional-orc-injection.json`
- `.claude/scripts/benchmark-prompt-injection.mjs`
- `.claude/scripts/test-conditional-orc-injection.mjs`

## Rollback

Reponer el `unshift` incondicional del núcleo en `UserPromptSubmit` y restaurar
`hook_injection_words=145`. El rollback no toca SessionStart, autorización ni
guards.

## Resultado

B4 cumple ADR-017/RN-008: el turno normal queda en 0 palabras, las señales
sensibles conservan routing mecánico, el núcleo no queda huérfano y no se
modifica autoridad. B5 puede iniciar.
