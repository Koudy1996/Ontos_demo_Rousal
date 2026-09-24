import { Schema } from 'effect';

export class WorkforceUnavailable extends Schema.TaggedError<WorkforceUnavailable>()('WorkforceUnavailable', {
  code: Schema.Literal('workforce_unavailable'),
  reason: Schema.String,
}) {}
