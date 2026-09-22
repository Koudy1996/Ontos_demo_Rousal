import type { OperationalScope, ReadHandlerContext } from '@app/core-runtime';
import { ReadHandlerUnavailable, ReadPermissionDenied } from '@app/core-runtime';
import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
  ReserveMarketRetirementPayload,
} from '@app/customer-market-retirement-contracts';
import { MarketAffectedUseAssessmentResponseSchema } from '@app/customer-market-retirement-contracts';
import { Effect, Schema } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  handleMarketAffectedUseAssessment,
  makeMarketAffectedUseAssessmentServices,
} from '../../src/api/market-affected-use-assessment.read.ts';
import type { MarketAffectedUseAssessmentServices } from '../../src/api/market-affected-use-assessment.read.ts';
import {
  MarketRetirementReservationConflict,
  makeMarketAffectedUseAssessmentRepository,
  makeMarketRetirementReservationService,
  marketRetirementRoutineAllowlist,
} from '../../src/persistence/market-retirement-persistence.ts';
import type { MarketRetirementScopedRoutineInvoker } from '../../src/persistence/market-retirement-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const legalEntityId = '22222222-2222-4222-8222-222222222222';
const principalId = '33333333-3333-4333-8333-333333333333';
const marketRef = {
  moduleId: 'commerce.market-catalog',
  resourceId: 'market-cz',
  resourceType: 'commerce.market-catalog.market',
  tenantId,
} as const;
const evaluatedAt = '2026-09-22T10:00:00.000Z';
const observedAt = '2026-09-22T09:59:59.000Z';
const digest = 'a'.repeat(64);

const request: MarketAffectedUseAssessmentRequest = {
  evaluatedAt,
  marketRef,
  marketRevision: 7,
  tenantId,
};

const sourceEvidence = (sourceId: string, ownerRevision = 'revision-7') => ({
  completenessEvidence: {
    observedAt,
    ownerRevision,
    scope: {
      kind: 'SAFELY_BROADER_SCOPE' as const,
      declaredScopeRef: `${sourceId}:all:${tenantId}`,
      predicateRef: `${sourceId}:market:${marketRef.resourceId}`,
    },
  },
  currentness: 'CURRENT' as const,
  digest,
  generation: 'generation-7',
  ownerRevision,
  sourceId,
});

const localAssessment: MarketAffectedUseAssessmentResponse = {
  assessmentDigest: digest,
  evaluatedAt,
  liveBlockingReferences: {
    bootstrapDefaults: [
      {
        kind: 'BOOTSTRAP_DEFAULT',
        marketRef,
        marketRevision: 7,
        ownerResourceRef: {
          moduleId: 'commerce.customer-context',
          resourceId: '44444444-4444-4444-8444-444444444444',
          resourceType: 'commerce.customer-context.market-bootstrap-policy',
          tenantId,
        },
        ownerResourceRevision: 'policy-revision-3',
      },
    ],
    currentProposals: [],
  },
  marketRef,
  marketRevision: 7,
  observedAt,
  outcome: 'VERIFIED',
  retainedHistoryReferences: [
    {
      kind: 'RETAINED_HISTORY',
      marketRef,
      marketRevision: 7,
      ownerResourceRef: {
        moduleId: 'commerce.customer-context',
        resourceId: '55555555-5555-4555-8555-555555555555',
        resourceType: 'commerce.customer-context.purchase-proposal-revision',
        tenantId,
      },
      ownerResourceRevision: 'proposal-revision-2',
    },
  ],
  sourceEvidence: [sourceEvidence('commerce.customer-context.market-bootstrap-policy')],
  tenantId,
};

const scope = {
  authBindingId: '66666666-6666-4666-8666-666666666666',
  authContextRef: 'better-auth-session:market-retirement-test',
  authMethod: 'session',
  correlationId: 'market-retirement-correlation',
  legalEntityId,
  principalId,
  tenantId,
} satisfies OperationalScope & { readonly legalEntityId: string };

const context = (
  services: MarketAffectedUseAssessmentServices,
): ReadHandlerContext<MarketAffectedUseAssessmentServices> => ({
  operationId: '77777777-7777-4777-8777-777777777777',
  recordDataAccess: () => Effect.void,
  scope,
  services,
});

const invokerReturning = (...results: readonly object[]): MarketRetirementScopedRoutineInvoker => ({
  invoke: (routine) =>
    Effect.forEach(results, (result) => Schema.decodeUnknownEffect(routine.resultSchema)(result), {
      concurrency: 1,
    }).pipe(Effect.orDie),
});

it('declares only the scoped affected-use and reservation routines', () => {
  expect(marketRetirementRoutineAllowlist.map(({ name, routineKey }) => [name, routineKey])).toEqual([
    ['assess_market_retirement_affected_use', 'market-retirement.assess-affected-use'],
    ['reserve_market_retirement', 'market-retirement.reserve'],
  ]);
  for (const routine of marketRetirementRoutineAllowlist) {
    expect(Object.isFrozen(routine)).toBe(true);
    expect(routine.ownerModuleKey).toBe('commerce.customer-context');
    expect(routine.parameters.slice(0, 2)).toEqual([
      { source: 'tenantId', type: 'uuid' },
      { source: 'legalEntityId', type: 'uuid' },
    ]);
  }
});

it.effect('returns owner-classified live and retained references with authoritative absent-owner proofs', () =>
  Effect.gen(function* assessedReferences() {
    expect(() => Schema.decodeSync(MarketAffectedUseAssessmentResponseSchema)(localAssessment)).not.toThrow();
    const calls: unknown[] = [];
    const repository = makeMarketAffectedUseAssessmentRepository({
      invoker: {
        invoke: (routine, values) => {
          calls.push([routine.routineKey, values]);
          return invokerReturning({ result: localAssessment }).invoke(routine, values);
        },
      },
      scope,
    });
    const cartProof = sourceEvidence('application-composition:commerce.cart:UNIMPLEMENTED', 'composition-19');
    const orderProof = sourceEvidence('application-composition:commerce.order:UNIMPLEMENTED', 'composition-19');
    const services = makeMarketAffectedUseAssessmentServices({
      deploymentState: {
        proveReferenceOwnerStates: () => Effect.succeed({ sourceEvidence: [cartProof, orderProof] }),
      },
      repository,
    });

    const result = yield* services.assess(request);

    expect(result.outcome).toBe('VERIFIED');
    if (result.outcome !== 'VERIFIED') {
      return;
    }
    expect(result.assessmentDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.assessmentDigest).not.toBe(localAssessment.assessmentDigest);
    expect(result.liveBlockingReferences).toEqual(localAssessment.liveBlockingReferences);
    expect(result.retainedHistoryReferences).toEqual(localAssessment.retainedHistoryReferences);
    expect(result.sourceEvidence.map(({ sourceId }) => sourceId)).toEqual([
      'application-composition:commerce.cart:UNIMPLEMENTED',
      'application-composition:commerce.order:UNIMPLEMENTED',
      'commerce.customer-context.market-bootstrap-policy',
    ]);
    expect(calls).toEqual([['market-retirement.assess-affected-use', [marketRef.resourceId, 7n, evaluatedAt]]]);
  }),
);

it.effect('fails closed when authoritative deployment state cannot be proven', () =>
  Effect.gen(function* unavailableDeploymentState() {
    const services = makeMarketAffectedUseAssessmentServices({
      deploymentState: {
        proveReferenceOwnerStates: () =>
          Effect.fail(
            new ReadHandlerUnavailable({
              code: 'read_handler_unavailable',
              reason: 'Application Composition evidence is unavailable',
            }),
          ),
      },
      repository: { assess: () => Effect.succeed(localAssessment) },
    });

    const failure = yield* services.assess(request).pipe(Effect.flip);

    expect(Schema.is(ReadHandlerUnavailable)(failure)).toBe(true);
    expect(failure.reason).toContain('Application Composition');
  }),
);

it.effect('preserves typed rejected, unavailable, and stale owner outcomes without fabricating deployment proof', () =>
  Effect.gen(function* preservesOwnerOutcomes() {
    const outcomes: readonly MarketAffectedUseAssessmentResponse[] = [
      { ...request, code: 'live-reference', outcome: 'REJECTED', reason: 'A live Market reference exists' },
      {
        ...request,
        code: 'owner-unavailable',
        outcome: 'UNAVAILABLE',
        reason: 'Owner evidence is unavailable',
        retryable: true,
      },
      {
        ...request,
        code: 'stale-owner-evidence',
        observedAt,
        outcome: 'STALE',
        reason: 'Owner evidence changed',
        staleSourceIds: ['commerce.customer-context.purchase-proposals'],
      },
    ];
    let deploymentStateCalls = 0;
    for (const outcome of outcomes) {
      const services = makeMarketAffectedUseAssessmentServices({
        deploymentState: {
          proveReferenceOwnerStates: () => {
            deploymentStateCalls += 1;
            return Effect.succeed({ sourceEvidence: [] });
          },
        },
        repository: { assess: () => Effect.succeed(outcome) },
      });
      expect(yield* services.assess(request)).toEqual(outcome);
    }
    expect(deploymentStateCalls).toBe(0);
  }),
);

it.effect('rejects a cross-tenant affected-use read before owner persistence runs', () =>
  Effect.gen(function* rejectsCrossTenantRead() {
    let calls = 0;
    const failure = yield* handleMarketAffectedUseAssessment(
      {
        ...request,
        tenantId: '88888888-8888-4888-8888-888888888888',
        marketRef: { ...marketRef, tenantId: '88888888-8888-4888-8888-888888888888' },
      },
      context({
        assess: () => {
          calls += 1;
          return Effect.succeed(localAssessment);
        },
      }),
    ).pipe(Effect.flip);

    expect(Schema.is(ReadPermissionDenied)(failure)).toBe(true);
    expect(calls).toBe(0);
  }),
);

it.effect('maps concurrent affected-use change to a retryable reservation conflict', () =>
  Effect.gen(function* reservationConflict() {
    const payload: ReserveMarketRetirementPayload = {
      assessmentDigest: digest,
      evaluatedAt,
      marketRef,
      marketRevision: 7,
      operation: 'RESERVE',
      reason: 'Retire unused Czech Market',
      sourceEvidence: [sourceEvidence('commerce.customer-context.market-bootstrap-policy')],
      tenantId,
    };
    const service = makeMarketRetirementReservationService({
      invoker: {
        invoke: () =>
          Effect.fail({
            _tag: 'ScopedRoutineInvocationError' as const,
            constraint: Schema.decodeUnknownSync(Schema.OptionFromNullOr(Schema.String))(
              'market_retirement_reservation_conflict',
            ),
            postgresCode: Schema.decodeUnknownSync(Schema.OptionFromNullOr(Schema.String))('P0001'),
            reason: 'sanitized',
            routineKey: 'market-retirement.reserve',
          }),
      },
      scope,
    });

    const failure = yield* service
      .execute(payload, {
        actionInvocationId: '99999999-9999-4999-8999-999999999999',
        actorPrincipalId: principalId,
      })
      .pipe(Effect.flip);

    expect(Schema.is(MarketRetirementReservationConflict)(failure)).toBe(true);
  }),
);

it.effect('binds a reservation to exact Market revision, assessment evidence, and Action attribution', () =>
  Effect.gen(function* exactReservationBinding() {
    const payload: ReserveMarketRetirementPayload = {
      assessmentDigest: digest,
      evaluatedAt,
      marketRef,
      marketRevision: 7,
      operation: 'RESERVE',
      reason: 'Retire unused Czech Market',
      sourceEvidence: [sourceEvidence('commerce.customer-context.market-bootstrap-policy')],
      tenantId,
    };
    const result = {
      assessmentDigest: digest,
      lifecycle: 'RESERVED' as const,
      marketRef,
      marketRevision: 7,
      reservationToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reservationVersion: 1,
      tenantId,
    };
    const invocations: unknown[] = [];
    const service = makeMarketRetirementReservationService({
      invoker: {
        invoke: (routine, values) => {
          invocations.push([routine.routineKey, values]);
          return invokerReturning({ result }).invoke(routine, values);
        },
      },
      scope,
    });

    expect(
      yield* service.execute(payload, {
        actionInvocationId: '99999999-9999-4999-8999-999999999999',
        actorPrincipalId: principalId,
      }),
    ).toEqual(result);
    expect(invocations).toEqual([
      [
        'market-retirement.reserve',
        [
          {
            ...payload,
            actionInvocationId: '99999999-9999-4999-8999-999999999999',
            actorPrincipalId: principalId,
          },
        ],
      ],
    ]);
  }),
);
