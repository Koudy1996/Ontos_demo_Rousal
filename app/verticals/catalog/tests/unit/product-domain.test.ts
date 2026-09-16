import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  CatalogReadinessSchema,
  ProductHistorySchema,
  ProductSchema,
  ProductVariantSchema,
  catalogReadiness,
} from '../../shared/domain/product.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const actionInvocationId = '44444444-4444-4444-8444-444444444444';
const instant = '2026-09-16T12:00:00.000Z';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;

describe('Catalog Product domain', () => {
  it('keeps one Product identity while allowing Catalog readiness to be derived', () => {
    const draft = {
      lifecycle: 'DRAFT',
      name: '  ',
      variants: [{ lifecycle: 'WORK_IN_PROGRESS', variantId }],
    } as const;
    const active = {
      lifecycle: 'ACTIVE',
      name: 'Standard Product',
      variants: [{ lifecycle: 'ACTIVE', variantId }],
    } as const;

    expect(catalogReadiness(draft).catalogReady).toBe(false);
    expect(catalogReadiness(active)).toEqual({ catalogReady: true, reasons: [] });
    expect(Schema.decodeUnknownSync(ProductRefSchema)(productRef)).toEqual(productRef);
    expect(productRef.resourceId).toBe(productId);
  });

  it('requires an ACTIVE Variant rather than a work-in-progress or retired Variant', () => {
    const readiness = catalogReadiness({
      lifecycle: 'ACTIVE',
      name: 'Standard Product',
      variants: [{ lifecycle: 'RETIRED', variantId }],
    });

    expect(readiness).toEqual({
      catalogReady: false,
      reasons: ['Product needs at least one ACTIVE Variant'],
    });
    expect(
      catalogReadiness({
        lifecycle: 'ACTIVE',
        name: 'Standard Product',
        variants: [{ lifecycle: 'WORK_IN_PROGRESS', variantId }],
      }),
    ).toEqual({ catalogReady: false, reasons: ['Product needs at least one ACTIVE Variant'] });
    expect(() => Schema.decodeUnknownSync(ProductVariantSchema)({ lifecycle: 'INVALID', variantId })).toThrow();
  });

  it('decodes immutable historical revisions and lifecycle evidence through the public schemas', () => {
    const product = Schema.decodeUnknownSync(ProductSchema)({
      catalogReady: true,
      createdAt: instant,
      lifecycle: 'ACTIVE',
      name: 'Standard Product',
      productRef,
      revision: 1,
      updatedAt: instant,
      variants: [{ lifecycle: 'ACTIVE', variantId }],
    });
    const history = Schema.decodeUnknownSync(ProductHistorySchema)({
      lifecycle: [
        {
          actionInvocationId,
          effectiveAt: instant,
          event: 'ACTIVATED',
          productRef,
          reason: 'Approved for Catalog use',
          recordedAt: instant,
        },
      ],
      productRef,
      revisions: [
        {
          actionInvocationId,
          changeKind: 'CREATED',
          evidenceRefs: [],
          name: 'Standard Product',
          productRef,
          reason: 'Create the Product identity',
          recordedAt: instant,
          revision: 1,
        },
      ],
    });

    expect(product.productRef).toEqual(productRef);
    expect(history.revisions[0]?.productRef).toEqual(productRef);
    expect(Schema.decodeUnknownSync(CatalogReadinessSchema)(catalogReadiness(product))).toEqual({
      catalogReady: true,
      reasons: [],
    });
  });
});
