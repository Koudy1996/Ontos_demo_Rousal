import { expect, it } from 'effect-rstest';

import {
  catalogApiContract,
  catalogAuthorityBundles,
  catalogOperationContexts,
  catalogPublicOperationContracts,
} from '../../shared/api.ts';
import { ProductDetailApi } from '../../shared/apis/product-detail.ts';
import { ProductHistoryApi } from '../../shared/apis/product-history.ts';
import { productDetailRead } from '../../src/api/product-detail.read.ts';
import { productHistoryRead } from '../../src/api/product-history.read.ts';

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
  expect(productDetailRead.descriptor.resourcePermission).toBeDefined();
  expect(productHistoryRead.descriptor.resourcePermission).toBeDefined();
});

it('publishes only explicitly implemented atomic permissions with disjoint authority bundles', () => {
  const contracts = Object.entries(catalogPublicOperationContracts);
  const permissions = contracts.map(([, contract]) => contract.permission);
  expect(new Set(permissions).size).toBe(contracts.length);
  for (const [key, contract] of contracts) {
    expect(contract.version).toBe('1');
    if (contract.permissionKind === 'action_execution') {
      expect(contract.permission).toBe(key);
    }
    expect(catalogAuthorityBundles[contract.authorityBundle]).toContain(contract.permission);
  }
  expect(catalogAuthorityBundles.CATALOG_DEFINITION_MANAGER).toEqual([]);
  const bundlePermissions = Object.values(catalogAuthorityBundles).flat();
  expect(new Set(bundlePermissions).size).toBe(bundlePermissions.length);
  expect(bundlePermissions).toHaveLength(contracts.length);
  expect(catalogAuthorityBundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.retire-product');
  expect(catalogAuthorityBundles.CATALOG_READER).not.toContain('commerce.catalog.create-product');
});
