import { expect, it } from 'effect-rstest';

import { catalogAuthorityBundles, catalogPublicOperationContracts } from '../../shared/api.ts';
import { catalogManifest } from '../../vertical.manifest.ts';
import { brandCurrentRead } from '../../src/api/brand-current.read.ts';
import { brandHistoryRead } from '../../src/api/brand-history.read.ts';
import { catalogMediaCurrentRead } from '../../src/api/catalog-media-current.read.ts';
import { createProductRecoveryRead } from '../../src/api/create-product-recovery.read.ts';
import { effectiveAttributeValuesCurrentRead } from '../../src/api/effective-attribute-values-current.read.ts';
import { gtinCurrentRead } from '../../src/api/gtin-current.read.ts';
import { gtinHistoryRead } from '../../src/api/gtin-history.read.ts';
import { manufacturerRelationCurrentRead } from '../../src/api/manufacturer-relation-current.read.ts';
import { manufacturerRelationHistoryRead } from '../../src/api/manufacturer-relation-history.read.ts';
import { productCategoryClassificationRead } from '../../src/api/product-category-classification.read.ts';
import { productCategoryHistoryRead } from '../../src/api/product-category-history.read.ts';
import { productDetailRead } from '../../src/api/product-detail.read.ts';
import { productHistoryRead } from '../../src/api/product-history.read.ts';
import { variantHistoryRead } from '../../src/api/variant-history.read.ts';
import { packageDefinitionHistoryRead } from '../../src/api/package-definition-history.read.ts';
import { packageOptionHistoryRead } from '../../src/api/package-option-history.read.ts';
import { productBrandCurrentRead } from '../../src/api/product-brand-current.read.ts';
import { productBrandHistoryRead } from '../../src/api/product-brand-history.read.ts';
import { productSizeCurrentRead } from '../../src/api/product-size-current.read.ts';
import { productRelationshipCurrentRead } from '../../src/api/product-relationship-current.read.ts';
import { productRelationshipHistoryRead } from '../../src/api/product-relationship-history.read.ts';
import { quantityPreparationRead } from '../../src/api/quantity-preparation.read.ts';
import { skuLookupRead } from '../../src/api/sku-lookup.read.ts';

const reads = [
  brandCurrentRead,
  brandHistoryRead,
  catalogMediaCurrentRead,
  createProductRecoveryRead,
  effectiveAttributeValuesCurrentRead,
  gtinCurrentRead,
  gtinHistoryRead,
  manufacturerRelationCurrentRead,
  manufacturerRelationHistoryRead,
  productCategoryClassificationRead,
  productCategoryHistoryRead,
  productDetailRead,
  productHistoryRead,
  variantHistoryRead,
  packageDefinitionHistoryRead,
  packageOptionHistoryRead,
  productBrandCurrentRead,
  productBrandHistoryRead,
  productSizeCurrentRead,
  productRelationshipCurrentRead,
  productRelationshipHistoryRead,
  quantityPreparationRead,
  skuLookupRead,
] as const;

it('maps every published Action and governed read to one explicit atomic permission and bundle', () => {
  const actionKeys = catalogManifest.publicSurface.actions.map((action) => action.descriptor.actionKey);
  const readKeys = reads.map((read) => read.descriptor.readKey);
  expect(new Set(readKeys)).toEqual(
    new Set(Object.keys(catalogManifest.publicSurface.api).map((name) => `commerce.catalog.api.${name}`)),
  );
  const published = [...actionKeys, ...readKeys];
  expect(new Set(published).size).toBe(published.length);
  expect(new Set(Object.keys(catalogPublicOperationContracts))).toEqual(new Set(published));

  for (const actionKey of actionKeys) {
    const contract = Object.entries(catalogPublicOperationContracts).find(([key]) => key === actionKey)?.[1];
    expect(contract).toMatchObject({ permission: actionKey, permissionKind: 'action_execution', scope: 'tenant' });
  }
  for (const read of reads) {
    const { entrypoint, readKey } = read.descriptor;
    const contract = Object.entries(catalogPublicOperationContracts).find(([key]) => key === readKey)?.[1];
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
    const relationshipOrIdentity =
      readKey.includes('brand') ||
      readKey.includes('manufacturer-relation') ||
      readKey.includes('product-relationship');
    let expectedTarget = 'tenant';
    if (
      readKey === 'commerce.catalog.api.catalog-media-current' ||
      readKey === 'commerce.catalog.api.quantity-preparation'
    ) {
      expectedTarget = 'resource';
    } else if (
      relationshipOrIdentity ||
      readKey === 'commerce.catalog.api.product-size-current' ||
      readKey === 'commerce.catalog.api.effective-attribute-values-current' ||
      readKey === 'commerce.catalog.api.gtin-current' ||
      readKey === 'commerce.catalog.api.gtin-history' ||
      readKey === 'commerce.catalog.api.sku-lookup'
    ) {
      expectedTarget = 'module';
    }
    expect(read.descriptor.permissionTarget).toBe(expectedTarget);
    if ('resourcePermission' in read.descriptor && read.descriptor.resourcePermission !== undefined) {
      expect(contract).toMatchObject({ permissionTarget: expectedTarget, resourcePermission: 'read' });
    }
  }

  expect(catalogPublicOperationContracts['commerce.catalog.api.product-relationship-current']).toMatchObject({
    permissionTarget: 'module',
    resourcePermission: 'read',
  });

  const bundlePermissions = Object.values(catalogAuthorityBundles).flat();
  const contractPermissions = Object.values(catalogPublicOperationContracts).map(({ permission }) => permission);
  expect(new Set(bundlePermissions).size).toBe(bundlePermissions.length);
  expect(new Set(contractPermissions).size).toBe(contractPermissions.length);
  expect(new Set(bundlePermissions)).toEqual(new Set(contractPermissions));
  for (const contract of Object.values(catalogPublicOperationContracts)) {
    expect(catalogAuthorityBundles[contract.authorityBundle]).toContain(contract.permission);
  }
});

it('keeps read, ordinary edit, shared-definition, and high-impact lifecycle authority disjoint', () => {
  const bundles = catalogAuthorityBundles;
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.update-product');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.govern-variant-axes');
  expect(bundles.CATALOG_DEFINITION_MANAGER).not.toContain('commerce.catalog.govern-variant-axes');
  expect(catalogPublicOperationContracts['commerce.catalog.govern-variant-axes']).toMatchObject({
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permissionKind: 'action_execution',
  });
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.set-product-brand');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.set-product-manufacturer');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.assign-catalog-media');
  expect(bundles.PRODUCT_EDITOR).toContain('commerce.catalog.replace-product-sizes');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-brand');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.assert-size-equivalence');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.activate-package-definition');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-package-definition');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.create-product-unit');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.revise-attribute-definition');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.revise-attribute-definition');
  expect(catalogPublicOperationContracts['commerce.catalog.revise-attribute-definition']).toMatchObject({
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: 'attribute-definition',
    permission: 'commerce.catalog.revise-attribute-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
  });
  for (const operation of [
    'commerce.catalog.create-configuration-unit',
    'commerce.catalog.revise-configuration-unit',
    'commerce.catalog.retire-configuration-unit',
  ] as const) {
    expect(bundles.CATALOG_DEFINITION_MANAGER).toContain(operation);
    expect(bundles.PRODUCT_EDITOR).not.toContain(operation);
    expect(bundles.CATALOG_LIFECYCLE_MANAGER).not.toContain(operation);
    expect(catalogPublicOperationContracts[operation]).toMatchObject({
      authorityBundle: 'CATALOG_DEFINITION_MANAGER',
      businessTarget: 'configuration-unit',
      permission: operation,
      permissionKind: 'action_execution',
      scope: 'tenant',
    });
  }
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.activate-package-option');
  expect(bundles.CATALOG_DEFINITION_MANAGER).toContain('commerce.catalog.retire-package-option');
  for (const productAction of [
    'commerce.catalog.assign-sku',
    'commerce.catalog.rename-sku',
    'commerce.catalog.correct-sku',
    'commerce.catalog.confirm-gtin',
    'commerce.catalog.correct-gtin',
    'commerce.catalog.publish-product-configuration',
    'commerce.catalog.create-set-composition',
    'commerce.catalog.revise-set-composition',
  ]) {
    expect(bundles.PRODUCT_EDITOR).toContain(productAction);
    expect(bundles.CATALOG_DEFINITION_MANAGER).not.toContain(productAction);
    expect(bundles.CATALOG_LIFECYCLE_MANAGER).not.toContain(productAction);
  }
  expect(bundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.retire-product');
  expect(bundles.CATALOG_LIFECYCLE_MANAGER).toContain('commerce.catalog.retire-variant');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.retire-product');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.create-brand');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.activate-package-option');
  expect(bundles.PRODUCT_EDITOR).not.toContain('commerce.catalog.retire-package-option');
  expect(bundles.CATALOG_DEFINITION_MANAGER).not.toContain('commerce.catalog.retire-product');
  expect(bundles.CATALOG_READER).not.toContain('commerce.catalog.create-product');
});
