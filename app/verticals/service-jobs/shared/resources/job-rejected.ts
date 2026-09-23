import { Schema } from 'effect';

export class JobRejected extends Schema.TaggedError<JobRejected>()('JobRejected', {
  code: Schema.Literals(['not_found', 'revision_conflict', 'invalid_transition', 'source_invalid']),
  reason: Schema.String,
}) {}
