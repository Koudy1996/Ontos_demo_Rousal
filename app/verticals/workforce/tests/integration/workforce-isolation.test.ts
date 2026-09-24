import type { WorkforcePersistence } from '../../src/services/workforce-persistence.service.ts';
import { loadDatabaseConnectionPair, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { eq, sql } from 'drizzle-orm';
import { Cause, DateTime, Deferred, Effect, Fiber, Layer, Redacted, Result, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import { workers, absences, assignments } from '../../src/db/schema.ts';
import { workforcePersistenceService } from '../../src/services/workforce-persistence.service.ts';
import { assignWorkerAction } from '../../src/actions/assign-worker.action.ts';
import { WorkerSchema } from '../../shared/resources/worker.ts';
import { jobFixture, principal, workerFixture } from '../fixtures.ts';

class FixtureRollback extends Schema.TaggedError<FixtureRollback>()('FixtureRollback', {}) {}
const worker = workerFixture('50000000-0000-4000-8000-000000000099');
const a = jobFixture('60000000-0000-4000-8000-000000000091');
const b = jobFixture('60000000-0000-4000-8000-000000000092', '2026-10-10T08:00:00.000Z');
const layer = Layer.merge(
  Layer.unwrap(
    loadDatabaseConnectionPair().pipe(
      Effect.map((configuration) =>
        PgClient.layer({ maxConnections: 5, url: Redacted.make(configuration.admin.connectionString) }),
      ),
    ),
  ),
  Layer.succeed(GatewayPrincipalVerifierConfiguration, { configuration: Effect.die('Owner read fixture') }),
);
const fixtureRow = Effect.gen(function* encodeFixture() {
  const { ref, ...row } = yield* Schema.encodeEffect(WorkerSchema)(worker);
  return { ...row, id: ref.resourceId, tenantId: ref.tenantId };
});

const observeServices = (
  store: WorkforcePersistence,
  first: boolean,
  held: Deferred.Deferred<null>,
  release: Deferred.Deferred<null>,
  reads: number[],
) => ({
  ...store,
  assignmentList: (id?: string) =>
    store.assignmentList(id).pipe(
      Effect.tap((current) =>
        Effect.sync(() => {
          reads.push(current.length);
        }),
      ),
    ),
  jobs: { read: () => Effect.succeed([a, b]) },
  lock: (id: string) =>
    store
      .lock(id)
      .pipe(
        Effect.tap(() =>
          first ? Deferred.succeed(held, null).pipe(Effect.andThen(Deferred.await(release))) : Effect.void,
        ),
      ),
});
const scenario0 = Effect.gen(function* serializedAssignments() {
  const database = yield* makeWithDefaults({});
  const row = yield* fixtureRow;
  const scope = {
    ...(yield* Schema.decodeEffect(TrustedPrincipalContextSchema)(principal)),
    correlationId: 'workforce-db-test',
  };
  const held = yield* Deferred.make<null>();
  const release = yield* Deferred.make<null>();
  const secondPid = yield* Deferred.make<number>();
  const reads: number[] = [];
  const run = (job: typeof a, first: boolean) =>
    database.transaction(
      Effect.fn(function* assignmentTransaction(transaction) {
        yield* transaction.execute(sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`);
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        yield* transaction.execute(
          sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id',${principal.legalEntityId},true)`,
        );
        if (!first) {
          const rows = yield* transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`, 'objects');
          const [backend] = rows;
          expect(backend).toBeDefined();
          if (backend !== undefined) {
            yield* Deferred.succeed(secondPid, backend.pid);
          }
        }
        const store = yield* workforcePersistenceService(transaction, scope);
        const services = observeServices(store, first, held, release, reads);
        const harness = yield* makeActionTestHarness({
          actionPermission: 'allowed',
          services: [bindActionTestServices(assignWorkerAction, services)],
        });
        return yield* harness.runtime.runAction({
          payload: { jobRef: job.ref, workerId: worker.ref.resourceId },
          principal,
          registration: assignWorkerAction,
          transport: { correlationId: 'concurrency', idempotencyKey: job.ref.resourceId },
        });
      }),
    );
  yield* Effect.acquireUseRelease(
    Effect.void,
    () =>
      Effect.gen(function* compete() {
        yield* database.insert(workers).values(row);
        const first = yield* run(a, true).pipe(
          Effect.onError((cause) => Deferred.failCause(held, Cause.die(cause))),
          Effect.forkScoped,
        );
        yield* Deferred.await(held);
        const second = yield* run(b, false).pipe(Effect.result, Effect.forkScoped);
        const pid = yield* Deferred.await(secondPid);
        // PostgreSQL catalog proof: the second connection actually waits on the first lock.
        let blocked = false;
        for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
          const status = yield* database.execute<{ blocked: boolean }>(
            sql`select cardinality(pg_blocking_pids(${pid})) > 0 as blocked`,
            'objects',
          );
          blocked = status[0]?.blocked === true;
        }
        expect(blocked).toBe(true);
        yield* Deferred.succeed(release, null);
        yield* Fiber.join(first);
        const outcome = yield* Fiber.join(second);
        expect(Result.getFailure(outcome)).toMatchObject({ value: { code: 'job_conflict' } });
        expect(reads).toEqual([0, 1]);
        expect(
          yield* database.select().from(assignments).where(eq(assignments.workerId, worker.ref.resourceId)),
        ).toHaveLength(1);
      }),
    () =>
      Effect.gen(function* cleanup() {
        yield* Deferred.succeed(release, null);
        yield* database.delete(assignments).where(eq(assignments.workerId, worker.ref.resourceId));
        yield* database.delete(workers).where(eq(workers.id, worker.ref.resourceId));
      }).pipe(Effect.orDie),
  );
});

const scenario1 = Effect.gen(function* isolation() {
  const database = yield* makeWithDefaults({});
  const row = yield* fixtureRow;
  yield* database
    .transaction(
      Effect.fn(function* scopedTransaction(transaction) {
        yield* transaction.insert(workers).values(row);
        yield* transaction.insert(absences).values({
          dateFrom: '2026-10-15',
          dateTo: '2026-10-18',
          id: '90000000-0000-4000-8000-000000000001',
          legalEntityId: row.legalEntityId,
          reason: 'VACATION',
          tenantId: row.tenantId,
          workerId: row.id,
        });
        yield* transaction.insert(assignments).values({
          createdAt: DateTime.formatIso(DateTime.makeUnsafe('2026-09-23T08:00:00.000Z')),
          jobId: a.ref.resourceId,
          legalEntityId: row.legalEntityId,
          tenantId: row.tenantId,
          workerId: row.id,
        });
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        const scope = (tenant: string, entity: string) =>
          transaction.execute(
            sql`select set_config('ontos.tenant_id',${tenant},true),set_config('ontos.legal_entity_id',${entity},true)`,
          );
        for (const [tenant, entity] of [
          [principal.tenantId, ''],
          [principal.tenantId, '40000000-0000-4000-8000-000000000002'],
          ['', principal.legalEntityId],
          ['30000000-0000-4000-8000-000000000002', principal.legalEntityId],
        ]) {
          yield* scope(tenant ?? '', entity ?? '');
          expect(yield* transaction.select().from(workers)).toEqual([]);
          expect(yield* transaction.select().from(absences)).toEqual([]);
          expect(yield* transaction.select().from(assignments)).toEqual([]);
          expect(
            yield* transaction
              .update(workers)
              .set({ displayName: 'Forbidden' })
              .where(eq(workers.id, row.id))
              .returning(),
          ).toEqual([]);
        }
        yield* scope(principal.tenantId, principal.legalEntityId);
        expect(yield* transaction.select().from(workers)).toHaveLength(1);
        expect(yield* transaction.select().from(absences)).toHaveLength(1);
        expect(yield* transaction.select().from(assignments)).toHaveLength(1);
        const grants = yield* transaction.execute<{ allowed: boolean }>(
          sql`select has_table_privilege(current_user, 'workforce.workers', 'DELETE') as allowed`,
          'objects',
        );
        expect(grants[0]?.allowed).toBe(false);
        return yield* new FixtureRollback();
      }),
    )
    .pipe(Effect.catchTag('FixtureRollback', () => Effect.void));
});

it.layer(layer, { excludeTestServices: true })('Workforce database', (suite) => {
  suite.effect(
    'real concurrent Actions serialize before a fresh assignment SELECT and reject the overlap',
    () => scenario0,
  );
  suite.effect('forced RLS isolates tenant and entity and does not allow deleting a Worker', () => scenario1);
});
