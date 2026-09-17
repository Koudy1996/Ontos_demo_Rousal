import { describe, expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';

import { ProductTypeAssignmentSchema, selectCurrentProductType } from '../../shared/domain/product-type-identity.ts';
import { ProductTypeRefSchema } from '../../shared/resources/product-type.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const productTypeRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product-type',
  tenantId,
} as const;

describe('Catalog Product Type identity', () => {
  it('keeps a stable tenant-scoped Resource identity separate from Product identity', () => {
    expect(Schema.decodeUnknownSync(ProductTypeRefSchema)(productTypeRef)).toEqual(productTypeRef);
    expect(() => Schema.decodeUnknownSync(ProductTypeRefSchema)(productRef)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProductTypeRefSchema)({ ...productTypeRef, tenantId: ` ${tenantId}` }),
    ).toThrow();
  });

  it('allows two distinct Products to select the same type without merging their identities', () => {
    const secondProductRef = {
      ...productRef,
      resourceId: '44444444-4444-4444-8444-444444444444',
    } as const;
    const first = Effect.runSync(
      selectCurrentProductType(Schema.decodeUnknownSync(ProductTypeAssignmentSchema)({ productRef }).productRef, [
        Schema.decodeUnknownSync(ProductTypeRefSchema)(productTypeRef),
      ]),
    );
    const second = Effect.runSync(
      selectCurrentProductType(
        Schema.decodeUnknownSync(ProductTypeAssignmentSchema)({ productRef: secondProductRef }).productRef,
        [Schema.decodeUnknownSync(ProductTypeRefSchema)(productTypeRef)],
      ),
    );

    expect(first.currentProductTypeRef).toEqual(second.currentProductTypeRef);
    expect(first.productRef.resourceId).not.toBe(second.productRef.resourceId);
  });

  it('rejects two simultaneous current types even when they have the same identity', () => {
    const decodedProductRef = Schema.decodeUnknownSync(ProductTypeAssignmentSchema)({ productRef }).productRef;
    const decodedTypeRef = Schema.decodeUnknownSync(ProductTypeRefSchema)(productTypeRef);
    const error = Effect.runSync(
      selectCurrentProductType(decodedProductRef, [decodedTypeRef, decodedTypeRef]).pipe(Effect.flip),
    );

    expect(error).toMatchObject({ _tag: 'ProductTypeAssignmentConflict', reason: 'MULTIPLE_CURRENT_TYPES' });
  });

  it('allows an untyped draft without claiming any type, and rejects cross-tenant assignment', () => {
    const decodedProductRef = Schema.decodeUnknownSync(ProductTypeAssignmentSchema)({ productRef }).productRef;
    expect(Effect.runSync(selectCurrentProductType(decodedProductRef, []))).toEqual({ productRef: decodedProductRef });

    const otherTenantType = Schema.decodeUnknownSync(ProductTypeRefSchema)({
      ...productTypeRef,
      tenantId: '99999999-9999-4999-8999-999999999999',
    });
    expect(
      Effect.runSync(selectCurrentProductType(decodedProductRef, [otherTenantType]).pipe(Effect.flip)),
    ).toMatchObject({ _tag: 'ProductTypeAssignmentConflict', reason: 'CROSS_TENANT_TYPE' });
    expect(() =>
      Schema.decodeUnknownSync(ProductTypeAssignmentSchema)({ productRef, currentProductTypeRef: otherTenantType }),
    ).toThrow();
  });
});
