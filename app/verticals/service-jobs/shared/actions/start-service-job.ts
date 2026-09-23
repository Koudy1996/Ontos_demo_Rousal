import { Schema } from 'effect';

import { JobIdSchema, JobRevisionSchema } from '../resources/service-job.ts';

export const StartServiceJobPayloadSchema = Schema.Struct({ expectedRevision: JobRevisionSchema, id: JobIdSchema });
export { ServiceJobSchema as StartServiceJobResultSchema } from '../resources/service-job.ts';

export type StartServiceJobPayload = typeof StartServiceJobPayloadSchema.Type;
