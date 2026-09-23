import type { InquiryDetailsSchema } from '../resources/sales-inquiry.ts';

export { InquiryDetailsSchema as CreateInquiryPayloadSchema } from '../resources/sales-inquiry.ts';
export { SalesInquirySchema as CreateInquiryResultSchema } from '../resources/sales-inquiry.ts';
export type CreateInquiryPayload = typeof InquiryDetailsSchema.Type;
