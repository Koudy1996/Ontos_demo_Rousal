import { Effect, Schema } from 'effect';

import { ProductRefSchema, type ProductRef } from '../resources/product.ts';
import { ProductTypeRefSchema, type ProductTypeRef } from '../resources/product-type.ts';

/** A Product has at most one current type; a draft may have none. */
export const ProductTypeAssignmentSchema = Schema.Struct({
  currentProductTypeRef: Schema.optionalKey(ProductTypeRefSchema),
  productRef: ProductRefSchema,
}).check(
  Schema.makeFilter(({ currentProductTypeRef, productRef }) =>
    currentProductTypeRef === undefined || currentProductTypeRef.tenantId === productRef.tenantId
      ? undefined
      : 'Product and current Product Type must belong to the same Tenant',
  ),
);
export type ProductTypeAssignment = typeof ProductTypeAssignmentSchema.Type;

export class ProductTypeAssignmentConflict extends Schema.TaggedError<ProductTypeAssignmentConflict>()(
  'ProductTypeAssignmentConflict',
  {
    reason: Schema.Literals(['MULTIPLE_CURRENT_TYPES', 'CROSS_TENANT_TYPE']),
  },
) {}

/** Resolve an explicit set of current candidates without merging type rules. */
export const selectCurrentProductType = (
  productRef: ProductRef,
  candidates: ReadonlyArray<ProductTypeRef>,
): Effect.Effect<ProductTypeAssignment, ProductTypeAssignmentConflict> => {
  if (candidates.length > 1) {
    return Effect.fail(new ProductTypeAssignmentConflict({ reason: 'MULTIPLE_CURRENT_TYPES' }));
  }

  const currentProductTypeRef = candidates[0];
  if (currentProductTypeRef !== undefined && currentProductTypeRef.tenantId !== productRef.tenantId) {
    return Effect.fail(new ProductTypeAssignmentConflict({ reason: 'CROSS_TENANT_TYPE' }));
  }

  return Effect.succeed({
    productRef,
    ...(currentProductTypeRef === undefined ? {} : { currentProductTypeRef }),
  });
};
