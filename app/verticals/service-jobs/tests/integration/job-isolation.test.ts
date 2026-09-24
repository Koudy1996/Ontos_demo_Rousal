import { loadDatabaseConnectionPair, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { eq, sql } from 'drizzle-orm';
import { Effect, Redacted, Schema, Layer, Result } from 'effect';
import { expect, it } from 'effect-rstest';
import { jobs } from '../../src/db/schema.ts';
import { JobListRequestSchema } from '../../shared/apis/job-list.ts';
import { jobPersistenceService } from '../../src/services/job-persistence.service.ts';

class FixtureRollback extends Schema.TaggedError<FixtureRollback>()('FixtureRollback', {}) {}
const tenant = '70000000-0000-4000-8000-000000000001';
const legalEntity = '80000000-0000-4000-8000-000000000001';
const otherEntity = '80000000-0000-4000-8000-000000000002';
const sourceId = '90000000-0000-4000-8000-000000000001';
const fixture = (id: string, tenantId = tenant, legalEntityId = legalEntity): typeof jobs.$inferInsert => ({
  acceptance: { evidenceNote: 'Fixture', method: 'PHONE' },
  acceptedAt: '2026-09-22T08:00:00.000Z',
  checklist: { accessChecked: false, cleared: false, handedOver: false, wasteRemoved: false },
  commercialSummary: { currency: 'CZK', priceBasis: 'EXCLUDING_VAT', total: '1234.00' },
  createdAt: '2026-09-23T08:00:00.000Z',
  executionNote: '',
  id,
  legalEntityId,
  partyId: '90000000-0000-4000-8000-000000000002',
  revision: 1,
  serviceLocation: { addressLine: 'Fixture', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  serviceScope: {
    description: 'Fixture',
    elevator: null,
    estimatedVolumeM3: null,
    floor: null,
    objectType: 'APARTMENT',
    specialWaste: null,
  },
  sourceId,
  sourceRevision: 5,
  status: 'NEW',
  tenantId,
  updatedAt: '2026-09-23T08:00:00.000Z',
});
const isolationScenario = Effect.gen(function* isolationScenario() {
  const database = yield* makeWithDefaults({});
  yield* database
    .transaction(
      Effect.fn(function* scopedProof(transaction) {
        const visibleId = '60000000-0000-4000-8000-000000000001';
        const foreignId = '60000000-0000-4000-8000-000000000002';
        yield* transaction
          .insert(jobs)
          .values([
            fixture(visibleId),
            fixture(foreignId, tenant, otherEntity),
            fixture('60000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002'),
          ]);
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        const scope = (tenantId: string, entityId: string) =>
          transaction.execute(
            sql`select set_config('ontos.tenant_id',${tenantId},true),set_config('ontos.legal_entity_id',${entityId},true)`,
          );
        yield* scope('', '');
        expect(yield* transaction.select().from(jobs)).toEqual([]);
        yield* scope(tenant, legalEntity);
        expect((yield* transaction.select().from(jobs)).map((row) => row.id)).toEqual([visibleId]);
        expect(yield* transaction.select().from(jobs).where(eq(jobs.id, foreignId))).toEqual([]);
        expect(
          yield* transaction.update(jobs).set({ executionNote: 'Forbidden' }).where(eq(jobs.id, foreignId)).returning(),
        ).toEqual([]);
        yield* scope(tenant, otherEntity);
        expect((yield* transaction.select().from(jobs)).map((row) => row.id)).toEqual([foreignId]);
        yield* scope(tenant, '');
        expect(yield* transaction.select().from(jobs)).toEqual([]);
        return yield* new FixtureRollback();
      }),
    )
    .pipe(Effect.catchTag('FixtureRollback', () => Effect.void));
});
const concurrencyScenario = Effect.gen(function* concurrencyScenario() {
  const database = yield* makeWithDefaults({});
  const insert = (id: string) =>
    database.transaction(
      Effect.fn(function* concurrentWrite(transaction) {
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        yield* transaction.execute(
          sql`select set_config('ontos.tenant_id',${tenant},true),set_config('ontos.legal_entity_id',${legalEntity},true)`,
        );
        return yield* transaction
          .insert(jobs)
          .values(fixture(id))
          .onConflictDoNothing({ target: [jobs.tenantId, jobs.legalEntityId, jobs.sourceId] })
          .returning({ id: jobs.id });
      }),
    );
  yield* Effect.acquireUseRelease(
    Effect.void,
    () =>
      Effect.gen(function* concurrentSourceProof() {
        const results = yield* Effect.all(
          [insert('61000000-0000-4000-8000-000000000001'), insert('61000000-0000-4000-8000-000000000002')],
          { concurrency: 2 },
        );
        expect(results.flat()).toHaveLength(1);
        const rows = yield* database.select().from(jobs).where(eq(jobs.sourceId, sourceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.commercialSummary.total).toBe('1234.00');
      }),
    () => database.delete(jobs).where(eq(jobs.sourceId, sourceId)).pipe(Effect.orDie),
  );
});
const selectionScenario = Effect.gen(function* selectionScenario() {
  const database = yield* makeWithDefaults({});
  yield* database
    .transaction(
      Effect.fn(function* completeSelection(transaction) {
        const rows = Array.from({ length: 105 }, (_, index) => {
          const id = `62000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
          return {
            ...fixture(id),
            expectedDurationMinutes: 120,
            scheduledStartAt: '2026-10-05T06:00:00.000Z',
            sourceId: id,
            status: 'PLANNED' as const,
          };
        });
        yield* transaction.insert(jobs).values(rows);
        const crossingId = '62000000-0000-4000-8000-000000000201';
        const outsideId = '62000000-0000-4000-8000-000000000202';
        const unknownId = '62000000-0000-4000-8000-000000000203';
        const adjacentId = '62000000-0000-4000-8000-000000000204';
        const newWithoutScheduleId = '62000000-0000-4000-8000-000000000205';
        const completedId = '62000000-0000-4000-8000-000000000206';
        yield* transaction.insert(jobs).values([
          {
            ...fixture(crossingId),
            expectedDurationMinutes: 180,
            scheduledStartAt: '2026-10-04T21:00:00.000Z',
            sourceId: crossingId,
            status: 'PLANNED',
          },
          {
            ...fixture(outsideId),
            scheduledStartAt: '2026-11-01T08:00:00.000Z',
            sourceId: outsideId,
            status: 'PLANNED',
          },
          {
            ...fixture(unknownId),
            scheduledStartAt: '2026-10-06T08:00:00.000Z',
            sourceId: unknownId,
            status: 'PLANNED',
          },
          {
            ...fixture(adjacentId),
            expectedDurationMinutes: 60,
            scheduledStartAt: '2026-10-04T21:00:00.000Z',
            sourceId: adjacentId,
            status: 'PLANNED',
          },
          {
            ...fixture(newWithoutScheduleId),
            sourceId: newWithoutScheduleId,
          },
          {
            ...fixture(completedId),
            completedAt: '2026-09-24T08:00:00.000Z',
            sourceId: completedId,
            status: 'COMPLETED',
            updatedAt: '2026-09-01T08:00:00.000Z',
          },
        ]);
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        yield* transaction.execute(
          sql`select set_config('ontos.tenant_id',${tenant},true),set_config('ontos.legal_entity_id',${legalEntity},true)`,
        );
        const principal = yield* Schema.decodeEffect(TrustedPrincipalContextSchema)({
          authBindingId: '10000000-0000-4000-8000-000000000001',
          authContextRef: 'better-auth-session:selection',
          authMethod: 'session',
          legalEntityId: legalEntity,
          principalId: '20000000-0000-4000-8000-000000000001',
          tenantId: tenant,
        });
        const persistence = yield* jobPersistenceService(transaction, { ...principal, correlationId: 'selection' });
        expect(yield* persistence.list('ALL')).toHaveLength(100);
        const firstPage = yield* persistence.browse({ pageSize: 100, view: 'ALL' });
        expect(firstPage.items).toHaveLength(100);
        expect(firstPage.nextCursor).not.toBeNull();
        if (firstPage.nextCursor === null) {
          return yield* Effect.die('Expected a second Job discovery page');
        }
        const secondPage = yield* persistence.browse({
          cursor: firstPage.nextCursor,
          pageSize: 100,
          view: 'ALL',
        });
        const discoveredIds = [...firstPage.items, ...secondPage.items].map((job) => job.ref.resourceId);
        expect(discoveredIds).toHaveLength(111);
        expect(new Set(discoveredIds).size).toBe(111);
        expect(discoveredIds).toContain(newWithoutScheduleId);
        expect(discoveredIds).toContain(completedId);
        const completed = yield* persistence.browse({ pageSize: 100, view: 'COMPLETED' });
        expect(completed.items.map((job) => job.ref.resourceId)).toEqual([completedId]);
        const request = yield* Schema.decodeEffect(JobListRequestSchema)({
          selection: { interval: { from: '2026-10-04T22:00:00Z', to: '2026-10-11T22:00:00Z' }, references: [] },
        });
        expect(yield* persistence.list(undefined, request.selection)).toHaveLength(107);
        const withReference = yield* Schema.decodeEffect(JobListRequestSchema)({
          selection: {
            references: [
              {
                moduleId: 'service.jobs',
                resourceId: outsideId,
                resourceType: 'service.jobs.service-job',
                tenantId: tenant,
              },
            ],
          },
        });
        expect(yield* persistence.list(undefined, withReference.selection)).toHaveLength(1);
        const absent = yield* Schema.decodeEffect(JobListRequestSchema)({
          selection: {
            references: [
              {
                moduleId: 'service.jobs',
                resourceId: '62000000-0000-4000-8000-000000000999',
                resourceType: 'service.jobs.service-job',
                tenantId: tenant,
              },
            ],
          },
        });
        expect(Result.isFailure(yield* Effect.result(persistence.list(undefined, absent.selection)))).toBe(true);
        const overflowRows = Array.from({ length: 1900 }, (_, index) => {
          const id = `63000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
          return {
            ...fixture(id),
            expectedDurationMinutes: 120,
            scheduledStartAt: '2026-10-05T06:00:00.000Z',
            sourceId: id,
            status: 'PLANNED' as const,
          };
        });
        yield* transaction.insert(jobs).values(overflowRows);
        expect(Result.isFailure(yield* Effect.result(persistence.list(undefined, request.selection)))).toBe(true);
        return yield* new FixtureRollback();
      }),
    )
    .pipe(Effect.catchTag('FixtureRollback', () => Effect.void));
});
it.layer(
  Layer.unwrap(
    loadDatabaseConnectionPair().pipe(
      Effect.map((configuration) => PgClient.layer({ url: Redacted.make(configuration.admin.connectionString) })),
    ),
  ),
)('Service job database', (suite) => {
  suite.effect('forced RLS isolates tenant and legal entity for reads and writes', () => isolationScenario);
  suite.effect(
    'complete schedule selection crosses week boundaries and preserves old list limits',
    () => selectionScenario,
  );
  suite.effect(
    'concurrent transactions cannot create two jobs from the same accepted source',
    () => concurrencyScenario,
  );
});
