import {
  ActionRuntimeLive,
  ContextAccessLive,
  CorePersistenceLive,
  DatabaseConfigLive,
  ReadRuntimeLive,
  TenantModuleStateServiceLive,
} from '@app/core-runtime';
import type { ActionRuntime, GatewayAssertionRedemptionService, ReadRuntime } from '@app/core-runtime';
import {
  ActionPermissionLive,
  ActionRepositoryLive,
  ModuleEntrypointGatewayLive,
  ModuleStateGateLive,
  OperationalScopeResolverLive,
} from '@app/core-runtime/actions/runtime-wiring';
import { assembleEffectBffRuntime } from '@app/shared-contracts/server/effect-bff-runtime';
import { Effect, HttpApiBuilder, HttpRouter, Layer } from '@modern-js/bff-effect/effect-edge';
import type { EffectBffDefinition, EffectBffRuntime } from '@modern-js/bff-effect/effect-edge';
import { Layer as GovernedReadLayer, Logger, References, Schema, Tracer } from 'effect';
import { microVerticalOperationAttributes } from '@app/shared-contracts';
// <generated-governed-http-handler-support-imports>
import { ActionPrincipalVerifierLive as GovernedActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive as GovernedGatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
// </generated-governed-http-handler-support-imports>

// <generated-governed-http-handler-imports>
import { addProductCategoryAssignmentActionApiLive } from './add-product-category-assignment-action-server.ts';
import { changeVariantActionApiLive } from './change-variant-action-server.ts';
import { correctProductActionApiLive } from './correct-product-action-server.ts';
import { createAttributeDefinitionActionApiLive } from './create-attribute-definition-action-server.ts';
import { createControlledAttributeValueActionApiLive } from './create-controlled-attribute-value-action-server.ts';
import { createPackageDefinitionActionApiLive } from './create-package-definition-action-server.ts';
import { createProductActionApiLive } from './create-product-action-server.ts';
import { createProductCategoryActionApiLive } from './create-product-category-action-server.ts';
import { createProductRecoveryReadApiLive } from './create-product-recovery-read-server.ts';
import { createProductTypeActionApiLive } from './create-product-type-action-server.ts';
import { createProductUnitActionApiLive } from './create-product-unit-action-server.ts';
import { createVariantActionApiLive } from './create-variant-action-server.ts';
import { moveProductCategoryActionApiLive } from './move-product-category-action-server.ts';
import { productCategoryClassificationReadApiLive } from './product-category-classification-read-server.ts';
import { productCategoryHistoryReadApiLive } from './product-category-history-read-server.ts';
import { productDetailReadApiLive } from './product-detail-read-server.ts';
import { productHistoryReadApiLive } from './product-history-read-server.ts';
import { reactivateControlledAttributeValueActionApiLive } from './reactivate-controlled-attribute-value-action-server.ts';
import { reactivateProductActionApiLive } from './reactivate-product-action-server.ts';
import { reactivateVariantActionApiLive } from './reactivate-variant-action-server.ts';
import { removeProductAttributeValuesActionApiLive } from './remove-product-attribute-values-action-server.ts';
import { removeProductCategoryAssignmentActionApiLive } from './remove-product-category-assignment-action-server.ts';
import { removeVariantAttributeOverrideActionApiLive } from './remove-variant-attribute-override-action-server.ts';
import { renameAttributeDefinitionActionApiLive } from './rename-attribute-definition-action-server.ts';
import { renameControlledAttributeValueActionApiLive } from './rename-controlled-attribute-value-action-server.ts';
import { renameProductCategoryActionApiLive } from './rename-product-category-action-server.ts';
import { retireControlledAttributeValueActionApiLive } from './retire-controlled-attribute-value-action-server.ts';
import { retirePackageDefinitionActionApiLive } from './retire-package-definition-action-server.ts';
import { retireProductActionApiLive } from './retire-product-action-server.ts';
import { retireProductCategoryActionApiLive } from './retire-product-category-action-server.ts';
import { retireProductUnitActionApiLive } from './retire-product-unit-action-server.ts';
import { retireVariantActionApiLive } from './retire-variant-action-server.ts';
import { revisePackageDefinitionActionApiLive } from './revise-package-definition-action-server.ts';
import { reviseProductTypeActionApiLive } from './revise-product-type-action-server.ts';
import { reviseProductUnitActionApiLive } from './revise-product-unit-action-server.ts';
import { setProductAttributeValuesActionApiLive } from './set-product-attribute-values-action-server.ts';
import { setProductTypeActionApiLive } from './set-product-type-action-server.ts';
import { setProductUnitTargetDivisibilityActionApiLive } from './set-product-unit-target-divisibility-action-server.ts';
import { setVariantAttributeOverrideActionApiLive } from './set-variant-attribute-override-action-server.ts';
import { updateProductActionApiLive } from './update-product-action-server.ts';
// </generated-governed-http-handler-imports>

import { catalogApi, catalogOperationContexts } from '../shared/api.ts';
import { ultramodernApiMarker } from '../shared/ultramodern-build.ts';
import {
  catalogCorsAllowedHeaders,
  catalogCorsAllowedMethods,
  catalogCorsAllowedOrigins,
  resolveCatalogShellOrigin,
} from './runtime-support.ts';

const catalogReadinessLayer = HttpApiBuilder.group(catalogApi, 'foundation', (handlers) =>
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
      Effect.withSpan('ultramodern.api.catalog.readiness', {
        attributes: microVerticalOperationAttributes(catalogOperationContexts.readiness),
        kind: 'server',
      }),
    ),
  ),
);

declare const ULTRAMODERN_SHELL_ORIGIN: unknown;

const readShellOrigin = () => {
  try {
    return resolveCatalogShellOrigin(
      Schema.is(Schema.String)(ULTRAMODERN_SHELL_ORIGIN) ? ULTRAMODERN_SHELL_ORIGIN : undefined,
    );
  } catch {
    return resolveCatalogShellOrigin();
  }
};

const runtimeObservabilityLayers = [
  Logger.layer([Logger.defaultLogger, Logger.tracerLogger]),
  Layer.succeed(Tracer.Tracer, Tracer.make({ span: (options) => new Tracer.NativeSpan(options) })),
  Layer.succeed(References.MinimumLogLevel, 'Info'),
] as const;
const runtimeObservabilityLive = Layer.mergeAll(...runtimeObservabilityLayers);
const tenantModuleStateServiceLive = TenantModuleStateServiceLive.pipe(Layer.provide(CorePersistenceLive));
const moduleStateGateLive = ModuleStateGateLive.pipe(Layer.provide(tenantModuleStateServiceLive));
const operationalScopeResolverLive = Layer.provide(
  OperationalScopeResolverLive,
  Layer.mergeAll(CorePersistenceLive, ContextAccessLive),
);
const moduleEntrypointGatewayLive = ModuleEntrypointGatewayLive.pipe(Layer.provide(moduleStateGateLive));
const catalogActionRuntime = ActionRuntimeLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      CorePersistenceLive,
      ActionRepositoryLive,
      ActionPermissionLive,
      ContextAccessLive,
      moduleStateGateLive,
      moduleEntrypointGatewayLive,
      operationalScopeResolverLive,
    ),
  ),
  Layer.provide(DatabaseConfigLive),
);
const catalogReadRuntime = ReadRuntimeLive.pipe(
  Layer.provide(
    Layer.mergeAll(CorePersistenceLive, ContextAccessLive, moduleEntrypointGatewayLive, operationalScopeResolverLive),
  ),
  Layer.provide(DatabaseConfigLive),
);

type CatalogApiRuntimeArguments = readonly [
  readRuntime: Layer.Layer<ReadRuntime, Layer.Error<typeof catalogReadRuntime>>,
  actionRuntime: Layer.Layer<ActionRuntime, Layer.Error<typeof catalogActionRuntime>>,
  gatewayAssertionRedemption: Layer.Layer<GatewayAssertionRedemptionService>,
];

export const makeCatalogApiRuntime = (
  ...args: CatalogApiRuntimeArguments
): EffectBffDefinition<typeof catalogApi> & EffectBffRuntime<typeof catalogApi> => {
  const [governedReadRuntimeLive, governedActionRuntimeLive, gatewayAssertionRedemption] = args;
  const actionPrincipalVerifierLive = GovernedActionPrincipalVerifierLive.pipe(
    Layer.provide(governedActionRuntimeLive),
  );
  const apiHandlersLive = Layer.mergeAll(
    catalogReadinessLayer,
    // <generated-governed-http-handler-layers>
    addProductCategoryAssignmentActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    changeVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    correctProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createAttributeDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createPackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductRecoveryReadApiLive.pipe(
      GovernedReadLayer.provide(governedReadRuntimeLive),
      Layer.provide(governedActionRuntimeLive),
    ),
    createProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    moveProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    productCategoryClassificationReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productCategoryHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productDetailReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    reactivateControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reactivateProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reactivateVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductAttributeValuesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductCategoryAssignmentActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeVariantAttributeOverrideActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameAttributeDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retirePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    revisePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductAttributeValuesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductUnitTargetDivisibilityActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setVariantAttributeOverrideActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    updateProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    // </generated-governed-http-handler-layers>
  ).pipe(Layer.provide(Layer.mergeAll(actionPrincipalVerifierLive, gatewayAssertionRedemption)));
  const resolvedApiHandlersLive = apiHandlersLive.pipe(Layer.provide(runtimeObservabilityLive), Layer.orDie);
  const transportLive = HttpRouter.cors({
    allowedHeaders: [...catalogCorsAllowedHeaders],
    allowedMethods: [...catalogCorsAllowedMethods],
    allowedOrigins: catalogCorsAllowedOrigins(readShellOrigin()),
    maxAge: 600,
  });

  return assembleEffectBffRuntime({
    api: catalogApi,
    handlers: resolvedApiHandlersLive,
    transport: transportLive,
  });
};

const apiRuntime = makeCatalogApiRuntime(
  catalogReadRuntime,
  catalogActionRuntime,
  GovernedGatewayAssertionRedemptionLive,
);

export default apiRuntime;

export { catalogActionRuntime };
