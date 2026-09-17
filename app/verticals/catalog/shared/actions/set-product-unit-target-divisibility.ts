import { Schema } from 'effect';

import { ProductUnitRefSchema } from '../resources/product-unit.ts';
import {
  ProductUnitEvidenceRefsSchema,
  ProductUnitMutationResultSchema,
  ProductUnitReasonSchema,
} from './product-unit-contract.ts';

export const SetProductUnitTargetDivisibilityPayloadSchema = Schema.Struct({
  divisible: Schema.Boolean,
  evidenceRefs: ProductUnitEvidenceRefsSchema,
  expectedCurrentRevision: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  reason: ProductUnitReasonSchema,
  target: Schema.Struct({
    targetId: Schema.String.check(Schema.isUUID(), Schema.isTrimmed()),
    targetType: Schema.Literals(['commerce.catalog.variant', 'commerce.catalog.package-definition']),
    tenantId: Schema.String.check(Schema.isUUID(), Schema.isTrimmed()),
    unit: ProductUnitRefSchema,
  }),
});
export type SetProductUnitTargetDivisibilityPayload = typeof SetProductUnitTargetDivisibilityPayloadSchema.Type;
export const SetProductUnitTargetDivisibilityResultSchema = ProductUnitMutationResultSchema;
