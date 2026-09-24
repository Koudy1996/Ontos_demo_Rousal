import { Effect, Match, Random, Schema } from 'effect';
import type { executeDashboardOverview } from '../../../api/dashboard-overview-client.ts';

export type DashboardClientFailure = Effect.Error<ReturnType<typeof executeDashboardOverview>>;
export const DashboardUiFailureSchema = Schema.Literals(['authentication', 'forbidden', 'notFound', 'unavailable']);
export type DashboardUiFailure = typeof DashboardUiFailureSchema.Type;

export const mapDashboardFailure = (error: DashboardClientFailure): DashboardUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'DashboardOverviewAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => 'authentication' as const,
    ),
    Match.tag('DashboardOverviewForbiddenProblem', 'GatewayForbiddenProblem', () => 'forbidden' as const),
    Match.tag('DashboardOverviewNotFoundProblem', () => 'notFound' as const),
    Match.tag(
      'DashboardOverviewUnavailableProblem',
      'DashboardOverviewInvalidProblem',
      'DashboardOverviewPolicyProblem',
      'DashboardOverviewPolicyConflictProblem',
      'DashboardOverviewInternalProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      'HttpClientError',
      'SchemaError',
      () => 'unavailable' as const,
    ),
    Match.exhaustive,
  );

export const dashboardCorrelation = Effect.forEach(Array.from({ length: 32 }), () => Random.nextIntBetween(0, 16), {
  concurrency: 1,
}).pipe(
  Effect.map((digits) =>
    digits
      .map((digit, index) => {
        let value = digit;
        if (index === 12) {
          value = 4;
        } else if (index === 16) {
          value = 8 + (digit % 4);
        }
        return value.toString(16);
      })
      .join(''),
  ),
);
