import { DateTime, Effect, Option, Schema } from 'effect';
import type { SalesInquiryRef } from '@app/sales-inquiries/resources/sales-inquiry';
import type { ServiceJobSchema, JobExecutionSchema } from '../../../../shared/resources/service-job.ts';
import { JobIdSchema } from '../../../../shared/resources/service-job.ts';
import { ScheduleServiceJobPayloadSchema } from '../../../../shared/actions/schedule-service-job.ts';
import { UpdateExecutionPayloadSchema } from '../../../../shared/actions/update-execution.ts';
import { executeCreateServiceJob } from '../../../api/create-service-job-action-client.ts';
import { executeScheduleServiceJob } from '../../../api/schedule-service-job-action-client.ts';
import { executeStartServiceJob } from '../../../api/start-service-job-action-client.ts';
import { executeCompleteServiceJob } from '../../../api/complete-service-job-action-client.ts';
import { executeUpdateExecution } from '../../../api/update-execution-action-client.ts';
import { jobClientOptions } from './job-client-options.ts';
import { formInvalid } from './job-form-invalid.ts';
import { withSalesRead } from './jobs-effects.ts';

type Job = typeof ServiceJobSchema.Encoded;
export interface ScheduleDraft {
  readonly expectedDurationMinutes: string;
  readonly localStart: string;
}
export type ExecutionDraft = typeof JobExecutionSchema.Type;
const options = (key: string) => ({ ...jobClientOptions(), idempotencyKey: key });
export const createCommand = (sourceRef: SalesInquiryRef, key: string) =>
  withSalesRead(executeCreateServiceJob({ sourceRef }, key, options(key)));
export const scheduleCommand = Effect.fn('Jobs.scheduleCommand')(function* scheduleCommand(
  job: Job,
  data: ScheduleDraft,
  key: string,
) {
  // Demo operations use the company's Czech time zone; never interpret local time as UTC.
  const scheduled = DateTime.makeZoned(data.localStart, {
    adjustForTimeZone: true,
    timeZone: 'Europe/Prague',
  });
  const payload = yield* Schema.decodeUnknownEffect(ScheduleServiceJobPayloadSchema)({
    expectedDurationMinutes: data.expectedDurationMinutes === '' ? null : Number(data.expectedDurationMinutes),
    expectedRevision: job.revision,
    id: job.ref.resourceId,
    scheduledStartAt: Option.isSome(scheduled) ? DateTime.formatIso(scheduled.value) : null,
  }).pipe(Effect.mapError(formInvalid));
  return yield* executeScheduleServiceJob(payload, key, options(key));
});
export const startCommand = (job: Job, key: string) =>
  Schema.decodeEffect(JobIdSchema)(job.ref.resourceId).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((id) => executeStartServiceJob({ expectedRevision: job.revision, id }, key, options(key))),
  );
export const completeCommand = (job: Job, key: string) =>
  Schema.decodeEffect(JobIdSchema)(job.ref.resourceId).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((id) => executeCompleteServiceJob({ expectedRevision: job.revision, id }, key, options(key))),
  );
export const executionCommand = Effect.fn('Jobs.executionCommand')(function* executionCommand(
  job: Job,
  data: ExecutionDraft,
  key: string,
) {
  const payload = yield* Schema.decodeEffect(UpdateExecutionPayloadSchema)({
    ...data,
    expectedRevision: job.revision,
    id: job.ref.resourceId,
  }).pipe(Effect.mapError(formInvalid));
  return yield* executeUpdateExecution(payload, key, options(key));
});
