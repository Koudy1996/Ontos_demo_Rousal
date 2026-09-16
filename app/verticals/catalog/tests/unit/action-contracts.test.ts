import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { getActionResourcePermissionTargetResolver } from '../../../../packages/core-runtime/src/actions/definition.ts';

import { CorrectProductPayloadSchema, correctProductAction } from '../../src/actions/correct-product.action.ts';
import { CreateProductPayloadSchema, createProductAction } from '../../src/actions/create-product.action.ts';
import {
  ReactivateProductPayloadSchema,
  reactivateProductAction,
} from '../../src/actions/reactivate-product.action.ts';
import { RetireProductPayloadSchema, retireProductAction } from '../../src/actions/retire-product.action.ts';
import { UpdateProductPayloadSchema, updateProductAction } from '../../src/actions/update-product.action.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const classification = {
  affectsOpenSelection: false,
  evidenceRefs: ['urn:evidence:correction-1'],
  kind: 'COSMETIC_CORRECTION',
  productRef,
  reason: 'Correct Product',
} as const;
const scope = {
  authBindingId: '77777777-7777-4777-8777-777777777777',
  authContextRef: 'better-auth-session:catalog-contract',
  authMethod: 'session' as const,
  correlationId: 'catalog-contract',
  principalId: '88888888-8888-4888-8888-888888888888',
  tenantId,
};

describe('Catalog Product Action contracts', () => {
  it('exposes five explicitly provisioned tenant Actions with no legal-entity scope', () => {
    for (const action of [
      createProductAction,
      updateProductAction,
      retireProductAction,
      reactivateProductAction,
      correctProductAction,
    ]) {
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
      expect(action.descriptor.entrypoint.scope).toBe('tenant');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(action.descriptor.idempotency).toBe('required');
    }
  });

  it('requires a reason, stable target reference, and optimistic revision for mutations', () => {
    const create = Schema.decodeUnknownSync(CreateProductPayloadSchema);
    const update = Schema.decodeUnknownSync(UpdateProductPayloadSchema);
    const retire = Schema.decodeUnknownSync(RetireProductPayloadSchema);
    const reactivate = Schema.decodeUnknownSync(ReactivateProductPayloadSchema);
    const correct = Schema.decodeUnknownSync(CorrectProductPayloadSchema);

    expect(create({ reason: 'Create Product' }).reason).toBe('Create Product');
    expect(update({ expectedRevision: 1, name: 'Renamed', productRef, reason: 'Rename Product' }).productRef).toEqual(
      productRef,
    );
    expect(
      update({
        activateVariantRef: variantRef,
        expectedRevision: 1,
        productRef,
        reason: 'Activate Variant',
        targetLifecycle: 'ACTIVE',
      }).activateVariantRef,
    ).toEqual(variantRef);
    expect(retire({ expectedRevision: 1, productRef, reason: 'Retire Product' }).expectedRevision).toBe(1);
    expect(reactivate({ expectedRevision: 2, productRef, reason: 'Reactivate Product' }).expectedRevision).toBe(2);
    expect(
      correct({ classification, expectedRevision: 1, name: 'Corrected', productRef, reason: 'Correct Product' }).name,
    ).toBe('Corrected');
    expect(() => update({ expectedRevision: 0, productRef, reason: 'Invalid' })).toThrow();
    expect(() => correct({ expectedRevision: 1, name: 'Corrected', productRef, reason: 'Correct Product' })).toThrow();
    expect(
      correct({
        classification,
        expectedRevision: 1,
        name: 'Corrected',
        productRef,
        reason: 'Correct Product',
      }).classification.evidenceRefs,
    ).toEqual(['urn:evidence:correction-1']);
  });

  it('targets the Catalog root for creation and the exact Product Resource thereafter', () => {
    const createTarget = getActionResourcePermissionTargetResolver(createProductAction)?.(
      {
        reason: 'Create Product',
      },
      scope,
    );
    const updateTarget = getActionResourcePermissionTargetResolver(updateProductAction)?.(
      {
        expectedRevision: 1,
        name: 'Renamed',
        productRef,
        reason: 'Rename Product',
      },
      scope,
    );

    expect(createTarget).toEqual({
      permission: 'write',
      resource: {
        moduleId: 'commerce.catalog',
        resourceId: tenantId,
        resourceType: 'commerce.catalog.catalog-root',
      },
    });
    expect(updateTarget).toEqual({ permission: 'write', resource: productRef });
  });
});
