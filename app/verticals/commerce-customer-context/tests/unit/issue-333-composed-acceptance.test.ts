import { getVerticalRuntimeEntrypoints } from '@app/core-runtime';
import { Effect } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  CZECH_LAUNCH_COMMERCE_FIXTURE,
  validateCzechLaunchActivation,
  validateCzechLaunchFixtureContracts,
} from '../../../../scripts/czech-launch-commerce-fixture.mts';
import { commerceCustomerContextManifest } from '../../vertical.manifest.ts';
import { commerceCustomerContextRegistration } from '../../vertical.registration.ts';

const requiredPolicyActions = [
  'commerce.customer-context.administer-market-bootstrap-policy',
  'commerce.customer-context.administer-payment-term-policy',
  'commerce.customer-context.administer-purchase-currency-policy',
  'commerce.customer-context.administer-commerce-quantity-rule',
] as const;

const requiredCurrentAndResolutionApis = [
  'market-bootstrap-policy-current',
  'market-bootstrap-resolution',
  'payment-term-policy-current',
  'payment-terms-resolution',
  'purchase-currency-policy-current',
  'purchase-currency-resolution',
  'commerce-quantity-policy-current',
  'commerce-quantity-resolution',
] as const;

it.effect('composes the Czech Launch inventory and four policy defaults behind governed contracts', () =>
  Effect.gen(function* composedLaunch() {
    yield* validateCzechLaunchFixtureContracts();
    yield* validateCzechLaunchActivation({
      catalogQuantityBasisCurrent: true,
      marketEligibleTupleCurrent: true,
      paymentTermCurrent: true,
      policySetsComplete: {
        marketBootstrap: true,
        paymentTerm: true,
        purchaseCurrency: true,
        quantity: true,
      },
    });

    const runtimeEntrypoints = getVerticalRuntimeEntrypoints(commerceCustomerContextRegistration);
    const actionKeys = new Set(
      (commerceCustomerContextManifest.publicSurface.actions ?? []).map(({ descriptor }) => descriptor.actionKey),
    );
    for (const actionKey of requiredPolicyActions) {
      expect(actionKeys.has(actionKey)).toBe(true);
    }
    for (const apiKey of requiredCurrentAndResolutionApis) {
      expect(commerceCustomerContextManifest.publicSurface.api?.[apiKey]).toBeDefined();
      expect(runtimeEntrypoints.api[apiKey]).toBeTypeOf('function');
    }

    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.purchaseCurrency.revision.value).toEqual({
      currencyCode: 'CZK',
      kind: 'DEFAULT_CURRENCY',
    });
    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm.revision.value.kind).toBe('FALLBACK_PAYMENT_TERM');
    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.quantity.revision.value).toMatchObject({
      constraintMode: 'REPLACEABLE_ENVELOPE',
      envelope: { minimum: '1', multiple: '1' },
      selector: { kind: 'ALL' },
    });
  }),
);
