import { Effect, Schema } from 'effect';

import { ProductEvidenceReferenceSchema, ProductReasonSchema } from './product.ts';
import { ProductReferenceSchema, VariantReferenceSchema } from './product-form-separation.ts';

export const CosmeticProductCorrectionSchema = Schema.Struct({
  affectsOpenSelection: Schema.Boolean,
  evidenceRefs: Schema.NonEmptyArray(ProductEvidenceReferenceSchema),
  kind: Schema.Literal('COSMETIC_CORRECTION'),
  productRef: ProductReferenceSchema,
  reason: ProductReasonSchema,
  variantRef: Schema.optionalKey(VariantReferenceSchema),
});
export type CosmeticProductCorrection = typeof CosmeticProductCorrectionSchema.Type;

/** Classification is an assertion about real-world meaning, not a textual diff. */
export const ProductChangeClassificationSchema = Schema.Union([
  CosmeticProductCorrectionSchema,
  Schema.Struct({
    affectsOpenSelection: Schema.Literal(true),
    evidenceRefs: Schema.NonEmptyArray(ProductEvidenceReferenceSchema),
    kind: Schema.Literal('NEW_REALIZATION'),
    newVariantRef: VariantReferenceSchema,
    productRef: ProductReferenceSchema,
    reason: ProductReasonSchema,
  }),
  Schema.Struct({
    affectsOpenSelection: Schema.Literal(true),
    evidenceRefs: Schema.NonEmptyArray(ProductEvidenceReferenceSchema),
    kind: Schema.Literal('NEW_PRODUCT'),
    newProductRef: ProductReferenceSchema,
    reason: ProductReasonSchema,
    /**
     * A different common business identity always replaces a named previous Product. A genuinely
     * unrelated Product is created through #414, never classified as a change, so the original
     * reference can never start denoting another thing without an explicit distinction.
     */
    previousProductRef: ProductReferenceSchema,
  }),
  Schema.Struct({
    affectsOpenSelection: Schema.Literal(true),
    evidenceRefs: Schema.NonEmptyArray(ProductEvidenceReferenceSchema),
    kind: Schema.Literal('SUCCESSOR_REALIZATION'),
    newVariantRef: VariantReferenceSchema,
    previousVariantRef: VariantReferenceSchema,
    productRef: ProductReferenceSchema,
    reason: ProductReasonSchema,
  }),
]);
export type ProductChangeClassification = typeof ProductChangeClassificationSchema.Type;

export class ProductChangeClassificationConflict extends Schema.TaggedError<ProductChangeClassificationConflict>()(
  'ProductChangeClassificationConflict',
  {
    code: Schema.Literal('product_change_classification_conflict'),
    reason: Schema.String,
  },
) {}

/**
 * Preserve Product identity for the same good or service. A cosmetic correction
 * preserves Variant identity; a material atomic realization must use a new one.
 * The evidence reference locates support for the assertion, not proof inferred
 * from a field-level difference.
 */
export const classifyProductChange = (
  change: ProductChangeClassification,
): Effect.Effect<ProductChangeClassification, ProductChangeClassificationConflict> => {
  if (change.kind === 'NEW_PRODUCT') {
    if (change.previousProductRef.tenantId !== change.newProductRef.tenantId) {
      return Effect.fail(
        new ProductChangeClassificationConflict({
          code: 'product_change_classification_conflict',
          reason: 'Product successor references must belong to the same Tenant',
        }),
      );
    }
    if (change.previousProductRef.resourceId === change.newProductRef.resourceId) {
      return Effect.fail(
        new ProductChangeClassificationConflict({
          code: 'product_change_classification_conflict',
          reason: 'A different Product must have a new Product identity',
        }),
      );
    }
    return Effect.succeed(change);
  }
  const productTenantId = change.productRef.tenantId;
  let variantRefs: readonly { tenantId: string }[];
  if (change.kind === 'COSMETIC_CORRECTION') {
    variantRefs = change.variantRef === undefined ? [] : [change.variantRef];
  } else if (change.kind === 'NEW_REALIZATION') {
    variantRefs = [change.newVariantRef];
  } else {
    variantRefs = [change.previousVariantRef, change.newVariantRef];
  }

  if (variantRefs.some((reference) => reference.tenantId !== productTenantId)) {
    return Effect.fail(
      new ProductChangeClassificationConflict({
        code: 'product_change_classification_conflict',
        reason: 'Product and Variant references must belong to the same Tenant',
      }),
    );
  }
  if (
    change.kind === 'SUCCESSOR_REALIZATION' &&
    change.previousVariantRef.resourceId === change.newVariantRef.resourceId
  ) {
    return Effect.fail(
      new ProductChangeClassificationConflict({
        code: 'product_change_classification_conflict',
        reason: 'A material successor must have a new Variant identity',
      }),
    );
  }
  return Effect.succeed(change);
};
