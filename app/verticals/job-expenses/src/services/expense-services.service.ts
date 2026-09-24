import type { ReadServiceFactory } from '@app/core-runtime';
import type { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { Effect } from 'effect';
import { expensePersistenceService } from './expense-persistence.service.ts';
import type { ExpensePersistence } from './expense-persistence.service.ts';
import { jobsReadService } from './jobs-read.service.ts';
import type { JobsReader } from './jobs-read.service.ts';

export type ExpenseServices = ExpensePersistence & { readonly jobs: JobsReader };
export const expenseServices: ReadServiceFactory<ExpenseServices, GatewayPrincipalVerifierConfiguration> = Effect.fn(
  'ExpenseServices.make',
)(function* makeExpenseServices(transaction, scope) {
  const { jobs, store } = yield* Effect.all(
    {
      jobs: jobsReadService(scope),
      store: expensePersistenceService(transaction, scope),
    },
    { concurrency: 2 },
  );
  return { ...store, jobs };
});
