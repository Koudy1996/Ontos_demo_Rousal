import { Schema } from 'effect';

export class JobExpenseUnavailable extends Schema.TaggedError<JobExpenseUnavailable>()('JobExpenseUnavailable', {
  code: Schema.Literal('job_expenses_unavailable'),
  reason: Schema.String,
}) {}
