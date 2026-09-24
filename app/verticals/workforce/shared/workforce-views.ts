import { Schema } from 'effect';
import { ServiceJobRefSchema, ServiceJobSchema } from '@app/service-jobs/resources/service-job';
import { AbsenceReasonSchema, AbsenceSchema, WorkerIdSchema, WorkerSchema } from './resources/worker.ts';

export const AssignmentSchema = Schema.Struct({
  createdAt: Schema.DateTimeUtcFromString,
  jobRef: ServiceJobRefSchema,
  workerId: WorkerIdSchema,
});
export type Assignment = typeof AssignmentSchema.Type;
export const AvailabilitySchema = Schema.Struct({
  absenceReason: Schema.OptionFromNullOr(AbsenceReasonSchema),
  state: Schema.Literals(['AVAILABLE', 'INACTIVE', 'OUTSIDE_AGREEMENT', 'UNAVAILABLE', 'JOB_CONFLICT']),
});
export type Availability = typeof AvailabilitySchema.Type;
export const WorkerCandidateSchema = Schema.Struct({
  assigned: Schema.Boolean,
  availability: AvailabilitySchema,
  worker: WorkerSchema,
});
export const PlannedJobSchema = Schema.Struct({ crew: Schema.Array(WorkerCandidateSchema), job: ServiceJobSchema });
export const WorkerDetailSchema = Schema.Struct({
  absences: Schema.Array(AbsenceSchema),
  jobs: Schema.Array(PlannedJobSchema),
  worker: WorkerSchema,
});
