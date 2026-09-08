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
 * Generado: 2026-05-21T11:05:00-05:00 por sofka-asdd-atf-api-step-5-playwright-api-scaffolder
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

    // Arrange — preconditions
    // Existe distributorId DIST-TEST-001 en el catálogo
    // No existe solicitud previa con la misma llave de unicidad

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
    expect(result.body, 'Body should contain requestId field').toHaveProperty('requestId');
    expect((result.body as { requestId: string }).requestId, 'requestId must be UUID')
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(result.body, 'status must be PENDING per RN-008').toHaveProperty('status', 'PENDING');
    expect(result.body, 'Body should contain createdAt field').toHaveProperty('createdAt');

    // Assert — schema (Contract Testing)
    const schemaResult = validateSchema(BillingRequestCreated, result.body);
    expect(
      schemaResult.valid,
      `Schema BillingRequestCreated: ${schemaResult.errors?.join('; ') ?? 'OK'}`,
    ).toBe(true);

    // Capture evidence
    await captureEvidence({
      contextId: 'CP-001',
      contextType: 'execution',
      verdict: result.status === 201 ? 'pass' : 'fail',
      request: {
        method: 'POST',
        url: '/osf/api/v1/pending-billing-quotas',
        body,
        headers: { 'Content-Type': 'application/json' },
      },
      response: result,
    });
  });
});
