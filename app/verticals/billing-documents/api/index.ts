import {
  ActionRuntimeLive,
  ContextAccessLive as GovernedContextAccessLive,
  CorePersistenceLive as GovernedCorePersistenceLive,
  DatabaseConfigLive as GovernedDatabaseConfigLive,
  ReadRuntimeLive as GovernedReadRuntimeLive,
  TenantModuleStateServiceLive as GovernedTenantModuleStateServiceLive,
} from '@app/core-runtime';
import {
  ActionPermissionLive,
  ActionRepositoryLive,
  ModuleEntrypointGatewayLive as GovernedModuleEntrypointGatewayLive,
  ModuleStateGateLive as GovernedModuleStateGateLive,
  OperationalScopeResolverLive as GovernedOperationalScopeResolverLive,
} from '@app/core-runtime/actions/runtime-wiring';
import { withDependencyCredentialRedaction } from '@app/shared-contracts/dependency-read-gateway';
import { assembleEffectBffRuntime } from '@app/shared-contracts/server/effect-bff-runtime';
import { Effect, HttpApiBuilder, Layer } from '@modern-js/bff-effect/effect-edge';
import { Logger, References, Tracer, Layer as GovernedReadLayer } from 'effect';
import { FetchHttpClient, HttpRouter } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { billingDocumentsApi, billingDocumentsOperationContexts } from '../shared/api.ts';
import type { OperationContext } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';
import { BillingDocumentsCorsLive } from '../src/auth/cors.ts';
import { replaySqlLive } from '../src/auth/replay-sql-runtime.ts';
import { StaffAuthenticationNamespaceRegistryLive } from '../src/auth/staff-authentication-namespace.ts';
import { billingOwnerGatewayCredentialLive } from './owner-gateway-credential.ts';
// <generated-governed-http-handler-support-imports>
import { ActionPrincipalVerifierLive as GovernedActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive as GovernedGatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
// </generated-governed-http-handler-support-imports>

// <generated-governed-http-handler-imports>
import { billingDocumentsCommitStatusReadApiLive } from './billing-documents-commit-status-read-server.ts';
import { createInvoiceDraftActionApiLive } from './create-invoice-draft-action-server.ts';
import { invoiceableJobsReadApiLive } from './invoiceable-jobs-read-server.ts';
import { invoiceDetailReadApiLive } from './invoice-detail-read-server.ts';
import { invoiceDraftSupportReadApiLive } from './invoice-draft-support-read-server.ts';
import { invoiceListReadApiLive } from './invoice-list-read-server.ts';
import { issueInvoiceActionApiLive } from './issue-invoice-action-server.ts';
import { updateInvoiceDraftActionApiLive } from './update-invoice-draft-action-server.ts';
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
  billingDocumentsCommitStatusReadApiLive.pipe(
    GovernedReadLayer.provide(governedReadRuntimeLive),
    Layer.provide(governedActionRuntimeLive),
  ),
  createInvoiceDraftActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  invoiceableJobsReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  invoiceDetailReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  invoiceDraftSupportReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  invoiceListReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
  issueInvoiceActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
  updateInvoiceDraftActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
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

const billingDocumentsReadinessLayer = HttpApiBuilder.group(billingDocumentsApi, 'foundation', (handlers) =>
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
      Effect.withSpan('ultramodern.api.billingDocuments.readiness', {
        attributes: operationAttributes(billingDocumentsOperationContexts.readiness),
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
const apiHandlersLive = Layer.mergeAll(billingDocumentsReadinessLayer, governedReadApiHandlersLive).pipe(
  GovernedReadLayer.provide(GovernedDatabaseConfigLive),
  GovernedReadLayer.provide(runtimeObservabilityLive),
  GovernedReadLayer.provide(StaffAuthenticationNamespaceRegistryLive),
  GovernedReadLayer.provide(BillingDocumentsCorsLive),
  GovernedReadLayer.provide(dependencyReadTransportLive),
  GovernedReadLayer.provide(billingOwnerGatewayCredentialLive),
  GovernedReadLayer.provide(FetchHttpClient.layer),
  GovernedReadLayer.orDie,
);
export const makeBillingDocumentsApiRuntime = () =>
  assembleEffectBffRuntime({
    api: billingDocumentsApi,
    handlers: apiHandlersLive,
  });
const apiRuntime = makeBillingDocumentsApiRuntime();

export default apiRuntime;
