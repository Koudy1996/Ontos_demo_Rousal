import { Schema } from 'effect';

export class JobExpenseRejected extends Schema.TaggedError<JobExpenseRejected>()('JobExpenseRejected', {
  code: Schema.Literals([
    'invalid_expense',
    'invalid_state',
    'job_not_found',
    'not_found',
    'revision_conflict',
    'scope_mismatch',
  ]),
  reason: Schema.String,
}) {}
