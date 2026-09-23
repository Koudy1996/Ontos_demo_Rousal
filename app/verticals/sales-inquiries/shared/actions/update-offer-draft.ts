import { Schema } from 'effect';
import { InquiryIdSchema, InquiryRevisionSchema, OfferDraftSchema } from '../resources/sales-inquiry.ts';

export const UpdateOfferDraftPayloadSchema = Schema.Struct({
  expectedRevision: InquiryRevisionSchema,
  id: InquiryIdSchema,
  offer: OfferDraftSchema,
});
export { SalesInquirySchema as UpdateOfferDraftResultSchema } from '../resources/sales-inquiry.ts';
export type UpdateOfferDraftPayload = typeof UpdateOfferDraftPayloadSchema.Type;
