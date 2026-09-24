import { Effect, Match, Random } from 'effect';
import type { WorkforceFormInvalid } from './workforce-form-invalid.ts';
import type { executeWorkerList } from '../../../api/worker-list-client.ts';
import type { executeWorkerDetail } from '../../../api/worker-detail-client.ts';
import type { executeWeeklySchedule } from '../../../api/weekly-schedule-client.ts';
import type { executeAvailableWorkers } from '../../../api/available-workers-client.ts';
import type { executeWorkforceCommitStatus } from '../../../api/workforce-commit-status-client.ts';
import type { executeCreateWorker } from '../../../api/create-worker-action-client.ts';
import type { executeUpdateWorker } from '../../../api/update-worker-action-client.ts';
import type { executeChangeWorkerStatus } from '../../../api/change-worker-status-action-client.ts';
import type { executeAddAbsence } from '../../../api/add-absence-action-client.ts';
import type { executeRemoveAbsence } from '../../../api/remove-absence-action-client.ts';
import type { executeAssignWorker } from '../../../api/assign-worker-action-client.ts';
import type { executeUnassignWorker } from '../../../api/unassign-worker-action-client.ts';

export type ClientFailure = Effect.Error<
  | ReturnType<typeof executeWorkerList>
  | ReturnType<typeof executeWorkerDetail>
  | ReturnType<typeof executeWeeklySchedule>
  | ReturnType<typeof executeAvailableWorkers>
  | ReturnType<typeof executeWorkforceCommitStatus>
  | ReturnType<typeof executeCreateWorker>
  | ReturnType<typeof executeUpdateWorker>
  | ReturnType<typeof executeChangeWorkerStatus>
  | ReturnType<typeof executeAddAbsence>
  | ReturnType<typeof executeRemoveAbsence>
  | ReturnType<typeof executeAssignWorker>
  | ReturnType<typeof executeUnassignWorker>
>;
export interface WorkforceUiFailure {
  readonly invocationId?: string;
  readonly kind: string;
}
export const mapWorkforceFailure = (error: ClientFailure | WorkforceFormInvalid): WorkforceUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'WorkerListAuthenticationProblem',
      'WorkerDetailAuthenticationProblem',
      'WeeklyScheduleAuthenticationProblem',
      'AvailableWorkersAuthenticationProblem',
      'WorkforceCommitStatusAuthenticationProblem',
      'CreateWorkerActionAuthenticationProblem',
      'UpdateWorkerActionAuthenticationProblem',
      'ChangeWorkerStatusActionAuthenticationProblem',
      'AddAbsenceActionAuthenticationProblem',
      'RemoveAbsenceActionAuthenticationProblem',
      'AssignWorkerActionAuthenticationProblem',
      'UnassignWorkerActionAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => ({ kind: 'authentication' }),
    ),
    Match.tag(
      'WorkerListForbiddenProblem',
      'WorkerDetailForbiddenProblem',
      'WeeklyScheduleForbiddenProblem',
      'AvailableWorkersForbiddenProblem',
      'WorkforceCommitStatusForbiddenProblem',
      'CreateWorkerActionForbiddenProblem',
      'UpdateWorkerActionForbiddenProblem',
      'ChangeWorkerStatusActionForbiddenProblem',
      'AddAbsenceActionForbiddenProblem',
      'RemoveAbsenceActionForbiddenProblem',
      'AssignWorkerActionForbiddenProblem',
      'UnassignWorkerActionForbiddenProblem',
      'GatewayForbiddenProblem',
      () => ({ kind: 'forbidden' }),
    ),
    Match.tag(
      'WorkerListInternalProblem',
      'WorkerDetailInternalProblem',
      'WeeklyScheduleInternalProblem',
      'AvailableWorkersInternalProblem',
      'WorkforceCommitStatusInternalProblem',
      'CreateWorkerActionInternalProblem',
      'UpdateWorkerActionInternalProblem',
      'ChangeWorkerStatusActionInternalProblem',
      'AddAbsenceActionInternalProblem',
      'RemoveAbsenceActionInternalProblem',
      'AssignWorkerActionInternalProblem',
      'UnassignWorkerActionInternalProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      () => ({ kind: 'internal' }),
    ),
    Match.tag(
      'WorkerListNotFoundProblem',
      'WorkerDetailNotFoundProblem',
      'WeeklyScheduleNotFoundProblem',
      'AvailableWorkersNotFoundProblem',
      'WorkforceCommitStatusNotFoundProblem',
      'CreateWorkerActionNotFoundProblem',
      'UpdateWorkerActionNotFoundProblem',
      'ChangeWorkerStatusActionNotFoundProblem',
      'AddAbsenceActionNotFoundProblem',
      'RemoveAbsenceActionNotFoundProblem',
      'AssignWorkerActionNotFoundProblem',
      'UnassignWorkerActionNotFoundProblem',
      () => ({ kind: 'notFound' }),
    ),
    Match.tag(
      'WorkerListUnavailableProblem',
      'WorkerDetailUnavailableProblem',
      'WeeklyScheduleUnavailableProblem',
      'AvailableWorkersUnavailableProblem',
      'WorkforceCommitStatusUnavailableProblem',
      'CreateWorkerActionUnavailableProblem',
      'UpdateWorkerActionUnavailableProblem',
      'ChangeWorkerStatusActionUnavailableProblem',
      'AddAbsenceActionUnavailableProblem',
      'RemoveAbsenceActionUnavailableProblem',
      'AssignWorkerActionUnavailableProblem',
      'UnassignWorkerActionUnavailableProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'HttpClientError',
      'SchemaError',
      () => ({ kind: 'unavailable' }),
    ),
    Match.tag(
      'WorkerListInvalidProblem',
      'WorkerDetailInvalidProblem',
      'WeeklyScheduleInvalidProblem',
      'AvailableWorkersInvalidProblem',
      'WorkforceCommitStatusInvalidProblem',
      'CreateWorkerActionInvalidProblem',
      'UpdateWorkerActionInvalidProblem',
      'ChangeWorkerStatusActionInvalidProblem',
      'AddAbsenceActionInvalidProblem',
      'RemoveAbsenceActionInvalidProblem',
      'AssignWorkerActionInvalidProblem',
      'UnassignWorkerActionInvalidProblem',
      'WorkforceFormInvalid',
      () => ({ kind: 'validation' }),
    ),
    Match.tag(
      'WorkerListPolicyConflictProblem',
      'WorkerDetailPolicyConflictProblem',
      'WeeklySchedulePolicyConflictProblem',
      'AvailableWorkersPolicyConflictProblem',
      'WorkforceCommitStatusPolicyConflictProblem',
      'CreateWorkerActionConflictProblem',
      'UpdateWorkerActionConflictProblem',
      'ChangeWorkerStatusActionConflictProblem',
      'AddAbsenceActionConflictProblem',
      'RemoveAbsenceActionConflictProblem',
      'AssignWorkerActionConflictProblem',
      'UnassignWorkerActionConflictProblem',
      () => ({ kind: 'conflict' }),
    ),
    Match.tag(
      'WorkerListPolicyProblem',
      'WorkerDetailPolicyProblem',
      'WeeklySchedulePolicyProblem',
      'AvailableWorkersPolicyProblem',
      'WorkforceCommitStatusPolicyProblem',
      'CreateWorkerActionPreconditionProblem',
      'CreateWorkerActionIneligibleProblem',
      'UpdateWorkerActionPreconditionProblem',
      'UpdateWorkerActionIneligibleProblem',
      'ChangeWorkerStatusActionPreconditionProblem',
      'ChangeWorkerStatusActionIneligibleProblem',
      'AddAbsenceActionPreconditionProblem',
      'AddAbsenceActionIneligibleProblem',
      'RemoveAbsenceActionPreconditionProblem',
      'RemoveAbsenceActionIneligibleProblem',
      'AssignWorkerActionPreconditionProblem',
      'AssignWorkerActionIneligibleProblem',
      'UnassignWorkerActionPreconditionProblem',
      'UnassignWorkerActionIneligibleProblem',
      () => ({ kind: 'validation' }),
    ),
    Match.tag(
      'CreateWorkerActionAlreadyCommittedProblem',
      'UpdateWorkerActionAlreadyCommittedProblem',
      'ChangeWorkerStatusActionAlreadyCommittedProblem',
      'AddAbsenceActionAlreadyCommittedProblem',
      'RemoveAbsenceActionAlreadyCommittedProblem',
      'AssignWorkerActionAlreadyCommittedProblem',
      'UnassignWorkerActionAlreadyCommittedProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'committed' }),
    ),
    Match.tag(
      'CreateWorkerActionCommitIndeterminateProblem',
      'UpdateWorkerActionCommitIndeterminateProblem',
      'ChangeWorkerStatusActionCommitIndeterminateProblem',
      'AddAbsenceActionCommitIndeterminateProblem',
      'RemoveAbsenceActionCommitIndeterminateProblem',
      'AssignWorkerActionCommitIndeterminateProblem',
      'UnassignWorkerActionCommitIndeterminateProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'uncertain' }),
    ),
    Match.exhaustive,
  );
/** Fresh attempt identity; the UI retains it unchanged with a pending command. */
export const workforceCorrelation = Effect.forEach(Array.from({ length: 32 }), () => Random.nextIntBetween(0, 16), {
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
