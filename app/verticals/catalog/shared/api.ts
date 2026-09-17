import { identity } from 'effect';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';

// <generated-governed-http-api-imports>
import { ActivatePackageDefinitionActionApi } from './apis/activate-package-definition-action.ts';
import { ActivatePackageOptionActionApi } from './apis/activate-package-option-action.ts';
import { AddProductCategoryAssignmentActionApi } from './apis/add-product-category-assignment-action.ts';
import { AssertSizeEquivalenceActionApi } from './apis/assert-size-equivalence-action.ts';
import { AssignCatalogMediaActionApi } from './apis/assign-catalog-media-action.ts';
import { AssignSkuActionApi } from './apis/assign-sku-action.ts';
import { BrandCurrentApi } from './apis/brand-current.ts';
import { BrandHistoryApi } from './apis/brand-history.ts';
import { CatalogMediaCurrentApi } from './apis/catalog-media-current.ts';
import { ChangeProductManufacturerActionApi } from './apis/change-product-manufacturer-action.ts';
import { ChangeProductRelationshipActionApi } from './apis/change-product-relationship-action.ts';
import { ChangeVariantActionApi } from './apis/change-variant-action.ts';
import { ConfirmGtinActionApi } from './apis/confirm-gtin-action.ts';
import { CorrectGtinActionApi } from './apis/correct-gtin-action.ts';
import { CorrectProductActionApi } from './apis/correct-product-action.ts';
import { CorrectSkuActionApi } from './apis/correct-sku-action.ts';
import { CreateAttributeDefinitionActionApi } from './apis/create-attribute-definition-action.ts';
import { CreateBrandActionApi } from './apis/create-brand-action.ts';
import { CreateControlledAttributeValueActionApi } from './apis/create-controlled-attribute-value-action.ts';
import { CreatePackageDefinitionActionApi } from './apis/create-package-definition-action.ts';
import { CreateProductActionApi } from './apis/create-product-action.ts';
import { CreateProductCategoryActionApi } from './apis/create-product-category-action.ts';
import { CreateProductRecoveryApi } from './apis/create-product-recovery.ts';
import { CreateProductRelationshipActionApi } from './apis/create-product-relationship-action.ts';
import { CreateProductTypeActionApi } from './apis/create-product-type-action.ts';
import { CreateProductUnitActionApi } from './apis/create-product-unit-action.ts';
import { CreateSetCompositionActionApi } from './apis/create-set-composition-action.ts';
import { CreateVariantActionApi } from './apis/create-variant-action.ts';
import { ManufacturerRelationCurrentApi } from './apis/manufacturer-relation-current.ts';
import { ManufacturerRelationHistoryApi } from './apis/manufacturer-relation-history.ts';
import { MoveProductCategoryActionApi } from './apis/move-product-category-action.ts';
import { ProductBrandCurrentApi } from './apis/product-brand-current.ts';
import { ProductBrandHistoryApi } from './apis/product-brand-history.ts';
import { ProductCategoryClassificationApi } from './apis/product-category-classification.ts';
import { ProductCategoryHistoryApi } from './apis/product-category-history.ts';
import { ProductDetailApi } from './apis/product-detail.ts';
import { ProductHistoryApi } from './apis/product-history.ts';
import { ProductRelationshipCurrentApi } from './apis/product-relationship-current.ts';
import { ProductRelationshipHistoryApi } from './apis/product-relationship-history.ts';
import { PublishProductConfigurationActionApi } from './apis/publish-product-configuration-action.ts';
import { ReactivateBrandActionApi } from './apis/reactivate-brand-action.ts';
import { ReactivateControlledAttributeValueActionApi } from './apis/reactivate-controlled-attribute-value-action.ts';
import { ReactivateProductActionApi } from './apis/reactivate-product-action.ts';
import { ReactivateVariantActionApi } from './apis/reactivate-variant-action.ts';
import { RemoveCatalogMediaActionApi } from './apis/remove-catalog-media-action.ts';
import { RemoveProductAttributeValuesActionApi } from './apis/remove-product-attribute-values-action.ts';
import { RemoveProductCategoryAssignmentActionApi } from './apis/remove-product-category-assignment-action.ts';
import { RemoveProductLocalizedFactsActionApi } from './apis/remove-product-localized-facts-action.ts';
import { RemoveProductManufacturerActionApi } from './apis/remove-product-manufacturer-action.ts';
import { RemoveProductRelationshipActionApi } from './apis/remove-product-relationship-action.ts';
import { RemoveVariantAttributeOverrideActionApi } from './apis/remove-variant-attribute-override-action.ts';
import { RemoveVariantLocalizedFactsActionApi } from './apis/remove-variant-localized-facts-action.ts';
import { RenameAttributeDefinitionActionApi } from './apis/rename-attribute-definition-action.ts';
import { RenameBrandActionApi } from './apis/rename-brand-action.ts';
import { RenameControlledAttributeValueActionApi } from './apis/rename-controlled-attribute-value-action.ts';
import { RenameProductCategoryActionApi } from './apis/rename-product-category-action.ts';
import { RenameSkuActionApi } from './apis/rename-sku-action.ts';
import { ReorderCatalogMediaActionApi } from './apis/reorder-catalog-media-action.ts';
import { ReplaceProductSizesActionApi } from './apis/replace-product-sizes-action.ts';
import { RetireBrandActionApi } from './apis/retire-brand-action.ts';
import { RetireControlledAttributeValueActionApi } from './apis/retire-controlled-attribute-value-action.ts';
import { RetirePackageDefinitionActionApi } from './apis/retire-package-definition-action.ts';
import { RetirePackageOptionActionApi } from './apis/retire-package-option-action.ts';
import { RetireProductActionApi } from './apis/retire-product-action.ts';
import { RetireProductCategoryActionApi } from './apis/retire-product-category-action.ts';
import { RetireProductUnitActionApi } from './apis/retire-product-unit-action.ts';
import { RetireVariantActionApi } from './apis/retire-variant-action.ts';
import { RevisePackageDefinitionActionApi } from './apis/revise-package-definition-action.ts';
import { ReviseProductTypeActionApi } from './apis/revise-product-type-action.ts';
import { ReviseProductUnitActionApi } from './apis/revise-product-unit-action.ts';
import { ReviseSetCompositionActionApi } from './apis/revise-set-composition-action.ts';
import { SetProductAttributeValuesActionApi } from './apis/set-product-attribute-values-action.ts';
import { SetProductBrandActionApi } from './apis/set-product-brand-action.ts';
import { SetProductLocalizedFactsActionApi } from './apis/set-product-localized-facts-action.ts';
import { SetProductManufacturerActionApi } from './apis/set-product-manufacturer-action.ts';
import { SetProductTypeActionApi } from './apis/set-product-type-action.ts';
import { SetProductUnitTargetDivisibilityActionApi } from './apis/set-product-unit-target-divisibility-action.ts';
import { SetVariantAttributeOverrideActionApi } from './apis/set-variant-attribute-override-action.ts';
import { SetVariantLocalizedFactsActionApi } from './apis/set-variant-localized-facts-action.ts';
import { UpdateProductActionApi } from './apis/update-product-action.ts';
// </generated-governed-http-api-imports>
import { ProductActionInvocationIdSchema } from './domain/product.ts';

export const catalogMarkerSchema: Schema.Codec<typeof MicroVerticalBuildMarkerSchema.Type> =
  MicroVerticalBuildMarkerSchema;
export type CatalogMarker = typeof catalogMarkerSchema.Type;

export const catalogReadinessSchema: Schema.Codec<typeof MicroVerticalReadinessSchema.Type> =
  MicroVerticalReadinessSchema;
export type CatalogReadiness = typeof catalogReadinessSchema.Type;

export type OperationContext = MicroVerticalOperationContext;

export const catalogFoundationApi = HttpApi.make('CatalogApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/catalog/readiness', {
      success: catalogReadinessSchema,
    }),
  ),
);

export const catalogApi = HttpApi.make('CatalogApi')
  .addHttpApi(catalogFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(ActivatePackageDefinitionActionApi)
  .addHttpApi(ActivatePackageOptionActionApi)
  .addHttpApi(AddProductCategoryAssignmentActionApi)
  .addHttpApi(AssertSizeEquivalenceActionApi)
  .addHttpApi(AssignCatalogMediaActionApi)
  .addHttpApi(AssignSkuActionApi)
  .addHttpApi(BrandCurrentApi)
  .addHttpApi(BrandHistoryApi)
  .addHttpApi(CatalogMediaCurrentApi)
  .addHttpApi(ChangeProductManufacturerActionApi)
  .addHttpApi(ChangeProductRelationshipActionApi)
  .addHttpApi(ChangeVariantActionApi)
  .addHttpApi(ConfirmGtinActionApi)
  .addHttpApi(CorrectGtinActionApi)
  .addHttpApi(CorrectProductActionApi)
  .addHttpApi(CorrectSkuActionApi)
  .addHttpApi(CreateAttributeDefinitionActionApi)
  .addHttpApi(CreateBrandActionApi)
  .addHttpApi(CreateControlledAttributeValueActionApi)
  .addHttpApi(CreatePackageDefinitionActionApi)
  .addHttpApi(CreateProductActionApi)
  .addHttpApi(CreateProductCategoryActionApi)
  .addHttpApi(CreateProductRecoveryApi)
  .addHttpApi(CreateProductRelationshipActionApi)
  .addHttpApi(CreateProductTypeActionApi)
  .addHttpApi(CreateProductUnitActionApi)
  .addHttpApi(CreateSetCompositionActionApi)
  .addHttpApi(CreateVariantActionApi)
  .addHttpApi(ManufacturerRelationCurrentApi)
  .addHttpApi(ManufacturerRelationHistoryApi)
  .addHttpApi(MoveProductCategoryActionApi)
  .addHttpApi(ProductBrandCurrentApi)
  .addHttpApi(ProductBrandHistoryApi)
  .addHttpApi(ProductCategoryClassificationApi)
  .addHttpApi(ProductCategoryHistoryApi)
  .addHttpApi(ProductDetailApi)
  .addHttpApi(ProductHistoryApi)
  .addHttpApi(ProductRelationshipCurrentApi)
  .addHttpApi(ProductRelationshipHistoryApi)
  .addHttpApi(PublishProductConfigurationActionApi)
  .addHttpApi(ReactivateBrandActionApi)
  .addHttpApi(ReactivateControlledAttributeValueActionApi)
  .addHttpApi(ReactivateProductActionApi)
  .addHttpApi(ReactivateVariantActionApi)
  .addHttpApi(RemoveCatalogMediaActionApi)
  .addHttpApi(RemoveProductAttributeValuesActionApi)
  .addHttpApi(RemoveProductCategoryAssignmentActionApi)
  .addHttpApi(RemoveProductLocalizedFactsActionApi)
  .addHttpApi(RemoveProductManufacturerActionApi)
  .addHttpApi(RemoveProductRelationshipActionApi)
  .addHttpApi(RemoveVariantAttributeOverrideActionApi)
  .addHttpApi(RemoveVariantLocalizedFactsActionApi)
  .addHttpApi(RenameAttributeDefinitionActionApi)
  .addHttpApi(RenameBrandActionApi)
  .addHttpApi(RenameControlledAttributeValueActionApi)
  .addHttpApi(RenameProductCategoryActionApi)
  .addHttpApi(RenameSkuActionApi)
  .addHttpApi(ReorderCatalogMediaActionApi)
  .addHttpApi(ReplaceProductSizesActionApi)
  .addHttpApi(RetireBrandActionApi)
  .addHttpApi(RetireControlledAttributeValueActionApi)
  .addHttpApi(RetirePackageDefinitionActionApi)
  .addHttpApi(RetirePackageOptionActionApi)
  .addHttpApi(RetireProductActionApi)
  .addHttpApi(RetireProductCategoryActionApi)
  .addHttpApi(RetireProductUnitActionApi)
  .addHttpApi(RetireVariantActionApi)
  .addHttpApi(RevisePackageDefinitionActionApi)
  .addHttpApi(ReviseProductTypeActionApi)
  .addHttpApi(ReviseProductUnitActionApi)
  .addHttpApi(ReviseSetCompositionActionApi)
  .addHttpApi(SetProductAttributeValuesActionApi)
  .addHttpApi(SetProductBrandActionApi)
  .addHttpApi(SetProductLocalizedFactsActionApi)
  .addHttpApi(SetProductManufacturerActionApi)
  .addHttpApi(SetProductTypeActionApi)
  .addHttpApi(SetProductUnitTargetDivisibilityActionApi)
  .addHttpApi(SetVariantAttributeOverrideActionApi)
  .addHttpApi(SetVariantLocalizedFactsActionApi)
  .addHttpApi(UpdateProductActionApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const catalogOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'CatalogApi:catalog:readiness',
    routePath: '/catalog/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const catalogApiContract = {
  apiPrefix: '/catalog-api',
  basePath: '/catalog-api/catalog',
  ownerId: 'catalog',
  readinessPath: '/catalog-api/catalog/readiness',
} as const;

/**
 * Versioned Catalog operation inventory. Each key is an atomic Core authorization
 * identity, not a runtime role check. Bundles are provisioning aids only: adding
 * an operation here never grants it to an existing Principal. `scope` names the
 * Core authorization boundary; `businessTarget` names the Product domain target.
 * Catalog authorizes reads by explicit context permission and Actions by
 * Action executor grants. `scope` is the tenant entrypoint boundary; a read
 * may additionally declare a module permission target or resource check.
 * `businessTarget: 'product'` does not imply a per-Product SpiceDB grant.
 * Owner-local tenant guards still apply.
 * Importer and override operations remain deferred to #411B/#481 and are
 * deliberately absent from this inventory.
 */
const productCategoryBusinessTarget = 'product-category';
const attributeDefinitionBusinessTarget = 'attribute-definition';
const controlledAttributeValueBusinessTarget = 'controlled-attribute-value';
const packageDefinitionBusinessTarget = 'package-definition';
const productRelationshipBusinessTarget = 'product-relationship';
const productUnitBusinessTarget = 'product-unit';
const brandBusinessTarget = 'brand';
const manufacturerRelationBusinessTarget = 'manufacturer-relation';

export const catalogPublicOperationContracts = {
  'commerce.catalog.activate-package-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: packageDefinitionBusinessTarget,
    permission: 'commerce.catalog.activate-package-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.add-product-category-assignment': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.add-product-category-assignment',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.brand-current': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.read.brand-current',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.brand-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.read.brand-history',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.catalog-media-current': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'catalog-media',
    permission: 'commerce.catalog.read.media',
    permissionKind: 'context_permission',
    permissionTarget: 'resource',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.assign-catalog-media': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.assign-catalog-media',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.create-product-recovery': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'product',
    permission: 'commerce.catalog.read.create-product-recovery',
    permissionKind: 'context_permission',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.manufacturer-relation-current': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: manufacturerRelationBusinessTarget,
    permission: 'commerce.catalog.read.manufacturer-relation-current',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.manufacturer-relation-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: manufacturerRelationBusinessTarget,
    permission: 'commerce.catalog.read.manufacturer-relation-history',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-brand-current': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'product',
    permission: 'commerce.catalog.read.product-brand-current',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-brand-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'product',
    permission: 'commerce.catalog.read.product-brand-history',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-category-classification': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.read.product-category-classification',
    permissionKind: 'context_permission',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-category-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.read.product-category-history',
    permissionKind: 'context_permission',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-detail': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'product',
    permission: 'commerce.catalog.read.product-detail',
    permissionKind: 'context_permission',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: 'product',
    permission: 'commerce.catalog.read.product-history',
    permissionKind: 'context_permission',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-relationship-current': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: productRelationshipBusinessTarget,
    permission: 'commerce.catalog.read.product-relationship',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    resourcePermission: 'read',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.api.product-relationship-history': {
    authorityBundle: 'CATALOG_READER',
    businessTarget: productRelationshipBusinessTarget,
    permission: 'commerce.catalog.read.product-relationship-history',
    permissionKind: 'context_permission',
    permissionTarget: 'module',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.assert-size-equivalence': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: 'size-equivalence',
    permission: 'commerce.catalog.assert-size-equivalence',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.change-product-manufacturer': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.change-product-manufacturer',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.change-product-relationship': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: productRelationshipBusinessTarget,
    permission: 'commerce.catalog.change-product-relationship',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.change-variant': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.change-variant',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.correct-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.correct-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-attribute-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: attributeDefinitionBusinessTarget,
    permission: 'commerce.catalog.create-attribute-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-brand': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.create-brand',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-controlled-attribute-value': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: controlledAttributeValueBusinessTarget,
    permission: 'commerce.catalog.create-controlled-attribute-value',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-package-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: packageDefinitionBusinessTarget,
    permission: 'commerce.catalog.create-package-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.create-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-product-category': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.create-product-category',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-product-relationship': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: productRelationshipBusinessTarget,
    permission: 'commerce.catalog.create-product-relationship',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-product-type': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: 'product-type',
    permission: 'commerce.catalog.create-product-type',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-product-unit': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productUnitBusinessTarget,
    permission: 'commerce.catalog.create-product-unit',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.create-variant': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.create-variant',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.move-product-category': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.move-product-category',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reactivate-controlled-attribute-value': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: controlledAttributeValueBusinessTarget,
    permission: 'commerce.catalog.reactivate-controlled-attribute-value',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reactivate-brand': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.reactivate-brand',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reactivate-product': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    businessTarget: 'product',
    permission: 'commerce.catalog.reactivate-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reactivate-variant': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    businessTarget: 'variant',
    permission: 'commerce.catalog.reactivate-variant',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-product-attribute-values': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-product-attribute-values',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-catalog-media': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-catalog-media',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-product-category-assignment': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-product-category-assignment',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-product-localized-facts': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-product-localized-facts',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-product-manufacturer': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-product-manufacturer',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-product-relationship': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: productRelationshipBusinessTarget,
    permission: 'commerce.catalog.remove-product-relationship',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-variant-attribute-override': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.remove-variant-attribute-override',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.remove-variant-localized-facts': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.remove-variant-localized-facts',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.replace-product-sizes': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.replace-product-sizes',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.rename-attribute-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: attributeDefinitionBusinessTarget,
    permission: 'commerce.catalog.rename-attribute-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.rename-brand': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.rename-brand',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.rename-controlled-attribute-value': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: controlledAttributeValueBusinessTarget,
    permission: 'commerce.catalog.rename-controlled-attribute-value',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.rename-product-category': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.rename-product-category',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-controlled-attribute-value': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: controlledAttributeValueBusinessTarget,
    permission: 'commerce.catalog.retire-controlled-attribute-value',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-brand': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: brandBusinessTarget,
    permission: 'commerce.catalog.retire-brand',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-package-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: packageDefinitionBusinessTarget,
    permission: 'commerce.catalog.retire-package-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-product': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    businessTarget: 'product',
    permission: 'commerce.catalog.retire-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-product-category': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productCategoryBusinessTarget,
    permission: 'commerce.catalog.retire-product-category',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-product-unit': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productUnitBusinessTarget,
    permission: 'commerce.catalog.retire-product-unit',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.retire-variant': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    businessTarget: 'variant',
    permission: 'commerce.catalog.retire-variant',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.revise-package-definition': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: packageDefinitionBusinessTarget,
    permission: 'commerce.catalog.revise-package-definition',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.revise-product-type': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: 'product-type',
    permission: 'commerce.catalog.revise-product-type',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.revise-product-unit': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productUnitBusinessTarget,
    permission: 'commerce.catalog.revise-product-unit',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reorder-catalog-media': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.reorder-catalog-media',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-attribute-values': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-attribute-values',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-brand': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-brand',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-localized-facts': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-localized-facts',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-manufacturer': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-manufacturer',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-type': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-type',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-product-unit-target-divisibility': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: productUnitBusinessTarget,
    permission: 'commerce.catalog.set-product-unit-target-divisibility',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-variant-attribute-override': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.set-variant-attribute-override',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.set-variant-localized-facts': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'variant',
    permission: 'commerce.catalog.set-variant-localized-facts',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.update-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.update-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
} as const;

export const catalogAuthorityBundles = {
  CATALOG_DEFINITION_MANAGER: [
    'commerce.catalog.activate-package-definition',
    'commerce.catalog.assert-size-equivalence',
    'commerce.catalog.create-attribute-definition',
    'commerce.catalog.create-brand',
    'commerce.catalog.create-controlled-attribute-value',
    'commerce.catalog.create-package-definition',
    'commerce.catalog.create-product-category',
    'commerce.catalog.create-product-type',
    'commerce.catalog.create-product-unit',
    'commerce.catalog.move-product-category',
    'commerce.catalog.reactivate-brand',
    'commerce.catalog.reactivate-controlled-attribute-value',
    'commerce.catalog.rename-attribute-definition',
    'commerce.catalog.rename-brand',
    'commerce.catalog.rename-controlled-attribute-value',
    'commerce.catalog.rename-product-category',
    'commerce.catalog.retire-brand',
    'commerce.catalog.retire-controlled-attribute-value',
    'commerce.catalog.retire-package-definition',
    'commerce.catalog.retire-product-category',
    'commerce.catalog.retire-product-unit',
    'commerce.catalog.revise-package-definition',
    'commerce.catalog.revise-product-type',
    'commerce.catalog.revise-product-unit',
    'commerce.catalog.set-product-unit-target-divisibility',
  ],
  CATALOG_LIFECYCLE_MANAGER: [
    'commerce.catalog.reactivate-product',
    'commerce.catalog.reactivate-variant',
    'commerce.catalog.retire-product',
    'commerce.catalog.retire-variant',
  ],
  CATALOG_READER: [
    'commerce.catalog.read.brand-current',
    'commerce.catalog.read.brand-history',
    'commerce.catalog.read.media',
    'commerce.catalog.read.manufacturer-relation-current',
    'commerce.catalog.read.manufacturer-relation-history',
    'commerce.catalog.read.create-product-recovery',
    'commerce.catalog.read.product-category-classification',
    'commerce.catalog.read.product-category-history',
    'commerce.catalog.read.product-brand-current',
    'commerce.catalog.read.product-brand-history',
    'commerce.catalog.read.product-detail',
    'commerce.catalog.read.product-history',
    'commerce.catalog.read.product-relationship',
    'commerce.catalog.read.product-relationship-history',
  ],
  PRODUCT_EDITOR: [
    'commerce.catalog.add-product-category-assignment',
    'commerce.catalog.assign-catalog-media',
    'commerce.catalog.change-product-manufacturer',
    'commerce.catalog.change-product-relationship',
    'commerce.catalog.change-variant',
    'commerce.catalog.create-product',
    'commerce.catalog.create-product-relationship',
    'commerce.catalog.correct-product',
    'commerce.catalog.create-variant',
    'commerce.catalog.remove-product-attribute-values',
    'commerce.catalog.remove-catalog-media',
    'commerce.catalog.remove-product-category-assignment',
    'commerce.catalog.remove-product-localized-facts',
    'commerce.catalog.remove-product-manufacturer',
    'commerce.catalog.remove-product-relationship',
    'commerce.catalog.remove-variant-attribute-override',
    'commerce.catalog.remove-variant-localized-facts',
    'commerce.catalog.replace-product-sizes',
    'commerce.catalog.reorder-catalog-media',
    'commerce.catalog.set-product-attribute-values',
    'commerce.catalog.set-product-brand',
    'commerce.catalog.set-product-localized-facts',
    'commerce.catalog.set-product-manufacturer',
    'commerce.catalog.set-product-type',
    'commerce.catalog.set-variant-attribute-override',
    'commerce.catalog.set-variant-localized-facts',
    'commerce.catalog.update-product',
  ],
} as const;

const safeOutcomeText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200), Schema.isTrimmed());
const catalogOutcomeBase = {
  correlationId: safeOutcomeText,
};

/**
 * Business meanings are independent of HTTP and of the #479 Selection shape.
 * VALID_CURRENT carries only an owner-issued evidence reference; the evidence
 * contents and binding rules belong to the concrete Current-validation API.
 */
export const CatalogOperationOutcomeSchema = Schema.Union([
  Schema.Struct({
    ...catalogOutcomeBase,
    evidenceRef: safeOutcomeText,
    kind: Schema.Literal('VALID_CURRENT'),
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    kind: Schema.Literal('INVALID_SELECTION'),
    reasonCode: safeOutcomeText,
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    kind: Schema.Literal('NOT_FOUND'),
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    kind: Schema.Literal('CONFLICT'),
    reasonCode: safeOutcomeText,
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    kind: Schema.Literal('PERMISSION_DENIED'),
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    kind: Schema.Literal('UNAVAILABLE_OR_INDETERMINATE'),
  }),
  Schema.Struct({
    ...catalogOutcomeBase,
    invocationId: ProductActionInvocationIdSchema,
    kind: Schema.Literal('INDETERMINATE_WRITE_OUTCOME'),
    resolution: Schema.Literal('RESOLVE_COMMIT'),
    retryCommand: Schema.Literal(false),
  }),
]);
export type CatalogOperationOutcome = typeof CatalogOperationOutcomeSchema.Type;

export const catalogOutcomeHttpStatus = {
  CONFLICT: 409,
  INDETERMINATE_WRITE_OUTCOME: 503,
  INVALID_SELECTION: 422,
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  UNAVAILABLE_OR_INDETERMINATE: 503,
  VALID_CURRENT: 200,
} as const satisfies Record<CatalogOperationOutcome['kind'], number>;
