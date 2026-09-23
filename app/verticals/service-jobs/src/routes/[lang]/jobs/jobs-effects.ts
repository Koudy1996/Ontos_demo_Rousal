import type { JobFormInvalid } from './job-form-invalid.ts';
import { Effect, Match, Random } from 'effect';
import type { executeJobList } from '../../../api/job-list-client.ts';
import type { executeJobDetail } from '../../../api/job-detail-client.ts';
import type { executeAcceptedSourceSelection } from '../../../api/accepted-source-selection-client.ts';
import type { executePartyDisplay } from '../../../api/party-display-client.ts';
import type { executeJobCommitStatus } from '../../../api/job-commit-status-client.ts';
import type { executeCreateServiceJob } from '../../../api/create-service-job-action-client.ts';
import type { executeScheduleServiceJob } from '../../../api/schedule-service-job-action-client.ts';
import type { executeUpdateExecution } from '../../../api/update-execution-action-client.ts';
import type { executeCompleteServiceJob } from '../../../api/complete-service-job-action-client.ts';
import type { executeStartServiceJob } from '../../../api/start-service-job-action-client.ts';
import { dependencyReadGateway, partyReadGateway } from '../../../api/dependency-read-gateway.ts';

export const withPartyRead = partyReadGateway.invoke;
export const withSalesRead = dependencyReadGateway.invoke;
type ClientFailure = Effect.Error<
  | ReturnType<typeof executeJobList>
  | ReturnType<typeof executeJobDetail>
  | ReturnType<typeof executeAcceptedSourceSelection>
  | ReturnType<typeof executePartyDisplay>
  | ReturnType<typeof executeJobCommitStatus>
  | ReturnType<typeof executeCreateServiceJob>
  | ReturnType<typeof executeScheduleServiceJob>
  | ReturnType<typeof executeUpdateExecution>
  | ReturnType<typeof executeCompleteServiceJob>
  | ReturnType<typeof executeStartServiceJob>
>;
export interface JobUiFailure {
  readonly invocationId?: string;
  readonly kind: string;
}
export const mapJobFailure = (error: ClientFailure | JobFormInvalid): JobUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'JobListAuthenticationProblem',
      'JobDetailAuthenticationProblem',
      'AcceptedSourceSelectionAuthenticationProblem',
      'PartyDisplayAuthenticationProblem',
      'JobCommitStatusAuthenticationProblem',
      'CreateServiceJobActionAuthenticationProblem',
      'ScheduleServiceJobActionAuthenticationProblem',
      'UpdateExecutionActionAuthenticationProblem',
      'StartServiceJobActionAuthenticationProblem',
      'CompleteServiceJobActionAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => ({ kind: 'authentication' }),
    ),
    Match.tag(
      'GatewayForbiddenProblem',
      'JobListForbiddenProblem',
      'JobDetailForbiddenProblem',
      'AcceptedSourceSelectionForbiddenProblem',
      'PartyDisplayForbiddenProblem',
      'JobCommitStatusForbiddenProblem',
      'CreateServiceJobActionForbiddenProblem',
      'ScheduleServiceJobActionForbiddenProblem',
      'UpdateExecutionActionForbiddenProblem',
      'StartServiceJobActionForbiddenProblem',
      'CompleteServiceJobActionForbiddenProblem',
      () => ({ kind: 'forbidden' }),
    ),
    Match.tag(
      'JobListInternalProblem',
      'JobDetailInternalProblem',
      'AcceptedSourceSelectionInternalProblem',
      'PartyDisplayInternalProblem',
      'JobCommitStatusInternalProblem',
      'CreateServiceJobActionInternalProblem',
      'ScheduleServiceJobActionInternalProblem',
      'UpdateExecutionActionInternalProblem',
      'StartServiceJobActionInternalProblem',
      'CompleteServiceJobActionInternalProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      () => ({ kind: 'internal' }),
    ),
    Match.tag(
      'JobListInvalidProblem',
      'JobListPolicyProblem',
      'JobDetailInvalidProblem',
      'JobDetailPolicyProblem',
      'AcceptedSourceSelectionInvalidProblem',
      'AcceptedSourceSelectionPolicyProblem',
      'PartyDisplayInvalidProblem',
      'PartyDisplayPolicyProblem',
      'JobCommitStatusInvalidProblem',
      'JobCommitStatusPolicyProblem',
      'CreateServiceJobActionInvalidProblem',
      'CreateServiceJobActionIneligibleProblem',
      'CreateServiceJobActionPreconditionProblem',
      'ScheduleServiceJobActionInvalidProblem',
      'ScheduleServiceJobActionIneligibleProblem',
      'ScheduleServiceJobActionPreconditionProblem',
      'UpdateExecutionActionInvalidProblem',
      'UpdateExecutionActionIneligibleProblem',
      'UpdateExecutionActionPreconditionProblem',
      'StartServiceJobActionInvalidProblem',
      'CompleteServiceJobActionInvalidProblem',
      'StartServiceJobActionIneligibleProblem',
      'CompleteServiceJobActionIneligibleProblem',
      'StartServiceJobActionPreconditionProblem',
      'CompleteServiceJobActionPreconditionProblem',
      'JobFormInvalid',
      () => ({ kind: 'validation' }),
    ),
    Match.tag(
      'JobListNotFoundProblem',
      'JobDetailNotFoundProblem',
      'AcceptedSourceSelectionNotFoundProblem',
      'PartyDisplayNotFoundProblem',
      'JobCommitStatusNotFoundProblem',
      'CreateServiceJobActionNotFoundProblem',
      'ScheduleServiceJobActionNotFoundProblem',
      'UpdateExecutionActionNotFoundProblem',
      'StartServiceJobActionNotFoundProblem',
      'CompleteServiceJobActionNotFoundProblem',
      () => ({ kind: 'notFound' }),
    ),
    Match.tag(
      'JobListPolicyConflictProblem',
      'JobDetailPolicyConflictProblem',
      'AcceptedSourceSelectionPolicyConflictProblem',
      'PartyDisplayPolicyConflictProblem',
      'JobCommitStatusPolicyConflictProblem',
      'CreateServiceJobActionConflictProblem',
      'ScheduleServiceJobActionConflictProblem',
      'UpdateExecutionActionConflictProblem',
      'StartServiceJobActionConflictProblem',
      'CompleteServiceJobActionConflictProblem',
      () => ({ kind: 'conflict' }),
    ),
    Match.tag(
      'JobListUnavailableProblem',
      'JobDetailUnavailableProblem',
      'AcceptedSourceSelectionUnavailableProblem',
      'PartyDisplayUnavailableProblem',
      'JobCommitStatusUnavailableProblem',
      'CreateServiceJobActionUnavailableProblem',
      'ScheduleServiceJobActionUnavailableProblem',
      'UpdateExecutionActionUnavailableProblem',
      'StartServiceJobActionUnavailableProblem',
      'CompleteServiceJobActionUnavailableProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'HttpClientError',
      () => ({ kind: 'unavailable' }),
    ),
    Match.tag(
      'CreateServiceJobActionAlreadyCommittedProblem',
      'ScheduleServiceJobActionAlreadyCommittedProblem',
      'UpdateExecutionActionAlreadyCommittedProblem',
      'StartServiceJobActionAlreadyCommittedProblem',
      'CompleteServiceJobActionAlreadyCommittedProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'committed' }),
    ),
    Match.tag(
      'CreateServiceJobActionCommitIndeterminateProblem',
      'ScheduleServiceJobActionCommitIndeterminateProblem',
      'UpdateExecutionActionCommitIndeterminateProblem',
      'StartServiceJobActionCommitIndeterminateProblem',
      'CompleteServiceJobActionCommitIndeterminateProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'uncertain' }),
    ),
    Match.tag('SchemaError', () => ({ kind: 'unavailable' })),
    Match.exhaustive,
  );

/** Fresh attempt identity; the UI retains it unchanged with a pending command. */
export const jobCorrelation = Effect.forEach(Array.from({ length: 32 }), () => Random.nextIntBetween(0, 16), {
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
