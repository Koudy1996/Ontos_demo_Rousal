import type { EffectBffRequestContext } from '@app/shared-contracts/client-runtime';
import { makeEffectBffClient } from '@app/shared-contracts/client-runtime';
import { Effect, makeEffectHttpApiClient } from '@modern-js/bff-effect/effect-client';
import type {
  HttpApi,
  HttpApiClient,
  HttpApiGroup,
  HttpClientError,
  Schema,
} from '@modern-js/bff-effect/effect-client';
import {
  jobExpensesApi,
  jobExpensesApiContract,
  jobExpensesFoundationApi,
  jobExpensesOperationContexts,
} from '../../shared/api.ts';
import type { JobExpensesReadiness } from '../../shared/api.ts';

// <generated-action-http-client-exports>
export {
  executeRecordJobExpense,
  executeRecordJobExpenseWithAuthorization,
} from './record-job-expense-action-client.ts';
export {
  executeUpdateJobExpense,
  executeUpdateJobExpenseWithAuthorization,
} from './update-job-expense-action-client.ts';
export { executeVoidJobExpense, executeVoidJobExpenseWithAuthorization } from './void-job-expense-action-client.ts';
// </generated-action-http-client-exports>

export { executeJobEconomics, executeJobEconomicsWithAuthorization } from './job-economics-client.ts';
export { executeJobExpenseList, executeJobExpenseListWithAuthorization } from './job-expense-list-client.ts';
export {
  executeJobExpensesCommitStatus,
  executeJobExpensesCommitStatusWithAuthorization,
} from './job-expenses-commit-status-client.ts';
export { executeJobSelection, executeJobSelectionWithAuthorization } from './job-selection-client.ts';

type JobExpensesApiGroups = typeof jobExpensesApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type JobExpensesClient = HttpApiClient.Client<Extract<JobExpensesApiGroups, HttpApiGroup.Constraint>>;
export type JobExpensesClientError = HttpClientError.HttpClientError | Schema.SchemaError;
export type JobExpensesClientEffect<Success> = Effect.Effect<Success, JobExpensesClientError>;
export type JobExpensesClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };

export const createJobExpensesClient = (
  options: JobExpensesClientOptions = {},
): JobExpensesClientEffect<JobExpensesClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: jobExpensesApi,
    baseUrl: baseUrl ?? jobExpensesApiContract.apiPrefix,
    defaultApiPrefix: jobExpensesApiContract.apiPrefix,
    requestContext,
  });
};

// The public deployment readiness endpoint has no user credentials or mutable request context.
const readinessClient = makeEffectHttpApiClient(jobExpensesFoundationApi, {
  baseUrl: jobExpensesApiContract.apiPrefix,
  requestContext: { operationContext: jobExpensesOperationContexts.readiness },
});
export const getJobExpensesReadiness: JobExpensesClientEffect<JobExpensesReadiness> = readinessClient.pipe(
  Effect.flatMap((client) => client.foundation.readiness({})),
);
