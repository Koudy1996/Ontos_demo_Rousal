import { Schema } from 'effect';

import {
  ProductDescriptionSchema,
  ProductNameSchema,
  ProductReasonSchema,
  ProductSchema,
  ProductRevisionSchema,
} from '../domain/product.ts';
import {
  CosmeticProductCorrectionSchema,
  ProductChangeClassificationSchema,
} from '../domain/product-change-classification.ts';
import { ProductRefSchema } from '../resources/product.ts';

export const CorrectProductPayloadSchema = Schema.Struct({
  classification: ProductChangeClassificationSchema,
  description: Schema.optionalKey(ProductDescriptionSchema),
  expectedRevision: ProductRevisionSchema,
  name: Schema.optionalKey(ProductNameSchema),
  productRef: ProductRefSchema,
  reason: ProductReasonSchema,
});
export type CorrectProductPayload = typeof CorrectProductPayloadSchema.Type;

export const CorrectProductResultSchema = Schema.Struct({
  changed: Schema.Boolean,
  classification: CosmeticProductCorrectionSchema,
  product: ProductSchema,
});
export type CorrectProductResult = typeof CorrectProductResultSchema.Type;
