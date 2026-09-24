import { Effect, Schema } from 'effect';
import type { JobExpense, JobExpenseCategorySchema } from '../../../../shared/resources/job-expense.ts';
import { RecordJobExpensePayloadSchema } from '../../../../shared/actions/record-job-expense.ts';
import { UpdateJobExpensePayloadSchema } from '../../../../shared/actions/update-job-expense.ts';
import { VoidJobExpensePayloadSchema } from '../../../../shared/actions/void-job-expense.ts';
import type { ServiceJobRef } from '@app/service-jobs/resources/service-job';
import { executeRecordJobExpense } from '../../../api/record-job-expense-action-client.ts';
import { executeUpdateJobExpense } from '../../../api/update-job-expense-action-client.ts';
import { executeVoidJobExpense } from '../../../api/void-job-expense-action-client.ts';
import { dependencyReadGateway } from '../../../api/dependency-read-gateway.ts';
import { formInvalid } from './job-expenses-form-invalid.ts';
import { jobExpensesClientOptions } from './job-expenses-client-options.ts';

export interface ExpenseDraft {
  readonly amountCzk: string;
  readonly category: typeof JobExpenseCategorySchema.Type;
  readonly changeReason: string;
  readonly description: string;
  readonly incurredOn: string;
}

const canonicalAmount = (value: string) => value.trim().replace(',', '.');
const options = (key: string) => ({ ...jobExpensesClientOptions(), idempotencyKey: key });

export const recordExpenseCommand = (draft: ExpenseDraft, jobRef: ServiceJobRef, key: string) =>
  Schema.decodeEffect(RecordJobExpensePayloadSchema)({
    amountCzk: canonicalAmount(draft.amountCzk),
    category: draft.category,
    description: draft.description,
    incurredOn: draft.incurredOn,
    serviceJobRef: jobRef,
  }).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => dependencyReadGateway.invoke(executeRecordJobExpense(payload, key, options(key)))),
  );

export const updateExpenseCommand = (draft: ExpenseDraft, expense: JobExpense, key: string) =>
  Schema.decodeEffect(UpdateJobExpensePayloadSchema)({
    amountCzk: canonicalAmount(draft.amountCzk),
    category: draft.category,
    changeReason: draft.changeReason,
    description: draft.description,
    expectedRevision: expense.revision,
    id: expense.ref.resourceId,
    incurredOn: draft.incurredOn,
  }).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => dependencyReadGateway.invoke(executeUpdateJobExpense(payload, key, options(key)))),
  );

export const voidExpenseCommand = (expense: JobExpense, reason: string, key: string) =>
  Schema.decodeEffect(VoidJobExpensePayloadSchema)({
    expectedRevision: expense.revision,
    id: expense.ref.resourceId,
    voidReason: reason,
  }).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => dependencyReadGateway.invoke(executeVoidJobExpense(payload, key, options(key)))),
  );
