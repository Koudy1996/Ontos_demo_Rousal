// <generated-governed-http-api-imports>
import { AddAbsenceActionApi } from './apis/add-absence-action.ts';
import { AssignWorkerActionApi } from './apis/assign-worker-action.ts';
import { AvailableWorkersApi } from './apis/available-workers.ts';
import { ChangeWorkerStatusActionApi } from './apis/change-worker-status-action.ts';
import { CreateWorkerActionApi } from './apis/create-worker-action.ts';
import { RemoveAbsenceActionApi } from './apis/remove-absence-action.ts';
import { UnassignWorkerActionApi } from './apis/unassign-worker-action.ts';
import { UpdateWorkerActionApi } from './apis/update-worker-action.ts';
import { WeeklyScheduleApi } from './apis/weekly-schedule.ts';
import { WorkerDetailApi } from './apis/worker-detail.ts';
import { WorkerListApi } from './apis/worker-list.ts';
import { WorkforceCommitStatusApi } from './apis/workforce-commit-status.ts';
// </generated-governed-http-api-imports>
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalReadiness, MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { identity } from 'effect';

export type WorkforceReadiness = MicroVerticalReadiness;
export const workforceMarkerSchema = MicroVerticalBuildMarkerSchema;
export const workforceReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: workforceMarkerSchema,
});

export type OperationContext = MicroVerticalOperationContext;

export const workforceFoundationApi = HttpApi.make('WorkforceApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/workforce/readiness', { success: workforceReadinessSchema }),
  ),
);

export const workforceApi = HttpApi.make('WorkforceApi')
  .addHttpApi(workforceFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(AddAbsenceActionApi)
  .addHttpApi(AssignWorkerActionApi)
  .addHttpApi(AvailableWorkersApi)
  .addHttpApi(ChangeWorkerStatusActionApi)
  .addHttpApi(CreateWorkerActionApi)
  .addHttpApi(RemoveAbsenceActionApi)
  .addHttpApi(UnassignWorkerActionApi)
  .addHttpApi(UpdateWorkerActionApi)
  .addHttpApi(WeeklyScheduleApi)
  .addHttpApi(WorkerDetailApi)
  .addHttpApi(WorkerListApi)
  .addHttpApi(WorkforceCommitStatusApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const workforceOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'WorkforceApi:workforce:readiness',
    routePath: '/workforce/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const workforceApiContract = {
  apiPrefix: '/workforce-api',
  basePath: '/workforce-api/workforce',
  ownerId: 'workforce',
  readinessPath: '/workforce-api/workforce/readiness',
} as const;
