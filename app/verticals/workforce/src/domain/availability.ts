import { DateTime, Option } from 'effect';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import type { Worker, Absence } from '../../shared/resources/worker.ts';
import type { Availability } from '../../shared/workforce-views.ts';

const pragueFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Prague',
  year: 'numeric',
});
export const pragueDay = (instant: number): string =>
  pragueFormatter.format(DateTime.toDateUtc(DateTime.makeUnsafe(instant)));
export const intervalOf = (job: ServiceJob) =>
  Option.isSome(job.scheduledStartAt) &&
  Option.isSome(job.expectedDurationMinutes) &&
  job.expectedDurationMinutes.value > 0
    ? {
        end: DateTime.toEpochMillis(job.scheduledStartAt.value) + job.expectedDurationMinutes.value * 60_000,
        start: DateTime.toEpochMillis(job.scheduledStartAt.value),
      }
    : null;
export const overlaps = (left: { end: number; start: number }, right: { end: number; start: number }) =>
  left.start < right.end && right.start < left.end;
export const jobInWeek = (job: ServiceJob, from: number, to: number): boolean => {
  const interval = intervalOf(job);
  return interval === null
    ? Option.isSome(job.scheduledStartAt) &&
        DateTime.toEpochMillis(job.scheduledStartAt.value) >= from &&
        DateTime.toEpochMillis(job.scheduledStartAt.value) < to
    : overlaps(interval, { end: to, start: from });
};
const status = (state: Availability['state']): Availability => ({ absenceReason: Option.none(), state });
/** Provider completeness is verified before this pure evaluation. Current plan only. */
export const availabilityFor = (
  worker: Worker,
  job: ServiceJob,
  absences: readonly Absence[],
  otherJobs: readonly ServiceJob[],
): Availability => {
  if (worker.status !== 'ACTIVE') {
    return status('INACTIVE');
  }
  const interval = intervalOf(job);
  if (interval === null) {
    return status('UNAVAILABLE');
  }
  const first = pragueDay(interval.start);
  const last = pragueDay(interval.end - 1);
  if (
    worker.agreementValidFrom > first ||
    (Option.isSome(worker.agreementValidTo) && worker.agreementValidTo.value < last)
  ) {
    return status('OUTSIDE_AGREEMENT');
  }
  const absence = absences.find(
    (item) => item.workerId === worker.ref.resourceId && item.dateFrom <= last && item.dateTo >= first,
  );
  if (absence !== undefined) {
    return { absenceReason: Option.some(absence.reason), state: 'UNAVAILABLE' };
  }
  for (const other of otherJobs) {
    if (other.ref.resourceId === job.ref.resourceId) {
      continue;
    }
    const otherInterval = intervalOf(other);
    // Missing current timing is not evidence that an assigned worker is available.
    if (otherInterval === null) {
      return status('UNAVAILABLE');
    }
    if (overlaps(interval, otherInterval)) {
      return status('JOB_CONFLICT');
    }
  }
  return status('AVAILABLE');
};
