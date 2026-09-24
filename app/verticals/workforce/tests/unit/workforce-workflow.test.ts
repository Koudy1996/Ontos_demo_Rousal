import type { JobSelection } from '../../src/services/jobs-read.service.ts';

import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { DateTime, Effect, Layer, Option, Predicate } from 'effect';
import { TestClock } from 'effect/testing';
import { expect, it } from 'effect-rstest';
import { createWorkerAction } from '../../src/actions/create-worker.action.ts';
import { updateWorkerAction } from '../../src/actions/update-worker.action.ts';
import { changeWorkerStatusAction } from '../../src/actions/change-worker-status.action.ts';
import { addAbsenceAction } from '../../src/actions/add-absence.action.ts';
import { removeAbsenceAction } from '../../src/actions/remove-absence.action.ts';
import { assignWorkerAction } from '../../src/actions/assign-worker.action.ts';
import { unassignWorkerAction } from '../../src/actions/unassign-worker.action.ts';
import { readAvailableWorkers, readWeeklySchedule, readWorkerDetail } from '../../src/services/workforce-read-model.ts';
import type { WorkforceServices } from '../../src/services/workforce-services.service.ts';
import type { Worker, Absence } from '../../shared/resources/worker.ts';
import { WorkforceRejected, WorkforceUnavailable } from '../../shared/resources/workforce-failure.ts';
import type { Assignment } from '../../shared/workforce-views.ts';
import { jobFixture, principal, profile } from '../fixtures.ts';

const missing = () => new WorkforceRejected({ code: 'not_found', reason: 'Worker not found' });

const a = jobFixture('60000000-0000-4000-8000-000000000001');
const b = jobFixture('60000000-0000-4000-8000-000000000002', '2026-10-10T08:00:00.000Z');
const selectJobs = (jobs: ReadonlyMap<string, ServiceJob>, selection: JobSelection) =>
  [...jobs.values()].filter(
    (job) =>
      selection.interval !== undefined || selection.references.some((ref) => ref.resourceId === job.ref.resourceId),
  );
const setup = Effect.fn('Workforce.testSetup')(function* setupWorkflow(
  options: { denied?: boolean; uncertain?: boolean } = {},
) {
  const workers = new Map<string, Worker>();
  const absences = new Map<string, Absence>();
  const assignments: Assignment[] = [];
  const jobs = new Map<string, ServiceJob>([
    [a.ref.resourceId, a],
    [b.ref.resourceId, b],
  ]);
  let unavailable = false;

  const get = (id: string) =>
    Effect.suspend(() => {
      const worker = workers.get(id);
      return worker === undefined ? Effect.fail(missing()) : Effect.succeed(worker);
    });
  const services: WorkforceServices = {
    absenceList: (id) =>
      Effect.sync(() => [...absences.values()].filter((row) => id === undefined || row.workerId === id)),
    addAbsence: (absence) =>
      Effect.sync(() => {
        absences.set(absence.id, absence);
      }),
    assign: (assignment) =>
      Effect.sync(() => {
        assignments.push(assignment);
      }),
    assignmentList: (id) => Effect.sync(() => assignments.filter((row) => id === undefined || row.workerId === id)),
    get,
    insert: (worker) =>
      Effect.sync(() => {
        workers.set(worker.ref.resourceId, worker);
        return worker;
      }),
    jobs: {
      read: (selection) =>
        Effect.suspend(() =>
          unavailable
            ? Effect.fail(new WorkforceUnavailable({ code: 'workforce_unavailable', reason: 'Offline' }))
            : Effect.succeed(selectJobs(jobs, selection)),
        ),
    },
    legalEntityId: principal.legalEntityId,
    list: () => Effect.sync(() => [...workers.values()]),
    lock: get,
    removeAbsence: (_workerId, id) =>
      Effect.sync(() => {
        absences.delete(id);
      }),
    save: (worker, revision) =>
      Effect.suspend(() => {
        if (workers.get(worker.ref.resourceId)?.revision !== revision) {
          return Effect.fail(new WorkforceRejected({ code: 'revision_conflict', reason: 'Stale' }));
        }
        workers.set(worker.ref.resourceId, worker);
        return Effect.succeed(worker);
      }),
    unassign: (workerId, jobId) =>
      Effect.sync(() => {
        const index = assignments.findIndex((row) => row.workerId === workerId && row.jobRef.resourceId === jobId);
        if (index !== -1) {
          assignments.splice(index, 1);
        }
      }),
  };
  const config = {
    actionPermission: options.denied === true ? ('denied' as const) : ('allowed' as const),
    services: [
      bindActionTestServices(createWorkerAction, services),
      bindActionTestServices(updateWorkerAction, services),
      bindActionTestServices(changeWorkerStatusAction, services),
      bindActionTestServices(addAbsenceAction, services),
      bindActionTestServices(removeAbsenceAction, services),
      bindActionTestServices(assignWorkerAction, services),
      bindActionTestServices(unassignWorkerAction, services),
    ],
  };
  const harness = yield* makeActionTestHarness(
    options.uncertain === true ? { ...config, commitAcknowledgement: 'indeterminate-once' } : config,
  );
  let sequence = 0;
  const transport = (key?: string) => {
    sequence += 1;
    return { correlationId: 'workforce-test', idempotencyKey: key ?? `command-${sequence}` };
  };
  const create = (key?: string) =>
    harness.runtime.runAction({
      payload: profile,
      principal,
      registration: createWorkerAction,
      transport: transport(key),
    });
  const assign = (worker: Worker, job = a) =>
    harness.runtime.runAction({
      payload: { jobRef: job.ref, workerId: worker.ref.resourceId },
      principal,
      registration: assignWorkerAction,
      transport: transport(),
    });
  const absence = (worker: Worker, dateFrom = '2026-10-15', dateTo = '2026-10-18') =>
    harness.runtime.runAction({
      payload: { dateFrom, dateTo, reason: 'VACATION', workerId: worker.ref.resourceId },
      principal,
      registration: addAbsenceAction,
      transport: transport(),
    });
  const remove = (worker: Worker, id: string) =>
    harness.runtime.runAction({
      payload: { id, workerId: worker.ref.resourceId },
      principal,
      registration: removeAbsenceAction,
      transport: transport(),
    });
  const status = (worker: Worker, next: 'ACTIVE' | 'INACTIVE') =>
    harness.runtime.runAction({
      payload: { expectedRevision: worker.revision, id: worker.ref.resourceId, status: next },
      principal,
      registration: changeWorkerStatusAction,
      transport: transport(),
    });
  const unassign = (worker: Worker) =>
    harness.runtime.runAction({
      payload: { jobRef: a.ref, workerId: worker.ref.resourceId },
      principal,
      registration: unassignWorkerAction,
      transport: transport(),
    });
  const update = (worker: Worker, validTo: string) =>
    harness.runtime.runAction({
      payload: {
        ...profile,
        agreementValidTo: validTo,
        expectedRevision: worker.revision,
        id: worker.ref.resourceId,
      },
      principal,
      registration: updateWorkerAction,
      transport: transport(),
    });
  return {
    absence,
    absences,
    assign,
    assignments,
    create,
    harness,
    jobs,
    offline: () => {
      unavailable = true;
    },
    remove,
    services,
    status,
    transport,
    unassign,
    update,
    workers,
  };
});
it.layer(
  Layer.succeed(GatewayPrincipalVerifierConfiguration, {
    configuration: Effect.die('Owner services supplied by harness'),
  }),
)('Workforce workflow', (suite) => {
  suite.effect('creates a local active DPP worker and retains decimal cost without an identity/account', () =>
    Effect.gen(function* localWorker() {
      const test = yield* setup();
      const worker = yield* test.create();
      expect(worker).toMatchObject({
        agreementType: 'DPP',
        displayName: profile.displayName,
        internalHourlyCostCzk: Option.some('180.00'),
        status: 'ACTIVE',
      });
      expect(worker).not.toHaveProperty('partyRef');
      expect(worker).not.toHaveProperty('principalId');
      const detail = yield* readWorkerDetail(test.services, worker.ref.resourceId);
      expect(detail.jobs).toEqual([]);
    }),
  );
  suite.effect(
    'rejects overlapping work, accepts adjacency, keeps bindings and exposes warnings after reschedule',
    () =>
      Effect.gen(function* overlappingWork() {
        const test = yield* setup();
        const worker = yield* test.create();
        yield* test.assign(worker);
        expect(yield* test.assign(worker, b).pipe(Effect.flip)).toMatchObject({ code: 'job_conflict' });
        const adjacent = { ...b, scheduledStartAt: Option.some(DateTime.makeUnsafe('2026-10-10T10:00:00.000Z')) };
        test.jobs.set(b.ref.resourceId, adjacent);
        yield* test.assign(worker, adjacent);
        yield* test.assign(worker, adjacent);
        expect(test.assignments).toHaveLength(2);
        test.jobs.set(b.ref.resourceId, b);
        const schedule = yield* readWeeklySchedule(test.services, '2026-10-05');
        expect(schedule.items.map((item) => item.crew[0]?.availability.state)).toEqual([
          'JOB_CONFLICT',
          'JOB_CONFLICT',
        ]);
        expect(test.assignments).toHaveLength(2);
      }),
  );
  suite.effect('absence covers both endpoints, cannot add/remove started days, and never deletes assignments', () =>
    Effect.gen(function* wholeDayAbsence() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-23T22:30:00.000Z')));
      const test = yield* setup();
      const worker = yield* test.create();
      expect(yield* test.absence(worker, '2026-09-24').pipe(Effect.flip)).toMatchObject({ code: 'invalid_absence' });
      yield* test.assign(worker);
      yield* test.absence(worker);
      for (const day of ['15', '18']) {
        test.jobs.set(b.ref.resourceId, jobFixture(b.ref.resourceId, `2026-10-${day}T06:00:00.000Z`));
        expect(yield* test.assign(worker, b).pipe(Effect.flip)).toMatchObject({ code: 'absence_blocked' });
      }
      const [absence] = [...test.absences.values()];
      expect(absence).toBeDefined();
      if (absence === undefined) {
        return;
      }
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-10-14T22:00:00.000Z')));
      expect(yield* test.remove(worker, absence.id).pipe(Effect.flip)).toMatchObject({ code: 'invalid_absence' });
      expect(test.assignments).toHaveLength(1);
      expect(test.absences.size).toBe(1);
    }),
  );
  suite.effect('current eligibility changes warn without rewriting completed historical crews', () =>
    Effect.gen(function* eligibilityChanges() {
      const test = yield* setup();
      const worker = yield* test.create();
      yield* test.assign(worker);
      const inactive = yield* test.status(worker, 'INACTIVE');
      expect((yield* readAvailableWorkers(test.services, a.ref)).items[0]?.availability.state).toBe('INACTIVE');
      expect(yield* test.assign(inactive, b).pipe(Effect.flip)).toMatchObject({ code: 'worker_inactive' });
      const active = yield* test.status(inactive, 'ACTIVE');
      yield* test.update(active, '2026-10-09');
      expect((yield* readWeeklySchedule(test.services, '2026-10-05')).items[0]?.crew[0]?.availability.state).toBe(
        'OUTSIDE_AGREEMENT',
      );
      test.jobs.set(a.ref.resourceId, { ...a, status: 'COMPLETED' });
      expect(yield* test.unassign(worker).pipe(Effect.flip)).toMatchObject({ code: 'crew_locked' });
      expect((yield* readWorkerDetail(test.services, worker.ref.resourceId)).jobs[0]?.crew[0]?.availability.state).toBe(
        'AVAILABLE',
      );
      expect(test.assignments).toHaveLength(1);
    }),
  );
  suite.effect('incomplete timing and unavailable provider fail closed', () =>
    Effect.gen(function* unavailableProvider() {
      const test = yield* setup();
      const worker = yield* test.create();
      test.jobs.set(a.ref.resourceId, { ...a, expectedDurationMinutes: Option.none() });
      expect(yield* test.assign(worker).pipe(Effect.flip)).toMatchObject({ code: 'invalid_job' });
      test.offline();
      expect(Predicate.isTagged(yield* test.assign(worker).pipe(Effect.flip), 'WorkforceUnavailable')).toBe(true);
      expect(
        Predicate.isTagged(
          yield* readWeeklySchedule(test.services, '2026-10-05').pipe(Effect.flip),
          'WorkforceUnavailable',
        ),
      ).toBe(true);
      expect(test.assignments).toEqual([]);
    }),
  );
  suite.effect('retains uncertainty, rejects replay and denies unauthorized writes', () =>
    Effect.gen(function* uncertainCommit() {
      const test = yield* setup({ uncertain: true });
      expect(Predicate.isTagged(yield* test.create('same').pipe(Effect.flip), 'ActionCommitIndeterminate')).toBe(true);
      expect(Predicate.isTagged(yield* test.create('same').pipe(Effect.flip), 'ActionAlreadyCommitted')).toBe(true);
      expect(test.workers.size).toBe(1);
      const denied = yield* setup({ denied: true });
      expect(Predicate.isTagged(yield* denied.create().pipe(Effect.flip), 'ActionPermissionDenied')).toBe(true);
      expect(denied.workers.size).toBe(0);
    }),
  );
  suite.effect('validates inclusive agreement dates and every touched day at Prague midnight', () =>
    Effect.gen(function* midnightBoundaries() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-23T08:00:00Z')));
      const test = yield* setup();
      const worker = yield* test.create();
      const updated = yield* test.update(worker, '2026-10-10');
      const midnight = jobFixture(a.ref.resourceId, '2026-10-10T20:00:00Z', 120);
      test.jobs.set(a.ref.resourceId, midnight);
      yield* test.assign(updated, midnight);
      yield* test.unassign(updated);
      test.jobs.set(a.ref.resourceId, { ...midnight, expectedDurationMinutes: Option.some(121) });
      expect(yield* test.assign(updated, midnight).pipe(Effect.flip)).toMatchObject({ code: 'outside_agreement' });
      const extended = yield* test.update(updated, '2026-12-31');
      yield* test.absence(extended);
      test.jobs.set(a.ref.resourceId, jobFixture(a.ref.resourceId, '2026-10-14T20:00:00Z', 121));
      expect(yield* test.assign(extended).pipe(Effect.flip)).toMatchObject({ code: 'absence_blocked' });
    }),
  );
  suite.effect('two workers form one crew and invalid profiles are rejected without new records', () =>
    Effect.gen(function* twoWorkers() {
      const test = yield* setup();
      const first = yield* test.create();
      const second = yield* test.create();
      yield* test.assign(first);
      yield* test.assign(second);
      expect((yield* readWeeklySchedule(test.services, '2026-10-05')).items[0]?.crew).toHaveLength(2);
      const failure = yield* test.harness.runtime
        .runAction({
          payload: { ...profile, displayName: '   ' },
          principal,
          registration: createWorkerAction,
          transport: test.transport(),
        })
        .pipe(Effect.flip);
      expect(Predicate.isTagged(failure, 'ActionPayloadValidationError')).toBe(true);
      expect(test.workers.size).toBe(2);
    }),
  );
});
