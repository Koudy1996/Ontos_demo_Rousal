import { ReadHandlerNotFound, ReadHandlerUnavailable, ReadPermissionDenied, ReadPolicyDenied } from '@app/core-runtime';
import { Match } from 'effect';
import type { InvoiceRejected } from '../../shared/resources/invoice-rejected.ts';
import type { InvoiceUnavailable } from '../../shared/resources/invoice-unavailable.ts';

const mapRejectedRead = (rejection: InvoiceRejected) => {
  if (rejection.code === 'not_found' || rejection.code === 'job_not_found') {
    return new ReadHandlerNotFound({ code: 'read_handler_not_found', reason: rejection.reason });
  }
  if (rejection.code === 'scope_mismatch') {
    return new ReadPermissionDenied({ code: 'read_permission_denied', reason: rejection.reason });
  }
  return new ReadPolicyDenied({
    code: 'read_policy_denied',
    httpStatus: 422,
    policyReasonCode: rejection.code,
    reason: rejection.reason,
  });
};

export const mapInvoiceReadFailure = (error: InvoiceRejected | InvoiceUnavailable) =>
  Match.value(error).pipe(
    Match.tag(
      'InvoiceUnavailable',
      () => new ReadHandlerUnavailable({ code: 'read_handler_unavailable', reason: 'Fakturace je dočasně nedostupná' }),
    ),
    Match.tag('InvoiceRejected', mapRejectedRead),
    Match.exhaustive,
  );
