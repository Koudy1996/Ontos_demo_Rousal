import { Schema } from 'effect';
import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { WorkerIdSchema } from '../resources/worker.ts';

export const UnassignWorkerPayloadSchema = Schema.Struct({ jobRef: ServiceJobRefSchema, workerId: WorkerIdSchema });
export { WorkerSchema as UnassignWorkerResultSchema } from '../resources/worker.ts';

export type UnassignWorkerPayload = typeof UnassignWorkerPayloadSchema.Type;
