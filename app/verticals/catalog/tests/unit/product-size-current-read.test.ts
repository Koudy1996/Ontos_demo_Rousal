import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ProductSizeCurrentRequestSchema,
  ProductSizeCurrentResponseSchema,
} from '../../shared/apis/product-size-current.ts';
import { productSizeCurrentRead } from '../../src/api/product-size-current.read.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
};
const sizeId = '33333333-3333-4333-8333-333333333333';

describe('Product Size Current governed read', () => {
  it('requires a Product target and resource read authorization', () => {
    expect(Schema.is(ProductSizeCurrentRequestSchema)({ productRef })).toBe(true);
    expect(
      Schema.is(ProductSizeCurrentRequestSchema)({
        productRef: { ...productRef, resourceType: 'commerce.catalog.variant' },
      }),
    ).toBe(false);
    expect(productSizeCurrentRead.descriptor.resourcePermission).toBeDefined();
    expect(productSizeCurrentRead.descriptor.permissionTarget).toBe('module');
    expect(productSizeCurrentRead.descriptor.legalEntityScope).toBe('required');
  });

  it('exposes only exact ordered Size identities and usage revision, without inferred dimensions', () => {
    expect(
      Schema.is(ProductSizeCurrentResponseSchema)({
        productRef,
        revision: 2,
        sizes: [
          { position: 0, sizeId },
          { position: 1, sizeId: '44444444-4444-4444-8444-444444444444' },
        ],
      }),
    ).toBe(true);
    expect(Schema.is(ProductSizeCurrentResponseSchema)({ productRef, revision: 0, sizes: [] })).toBe(true);
    expect(Schema.is(ProductSizeCurrentResponseSchema)({ productRef, revision: -1, sizes: [] })).toBe(false);
    expect(
      Schema.is(ProductSizeCurrentResponseSchema)({ productRef, revision: 1, sizes: [{ position: 0, sizeId: '80' }] }),
    ).toBe(false);
  });
});
