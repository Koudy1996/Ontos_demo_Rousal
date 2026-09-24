import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { Schema } from 'effect';
import { JobExpenseInputSchema } from '../resources/job-expense.ts';

export { JobExpenseSchema as RecordJobExpenseResultSchema } from '../resources/job-expense.ts';

export const RecordJobExpensePayloadSchema = Schema.Struct({
  ...JobExpenseInputSchema.fields,
  serviceJobRef: ServiceJobRefSchema,
});
export type RecordJobExpensePayload = typeof RecordJobExpensePayloadSchema.Type;
