import { Schema } from 'effect';

import { WorkerIdSchema, AbsenceInputSchema } from '../resources/worker.ts';

export const AddAbsencePayloadSchema = Schema.Struct({ workerId: WorkerIdSchema, ...AbsenceInputSchema.fields });
export { WorkerSchema as AddAbsenceResultSchema } from '../resources/worker.ts';

export type AddAbsencePayload = typeof AddAbsencePayloadSchema.Type;
