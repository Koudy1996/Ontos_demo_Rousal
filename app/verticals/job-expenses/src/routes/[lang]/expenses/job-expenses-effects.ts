import { Effect, Match, Random } from 'effect';
import type { executeJobEconomics } from '../../../api/job-economics-client.ts';
import type { executeJobExpenseList } from '../../../api/job-expense-list-client.ts';
import type { executeJobExpensesCommitStatus } from '../../../api/job-expenses-commit-status-client.ts';
import type { executeJobSelection } from '../../../api/job-selection-client.ts';
import type { executeRecordJobExpense } from '../../../api/record-job-expense-action-client.ts';
import type { executeUpdateJobExpense } from '../../../api/update-job-expense-action-client.ts';
import type { executeVoidJobExpense } from '../../../api/void-job-expense-action-client.ts';
import type { JobExpensesFormInvalid } from './job-expenses-form-invalid.ts';

export type ClientFailure = Effect.Error<
  | ReturnType<typeof executeJobEconomics>
  | ReturnType<typeof executeJobExpenseList>
  | ReturnType<typeof executeJobExpensesCommitStatus>
  | ReturnType<typeof executeJobSelection>
  | ReturnType<typeof executeRecordJobExpense>
  | ReturnType<typeof executeUpdateJobExpense>
  | ReturnType<typeof executeVoidJobExpense>
>;

export interface JobExpensesUiFailure {
  readonly invocationId?: string;
  readonly kind:
    | 'authentication'
    | 'committed'
    | 'conflict'
    | 'forbidden'
    | 'internal'
    | 'notFound'
    | 'uncertain'
    | 'unavailable'
    | 'validation';
}

export const mapJobExpensesFailure = (error: ClientFailure | JobExpensesFormInvalid): JobExpensesUiFailure =>
  Match.value(error).pipe(
    Match.tag(
      'JobEconomicsAuthenticationProblem',
      'JobExpenseListAuthenticationProblem',
      'JobExpensesCommitStatusAuthenticationProblem',
      'JobSelectionAuthenticationProblem',
      'RecordJobExpenseActionAuthenticationProblem',
      'UpdateJobExpenseActionAuthenticationProblem',
      'VoidJobExpenseActionAuthenticationProblem',
      'GatewayAuthenticationRequiredProblem',
      () => ({ kind: 'authentication' as const }),
    ),
    Match.tag(
      'JobEconomicsForbiddenProblem',
      'JobExpenseListForbiddenProblem',
      'JobExpensesCommitStatusForbiddenProblem',
      'JobSelectionForbiddenProblem',
      'RecordJobExpenseActionForbiddenProblem',
      'UpdateJobExpenseActionForbiddenProblem',
      'VoidJobExpenseActionForbiddenProblem',
      'GatewayForbiddenProblem',
      () => ({ kind: 'forbidden' as const }),
    ),
    Match.tag(
      'JobEconomicsNotFoundProblem',
      'JobExpenseListNotFoundProblem',
      'JobExpensesCommitStatusNotFoundProblem',
      'JobSelectionNotFoundProblem',
      'RecordJobExpenseActionNotFoundProblem',
      'UpdateJobExpenseActionNotFoundProblem',
      'VoidJobExpenseActionNotFoundProblem',
      () => ({ kind: 'notFound' as const }),
    ),
    Match.tag(
      'JobEconomicsUnavailableProblem',
      'JobExpenseListUnavailableProblem',
      'JobExpensesCommitStatusUnavailableProblem',
      'JobSelectionUnavailableProblem',
      'RecordJobExpenseActionUnavailableProblem',
      'UpdateJobExpenseActionUnavailableProblem',
      'VoidJobExpenseActionUnavailableProblem',
      'GatewayRateLimitedProblem',
      'GatewayUnavailableProblem',
      'HttpClientError',
      'SchemaError',
      () => ({ kind: 'unavailable' as const }),
    ),
    Match.tag(
      'JobEconomicsInvalidProblem',
      'JobExpenseListInvalidProblem',
      'JobExpensesCommitStatusInvalidProblem',
      'JobSelectionInvalidProblem',
      'RecordJobExpenseActionInvalidProblem',
      'UpdateJobExpenseActionInvalidProblem',
      'VoidJobExpenseActionInvalidProblem',
      'JobExpensesFormInvalid',
      () => ({ kind: 'validation' as const }),
    ),
    Match.tag(
      'JobEconomicsPolicyConflictProblem',
      'JobExpenseListPolicyConflictProblem',
      'JobExpensesCommitStatusPolicyConflictProblem',
      'JobSelectionPolicyConflictProblem',
      'RecordJobExpenseActionConflictProblem',
      'UpdateJobExpenseActionConflictProblem',
      'VoidJobExpenseActionConflictProblem',
      () => ({ kind: 'conflict' as const }),
    ),
    Match.tag(
      'JobEconomicsPolicyProblem',
      'JobExpenseListPolicyProblem',
      'JobExpensesCommitStatusPolicyProblem',
      'JobSelectionPolicyProblem',
      'RecordJobExpenseActionPreconditionProblem',
      'RecordJobExpenseActionIneligibleProblem',
      'UpdateJobExpenseActionPreconditionProblem',
      'UpdateJobExpenseActionIneligibleProblem',
      'VoidJobExpenseActionPreconditionProblem',
      'VoidJobExpenseActionIneligibleProblem',
      () => ({ kind: 'validation' as const }),
    ),
    Match.tag(
      'JobEconomicsInternalProblem',
      'JobExpenseListInternalProblem',
      'JobExpensesCommitStatusInternalProblem',
      'JobSelectionInternalProblem',
      'RecordJobExpenseActionInternalProblem',
      'UpdateJobExpenseActionInternalProblem',
      'VoidJobExpenseActionInternalProblem',
      'GatewayAudienceInvalidProblem',
      'GatewayInternalProblem',
      () => ({ kind: 'internal' as const }),
    ),
    Match.tag(
      'RecordJobExpenseActionAlreadyCommittedProblem',
      'UpdateJobExpenseActionAlreadyCommittedProblem',
      'VoidJobExpenseActionAlreadyCommittedProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'committed' as const }),
    ),
    Match.tag(
      'RecordJobExpenseActionCommitIndeterminateProblem',
      'UpdateJobExpenseActionCommitIndeterminateProblem',
      'VoidJobExpenseActionCommitIndeterminateProblem',
      (failure) => ({ invocationId: failure.invocationId, kind: 'uncertain' as const }),
    ),
    Match.exhaustive,
  );

export const jobExpensesCorrelation = Effect.forEach(Array.from({ length: 32 }), () => Random.nextIntBetween(0, 16), {
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
