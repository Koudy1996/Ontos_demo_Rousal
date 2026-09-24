import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { DateTime, Effect, Option } from 'effect';
import type { Worker, Absence } from '../../shared/resources/worker.ts';
import type { Assignment, Availability } from '../../shared/workforce-views.ts';
import { WorkforceRejected } from '../../shared/resources/workforce-failure.ts';
import { availabilityFor, intervalOf, jobInWeek } from '../domain/availability.ts';
import type { WorkforceServices } from './workforce-services.service.ts';

const available: Availability = { absenceReason: Option.none(), state: 'AVAILABLE' };
const workerJobs = (id: string, assignments: readonly Assignment[], jobs: readonly ServiceJob[]) =>
  jobs.filter((job) =>
    assignments.some((assignment) => assignment.workerId === id && assignment.jobRef.resourceId === job.ref.resourceId),
  );
export const crewFor = (
  job: ServiceJob,
  workers: readonly Worker[],
  absences: readonly Absence[],
  assignments: readonly Assignment[],
  jobs: readonly ServiceJob[],
) =>
  workers.flatMap((worker) =>
    assignments.some((item) => item.workerId === worker.ref.resourceId && item.jobRef.resourceId === job.ref.resourceId)
      ? [
          {
            assigned: true,
            availability:
              job.status === 'PLANNED'
                ? availabilityFor(worker, job, absences, workerJobs(worker.ref.resourceId, assignments, jobs))
                : available,
            worker,
          },
        ]
      : [],
  );
export const readWorkerDetail = Effect.fn('Workforce.workerDetail')(function* workerDetail(
  services: WorkforceServices,
  id: string,
) {
  const worker = yield* services.get(id);
  const { absences, assignments } = yield* Effect.all(
    {
      absences: services.absenceList(worker.ref.resourceId),
      assignments: services.assignmentList(worker.ref.resourceId),
    },
    { concurrency: 1 },
  );
  const jobs = yield* services.jobs.read({ references: assignments.map((item) => item.jobRef) });
  return {
    absences,
    jobs: jobs.map((job) => ({ crew: crewFor(job, [worker], absences, assignments, jobs), job })),
    worker,
  };
});
export const weekInterval = (date: string) => {
  const nextDate = DateTime.formatIsoDateUtc(DateTime.add(DateTime.makeUnsafe(`${date}T00:00:00.000Z`), { days: 7 }));
  const from = DateTime.makeZoned(`${date}T00:00:00`, { adjustForTimeZone: true, timeZone: 'Europe/Prague' });
  const to = DateTime.makeZoned(`${nextDate}T00:00:00`, { adjustForTimeZone: true, timeZone: 'Europe/Prague' });
  if (Option.isNone(from) || Option.isNone(to)) {
    return null;
  }
  return {
    from: DateTime.makeUnsafe(DateTime.toEpochMillis(from.value)),
    to: DateTime.makeUnsafe(DateTime.toEpochMillis(to.value)),
  };
};
export const readWeeklySchedule = Effect.fn('Workforce.weeklySchedule')(function* weeklySchedule(
  services: WorkforceServices,
  weekStart: string,
) {
  const interval = weekInterval(weekStart);
  if (interval === null) {
    return yield* new WorkforceRejected({ code: 'invalid_job', reason: 'Invalid calendar week' });
  }
  const { absences, assignments, workers } = yield* Effect.all(
    { absences: services.absenceList(), assignments: services.assignmentList(), workers: services.list() },
    { concurrency: 1 },
  );
  const jobs = yield* services.jobs.read({ interval, references: assignments.map((item) => item.jobRef) });
  const visible = jobs.filter((job) =>
    jobInWeek(job, DateTime.toEpochMillis(interval.from), DateTime.toEpochMillis(interval.to)),
  );
  return { items: visible.map((job) => ({ crew: crewFor(job, workers, absences, assignments, jobs), job })) };
});
export const readAvailableWorkers = Effect.fn('Workforce.availableWorkers')(function* availableWorkers(
  services: WorkforceServices,
  jobRef: Assignment['jobRef'],
) {
  const { absences, assignments, workers } = yield* Effect.all(
    { absences: services.absenceList(), assignments: services.assignmentList(), workers: services.list() },
    { concurrency: 1 },
  );
  const jobs = yield* services.jobs.read({ references: [jobRef, ...assignments.map((item) => item.jobRef)] });
  const job = jobs.find((item) => item.ref.resourceId === jobRef.resourceId);
  if (job === undefined || job.status !== 'PLANNED' || intervalOf(job) === null) {
    return yield* new WorkforceRejected({ code: 'invalid_job', reason: 'Job cannot receive assignments' });
  }
  return {
    items: workers.map((worker) => ({
      assigned: assignments.some(
        (item) => item.workerId === worker.ref.resourceId && item.jobRef.resourceId === job.ref.resourceId,
      ),
      availability: availabilityFor(worker, job, absences, workerJobs(worker.ref.resourceId, assignments, jobs)),
      worker,
    })),
  };
});
