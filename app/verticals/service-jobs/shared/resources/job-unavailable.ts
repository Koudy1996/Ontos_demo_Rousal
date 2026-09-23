import { Schema } from 'effect';

export class JobUnavailable extends Schema.TaggedError<JobUnavailable>()('JobUnavailable', {
  code: Schema.Literal('job_unavailable'),
  reason: Schema.String,
}) {}
