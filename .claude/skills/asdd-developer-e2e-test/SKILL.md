---
name: asdd-developer-e2e-test
description: Tests end-to-end de flujos críticos que cruzan boundaries reales — UI, API, base de datos y servicios.
---

## Rol

Escritor de tests end-to-end (E2E). Verifica **flujos críticos completos** desde la perspectiva del usuario, cruzando todos los boundaries reales del sistema (UI → API → dominio → persistencia / servicios). Es el vértice de la pirámide de tests que el developer posee: `unit` → `integration` → `e2e`.

## Cuándo activar

- Un flujo crítico de usuario debe verificarse de punta a punta (ej. registro → login → primera acción de valor)
- El test debe cruzar boundaries de red / múltiples servicios / la UI real
- Fase: **Construir** (al cerrar la feature, después de unit + integration)

## Diferencia con integration y con el ATF API

| Dimensión | Integration test | E2E test (este skill) | ATF API (`asdd-atf-api-qa-engineer`) |
|---|---|---|---|
| Scope | Componentes dentro de UN servicio | Flujo de usuario completo, múltiples servicios/UI | Contrato OpenAPI de la API REST |
| Boundaries de red | No los cruza | Los cruza (reales) | Solo la API bajo prueba |
| Herramientas típicas | Test DB, test container | Playwright / Cypress / Detox | Bun + Playwright API / Newman |
| Dueño | developer | developer | pipeline ATF (QA de API) |

> **Límite con el ATF:** este skill cubre los E2E de **flujo de aplicación/UI** que el developer escribe junto a su feature. La **QA de contrato de API REST** (ISTQB, QGS, clasificación de defectos) es del `asdd-atf-api-qa-engineer`, no de este skill. Si el flujo es puramente de API REST contra un contrato → ese es trabajo del ATF.

## Qué cubrir (flujos críticos, no exhaustivo)

| Escenario | Descripción |
|---|---|
| Camino feliz crítico | El flujo de valor principal de la feature, de punta a punta |
| Recuperación de error visible al usuario | El sistema falla y el usuario ve un estado manejado, no un crash |
| Persistencia observable | Lo que el usuario hizo persiste y se refleja al volver a entrar |

Los E2E son **caros y lentos**: cubrir solo los flujos de mayor riesgo/valor. La cobertura de ramas lógicas vive en unit/integration, no acá.

## Estructura de un test E2E

```
Setup (entorno e2e: app levantada + datos seed) →
  Execute (manejar la UI/API como lo haría el usuario) →
    Assert (verificar el resultado observable + el estado persistido) →
      Teardown (limpiar el entorno e2e)
```

## Outputs

- Archivo de test en `tests/e2e/` o equivalente en la convención del proyecto
- Entorno e2e aislado (no la base de datos de desarrollo)

## Cuándo NO invocar

- La lógica se puede verificar aislada → `developer-unit-test` (más rápido, más barato).
- La colaboración es dentro de un servicio sin cruzar la red → `developer-integration-test`.
- Es QA de contrato de una API REST (plan ISTQB, casos, automatización Playwright/Newman) → `asdd-atf-api-qa-engineer`.
- No hay entorno e2e listo (app desplegable, datos seed) → pedir a `devops-engineer-iac` que lo provisione antes.

## Anti-patterns

- **Pirámide invertida** — muchos E2E y pocos unit. Los E2E son lentos y frágiles; deben ser la minoría (flujos críticos), no la base.
- **E2E que duplican integration** — si el flujo no cruza boundaries reales, es un integration test disfrazado de E2E (lento sin valor extra).
- **Selectores frágiles** — acoplarse a estructura del DOM / texto volátil en vez de roles/test-ids estables → tests que rompen ante cambios cosméticos.
- **Sin aislamiento de datos** — compartir estado entre tests E2E hace que el orden de ejecución los rompa en CI.
- **Esperas fijas (`sleep`)** — usar esperas por condición/estado, no timeouts arbitrarios, para evitar flakiness.
