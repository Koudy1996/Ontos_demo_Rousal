import { Schema } from 'effect';

import {
  ProductDescriptionSchema,
  ProductEvidenceReferenceSchema,
  ProductNameSchema,
  ProductReasonSchema,
  ProductSchema,
  ProductRevisionSchema,
} from '../domain/product.ts';
import { ProductRefSchema } from '../resources/product.ts';

export const CorrectProductPayloadSchema = Schema.Struct({
  description: Schema.optionalKey(ProductDescriptionSchema),
  evidenceRefs: Schema.optionalKey(Schema.Array(ProductEvidenceReferenceSchema)),
  expectedRevision: ProductRevisionSchema,
  name: Schema.optionalKey(ProductNameSchema),
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
});
export type CorrectProductPayload = typeof CorrectProductPayloadSchema.Type;

export const CorrectProductResultSchema = Schema.Struct({
  changed: Schema.Boolean,
  product: ProductSchema,
});
export type CorrectProductResult = typeof CorrectProductResultSchema.Type;
