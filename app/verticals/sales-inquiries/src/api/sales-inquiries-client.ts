import type { EffectBffRequestContext } from '@app/shared-contracts/client-runtime';

import { Effect, makeEffectHttpApiClient } from '@modern-js/bff-effect/effect-client';
import { makeEffectBffClient } from '@app/shared-contracts/client-runtime';
import type {
  HttpClientError,
  HttpApi,
  HttpApiClient,
  HttpApiGroup,
  Schema,
} from '@modern-js/bff-effect/effect-client';

import {
  salesInquiriesApiContract,
  salesInquiriesApi,
  salesInquiriesFoundationApi,
  salesInquiriesOperationContexts,
} from '../../shared/api.ts';
import type { SalesInquiriesReadiness } from '../../shared/api.ts';

export { executeAcceptedOfferHandoffWithAuthorization } from './accepted-offer-handoff-client.ts';
export { executeInquiryListWithAuthorization } from './inquiry-list-client.ts';
// <generated-action-http-client-exports>
export { executeCreateInquiry, executeCreateInquiryWithAuthorization } from './create-inquiry-action-client.ts';
export {
  executeTransitionInquiry,
  executeTransitionInquiryWithAuthorization,
} from './transition-inquiry-action-client.ts';
export {
  executeUpdateInquiryDetails,
  executeUpdateInquiryDetailsWithAuthorization,
} from './update-inquiry-details-action-client.ts';
export {
  executeUpdateOfferDraft,
  executeUpdateOfferDraftWithAuthorization,
} from './update-offer-draft-action-client.ts';
// </generated-action-http-client-exports>

type SalesInquiriesApiGroups =
  typeof salesInquiriesApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type SalesInquiriesClient = HttpApiClient.Client<Extract<SalesInquiriesApiGroups, HttpApiGroup.Constraint>>;

export type SalesInquiriesClientError = HttpClientError.HttpClientError | Schema.SchemaError;

export type SalesInquiriesClientEffect<Success> = Effect.Effect<Success, SalesInquiriesClientError>;

export type SalesInquiriesClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };
export const createSalesInquiriesClient = (
  options: SalesInquiriesClientOptions = {},
): SalesInquiriesClientEffect<SalesInquiriesClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: salesInquiriesApi,
    baseUrl: baseUrl ?? salesInquiriesApiContract.apiPrefix,
    defaultApiPrefix: salesInquiriesApiContract.apiPrefix,
    requestContext,
  });
};

// The public deployment readiness endpoint has no user credentials or mutable request context.
const readinessClient = makeEffectHttpApiClient(salesInquiriesFoundationApi, {
  baseUrl: salesInquiriesApiContract.apiPrefix,
  requestContext: { operationContext: salesInquiriesOperationContexts.readiness },
});
export const getSalesInquiriesReadiness: SalesInquiriesClientEffect<SalesInquiriesReadiness> = readinessClient.pipe(
  Effect.flatMap((client) => client.foundation.readiness({})),
);
