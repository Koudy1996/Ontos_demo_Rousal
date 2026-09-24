import {
  ContextAccessLive as GovernedContextAccessLive,
  CorePersistenceLive as GovernedCorePersistenceLive,
  DatabaseConfigLive as GovernedDatabaseConfigLive,
  ReadRuntimeLive as GovernedReadRuntimeLive,
  TenantModuleStateServiceLive as GovernedTenantModuleStateServiceLive,
} from '@app/core-runtime';
import {
  ModuleEntrypointGatewayLive as GovernedModuleEntrypointGatewayLive,
  ModuleStateGateLive as GovernedModuleStateGateLive,
  OperationalScopeResolverLive as GovernedOperationalScopeResolverLive,
} from '@app/core-runtime/actions/runtime-wiring';
import { withDependencyCredentialRedaction } from '@app/shared-contracts/dependency-read-gateway';
import { assembleEffectBffRuntime } from '@app/shared-contracts/server/effect-bff-runtime';
import { Effect, HttpApiBuilder, Layer } from '@modern-js/bff-effect/effect-edge';
import { Layer as GovernedReadLayer, Logger, References, Tracer } from 'effect';
import { FetchHttpClient, HttpRouter } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { operationsDashboardApi, operationsDashboardOperationContexts } from '../shared/api.ts';
import type { OperationContext } from '../shared/api.ts';
import { OperationsDashboardCorsLive } from '../src/auth/cors.ts';
import { replaySqlLive } from '../src/auth/replay-sql-runtime.ts';
import { StaffAuthenticationNamespaceRegistryLive } from '../src/auth/staff-authentication-namespace.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';
import { dashboardOwnerGatewayCredentialLive } from './dashboard-owner-gateway-credential.ts';
// <generated-governed-http-handler-support-imports>
import { ActionPrincipalVerifierLive as GovernedActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive as GovernedGatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
// </generated-governed-http-handler-support-imports>

// <generated-governed-http-handler-imports>
import { dashboardOverviewReadApiLive } from './dashboard-overview-read-server.ts';
// </generated-governed-http-handler-imports>

const governedTenantModuleStateServiceLive = GovernedTenantModuleStateServiceLive.pipe(
  GovernedReadLayer.provide(GovernedCorePersistenceLive),
);
const governedModuleStateGateLive = GovernedModuleStateGateLive.pipe(
  GovernedReadLayer.provide(governedTenantModuleStateServiceLive),
);
const governedReadRuntimeDependenciesLive = GovernedReadLayer.mergeAll(
  GovernedCorePersistenceLive,
  GovernedContextAccessLive,
  GovernedModuleEntrypointGatewayLive.pipe(GovernedReadLayer.provide(governedModuleStateGateLive)),
  GovernedOperationalScopeResolverLive.pipe(
    GovernedReadLayer.provide(GovernedReadLayer.mergeAll(GovernedCorePersistenceLive, GovernedContextAccessLive)),
  ),
);
const governedReadRuntimeLive = GovernedReadRuntimeLive.pipe(
  GovernedReadLayer.provide(governedReadRuntimeDependenciesLive),
);

export const governedReadApiHandlersLive = Layer.mergeAll(
  // <generated-governed-http-handler-layers>
  dashboardOverviewReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  // </generated-governed-http-handler-layers>
).pipe(
  // <generated-governed-http-handler-support-layers>
  GovernedReadLayer.provide(
    GovernedReadLayer.mergeAll(
      GovernedActionPrincipalVerifierLive,
      GovernedGatewayAssertionRedemptionLive.pipe(
        GovernedReadLayer.provide(replaySqlLive.pipe(GovernedReadLayer.provide(Reactivity.layer))),
      ),
    ),
  ),
  // </generated-governed-http-handler-support-layers>
  GovernedReadLayer.provide(GovernedReadLayer.empty),
);

const operationAttributes = (operationContext: OperationContext) => {
  const attributes = {
    'modernjs.operation.id': operationContext.operationId,
    'modernjs.operation.method': operationContext.method,
    'modernjs.operation.route': operationContext.routePath,
    'modernjs.operation.source': operationContext.source,
  };
  if (operationContext.traceId !== undefined) {
    return { ...attributes, 'modernjs.trace.id': operationContext.traceId };
  }
  return attributes;
};

const operationsDashboardReadinessLayer = HttpApiBuilder.group(operationsDashboardApi, 'foundation', (handlers) =>
  handlers.handle('readiness', () =>
    Effect.succeed({
      checks: {
        api: 'ready' as const,
        moduleFederation: 'ready' as const,
        ssr: 'ready' as const,
        translations: 'ready' as const,
      },
      marker: ultramodernApiMarker,
      status: 'ready' as const,
      versionSkew: 'none' as const,
    }).pipe(
      Effect.withSpan('ultramodern.api.operationsDashboard.readiness', {
        attributes: operationAttributes(operationsDashboardOperationContexts.readiness),
        kind: 'server',
      }),
    ),
  ),
);

const runtimeObservabilityLive = GovernedReadLayer.mergeAll(
  Logger.layer([Logger.defaultLogger, Logger.tracerLogger]),
  GovernedReadLayer.succeed(Tracer.Tracer, Tracer.make({ span: (options) => new Tracer.NativeSpan(options) })),
  GovernedReadLayer.succeed(References.MinimumLogLevel, 'Info'),
);
const dependencyReadTransportLive = GovernedReadLayer.effectDiscard(
  HttpRouter.HttpRouter.pipe(
    Effect.flatMap((router) =>
      router.addGlobalMiddleware((effect) =>
        withDependencyCredentialRedaction(effect).pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
        ),
      ),
    ),
  ),
);
const apiHandlersLive = Layer.mergeAll(operationsDashboardReadinessLayer, governedReadApiHandlersLive).pipe(
  GovernedReadLayer.provide(GovernedDatabaseConfigLive),
  GovernedReadLayer.provide(GovernedContextAccessLive),
  GovernedReadLayer.provide(runtimeObservabilityLive),
  GovernedReadLayer.provide(StaffAuthenticationNamespaceRegistryLive),
  GovernedReadLayer.provide(OperationsDashboardCorsLive),
  GovernedReadLayer.provide(dependencyReadTransportLive),
  GovernedReadLayer.provide(dashboardOwnerGatewayCredentialLive),
  GovernedReadLayer.provide(FetchHttpClient.layer),
  GovernedReadLayer.orDie,
);

export const makeOperationsDashboardApiRuntime = () =>
  assembleEffectBffRuntime({ api: operationsDashboardApi, handlers: apiHandlersLive });

export default makeOperationsDashboardApiRuntime();
