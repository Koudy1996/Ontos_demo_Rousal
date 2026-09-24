import { Schema } from 'effect';

import { WorkerSchema, WorkerProfileSchema, WorkerIdSchema } from '../resources/worker.ts';

export const UpdateWorkerPayloadSchema = Schema.Struct({
  ...WorkerProfileSchema.fields,
  expectedRevision: WorkerSchema.fields.revision,
  id: WorkerIdSchema,
});
export { WorkerSchema as UpdateWorkerResultSchema } from '../resources/worker.ts';

export type UpdateWorkerPayload = typeof UpdateWorkerPayloadSchema.Type;
