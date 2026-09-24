import { Schema } from 'effect';
import { JobExpenseIdSchema, JobExpenseInputSchema, JobExpenseReasonSchema } from '../resources/job-expense.ts';

export { JobExpenseSchema as UpdateJobExpenseResultSchema } from '../resources/job-expense.ts';

export const UpdateJobExpensePayloadSchema = Schema.Struct({
  ...JobExpenseInputSchema.fields,
  changeReason: JobExpenseReasonSchema,
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  id: JobExpenseIdSchema,
});
export type UpdateJobExpensePayload = typeof UpdateJobExpensePayloadSchema.Type;
