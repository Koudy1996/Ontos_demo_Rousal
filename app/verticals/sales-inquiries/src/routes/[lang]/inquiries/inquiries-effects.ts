import type { InquiryFormInvalid } from './inquiry-form-invalid.ts';
import { Effect, Match, Random } from 'effect';
import type { executeInquiryList } from '../../../api/inquiry-list-client.ts';
import type { executeInquiryDetail } from '../../../api/inquiry-detail-client.ts';
import type { executePartySelection } from '../../../api/party-selection-client.ts';
import type { executePartyDisplay } from '../../../api/party-display-client.ts';
import type { executeInquiryCommitStatus } from '../../../api/inquiry-commit-status-client.ts';
import type { executeCreateInquiry } from '../../../api/create-inquiry-action-client.ts';
import type { executeUpdateInquiryDetails } from '../../../api/update-inquiry-details-action-client.ts';
import type { executeUpdateOfferDraft } from '../../../api/update-offer-draft-action-client.ts';
import type { executeTransitionInquiry } from '../../../api/transition-inquiry-action-client.ts';
import { dependencyReadGateway } from '../../../api/dependency-read-gateway.ts';

export const withPartyRead = dependencyReadGateway.invoke;
type ClientFailure = Effect.Error<
  | ReturnType<typeof executeInquiryList>
  | ReturnType<typeof executeInquiryDetail>
  | ReturnType<typeof executePartySelection>
  | ReturnType<typeof executePartyDisplay>
  | ReturnType<typeof executeInquiryCommitStatus>
  | ReturnType<typeof executeCreateInquiry>
  | ReturnType<typeof executeUpdateInquiryDetails>
  | ReturnType<typeof executeUpdateOfferDraft>
  | ReturnType<typeof executeTransitionInquiry>
>;
export interface InquiryUiFailure {
  readonly invocationId?: string;
  readonly kind: string;
}
export const mapInquiryFailure = (error: ClientFailure | InquiryFormInvalid): InquiryUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'InquiryListAuthenticationProblem',
      'InquiryDetailAuthenticationProblem',
      'PartySelectionAuthenticationProblem',
      'PartyDisplayAuthenticationProblem',
      'InquiryCommitStatusAuthenticationProblem',
      'CreateInquiryActionAuthenticationProblem',
      'UpdateInquiryDetailsActionAuthenticationProblem',
      'UpdateOfferDraftActionAuthenticationProblem',
      'TransitionInquiryActionAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => ({ kind: 'authentication' }),
    ),
    Match.tag(
      'GatewayForbiddenProblem',
      'InquiryListForbiddenProblem',
      'InquiryDetailForbiddenProblem',
      'PartySelectionForbiddenProblem',
      'PartyDisplayForbiddenProblem',
      'InquiryCommitStatusForbiddenProblem',
      'CreateInquiryActionForbiddenProblem',
      'UpdateInquiryDetailsActionForbiddenProblem',
      'UpdateOfferDraftActionForbiddenProblem',
      'TransitionInquiryActionForbiddenProblem',
      () => ({ kind: 'forbidden' }),
    ),
    Match.tag(
      'InquiryListInternalProblem',
      'InquiryDetailInternalProblem',
      'PartySelectionInternalProblem',
      'PartyDisplayInternalProblem',
      'InquiryCommitStatusInternalProblem',
      'CreateInquiryActionInternalProblem',
      'UpdateInquiryDetailsActionInternalProblem',
      'UpdateOfferDraftActionInternalProblem',
      'TransitionInquiryActionInternalProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      () => ({ kind: 'internal' }),
    ),
    Match.tag(
      'InquiryListInvalidProblem',
      'InquiryListPolicyProblem',
      'InquiryDetailInvalidProblem',
      'InquiryDetailPolicyProblem',
      'PartySelectionInvalidProblem',
      'PartySelectionPolicyProblem',
      'PartyDisplayInvalidProblem',
      'PartyDisplayPolicyProblem',
      'InquiryCommitStatusInvalidProblem',
      'InquiryCommitStatusPolicyProblem',
      'CreateInquiryActionInvalidProblem',
      'CreateInquiryActionIneligibleProblem',
      'CreateInquiryActionPreconditionProblem',
      'UpdateInquiryDetailsActionInvalidProblem',
      'UpdateInquiryDetailsActionIneligibleProblem',
      'UpdateInquiryDetailsActionPreconditionProblem',
      'UpdateOfferDraftActionInvalidProblem',
      'UpdateOfferDraftActionIneligibleProblem',
      'UpdateOfferDraftActionPreconditionProblem',
      'TransitionInquiryActionInvalidProblem',
      'TransitionInquiryActionIneligibleProblem',
      'TransitionInquiryActionPreconditionProblem',
      'InquiryFormInvalid',
      () => ({ kind: 'validation' }),
    ),
    Match.tag(
      'InquiryListNotFoundProblem',
      'InquiryDetailNotFoundProblem',
      'PartySelectionNotFoundProblem',
      'PartyDisplayNotFoundProblem',
      'InquiryCommitStatusNotFoundProblem',
      'CreateInquiryActionNotFoundProblem',
      'UpdateInquiryDetailsActionNotFoundProblem',
      'UpdateOfferDraftActionNotFoundProblem',
      'TransitionInquiryActionNotFoundProblem',
      () => ({ kind: 'notFound' }),
    ),
    Match.tag(
      'InquiryListPolicyConflictProblem',
      'InquiryDetailPolicyConflictProblem',
      'PartySelectionPolicyConflictProblem',
      'PartyDisplayPolicyConflictProblem',
      'InquiryCommitStatusPolicyConflictProblem',
      'CreateInquiryActionConflictProblem',
      'UpdateInquiryDetailsActionConflictProblem',
      'UpdateOfferDraftActionConflictProblem',
      'TransitionInquiryActionConflictProblem',
      () => ({ kind: 'conflict' }),
    ),
    Match.tag(
      'InquiryListUnavailableProblem',
      'InquiryDetailUnavailableProblem',
      'PartySelectionUnavailableProblem',
      'PartyDisplayUnavailableProblem',
      'InquiryCommitStatusUnavailableProblem',
      'CreateInquiryActionUnavailableProblem',
      'UpdateInquiryDetailsActionUnavailableProblem',
      'UpdateOfferDraftActionUnavailableProblem',
      'TransitionInquiryActionUnavailableProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'HttpClientError',
      () => ({ kind: 'unavailable' }),
    ),
    Match.tag(
      'CreateInquiryActionAlreadyCommittedProblem',
      'UpdateInquiryDetailsActionAlreadyCommittedProblem',
      'UpdateOfferDraftActionAlreadyCommittedProblem',
      'TransitionInquiryActionAlreadyCommittedProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'committed' }),
    ),
    Match.tag(
      'CreateInquiryActionCommitIndeterminateProblem',
      'UpdateInquiryDetailsActionCommitIndeterminateProblem',
      'UpdateOfferDraftActionCommitIndeterminateProblem',
      'TransitionInquiryActionCommitIndeterminateProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'uncertain' }),
    ),
    Match.tag('SchemaError', () => ({ kind: 'unavailable' })),
    Match.exhaustive,
  );

/** Fresh attempt identity; the UI retains it unchanged with a pending command. */
export const inquiryCorrelation = Effect.forEach(Array.from({ length: 32 }), () => Random.nextIntBetween(0, 16), {
  concurrency: 1,
}).pipe(
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
