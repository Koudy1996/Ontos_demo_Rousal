import { Effect } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  CZECH_LAUNCH_COMMERCE_FIXTURE,
  validateCzechLaunchFixtureContracts,
} from '../czech-launch-commerce-fixture.mts';

it.effect('publishes the complete active Czech Launch currency policy without an explicit-choice revision', () =>
  Effect.gen(function* czechLaunchCurrencyPolicy() {
    yield* validateCzechLaunchFixtureContracts();

    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.purchaseCurrency).toMatchObject([
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 0,
        revision: {
          lifecycle: 'ACTIVE',
          value: { currencyCode: 'CZK', kind: 'ALLOWED_CURRENCY_CONSTRAINT' },
        },
      },
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 1,
        revision: {
          lifecycle: 'ACTIVE',
          value: { currencyCode: 'CZK', kind: 'DEFAULT_CURRENCY' },
        },
      },
    ]);
    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.purchaseCurrency.map(({ revision }) => revision.value.kind)).toEqual([
      'ALLOWED_CURRENCY_CONSTRAINT',
      'DEFAULT_CURRENCY',
    ]);
  }),
);

it.effect('publishes complete Payment Term applicability and an independently revisioned accepted fallback', () =>
  Effect.gen(function* czechLaunchPaymentTermPolicy() {
    yield* validateCzechLaunchFixtureContracts();

    expect(CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm).toMatchObject([
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 0,
        revision: {
          lifecycle: 'ACTIVE',
          value: { kind: 'APPLICABLE_PAYMENT_TERM_CONSTRAINT' },
        },
      },
      {
        _tag: 'CREATE_REVISION',
        expectedGeneration: 1,
        revision: {
          lifecycle: 'ACTIVE',
          value: { kind: 'FALLBACK_PAYMENT_TERM' },
        },
      },
    ]);

    const [applicability, fallback] = CZECH_LAUNCH_COMMERCE_FIXTURE.policies.paymentTerm;
    expect(applicability.revision.revisionId).not.toBe(fallback.revision.revisionId);
    expect(applicability.revision.value.paymentTermRef).toEqual(fallback.revision.value.paymentTermRef);
    expect(applicability.revision.value.paymentTermRef).toEqual({
      moduleId: 'payment.term-catalog',
      resourceId: 'czech-launch-net-14',
      resourceType: 'payment.term-catalog.payment-term',
      tenantId: CZECH_LAUNCH_COMMERCE_FIXTURE.scope.tenantId,
    });
  }),
);
