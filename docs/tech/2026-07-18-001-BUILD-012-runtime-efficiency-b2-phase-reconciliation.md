# B2 — Reconciliación consciente de fase (H-09)

Fecha: 2026-07-18  
Run: `2026-07-18-001`  
Estado: `done`

## Problema

El validator anterior exigía `build.index_ref` siempre que existía un run.
Durante Specify y Analyze temprano el INDEX todavía no existe, por lo que H-09
producía un error y empujaba a crear un INDEX ficticio o a apuntar al brief.

Además, CLI y validator implementaban parsers distintos. Ambos ignoraban la
fila `1R`, porque solo aceptaban órdenes numéricos, y el identificador
`SPIKE-1R` podía degradarse a `SPIKE-1`.

## Contrato implementado

| Ciclo | Sin INDEX | Con `index_ref` |
|---|---|---|
| Sin run | skip explícito | no aplica |
| Specify activo/completo | skip explícito | validar inmediatamente |
| Analyze activo | skip explícito | validar inmediatamente |
| Analyze completo | error | validar y reconciliar |
| Design o posterior | error | validar y reconciliar |

Un `index_ref` válido debe ser relativo, permanecer dentro del proyecto,
apuntar a `docs/specs/*-index.md`, existir y contener slices únicos con estado.
Briefs, auditorías, rutas absolutas y traversal se rechazan.

Los estados `done` y `corrected_by_*` son terminales. El parser reconoce
`SPIKE-1R`, `B3/S1`, `S1` y `DOC-1`. La reconciliación conserva descripciones
existentes, actualiza pendientes, provenance y checkpoint mediante rename
atómico. Un skip temprano no escribe metadata falsa.

## Diseño

La semántica vive en un único módulo puro consumido por:

- `asdd-reconcile-run-state.mjs`;
- `validate-template.mjs`;
- fixtures de regresión.

Esto elimina la divergencia histórica entre CLI y validator. El CLI conserva
la verificación Git de branch/ancestor; el validator exige provenance cuando
el INDEX ya debe estar reconciliado.

## Evidencia

- matriz de ciclo de vida: 14/14 PASS;
- current run antes del cierre B2: 7 terminales, 9 pendientes, 0 drift/error;
- `validate-template`: 26 OK, 3 warnings de deuda conocida, 0 errores;
- no se creó INDEX ficticio ni se apuntó al brief.

Baseline:
`docs/baselines/2026-07-18-001-b2-reconciliation-matrix.json`.

## Rollback

Revertir el commit B2 restaura el reconciliador previo. No debe conservarse el
validator nuevo sin la librería compartida ni viceversa. `--write` sigue siendo
opt-in; sin el flag, drift/error nunca modifica `.asdd-run.json`.
