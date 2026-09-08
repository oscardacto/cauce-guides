# ASDD Routing Heuristics — núcleo always-on

Clasificar toda solicitud como: **Tipo 1 Query**, **Tipo 2 cambio atómico**,
**Tipo 3 bug con detalle**, **Tipo 4 bug por comportamiento**, **Tipo 5
feature/HU/spec** o **Tipo 6 abierta/ambigua**. Tipo 5/6, artefactos ASDD,
escritura sensible o cambio transversal fuerzan FULL. Query local es TRIVIAL;
cambio explícito seguro es LIGHT; bug investigable acotado es MEDIUM. Confianza
baja escala exactamente un nivel.

Data D0–D7 nunca reemplaza la fase ORC: primero fase, luego subfase Data. Si
matchean Data y Software, preguntar una vez y no autoelegir. Todo agente LIGHT
puede devolver `ESCALAMIENTO REQUERIDO`; el orquestador conserva progreso y
reclasifica.

## Carga condicional obligatoria

Antes de enrutar algo no TRIVIAL o resolver una ambigüedad, ejecutá
`node .claude/scripts/sofka-asdd-resolve-rule.mjs sofka-asdd-routing-heuristics`
y leé **COMPLETO**
`.claude/references/rules/sofka-asdd-routing-heuristics.md`. Fallo de lectura =
FULL conservador, sin delegación previa.
