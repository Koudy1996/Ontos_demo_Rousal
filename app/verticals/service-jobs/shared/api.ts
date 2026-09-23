// <generated-governed-http-api-imports>
import { AcceptedSourceSelectionApi } from './apis/accepted-source-selection.ts';
import { JobListApi } from './apis/job-list.ts';
import { JobDetailApi } from './apis/job-detail.ts';
import { JobCommitStatusApi } from './apis/job-commit-status.ts';
import { PartyDisplayApi } from './apis/party-display.ts';
import { CreateServiceJobActionApi } from './apis/create-service-job-action.ts';
import { ScheduleServiceJobActionApi } from './apis/schedule-service-job-action.ts';
import { StartServiceJobActionApi } from './apis/start-service-job-action.ts';
import { CompleteServiceJobActionApi } from './apis/complete-service-job-action.ts';
import { UpdateExecutionActionApi } from './apis/update-execution-action.ts';
// </generated-governed-http-api-imports>
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalReadiness, MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { identity } from 'effect';

export type ServiceJobsReadiness = MicroVerticalReadiness;
export const serviceJobsMarkerSchema = MicroVerticalBuildMarkerSchema;
export const serviceJobsReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: serviceJobsMarkerSchema,
});

export type OperationContext = MicroVerticalOperationContext;

export const serviceJobsFoundationApi = HttpApi.make('ServiceJobsApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/service-jobs/readiness', { success: serviceJobsReadinessSchema }),
  ),
);

export const serviceJobsApi = HttpApi.make('ServiceJobsApi')
  .addHttpApi(serviceJobsFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(AcceptedSourceSelectionApi)
  .addHttpApi(JobListApi)
  .addHttpApi(JobDetailApi)
  .addHttpApi(JobCommitStatusApi)
  .addHttpApi(PartyDisplayApi)
  .addHttpApi(CreateServiceJobActionApi)
  .addHttpApi(ScheduleServiceJobActionApi)
  .addHttpApi(StartServiceJobActionApi)
  .addHttpApi(CompleteServiceJobActionApi)
  .addHttpApi(UpdateExecutionActionApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const serviceJobsOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'ServiceJobsApi:serviceJobs:readiness',
    routePath: '/service-jobs/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const serviceJobsApiContract = {
  apiPrefix: '/service-jobs-api',
  basePath: '/service-jobs-api/service-jobs',
  ownerId: 'service-jobs',
  readinessPath: '/service-jobs-api/service-jobs/readiness',
} as const;
