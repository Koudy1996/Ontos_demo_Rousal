import { ServiceJobCorsLive } from '../src/auth/cors.ts';
import { StaffAuthenticationNamespaceRegistryLive } from '../src/auth/staff-authentication-namespace.ts';
import { Reactivity } from 'effect/unstable/reactivity';
import { replaySqlLive } from '../src/auth/replay-sql-runtime.ts';
import { Logger, References, Tracer, Layer as GovernedReadLayer } from 'effect';
import {
  ActionRuntimeLive,
  ContextAccessLive as GovernedContextAccessLive,
  CorePersistenceLive as GovernedCorePersistenceLive,
  DatabaseConfigLive as GovernedDatabaseConfigLive,
  ReadRuntimeLive as GovernedReadRuntimeLive,
  TenantModuleStateServiceLive as GovernedTenantModuleStateServiceLive,
} from '@app/core-runtime';
import { withDependencyCredentialRedaction } from '@app/shared-contracts/dependency-read-gateway';
import { HttpRouter, FetchHttpClient } from 'effect/unstable/http';
import {
  ActionPermissionLive,
  ActionRepositoryLive,
  ModuleEntrypointGatewayLive as GovernedModuleEntrypointGatewayLive,
  ModuleStateGateLive as GovernedModuleStateGateLive,
  OperationalScopeResolverLive as GovernedOperationalScopeResolverLive,
} from '@app/core-runtime/actions/runtime-wiring';
import { ActionPrincipalVerifierLive as GovernedActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive as GovernedGatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
import { assembleEffectBffRuntime } from '@app/shared-contracts/server/effect-bff-runtime';
import { Effect, HttpApiBuilder, Layer } from '@modern-js/bff-effect/effect-edge';
import { serviceJobsApi, serviceJobsOperationContexts } from '../shared/api.ts';
import type { OperationContext } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';

// <generated-governed-http-handler-support-imports>
// </generated-governed-http-handler-support-imports>

// <generated-governed-http-handler-imports>
import { acceptedSourceSelectionReadApiLive } from './accepted-source-selection-read-server.ts';
import { jobListReadApiLive } from './job-list-read-server.ts';
import { jobDetailReadApiLive } from './job-detail-read-server.ts';
import { jobCommitStatusReadApiLive } from './job-commit-status-read-server.ts';
import { partyDisplayReadApiLive } from './party-display-read-server.ts';
import { createServiceJobActionApiLive } from './create-service-job-action-server.ts';
import { scheduleServiceJobActionApiLive } from './schedule-service-job-action-server.ts';
import { startServiceJobActionApiLive } from './start-service-job-action-server.ts';
import { completeServiceJobActionApiLive } from './complete-service-job-action-server.ts';
import { updateExecutionActionApiLive } from './update-execution-action-server.ts';
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

const governedActionRuntimeLive = ActionRuntimeLive.pipe(
  GovernedReadLayer.provide(
    GovernedReadLayer.mergeAll(
      governedReadRuntimeDependenciesLive,
      ActionPermissionLive,
      ActionRepositoryLive,
      governedModuleStateGateLive,
    ),
  ),
);

export const governedReadApiHandlersLive = Layer.mergeAll(
  // <generated-governed-http-handler-layers>
  acceptedSourceSelectionReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  jobListReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  jobDetailReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  jobCommitStatusReadApiLive.pipe(
    GovernedReadLayer.provide(governedReadRuntimeLive),
    Layer.provide(governedActionRuntimeLive),
  ),
  partyDisplayReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  createServiceJobActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  scheduleServiceJobActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  startServiceJobActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  completeServiceJobActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  updateExecutionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
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

const serviceJobsReadinessLayer = HttpApiBuilder.group(serviceJobsApi, 'foundation', (handlers) =>
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
      Effect.withSpan('ultramodern.api.serviceJobs.readiness', {
        attributes: operationAttributes(serviceJobsOperationContexts.readiness),
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
const resolvedApiHandlersLive = Layer.mergeAll(serviceJobsReadinessLayer, governedReadApiHandlersLive).pipe(
  GovernedReadLayer.provide(GovernedDatabaseConfigLive),
  GovernedReadLayer.provide(runtimeObservabilityLive),
  GovernedReadLayer.provide(StaffAuthenticationNamespaceRegistryLive),
  GovernedReadLayer.provide(ServiceJobCorsLive),
  GovernedReadLayer.provide(dependencyReadTransportLive),
  GovernedReadLayer.orDie,
);
export const makeServiceJobsApiRuntime = () =>
  assembleEffectBffRuntime({
    api: serviceJobsApi,
    handlers: resolvedApiHandlersLive,
  });
const apiRuntime = makeServiceJobsApiRuntime();

export default apiRuntime;
