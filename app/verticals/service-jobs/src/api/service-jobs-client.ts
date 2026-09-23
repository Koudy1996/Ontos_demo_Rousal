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
  serviceJobsApiContract,
  serviceJobsApi,
  serviceJobsFoundationApi,
  serviceJobsOperationContexts,
} from '../../shared/api.ts';
import type { ServiceJobsReadiness } from '../../shared/api.ts';

// <generated-action-http-client-exports>
export {
  executeCreateServiceJob,
  executeCreateServiceJobWithAuthorization,
} from './create-service-job-action-client.ts';
export {
  executeScheduleServiceJob,
  executeScheduleServiceJobWithAuthorization,
} from './schedule-service-job-action-client.ts';
export { executeStartServiceJob, executeStartServiceJobWithAuthorization } from './start-service-job-action-client.ts';
export {
  executeCompleteServiceJob,
  executeCompleteServiceJobWithAuthorization,
} from './complete-service-job-action-client.ts';
export { executeUpdateExecution, executeUpdateExecutionWithAuthorization } from './update-execution-action-client.ts';
// </generated-action-http-client-exports>
export { executeJobDetailWithAuthorization } from './job-detail-client.ts';

type ServiceJobsApiGroups = typeof serviceJobsApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type ServiceJobsClient = HttpApiClient.Client<Extract<ServiceJobsApiGroups, HttpApiGroup.Constraint>>;

export type ServiceJobsClientError = HttpClientError.HttpClientError | Schema.SchemaError;

export type ServiceJobsClientEffect<Success> = Effect.Effect<Success, ServiceJobsClientError>;

export type ServiceJobsClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };
export const createServiceJobsClient = (
  options: ServiceJobsClientOptions = {},
): ServiceJobsClientEffect<ServiceJobsClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: serviceJobsApi,
    baseUrl: baseUrl ?? serviceJobsApiContract.apiPrefix,
    defaultApiPrefix: serviceJobsApiContract.apiPrefix,
    requestContext,
  });
};

// The public deployment readiness endpoint has no user credentials or mutable request context.
const readinessClient = makeEffectHttpApiClient(serviceJobsFoundationApi, {
  baseUrl: serviceJobsApiContract.apiPrefix,
  requestContext: { operationContext: serviceJobsOperationContexts.readiness },
});
export const getServiceJobsReadiness: ServiceJobsClientEffect<ServiceJobsReadiness> = readinessClient.pipe(
  Effect.flatMap((client) => client.foundation.readiness({})),
);
