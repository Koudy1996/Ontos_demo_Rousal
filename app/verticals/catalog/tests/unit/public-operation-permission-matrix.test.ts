import { expect, it } from 'effect-rstest';

import { catalogAuthorityBundles, catalogPublicOperationContracts } from '../../shared/api.ts';
import { catalogManifest } from '../../vertical.manifest.ts';
import { createProductRecoveryRead } from '../../src/api/create-product-recovery.read.ts';
import { productCategoryClassificationRead } from '../../src/api/product-category-classification.read.ts';
import { productCategoryHistoryRead } from '../../src/api/product-category-history.read.ts';
import { productDetailRead } from '../../src/api/product-detail.read.ts';
import { productHistoryRead } from '../../src/api/product-history.read.ts';
import { productRelationshipCurrentRead } from '../../src/api/product-relationship-current.read.ts';
import { productRelationshipHistoryRead } from '../../src/api/product-relationship-history.read.ts';

const reads = [
  createProductRecoveryRead,
  productCategoryClassificationRead,
  productCategoryHistoryRead,
  productDetailRead,
  productHistoryRead,
  productRelationshipCurrentRead,
  productRelationshipHistoryRead,
] as const;

it('maps every published Action and governed read to one explicit atomic permission and bundle', () => {
  const actionKeys = catalogManifest.publicSurface.actions.map((action) => action.descriptor.actionKey);
  const readKeys = reads.map((read) => read.descriptor.readKey);
  expect(readKeys.sort()).toEqual(
    Object.keys(catalogManifest.publicSurface.api)
      .map((name) => `commerce.catalog.api.${name}`)
      .sort(),
  );
  const published = [...actionKeys, ...readKeys];
  expect(new Set(published).size).toBe(published.length);
  expect(Object.keys(catalogPublicOperationContracts).sort()).toEqual([...published].sort());

  for (const actionKey of actionKeys) {
    const contract = catalogPublicOperationContracts[actionKey as keyof typeof catalogPublicOperationContracts];
    expect(contract).toMatchObject({ permission: actionKey, permissionKind: 'action_execution', scope: 'tenant' });
  }
  for (const read of reads) {
    const { entrypoint, readKey } = read.descriptor;
    const contract = catalogPublicOperationContracts[readKey as keyof typeof catalogPublicOperationContracts];
    expect(entrypoint.authorization.kind).toBe('context_permission');
    if (entrypoint.authorization.kind !== 'context_permission') {
      continue;
    }
    expect(contract).toMatchObject({
      authorityBundle: 'CATALOG_READER',
      permission: entrypoint.authorization.permission,
      permissionKind: 'context_permission',
      scope: 'tenant',
    });
    expect(entrypoint.scope).toBe('tenant');
    expect(read.descriptor.permissionTarget).toBe(readKey.includes('product-relationship') ? 'module' : 'tenant');
  }

  expect(catalogPublicOperationContracts['commerce.catalog.api.product-relationship-current']).toMatchObject({
    permissionTarget: 'module',
    resourcePermission: 'read',
  });

  const bundlePermissions = Object.values(catalogAuthorityBundles).flat();
  const contractPermissions = Object.values(catalogPublicOperationContracts).map(({ permission }) => permission);
  expect(new Set(bundlePermissions).size).toBe(bundlePermissions.length);
  expect(new Set(contractPermissions).size).toBe(contractPermissions.length);
  expect([...bundlePermissions].sort()).toEqual([...contractPermissions].sort());
  for (const contract of Object.values(catalogPublicOperationContracts)) {
    expect(catalogAuthorityBundles[contract.authorityBundle]).toContain(contract.permission);
  }
});

it('keeps read, ordinary edit, shared-definition, and high-impact lifecycle authority disjoint', () => {
  const bundles = catalogAuthorityBundles;
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.update-product');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.set-product-brand');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.set-product-manufacturer');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.assign-catalog-media');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-brand');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-package-definition');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-product-unit');
  expect(bundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.retire-product');
  expect(bundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.retire-variant');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.retire-product');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.create-brand');
  expect(bundles.CATALOG_DEFINITION_MANAGER).not.toContain('commerce.catalog.retire-product');
  expect(bundles.CATALOG_READER).not.toContain('commerce.catalog.create-product');
});
