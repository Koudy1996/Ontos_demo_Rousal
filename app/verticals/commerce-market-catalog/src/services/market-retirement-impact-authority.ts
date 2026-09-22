import { Context, Effect, Option } from 'effect';

import type { MarketRetirementImpactAssessment } from '../../shared/domain/market-retirement-impact.ts';
import type { MarketRef } from '../../shared/resources/market.ts';
import type { MarketRetirementImpactAssessmentRejected } from '../actions/market-retirement-impact-assessment-rejected.ts';
import type { MarketRetirementImpactAssessmentStale } from '../actions/market-retirement-impact-assessment-stale.ts';
import type { MarketRetirementImpactAssessmentUnavailable } from '../actions/market-retirement-impact-assessment-unavailable.ts';

export type MarketRetirementImpactFailure =
  | MarketRetirementImpactAssessmentRejected
  | MarketRetirementImpactAssessmentStale
  | MarketRetirementImpactAssessmentUnavailable;

export interface MarketRetirementImpactAuthority {
  readonly assessRetirementImpact: (input: {
    readonly actionInvocationId: string;
    readonly effectiveAt: string;
    readonly expectedMarketRevision: number;
    readonly marketRef: MarketRef;
    readonly reservationToken: string;
  }) => Effect.Effect<MarketRetirementImpactAssessment, MarketRetirementImpactFailure>;
}

export class MarketRetirementImpactAuthorityService extends Context.Service<
  MarketRetirementImpactAuthorityService,
  MarketRetirementImpactAuthority
>()('@app/commerce-market-catalog/services/MarketRetirementImpactAuthorityService') {}

export const requiredMarketRetirementImpactAuthority = <Failure>(onUnavailable: () => Failure) =>
  Effect.serviceOption(MarketRetirementImpactAuthorityService).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(onUnavailable()),
        onSome: Effect.succeed,
      }),
    ),
    Effect.withSpan('MarketRetirementImpactAuthority.required'),
  );
