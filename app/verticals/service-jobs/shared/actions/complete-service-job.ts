import { Schema } from 'effect';

import { JobIdSchema, JobRevisionSchema } from '../resources/service-job.ts';

export const CompleteServiceJobPayloadSchema = Schema.Struct({ expectedRevision: JobRevisionSchema, id: JobIdSchema });
export { ServiceJobSchema as CompleteServiceJobResultSchema } from '../resources/service-job.ts';

export type CompleteServiceJobPayload = typeof CompleteServiceJobPayloadSchema.Type;
