import { CurrentSupportedCurrenciesRequestSchema } from '@app/pricing-contracts/current-supported-currencies';
import { describe, expect, it } from '@rstest/core';
import { Effect, Option, Schema } from 'effect';
import { CurrencySupportPersistenceUnavailable } from '../../src/persistence/currency-support-persistence.ts';
import { resolveCurrentSupportedCurrencies } from '../../src/api/current-supported-currencies.read.ts';

const request = Schema.decodeUnknownSync(CurrentSupportedCurrenciesRequestSchema)({
  cartId: 'cart-333',
  channelId: 'B2C',
  contextRevision: 'cart-context:7',
  effectiveAt: '2026-09-22T12:00:00.000Z',
  marketId: 'market-cz',
  sellingLegalEntityId: 'legal-entity-cz',
  storefrontId: 'storefront-cz',
  subject: { guestEvidenceRef: 'guest-evidence:9', guestSessionRef: 'guest-session:9', kind: 'GUEST' },
  tenantId: 'tenant-cz',
});
const scope = { legalEntityId: 'legal-entity-cz', storefrontId: 'storefront-cz', tenantId: 'tenant-cz' } as const;
const stored = {
  generation: 4,
  nextApplicabilityBoundary: '2026-09-23T00:00:00.000Z',
  observedAt: '2026-09-22T11:59:59.000Z',
  pricingRevision: 'pricing-currency-support:4',
  supportedCurrencies: ['CZK'],
} as const;

describe('Current supported currencies owner read', () => {
  it('returns the exact owner revision, complete unique set, and actual observation boundary', async () => {
    const result = await Effect.runPromise(
      resolveCurrentSupportedCurrencies(request, scope, () => Effect.succeed(Option.some(stored))),
    );
    expect(result).toMatchObject({
      outcome: 'SUPPORTED_CURRENCIES_CURRENT',
      pricingRevision: 'pricing-currency-support:4',
      supportedCurrencies: ['CZK'],
      completenessEvidence: {
        ownerRevision: 'pricing-currency-support:4',
        scope: { kind: 'EXACT_PREDICATE' },
      },
    });
    if (result.outcome === 'SUPPORTED_CURRENCIES_CURRENT') {
      expect(result.completenessEvidence.scope.predicateRef).toContain('cart-context:7');
      expect(result.completenessEvidence.scope.predicateRef).toContain('guest-session:9');
    }
  });

  it('fails closed as stale when actual observation is after the requested effective instant', async () => {
    const late = { ...stored, observedAt: '2026-09-22T12:00:01.000Z' };
    const result = await Effect.runPromise(
      resolveCurrentSupportedCurrencies(request, scope, () => Effect.succeed(Option.some(late))),
    );
    expect(result.outcome).toBe('SUPPORTED_CURRENCIES_STALE');
  });

  it('distinguishes absent support from unverifiable owner state', async () => {
    const absent = await Effect.runPromise(
      resolveCurrentSupportedCurrencies(request, scope, () => Effect.succeed(Option.none())),
    );
    const unverifiable = await Effect.runPromise(
      resolveCurrentSupportedCurrencies(request, scope, () =>
        Effect.fail(new CurrencySupportPersistenceUnavailable({ reason: 'owner read failed' })),
      ),
    );
    expect(absent.outcome).toBe('SUPPORTED_CURRENCIES_UNAVAILABLE');
    expect(unverifiable.outcome).toBe('SUPPORTED_CURRENCIES_UNVERIFIABLE');
  });

  it('rejects request identity that differs from trusted scope before owner persistence', async () => {
    const exit = await Effect.runPromiseExit(
      resolveCurrentSupportedCurrencies(request, { ...scope, storefrontId: 'different-storefront' }, () =>
        Effect.die('must not run'),
      ),
    );
    expect(exit._tag).toBe('Failure');
  });
});
