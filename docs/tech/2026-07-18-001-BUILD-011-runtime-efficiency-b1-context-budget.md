# B1 — Parser YAML y gate de contexto efectivo

Fecha: 2026-07-18  
Run: `2026-07-18-001`  
Estado: `done`  
Decisión: ADR-017 aceptada

## Cambio

Se sustituyó el regex que solo reconocía listas `skills` de bloque por un
parser YAML mínimo compartido y fail-fast para el frontmatter ASDD. Soporta:

- listas inline y de bloque equivalentes;
- listas vacías y campo ausente;
- comillas simples/dobles, espacios, comentarios y CRLF;
- rechazo determinista de claves duplicadas, listas malformadas y nesting no
  soportado.

El mismo parser alimenta `validate-template` y el analizador de contexto, por
lo que validación e instrumentación ya no discrepan.

## Gate por capas

El reporte canónico publica:

```text
always_on + agent + eager_skills + active_command + hook_injection
= measured_effective_context
```

Las referencias rotas fallan integridad. Dependencias externas declaradas en
`cli-contract.json` no suman cero silenciosamente: aparecen en
`unmeasured_components` con agente, skill y provider.

Los targets aceptados por ADR-017 se activaron en etapa `warning`:

| Target | Límite |
|---|---:|
| always-on | 8.000 words |
| eager skills por agente | 1 |
| agente + skill inicial | 10.000 words |
| coordinador delgado | 3.500 words |

Los límites legacy continúan como gates de error contra regresión. El techo
legacy `agent_with_skills` cambió de 12.000 a 21.000 porque 12.000 dependía del
parser defectuoso; no se relajó un dato válido. El target normativo sigue en
10.000 y la deuda queda visible hasta B5–B7.

## Evidencia

- parser focalizado: inline/block, empty/absent, quotes, CRLF y errores PASS;
- budget focalizado: fórmula, integridad, warnings, excepciones y componentes
  no medidos PASS;
- runtime metrics PASS;
- `validate-template`: 26 OK, 3 warnings, 0 errores;
- 22 deudas de contexto visibles en el warning nuevo;
- mayor payload inicial corregido: Tech Lead, 20.349 words;
- combinación efectiva conservadora mayor: 41.858 words.

Baseline procesable:
`docs/baselines/2026-07-18-001-b1-context-budget.json`.

## Rollback

Revertir el commit B1 restaura parser/policy previos. No se deben conservar los
21.000 words con el parser anterior: el ceiling corregido solo es válido junto
con la medición YAML semántica. Ningún archivo de agente, skill o rule fue
migrado en este slice.

## Limitaciones y gates siguientes

- `hook_injection` usa la última medición versionada y debe actualizarse en B4.
- `active_command` usa el máximo observado como combinación conservadora; no
  afirma que todas las capas coexistan en cada turno.
- tool/MCP schemas y tokens internos del proveedor siguen no medidos.
- B5–B7 reducen la deuda; B9 endurece targets solo con evidencia verde.
