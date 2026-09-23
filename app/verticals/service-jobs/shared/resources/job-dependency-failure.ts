import { Schema } from 'effect';

export class JobDependencyFailure extends Schema.TaggedError<JobDependencyFailure>()('JobDependencyFailure', {
  code: Schema.Literals(['authentication', 'forbidden', 'not_found', 'invalid', 'ineligible', 'conflict', 'internal']),
  reason: Schema.String,
}) {}
