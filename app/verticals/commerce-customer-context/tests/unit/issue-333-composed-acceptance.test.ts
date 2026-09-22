import { Effect, Schema } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  CZECH_LAUNCH_COMMERCE_FIXTURE,
  validateCzechLaunchActivation,
  validateCzechLaunchFixtureContracts,
} from '../../../../scripts/czech-launch-commerce-fixture.mts';
import { unavailablePurchaseCurrencyPurchasingContextPort } from '../../shared/domain/purchase-currency-context-port.ts';
import { PurchaseCurrencyDependencyUnavailable } from '../../shared/domain/purchase-currency-dependency.ts';

it.effect('composes the Czech Launch inventory and four policy defaults behind governed contracts', () =>
  Effect.gen(function* composedLaunch() {
    yield* validateCzechLaunchFixtureContracts();
    yield* validateCzechLaunchActivation(CZECH_LAUNCH_COMMERCE_FIXTURE.ownerFacts);

    const { channelId, marketId, sellingLegalEntityId, storefrontId, tenantId } = CZECH_LAUNCH_COMMERCE_FIXTURE.scope;
    const purchasingContextFailure = yield* unavailablePurchaseCurrencyPurchasingContextPort()
      .resolveCurrent({
        claimedContext: {
          cartId: 'czech-launch-cart',
          channelId,
          marketId,
          sellingLegalEntityId,
          storefrontId,
          tenantId,
        },
        claimedContextRevision: 'commerce.cart.context:czech-launch-v1',
        claimedSubject: {
          guestEvidenceRef: 'commerce.customer-context.guest-evidence:czech-launch',
          guestSessionRef: 'commerce.cart.guest-session:czech-launch',
          kind: 'GUEST',
        },
        observedAt: '2026-10-01T00:00:00.000Z',
        scope: { legalEntityId: sellingLegalEntityId, storefrontId, tenantId },
      })
      .pipe(Effect.flip);
    expect(Schema.is(PurchaseCurrencyDependencyUnavailable)(purchasingContextFailure)).toBe(true);
    if (Schema.is(PurchaseCurrencyDependencyUnavailable)(purchasingContextFailure)) {
      expect(purchasingContextFailure.code).toBe('purchasing_context_unavailable');
      expect(purchasingContextFailure.retryable).toBe(true);
    }

    expect(
      CZECH_LAUNCH_COMMERCE_FIXTURE.policies.purchaseCurrency.map(({ expectedGeneration, revision }) => ({
        expectedGeneration,
        value: revision.value,
      })),
    ).toEqual([
      {
        expectedGeneration: 0,
        value: { currencyCode: 'CZK', kind: 'ALLOWED_CURRENCY_CONSTRAINT' },
      },
      {
        expectedGeneration: 1,
        value: { currencyCode: 'CZK', kind: 'DEFAULT_CURRENCY' },
      },
    ]);
    expect(
      CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm.map(({ expectedGeneration, revision }) => ({
        expectedGeneration,
        value: revision.value,
      })),
    ).toEqual([
      {
        expectedGeneration: 0,
        value: {
          kind: 'APPLICABLE_PAYMENT_TERM_CONSTRAINT',
          paymentTermRef: {
            moduleId: 'payment.term-catalog',
            resourceId: '78000000-0000-4000-8000-000000000014',
            resourceType: 'payment.term-catalog.payment-term',
            tenantId: '70000000-0000-4000-8000-000000000010',
          },
        },
      },
      {
        expectedGeneration: 1,
        value: {
          kind: 'FALLBACK_PAYMENT_TERM',
          paymentTermRef: {
            moduleId: 'payment.term-catalog',
            resourceId: '78000000-0000-4000-8000-000000000014',
            resourceType: 'payment.term-catalog.payment-term',
            tenantId: '70000000-0000-4000-8000-000000000010',
          },
        },
      },
    ]);
    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.quantity.revision.value).toEqual({
      basis: {
        targetDivisibilityRevision: 1,
        targetRef: {
          moduleId: 'commerce.catalog',
          resourceId: '76000000-0000-4000-8000-000000000015',
          resourceType: 'commerce.catalog.package-definition',
          tenantId: '70000000-0000-4000-8000-000000000010',
        },
        unitRef: {
          moduleId: 'commerce.catalog',
          resourceId: '76000000-0000-4000-8000-000000000020',
          resourceType: 'commerce.catalog.product-unit',
          tenantId: '70000000-0000-4000-8000-000000000010',
        },
        unitRuleRevision: 1,
      },
      constraintMode: 'REPLACEABLE_ENVELOPE',
      envelope: { kind: 'BOUNDED', maximum: null, minimum: '1', multiple: '1' },
      kind: 'COMMERCE_QUANTITY_RULE',
      selector: {
        kind: 'PACKAGE_OPTION',
        packageOptionRef: {
          moduleId: 'commerce.catalog',
          resourceId: '76000000-0000-4000-8000-000000000015',
          resourceType: 'commerce.catalog.package-definition',
          tenantId: '70000000-0000-4000-8000-000000000010',
        },
      },
    });
  }),
);
