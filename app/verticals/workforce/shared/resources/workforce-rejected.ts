import { Schema } from 'effect';

export class WorkforceRejected extends Schema.TaggedError<WorkforceRejected>()('WorkforceRejected', {
  code: Schema.Literals([
    'not_found',
    'revision_conflict',
    'invalid_worker',
    'invalid_absence',
    'invalid_job',
    'worker_inactive',
    'outside_agreement',
    'absence_blocked',
    'job_conflict',
    'crew_locked',
    'scope_mismatch',
  ]),
  reason: Schema.String,
}) {}
