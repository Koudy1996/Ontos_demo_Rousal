import type { OperationalScope } from '@app/core-runtime';
import { ReadPermissionDenied, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { OwnerVerifiableSetCompletenessEvidenceSchema } from '@app/shared-contracts';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { EligibleMarketTuplesRequestSchema } from '../../shared/apis/eligible-market-tuples.ts';
import { ResolveCommerceMarketRequestSchema } from '../../shared/apis/resolve-commerce-market.ts';
import type { EligibleMarketTuple } from '../../shared/market-contracts.ts';
import { handleEligibleMarketTuples } from '../../src/api/eligible-market-tuples.read.ts';
import { handleResolveCommerceMarket } from '../../src/api/resolve-commerce-market.read.ts';
import type { MarketEligibilitySnapshot } from '../../src/domain/market-resolution.ts';
import { MarketResolutionPersistenceUnavailable } from '../../src/persistence/market-resolution-persistence.ts';
import type { MarketResolutionPersistence } from '../../src/persistence/market-resolution-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const sellerId = '22222222-2222-4222-8222-222222222222';
const principalId = '33333333-3333-4333-8333-333333333333';
const storefrontRef = { appId: 'shop', tenantId } as const;
const at = '2030-06-01T00:00:00.000Z';
const sellerRef = {
  moduleId: 'core.identity' as const,
  resourceId: sellerId,
  resourceType: 'core.identity.legal-entity' as const,
  tenantId,
};
const eligibleTuple: EligibleMarketTuple = {
  associationRef: {
    moduleId: 'commerce.market-catalog',
    resourceId: '44444444-4444-4444-8444-444444444444',
    resourceType: 'commerce.market-catalog.storefront-association',
    tenantId,
  },
  associationRevision: 4,
  channel: 'B2B',
  marketDefinitionRevisionRef: {
    moduleId: 'commerce.market-catalog',
    resourceId: '55555555-5555-4555-8555-555555555555',
    resourceType: 'commerce.market-catalog.market-definition-revision',
    tenantId,
  },
  marketRef: {
    moduleId: 'commerce.market-catalog',
    resourceId: '66666666-6666-4666-8666-666666666666',
    resourceType: 'commerce.market-catalog.market',
    tenantId,
  },
  sellingLegalEntityRef: sellerRef,
};
const snapshot: MarketEligibilitySnapshot = {
  completenessEvidence: Schema.decodeUnknownSync(OwnerVerifiableSetCompletenessEvidenceSchema)({
    observedAt: at,
    ownerRevision: 'market-eligibility:v1:proof',
    scope: { kind: 'EXACT_PREDICATE', predicateRef: 'market-eligibility:v1:shop:B2B:seller' },
  }),
  evaluatedAt: Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema.fields.at)(at),
  facts: [{ lifecycle: 'ACTIVE', tuple: eligibleTuple }],
};
const scope: OperationalScope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authBindingId: '77777777-7777-4777-8777-777777777777',
    authContextRef: 'session:market-resolution',
    authMethod: 'session',
    legalEntityId: sellerId,
    principalId,
    tenantId,
    trustedStorefrontId: storefrontRef.appId,
  }),
  correlationId: 'market-resolution-test',
};
const available: MarketResolutionPersistence = { load: () => Effect.succeed({ ...snapshot, generation: 7 }) };
const withSnapshot = (current: MarketEligibilitySnapshot, generation: number): MarketResolutionPersistence => ({
  load: () => Effect.succeed({ ...current, generation }),
});
const unavailable: MarketResolutionPersistence = {
  load: () =>
    Effect.fail(
      new MarketResolutionPersistenceUnavailable({
        code: 'market_resolution_persistence_unavailable',
        reason: 'fixture unavailable',
      }),
    ),
};
const context = (services: MarketResolutionPersistence, scopeOverride: OperationalScope = scope) => ({
  readKey: 'commerce.market-catalog.api.resolve-commerce-market',
  scope: scopeOverride,
  services,
});

describe('Commerce Market governed resolution reads', () => {
  it.effect('returns safe complete eligible tuples under trusted Storefront context', () =>
    Effect.gen(function* eligibleRead() {
      const input = Schema.decodeUnknownSync(EligibleMarketTuplesRequestSchema)({
        at,
        channel: 'B2B',
        sellingLegalEntityRestriction: sellerRef,
        storefrontRef,
      });
      const result = yield* handleEligibleMarketTuples(input, context(available));
      expect(result.result).toMatchObject({ outcome: 'ELIGIBLE_MARKET_TUPLES', tuples: [eligibleTuple] });
      expect(result.evidence.resultCount).toBe(1);
    }),
  );

  it.effect('fails closed when the Storefront differs from trusted operational context', () =>
    Effect.gen(function* deniedStorefront() {
      const input = Schema.decodeUnknownSync(EligibleMarketTuplesRequestSchema)({
        at,
        channel: 'B2C',
        storefrontRef: { ...storefrontRef, appId: 'untrusted-shop' },
      });
      const error = yield* Effect.flip(handleEligibleMarketTuples(input, context(available)));
      expect(Schema.is(ReadPermissionDenied)(error)).toBe(true);
    }),
  );

  it.effect('fails closed when a seller restriction is not the trusted Legal Entity', () =>
    Effect.gen(function* deniedSeller() {
      const input = Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema)({
        at,
        channel: 'B2B',
        sellingLegalEntityRestriction: {
          ...sellerRef,
          resourceId: '88888888-8888-4888-8888-888888888888',
        },
        storefrontRef,
        subject: { kind: 'COUNTERPARTY', subjectRef: 'counterparty:safe-reference' },
      });
      const error = yield* Effect.flip(handleResolveCommerceMarket(input, context(available)));
      expect(Schema.is(ReadPermissionDenied)(error)).toBe(true);
    }),
  );

  it.effect('attaches only safe owner-issued subject restriction evidence', () =>
    Effect.gen(function* restrictedResolution() {
      const input = Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema)({
        at,
        channel: 'B2B',
        sellingLegalEntityRestriction: sellerRef,
        storefrontRef,
        subject: { kind: 'COUNTERPARTY', subjectRef: 'private-subject-not-returned' },
      });
      const result = yield* handleResolveCommerceMarket(input, context(available));
      expect(result.result).toMatchObject({
        outcome: 'MARKET_RESOLVED',
        subjectRestrictionEvidence: {
          decision: 'ALLOWED',
          evidenceRef: `trusted-seller-scope:${sellerId}`,
          ownerRevision: `trusted-principal-context:${principalId}`,
          subjectKind: 'COUNTERPARTY',
        },
      });
      expect(JSON.stringify(result.result)).not.toContain('private-subject-not-returned');
    }),
  );

  it.effect('returns a separate retryable inability when owner completeness cannot be established', () =>
    Effect.gen(function* unavailableResolution() {
      const input = Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema)({ at, channel: 'B2C', storefrontRef });
      const result = yield* handleResolveCommerceMarket(input, context(unavailable));
      expect(result.result).toEqual({
        outcome: 'MARKET_ELIGIBILITY_UNAVAILABLE',
        reason: 'Current Commerce Market eligibility could not be established',
        retryable: true,
      });
    }),
  );

  it.effect('invalidates prior completeness after a material lifecycle or association revision changes', () =>
    Effect.gen(function* invalidatedCompleteness() {
      const input = Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema)({ at, channel: 'B2B', storefrontRef });
      const changedSnapshot: MarketEligibilitySnapshot = {
        ...snapshot,
        completenessEvidence: {
          ...snapshot.completenessEvidence,
          ownerRevision: 'market-eligibility:v1:changed-material-state',
        },
      };
      const before = yield* handleResolveCommerceMarket(input, context(withSnapshot(snapshot, 7)));
      const after = yield* handleResolveCommerceMarket(input, context(withSnapshot(changedSnapshot, 8)));
      expect(before.result.outcome).toBe('MARKET_RESOLVED');
      expect(after.result.outcome).toBe('MARKET_RESOLVED');
      if (before.result.outcome === 'MARKET_RESOLVED' && after.result.outcome === 'MARKET_RESOLVED') {
        expect(before.result.selectedTuple.marketRef).toEqual(after.result.selectedTuple.marketRef);
        expect(before.result.completenessEvidence.ownerRevision).not.toBe(
          after.result.completenessEvidence.ownerRevision,
        );
      }
    }),
  );

  it.effect('keeps exact predicate completeness stable across an unrelated tenant generation change', () =>
    Effect.gen(function* stableExactPredicate() {
      const input = Schema.decodeUnknownSync(ResolveCommerceMarketRequestSchema)({ at, channel: 'B2B', storefrontRef });
      const before = yield* handleResolveCommerceMarket(input, context(withSnapshot(snapshot, 7)));
      const after = yield* handleResolveCommerceMarket(input, context(withSnapshot(snapshot, 99)));
      if (before.result.outcome === 'MARKET_RESOLVED' && after.result.outcome === 'MARKET_RESOLVED') {
        expect(before.result.completenessEvidence.ownerRevision).toBe(after.result.completenessEvidence.ownerRevision);
      }
    }),
  );
});
