import { Schema } from 'effect';

import { CatalogRevisionNumberSchema } from '../domain/catalog-revision-reference.ts';
import { ProductEvidenceReferenceSchema, ProductReasonSchema } from '../domain/product.ts';
import { AttributeDefinitionRefSchema } from '../resources/attribute-definition.ts';
import { ProductRefSchema } from '../resources/product.ts';

export const GovernProductAttributeApplicabilityPayloadSchema = Schema.Struct({
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  evidenceRefs: Schema.optionalKey(Schema.Array(ProductEvidenceReferenceSchema)),
  // oxlint-disable-next-line effect-native/no-nullable-schema-field -- null is the explicit wire token for no existing revision on initial declaration. expires: 2027-03-31.
  expectedRevision: Schema.NullOr(CatalogRevisionNumberSchema),
  productLevel: Schema.Boolean,
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
  variantLevel: Schema.Boolean,
});
export type GovernProductAttributeApplicabilityPayload = typeof GovernProductAttributeApplicabilityPayloadSchema.Type;

export const GovernProductAttributeApplicabilityResultSchema = Schema.Struct({
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  productLevel: Schema.Boolean,
  productRef: ProductRefSchema,
  revision: CatalogRevisionNumberSchema,
  variantLevel: Schema.Boolean,
});
export type GovernProductAttributeApplicabilityResult = typeof GovernProductAttributeApplicabilityResultSchema.Type;
