import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
} from '@app/commerce-customer-context/api';
import { describe, expect, it } from 'effect-rstest';
import { Effect, Predicate } from 'effect';

import {
  makeMarketRetirementImpactAuthority,
  marketRetirementImpactAuthorityFromPublishedClient,
} from '../../src/integrations/market-retirement-impact.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const marketRef = {
  moduleId: 'commerce.market-catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.market-catalog.market',
  tenantId,
} as const;
const effectiveAt = '2026-12-01T00:00:00.000Z';
const observedAt = '2026-11-30T23:59:59.000Z';
const assessmentDigest = 'a'.repeat(64);
const reservationToken = 'market-retirement:reservation:12';
const input = {
  actionInvocationId: '33333333-3333-4333-8333-333333333333',
  effectiveAt,
  expectedMarketRevision: 3,
  marketRef,
  reservationToken,
} as const;
const request: MarketAffectedUseAssessmentRequest = {
  evaluatedAt: effectiveAt,
  marketRef,
  marketRevision: 3,
  tenantId,
};
const sourceEvidence = {
  completenessEvidence: {
    nextApplicabilityBoundary: '2027-01-01T00:00:00.000Z',
    observedAt,
    ownerRevision: 'customer-context:revision:17',
    scope: {
      kind: 'EXACT_PREDICATE' as const,
      predicateRef: `market-retirement:${tenantId}:${marketRef.resourceId}:3`,
    },
  },
  currentness: 'CURRENT' as const,
  digest: 'b'.repeat(64),
  generation: 'customer-context:g17',
  ownerRevision: 'customer-context:revision:17',
  sourceId: 'commerce.customer-context.market-bootstrap-policy',
};
const verified: Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }> = {
  assessmentDigest,
  evaluatedAt: effectiveAt,
  liveBlockingReferences: {
    bootstrapDefaults: [],
    currentProposals: [],
  },
  marketRef,
  marketRevision: 3,
  nextApplicabilityBoundary: '2027-01-01T00:00:00.000Z',
  observedAt,
  outcome: 'VERIFIED',
  retainedHistoryReferences: [
    {
      kind: 'RETAINED_HISTORY',
      marketRef,
      marketRevision: 3,
      ownerResourceRef: {
        moduleId: 'commerce.customer-context',
        resourceId: '44444444-4444-4444-8444-444444444444',
        resourceType: 'commerce.customer-context.purchase-proposal-revision',
        tenantId,
      },
      ownerResourceRevision: 'proposal:revision:4',
    },
  ],
  sourceEvidence: [sourceEvidence],
  tenantId,
};

describe('Market retirement production authority', () => {
  it.effect(
    'calls the Customer Context published client with exact Market scope and maps complete current evidence',
    () =>
      Effect.gen(function* completeEvidence() {
        const calls: unknown[] = [];
        const authority = makeMarketRetirementImpactAuthority((payload, requestCorrelation) => {
          calls.push({ payload, requestCorrelation });
          return Effect.succeed(verified);
        });

        const result = yield* authority.assessRetirementImpact(input);

        expect(calls).toEqual([{ payload: request, requestCorrelation: input.actionInvocationId }]);
        expect(result).toEqual({
          assessedMarketRef: marketRef,
          assessedMarketRevision: 3,
          effectiveAt,
          providers: [
            {
              completenessEvidenceReference: `customer-context:market-affected-use:${assessmentDigest}`,
              currentnessEvidenceReference: `customer-context:market-affected-use:${observedAt}:${assessmentDigest}`,
              effectiveAt,
              liveBlockingReferences: {
                count: 0,
                evidenceReference: `customer-context:market-live-references:${assessmentDigest}`,
              },
              nextBoundaryAt: '2027-01-01T00:00:00.000Z',
              observedAt,
              ownerModuleKey: 'commerce.customer-context',
              ownerRevision: assessmentDigest,
              retainedHistoryEvidence: {
                count: 1,
                evidenceReference: `customer-context:market-retained-history:${assessmentDigest}`,
              },
              versionToken: assessmentDigest,
            },
          ],
          requiredProviderModuleKeys: ['commerce.customer-context'],
          reservationToken,
        });
      }),
  );

  it.effect('keeps owner rejection, stale evidence, and owner unavailability distinct', () =>
    Effect.gen(function* typedFailures() {
      const outcomes: readonly [
        MarketAffectedUseAssessmentResponse,
        (
          | 'MarketRetirementImpactAssessmentRejected'
          | 'MarketRetirementImpactAssessmentStale'
          | 'MarketRetirementImpactAssessmentUnavailable'
        ),
      ][] = [
        [
          { ...request, code: 'live-reference', outcome: 'REJECTED', reason: 'A live reference exists' },
          'MarketRetirementImpactAssessmentRejected',
        ],
        [
          {
            ...request,
            code: 'stale-owner-evidence',
            observedAt,
            outcome: 'STALE',
            reason: 'Owner evidence changed',
            staleSourceIds: [sourceEvidence.sourceId],
          },
          'MarketRetirementImpactAssessmentStale',
        ],
        [
          {
            ...request,
            code: 'owner-unavailable',
            outcome: 'UNAVAILABLE',
            reason: 'Customer Context is unavailable',
            retryable: true,
          },
          'MarketRetirementImpactAssessmentUnavailable',
        ],
      ];

      for (const [response, expectedTag] of outcomes) {
        const failure = yield* makeMarketRetirementImpactAuthority(() => Effect.succeed(response))
          .assessRetirementImpact(input)
          .pipe(Effect.flip);
        expect(Predicate.isTagged(failure, expectedTag)).toBe(true);
      }
    }),
  );

  it.effect(
    'fails closed on transport failure, mismatched scope, stale boundaries, and incomplete source evidence',
    () =>
      Effect.gen(function* invalidEvidence() {
        const cases = [
          {
            ...verified,
            marketRevision: 2,
          },
          {
            ...verified,
            nextApplicabilityBoundary: effectiveAt,
          },
          {
            ...verified,
            sourceEvidence: [],
          },
          {
            ...verified,
            sourceEvidence: [sourceEvidence, sourceEvidence],
          },
          {
            ...verified,
            sourceEvidence: [
              {
                ...sourceEvidence,
                completenessEvidence: {
                  ...sourceEvidence.completenessEvidence,
                  ownerRevision: 'customer-context:revision:older',
                },
              },
            ],
          },
        ] as unknown as readonly MarketAffectedUseAssessmentResponse[];

        for (const response of cases) {
          const failure = yield* makeMarketRetirementImpactAuthority(() => Effect.succeed(response))
            .assessRetirementImpact(input)
            .pipe(Effect.flip);
          expect(
            Predicate.isTagged(failure, 'MarketRetirementImpactAssessmentStale') ||
              Predicate.isTagged(failure, 'MarketRetirementImpactAssessmentUnavailable'),
          ).toBe(true);
        }

        const transportFailure = yield* makeMarketRetirementImpactAuthority(() => Effect.fail('offline'))
          .assessRetirementImpact(input)
          .pipe(Effect.flip);
        expect(Predicate.isTagged(transportFailure, 'MarketRetirementImpactAssessmentUnavailable')).toBe(true);
      }),
  );

  it('exports the published-client authority used by the deployed Action composition', () => {
    expect(marketRetirementImpactAuthorityFromPublishedClient.assessRetirementImpact).toBeTypeOf('function');
  });
});
