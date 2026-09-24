import type { EffectBffRequestContext } from '@app/shared-contracts/client-runtime';
import { Effect, makeEffectHttpApiClient } from '@modern-js/bff-effect/effect-client';
import { makeEffectBffClient } from '@app/shared-contracts/client-runtime';
import type {
  HttpClientError,
  HttpApi,
  HttpApiClient,
  HttpApiGroup,
  Schema,
} from '@modern-js/bff-effect/effect-client';

import {
  workforceApiContract,
  workforceApi,
  workforceFoundationApi,
  workforceOperationContexts,
} from '../../shared/api.ts';
import type { WorkforceReadiness } from '../../shared/api.ts';

// <generated-action-http-client-exports>
export { executeAddAbsence, executeAddAbsenceWithAuthorization } from './add-absence-action-client.ts';
export { executeAssignWorker, executeAssignWorkerWithAuthorization } from './assign-worker-action-client.ts';
export {
  executeChangeWorkerStatus,
  executeChangeWorkerStatusWithAuthorization,
} from './change-worker-status-action-client.ts';
export { executeCreateWorker, executeCreateWorkerWithAuthorization } from './create-worker-action-client.ts';
export { executeRemoveAbsence, executeRemoveAbsenceWithAuthorization } from './remove-absence-action-client.ts';
export { executeUnassignWorker, executeUnassignWorkerWithAuthorization } from './unassign-worker-action-client.ts';
export { executeUpdateWorker, executeUpdateWorkerWithAuthorization } from './update-worker-action-client.ts';
// </generated-action-http-client-exports>

export { executeWeeklyScheduleWithAuthorization } from './weekly-schedule-client.ts';

type WorkforceApiGroups = typeof workforceApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type WorkforceClient = HttpApiClient.Client<Extract<WorkforceApiGroups, HttpApiGroup.Constraint>>;

export type WorkforceClientError = HttpClientError.HttpClientError | Schema.SchemaError;

export type WorkforceClientEffect<Success> = Effect.Effect<Success, WorkforceClientError>;

export type WorkforceClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };
export const createWorkforceClient = (options: WorkforceClientOptions = {}): WorkforceClientEffect<WorkforceClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: workforceApi,
    baseUrl: baseUrl ?? workforceApiContract.apiPrefix,
    defaultApiPrefix: workforceApiContract.apiPrefix,
    requestContext,
  });
};

// The public deployment readiness endpoint has no user credentials or mutable request context.
const readinessClient = makeEffectHttpApiClient(workforceFoundationApi, {
  baseUrl: workforceApiContract.apiPrefix,
  requestContext: { operationContext: workforceOperationContexts.readiness },
});
export const getWorkforceReadiness: WorkforceClientEffect<WorkforceReadiness> = readinessClient.pipe(
  Effect.flatMap((client) => client.foundation.readiness({})),
);
