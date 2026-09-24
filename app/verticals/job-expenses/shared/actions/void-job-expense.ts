import { Schema } from 'effect';
import { JobExpenseIdSchema, JobExpenseReasonSchema } from '../resources/job-expense.ts';

export { JobExpenseSchema as VoidJobExpenseResultSchema } from '../resources/job-expense.ts';

export const VoidJobExpensePayloadSchema = Schema.Struct({
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  id: JobExpenseIdSchema,
  voidReason: JobExpenseReasonSchema,
});
export type VoidJobExpensePayload = typeof VoidJobExpensePayloadSchema.Type;
