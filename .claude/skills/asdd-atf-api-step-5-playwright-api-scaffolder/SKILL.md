---
name: asdd-atf-api-step-5-playwright-api-scaffolder
description: Genera un .spec.ts por CP con validación de schema, captura de evidencia y assertions trazables a RN.
used_by:
  - asdd-atf-api-step-5-automation
---

## Propósito

Convertir cada CP del JSON canónico en un `.spec.ts` ejecutable. La conversión es **mecánica y determinista** — sin libertad creativa: mismo CP siempre produce el mismo spec.

**Principio:** los specs son **legibles** (un humano puede modificarlos), **trazables** (cada assertion menciona RN/AC/CP) y **completos** (no dejan validaciones implícitas).

## Cuándo invocar

Después de `bun-runner-setup`. Por cada WI con CPs aprobados.

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `wi_id` | string | WI |
| `test_cases` | object | Output de `test-case-designer` |
| `fixtures` | object | Output de `test-data-generator-api` |
| `parsed_contract` | object | Para schemas |
| `automation_path` | string | Path generado por `bun-runner-setup` |

## Estructura de un spec generado

```typescript
/**
 * CP-001 — Crear solicitud válida con fecha actual
 *
 * Cubre:
 *   - RN-001 (campos obligatorios)
 *   - RN-008 (creación en estado PENDING)
 *   - AC-001, AC-002
 *
 * Técnica: Decision Table
 * Endpoint: POST /osf/api/v1/pending-billing-quotas
 * Prioridad: high
 */
import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { loadFixtures } from '../helpers/fixtures-loader';
import { validateSchema } from '../helpers/schema-validator';
import { captureEvidence } from '../helpers/evidence-helper';
import { BillingRequestCreated } from '../schemas/wi-001-schemas';

test.describe('@wi-001 @happy-path @critical-flow @CP-001', () => {
  test('Crear solicitud válida con fecha actual', async ({ request }) => {
    const client = new ApiClient(request);
    const fixtures = await loadFixtures('wi-001');

    // Arrange
    const body = {
      cycle: fixtures.validCycle,
      distributorId: fixtures.validDistributor,
      billingPeriod: fixtures.validPeriod,
      periodProcessDate: fixtures.today(),
    };

    // Act
    const result = await client.call({
      cpId: 'CP-001',
      wiId: 'wi-001',
      method: 'POST',
      url: '/osf/api/v1/pending-billing-quotas',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    // Assert — status (RN-008)
    expect(result.status, 'Expected 201 per RN-008').toBe(201);

    // Assert — body shape
    expect(result.body, 'Body should have requestId').toHaveProperty('requestId');
    expect(result.body, 'Body should have status PENDING').toHaveProperty('status', 'PENDING');
    expect(result.body, 'Body should have createdAt').toHaveProperty('createdAt');

    // Assert — schema (Contract Testing)
    const schemaResult = validateSchema(BillingRequestCreated, result.body);
    expect(schemaResult.valid, `Schema BillingRequestCreated: ${schemaResult.errors?.join('; ')}`).toBe(true);

    // Capture evidence
    await captureEvidence({
      contextId: 'CP-001',
      contextType: 'execution',
      verdict: result.status === 201 ? 'pass' : 'fail',
      request: { method: 'POST', url: '/osf/api/v1/pending-billing-quotas', body, headers: { 'Content-Type': 'application/json' } },
      response: result,
    });
  });
});
```

## Mapeo JSON → TypeScript

| Campo JSON del CP | Código generado |
|---|---|
| `title` | Argumento de `test('...')` |
| `tags` | Concatenados en `describe(@tag1 @tag2 ...)` |
| `rules_covered`, `acs_covered`, `priority` | JSDoc del top del archivo |
| `preconditions[]` | Comentarios `// Precondition: ...` en Arrange |
| `request.body` | Objeto literal con referencias resueltas via `fixtures.{ID}` |
| `expected_response.status` | `expect(result.status).toBe(...)` |
| `expected_response.body_assertions[]` | 1 `expect(...).toXXX()` por assertion, con mensaje descriptivo |
| `expected_response.schema_ref` | `validateSchema(...)` con import del schema |
| `tags incluye @flaky-suspect` | Wrap en `test.skip` o agregar `test.flaky` |

## Reglas de generación

1. **Cada spec es autocontenido.** No depende de orden de ejecución con otros specs.
2. **Cada `expect` tiene mensaje descriptivo.** Cuando falla, el log dice POR QUÉ era esperado el valor.
3. **Captura de evidencia siempre.** Cada spec llama `captureEvidence` al final, sea pass o fail.
4. **No `console.log`.** Toda salida va por Playwright reporter o por evidence-helper.
5. **Schema validation no opcional para 2xx.** Si el CP tiene `schema_ref`, debe validar.
6. **Sin `wait`/`sleep` arbitrarios.** Si un escenario requiere espera (batch async), usar polling con timeout explícito documentado.

## Errores comunes

| Código | Causa |
|---|---|
| `SCAF-001` | CP referencia fixture inexistente — abortar antes de escribir spec |
| `SCAF-002` | CP sin `expected_response.status` — incompatible con automation |
| `SCAF-003` | CP con `schema_ref` apuntando a schema no exportado en `schemas/` |

## Cuándo NO invocar

- En `fast-track` cuando los specs del baseline son válidos (mismo `contract_hash`) — reutilizar
- En `retest` cuando solo 1 spec se debe re-ejecutar — leer el existente, no regenerar
- Para CPs sin `priority` o sin RN — no se generan specs sin trazabilidad

## Anti-patterns

- **Specs "creativos"** con setup elaborado que no está en el CP. Lo que no está en el CP no va al spec.
- **Asserts triviales tipo `expect(true).toBe(true)`** o `expect(result).toBeDefined()`. Cada assert valida algo del CP.
- **Try/catch que silencia errores** ("para que el test no falle"). Si falla, debe propagar.
- **Sleeps duros (`await new Promise(r => setTimeout(r, 5000))`)**. Usar `expect.poll` o waits explícitos.
- **Headers de auth en duro.** Siempre via `credentials-loader.ts`.

## Referencias

- Template: `templates/spec.ts.template`
- Ejemplo: `examples/example-CP-001.spec.ts`
