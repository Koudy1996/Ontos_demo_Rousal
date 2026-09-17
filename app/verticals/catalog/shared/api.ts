import { identity } from 'effect';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';

// <generated-governed-http-api-imports>
import { AddProductCategoryAssignmentActionApi } from './apis/add-product-category-assignment-action.ts';
import { ChangeVariantActionApi } from './apis/change-variant-action.ts';
import { CorrectProductActionApi } from './apis/correct-product-action.ts';
import { CreateAttributeDefinitionActionApi } from './apis/create-attribute-definition-action.ts';
import { CreateControlledAttributeValueActionApi } from './apis/create-controlled-attribute-value-action.ts';
import { CreatePackageDefinitionActionApi } from './apis/create-package-definition-action.ts';
import { CreateProductActionApi } from './apis/create-product-action.ts';
import { CreateProductCategoryActionApi } from './apis/create-product-category-action.ts';
import { CreateProductRecoveryApi } from './apis/create-product-recovery.ts';
import { CreateProductTypeActionApi } from './apis/create-product-type-action.ts';
import { CreateVariantActionApi } from './apis/create-variant-action.ts';
import { MoveProductCategoryActionApi } from './apis/move-product-category-action.ts';
import { ProductCategoryClassificationApi } from './apis/product-category-classification.ts';
import { ProductCategoryHistoryApi } from './apis/product-category-history.ts';
import { ProductDetailApi } from './apis/product-detail.ts';
import { ProductHistoryApi } from './apis/product-history.ts';
import { ReactivateControlledAttributeValueActionApi } from './apis/reactivate-controlled-attribute-value-action.ts';
import { ReactivateProductActionApi } from './apis/reactivate-product-action.ts';
import { ReactivateVariantActionApi } from './apis/reactivate-variant-action.ts';
import { RemoveProductCategoryAssignmentActionApi } from './apis/remove-product-category-assignment-action.ts';
import { RenameAttributeDefinitionActionApi } from './apis/rename-attribute-definition-action.ts';
import { RenameControlledAttributeValueActionApi } from './apis/rename-controlled-attribute-value-action.ts';
import { RenameProductCategoryActionApi } from './apis/rename-product-category-action.ts';
import { RetireControlledAttributeValueActionApi } from './apis/retire-controlled-attribute-value-action.ts';
import { RetirePackageDefinitionActionApi } from './apis/retire-package-definition-action.ts';
import { RetireProductActionApi } from './apis/retire-product-action.ts';
import { RetireProductCategoryActionApi } from './apis/retire-product-category-action.ts';
import { RetireVariantActionApi } from './apis/retire-variant-action.ts';
import { RevisePackageDefinitionActionApi } from './apis/revise-package-definition-action.ts';
import { ReviseProductTypeActionApi } from './apis/revise-product-type-action.ts';
import { SetProductTypeActionApi } from './apis/set-product-type-action.ts';
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
  .addHttpApi(AddProductCategoryAssignmentActionApi)
  .addHttpApi(ChangeVariantActionApi)
  .addHttpApi(CorrectProductActionApi)
  .addHttpApi(CreateAttributeDefinitionActionApi)
  .addHttpApi(CreateControlledAttributeValueActionApi)
  .addHttpApi(CreatePackageDefinitionActionApi)
  .addHttpApi(CreateProductActionApi)
  .addHttpApi(CreateProductCategoryActionApi)
  .addHttpApi(CreateProductRecoveryApi)
  .addHttpApi(CreateProductTypeActionApi)
  .addHttpApi(CreateVariantActionApi)
  .addHttpApi(MoveProductCategoryActionApi)
  .addHttpApi(ProductCategoryClassificationApi)
  .addHttpApi(ProductCategoryHistoryApi)
  .addHttpApi(ProductDetailApi)
  .addHttpApi(ProductHistoryApi)
  .addHttpApi(ReactivateControlledAttributeValueActionApi)
  .addHttpApi(ReactivateProductActionApi)
  .addHttpApi(ReactivateVariantActionApi)
  .addHttpApi(RemoveProductCategoryAssignmentActionApi)
  .addHttpApi(RenameAttributeDefinitionActionApi)
  .addHttpApi(RenameControlledAttributeValueActionApi)
  .addHttpApi(RenameProductCategoryActionApi)
  .addHttpApi(RetireControlledAttributeValueActionApi)
  .addHttpApi(RetirePackageDefinitionActionApi)
  .addHttpApi(RetireProductActionApi)
  .addHttpApi(RetireProductCategoryActionApi)
  .addHttpApi(RetireVariantActionApi)
  .addHttpApi(RevisePackageDefinitionActionApi)
  .addHttpApi(ReviseProductTypeActionApi)
  .addHttpApi(SetProductTypeActionApi)
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
 * Catalog currently authorizes reads by tenant context permission and Actions
 * by tenant/action executor grants. `businessTarget: 'product'` does not imply
 * a per-Product SpiceDB grant. Owner-local tenant guards still apply.
 * Importer and override operations remain deferred to #411B/#481 and are
 * deliberately absent from this inventory.
 */
const productCategoryBusinessTarget = 'product-category';
const attributeDefinitionBusinessTarget = 'attribute-definition';
const controlledAttributeValueBusinessTarget = 'controlled-attribute-value';
const packageDefinitionBusinessTarget = 'package-definition';

export const catalogPublicOperationContracts = {
  'commerce.catalog.add-product-category-assignment': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.add-product-category-assignment',
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
  'commerce.catalog.create-product-type': {
    authorityBundle: 'CATALOG_DEFINITION_MANAGER',
    businessTarget: 'product-type',
    permission: 'commerce.catalog.create-product-type',
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
  'commerce.catalog.remove-product-category-assignment': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.remove-product-category-assignment',
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
  'commerce.catalog.set-product-type': {
    authorityBundle: 'PRODUCT_EDITOR',
    businessTarget: 'product',
    permission: 'commerce.catalog.set-product-type',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.update-product': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    businessTarget: 'product',
    permission: 'commerce.catalog.update-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
} as const;

export const catalogAuthorityBundles = {
  CATALOG_DEFINITION_MANAGER: [
    'commerce.catalog.create-attribute-definition',
    'commerce.catalog.create-controlled-attribute-value',
    'commerce.catalog.create-package-definition',
    'commerce.catalog.create-product-category',
    'commerce.catalog.create-product-type',
    'commerce.catalog.move-product-category',
    'commerce.catalog.reactivate-controlled-attribute-value',
    'commerce.catalog.rename-attribute-definition',
    'commerce.catalog.rename-controlled-attribute-value',
    'commerce.catalog.rename-product-category',
    'commerce.catalog.retire-controlled-attribute-value',
    'commerce.catalog.retire-package-definition',
    'commerce.catalog.retire-product-category',
    'commerce.catalog.revise-package-definition',
    'commerce.catalog.revise-product-type',
  ],
  CATALOG_LIFECYCLE_MANAGER: [
    'commerce.catalog.reactivate-product',
    'commerce.catalog.reactivate-variant',
    'commerce.catalog.retire-product',
    'commerce.catalog.retire-variant',
    'commerce.catalog.update-product',
  ],
  CATALOG_READER: [
    'commerce.catalog.read.create-product-recovery',
    'commerce.catalog.read.product-category-classification',
    'commerce.catalog.read.product-category-history',
    'commerce.catalog.read.product-detail',
    'commerce.catalog.read.product-history',
  ],
  PRODUCT_EDITOR: [
    'commerce.catalog.add-product-category-assignment',
    'commerce.catalog.change-variant',
    'commerce.catalog.create-product',
    'commerce.catalog.correct-product',
    'commerce.catalog.create-variant',
    'commerce.catalog.remove-product-category-assignment',
    'commerce.catalog.set-product-type',
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
