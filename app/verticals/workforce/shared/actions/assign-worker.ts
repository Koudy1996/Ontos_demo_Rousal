import { Schema } from 'effect';
import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { WorkerIdSchema } from '../resources/worker.ts';

export const AssignWorkerPayloadSchema = Schema.Struct({ jobRef: ServiceJobRefSchema, workerId: WorkerIdSchema });
export { WorkerSchema as AssignWorkerResultSchema } from '../resources/worker.ts';

export type AssignWorkerPayload = typeof AssignWorkerPayloadSchema.Type;
