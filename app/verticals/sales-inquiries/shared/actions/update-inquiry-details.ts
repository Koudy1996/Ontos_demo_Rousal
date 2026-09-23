import { Schema } from 'effect';
import { InquiryDetailsSchema, InquiryIdSchema, InquiryRevisionSchema } from '../resources/sales-inquiry.ts';

export const UpdateInquiryDetailsPayloadSchema = Schema.Struct({
  details: InquiryDetailsSchema,
  expectedRevision: InquiryRevisionSchema,
  id: InquiryIdSchema,
});
export { SalesInquirySchema as UpdateInquiryDetailsResultSchema } from '../resources/sales-inquiry.ts';
export type UpdateInquiryDetailsPayload = typeof UpdateInquiryDetailsPayloadSchema.Type;
