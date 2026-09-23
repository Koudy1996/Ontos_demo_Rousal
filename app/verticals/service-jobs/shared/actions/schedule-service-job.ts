import { Schema } from 'effect';

import { JobIdSchema, JobRevisionSchema, JobScheduleSchema } from '../resources/service-job.ts';

export const ScheduleServiceJobPayloadSchema = Schema.Struct({
  expectedRevision: JobRevisionSchema,
  id: JobIdSchema,
  ...JobScheduleSchema.fields,
});
export { ServiceJobSchema as ScheduleServiceJobResultSchema } from '../resources/service-job.ts';

export type ScheduleServiceJobPayload = typeof ScheduleServiceJobPayloadSchema.Type;
