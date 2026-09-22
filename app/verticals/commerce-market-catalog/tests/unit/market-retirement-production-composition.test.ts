import type {
  MarketAffectedUseAssessmentResponse,
  MarketAffectedUseSourceEvidence,
} from '@app/customer-market-retirement-contracts/market-affected-use-assessment';
import { describe, expect, it } from 'effect-rstest';
import { ConfigProvider, Effect, Predicate, Schema } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { createActionCollector } from '../../../../packages/core-runtime/src/actions/collector.ts';
import { getActionHandler, getActionServiceFactory } from '../../../../packages/core-runtime/src/actions/definition.ts';
import { RetireMarketPayloadSchema, retireMarketAction } from '../../src/actions/retire-market.action.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const marketId = '22222222-2222-4222-8222-222222222222';
const definitionRevisionId = '33333333-3333-4333-8333-333333333333';
const sellerId = '44444444-4444-4444-8444-444444444444';
const principalId = '55555555-5555-4555-8555-555555555555';
const actionInvocationId = '66666666-6666-4666-8666-666666666666';
const effectiveAt = '2026-12-01T00:00:00.000Z';
const observedAt = '2026-11-30T23:59:59.000Z';
const reservationToken = 'market-retirement:reservation:12';
const shellGatewayBaseUrl = 'https://shell.example.test/shell-super-app-api';
const customerContextBaseUrl = 'https://customer-context.example.test/commerce-customer-context-api';
const marketRef = {
  moduleId: 'commerce.market-catalog',
  resourceId: marketId,
  resourceType: 'commerce.market-catalog.market',
  tenantId,
} as const;
const ownerResourceRef = {
  moduleId: 'commerce.customer-context',
  resourceId: '77777777-7777-4777-8777-777777777777',
  resourceType: 'commerce.customer-context.purchase-proposal-revision',
  tenantId,
} as const;
const scope = {
  authMethod: 'system' as const,
  correlationId: 'market-retirement-production-composition',
  legalEntityId: sellerId,
  principalId,
  tenantId,
};
const payload = Schema.decodeUnknownSync(RetireMarketPayloadSchema)({
  effectiveAt,
  expectedCurrentDefinitionRevisionRef: {
    moduleId: 'commerce.market-catalog',
    resourceId: definitionRevisionId,
    resourceType: 'commerce.market-catalog.market-definition-revision',
    tenantId,
  },
  expectedRevision: 3,
  marketRef,
  reason: 'Retire replaced Market.',
  retirementImpactReservationToken: reservationToken,
});

const sourceEvidence = (
  digest: string,
  sourceId = 'commerce.customer-context.market-bootstrap-policy',
): MarketAffectedUseSourceEvidence => ({
  completenessEvidence: {
    nextApplicabilityBoundary: '2027-01-01T00:00:00.000Z',
    observedAt,
    ownerRevision: `customer-context:${digest}`,
    scope: {
      kind: 'EXACT_PREDICATE',
      predicateRef: `market-retirement:${tenantId}:${marketId}:3`,
    },
  },
  currentness: 'CURRENT',
  digest,
  generation: `customer-context:g-${digest.slice(0, 4)}`,
  ownerRevision: `customer-context:${digest}`,
  sourceId,
});

const verified = (
  digest: string,
  options: { readonly bootstrap?: boolean; readonly retained?: boolean } = {},
): Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }> => ({
  assessmentDigest: digest,
  evaluatedAt: effectiveAt,
  liveBlockingReferences: {
    bootstrapDefaults: options.bootstrap
      ? [
          {
            kind: 'BOOTSTRAP_DEFAULT',
            marketRef,
            marketRevision: 3,
            ownerResourceRef,
            ownerResourceRevision: 'bootstrap:revision:9',
          },
        ]
      : [],
    currentProposals: [],
  },
  marketRef,
  marketRevision: 3,
  nextApplicabilityBoundary: '2027-01-01T00:00:00.000Z',
  observedAt,
  outcome: 'VERIFIED',
  retainedHistoryReferences: options.retained
    ? [
        {
          kind: 'RETAINED_HISTORY',
          marketRef,
          marketRevision: 3,
          ownerResourceRef,
          ownerResourceRevision: 'proposal:revision:4',
        },
      ]
    : [],
  sourceEvidence: [
    sourceEvidence(digest),
    sourceEvidence('1'.repeat(64), 'application-composition:commerce.cart:UNIMPLEMENTED'),
    sourceEvidence('2'.repeat(64), 'application-composition:commerce.order:UNIMPLEMENTED'),
  ],
  tenantId,
});

const findPersistedTransition = (value: unknown): Record<string, unknown> | undefined => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): Record<string, unknown> | undefined => {
    if (typeof candidate === 'string' && candidate.includes('retirementImpactAssessment')) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
      } catch {
        return undefined;
      }
    }
    if (typeof candidate !== 'object' || candidate === null || seen.has(candidate)) {
      return undefined;
    }
    if (Object.hasOwn(candidate, 'retirementImpactAssessment')) {
      return candidate as Record<string, unknown>;
    }
    seen.add(candidate);
    for (const nested of Object.values(candidate)) {
      const found = visit(nested);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return visit(value);
};

const runProductionRetirement = (responses: readonly MarketAffectedUseAssessmentResponse[]) => {
  const assessmentAuthorizationHeaders: string[] = [];
  const assessmentRequests: string[] = [];
  const gatewayRequests: string[] = [];
  const persistenceQueries: unknown[] = [];
  let responseIndex = 0;
  const responseForRequest = (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/auth/gateway-context')) {
      gatewayRequests.push(url.toString());
      return { expiresAt: 2_000_000_000, token: 'production-gateway-token' };
    }
    if (url.pathname.endsWith('/reads/market-affected-use-assessment')) {
      assessmentRequests.push(url.toString());
      assessmentAuthorizationHeaders.push(request.headers.get('authorization') ?? '');
      const response = responses[Math.min(responseIndex, responses.length - 1)];
      responseIndex += 1;
      return response;
    }
    throw new Error(`Unexpected production client request: ${url.toString()}`);
  };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return new Response(JSON.stringify(responseForRequest(request)), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  };
  const transaction = {
    invoke: (_routine: unknown, [input]: readonly unknown[]) => {
      persistenceQueries.push(input);
      return Effect.succeed([
        {
          payload: {
            _tag: 'transitioned',
            changed: true,
            definitionRevisionId,
            generation: 4,
            lifecycle: 'RETIRED',
            revision: 4,
          },
        },
      ]);
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Effect.succeed([{ moduleKey: 'commerce.customer-context', state: 'active' }]),
        }),
      }),
    }),
  };
  const collector = createActionCollector(
    retireMarketAction.descriptor.domainEvents,
    'commerce.market-catalog',
    retireMarketAction.descriptor.accessEvidencePolicy,
    retireMarketAction.descriptor.auditEvidenceSchema,
  );
  const program = Effect.gen(function* productionRetirement() {
    const services = yield* getActionServiceFactory(retireMarketAction)(transaction as never, scope);
    return yield* getActionHandler(retireMarketAction)(payload, {
      actionInvocationId,
      addDomainEvent: collector.addDomainEvent,
      addOutboxMessage: collector.addOutboxMessage,
      recordAuditEvidence: collector.recordAuditEvidence,
      recordDataAccess: collector.recordDataAccess,
      scope,
      services,
    });
  }).pipe(
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          ONTOS_COMMERCE_CUSTOMER_CONTEXT_BASE_URL: customerContextBaseUrl,
          ONTOS_SHELL_GATEWAY_BASE_URL: shellGatewayBaseUrl,
        }),
      ),
    ),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );
  return {
    assessmentAuthorizationHeaders,
    assessmentRequests,
    collector,
    gatewayRequests,
    persistenceQueries,
    program,
  };
};

describe('Market retirement deployed production composition', () => {
  it.effect('retires safely through the governed client and persists the revalidated transition evidence', () => {
    const digest = 'a'.repeat(64);
    const execution = runProductionRetirement([verified(digest)]);
    return Effect.gen(function* safeRetirement() {
      const result = yield* execution.program;
      expect(result).toMatchObject({ changed: true, lifecycle: 'RETIRED', revision: 4 });
      expect(execution.gatewayRequests).toEqual([
        `${shellGatewayBaseUrl}/auth/gateway-context`,
        `${shellGatewayBaseUrl}/auth/gateway-context`,
      ]);
      expect(execution.assessmentRequests).toEqual([
        `${customerContextBaseUrl}/reads/market-affected-use-assessment`,
        `${customerContextBaseUrl}/reads/market-affected-use-assessment`,
      ]);
      expect(execution.assessmentAuthorizationHeaders).toEqual([
        'Bearer production-gateway-token',
        'Bearer production-gateway-token',
      ]);
      expect(execution.persistenceQueries).toHaveLength(1);
      const transition = findPersistedTransition(execution.persistenceQueries[0]);
      expect(transition?.retirementImpactAssessment).toMatchObject({
        assessedMarketRevision: 3,
        providers: [
          {
            liveBlockingReferences: { count: 0 },
            ownerRevision: digest,
            retainedHistoryEvidence: { count: 0 },
            versionToken: digest,
          },
        ],
        reservationToken,
      });
      expect(execution.collector.snapshot().auditEvidence).toMatchObject({
        retirementImpactAssessment: transition?.retirementImpactAssessment,
      });
    });
  });

  it.effect('rejects live bootstrap references before persistence', () => {
    const execution = runProductionRetirement([verified('b'.repeat(64), { bootstrap: true })]);
    return Effect.gen(function* liveReference() {
      const failure = yield* execution.program.pipe(Effect.flip);
      expect(Predicate.isTagged(failure, 'MarketCommandRejected')).toBe(true);
      expect(failure).toMatchObject({ code: 'replacement_impact_unresolved' });
      expect(execution.assessmentRequests).toHaveLength(1);
      expect(execution.persistenceQueries).toHaveLength(0);
    });
  });

  it.effect('keeps provider unavailability distinct and fails before persistence', () => {
    const execution = runProductionRetirement([
      {
        code: 'owner-unavailable',
        evaluatedAt: effectiveAt,
        marketRef,
        marketRevision: 3,
        outcome: 'UNAVAILABLE',
        reason: 'Customer Context is unavailable',
        retryable: true,
        tenantId,
      },
    ]);
    return Effect.gen(function* unavailableProvider() {
      const failure = yield* execution.program.pipe(Effect.flip);
      expect(Predicate.isTagged(failure, 'MarketRetirementImpactAssessmentUnavailable')).toBe(true);
      expect(execution.persistenceQueries).toHaveLength(0);
    });
  });

  it.effect('rejects stale owner evidence before persistence', () => {
    const execution = runProductionRetirement([
      {
        code: 'stale-owner-evidence',
        evaluatedAt: effectiveAt,
        marketRef,
        marketRevision: 3,
        observedAt,
        outcome: 'STALE',
        reason: 'Owner evidence changed',
        staleSourceIds: ['commerce.customer-context.market-bootstrap-policy'],
        tenantId,
      },
    ]);
    return Effect.gen(function* staleEvidence() {
      const failure = yield* execution.program.pipe(Effect.flip);
      expect(Predicate.isTagged(failure, 'MarketRetirementImpactAssessmentStale')).toBe(true);
      expect(execution.persistenceQueries).toHaveLength(0);
    });
  });

  it.effect('revalidates and rejects a concurrent material reference before persistence', () => {
    const execution = runProductionRetirement([
      verified('c'.repeat(64)),
      verified('d'.repeat(64), { bootstrap: true }),
    ]);
    return Effect.gen(function* concurrentReference() {
      const failure = yield* execution.program.pipe(Effect.flip);
      expect(Predicate.isTagged(failure, 'MarketCommandRejected')).toBe(true);
      expect(failure).toMatchObject({ code: 'replacement_impact_unresolved' });
      expect(execution.assessmentRequests).toHaveLength(2);
      expect(execution.persistenceQueries).toHaveLength(0);
    });
  });

  it.effect('allows retained history and persists it as non-blocking transition evidence', () => {
    const digest = 'e'.repeat(64);
    const execution = runProductionRetirement([verified(digest, { retained: true })]);
    return Effect.gen(function* retainedHistory() {
      yield* execution.program;
      expect(execution.assessmentRequests).toHaveLength(2);
      const transition = findPersistedTransition(execution.persistenceQueries[0]);
      expect(transition?.retirementImpactAssessment).toMatchObject({
        providers: [
          {
            liveBlockingReferences: { count: 0 },
            retainedHistoryEvidence: { count: 1 },
          },
        ],
      });
      expect(execution.collector.snapshot().dataAccessEvents).toContainEqual(
        expect.objectContaining({
          queryHash: `market-retirement-impact:${marketId}:commerce.customer-context:${digest}:${digest}`,
          resultCount: 1,
        }),
      );
    });
  });
});
