import { Schema } from 'effect';
import { SalesInquiryRefSchema } from '@app/sales-inquiries/resources/sales-inquiry';

export const CreateServiceJobPayloadSchema = Schema.Struct({ sourceRef: SalesInquiryRefSchema });
export { ServiceJobSchema as CreateServiceJobResultSchema } from '../resources/service-job.ts';

export type CreateServiceJobPayload = typeof CreateServiceJobPayloadSchema.Type;
