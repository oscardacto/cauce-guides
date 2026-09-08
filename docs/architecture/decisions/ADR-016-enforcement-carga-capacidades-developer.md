# ADR-016 — Enforcement de carga bajo demanda para developers

Fecha: 2026-07-17 | Estado: Aceptada  
Deciders: Maintainers ASDD  
Relacionado con: ADR-013, ADR-015

## Contexto

ADR-013 redujo el contexto eager de los agentes developer moviendo sus skills a
carga bajo demanda. Un resolver que devuelve solo la ruta de `SKILL.md` no
demuestra que el modelo leyó esa capacidad antes de modificar código.

## Decisión

Los planes canónicos de `sofka-asdd-developer-backend` y
`sofka-asdd-developer-frontend` declaran una única `capability` permitida. El
agente ejecuta `sofka-asdd-load-capability.mjs {capability}`, que entrega el
contenido del `SKILL.md` al contexto. El hook de operaciones registra la carga
por `agent_id` y bloquea Edit, Write o Bash sensible hasta que coincida con la
capability aprobada.

Las lecturas locales allow-listed permanecen permitidas antes de la carga. Un
scope o command-mismatch conserva precedencia para que los rechazos expliquen
la autorización incorrecta real. Cambiar capability requiere un plan/challenge
nuevo.

## Consecuencias

**Habilita:** carga perezosa verificable y evidencia runtime de la capacidad
entregada al agente.  
**Costo:** un comando local de carga antes de la primera operación protegida.  
**Límite:** se garantiza que el contenido fue entregado al contexto, no que el
modelo razone correctamente sobre él.

## Historial de estados

| Fecha | Estado anterior | Estado nuevo | Motivo |
|---|---|---|---|
| 2026-07-17 | — | Aceptada | Cerrar la brecha procedimental de ADR-013 sin reintroducir skills eager. |
