import { Schema } from 'effect';

import {
  CategoryReasonSchema,
  CategoryRevisionSchema,
  CreateProductCategoryResultSchema,
} from './create-product-category.ts';
import { ProductCategoryRefSchema } from '../resources/product-category.ts';

export const MoveProductCategoryPayloadSchema = Schema.Struct({
  categoryRef: ProductCategoryRefSchema,
  expectedRevision: CategoryRevisionSchema,
  parentRef: Schema.optionalKey(ProductCategoryRefSchema),
  reason: CategoryReasonSchema,
});
export type MoveProductCategoryPayload = typeof MoveProductCategoryPayloadSchema.Type;
export const MoveProductCategoryResultSchema = CreateProductCategoryResultSchema;
