# B5 — Reducción segura de rules always-on

## Objetivo

Reducir el contexto cargado en todos los turnos sin perder reglas normativas,
invariantes de seguridad ni capacidad de recuperación cuando una referencia no
está disponible.

## Implementación

Nueve reglas de alto peso se dividieron en dos capas:

1. un **core always-on** compacto con invariantes universales, trigger,
   invocación exacta al resolver y política fail-closed;
2. una **referencia normativa completa** en `.claude/references/rules/`, leída
   antes de actuar cuando se activa el trigger.

Las reglas compactadas son Git safety, plan gate, workflow, orchestration,
routing heuristics, anti-loops, orchestration ops, data boundary y
orchestration routing. El contenido anterior se preservó completo en su
referencia correspondiente.

`.asdd/rule-loading.json` es el contrato procesable de la estrategia. Por
cada regla declara core, referencia, trigger, marcadores críticos y SHA-256 del
detalle normativo. `validate-template` comprueba rutas, hashes, readers,
marcadores, mayor detalle de la referencia y ausencia de duplicados.

## Reader explícito y fail-closed

Cada core contiene la ruta exacta y ejecuta:

```bash
node .claude/scripts/asdd-resolve-rule.mjs <nombre-regla>
```

La instrucción exige leer el archivo **COMPLETO** antes de actuar. Si resolver o
leer falla, la operación activada no continúa. Esto evita que mover detalle
fuera de always-on lo vuelva opcional o huérfano.

## Evidencia anti-orfandad

`test-conditional-rule-loading.mjs` crea un consumidor temporal aislado y, para
las nueve reglas, verifica la secuencia observable `resolve → Read → act`, la
presencia de marcadores críticos y el orden estricto de los pasos. Además:

- elimina una referencia y prueba que el flujo falla antes de `act`;
- restaura una regla desde su referencia y prueba que una regla hermana no se
  modifica;
- `test-rule-resolver.mjs` cubre las nueve rutas nuevas, las dos referencias
  previas y traversal inválido: 12/12.

## Métricas

| Métrica | Antes | B5 | Cambio |
|---|---:|---:|---:|
| Always-on total | 16.973 palabras | 5.822 | -65,70 % |
| Rules | 14.865 | 3.714 | -75,02 % |
| `CLAUDE.md` | 2.108 | 2.108 | 0 % |
| Mayor contexto efectivo medido | 41.713 | 30.562 | -26,73 % |
| Warnings de presupuesto | 22 | 21 | -1 |

B5 queda por debajo tanto del objetivo ADR-017 de 8.000 palabras como del
stretch de 6.000. Por ello `always_on_words` se promueve de warning a error; los
targets de B6/B7 permanecen en warning hasta disponer de su evidencia.

Fuente canónica:
`docs/baselines/2026-07-18-001-b5-always-on-rules.json`.

## Rollback

El rollback es independiente por entrada: copiar el contenido completo de la
referencia sobre su core y retirar únicamente esa referencia y su entrada del
manifiesto. No requiere revertir las demás reglas compactadas. El procedimiento
está probado en el consumidor temporal.

## Resultado

B5 cumple ADR-017 y la Enmienda 2 de ADR-005: reduce el costo universal,
conserva el detalle normativo, prueba el reader real, bloquea referencias rotas
y convierte el presupuesto alcanzado en gate de regresión. B6 puede iniciar.
