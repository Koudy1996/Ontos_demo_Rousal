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
      catalogQuantity: CZECH_LAUNCH_COMMERCE_FIXTURE.ownerFacts.catalogQuantity,
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
            resourceId: 'czech-launch-net-14',
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
            resourceId: 'czech-launch-net-14',
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
