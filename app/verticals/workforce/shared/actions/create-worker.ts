import { WorkerProfileSchema } from '../resources/worker.ts';

export const CreateWorkerPayloadSchema = WorkerProfileSchema;
export { WorkerSchema as CreateWorkerResultSchema } from '../resources/worker.ts';

export type CreateWorkerPayload = typeof CreateWorkerPayloadSchema.Type;
