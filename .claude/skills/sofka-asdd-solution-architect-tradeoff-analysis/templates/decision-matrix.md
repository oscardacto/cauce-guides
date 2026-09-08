# Matriz de decisión — {Decisión}

**Fecha:** {YYYY-MM-DD}
**Autor:** {arquitecto + participantes}
**Decisión a documentar en:** ADR-{NNN}

## Contexto

{1 párrafo con la decisión a tomar y por qué se hace ahora.}

## Alternativas evaluadas

1. **{Alt A}:** {descripción 1 línea}
2. **{Alt B}:** {descripción 1 línea}
3. **{Alt C}:** {descripción 1 línea}

## Criterios y pesos

| Criterio | Peso | Justificación del peso |
|---|---|---|
| {…} | {%} | {por qué este peso} |
| {…} | {%} | {…} |
| **Total** | **100%** | |

## Matriz de scoring

| Criterio | Peso | Alt A | Alt B | Alt C |
|---|---|---|---|---|
| {Criterio 1} | {%} | {1-5} | {1-5} | {1-5} |
| {Criterio 2} | {%} | {1-5} | {1-5} | {1-5} |
| {Criterio 3} | {%} | {1-5} | {1-5} | {1-5} |
| **Score ponderado** | | **{n}** | **{n}** | **{n}** |

## Justificación de scores

### Alt A
- {Criterio 1} = {score}: {por qué}
- {Criterio 2} = {score}: {por qué}

### Alt B
- {…}

### Alt C
- {…}

## Recomendación

**Ganadora:** {Alt X} con score {n}.

**Margen sobre la siguiente:** {%}

{1-2 párrafos justificando la recomendación. Anclar en los criterios mejor
puntuados y reconocer los trade-offs aceptados.}

## Sensitivity analysis (si aplica)

| Atributo | Peso original | Cambio que invierte el ranking |
|---|---|---|
| {…} | {%} | {ej. +10% en Performance hace ganar Alt B} |

{Conclusión: la decisión es robusta / sensible al peso de X / requiere validar X con stakeholder Y}

## Riesgos identificados

Ver `{decision}-risks.md`.

## Approvers

- [ ] {Rol 1 — nombre}
- [ ] {Rol 2 — nombre}
