import {
  OperationAuthenticationRequired,
  ReadPermissionDenied,
  ReadHandlerNotFound,
  ReadInputValidationError,
  ReadHandlerExecutionError,
  ReadPolicyDenied,
  ReadHandlerUnavailable,
} from '@app/core-runtime';
import { Match } from 'effect';
import type { InquiryRejected, InquiryUnavailable, InquiryPartyFailure } from '../../shared/resources/sales-inquiry.ts';

const partyReadFailure = (failure: InquiryPartyFailure) =>
  Match.value(failure.code).pipe(
    Match.when(
      'authentication',
      () => new OperationAuthenticationRequired({ code: 'operation_authentication_required', reason: failure.reason }),
    ),
    Match.when('forbidden', () => new ReadPermissionDenied({ code: 'read_permission_denied', reason: failure.reason })),
    Match.when('not_found', () => new ReadHandlerNotFound({ code: 'read_handler_not_found', reason: failure.reason })),
    Match.when('invalid', () => new ReadInputValidationError({ code: 'read_input_invalid', reason: failure.reason })),
    Match.when(
      'internal',
      () => new ReadHandlerExecutionError({ code: 'read_handler_execution_failed', reason: failure.reason }),
    ),
    Match.when(
      'conflict',
      () =>
        new ReadPolicyDenied({
          code: 'read_policy_denied',
          httpStatus: 409,
          policyReasonCode: 'party_conflict',
          reason: failure.reason,
        }),
    ),
    Match.when(
      'ineligible',
      () =>
        new ReadPolicyDenied({
          code: 'read_policy_denied',
          httpStatus: 422,
          policyReasonCode: 'party_ineligible',
          reason: failure.reason,
        }),
    ),
    Match.exhaustive,
  );
export const mapInquiryReadFailure = (failure: InquiryRejected | InquiryUnavailable | InquiryPartyFailure) =>
  Match.value(failure).pipe(
    Match.tag('InquiryPartyFailure', partyReadFailure),
    Match.tag(
      'InquiryRejected',
      () => new ReadHandlerNotFound({ code: 'read_handler_not_found', reason: 'Record was not found' }),
    ),
    Match.tag(
      'InquiryUnavailable',
      () =>
        new ReadHandlerUnavailable({ code: 'read_handler_unavailable', reason: 'Dependency temporarily unavailable' }),
    ),
    Match.exhaustive,
  );
