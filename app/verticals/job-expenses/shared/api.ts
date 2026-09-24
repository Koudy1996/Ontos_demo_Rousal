// <generated-governed-http-api-imports>
import { JobEconomicsApi } from './apis/job-economics.ts';
import { JobExpenseListApi } from './apis/job-expense-list.ts';
import { JobExpensesCommitStatusApi } from './apis/job-expenses-commit-status.ts';
import { JobSelectionApi } from './apis/job-selection.ts';
import { RecordJobExpenseActionApi } from './apis/record-job-expense-action.ts';
import { UpdateJobExpenseActionApi } from './apis/update-job-expense-action.ts';
import { VoidJobExpenseActionApi } from './apis/void-job-expense-action.ts';
// </generated-governed-http-api-imports>
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalReadiness, MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { identity } from 'effect';

export type JobExpensesReadiness = MicroVerticalReadiness;

export const jobExpensesMarkerSchema = MicroVerticalBuildMarkerSchema;
export const jobExpensesReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: jobExpensesMarkerSchema,
});

export type OperationContext = MicroVerticalOperationContext;

export const jobExpensesFoundationApi = HttpApi.make('JobExpensesApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/job-expenses/readiness', { success: jobExpensesReadinessSchema }),
  ),
);
export const jobExpensesApi = HttpApi.make('JobExpensesApi')
  .addHttpApi(jobExpensesFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(JobEconomicsApi)
  .addHttpApi(JobExpenseListApi)
  .addHttpApi(JobExpensesCommitStatusApi)
  .addHttpApi(JobSelectionApi)
  .addHttpApi(RecordJobExpenseActionApi)
  .addHttpApi(UpdateJobExpenseActionApi)
  .addHttpApi(VoidJobExpenseActionApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const jobExpensesOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'JobExpensesApi:jobExpenses:readiness',
    routePath: '/job-expenses/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const jobExpensesApiContract = {
  apiPrefix: '/job-expenses-api',
  basePath: '/job-expenses-api/job-expenses',
  ownerId: 'job-expenses',
  readinessPath: '/job-expenses-api/job-expenses/readiness',
} as const;
