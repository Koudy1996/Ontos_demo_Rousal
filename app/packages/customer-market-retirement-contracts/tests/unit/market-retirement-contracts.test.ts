import { describe, expect, it } from 'effect-rstest';
import { Effect, Exit, Schema } from 'effect';

import {
  MarketAffectedUseAssessmentRequestSchema,
  MarketAffectedUseAssessmentResponseSchema,
  ReserveMarketRetirementPayloadSchema,
  ReserveMarketRetirementResultSchema,
  executeMarketAffectedUseAssessment,
  executeMarketAffectedUseAssessmentWithAuthorization,
  executeReserveMarketRetirement,
  executeReserveMarketRetirementWithAuthorization,
} from '../../src/index.ts';

const tenantId = '22222222-2222-4222-8222-222222222222';
const marketRef = {
  moduleId: 'commerce.market-catalog' as const,
  resourceId: 'cz-launch',
  resourceType: 'commerce.market-catalog.market' as const,
  tenantId,
};
const request = {
  evaluatedAt: '2026-09-22T10:00:00.000Z',
  marketRef,
  marketRevision: 7,
  tenantId,
};
const completenessEvidence = {
  nextApplicabilityBoundary: '2026-09-23T00:00:00.000Z',
  observedAt: '2026-09-22T09:59:59.000Z',
  ownerRevision: 'customer-context:41',
  scope: { kind: 'EXACT_PREDICATE' as const, predicateRef: 'market:cz-launch:affected-use' },
};
const sourceEvidence = {
  completenessEvidence,
  currentness: 'CURRENT' as const,
  digest: 'a'.repeat(64),
  generation: 'customer-context-generation-19',
  ownerRevision: 'customer-context:41',
  sourceId: 'customer-commerce-policy',
};
const ownerResourceRef = {
  moduleId: 'commerce.customer-context',
  resourceId: 'bootstrap-policy',
  resourceType: 'commerce.customer-context.customer-commerce-policy',
  tenantId,
};

describe('Customer-owned Market retirement public contracts', () => {
  it('strictly binds the governed read to Tenant, exact Market revision, and evaluation instant', () => {
    expect(Schema.decodeSync(MarketAffectedUseAssessmentRequestSchema)(request)).toEqual(request);
    expect(() =>
      Schema.decodeSync(MarketAffectedUseAssessmentRequestSchema)({ ...request, tenantId: crypto.randomUUID() }),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(MarketAffectedUseAssessmentRequestSchema)({
        ...request,
        evaluatedAt: '2026-09-22T10:00:00Z',
      }),
    ).toThrow();
    expect(() => Schema.decodeSync(MarketAffectedUseAssessmentRequestSchema)({ ...request, extra: true })).toThrow();
  });

  it('separates live blockers from retained history and preserves owner-verifiable source versions', () => {
    const verified = {
      ...request,
      assessmentDigest: 'b'.repeat(64),
      liveBlockingReferences: {
        bootstrapDefaults: [
          {
            kind: 'BOOTSTRAP_DEFAULT' as const,
            marketRef,
            marketRevision: 7,
            ownerResourceRef,
            ownerResourceRevision: 'policy:12',
          },
        ],
        currentProposals: [],
      },
      nextApplicabilityBoundary: '2026-09-23T00:00:00.000Z',
      observedAt: '2026-09-22T09:59:59.000Z',
      outcome: 'VERIFIED' as const,
      retainedHistoryReferences: [
        {
          kind: 'RETAINED_HISTORY' as const,
          marketRef,
          marketRevision: 7,
          ownerResourceRef: { ...ownerResourceRef, resourceId: 'historical-policy' },
          ownerResourceRevision: 'policy:3',
        },
      ],
      sourceEvidence: [sourceEvidence],
    };
    expect(Schema.decodeSync(MarketAffectedUseAssessmentResponseSchema)(verified)).toEqual(verified);
    expect(() =>
      Schema.decodeSync(MarketAffectedUseAssessmentResponseSchema)({
        ...verified,
        observedAt: '2026-09-22T10:00:00.001Z',
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(MarketAffectedUseAssessmentResponseSchema)({
        ...verified,
        liveBlockingReferences: {
          ...verified.liveBlockingReferences,
          bootstrapDefaults: [{ ...verified.liveBlockingReferences.bootstrapDefaults[0], marketRevision: 6 }],
        },
      }),
    ).toThrow();
  });

  it('publishes distinct rejected, unavailable, and stale read outcomes', () => {
    for (const outcome of [
      { ...request, code: 'blocked', outcome: 'REJECTED', reason: 'Live bootstrap reference exists' },
      { ...request, code: 'owner-unavailable', outcome: 'UNAVAILABLE', reason: 'Owner unavailable', retryable: true },
      {
        ...request,
        code: 'stale',
        observedAt: '2026-09-22T09:00:00.000Z',
        outcome: 'STALE',
        reason: 'Source changed',
        staleSourceIds: ['customer-commerce-policy'],
      },
    ]) {
      expect(Schema.decodeSync(MarketAffectedUseAssessmentResponseSchema)(outcome).outcome).toBe(outcome.outcome);
    }
  });

  it('requires the reservation token and version for commit/release and retains them in results', () => {
    const reserve = {
      ...request,
      assessmentDigest: 'b'.repeat(64),
      operation: 'RESERVE' as const,
      reason: 'Retire Market',
      sourceEvidence: [sourceEvidence],
    };
    expect(Schema.decodeSync(ReserveMarketRetirementPayloadSchema)(reserve)).toEqual(reserve);
    for (const operation of ['COMMIT', 'RELEASE'] as const) {
      expect(() =>
        Schema.decodeSync(ReserveMarketRetirementPayloadSchema)({
          marketRef,
          marketRevision: 7,
          operation,
          reason: 'Retire Market',
          tenantId,
        }),
      ).toThrow();
      expect(
        Schema.decodeSync(ReserveMarketRetirementPayloadSchema)({
          marketRef,
          marketRevision: 7,
          operation,
          reason: 'Retire Market',
          reservationToken: '11111111-1111-4111-8111-111111111111',
          reservationVersion: 3,
          tenantId,
        }).operation,
      ).toBe(operation);
    }
    expect(
      Schema.decodeSync(ReserveMarketRetirementResultSchema)({
        assessmentDigest: 'b'.repeat(64),
        lifecycle: 'COMMITTED',
        marketRef,
        marketRevision: 7,
        reservationToken: '11111111-1111-4111-8111-111111111111',
        reservationVersion: 3,
        tenantId,
      }).reservationVersion,
    ).toBe(3);
  });

  it.effect('strictly decodes payloads before either governed client executor can invoke HTTP', () =>
    Effect.gen(function* () {
      const invalid = { ...request, evaluatedAt: 'not-an-instant' } as never;
      const readExit = yield* Effect.exit(
        executeMarketAffectedUseAssessmentWithAuthorization(invalid, 'credential', 'correlation'),
      );
      expect(Exit.isFailure(readExit)).toBe(true);
      const actionExit = yield* Effect.exit(
        executeReserveMarketRetirementWithAuthorization(invalid, 'credential', 'correlation', {
          idempotencyKey: 'idempotency-key',
        }),
      );
      expect(Exit.isFailure(actionExit)).toBe(true);
      expect(executeMarketAffectedUseAssessment).toBeTypeOf('function');
      expect(executeReserveMarketRetirement).toBeTypeOf('function');
    }),
  );
});
