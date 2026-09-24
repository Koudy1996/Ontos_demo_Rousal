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
  operationsDashboardApi,
  operationsDashboardApiContract,
  operationsDashboardFoundationApi,
  operationsDashboardOperationContexts,
} from '../../shared/api.ts';
import type { OperationsDashboardReadiness } from '../../shared/api.ts';

export { executeDashboardOverview, executeDashboardOverviewWithAuthorization } from './dashboard-overview-client.ts';

type OperationsDashboardApiGroups =
  typeof operationsDashboardApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type OperationsDashboardClient = HttpApiClient.Client<
  Extract<OperationsDashboardApiGroups, HttpApiGroup.Constraint>
>;
export type OperationsDashboardClientError = HttpClientError.HttpClientError | Schema.SchemaError;
export type OperationsDashboardClientEffect<Success> = Effect.Effect<Success, OperationsDashboardClientError>;
export type OperationsDashboardClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };

export const createOperationsDashboardClient = (
  options: OperationsDashboardClientOptions = {},
): OperationsDashboardClientEffect<OperationsDashboardClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: operationsDashboardApi,
    baseUrl: baseUrl ?? operationsDashboardApiContract.apiPrefix,
    defaultApiPrefix: operationsDashboardApiContract.apiPrefix,
    requestContext,
  });
};

const readinessClient = makeEffectHttpApiClient(operationsDashboardFoundationApi, {
  baseUrl: operationsDashboardApiContract.apiPrefix,
  requestContext: { operationContext: operationsDashboardOperationContexts.readiness },
});
export const getOperationsDashboardReadiness: OperationsDashboardClientEffect<OperationsDashboardReadiness> =
  readinessClient.pipe(Effect.flatMap((client) => client.foundation.readiness({})));
