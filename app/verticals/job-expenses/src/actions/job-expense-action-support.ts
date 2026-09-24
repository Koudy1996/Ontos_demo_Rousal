import type { ActionHandlerContext } from '@app/core-runtime';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { DateTime, Effect } from 'effect';
import type { JobExpense } from '../../shared/resources/job-expense.ts';
import { JobExpenseRejected } from '../../shared/resources/job-expense-failure.ts';
import type { ExpenseServices } from '../services/expense-services.service.ts';

const pragueDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Prague',
  year: 'numeric',
});

export const validateIncurredOn = (incurredOn: string, now: DateTime.Utc) =>
  incurredOn <= pragueDateFormatter.format(DateTime.toDateUtc(now))
    ? Effect.void
    : Effect.fail(new JobExpenseRejected({ code: 'invalid_expense', reason: 'Expense date cannot be in the future' }));

export const recordExpenseRead = (
  context: ActionHandlerContext<Record<never, never>, ExpenseServices>,
  expense: JobExpense,
) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: `expense-invariant:${expense.ref.resourceId}`,
    resultCount: 1,
    servingModuleKey: 'job.expenses',
    targetModuleKey: 'job.expenses',
    targetResourceId: expense.ref.resourceId,
    targetResourceType: 'job.expenses.job-expense',
  });

export const recordJobRead = (context: ActionHandlerContext<Record<never, never>, ExpenseServices>, job: ServiceJob) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: `current-job:${job.ref.resourceId}`,
    resultCount: 1,
    servingModuleKey: 'service.jobs',
    targetModuleKey: 'service.jobs',
    targetResourceId: job.ref.resourceId,
    targetResourceType: 'service.jobs.service-job',
  });
