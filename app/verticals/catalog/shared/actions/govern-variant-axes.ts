import { Schema } from 'effect';

import { CatalogRevisionNumberSchema } from '../domain/catalog-revision-reference.ts';
import { ProductReasonSchema } from '../domain/product.ts';
import { AttributeDefinitionRefSchema } from '../resources/attribute-definition.ts';
import { ProductRefSchema } from '../resources/product.ts';

const AxisDefinitionSchema = Schema.Struct({
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  definitionRevision: CatalogRevisionNumberSchema,
});

/** A complete replacement, in display order, of a Product's distinguishing roles. */
export const GovernVariantAxesPayloadSchema = Schema.Struct({
  axes: Schema.Array(AxisDefinitionSchema).check(Schema.isMaxLength(32)),
  expectedAxisRevision: Schema.Finite.check(Schema.isInt(), Schema.isBetween({ maximum: 2_147_483_646, minimum: 0 })),
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
});
export type GovernVariantAxesPayload = typeof GovernVariantAxesPayloadSchema.Type;

export const GovernVariantAxesResultSchema = Schema.Struct({
  axisRevision: CatalogRevisionNumberSchema,
  changed: Schema.Boolean,
  productRef: ProductRefSchema,
});
