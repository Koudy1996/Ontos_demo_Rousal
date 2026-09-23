import { Schema } from 'effect';

import {
  ExpectedPriceGroupCurrentEvidenceSchema,
  PriceGroupInstantSchema,
  PriceGroupReasonSchema,
  PriceGroupRetirementAcceptanceSchema,
} from '../domain/price-group.ts';

export const RetirePriceGroupPayloadSchema = Schema.Struct({
  effectiveAt: PriceGroupInstantSchema,
  expectedCurrent: ExpectedPriceGroupCurrentEvidenceSchema,
  reason: PriceGroupReasonSchema,
});
export type RetirePriceGroupPayload = typeof RetirePriceGroupPayloadSchema.Type;

export const RetirePriceGroupResultSchema = PriceGroupRetirementAcceptanceSchema;
