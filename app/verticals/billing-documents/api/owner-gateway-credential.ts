import { issueApiKeyGatewayContext } from '@app/shared-contracts/server/gateway-context-api-key';
import type { ApiKeyGatewayContextClientOptions } from '@app/shared-contracts/server/gateway-context-api-key';
import type { GatewayContextClientError, GatewayContextResponse } from '@app/shared-contracts';
import { Config, Effect, Layer, Redacted, Schema } from 'effect';
import { InvoiceUnavailable } from '../shared/resources/invoice-unavailable.ts';
import { BillingOwnerGatewayCredentialService } from '../shared/domain/owner-gateway-credential.ts';
import type {
  BillingOwnerAudience,
  BillingOwnerGatewayCredentialIssuer,
} from '../shared/domain/owner-gateway-credential.ts';

const httpUrl = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    url.search.length === 0 &&
    url.hash.length === 0
      ? undefined
      : 'Shell gateway URL must be an HTTP(S) URL without credentials, query, or fragment',
  ),
);
const configuration = Config.all({
  apiKey: Config.redacted('ONTOS_BILLING_DOCUMENTS_GATEWAY_API_KEY'),
  baseUrl: Config.schema(httpUrl, 'ONTOS_SHELL_GATEWAY_BASE_URL'),
});
type GatewayContextIssue = (
  payload: { readonly audience: BillingOwnerAudience; readonly legalEntityId: string },
  options: ApiKeyGatewayContextClientOptions,
) => Effect.Effect<GatewayContextResponse, GatewayContextClientError>;
const issueGatewayContext: GatewayContextIssue = issueApiKeyGatewayContext;
const unavailable = (cause?: unknown) =>
  Object.defineProperty(
    new InvoiceUnavailable({
      code: 'billing_documents_unavailable',
      reason: 'A trusted owner-read credential could not be issued',
    }),
    'cause',
    { enumerable: false, value: cause },
  );
const unavailableIssuer = (cause?: unknown): BillingOwnerGatewayCredentialIssuer => ({
  issue: () => Effect.fail(unavailable(cause)),
});

export const makeBillingOwnerGatewayCredentialIssuer = (
  configured: { readonly apiKey: Redacted.Redacted; readonly baseUrl: URL },
  issue: GatewayContextIssue = issueGatewayContext,
): BillingOwnerGatewayCredentialIssuer => ({
  issue: ({ audience, legalEntityId, requestCorrelation }) =>
    issue(
      { audience, legalEntityId },
      { apiKey: configured.apiKey, baseUrl: configured.baseUrl, requestCorrelation },
    ).pipe(
      Effect.mapError(unavailable),
      Effect.map(({ token }) => Redacted.make(`Bearer ${token}`)),
    ),
});

export const billingOwnerGatewayCredentialLive = Layer.effect(
  BillingOwnerGatewayCredentialService,
  configuration.pipe(
    Effect.match({
      onFailure: unavailableIssuer,
      onSuccess: (configured) => makeBillingOwnerGatewayCredentialIssuer(configured),
    }),
  ),
);
