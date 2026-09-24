import { Context, Schema } from 'effect';
import type { Effect, Redacted } from 'effect';
import type { DashboardDependencyUnavailable } from './dashboard-dependency-unavailable.ts';

export { DashboardDependencyUnavailable } from './dashboard-dependency-unavailable.ts';

export const DashboardOwnerAudienceSchema = Schema.Literals([
  'billing-documents',
  'job-expenses',
  'sales-inquiries',
  'service-jobs',
  'workforce',
]);
export type DashboardOwnerAudience = typeof DashboardOwnerAudienceSchema.Type;

export interface DashboardOwnerGatewayCredentialIssuer {
  readonly issue: (input: {
    readonly audience: DashboardOwnerAudience;
    readonly legalEntityId: string;
    readonly requestCorrelation: string;
  }) => Effect.Effect<Redacted.Redacted, DashboardDependencyUnavailable>;
}

export class DashboardOwnerGatewayCredentialService extends Context.Service<
  DashboardOwnerGatewayCredentialService,
  DashboardOwnerGatewayCredentialIssuer
>()(
  '@app/operations-dashboard/shared/domain/dashboard-owner-gateway-credential/DashboardOwnerGatewayCredentialService',
) {}
