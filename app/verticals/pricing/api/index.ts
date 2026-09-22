import {
  ContextAccessLive,
  CorePersistenceLive,
  DatabaseConfigLive,
  ReadRuntimeLive,
  TenantModuleStateServiceLive,
} from '@app/core-runtime';
import {
  ModuleEntrypointGatewayLive,
  ModuleStateGateLive,
  OperationalScopeResolverLive,
} from '@app/core-runtime/actions/runtime-wiring';
import { assembleEffectBffRuntime } from '@app/shared-contracts/server/effect-bff-runtime';
import { Layer } from '@modern-js/bff-effect/effect-edge';
import { pricingApi } from '../shared/api.ts';
import { ActionPrincipalVerifierLive } from './auth/action-principal.ts';
import { GatewayAssertionRedemptionLive } from './auth/gateway-assertion-redemption.ts';
import { currentSupportedCurrenciesReadApiLive } from './current-supported-currencies-read-server.ts';
const tenantModuleStateServiceLive = TenantModuleStateServiceLive.pipe(Layer.provide(CorePersistenceLive));
const moduleStateGateLive = ModuleStateGateLive.pipe(Layer.provide(tenantModuleStateServiceLive));
const operationalScopeResolverLive = OperationalScopeResolverLive.pipe(
  Layer.provide(Layer.mergeAll(CorePersistenceLive, ContextAccessLive)),
);
const moduleEntrypointGatewayLive = ModuleEntrypointGatewayLive.pipe(Layer.provide(moduleStateGateLive));
export const pricingReadRuntimeLive = ReadRuntimeLive.pipe(
  Layer.provide(
    Layer.mergeAll(CorePersistenceLive, ContextAccessLive, moduleEntrypointGatewayLive, operationalScopeResolverLive),
  ),
  Layer.provide(DatabaseConfigLive),
);
const handlers = currentSupportedCurrenciesReadApiLive.pipe(
  Layer.provide(pricingReadRuntimeLive),
  Layer.provide(Layer.mergeAll(ActionPrincipalVerifierLive, GatewayAssertionRedemptionLive)),
  Layer.orDie,
);
export const makePricingApiRuntime = () => assembleEffectBffRuntime({ api: pricingApi, handlers });
export default makePricingApiRuntime();
