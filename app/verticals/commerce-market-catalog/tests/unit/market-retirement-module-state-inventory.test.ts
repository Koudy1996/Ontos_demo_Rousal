import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
  MarketAffectedUseSourceEvidence,
} from '@app/commerce-customer-context/api';
import type { TenantModuleStateRecord } from '@app/core-runtime';
import { Effect, Predicate } from 'effect';
import { expect, it } from 'effect-rstest';

import { makeMarketRetirementImpactAuthority } from '../../src/integrations/market-retirement-impact.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const marketRef = {
  moduleId: 'commerce.market-catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.market-catalog.market',
  tenantId,
} as const;
const effectiveAt = '2026-12-01T00:00:00.000Z';
const observedAt = '2026-11-30T23:59:59.000Z';
const request: MarketAffectedUseAssessmentRequest = {
  evaluatedAt: effectiveAt,
  marketRef,
  marketRevision: 3,
  tenantId,
};
const input = {
  actionInvocationId: '33333333-3333-4333-8333-333333333333',
  effectiveAt,
  expectedMarketRevision: 3,
  marketRef,
  reservationToken: 'market-retirement:reservation:12',
} as const;

const sourceEvidence = (sourceId: string): MarketAffectedUseSourceEvidence => ({
  completenessEvidence: {
    observedAt,
    ownerRevision: 'composition:19',
    scope: {
      declaredScopeRef: `${sourceId}:all:${tenantId}`,
      kind: 'SAFELY_BROADER_SCOPE',
      predicateRef: `${sourceId}:market:${marketRef.resourceId}`,
    },
  },
  currentness: 'CURRENT',
  digest: 'b'.repeat(64),
  generation: 'composition:19',
  ownerRevision: 'composition:19',
  sourceId,
});

const verified = (
  sourceIds: readonly string[] = [
    'application-composition:commerce.cart:UNIMPLEMENTED',
    'application-composition:commerce.order:UNIMPLEMENTED',
    'commerce.customer-context.market-bootstrap-policy',
  ],
): Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }> => ({
  assessmentDigest: 'a'.repeat(64),
  evaluatedAt: effectiveAt,
  liveBlockingReferences: { bootstrapDefaults: [], currentProposals: [] },
  marketRef,
  marketRevision: 3,
  observedAt,
  outcome: 'VERIFIED',
  retainedHistoryReferences: [],
  sourceEvidence: sourceIds.map(sourceEvidence),
  tenantId,
});

const moduleStateInventory = (records: readonly TenantModuleStateRecord[]) => ({
  getTenantModuleStates: () => Effect.succeed(records),
});

it.effect('accepts CCC and authoritative proofs for genuinely undeployed Cart and Order owners', () =>
  Effect.gen(function* acceptsUndeployedOwners() {
    const calls: unknown[] = [];
    const authority = makeMarketRetirementImpactAuthority(
      (payload, correlation) => {
        calls.push({ correlation, payload });
        return Effect.succeed(verified());
      },
      moduleStateInventory([{ moduleKey: 'commerce.customer-context', state: 'active' }]),
    );

    const result = yield* authority.assessRetirementImpact(input);

    expect(calls).toEqual([{ correlation: input.actionInvocationId, payload: request }]);
    expect(result.requiredProviderModuleKeys).toEqual(['commerce.customer-context']);
    expect(result.providers.map(({ ownerModuleKey }) => ownerModuleKey)).toEqual(['commerce.customer-context']);
  }),
);

it.effect('fails closed for an active but unreachable Cart or Order owner before calling CCC', () =>
  Effect.gen(function* rejectsUnreachableOwners() {
    for (const moduleKey of ['commerce.cart', 'commerce.order'] as const) {
      let calls = 0;
      const authority = makeMarketRetirementImpactAuthority(
        () => {
          calls += 1;
          return Effect.succeed(verified());
        },
        moduleStateInventory([
          { moduleKey: 'commerce.customer-context', state: 'active' },
          { moduleKey, state: 'active' },
        ]),
      );

      const failure = yield* authority.assessRetirementImpact(input).pipe(Effect.flip);

      expect(Predicate.isTagged(failure, 'MarketRetirementImpactAssessmentUnavailable')).toBe(true);
      expect(failure.reason).toContain(moduleKey);
      expect(calls).toBe(0);
    }
  }),
);

it.effect('requires active CCC and explicit undeployed-owner evidence instead of assuming empty', () =>
  Effect.gen(function* rejectsMissingAuthority() {
    const missingCcc = yield* makeMarketRetirementImpactAuthority(
      () => Effect.succeed(verified()),
      moduleStateInventory([]),
    )
      .assessRetirementImpact(input)
      .pipe(Effect.flip);
    expect(Predicate.isTagged(missingCcc, 'MarketRetirementImpactAssessmentUnavailable')).toBe(true);

    const missingProof = yield* makeMarketRetirementImpactAuthority(
      () => Effect.succeed(verified(['commerce.customer-context.market-bootstrap-policy'])),
      moduleStateInventory([{ moduleKey: 'commerce.customer-context', state: 'active' }]),
    )
      .assessRetirementImpact(input)
      .pipe(Effect.flip);
    expect(Predicate.isTagged(missingProof, 'MarketRetirementImpactAssessmentUnavailable')).toBe(true);
    expect(missingProof.reason).toContain('commerce.cart');
  }),
);
