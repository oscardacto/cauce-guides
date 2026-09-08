# ASDD Routing — Modificador de Tamaño

Modificador `codebase_size` para ruta LIGHT en proyectos grandes. Complementa `asdd-routing-heuristics.md`.

## Modificador de tamaño: `codebase_size`

`codebase_size` es un **modificador transversal** del comportamiento del
agente delegado en ruta LIGHT — **no cambia la clasificación LIGHT/FULL ni
el tipo del request**. Es resuelto por **ORC-001-D** (ver `asdd-orchestration-routing.md`) y consumido por
**ORC-001-B** (ver `asdd-orchestration.md`).

### Cuándo aplica

| codebase_size | Tipo request | Ruta | Efecto |
|---|---|---|---|
| `small` | cualquiera | cualquiera | Sin cambios (comportamiento histórico) |
| `large` | Tipo 1 (Query) | LIGHT | `explorer` con scope restriction |
| `large` | Tipo 2 (Cambio atómico) | LIGHT | `explorer` previo → `developer` con scope restriction |
| `large` | Tipo 3 (Bug con detalle) | LIGHT | `explorer` previo → `developer` con scope restriction |
| `large` | Tipo 4 (Bug por comportamiento) | LIGHT | `explorer` con scope restriction; escala a FULL si scope se expande |
| `large` | Tipo 5-6 | FULL | Sin scope restriction (FULL necesita visión holística) |

### Por qué Tipo 2 y Tipo 3 obtienen explorer previo

En proyectos `large`, incluso un "cambio atómico" puede tener referencias
no obvias al símbolo a modificar. El explorer hace una pasada barata de
discovery (grep + lectura selectiva) y produce el set acotado de archivos
que el developer debe tocar. Sin este paso, el developer paga el costo de
explorar todo el codebase y suele saturar la sesión.

### Escalamiento esperado

El contrato universal de escalamiento (`ORC-001-C` en `asdd-orchestration-routing.md`) sigue vigente sin
cambios. La inyección de scope restriction **aumenta naturalmente la tasa
de escalamiento** con motivo `scope_mayor` — esto es comportamiento
deseado, no error. Es el mecanismo de auto-corrección que vuelve visible
un request mal clasificado como LIGHT.

### Override manual

Para fijar el modificador sin auto-detección, setear en
`.asdd/asdd.lock`:

```json
"project_context": {
  "maturity": "large"
}
```

Valores válidos: `"small"`, `"large"`, `null` (default → auto-detección).
