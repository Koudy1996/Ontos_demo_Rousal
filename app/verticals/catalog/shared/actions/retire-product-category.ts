import { Schema } from 'effect';

import {
  CategoryReasonSchema,
  CategoryRevisionSchema,
  CreateProductCategoryResultSchema,
} from './create-product-category.ts';
import { ProductCategoryRefSchema } from '../resources/product-category.ts';

export const RetireProductCategoryPayloadSchema = Schema.Struct({
  categoryRef: ProductCategoryRefSchema,
  expectedRevision: CategoryRevisionSchema,
  reason: CategoryReasonSchema,
});
export type RetireProductCategoryPayload = typeof RetireProductCategoryPayloadSchema.Type;
export const RetireProductCategoryResultSchema = CreateProductCategoryResultSchema;
