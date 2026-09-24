import { Schema } from 'effect';

import { WorkerIdSchema, WorkerSchema, WorkerStatusSchema } from '../resources/worker.ts';

export const ChangeWorkerStatusPayloadSchema = Schema.Struct({
  expectedRevision: WorkerSchema.fields.revision,
  id: WorkerIdSchema,
  status: WorkerStatusSchema,
});
export { WorkerSchema as ChangeWorkerStatusResultSchema } from '../resources/worker.ts';

export type ChangeWorkerStatusPayload = typeof ChangeWorkerStatusPayloadSchema.Type;
