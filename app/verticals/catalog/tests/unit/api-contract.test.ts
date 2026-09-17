import { expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';
import { ReadHandlerNotFound } from '@app/core-runtime';

import {
  catalogApiContract,
  catalogAuthorityBundles,
  catalogOutcomeHttpStatus,
  catalogOperationContexts,
  catalogPublicOperationContracts,
  CatalogOperationOutcomeSchema,
} from '../../shared/api.ts';
import { ProductDetailApi } from '../../shared/apis/product-detail.ts';
import { ProductHistoryApi } from '../../shared/apis/product-history.ts';
import { CategoryRevisionConflict } from '../../shared/actions/create-product-category.ts';
import { mapAddProductCategoryAssignmentActionProblem } from '../../api/add-product-category-assignment-action-problems.ts';
import { mapCreateProductCategoryActionProblem } from '../../api/create-product-category-action-problems.ts';
import { mapMoveProductCategoryActionProblem } from '../../api/move-product-category-action-problems.ts';
import { mapRemoveProductCategoryAssignmentActionProblem } from '../../api/remove-product-category-assignment-action-problems.ts';
import { mapRenameProductCategoryActionProblem } from '../../api/rename-product-category-action-problems.ts';
import { mapRetireProductCategoryActionProblem } from '../../api/retire-product-category-action-problems.ts';
import { mapCreateVariantActionProblem } from '../../api/create-variant-action-problems.ts';
import { mapChangeVariantActionProblem } from '../../api/change-variant-action-problems.ts';
import { mapRetireVariantActionProblem } from '../../api/retire-variant-action-problems.ts';
import { mapReactivateVariantActionProblem } from '../../api/reactivate-variant-action-problems.ts';
import { VariantActionConflict } from '../../src/actions/variant-action-support.ts';
import { VariantCurrentBasisUnavailable } from '../../src/persistence/variant-persistence.ts';
import { CreateVariantActionApi } from '../../shared/apis/create-variant-action.ts';
import { ChangeVariantActionApi } from '../../shared/apis/change-variant-action.ts';
import { RetireVariantActionApi } from '../../shared/apis/retire-variant-action.ts';
import { ReactivateVariantActionApi } from '../../shared/apis/reactivate-variant-action.ts';
import {
  ProductCategoryClassificationApi,
  ProductCategoryClassificationResponseSchema,
} from '../../shared/apis/product-category-classification.ts';
import {
  ProductCategoryHistoryApi,
  ProductCategoryHistoryResponseSchema,
} from '../../shared/apis/product-category-history.ts';
import { productDetailRead, readProductDetail } from '../../src/api/product-detail.read.ts';
import { productHistoryRead } from '../../src/api/product-history.read.ts';
import type { CatalogPersistence } from '../../src/persistence/catalog-persistence.ts';

it('publishes governed Product detail and historical-read APIs behind the Catalog BFF prefix', () => {
  expect(catalogApiContract).toEqual({
    apiPrefix: '/catalog-api',
    basePath: '/catalog-api/catalog',
    ownerId: 'catalog',
    readinessPath: '/catalog-api/catalog/readiness',
  });
  expect(catalogOperationContexts.readiness).toMatchObject({
    method: 'GET',
    operationId: 'CatalogApi:catalog:readiness',
    routePath: '/catalog/readiness',
  });
  expect(ProductDetailApi).toBeDefined();
  expect(ProductHistoryApi).toBeDefined();
  expect(ProductCategoryClassificationApi).toBeDefined();
  expect(ProductCategoryHistoryApi).toBeDefined();
});

it('publishes four independent Variant Action transports with redacted conflicts and unavailable Current basis', () => {
  expect([CreateVariantActionApi, ChangeVariantActionApi, RetireVariantActionApi, ReactivateVariantActionApi]).toEqual([
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
  ]);
  const mappers = [
    mapCreateVariantActionProblem,
    mapChangeVariantActionProblem,
    mapRetireVariantActionProblem,
    mapReactivateVariantActionProblem,
  ] as const;
  for (const mapper of mappers) {
    const conflict = mapper(
      new VariantActionConflict({
        code: 'variant_action_conflict',
        conflict: 'IDENTITY',
        reason: 'secret tenant and variant identity',
      }),
    );
    expect(conflict).toMatchObject({ code: 'variant_action_conflict', status: 409 });
    expect(JSON.stringify(conflict)).not.toContain('secret');
    const unavailable = mapper(
      new VariantCurrentBasisUnavailable({
        code: 'variant_current_basis_unavailable',
        reason: 'private lookup failed',
      }),
    );
    expect(unavailable).toMatchObject({ code: 'variant_current_basis_unavailable', retryable: true, status: 503 });
    expect(JSON.stringify(unavailable)).not.toContain('private');
  }
});

it('keeps empty classification distinct from unavailable with paired revision evidence', () => {
  const productRef = {
    moduleId: 'commerce.catalog',
    resourceId: '22222222-2222-4222-8222-222222222222',
    resourceType: 'commerce.catalog.product',
    tenantId: '11111111-1111-4111-8111-111111111111',
  } as const;
  expect(
    Schema.decodeUnknownSync(ProductCategoryClassificationResponseSchema)({
      ancestors: [],
      directCategories: [],
      productRef,
      revision: { assignments: 0, hierarchy: 0 },
      status: 'AVAILABLE',
    }),
  ).toMatchObject({ directCategories: [], status: 'AVAILABLE' });
  expect(() =>
    Schema.decodeUnknownSync(ProductCategoryClassificationResponseSchema)({ status: 'UNAVAILABLE' }),
  ).toThrow();
});

it('maps Category revision conflicts to redacted, actionable 409 problems across all Actions', () => {
  const categoryRef = {
    moduleId: 'commerce.catalog',
    resourceId: '33333333-3333-4333-8333-333333333333',
    resourceType: 'commerce.catalog.product-category',
    tenantId: '11111111-1111-4111-8111-111111111111',
  } as const;
  const conflict = new CategoryRevisionConflict({
    actualRevision: 4,
    categoryRef,
    code: 'category_revision_conflict',
    expectedRevision: 3,
    reason: 'internal revision context',
  });
  const mappers = [
    mapAddProductCategoryAssignmentActionProblem,
    mapCreateProductCategoryActionProblem,
    mapMoveProductCategoryActionProblem,
    mapRemoveProductCategoryAssignmentActionProblem,
    mapRenameProductCategoryActionProblem,
    mapRetireProductCategoryActionProblem,
  ] as const;
  for (const mapProblem of mappers) {
    const problem = mapProblem(conflict);
    expect(problem).toMatchObject({
      actualRevision: 4,
      code: 'category_revision_conflict',
      expectedRevision: 3,
      status: 409,
    });
    expect(JSON.stringify(problem)).not.toContain(categoryRef.resourceId);
    expect(JSON.stringify(problem)).not.toContain(categoryRef.tenantId);
    expect(JSON.stringify(problem)).not.toContain('internal revision context');
  }
});

it('requires retained Category history rather than a Current fallback', () => {
  const categoryRef = {
    moduleId: 'commerce.catalog',
    resourceId: '33333333-3333-4333-8333-333333333333',
    resourceType: 'commerce.catalog.product-category',
    tenantId: '11111111-1111-4111-8111-111111111111',
  } as const;
  expect(() =>
    Schema.decodeUnknownSync(ProductCategoryHistoryResponseSchema)({
      categoryRef,
      events: [],
      historical: true,
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(ProductCategoryHistoryResponseSchema)(
      {
        categoryRef,
        current: { lifecycle: 'ACTIVE', name: 'Current' },
        events: [],
        historical: true,
      },
      { onExcessProperty: 'error' },
    ),
  ).toThrow();
});

it('keeps current-detail and historical reads separately permissioned and tenant-scoped', () => {
  expect(productDetailRead.descriptor.entrypoint).toMatchObject({
    access: 'read',
    authorization: { kind: 'context_permission', permission: 'commerce.catalog.read.product-detail' },
    scope: 'tenant',
  });
  expect(productHistoryRead.descriptor.entrypoint).toMatchObject({
    access: 'historical_read',
    authorization: { kind: 'context_permission', permission: 'commerce.catalog.read.product-history' },
    scope: 'tenant',
  });
  for (const read of [productDetailRead, productHistoryRead]) {
    expect(read.descriptor.legalEntityScope).toBe('forbidden');
    expect(read.descriptor.permissionTarget).toBe('tenant');
    expect(read.descriptor.resourcePermission).toBeUndefined();
  }
});

it.effect('rejects a foreign Product before resolving tenant-local persistence', () =>
  Effect.gen(function* rejectForeignProduct() {
    let currentReads = 0;
    const services: CatalogPersistence = {
      correct: () => Effect.die('unused'),
      create: () => Effect.die('unused'),
      getCreatedByInvocation: () => Effect.die('unused'),
      getCurrent: () => {
        currentReads += 1;
        return Effect.die('foreign Product was read');
      },
      getHistory: () => Effect.die('unused'),
      reactivate: () => Effect.die('unused'),
      retire: () => Effect.die('unused'),
      update: () => Effect.die('unused'),
    };
    const result = yield* readProductDetail(
      {
        productRef: {
          moduleId: 'commerce.catalog',
          resourceId: '22222222-2222-4222-8222-222222222222',
          resourceType: 'commerce.catalog.product',
          tenantId: '99999999-9999-4999-8999-999999999999',
        },
      },
      '11111111-1111-4111-8111-111111111111',
      services,
    ).pipe(Effect.flip);
    expect(Schema.is(ReadHandlerNotFound)(result)).toBe(true);
    expect(currentReads).toBe(0);
  }),
);

it('publishes only explicitly implemented atomic permissions with disjoint authority bundles', () => {
  const contracts = Object.entries(catalogPublicOperationContracts);
  const permissions = contracts.map(([, contract]) => contract.permission);
  expect(new Set(permissions).size).toBe(contracts.length);
  for (const [key, contract] of contracts) {
    expect(contract.version).toBe('1');
    // Business targets are descriptive, not per-resource SpiceDB grants.
    expect([
      'attribute-definition',
      'controlled-attribute-value',
      'product',
      'product-category',
      'product-type',
      'variant',
    ]).toContain(contract.businessTarget);
    expect(contract.scope).toBe('tenant');
    if (contract.permissionKind === 'action_execution') {
      expect(contract.permission).toBe(key);
    }
    expect(catalogAuthorityBundles[contract.authorityBundle]).toContain(contract.permission);
  }
  expect(catalogAuthorityBundles.CATALOG_DEFINITION_MANAGER).toEqual([
    'commerce.catalog.create-attribute-definition',
    'commerce.catalog.create-controlled-attribute-value',
    'commerce.catalog.create-product-category',
    'commerce.catalog.create-product-type',
    'commerce.catalog.move-product-category',
    'commerce.catalog.reactivate-controlled-attribute-value',
    'commerce.catalog.rename-attribute-definition',
    'commerce.catalog.rename-controlled-attribute-value',
    'commerce.catalog.rename-product-category',
    'commerce.catalog.retire-controlled-attribute-value',
    'commerce.catalog.retire-product-category',
    'commerce.catalog.revise-product-type',
  ]);
  expect(catalogAuthorityBundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.retire-variant');
  expect(catalogAuthorityBundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.reactivate-variant');
  expect(catalogAuthorityBundles.PRODUCT_EDITOR).toContain('commerce.catalog.create-variant');
  expect(catalogAuthorityBundles.PRODUCT_EDITOR).toContain('commerce.catalog.change-variant');
  // #411B/#481 importer and overrides are deferred.
  expect(contracts).toHaveLength(29);
  const bundlePermissions = Object.values(catalogAuthorityBundles).flat();
  expect(new Set(bundlePermissions).size).toBe(bundlePermissions.length);
  expect(bundlePermissions).toHaveLength(contracts.length);
  expect(catalogAuthorityBundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.retire-product');
  expect(catalogAuthorityBundles.CATALOG_READER).not.toContain('commerce.catalog.create-product');
});

it('publishes seven exhaustive and safely bounded Catalog outcome meanings', () => {
  const outcomes = [
    { evidenceRef: 'urn:catalog:evidence:1', kind: 'VALID_CURRENT' },
    { kind: 'INVALID_SELECTION', reasonCode: 'MISSING_REQUIRED_AXIS' },
    { kind: 'NOT_FOUND' },
    { kind: 'CONFLICT', reasonCode: 'STALE_BASIS' },
    { kind: 'PERMISSION_DENIED' },
    { kind: 'UNAVAILABLE_OR_INDETERMINATE' },
    {
      invocationId: '44444444-4444-4444-8444-444444444444',
      kind: 'INDETERMINATE_WRITE_OUTCOME',
      resolution: 'RESOLVE_COMMIT',
      retryCommand: false,
    },
  ] as const;
  const statuses = [200, 422, 404, 409, 403, 503, 503];
  for (const [index, outcome] of outcomes.entries()) {
    const decoded = Schema.decodeUnknownSync(CatalogOperationOutcomeSchema, { onExcessProperty: 'error' })({
      correlationId: 'catalog-test',
      ...outcome,
    });
    expect(catalogOutcomeHttpStatus[decoded.kind]).toBe(statuses[index]);
  }
  expect(() =>
    Schema.decodeUnknownSync(CatalogOperationOutcomeSchema, { onExcessProperty: 'error' })({
      correlationId: 'catalog-test',
      evidenceRef: 'urn:catalog:evidence:1',
      kind: 'VALID_CURRENT',
      price: 100,
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(CatalogOperationOutcomeSchema)({
      correlationId: 'catalog-test',
      invocationId: '44444444-4444-4444-8444-444444444444',
      kind: 'INDETERMINATE_WRITE_OUTCOME',
      resolution: 'RESOLVE_COMMIT',
      retryCommand: true,
    }),
  ).toThrow();
});
