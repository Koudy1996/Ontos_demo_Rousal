import { expect, it } from 'effect-rstest';

import { catalogApiContract, catalogOperationContexts } from '../../shared/api.ts';
import { ProductDetailApi } from '../../shared/apis/product-detail.ts';
import { ProductHistoryApi } from '../../shared/apis/product-history.ts';

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
