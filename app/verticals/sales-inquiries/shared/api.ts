import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import {
  MicroVerticalBuildMarkerSchema,
  MicroVerticalReadinessSchema,
  createMicroVerticalOperationContext,
} from '@modern-js/bff-effect/microvertical-api';
import type { MicroVerticalReadiness, MicroVerticalOperationContext } from '@modern-js/bff-effect/microvertical-api';
import { CreateInquiryActionApi } from './apis/create-inquiry-action.ts';
import { InquiryCommitStatusApi } from './apis/inquiry-commit-status.ts';
import { InquiryDetailApi } from './apis/inquiry-detail.ts';
import { InquiryListApi } from './apis/inquiry-list.ts';
import { PartyDisplayApi } from './apis/party-display.ts';
import { PartySelectionApi } from './apis/party-selection.ts';
import { TransitionInquiryActionApi } from './apis/transition-inquiry-action.ts';
import { UpdateInquiryDetailsActionApi } from './apis/update-inquiry-details-action.ts';
import { UpdateOfferDraftActionApi } from './apis/update-offer-draft-action.ts';
import { identity } from 'effect';

export type SalesInquiriesReadiness = MicroVerticalReadiness;
export const salesInquiriesMarkerSchema = MicroVerticalBuildMarkerSchema;
export const salesInquiriesReadinessSchema = Schema.Struct({
  ...MicroVerticalReadinessSchema.fields,
  marker: salesInquiriesMarkerSchema,
});

export type OperationContext = MicroVerticalOperationContext;

export const salesInquiriesFoundationApi = HttpApi.make('SalesInquiriesApiFoundation').add(
  HttpApiGroup.make('foundation').add(
    HttpApiEndpoint.get('readiness', '/sales-inquiries/readiness', { success: salesInquiriesReadinessSchema }),
  ),
);
// <generated-governed-http-api-imports>
// </generated-governed-http-api-imports>

export const salesInquiriesApi = HttpApi.make('SalesInquiriesApi')
  .addHttpApi(salesInquiriesFoundationApi)
  // <generated-governed-http-api-additions>
  .addHttpApi(CreateInquiryActionApi)
  .addHttpApi(InquiryCommitStatusApi)
  .addHttpApi(InquiryDetailApi)
  .addHttpApi(InquiryListApi)
  .addHttpApi(PartyDisplayApi)
  .addHttpApi(PartySelectionApi)
  .addHttpApi(TransitionInquiryActionApi)
  .addHttpApi(UpdateInquiryDetailsActionApi)
  .addHttpApi(UpdateOfferDraftActionApi)
  // </generated-governed-http-api-additions>
  .pipe(identity);

export const salesInquiriesOperationContexts = {
  readiness: createMicroVerticalOperationContext({
    method: 'GET',
    operationId: 'SalesInquiriesApi:salesInquiries:readiness',
    routePath: '/sales-inquiries/readiness',
  }),
} satisfies Record<string, OperationContext>;

export const salesInquiriesApiContract = {
  apiPrefix: '/sales-inquiries-api',
  basePath: '/sales-inquiries-api/sales-inquiries',
  ownerId: 'sales-inquiries',
  readinessPath: '/sales-inquiries-api/sales-inquiries/readiness',
} as const;
