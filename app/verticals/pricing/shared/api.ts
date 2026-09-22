import { HttpApi } from '@modern-js/bff-effect/effect-client';
import { identity } from 'effect';
import { CurrentSupportedCurrenciesApi } from './apis/current-supported-currencies.ts';
export * from './apis/current-supported-currencies.ts';
export const pricingApi = HttpApi.make('PricingApi').addHttpApi(CurrentSupportedCurrenciesApi).pipe(identity);
export const pricingApiContract = {
  apiPrefix: '/pricing-api',
  basePath: '/pricing-api/pricing',
  ownerId: 'pricing',
} as const;
