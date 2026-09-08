# B6 — Lazy capabilities generalizadas

## Objetivo

Extender el patrón lazy ya usado por Developer Backend/Frontend a Tech Lead,
UI, Solution Architect, Producto, UX y DevOps, sin entregar catálogos completos
al iniciar ni permitir que una carga adicional amplíe la autoridad del plan.

## Contrato implementado

`.sofka-asdd/capability-loading.json` centraliza ocho catálogos: los dos
developers existentes y los seis agentes migrados. Cada entrada fija:

- catálogo canónico de capabilities instaladas;
- cero skills eager para los agentes administrados;
- una capability primaria obligatoria en el plan;
- máximo una dependency adicional, explícita en el mismo challenge.

El plan normaliza aliases, rechaza capabilities ajenas, duplicadas o ausentes y
persiste `capability`, `dependencies[]` y `loaded_capabilities[]` solo en el
store efímero de autorización. Cargar la dependency no reemplaza la primaria.
Una operación Edit/Write/Bash sensible continúa bloqueada hasta cargar la
primaria; una segunda no aprobada o un tercer skill produce
`capability-mismatch`.

## Migración de agentes

Los seis frontmatters dejaron de precargar 54 skills. Cada cuerpo conserva su
catálogo funcional y ahora incluye un reader explícito:

```bash
node .claude/scripts/sofka-asdd-load-capability.mjs {capability-aprobada}
```

El reader exige detenerse si resolver, cargar o leer falla. El núcleo ORC y el
detalle de plan-gate documentan el binding primary/dependency. El SHA-256 de la
referencia normativa se actualizó en el manifiesto B5.

## Seguridad y anti-orfandad

`conditional-capability-loading` valida como error:

- agente y SKILL.md existentes;
- nombres canónicos, catálogos no vacíos y sin duplicados;
- límite eager `0..1` y, para schema v1, una dependency máxima;
- sección de carga, comando loader y contrato `dependencies` en el agente.

`test-lazy-capability-loading.mjs` ejecuta un consumidor por cada agente B6:

1. emite y aprueba challenge con primary + dependency;
2. prueba que actuar antes de primary falla;
3. carga dependency y confirma que aún no puede actuar;
4. autoriza y ejecuta el loader real de primary;
5. comprueba que entrega exactamente el `SKILL.md` y permite la operación;
6. rechaza una capability no aprobada.

También prueba primary ausente, dos dependencies y rollback aislado por agente.

## Métricas

| Métrica | Antes | B6 | Cambio |
|---|---:|---:|---:|
| Payload inicial agregado, seis agentes | 78.927 | 9.885 | -87,48 % |
| Mayor agent + eager skills | 20.349 | 11.073 | -45,59 % |
| Mayor contexto efectivo medido | 30.562 | 21.289 | -30,34 % |
| Referencias eager en seis agentes | 54 | 0 | -100 % |
| Deudas de presupuesto | 21 | 12 | -9 |

El always-on cambia 5.822→5.825 palabras por la aclaración de tres palabras en
ORC-010 sobre el binding primary/dependency; permanece bajo el stretch de 6.000.

El target global de eager skills sigue en warning porque quedan agentes
especializados fuera del alcance nominal B6. Los ocho agentes del manifiesto sí
quedan protegidos por un gate de error específico, evitando regresión sin
ocultar las doce deudas restantes.

Fuente: `docs/baselines/2026-07-18-001-b6-lazy-capabilities.json`.

## Rollback

Por agente: restaurar en su frontmatter el array `skills` desde el catálogo del
manifiesto y retirar únicamente su entrada de `capability-loading.json`. El
rollback no toca catálogos hermanos ni las entradas Developer ya existentes.

## Resultado

B6 cumple ADR-017, RN-004 y AB-005 para los seis agentes definidos: una sola
capability inicial, dependency explícita, tracking efímero, operación protegida
ligada a primary, reader verificable y E2E anti-orfandad. B7 puede iniciar.
