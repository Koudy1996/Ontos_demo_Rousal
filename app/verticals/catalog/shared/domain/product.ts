import { DateTime, Option, Schema, SchemaGetter } from 'effect';

import { ProductRefSchema } from '../resources/product.ts';

export const ProductLifecycleSchema = Schema.Literals(['DRAFT', 'ACTIVE', 'RETIRED']);
export type ProductLifecycle = typeof ProductLifecycleSchema.Type;

export const ProductVariantLifecycleSchema = Schema.Literals(['WORK_IN_PROGRESS', 'ACTIVE', 'RETIRED']);
export type ProductVariantLifecycle = typeof ProductVariantLifecycleSchema.Type;

export const ProductNameSchema = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(240));
export const ProductDescriptionSchema = Schema.Trim.check(Schema.isMaxLength(4000));
export const ProductReasonSchema = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(1000));
export const ProductEvidenceReferenceSchema = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(300));
export const ProductAuditEvidenceSchema = Schema.Struct({
  evidenceRefs: Schema.optionalKey(Schema.Array(ProductEvidenceReferenceSchema)),
  reason: ProductReasonSchema,
});
export const ProductRevisionSchema = Schema.Finite.check(
  Schema.isInt(),
  Schema.isBetween({ maximum: 2_147_483_647, minimum: 1 }),
);
const checkedUuid = Schema.String.check(Schema.isUUID(), Schema.isTrimmed());
export const ProductVariantIdSchema = checkedUuid.pipe(
  Schema.brand('CatalogProductVariantId'),
  Schema.decodeTo(checkedUuid),
);
export const ProductActionInvocationIdSchema = checkedUuid.pipe(
  Schema.brand('CatalogProductActionInvocationId'),
  Schema.decodeTo(checkedUuid),
);
export const ProductUuidSchema = ProductVariantIdSchema;

export const ProductInstantSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u),
  Schema.makeFilter((value) => {
    const parsed = DateTime.make(value);
    const canonicalInput = value.length === 20 ? value.replace(/Z$/u, '.000Z') : value;
    return Option.isSome(parsed) && DateTime.formatIso(parsed.value) === canonicalInput
      ? undefined
      : 'Expected a canonical UTC timestamp';
  }),
).pipe(
  Schema.decode({
    decode: SchemaGetter.dateTimeUtcFromInput<string>().map(DateTime.formatIso),
    encode: SchemaGetter.dateTimeUtcFromInput<string>().map(DateTime.formatIso),
  }),
);

export const ProductVariantSchema = Schema.Struct({
  lifecycle: ProductVariantLifecycleSchema,
  variantId: ProductVariantIdSchema,
});
export type ProductVariant = typeof ProductVariantSchema.Type;

/**
 * The foundation deliberately models a Variant only as a stable work-in-progress
 * realization. Variant axes, SKU, packages, configurations, and sets are added by
 * their owning downstream slices without changing Product identity.
 */
export const ProductSchema = Schema.Struct({
  catalogReady: Schema.Boolean,
  createdAt: ProductInstantSchema,
  description: Schema.optionalKey(ProductDescriptionSchema),
  lifecycle: ProductLifecycleSchema,
  name: Schema.optionalKey(ProductNameSchema),
  productRef: ProductRefSchema,
  revision: ProductRevisionSchema,
  updatedAt: ProductInstantSchema,
  variants: Schema.Array(ProductVariantSchema),
});
export type Product = typeof ProductSchema.Type;

export const ProductChangeKindSchema = Schema.Literals(['CREATED', 'UPDATED', 'COSMETIC_CORRECTION', 'LIFECYCLE']);
export type ProductChangeKind = typeof ProductChangeKindSchema.Type;

export const ProductRevisionRecordSchema = Schema.Struct({
  actionInvocationId: ProductActionInvocationIdSchema,
  changeKind: ProductChangeKindSchema,
  description: Schema.optionalKey(ProductDescriptionSchema),
  evidenceRefs: Schema.Array(ProductEvidenceReferenceSchema),
  name: Schema.optionalKey(ProductNameSchema),
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
  recordedAt: ProductInstantSchema,
  revision: ProductRevisionSchema,
});
export type ProductRevisionRecord = typeof ProductRevisionRecordSchema.Type;

export const ProductLifecycleEventSchema = Schema.Struct({
  actionInvocationId: ProductActionInvocationIdSchema,
  effectiveAt: ProductInstantSchema,
  event: Schema.Literals(['ACTIVATED', 'RETIRED']),
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
  recordedAt: ProductInstantSchema,
});
export type ProductLifecycleEvent = typeof ProductLifecycleEventSchema.Type;

export const ProductHistorySchema = Schema.Struct({
  lifecycle: Schema.Array(ProductLifecycleEventSchema),
  productRef: ProductRefSchema,
  revisions: Schema.Array(ProductRevisionRecordSchema),
});
export type ProductHistory = typeof ProductHistorySchema.Type;

export const CatalogReadinessSchema = Schema.Struct({
  catalogReady: Schema.Boolean,
  reasons: Schema.Array(Schema.String),
});
export type CatalogReadiness = typeof CatalogReadinessSchema.Type;

export const catalogReadiness = (product: Pick<Product, 'lifecycle' | 'name' | 'variants'>): CatalogReadiness => {
  const reasons: string[] = [];
  if (product.lifecycle !== 'ACTIVE') {
    reasons.push('Product must be ACTIVE');
  }
  if (product.name === undefined || product.name.length === 0) {
    reasons.push('Product needs a current name');
  }
  if (!product.variants.some(({ lifecycle }) => lifecycle === 'ACTIVE')) {
    reasons.push('Product needs at least one ACTIVE Variant');
  }
  return { catalogReady: reasons.length === 0, reasons };
};

export const productIsCatalogReady = (product: Pick<Product, 'lifecycle' | 'name' | 'variants'>): boolean =>
  catalogReadiness(product).catalogReady;
