import { Effect, Match, Random } from 'effect';
import type { executeBillingDocumentsCommitStatus } from '../../../api/billing-documents-commit-status-client.ts';
import type { executeCreateInvoiceDraft } from '../../../api/create-invoice-draft-action-client.ts';
import type { executeInvoiceDetail } from '../../../api/invoice-detail-client.ts';
import type { executeInvoiceDraftSupport } from '../../../api/invoice-draft-support-client.ts';
import type { executeInvoiceList } from '../../../api/invoice-list-client.ts';
import type { executeInvoiceableJobs } from '../../../api/invoiceable-jobs-client.ts';
import type { executeIssueInvoice } from '../../../api/issue-invoice-action-client.ts';
import type { executeUpdateInvoiceDraft } from '../../../api/update-invoice-draft-action-client.ts';

export type ClientFailure = Effect.Error<
  | ReturnType<typeof executeBillingDocumentsCommitStatus>
  | ReturnType<typeof executeCreateInvoiceDraft>
  | ReturnType<typeof executeInvoiceDetail>
  | ReturnType<typeof executeInvoiceDraftSupport>
  | ReturnType<typeof executeInvoiceList>
  | ReturnType<typeof executeInvoiceableJobs>
  | ReturnType<typeof executeIssueInvoice>
  | ReturnType<typeof executeUpdateInvoiceDraft>
>;

export interface BillingDocumentsUiFailure {
  readonly invocationId?: string;
  readonly kind:
    | 'authentication'
    | 'committed'
    | 'conflict'
    | 'forbidden'
    | 'notFound'
    | 'uncertain'
    | 'unavailable'
    | 'validation';
}

export const mapBillingDocumentsFailure = (error: ClientFailure): BillingDocumentsUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'BillingDocumentsCommitStatusAuthenticationProblem',
      'CreateInvoiceDraftActionAuthenticationProblem',
      'InvoiceDraftSupportAuthenticationProblem',
      'InvoiceDetailAuthenticationProblem',
      'InvoiceListAuthenticationProblem',
      'InvoiceableJobsAuthenticationProblem',
      'IssueInvoiceActionAuthenticationProblem',
      'UpdateInvoiceDraftActionAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => ({ kind: 'authentication' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusForbiddenProblem',
      'CreateInvoiceDraftActionForbiddenProblem',
      'InvoiceDraftSupportForbiddenProblem',
      'InvoiceDetailForbiddenProblem',
      'InvoiceListForbiddenProblem',
      'InvoiceableJobsForbiddenProblem',
      'IssueInvoiceActionForbiddenProblem',
      'UpdateInvoiceDraftActionForbiddenProblem',
      'GatewayForbiddenProblem',
      () => ({ kind: 'forbidden' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusNotFoundProblem',
      'CreateInvoiceDraftActionNotFoundProblem',
      'InvoiceDraftSupportNotFoundProblem',
      'InvoiceDetailNotFoundProblem',
      'InvoiceListNotFoundProblem',
      'InvoiceableJobsNotFoundProblem',
      'IssueInvoiceActionNotFoundProblem',
      'UpdateInvoiceDraftActionNotFoundProblem',
      () => ({ kind: 'notFound' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusUnavailableProblem',
      'CreateInvoiceDraftActionUnavailableProblem',
      'InvoiceDraftSupportUnavailableProblem',
      'InvoiceDetailUnavailableProblem',
      'InvoiceListUnavailableProblem',
      'InvoiceableJobsUnavailableProblem',
      'IssueInvoiceActionUnavailableProblem',
      'UpdateInvoiceDraftActionUnavailableProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'HttpClientError',
      'SchemaError',
      () => ({ kind: 'unavailable' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusInvalidProblem',
      'CreateInvoiceDraftActionInvalidProblem',
      'InvoiceDraftSupportInvalidProblem',
      'InvoiceDetailInvalidProblem',
      'InvoiceListInvalidProblem',
      'InvoiceableJobsInvalidProblem',
      'IssueInvoiceActionInvalidProblem',
      'UpdateInvoiceDraftActionInvalidProblem',
      () => ({ kind: 'validation' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusPolicyConflictProblem',
      'CreateInvoiceDraftActionConflictProblem',
      'InvoiceDraftSupportPolicyConflictProblem',
      'InvoiceDetailPolicyConflictProblem',
      'InvoiceListPolicyConflictProblem',
      'InvoiceableJobsPolicyConflictProblem',
      'IssueInvoiceActionConflictProblem',
      'UpdateInvoiceDraftActionConflictProblem',
      () => ({ kind: 'conflict' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusPolicyProblem',
      'CreateInvoiceDraftActionIneligibleProblem',
      'CreateInvoiceDraftActionPreconditionProblem',
      'InvoiceDraftSupportPolicyProblem',
      'InvoiceDetailPolicyProblem',
      'InvoiceListPolicyProblem',
      'InvoiceableJobsPolicyProblem',
      'IssueInvoiceActionIneligibleProblem',
      'IssueInvoiceActionPreconditionProblem',
      'UpdateInvoiceDraftActionIneligibleProblem',
      'UpdateInvoiceDraftActionPreconditionProblem',
      () => ({ kind: 'validation' as const }),
    ),
    Match.tag(
      'BillingDocumentsCommitStatusInternalProblem',
      'CreateInvoiceDraftActionInternalProblem',
      'InvoiceDraftSupportInternalProblem',
      'InvoiceDetailInternalProblem',
      'InvoiceListInternalProblem',
      'InvoiceableJobsInternalProblem',
      'IssueInvoiceActionInternalProblem',
      'UpdateInvoiceDraftActionInternalProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      () => ({ kind: 'unavailable' as const }),
    ),
    Match.tag(
      'CreateInvoiceDraftActionAlreadyCommittedProblem',
      'IssueInvoiceActionAlreadyCommittedProblem',
      'UpdateInvoiceDraftActionAlreadyCommittedProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'committed' as const }),
    ),
    Match.tag(
      'CreateInvoiceDraftActionCommitIndeterminateProblem',
      'IssueInvoiceActionCommitIndeterminateProblem',
      'UpdateInvoiceDraftActionCommitIndeterminateProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'uncertain' as const }),
    ),
    Match.exhaustive,
  );

export const billingDocumentsCorrelation = Effect.forEach(
  Array.from({ length: 32 }),
  () => Random.nextIntBetween(0, 16),
  { concurrency: 1 },
).pipe(
  Effect.map((digits) =>
    digits
      .map((digit, index) => {
        let value = digit;
        if (index === 12) {
          value = 4;
        }
        if (index === 16) {
          value = (digit % 4) + 8;
        }
        return `${[8, 12, 16, 20].includes(index) ? '-' : ''}${value.toString(16)}`;
      })
      .join(''),
  ),
);
