import { Schema } from 'effect';

import { AttributeValueSchema } from '../domain/attribute-values.ts';
import { CatalogRevisionNumberSchema } from '../domain/catalog-revision-reference.ts';
import { ProductReasonSchema } from '../domain/product.ts';
import { AttributeDefinitionRefSchema } from '../resources/attribute-definition.ts';
import { ProductRefSchema } from '../resources/product.ts';
import { VariantRefSchema } from '../resources/variant.ts';

// oxlint-disable-next-line effect-native/no-nullable-schema-field -- null is the explicit optimistic-create marker, distinct from an omitted revision. expires: 2027-03-31.
const revision = Schema.NullOr(CatalogRevisionNumberSchema);
const evidenceRefs = Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed())));
const conversion = Schema.Struct({
  denominator: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
  from: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  numerator: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
  quantity: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  to: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
});
const base = {
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  evidenceRefs,
  expectedRevision: revision,
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
};
const values = Schema.Array(AttributeValueSchema).check(Schema.isNonEmpty());
const setFields = { ...base, conversions: Schema.optionalKey(Schema.Array(conversion)), values };
const variantFields = { ...base, variantRef: VariantRefSchema };

export const SetProductAttributeValuesPayloadSchema = Schema.Struct(setFields);
export type SetProductAttributeValuesPayload = typeof SetProductAttributeValuesPayloadSchema.Type;
export const RemoveProductAttributeValuesPayloadSchema = Schema.Struct(base);
export type RemoveProductAttributeValuesPayload = typeof RemoveProductAttributeValuesPayloadSchema.Type;
export const SetVariantAttributeOverridePayloadSchema = Schema.Struct({ ...setFields, variantRef: VariantRefSchema });
export type SetVariantAttributeOverridePayload = typeof SetVariantAttributeOverridePayloadSchema.Type;
export const RemoveVariantAttributeOverridePayloadSchema = Schema.Struct({
  ...variantFields,
  expectedProductValueRevision: revision,
});
export type RemoveVariantAttributeOverridePayload = typeof RemoveVariantAttributeOverridePayloadSchema.Type;

const result = Schema.Struct({
  attributeValueSetId: Schema.String.check(Schema.isUUID()).pipe(
    Schema.brand('CatalogAttributeValueSetId'),
    Schema.decodeTo(Schema.String.check(Schema.isUUID())),
  ),
  revision: CatalogRevisionNumberSchema,
  state: Schema.Literals(['SET', 'REMOVED']),
});
export const SetProductAttributeValuesResultSchema = result;
export const RemoveProductAttributeValuesResultSchema = result;
export const SetVariantAttributeOverrideResultSchema = result;
export const RemoveVariantAttributeOverrideResultSchema = result;
export type AttributeValueMutationResult = typeof result.Type;
