import { identity } from 'effect';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
// oxlint-disable-next-line typescript/consistent-type-imports -- The framework baseline requires Schema in the exact value import.
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';

// <generated-governed-http-api-imports>
import { CorrectProductActionApi } from './apis/correct-product-action.ts';
import { CreateProductActionApi } from './apis/create-product-action.ts';
import { ProductDetailApi } from './apis/product-detail.ts';
import { ProductHistoryApi } from './apis/product-history.ts';
import { ReactivateProductActionApi } from './apis/reactivate-product-action.ts';
import { RetireProductActionApi } from './apis/retire-product-action.ts';
import { UpdateProductActionApi } from './apis/update-product-action.ts';
// </generated-governed-http-api-imports>

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
  .addHttpApi(CorrectProductActionApi)
  .addHttpApi(CreateProductActionApi)
  .addHttpApi(ProductDetailApi)
  .addHttpApi(ProductHistoryApi)
  .addHttpApi(ReactivateProductActionApi)
  .addHttpApi(RetireProductActionApi)
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
 * an operation here never grants it to an existing Principal.
 */
export const catalogPublicOperationContracts = {
  'commerce.catalog.api.product-detail': {
    authorityBundle: 'CATALOG_READER',
    permission: 'commerce.catalog.read.product-detail',
    permissionKind: 'context_permission',
    scope: 'product',
    version: '1',
  },
  'commerce.catalog.api.product-history': {
    authorityBundle: 'CATALOG_READER',
    permission: 'commerce.catalog.read.product-history',
    permissionKind: 'context_permission',
    scope: 'product',
    version: '1',
  },
  'commerce.catalog.correct-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    permission: 'commerce.catalog.correct-product',
    permissionKind: 'action_execution',
    scope: 'product',
    version: '1',
  },
  'commerce.catalog.create-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    permission: 'commerce.catalog.create-product',
    permissionKind: 'action_execution',
    scope: 'tenant',
    version: '1',
  },
  'commerce.catalog.reactivate-product': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    permission: 'commerce.catalog.reactivate-product',
    permissionKind: 'action_execution',
    scope: 'product',
    version: '1',
  },
  'commerce.catalog.retire-product': {
    authorityBundle: 'CATALOG_LIFECYCLE_MANAGER',
    permission: 'commerce.catalog.retire-product',
    permissionKind: 'action_execution',
    scope: 'product',
    version: '1',
  },
  'commerce.catalog.update-product': {
    authorityBundle: 'PRODUCT_EDITOR',
    permission: 'commerce.catalog.update-product',
    permissionKind: 'action_execution',
    scope: 'product',
    version: '1',
  },
} as const;

export const catalogAuthorityBundles = {
  CATALOG_DEFINITION_MANAGER: [],
  CATALOG_LIFECYCLE_MANAGER: ['commerce.catalog.retire-product', 'commerce.catalog.reactivate-product'],
  CATALOG_READER: ['commerce.catalog.read.product-detail', 'commerce.catalog.read.product-history'],
  PRODUCT_EDITOR: [
    'commerce.catalog.create-product',
    'commerce.catalog.correct-product',
    'commerce.catalog.update-product',
  ],
} as const;
