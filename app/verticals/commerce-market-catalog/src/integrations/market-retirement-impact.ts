import type {
  MarketAffectedUseAssessmentRequest,
  MarketAffectedUseAssessmentResponse,
} from '@app/customer-market-retirement-contracts/market-affected-use-assessment';
import { executeMarketAffectedUseAssessmentWithAuthorization } from '@app/customer-market-retirement-contracts/market-affected-use-assessment/client';
import { TenantModuleStateService } from '@app/core-runtime';
import type { TenantModuleStateServiceContract } from '@app/core-runtime';
import { issueGatewayContext } from '@app/shared-contracts';
import { Config, DateTime, Effect, Layer, Match, Option, Schema } from 'effect';

import type { MarketRetirementImpactAssessment } from '../../shared/domain/market-retirement-impact.ts';
import { MarketRetirementImpactAssessmentRejected } from '../actions/market-retirement-impact-assessment-rejected.ts';
import { MarketRetirementImpactAssessmentStale } from '../actions/market-retirement-impact-assessment-stale.ts';
import { MarketRetirementImpactAssessmentUnavailable } from '../actions/market-retirement-impact-assessment-unavailable.ts';
import type { MarketRetirementImpactAuthority } from '../services/market-retirement-impact-authority.ts';
import { MarketRetirementImpactAuthorityService } from '../services/market-retirement-impact-authority.ts';

type ExecuteMarketAffectedUseAssessment<Failure> = (
  payload: MarketAffectedUseAssessmentRequest,
  requestCorrelation: string,
) => Effect.Effect<MarketAffectedUseAssessmentResponse, Failure>;

type MarketRetirementModuleStateInventory = Pick<TenantModuleStateServiceContract, 'getTenantModuleStates'>;

const CUSTOMER_CONTEXT_MODULE_KEY = 'commerce.customer-context' as const;
const MATERIAL_REFERENCE_OWNER_MODULE_KEYS = [CUSTOMER_CONTEXT_MODULE_KEY, 'commerce.cart', 'commerce.order'] as const;
const httpUrl = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    url.search.length === 0 &&
    url.hash.length === 0
      ? undefined
      : 'Service URL must be an HTTP(S) URL without credentials, query, or fragment',
  ),
);
const productionClientConfiguration = Config.all({
  customerContextBaseUrl: Config.schema(httpUrl, 'ONTOS_COMMERCE_CUSTOMER_CONTEXT_BASE_URL'),
  shellGatewayBaseUrl: Config.schema(httpUrl, 'ONTOS_SHELL_GATEWAY_BASE_URL'),
});

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

const normalizeInstant = (value: DateTime.DateTime | string): string =>
  DateTime.isDateTime(value) ? DateTime.formatIso(value) : value;

const isCurrentAt = (observedAt: string, nextBoundaryAt: string | undefined, effectiveAt: string): boolean => {
  const observed = DateTime.make(observedAt);
  const effective = DateTime.make(effectiveAt);
  const boundary = nextBoundaryAt === undefined ? Option.none() : DateTime.make(nextBoundaryAt);
  if (Option.isNone(observed) || Option.isNone(effective)) {
    return false;
  }
  const observedEpoch = DateTime.toEpochMillis(observed.value);
  const effectiveEpoch = DateTime.toEpochMillis(effective.value);
  return (
    observedEpoch <= effectiveEpoch &&
    (Option.isNone(boundary) || effectiveEpoch < DateTime.toEpochMillis(boundary.value))
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
    const observedAt = normalizeInstant(evidence.completenessEvidence.observedAt);
    const boundary = evidence.completenessEvidence.nextApplicabilityBoundary;
    const nextBoundaryAt = boundary === undefined ? undefined : normalizeInstant(boundary);
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
  undeployedOwnerModuleKeys: ReadonlySet<string>,
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
  for (const moduleKey of undeployedOwnerModuleKeys) {
    const expectedSourceId = `application-composition:${moduleKey}:UNIMPLEMENTED`;
    if (!response.sourceEvidence.some(({ sourceId }) => sourceId === expectedSourceId)) {
      return Effect.fail(
        unavailable(`Customer Context did not prove that retirement-impact owner ${moduleKey} is undeployed`),
      );
    }
  }
  const liveReferenceCount =
    response.liveBlockingReferences.bootstrapDefaults.length + response.liveBlockingReferences.currentProposals.length;
  const providerWithoutBoundary = {
    completenessEvidenceReference: `customer-context:market-affected-use:${response.assessmentDigest}`,
    currentnessEvidenceReference: `customer-context:market-affected-use:${response.observedAt}:${response.assessmentDigest}`,
    effectiveAt: response.evaluatedAt,
    liveBlockingReferences: {
      count: liveReferenceCount,
      evidenceReference: `customer-context:market-live-references:${response.assessmentDigest}`,
    },
    observedAt: response.observedAt,
    ownerModuleKey: CUSTOMER_CONTEXT_MODULE_KEY,
    ownerRevision: response.assessmentDigest,
    retainedHistoryEvidence: {
      count: response.retainedHistoryReferences.length,
      evidenceReference: `customer-context:market-retained-history:${response.assessmentDigest}`,
    },
    versionToken: response.assessmentDigest,
  };
  const provider =
    response.nextApplicabilityBoundary === undefined
      ? providerWithoutBoundary
      : { ...providerWithoutBoundary, nextBoundaryAt: response.nextApplicabilityBoundary };
  return Effect.succeed({
    assessedMarketRef: response.marketRef,
    assessedMarketRevision: response.marketRevision,
    effectiveAt: response.evaluatedAt,
    providers: [provider],
    requiredProviderModuleKeys: [CUSTOMER_CONTEXT_MODULE_KEY],
    reservationToken,
  });
};

const toMarketAssessment = (
  request: MarketAffectedUseAssessmentRequest,
  response: MarketAffectedUseAssessmentResponse,
  reservationToken: string,
  undeployedOwnerModuleKeys: ReadonlySet<string>,
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
  return Match.value(response).pipe(
    Match.discriminator('outcome')('REJECTED', ({ reason }) => Effect.fail(rejected(reason))),
    Match.discriminator('outcome')('STALE', ({ reason }) => Effect.fail(stale(reason))),
    Match.discriminator('outcome')('UNAVAILABLE', ({ reason }) => Effect.fail(unavailable(reason))),
    Match.discriminator('outcome')('VERIFIED', (verified) =>
      verifiedAssessment(verified, reservationToken, undeployedOwnerModuleKeys),
    ),
    Match.exhaustive,
  );
};

const inventoryMaterialReferenceOwners = (
  inventory: MarketRetirementModuleStateInventory,
  tenantId: string,
): Effect.Effect<ReadonlySet<string>, MarketRetirementImpactAssessmentUnavailable> =>
  inventory.getTenantModuleStates(tenantId, MATERIAL_REFERENCE_OWNER_MODULE_KEYS).pipe(
    Effect.mapError((cause) => unavailable('The Market retirement provider inventory is unavailable', cause)),
    Effect.flatMap((records) => {
      const statesByModuleKey = new Map(records.map((record) => [record.moduleKey, record.state]));
      if (statesByModuleKey.size !== records.length) {
        return Effect.fail(unavailable('The Market retirement provider inventory contains duplicate owners'));
      }
      if (statesByModuleKey.get(CUSTOMER_CONTEXT_MODULE_KEY) !== 'active') {
        return Effect.fail(unavailable('The Customer Context retirement-impact provider is not active'));
      }
      for (const moduleKey of MATERIAL_REFERENCE_OWNER_MODULE_KEYS) {
        if (moduleKey !== CUSTOMER_CONTEXT_MODULE_KEY && statesByModuleKey.get(moduleKey) === 'active') {
          return Effect.fail(
            unavailable(
              `The active retirement-impact provider ${moduleKey} is not reachable through a published client`,
            ),
          );
        }
      }
      return Effect.succeed(
        new Set(
          MATERIAL_REFERENCE_OWNER_MODULE_KEYS.filter(
            (moduleKey) => moduleKey !== CUSTOMER_CONTEXT_MODULE_KEY && !statesByModuleKey.has(moduleKey),
          ),
        ),
      );
    }),
  );

export const makeMarketRetirementImpactAuthority = <Failure>(
  execute: ExecuteMarketAffectedUseAssessment<Failure>,
  moduleStateInventory?: MarketRetirementModuleStateInventory,
): MarketRetirementImpactAuthority => ({
  assessRetirementImpact: (input) => {
    const request: MarketAffectedUseAssessmentRequest = {
      evaluatedAt: input.effectiveAt,
      marketRef: input.marketRef,
      marketRevision: input.expectedMarketRevision,
      tenantId: input.marketRef.tenantId,
    };
    const undeployedOwnerModuleKeys =
      moduleStateInventory === undefined
        ? Effect.succeed(new Set<string>())
        : inventoryMaterialReferenceOwners(moduleStateInventory, input.marketRef.tenantId);
    return undeployedOwnerModuleKeys.pipe(
      Effect.flatMap((undeployedOwners) =>
        execute(request, input.actionInvocationId).pipe(
          Effect.mapError((cause) =>
            unavailable('The Customer Context Market retirement-impact authority is unavailable', cause),
          ),
          Effect.flatMap((response) => toMarketAssessment(request, response, input.reservationToken, undeployedOwners)),
        ),
      ),
      Effect.withSpan('MarketRetirementImpactAuthority.assessRetirementImpact'),
    );
  },
});

export const makeMarketRetirementImpactAuthorityFromPublishedClient = (
  moduleStateInventory: MarketRetirementModuleStateInventory,
) =>
  makeMarketRetirementImpactAuthority(
    (payload, requestCorrelation) =>
      productionClientConfiguration.pipe(
        Effect.flatMap(({ customerContextBaseUrl, shellGatewayBaseUrl }) =>
          issueGatewayContext({ audience: 'commerce-customer-context' }, { baseUrl: shellGatewayBaseUrl }).pipe(
            Effect.flatMap(({ token }) =>
              executeMarketAffectedUseAssessmentWithAuthorization(payload, `Bearer ${token}`, requestCorrelation, {
                baseUrl: customerContextBaseUrl,
              }),
            ),
          ),
        ),
      ),
    moduleStateInventory,
  );

export const MarketRetirementImpactAuthorityLive = Layer.effect(
  MarketRetirementImpactAuthorityService,
  TenantModuleStateService.pipe(Effect.map(makeMarketRetirementImpactAuthorityFromPublishedClient)),
);
