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
