import { Schema } from 'effect';

import { JobIdSchema, JobRevisionSchema, JobExecutionSchema } from '../resources/service-job.ts';

export const UpdateExecutionPayloadSchema = Schema.Struct({
  expectedRevision: JobRevisionSchema,
  id: JobIdSchema,
  ...JobExecutionSchema.fields,
});
export { ServiceJobSchema as UpdateExecutionResultSchema } from '../resources/service-job.ts';

export type UpdateExecutionPayload = typeof UpdateExecutionPayloadSchema.Type;
