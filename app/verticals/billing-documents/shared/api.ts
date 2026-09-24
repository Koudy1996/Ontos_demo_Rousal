// <generated-governed-http-api-imports>
import { BillingDocumentsCommitStatusApi } from './apis/billing-documents-commit-status.ts';
import { CreateInvoiceDraftActionApi } from './apis/create-invoice-draft-action.ts';
import { InvoiceableJobsApi } from './apis/invoiceable-jobs.ts';
import { InvoiceDetailApi } from './apis/invoice-detail.ts';
import { InvoiceDraftSupportApi } from './apis/invoice-draft-support.ts';
import { InvoiceListApi } from './apis/invoice-list.ts';
import { IssueInvoiceActionApi } from './apis/issue-invoice-action.ts';
import { UpdateInvoiceDraftActionApi } from './apis/update-invoice-draft-action.ts';
// </generated-governed-http-api-imports>
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalOperationContext, MicroVerticalReadiness } from '@modern-js/bff-effect/microvertical-api';
import { identity } from 'effect';

export type BillingDocumentsReadiness = MicroVerticalReadiness;
export const billingDocumentsMarkerSchema = MicroVerticalBuildMarkerSchema;
export const billingDocumentsReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: billingDocumentsMarkerSchema,
});
export type OperationContext = MicroVerticalOperationContext;

export const billingDocumentsFoundationApi = HttpApi.make('BillingDocumentsApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/billing-documents/readiness', { success: billingDocumentsReadinessSchema }),
  ),
);
export const billingDocumentsApi = HttpApi.make('BillingDocumentsApi')
  .addHttpApi(billingDocumentsFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(BillingDocumentsCommitStatusApi)
  .addHttpApi(CreateInvoiceDraftActionApi)
  .addHttpApi(InvoiceableJobsApi)
  .addHttpApi(InvoiceDetailApi)
  .addHttpApi(InvoiceDraftSupportApi)
  .addHttpApi(InvoiceListApi)
  .addHttpApi(IssueInvoiceActionApi)
  .addHttpApi(UpdateInvoiceDraftActionApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const billingDocumentsOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'BillingDocumentsApi:billingDocuments:readiness',
    routePath: '/billing-documents/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const billingDocumentsApiContract = {
  apiPrefix: '/billing-documents-api',
  basePath: '/billing-documents-api/billing-documents',
  ownerId: 'billing-documents',
  readinessPath: '/billing-documents-api/billing-documents/readiness',
} as const;
