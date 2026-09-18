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
import type { EffectBffRuntimeAssembly } from '@app/shared-contracts/server/effect-bff-runtime';
import { Effect, HttpApiBuilder, HttpRouter, Layer } from '@modern-js/bff-effect/effect-edge';
import type { EffectBffDefinition, EffectBffRuntime } from '@modern-js/bff-effect/effect-edge';
import { Layer as GovernedReadLayer, Logger, References, Schema, Tracer } from 'effect';
import { microVerticalOperationAttributes } from '@app/shared-contracts';
// <generated-governed-http-handler-support-imports>
import { ActionPrincipalVerifierLive as GovernedActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive as GovernedGatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
// </generated-governed-http-handler-support-imports>

// <generated-governed-http-handler-imports>
import { activatePackageDefinitionActionApiLive } from './activate-package-definition-action-server.ts';
import { activatePackageOptionActionApiLive } from './activate-package-option-action-server.ts';
import { addProductCategoryAssignmentActionApiLive } from './add-product-category-assignment-action-server.ts';
import { assertSizeEquivalenceActionApiLive } from './assert-size-equivalence-action-server.ts';
import { assignCatalogMediaActionApiLive } from './assign-catalog-media-action-server.ts';
import { assignSkuActionApiLive } from './assign-sku-action-server.ts';
import { brandCurrentReadApiLive } from './brand-current-read-server.ts';
import { brandHistoryReadApiLive } from './brand-history-read-server.ts';
import { catalogMediaCurrentReadApiLive } from './catalog-media-current-read-server.ts';
import { changeProductManufacturerActionApiLive } from './change-product-manufacturer-action-server.ts';
import { changeProductRelationshipActionApiLive } from './change-product-relationship-action-server.ts';
import { changeVariantActionApiLive } from './change-variant-action-server.ts';
import { colorCurrentReadApiLive } from './color-current-read-server.ts';
import { colorHistoryReadApiLive } from './color-history-read-server.ts';
import { confirmGtinActionApiLive } from './confirm-gtin-action-server.ts';
import { correctGtinActionApiLive } from './correct-gtin-action-server.ts';
import { correctProductActionApiLive } from './correct-product-action-server.ts';
import { correctSkuActionApiLive } from './correct-sku-action-server.ts';
import { createAttributeDefinitionActionApiLive } from './create-attribute-definition-action-server.ts';
import { createBrandActionApiLive } from './create-brand-action-server.ts';
import { createConfigurationUnitActionApiLive } from './create-configuration-unit-action-server.ts';
import { createControlledAttributeValueActionApiLive } from './create-controlled-attribute-value-action-server.ts';
import { createPackageDefinitionActionApiLive } from './create-package-definition-action-server.ts';
import { createProductActionApiLive } from './create-product-action-server.ts';
import { createProductCategoryActionApiLive } from './create-product-category-action-server.ts';
import { createProductRecoveryReadApiLive } from './create-product-recovery-read-server.ts';
import { createProductRelationshipActionApiLive } from './create-product-relationship-action-server.ts';
import { createProductTypeActionApiLive } from './create-product-type-action-server.ts';
import { createProductUnitActionApiLive } from './create-product-unit-action-server.ts';
import { createSetCompositionActionApiLive } from './create-set-composition-action-server.ts';
import { createVariantActionApiLive } from './create-variant-action-server.ts';
import { decideProductTypeUnnecessaryActionApiLive } from './decide-product-type-unnecessary-action-server.ts';
import { effectiveAttributeValuesCurrentReadApiLive } from './effective-attribute-values-current-read-server.ts';
import { governProductAttributeApplicabilityActionApiLive } from './govern-product-attribute-applicability-action-server.ts';
import { governVariantAxesActionApiLive } from './govern-variant-axes-action-server.ts';
import { gtinCurrentReadApiLive } from './gtin-current-read-server.ts';
import { gtinHistoryReadApiLive } from './gtin-history-read-server.ts';
import { manufacturerRelationCurrentReadApiLive } from './manufacturer-relation-current-read-server.ts';
import { manufacturerRelationHistoryReadApiLive } from './manufacturer-relation-history-read-server.ts';
import { markGtinUnresolvedActionApiLive } from './mark-gtin-unresolved-action-server.ts';
import { moveProductCategoryActionApiLive } from './move-product-category-action-server.ts';
import { packageDefinitionHistoryReadApiLive } from './package-definition-history-read-server.ts';
import { packageOptionHistoryReadApiLive } from './package-option-history-read-server.ts';
import { productBrandCurrentReadApiLive } from './product-brand-current-read-server.ts';
import { productBrandHistoryReadApiLive } from './product-brand-history-read-server.ts';
import { productCategoryClassificationReadApiLive } from './product-category-classification-read-server.ts';
import { productCategoryHistoryReadApiLive } from './product-category-history-read-server.ts';
import { productDetailReadApiLive } from './product-detail-read-server.ts';
import { productHistoryReadApiLive } from './product-history-read-server.ts';
import { productRelationshipCurrentReadApiLive } from './product-relationship-current-read-server.ts';
import { productRelationshipHistoryReadApiLive } from './product-relationship-history-read-server.ts';
import { productSizeCurrentReadApiLive } from './product-size-current-read-server.ts';
import { promotePackageDefinitionActionApiLive } from './promote-package-definition-action-server.ts';
import { publishProductConfigurationActionApiLive } from './publish-product-configuration-action-server.ts';
import { quantityPreparationReadApiLive } from './quantity-preparation-read-server.ts';
import { reactivateBrandActionApiLive } from './reactivate-brand-action-server.ts';
import { reactivateControlledAttributeValueActionApiLive } from './reactivate-controlled-attribute-value-action-server.ts';
import { reactivateProductActionApiLive } from './reactivate-product-action-server.ts';
import { reactivateVariantActionApiLive } from './reactivate-variant-action-server.ts';
import { removeCatalogMediaActionApiLive } from './remove-catalog-media-action-server.ts';
import { removeProductAttributeValuesActionApiLive } from './remove-product-attribute-values-action-server.ts';
import { removeProductCategoryAssignmentActionApiLive } from './remove-product-category-assignment-action-server.ts';
import { removeProductLocalizedFactsActionApiLive } from './remove-product-localized-facts-action-server.ts';
import { removeProductManufacturerActionApiLive } from './remove-product-manufacturer-action-server.ts';
import { removeProductRelationshipActionApiLive } from './remove-product-relationship-action-server.ts';
import { removeVariantAttributeOverrideActionApiLive } from './remove-variant-attribute-override-action-server.ts';
import { removeVariantLocalizedFactsActionApiLive } from './remove-variant-localized-facts-action-server.ts';
import { renameAttributeDefinitionActionApiLive } from './rename-attribute-definition-action-server.ts';
import { renameBrandActionApiLive } from './rename-brand-action-server.ts';
import { renameControlledAttributeValueActionApiLive } from './rename-controlled-attribute-value-action-server.ts';
import { renameProductCategoryActionApiLive } from './rename-product-category-action-server.ts';
import { renameSkuActionApiLive } from './rename-sku-action-server.ts';
import { reorderCatalogMediaActionApiLive } from './reorder-catalog-media-action-server.ts';
import { replaceProductSizesActionApiLive } from './replace-product-sizes-action-server.ts';
import { retireBrandActionApiLive } from './retire-brand-action-server.ts';
import { retireConfigurationUnitActionApiLive } from './retire-configuration-unit-action-server.ts';
import { retireControlledAttributeValueActionApiLive } from './retire-controlled-attribute-value-action-server.ts';
import { retireGtinActionApiLive } from './retire-gtin-action-server.ts';
import { retirePackageDefinitionActionApiLive } from './retire-package-definition-action-server.ts';
import { retirePackageOptionActionApiLive } from './retire-package-option-action-server.ts';
import { retireProductActionApiLive } from './retire-product-action-server.ts';
import { retireProductCategoryActionApiLive } from './retire-product-category-action-server.ts';
import { retireProductUnitActionApiLive } from './retire-product-unit-action-server.ts';
import { retireVariantActionApiLive } from './retire-variant-action-server.ts';
import { reviseAttributeDefinitionActionApiLive } from './revise-attribute-definition-action-server.ts';
import { reviseConfigurationUnitActionApiLive } from './revise-configuration-unit-action-server.ts';
import { revisePackageDefinitionActionApiLive } from './revise-package-definition-action-server.ts';
import { reviseProductTypeActionApiLive } from './revise-product-type-action-server.ts';
import { reviseProductUnitActionApiLive } from './revise-product-unit-action-server.ts';
import { reviseSetCompositionActionApiLive } from './revise-set-composition-action-server.ts';
import { setProductAttributeValuesActionApiLive } from './set-product-attribute-values-action-server.ts';
import { setProductBrandActionApiLive } from './set-product-brand-action-server.ts';
import { setProductLocalizedFactsActionApiLive } from './set-product-localized-facts-action-server.ts';
import { setProductManufacturerActionApiLive } from './set-product-manufacturer-action-server.ts';
import { setProductTypeActionApiLive } from './set-product-type-action-server.ts';
import { setProductUnitTargetDivisibilityActionApiLive } from './set-product-unit-target-divisibility-action-server.ts';
import { setVariantAttributeOverrideActionApiLive } from './set-variant-attribute-override-action-server.ts';
import { setVariantLocalizedFactsActionApiLive } from './set-variant-localized-facts-action-server.ts';
import { skuLookupReadApiLive } from './sku-lookup-read-server.ts';
import { updateProductActionApiLive } from './update-product-action-server.ts';
import { variantHistoryReadApiLive } from './variant-history-read-server.ts';
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

type CatalogApiGroups = (typeof catalogApi.groups)[keyof typeof catalogApi.groups];

export const makeCatalogApiRuntime = (
  ...args: CatalogApiRuntimeArguments
): EffectBffDefinition<typeof catalogApi> & EffectBffRuntime<typeof catalogApi> => {
  const [governedReadRuntimeLive, actionRuntimeLive, gatewayAssertionRedemption] = args;
  const governedActionRuntimeLive = Layer.mergeAll(actionRuntimeLive, governedReadRuntimeLive);
  const actionPrincipalVerifierLive = GovernedActionPrincipalVerifierLive.pipe(
    Layer.provide(governedActionRuntimeLive),
  );
  const apiHandlersLive = Layer.mergeAll(
    catalogReadinessLayer,
    // <generated-governed-http-handler-layers>
    activatePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    activatePackageOptionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    addProductCategoryAssignmentActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    assertSizeEquivalenceActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    assignCatalogMediaActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    assignSkuActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    brandCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    brandHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    catalogMediaCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    changeProductManufacturerActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    changeProductRelationshipActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    changeVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    colorCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    colorHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    confirmGtinActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    correctGtinActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    correctProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    correctSkuActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createAttributeDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createBrandActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createConfigurationUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createPackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductRecoveryReadApiLive.pipe(
      GovernedReadLayer.provide(governedReadRuntimeLive),
      Layer.provide(governedActionRuntimeLive),
    ),
    createProductRelationshipActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createSetCompositionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    createVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    decideProductTypeUnnecessaryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    effectiveAttributeValuesCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    governProductAttributeApplicabilityActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    governVariantAxesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    gtinCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    gtinHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    manufacturerRelationCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    manufacturerRelationHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    markGtinUnresolvedActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    moveProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    packageDefinitionHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    packageOptionHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productBrandCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productBrandHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productCategoryClassificationReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productCategoryHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productDetailReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productRelationshipCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productRelationshipHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    productSizeCurrentReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    promotePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    publishProductConfigurationActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    quantityPreparationReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    reactivateBrandActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reactivateControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reactivateProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reactivateVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeCatalogMediaActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductAttributeValuesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductCategoryAssignmentActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductLocalizedFactsActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductManufacturerActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeProductRelationshipActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeVariantAttributeOverrideActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    removeVariantLocalizedFactsActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameAttributeDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameBrandActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    renameSkuActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reorderCatalogMediaActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    replaceProductSizesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireBrandActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireConfigurationUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireControlledAttributeValueActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireGtinActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retirePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retirePackageOptionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductCategoryActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    retireVariantActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseAttributeDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseConfigurationUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    revisePackageDefinitionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseProductUnitActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    reviseSetCompositionActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductAttributeValuesActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductBrandActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductLocalizedFactsActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductManufacturerActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductTypeActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setProductUnitTargetDivisibilityActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setVariantAttributeOverrideActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    setVariantLocalizedFactsActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    skuLookupReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    updateProductActionApiLive.pipe(GovernedReadLayer.provide(governedActionRuntimeLive)),
    variantHistoryReadApiLive.pipe(GovernedReadLayer.provide(governedReadRuntimeLive)),
    // </generated-governed-http-handler-layers>
  ).pipe(Layer.provide(Layer.mergeAll(actionPrincipalVerifierLive, gatewayAssertionRedemption)));
  type CatalogHandlerRequirements =
    typeof apiHandlersLive extends Layer.Layer<infer _Services, infer _Error, infer Requirements>
      ? Requirements
      : never;
  const resolvedApiHandlersLive: EffectBffRuntimeAssembly<
    'CatalogApi',
    CatalogApiGroups,
    CatalogHandlerRequirements
  >['handlers'] = apiHandlersLive.pipe(Layer.provide(runtimeObservabilityLive), Layer.orDie);
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

const apiRuntime: EffectBffDefinition<typeof catalogApi> & EffectBffRuntime<typeof catalogApi> = makeCatalogApiRuntime(
  catalogReadRuntime,
  catalogActionRuntime,
  GovernedGatewayAssertionRedemptionLive,
);

export default apiRuntime;

export { catalogActionRuntime };
