import type { Effect } from 'effect';
import { Context } from 'effect';

import type { MarketRetirementImpactAssessment } from '../../shared/domain/market-retirement-impact.ts';
import type { MarketRef } from '../../shared/resources/market.ts';
import type { MarketRetirementImpactAssessmentRejected } from '../actions/market-retirement-impact-assessment-rejected.ts';
import type { MarketRetirementImpactAssessmentStale } from '../actions/market-retirement-impact-assessment-stale.ts';
import type { MarketRetirementImpactAssessmentUnavailable } from '../actions/market-retirement-impact-assessment-unavailable.ts';

type MarketRetirementImpactFailure =
  | MarketRetirementImpactAssessmentRejected
  | MarketRetirementImpactAssessmentStale
  | MarketRetirementImpactAssessmentUnavailable;

export interface MarketRetirementImpactAuthority<Requirements = never> {
  readonly assessRetirementImpact: (input: {
    readonly actionInvocationId: string;
    readonly effectiveAt: string;
    readonly expectedMarketRevision: number;
    readonly marketRef: MarketRef;
    readonly reservationToken: string;
  }) => Effect.Effect<MarketRetirementImpactAssessment, MarketRetirementImpactFailure, Requirements>;
}

export class MarketRetirementImpactAuthorityService extends Context.Service<
  MarketRetirementImpactAuthorityService,
  MarketRetirementImpactAuthority
>()(
  '@app/commerce-market-catalog/services/market-retirement-impact-authority/MarketRetirementImpactAuthorityService',
) {}
