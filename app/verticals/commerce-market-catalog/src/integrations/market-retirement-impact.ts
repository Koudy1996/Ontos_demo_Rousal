import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
} from '@app/commerce-customer-context/api';
import { executeMarketAffectedUseAssessment } from '@app/commerce-customer-context/api/client';
import { Effect } from 'effect';

import type { MarketRetirementImpactAssessment } from '../../shared/domain/market-retirement-impact.ts';
import { MarketRetirementImpactAssessmentRejected } from '../actions/market-retirement-impact-assessment-rejected.ts';
import { MarketRetirementImpactAssessmentStale } from '../actions/market-retirement-impact-assessment-stale.ts';
import { MarketRetirementImpactAssessmentUnavailable } from '../actions/market-retirement-impact-assessment-unavailable.ts';
import type { MarketRetirementImpactAuthority } from '../services/market-retirement-impact-authority.ts';

type ExecuteMarketAffectedUseAssessment = (
  payload: MarketAffectedUseAssessmentRequest,
  requestCorrelation: string,
) => Effect.Effect<MarketAffectedUseAssessmentResponse, unknown>;

const unavailable = (reason: string, cause?: unknown): MarketRetirementImpactAssessmentUnavailable => {
  const failure = new MarketRetirementImpactAssessmentUnavailable({
    code: 'market_retirement_impact_assessment_unavailable',
    reason,
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

const stale = (reason: string): MarketRetirementImpactAssessmentStale =>
  new MarketRetirementImpactAssessmentStale({
    code: 'market_retirement_impact_assessment_stale',
    reason,
  });

const rejected = (reason: string): MarketRetirementImpactAssessmentRejected =>
  new MarketRetirementImpactAssessmentRejected({
    code: 'market_retirement_impact_assessment_rejected',
    reason,
  });

const identityMatches = (
  request: MarketAffectedUseAssessmentRequest,
  response: MarketAffectedUseAssessmentResponse,
): boolean =>
  response.tenantId === request.tenantId &&
  response.marketRevision === request.marketRevision &&
  response.evaluatedAt === request.evaluatedAt &&
  response.marketRef.moduleId === request.marketRef.moduleId &&
  response.marketRef.resourceId === request.marketRef.resourceId &&
  response.marketRef.resourceType === request.marketRef.resourceType &&
  response.marketRef.tenantId === request.marketRef.tenantId;

const isCurrentAt = (observedAt: string, nextBoundaryAt: string | undefined, effectiveAt: string): boolean => {
  const observed = Date.parse(observedAt);
  const effective = Date.parse(effectiveAt);
  const boundary = nextBoundaryAt === undefined ? undefined : Date.parse(nextBoundaryAt);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(effective) &&
    observed <= effective &&
    (boundary === undefined || (Number.isFinite(boundary) && effective < boundary))
  );
};

const hasCompleteCurrentSourceEvidence = (
  response: Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }>,
): boolean => {
  if (response.sourceEvidence.length === 0) {
    return false;
  }
  const sourceIds = new Set<string>();
  for (const evidence of response.sourceEvidence) {
    const observedAt = String(evidence.completenessEvidence.observedAt);
    const boundary = evidence.completenessEvidence.nextApplicabilityBoundary;
    const nextBoundaryAt = boundary === undefined ? undefined : String(boundary);
    if (
      sourceIds.has(evidence.sourceId) ||
      evidence.currentness !== 'CURRENT' ||
      evidence.ownerRevision.length === 0 ||
      evidence.ownerRevision !== evidence.completenessEvidence.ownerRevision ||
      evidence.generation.length === 0 ||
      !/^[a-f0-9]{64}$/u.test(evidence.digest) ||
      evidence.completenessEvidence.scope.predicateRef.length === 0 ||
      !isCurrentAt(observedAt, nextBoundaryAt, response.evaluatedAt)
    ) {
      return false;
    }
    sourceIds.add(evidence.sourceId);
  }
  return true;
};

const verifiedAssessment = (
  response: Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }>,
  reservationToken: string,
): Effect.Effect<
  MarketRetirementImpactAssessment,
  MarketRetirementImpactAssessmentStale | MarketRetirementImpactAssessmentUnavailable
> => {
  if (!isCurrentAt(response.observedAt, response.nextApplicabilityBoundary, response.evaluatedAt)) {
    return Effect.fail(stale('Customer Context retirement-impact evidence is no longer Current'));
  }
  if (!hasCompleteCurrentSourceEvidence(response)) {
    return Effect.fail(unavailable('Customer Context returned incomplete retirement-impact source evidence'));
  }
  const liveReferenceCount =
    response.liveBlockingReferences.bootstrapDefaults.length + response.liveBlockingReferences.currentProposals.length;
  const provider = {
    completenessEvidenceReference: `customer-context:market-affected-use:${response.assessmentDigest}`,
    currentnessEvidenceReference: `customer-context:market-affected-use:${response.observedAt}:${response.assessmentDigest}`,
    effectiveAt: response.evaluatedAt,
    liveBlockingReferences: {
      count: liveReferenceCount,
      evidenceReference: `customer-context:market-live-references:${response.assessmentDigest}`,
    },
    nextBoundaryAt: response.nextApplicabilityBoundary,
    observedAt: response.observedAt,
    ownerModuleKey: 'commerce.customer-context' as const,
    ownerRevision: response.assessmentDigest,
    retainedHistoryEvidence: {
      count: response.retainedHistoryReferences.length,
      evidenceReference: `customer-context:market-retained-history:${response.assessmentDigest}`,
    },
    versionToken: response.assessmentDigest,
  };
  return Effect.succeed({
    assessedMarketRef: response.marketRef,
    assessedMarketRevision: response.marketRevision,
    effectiveAt: response.evaluatedAt,
    providers: [provider],
    requiredProviderModuleKeys: ['commerce.customer-context'],
    reservationToken,
  });
};

const toMarketAssessment = (
  request: MarketAffectedUseAssessmentRequest,
  response: MarketAffectedUseAssessmentResponse,
  reservationToken: string,
): Effect.Effect<
  MarketRetirementImpactAssessment,
  | MarketRetirementImpactAssessmentRejected
  | MarketRetirementImpactAssessmentStale
  | MarketRetirementImpactAssessmentUnavailable
> => {
  if (!identityMatches(request, response)) {
    return Effect.fail(
      stale('Customer Context retirement-impact evidence does not match the requested Market revision'),
    );
  }
  switch (response.outcome) {
    case 'REJECTED':
      return Effect.fail(rejected(response.reason));
    case 'STALE':
      return Effect.fail(stale(response.reason));
    case 'UNAVAILABLE':
      return Effect.fail(unavailable(response.reason));
    case 'VERIFIED':
      return verifiedAssessment(response, reservationToken);
  }
};

export const makeMarketRetirementImpactAuthority = (
  execute: ExecuteMarketAffectedUseAssessment = executeMarketAffectedUseAssessment,
): MarketRetirementImpactAuthority => ({
  assessRetirementImpact: (input) => {
    const request: MarketAffectedUseAssessmentRequest = {
      evaluatedAt: input.effectiveAt,
      marketRef: input.marketRef,
      marketRevision: input.expectedMarketRevision,
      tenantId: input.marketRef.tenantId,
    };
    return execute(request, input.actionInvocationId).pipe(
      Effect.mapError((cause) =>
        unavailable('The Customer Context Market retirement-impact authority is unavailable', cause),
      ),
      Effect.flatMap((response) => toMarketAssessment(request, response, input.reservationToken)),
      Effect.withSpan('MarketRetirementImpactAuthority.assessRetirementImpact'),
    );
  },
});

/** Production composition uses only Customer Context's published governed client. */
export const marketRetirementImpactAuthorityFromPublishedClient = makeMarketRetirementImpactAuthority();
