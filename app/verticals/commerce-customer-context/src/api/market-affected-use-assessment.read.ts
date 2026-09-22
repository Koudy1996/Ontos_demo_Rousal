import type { ReadHandlerContext, ReadHandlerResult } from '@app/core-runtime';
import {
  OperationContextUnavailable,
  ReadHandlerUnavailable,
  ReadPermissionDenied,
  defineRead,
  defineReadResourcePermission,
  defineTenantModuleEntrypoint,
} from '@app/core-runtime';
import {
  MarketAffectedUseAssessmentRequestSchema,
  MarketAffectedUseAssessmentResponseSchema,
} from '@app/customer-market-retirement-contracts';
import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
  MarketAffectedUseSourceEvidence,
} from '@app/customer-market-retirement-contracts';
import { createHash } from 'node:crypto';
import { Context, Effect, Option } from 'effect';

import {
  makeMarketAffectedUseAssessmentRepository,
  type MarketAffectedUseAssessmentRepository,
} from '../persistence/market-retirement-persistence.ts';

export interface MarketReferenceOwnerDeploymentStateAuthority {
  /**
   * Returns Application Composition evidence for every Market-reference owner that is not read
   * through this deployment. Disabled/unimplemented and enabled-unreachable are distinct: the
   * latter must fail instead of returning an empty proof.
   */
  readonly proveReferenceOwnerStates: (
    input: MarketAffectedUseAssessmentRequest,
  ) => Effect.Effect<
    Readonly<{ readonly sourceEvidence: readonly MarketAffectedUseSourceEvidence[] }>,
    ReadHandlerUnavailable
  >;
}

export class MarketReferenceOwnerDeploymentStateAuthorityService extends Context.Service<
  MarketReferenceOwnerDeploymentStateAuthorityService,
  MarketReferenceOwnerDeploymentStateAuthority
>()(
  '@app/commerce-customer-context/api/market-affected-use-assessment.read/MarketReferenceOwnerDeploymentStateAuthorityService',
) {}

export interface MarketAffectedUseAssessmentServices {
  readonly assess: (
    input: MarketAffectedUseAssessmentRequest,
  ) => Effect.Effect<MarketAffectedUseAssessmentResponse, ReadHandlerUnavailable>;
}

const canonicalDigest = (assessment: Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }>) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        evaluatedAt: assessment.evaluatedAt,
        liveBlockingReferences: assessment.liveBlockingReferences,
        marketRef: assessment.marketRef,
        marketRevision: assessment.marketRevision,
        nextApplicabilityBoundary: assessment.nextApplicabilityBoundary,
        observedAt: assessment.observedAt,
        retainedHistoryReferences: assessment.retainedHistoryReferences,
        sourceEvidence: assessment.sourceEvidence.toSorted((left, right) =>
          left.sourceId.localeCompare(right.sourceId),
        ),
        tenantId: assessment.tenantId,
      }),
    )
    .digest('hex');

const staleEvidenceSourceIds = (
  evaluatedAt: string,
  sourceEvidence: readonly MarketAffectedUseSourceEvidence[],
): readonly string[] => {
  const evaluated = Date.parse(evaluatedAt);
  const seen = new Set<string>();
  return sourceEvidence.flatMap((evidence) => {
    const observed = Date.parse(String(evidence.completenessEvidence.observedAt));
    const nextBoundary = evidence.completenessEvidence.nextApplicabilityBoundary;
    const next = nextBoundary === undefined ? undefined : Date.parse(String(nextBoundary));
    const duplicated = seen.has(evidence.sourceId);
    seen.add(evidence.sourceId);
    return duplicated ||
      evidence.ownerRevision !== evidence.completenessEvidence.ownerRevision ||
      observed > evaluated ||
      (next !== undefined && evaluated >= next)
      ? [evidence.sourceId]
      : [];
  });
};

export const makeMarketAffectedUseAssessmentServices = (dependencies: {
  readonly deploymentState: MarketReferenceOwnerDeploymentStateAuthority;
  readonly repository: MarketAffectedUseAssessmentRepository;
}): MarketAffectedUseAssessmentServices => ({
  assess: Effect.fn('MarketAffectedUseAssessment.assess')(function* assess(input) {
    const local = yield* dependencies.repository.assess(input);
    if (local.outcome !== 'VERIFIED') {
      return local;
    }
    const deploymentState = yield* dependencies.deploymentState.proveReferenceOwnerStates(input);
    const sourceEvidence = [...local.sourceEvidence, ...deploymentState.sourceEvidence].toSorted((left, right) =>
      left.sourceId.localeCompare(right.sourceId),
    );
    const staleSourceIds = staleEvidenceSourceIds(input.evaluatedAt, sourceEvidence);
    if (staleSourceIds.length > 0) {
      return {
        ...input,
        code: 'stale-owner-evidence',
        observedAt: local.observedAt,
        outcome: 'STALE' as const,
        reason: 'Market affected-use source evidence is stale, duplicated, or revision-inconsistent',
        staleSourceIds,
      };
    }
    const combined = {
      ...local,
      sourceEvidence,
    };
    return { ...combined, assessmentDigest: canonicalDigest(combined) };
  }),
});

export const handleMarketAffectedUseAssessment: (
  input: MarketAffectedUseAssessmentRequest,
  context: ReadHandlerContext<MarketAffectedUseAssessmentServices>,
) => Effect.Effect<
  ReadHandlerResult<MarketAffectedUseAssessmentResponse>,
  ReadHandlerUnavailable | ReadPermissionDenied
> = (input, context) => {
  if (input.tenantId !== context.scope.tenantId || input.marketRef.tenantId !== context.scope.tenantId) {
    return Effect.fail(
      new ReadPermissionDenied({
        code: 'read_permission_denied',
        reason: 'The assessed Market is outside the trusted Tenant context',
      }),
    );
  }
  return context.services
    .assess(input)
    .pipe(Effect.map((result) => ({ evidence: { resultCount: result.outcome === 'VERIFIED' ? 1 : 0 }, result })));
};

export const marketAffectedUseAssessmentEntrypoint = defineTenantModuleEntrypoint({
  access: 'read',
  authorization: { kind: 'context_permission', permission: 'market.catalog.read' },
  entrypointKey: 'commerce.customer-context.api.market-affected-use-assessment',
  moduleKey: 'commerce.customer-context',
  role: 'api',
});

export const marketAffectedUseAssessmentRead = defineRead(
  {
    accessKind: 'detail',
    entrypoint: marketAffectedUseAssessmentEntrypoint,
    evidencePolicy: {
      captureMode: 'metadata_only',
      policyKey: 'commerce.customer-context.api.market-affected-use-assessment.evidence.v1',
    },
    inputSchema: MarketAffectedUseAssessmentRequestSchema,
    legalEntityScope: 'required',
    owningModuleKey: 'commerce.customer-context',
    permissionTarget: 'module',
    policies: [],
    readKey: 'commerce.customer-context.api.market-affected-use-assessment',
    resourcePermission: defineReadResourcePermission<MarketAffectedUseAssessmentRequest>(({ marketRef }) => ({
      permission: 'read',
      resource: marketRef,
    })),
    resultSchema: MarketAffectedUseAssessmentResponseSchema,
    schemaVersion: '1',
  },
  handleMarketAffectedUseAssessment,
  (transaction, scope) => {
    const { legalEntityId } = scope;
    if (legalEntityId === undefined) {
      return Effect.fail(
        new OperationContextUnavailable({
          code: 'operation_context_unavailable',
          reason: 'Market affected-use assessment requires a trusted Legal Entity scope',
        }),
      );
    }
    return Effect.gen(function* makeServices() {
      const deploymentState = yield* Effect.serviceOption(MarketReferenceOwnerDeploymentStateAuthorityService);
      return makeMarketAffectedUseAssessmentServices({
        deploymentState: Option.match(deploymentState, {
          onNone: () => ({
            proveReferenceOwnerStates: () =>
              Effect.fail(
                new ReadHandlerUnavailable({
                  code: 'read_handler_unavailable',
                  reason: 'Authoritative Market-reference deployment state is not configured',
                }),
              ),
          }),
          onSome: (authority) => authority,
        }),
        repository: makeMarketAffectedUseAssessmentRepository({
          invoker: transaction,
          scope: { ...scope, legalEntityId },
        }),
      });
    });
  },
  () => ({ kind: 'module', moduleId: 'commerce.customer-context' }),
);
