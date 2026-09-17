import { Schema } from 'effect';

import { SizeEquivalenceAssertionSchema } from '../domain/attribute-vocabulary.ts';
import { ProductReasonSchema } from '../domain/product.ts';

export const AssertSizeEquivalencePayloadSchema = Schema.Struct({
  assertion: SizeEquivalenceAssertionSchema,
  reason: ProductReasonSchema,
});
export type AssertSizeEquivalencePayload = typeof AssertSizeEquivalencePayloadSchema.Type;

export const AssertSizeEquivalenceResultSchema = Schema.Struct({ assertionId: Schema.String.check(Schema.isUUID()) });
export type AssertSizeEquivalenceResult = typeof AssertSizeEquivalenceResultSchema.Type;
