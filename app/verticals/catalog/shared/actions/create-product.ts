import { Schema } from 'effect';

import {
  ProductDescriptionSchema,
  ProductNameSchema,
  ProductReasonSchema,
  ProductSchema,
  ProductUuidSchema,
} from '../domain/product.ts';

export const CreateProductPayloadSchema = Schema.Struct({
  description: Schema.optionalKey(ProductDescriptionSchema),
  name: Schema.optionalKey(ProductNameSchema),
  reason: ProductReasonSchema,
  variantId: Schema.optionalKey(ProductUuidSchema),
});
export type CreateProductPayload = typeof CreateProductPayloadSchema.Type;

export const CreateProductResultSchema = Schema.Struct({
  product: ProductSchema,
  variantId: ProductUuidSchema,
});
export type CreateProductResult = typeof CreateProductResultSchema.Type;
