import { ReadHandlerNotFound, ReadHandlerUnavailable, ReadPermissionDenied, ReadPolicyDenied } from '@app/core-runtime';
import { Match } from 'effect';
import type { JobExpenseRejected, JobExpenseUnavailable } from '../../shared/resources/job-expense-failure.ts';

const mapRejected = (error: JobExpenseRejected) => {
  if (error.code === 'not_found' || error.code === 'job_not_found') {
    return new ReadHandlerNotFound({ code: 'read_handler_not_found', reason: 'Job expense or Job was not found' });
  }
  if (error.code === 'scope_mismatch') {
    return new ReadPermissionDenied({ code: 'read_permission_denied', reason: 'Access is not permitted' });
  }
  return new ReadPolicyDenied({
    code: 'read_policy_denied',
    httpStatus: 422,
    policyReasonCode: error.code,
    reason: error.reason,
  });
};

export const mapJobExpenseReadFailure = (failure: JobExpenseRejected | JobExpenseUnavailable) =>
  Match.value(failure).pipe(
    Match.tag(
      'JobExpenseUnavailable',
      () =>
        new ReadHandlerUnavailable({
          code: 'read_handler_unavailable',
          reason: 'Job Expenses or Service Jobs is temporarily unavailable',
        }),
    ),
    Match.tag('JobExpenseRejected', mapRejected),
    Match.exhaustive,
  );
