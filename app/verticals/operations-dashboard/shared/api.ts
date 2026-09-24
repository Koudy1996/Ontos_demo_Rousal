// <generated-governed-http-api-imports>
import { DashboardOverviewApi } from './apis/dashboard-overview.ts';
// </generated-governed-http-api-imports>
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalOperationContext, MicroVerticalReadiness } from '@modern-js/bff-effect/microvertical-api';
import { identity } from 'effect';

export type OperationsDashboardReadiness = MicroVerticalReadiness;
export const operationsDashboardMarkerSchema = MicroVerticalBuildMarkerSchema;
export const operationsDashboardReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: operationsDashboardMarkerSchema,
});
export type OperationContext = MicroVerticalOperationContext;

export const operationsDashboardFoundationApi = HttpApi.make('OperationsDashboardApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/operations-dashboard/readiness', {
      success: operationsDashboardReadinessSchema,
    }),
  ),
);
export const operationsDashboardApi = HttpApi.make('OperationsDashboardApi')
  .addHttpApi(operationsDashboardFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(DashboardOverviewApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const operationsDashboardOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'OperationsDashboardApi:operationsDashboard:readiness',
    routePath: '/operations-dashboard/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const operationsDashboardApiContract = {
  apiPrefix: '/operations-dashboard-api',
  basePath: '/operations-dashboard-api/operations-dashboard',
  ownerId: 'operations-dashboard',
  readinessPath: '/operations-dashboard-api/operations-dashboard/readiness',
} as const;
