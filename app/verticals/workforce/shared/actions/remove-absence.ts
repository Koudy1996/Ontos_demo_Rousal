import { Schema } from 'effect';

import { AbsenceIdSchema, WorkerIdSchema } from '../resources/worker.ts';

export const RemoveAbsencePayloadSchema = Schema.Struct({ id: AbsenceIdSchema, workerId: WorkerIdSchema });
export { WorkerSchema as RemoveAbsenceResultSchema } from '../resources/worker.ts';

export type RemoveAbsencePayload = typeof RemoveAbsencePayloadSchema.Type;
