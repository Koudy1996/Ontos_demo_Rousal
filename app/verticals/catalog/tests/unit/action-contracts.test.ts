import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ActionCommitIndeterminate,
  ActionPermissionCheckError,
  ActionPermissionDenied,
  ActionRequestHashConflict,
} from '@app/core-runtime';
import { getActionResourcePermissionTargetResolver } from '../../../../packages/core-runtime/src/actions/definition.ts';
import { mapCorrectProductActionProblem } from '../../api/correct-product-action-problems.ts';
import { mapCreateProductActionProblem } from '../../api/create-product-action-problems.ts';
import { mapReactivateProductActionProblem } from '../../api/reactivate-product-action-problems.ts';
import { mapRetireProductActionProblem } from '../../api/retire-product-action-problems.ts';
import { mapUpdateProductActionProblem } from '../../api/update-product-action-problems.ts';

import { CorrectProductPayloadSchema, correctProductAction } from '../../src/actions/correct-product.action.ts';
import { ProductSelectionRevalidationRequiredSchema } from '../../shared/actions/correct-product.ts';
import { ProductPersistenceConflict } from '../../shared/domain/product-errors.ts';
import { CatalogPersistenceConflict, CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';
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
  it('reports known persistence conflicts as non-retryable conflicts on every public Action', () => {
    const mappers = [
      mapCorrectProductActionProblem,
      mapCreateProductActionProblem,
      mapReactivateProductActionProblem,
      mapRetireProductActionProblem,
      mapUpdateProductActionProblem,
    ] as const;
    for (const mapProblem of mappers) {
      for (const failure of [
        new CatalogPersistenceConflict({
          code: 'catalog_persistence_conflict',
          conflict: 'ACTION_INVOCATION_ID',
          reason: 'Known invocation collision',
        }),
        new ProductPersistenceConflict({
          code: 'product_persistence_conflict',
          conflict: 'PRODUCT_ID',
          reason: 'Known Product collision',
        }),
      ]) {
        const problem = mapProblem(failure);
        expect(problem.status).toBe(409);
        expect(problem).not.toHaveProperty('retryable');
      }
    }
  });

  it('keeps denial, authorization outage, stale intent, and indeterminate commit distinct', () => {
    const denied = mapCreateProductActionProblem(
      new ActionPermissionDenied({ code: 'action_permission_denied', reason: 'Denied' }),
    );
    const checkUnavailable = mapCreateProductActionProblem(
      new ActionPermissionCheckError({ code: 'action_permission_check_failed', reason: 'Unavailable' }),
    );
    const staleIntent = mapCreateProductActionProblem(
      new ActionRequestHashConflict({ code: 'action_request_hash_conflict', reason: 'Different payload' }),
    );
    const persistenceUnavailable = mapCreateProductActionProblem(
      new CatalogPersistenceUnavailable({
        code: 'catalog_persistence_unavailable',
        reason: 'Unavailable',
      }),
    );
    const indeterminate = mapCreateProductActionProblem(
      new ActionCommitIndeterminate({
        code: 'action_commit_indeterminate',
        invocationId: '44444444-4444-4444-8444-444444444444',
        reason: 'Commit unconfirmed',
      }),
    );

    expect(denied.status).toBe(403);
    expect(checkUnavailable.status).toBe(503);
    expect(staleIntent.status).toBe(409);
    expect(persistenceUnavailable.status).toBe(503);
    expect(indeterminate).toMatchObject({
      resolution: 'RESOLVE_COMMIT',
      retryCommand: false,
      status: 503,
    });
    expect(JSON.stringify(denied)).not.toContain(productRef.resourceId);
  });

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
    expect(
      update({ expectedRevision: 1, productRef, reason: 'Activate Product', targetLifecycle: 'ACTIVE' }).productRef,
    ).toEqual(productRef);
    expect(() =>
      Schema.decodeUnknownSync(UpdateProductPayloadSchema, { onExcessProperty: 'error' })({
        expectedRevision: 1,
        name: 'Material rename',
        productRef,
        reason: 'Bypass correction',
      }),
    ).toThrow();
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
        productRef,
        reason: 'Activate Product',
        targetLifecycle: 'ACTIVE',
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

  it('publishes an exact typed #479 revalidation handoff for material open-selection impact', () => {
    const handoff = Schema.decodeUnknownSync(ProductSelectionRevalidationRequiredSchema)({
      affectedVariantProductRef: productRef,
      affectedVariantRef: variantRef,
      evidenceRefs: ['urn:evidence:correction-1'],
      kind: 'REVALIDATION_REQUIRED',
      productRef,
      reason: 'Correct Product',
      sourceRevision: 2,
    });
    expect(handoff.affectedVariantRef).toEqual(variantRef);
    expect(() =>
      Schema.decodeUnknownSync(ProductSelectionRevalidationRequiredSchema)({
        affectedVariantProductRef: productRef,
        affectedVariantRef: { ...variantRef, tenantId: '99999999-9999-4999-8999-999999999999' },
        evidenceRefs: ['urn:evidence:correction-1'],
        kind: 'REVALIDATION_REQUIRED',
        productRef,
        reason: 'Cross-tenant Variant',
        sourceRevision: 2,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProductSelectionRevalidationRequiredSchema)({
        affectedVariantProductRef: { ...productRef, resourceId: '99999999-9999-4999-8999-999999999999' },
        affectedVariantRef: variantRef,
        evidenceRefs: ['urn:evidence:correction-1'],
        kind: 'REVALIDATION_REQUIRED',
        productRef,
        reason: 'Wrong Product owner',
        sourceRevision: 2,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProductSelectionRevalidationRequiredSchema)({
        kind: 'REVALIDATION_REQUIRED',
        productRef,
        reason: 'Missing evidence',
        sourceRevision: 2,
      }),
    ).toThrow();
    expect(correctProductAction.descriptor.domainEvents).toHaveProperty(
      'commerce.catalog.selection-revalidation-required.v1',
    );
  });
});
