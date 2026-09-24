import { ReadPermissionDenied, ReadHandlerNotFound, ReadPolicyDenied, ReadHandlerUnavailable } from '@app/core-runtime';
import { Match } from 'effect';
import type { WorkforceRejected, WorkforceUnavailable } from '../../shared/resources/workforce-failure.ts';

const mapRejected = (error: WorkforceRejected) => {
  if (error.code === 'not_found') {
    return new ReadHandlerNotFound({ code: 'read_handler_not_found', reason: 'Worker was not found' });
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

export const mapWorkforceReadFailure = (failure: WorkforceRejected | WorkforceUnavailable) =>
  Match.value(failure).pipe(
    Match.tag(
      'WorkforceUnavailable',
      () =>
        new ReadHandlerUnavailable({
          code: 'read_handler_unavailable',
          reason: 'Workforce or Jobs is temporarily unavailable',
        }),
    ),
    Match.tag('WorkforceRejected', mapRejected),
    Match.exhaustive,
  );
