# Bounded Context: {Nombre}

**Propósito:** {Una frase: qué problema resuelve este BC.}
**Clasificación de subdomain:** Core | Supporting | Generic
**Equipo dueño:** {team / squad}

## Lenguaje ubicuo

| Término | Definición en este BC | Posibles colisiones |
|---|---|---|
| {término} | {definición operativa} | {otros BCs donde el término significa otra cosa} |

## Responsabilidades (qué SÍ hace)

- {…}
- {…}

## Fuera del scope (qué NO hace)

- {…}
- {…}

## Comandos (intenciones que recibe)

| Comando | Origen | Resultado esperado |
|---|---|---|
| `{NombreComando}` | {actor o BC} | {evento publicado o retorno} |

## Eventos (hechos que publica)

| Evento | Cuándo se publica | Consumidores conocidos |
|---|---|---|
| `{NombreEvento}` | {trigger} | {BCs que escuchan} |

## Queries (preguntas que responde)

| Query | Quién pregunta | Datos retornados |
|---|---|---|
| `get{X}` | {actor} | {forma del payload} |

## Aggregates principales

- **{AggregateRoot}** — invariante: {qué garantiza}
- **{AggregateRoot}** — invariante: {…}

## Dependencias

| Contexto upstream | Patrón | Acoplamiento |
|---|---|---|
| {Contexto B} | ACL / Conformist / Customer-Supplier | bajo / medio / alto |

| Contexto downstream | Patrón | Notas |
|---|---|---|
| {Contexto C} | OHS / Published Language | {…} |

## Calidad y métricas

- SLO principal: {ej. P95 latencia ≤ 80 ms}
- Tasa de cambio del BC: alta / media / baja
- Volumen / TPS esperado: {…}

## Riesgos / Open questions

- {…}
- {…}
