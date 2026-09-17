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
    // Product is a business target, not a per-Product SpiceDB authorization resource.
    expect(contract.authorizationScope).toBe('tenant');
    expect(contract.scope).toBe(key === 'commerce.catalog.create-product' ? 'tenant' : 'product');
    if (contract.permissionKind === 'action_execution') {
      expect(contract.permission).toBe(key);
    }
    expect(catalogAuthorityBundles[contract.authorityBundle]).toContain(contract.permission);
  }
  expect(catalogAuthorityBundles.CATALOG_DEFINITION_MANAGER).toEqual([]);
  // #411B/#481 Definition Manager, importer, and overrides are deferred.
  expect(contracts).toHaveLength(7);
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
