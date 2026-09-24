import type { EffectBffRequestContext } from '@app/shared-contracts/client-runtime';
import { makeEffectBffClient } from '@app/shared-contracts/client-runtime';
import { Effect, makeEffectHttpApiClient } from '@modern-js/bff-effect/effect-client';
import type {
  HttpApi,
  HttpApiClient,
  HttpApiGroup,
  HttpClientError,
  Schema,
} from '@modern-js/bff-effect/effect-client';
import {
  billingDocumentsApi,
  billingDocumentsApiContract,
  billingDocumentsFoundationApi,
  billingDocumentsOperationContexts,
} from '../../shared/api.ts';
import type { BillingDocumentsReadiness } from '../../shared/api.ts';

// <generated-action-http-client-exports>
export {
  executeCreateInvoiceDraft,
  executeCreateInvoiceDraftWithAuthorization,
} from './create-invoice-draft-action-client.ts';
export { executeIssueInvoice, executeIssueInvoiceWithAuthorization } from './issue-invoice-action-client.ts';
export {
  executeUpdateInvoiceDraft,
  executeUpdateInvoiceDraftWithAuthorization,
} from './update-invoice-draft-action-client.ts';
// </generated-action-http-client-exports>

export {
  executeBillingDocumentsCommitStatus,
  executeBillingDocumentsCommitStatusWithAuthorization,
} from './billing-documents-commit-status-client.ts';
export { executeInvoiceDetail, executeInvoiceDetailWithAuthorization } from './invoice-detail-client.ts';
export {
  executeInvoiceDraftSupport,
  executeInvoiceDraftSupportWithAuthorization,
} from './invoice-draft-support-client.ts';
export { executeInvoiceList, executeInvoiceListWithAuthorization } from './invoice-list-client.ts';
export { executeInvoiceableJobs, executeInvoiceableJobsWithAuthorization } from './invoiceable-jobs-client.ts';

type BillingDocumentsApiGroups =
  typeof billingDocumentsApi extends HttpApi.HttpApi<infer _ApiId, infer Groups> ? Groups : never;

export type BillingDocumentsClient = HttpApiClient.Client<Extract<BillingDocumentsApiGroups, HttpApiGroup.Constraint>>;
export type BillingDocumentsClientError = HttpClientError.HttpClientError | Schema.SchemaError;
export type BillingDocumentsClientEffect<Success> = Effect.Effect<Success, BillingDocumentsClientError>;
export type BillingDocumentsClientOptions = EffectBffRequestContext & { readonly baseUrl?: string | URL };

export const createBillingDocumentsClient = (
  options: BillingDocumentsClientOptions = {},
): BillingDocumentsClientEffect<BillingDocumentsClient> => {
  const { baseUrl, ...requestContext } = options;
  return makeEffectBffClient({
    api: billingDocumentsApi,
    baseUrl: baseUrl ?? billingDocumentsApiContract.apiPrefix,
    defaultApiPrefix: billingDocumentsApiContract.apiPrefix,
    requestContext,
  });
};

// The public deployment readiness endpoint has no user credentials or mutable request context.
const readinessClient = makeEffectHttpApiClient(billingDocumentsFoundationApi, {
  baseUrl: billingDocumentsApiContract.apiPrefix,
  requestContext: { operationContext: billingDocumentsOperationContexts.readiness },
});
export const getBillingDocumentsReadiness: BillingDocumentsClientEffect<BillingDocumentsReadiness> =
  readinessClient.pipe(Effect.flatMap((client) => client.foundation.readiness({})));
