import { Context, Schema } from 'effect';
import type { Effect, Redacted } from 'effect';
import type { InvoiceUnavailable } from '../resources/invoice-unavailable.ts';

export const BillingOwnerAudienceSchema = Schema.Literals(['party-registry', 'payment-term-catalog', 'service-jobs']);
export type BillingOwnerAudience = typeof BillingOwnerAudienceSchema.Type;
export interface BillingOwnerGatewayCredentialIssuer {
  readonly issue: (input: {
    readonly audience: BillingOwnerAudience;
    readonly legalEntityId: string;
    readonly requestCorrelation: string;
  }) => Effect.Effect<Redacted.Redacted, InvoiceUnavailable>;
}

export class BillingOwnerGatewayCredentialService extends Context.Service<
  BillingOwnerGatewayCredentialService,
  BillingOwnerGatewayCredentialIssuer
>()('@app/billing-documents/shared/domain/owner-gateway-credential/BillingOwnerGatewayCredentialService') {}
