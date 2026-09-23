import { Schema } from 'effect';
import { InquiryIdSchema, InquiryRevisionSchema, InquiryTransitionSchema } from '../resources/sales-inquiry.ts';

export const TransitionInquiryPayloadSchema = Schema.Struct({
  expectedRevision: InquiryRevisionSchema,
  id: InquiryIdSchema,
  transition: InquiryTransitionSchema,
});
export { SalesInquirySchema as TransitionInquiryResultSchema } from '../resources/sales-inquiry.ts';
export type TransitionInquiryPayload = typeof TransitionInquiryPayloadSchema.Type;
