import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { AcceptedOfferHandoffResponseSchema } from '@app/sales-inquiries/contracts/accepted-offer-handoff';
import { DateTime, Effect, Layer, Option, Predicate, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { expect, it } from 'effect-rstest';
import { createServiceJobAction } from '../../src/actions/create-service-job.action.ts';
import { scheduleServiceJobAction } from '../../src/actions/schedule-service-job.action.ts';
import { startServiceJobAction } from '../../src/actions/start-service-job.action.ts';
import { completeServiceJobAction } from '../../src/actions/complete-service-job.action.ts';
import { updateExecutionAction } from '../../src/actions/update-execution.action.ts';
import { JobRejected, JobUnavailable } from '../../shared/resources/service-job.ts';
import type { ServiceJob } from '../../shared/resources/service-job.ts';
import type { JobPersistence } from '../../src/services/job-persistence.service.ts';
import type { SalesReader } from '../../src/services/sales-read.service.ts';

const principal = {
  authBindingId: '10000000-0000-4000-8000-000000000001',
  authContextRef: 'better-auth-session:jobs-test',
  authMethod: 'session',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  principalId: '20000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;
const source = Schema.decodeSync(AcceptedOfferHandoffResponseSchema)({
  acceptance: { evidenceNote: 'Potvrzeno zákazníkem', method: 'PHONE' },
  acceptedAt: '2026-09-22T10:00:00.000Z',
  commercialSummary: { currency: 'CZK', priceBasis: 'EXCLUDING_VAT', total: '17300.00' },
  legalEntityId: principal.legalEntityId,
  partyRef: {
    moduleId: 'party.registry',
    resourceId: '50000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party',
    tenantId: principal.tenantId,
  },
  serviceLocation: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  serviceScope: {
    description: 'Vyklizení 2+1',
    elevator: false,
    estimatedVolumeM3: '15',
    floor: 2,
    objectType: 'APARTMENT',
    specialWaste: null,
  },
  sourceRef: {
    moduleId: 'sales.inquiries',
    resourceId: '60000000-0000-4000-8000-000000000001',
    resourceType: 'sales.inquiries.sales-inquiry',
    tenantId: principal.tenantId,
  },
  sourceRevision: 5,
});
const transport = (idempotencyKey: string) => ({ correlationId: 'jobs-test', idempotencyKey });
const foreignEntity = Schema.decodeSync(AcceptedOfferHandoffResponseSchema.fields.legalEntityId)(
  '40000000-0000-4000-8000-000000000002',
);
const findSource = (rows: ReadonlyMap<string, ServiceJob>, value: ServiceJob) =>
  [...rows.values()].find((row) => row.sourceRef.resourceId === value.sourceRef.resourceId);
const findSourceId = (rows: ReadonlyMap<string, ServiceJob>, id: string) =>
  [...rows.values()].find((row) => row.sourceRef.resourceId === id);
const filterJobs = (
  rows: ReadonlyMap<string, ServiceJob>,
  view: 'ALL' | 'TODAY' | 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | undefined,
) => [...rows.values()].filter((row) => view === undefined || view === 'ALL' || row.status === view);
const missing = () => new JobRejected({ code: 'not_found', reason: 'Missing' });
const setup = (
  options: {
    readonly denied?: boolean;
    readonly deniedEntity?: boolean;
    readonly inactive?: boolean;
    readonly unavailable?: boolean;
    readonly uncertain?: boolean;
    readonly wrongEntity?: boolean;
  } = {},
) =>
  Effect.gen(function* setupWorkflow() {
    const rows = new Map<string, ServiceJob>();
    let reads = 0;
    const persistence: JobPersistence = {
      get: (id) =>
        Effect.suspend(() => {
          const value = rows.get(id);
          return value === undefined ? Effect.fail(missing()) : Effect.succeed(value);
        }),
      getBySource: (id) =>
        Effect.suspend(() => {
          const value = findSourceId(rows, id);
          return value === undefined ? Effect.fail(missing()) : Effect.succeed(value);
        }),
      insert: (value) =>
        Effect.sync(() => {
          const existing = findSource(rows, value);
          if (existing !== undefined) {
            return { created: false, job: existing };
          }
          rows.set(value.ref.resourceId, value);
          return { created: true, job: value };
        }),
      list: (status) => Effect.sync(() => filterJobs(rows, status)),
      save: (value, revision) =>
        Effect.suspend(() => {
          const current = rows.get(value.ref.resourceId);
          if (current === undefined) {
            return Effect.fail(missing());
          }
          if (current.revision !== revision) {
            return Effect.fail(new JobRejected({ code: 'revision_conflict', reason: 'Stale' }));
          }
          rows.set(value.ref.resourceId, value);
          return Effect.succeed(value);
        }),
    };
    const sales: SalesReader = {
      list: Effect.succeed([]),
      read: () =>
        Effect.suspend(() => {
          reads += 1;
          return options.unavailable === true
            ? Effect.fail(new JobUnavailable({ code: 'job_unavailable', reason: 'Offline' }))
            : Effect.succeed({
                ...source,
                legalEntityId: options.wrongEntity === true ? foreignEntity : source.legalEntityId,
              });
        }),
    };
    const config = {
      actionPermission: options.denied === true ? ('denied' as const) : ('allowed' as const),
      legalEntityAccess: options.deniedEntity === true ? ('denied' as const) : ('allowed' as const),
      moduleState: options.inactive === true ? ('inactive' as const) : ('active' as const),
      services: [
        bindActionTestServices(createServiceJobAction, { ...persistence, sales }),
        bindActionTestServices(scheduleServiceJobAction, persistence),
        bindActionTestServices(startServiceJobAction, persistence),
        bindActionTestServices(completeServiceJobAction, persistence),
        bindActionTestServices(updateExecutionAction, persistence),
      ],
    };
    const harness = yield* makeActionTestHarness(
      options.uncertain === true ? { ...config, commitAcknowledgement: 'indeterminate-once' } : config,
    );
    const create = (key = 'create') =>
      harness.runtime.runAction({
        payload: { sourceRef: source.sourceRef },
        principal,
        registration: createServiceJobAction,
        transport: transport(key),
      });
    const schedule = (job: ServiceJob, key = 'schedule') =>
      harness.runtime.runAction({
        payload: {
          expectedDurationMinutes: 180,
          expectedRevision: job.revision,
          id: job.ref.resourceId,
          scheduledStartAt: '2026-09-24T08:00:00.000Z',
        },
        principal,
        registration: scheduleServiceJobAction,
        transport: transport(key),
      });
    const start = (job: ServiceJob) =>
      harness.runtime.runAction({
        payload: { expectedRevision: job.revision, id: job.ref.resourceId },
        principal,
        registration: startServiceJobAction,
        transport: transport(`start-${job.revision}`),
      });
    const finish = (job: ServiceJob) =>
      harness.runtime.runAction({
        payload: { expectedRevision: job.revision, id: job.ref.resourceId },
        principal,
        registration: completeServiceJobAction,
        transport: transport(`finish-${job.revision}`),
      });
    return { create, finish, harness, reads: () => reads, rows, schedule, start };
  });
it.layer(
  Layer.succeed(GatewayPrincipalVerifierConfiguration, { configuration: Effect.die('Tests supply the owner service') }),
)('Service job workflow', (suite) => {
  suite.effect('updates the bounded checklist and note but freezes execution after completion', () =>
    Effect.gen(function* executionChecklist() {
      const test = yield* setup();
      const created = yield* test.create();
      const planned = yield* test.schedule(created);
      const running = yield* test.start(planned);
      const update = (job: ServiceJob) =>
        test.harness.runtime.runAction({
          payload: {
            checklist: { accessChecked: true, cleared: true, handedOver: true, wasteRemoved: true },
            executionNote: 'Prostor předán zákazníkovi',
            expectedRevision: job.revision,
            id: job.ref.resourceId,
          },
          principal,
          registration: updateExecutionAction,
          transport: transport(`execution-${job.revision}`),
        });
      const changed = yield* update(running);
      expect(changed.checklist.handedOver).toBe(true);
      expect(changed.executionNote).toBe('Prostor předán zákazníkovi');
      expect(changed.commercialSummary).toEqual(source.commercialSummary);
      const done = yield* test.finish(changed);
      expect(yield* update(done).pipe(Effect.flip)).toMatchObject({ code: 'invalid_transition' });
    }),
  );
  suite.effect('fails closed for an inactive module and a denied legal entity before source reads', () =>
    Effect.gen(function* scopeFailures() {
      const inactive = yield* setup({ inactive: true });
      expect(Predicate.isTagged(yield* inactive.create().pipe(Effect.flip), 'ModuleStateDeniedError')).toBe(true);
      expect(inactive.reads()).toBe(0);
      const denied = yield* setup({ deniedEntity: true });
      expect(Predicate.isTagged(yield* denied.create().pipe(Effect.flip), 'OperationContextDenied')).toBe(true);
      expect(denied.reads()).toBe(0);
    }),
  );
  suite.effect('creates one immutable accepted-source snapshot and follows the four-state lifecycle', () =>
    Effect.gen(function* acceptedLifecycle() {
      const test = yield* setup();
      const created = yield* test.create();
      expect(created.status).toBe('NEW');
      expect(created.serviceScope).toEqual(source.serviceScope);
      expect(created.acceptance).toEqual(source.acceptance);
      expect(created.commercialSummary).toEqual(source.commercialSummary);
      expect(created.partyRef).toEqual(source.partyRef);
      expect(yield* test.create('different-key')).toEqual(created);
      expect(test.rows.size).toBe(1);
      const planned = yield* test.schedule(created);
      expect(planned.status).toBe('PLANNED');
      const rescheduled = yield* test.schedule(planned, 'reschedule');
      expect(rescheduled.revision).toBe(3);
      yield* TestClock.adjust('1 second');
      const before = yield* DateTime.now;
      const started = yield* test.start(rescheduled);
      const after = yield* DateTime.now;
      expect(DateTime.toEpochMillis(Option.getOrThrow(started.startedAt))).toBeGreaterThanOrEqual(
        DateTime.toEpochMillis(before),
      );
      expect(DateTime.toEpochMillis(Option.getOrThrow(started.startedAt))).toBeLessThanOrEqual(
        DateTime.toEpochMillis(after),
      );
      const done = yield* test.finish(started);
      expect(done.status).toBe('COMPLETED');
      expect(DateTime.toEpochMillis(Option.getOrThrow(done.completedAt))).toBeGreaterThanOrEqual(
        DateTime.toEpochMillis(after),
      );
      expect(DateTime.toEpochMillis(Option.getOrThrow(done.completedAt))).toBeLessThanOrEqual(
        DateTime.toEpochMillis(yield* DateTime.now),
      );
      expect(done.partyRef).toEqual(source.partyRef);
      expect(done.serviceLocation).toEqual(source.serviceLocation);
      expect(done.sourceRevision).toBe(source.sourceRevision);
      expect(test.harness.snapshot().committed[1]?.evidence.dataAccessEvents).toHaveLength(2);
    }),
  );
  suite.effect('rejects skipped, stale, backwards and repeated lifecycle transitions', () =>
    Effect.gen(function* invalidTransitions() {
      const test = yield* setup();
      const created = yield* test.create();
      expect(yield* test.start(created).pipe(Effect.flip)).toMatchObject({ code: 'invalid_transition' });
      expect(yield* test.finish(created).pipe(Effect.flip)).toMatchObject({ code: 'invalid_transition' });
      const planned = yield* test.schedule(created);
      expect(yield* test.schedule(created, 'stale').pipe(Effect.flip)).toMatchObject({ code: 'revision_conflict' });
      const started = yield* test.start(planned);
      expect(yield* test.schedule(started, 'backwards').pipe(Effect.flip)).toMatchObject({
        code: 'invalid_transition',
      });
      const done = yield* test.finish(started);
      expect(yield* test.start(done).pipe(Effect.flip)).toMatchObject({ code: 'invalid_transition' });
      expect(yield* test.finish(done).pipe(Effect.flip)).toMatchObject({ code: 'invalid_transition' });
    }),
  );
  suite.effect('does not persist when source verification or authorization fails', () =>
    Effect.gen(function* sourceFailures() {
      const wrong = yield* setup({ wrongEntity: true });
      expect(yield* wrong.create().pipe(Effect.flip)).toMatchObject({ code: 'source_invalid' });
      expect(wrong.rows.size).toBe(0);
      const offline = yield* setup({ unavailable: true });
      expect(Predicate.isTagged(yield* offline.create().pipe(Effect.flip), 'JobUnavailable')).toBe(true);
      expect(offline.rows.size).toBe(0);
      const denied = yield* setup({ denied: true });
      expect(Predicate.isTagged(yield* denied.create().pipe(Effect.flip), 'ActionPermissionDenied')).toBe(true);
      expect(denied.reads()).toBe(0);
    }),
  );
  suite.effect('retains commit uncertainty and never executes an identical command twice', () =>
    Effect.gen(function* uncertainCommit() {
      const test = yield* setup({ uncertain: true });
      expect(Predicate.isTagged(yield* test.create().pipe(Effect.flip), 'ActionCommitIndeterminate')).toBe(true);
      expect(Predicate.isTagged(yield* test.create().pipe(Effect.flip), 'ActionAlreadyCommitted')).toBe(true);
      expect(test.rows.size).toBe(1);
      expect(test.reads()).toBe(1);
    }),
  );
});
