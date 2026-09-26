import { loadDatabaseConnectionPair, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { DateTime, Effect, Layer, Redacted, Result, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import { jobExpenses } from '../../src/db/schema.ts';
import { expensePersistenceService } from '../../src/services/expense-persistence.service.ts';
import { jobFixture, principal } from '../fixtures.ts';

const layer = Layer.unwrap(
  loadDatabaseConnectionPair().pipe(
    Effect.map((configuration) =>
      PgClient.layer({ maxConnections: 5, url: Redacted.make(configuration.admin.connectionString) }),
    ),
  ),
);
const aggregateJob = jobFixture('60000000-0000-4000-8000-000000000098');
const concurrentJob = jobFixture('60000000-0000-4000-8000-000000000099');
const aggregateRow = (index: number) => ({
  amountCzk: '0.10',
  category: (['WORK', 'TRANSPORT', 'DISPOSAL', 'MATERIAL', 'OTHER'] as const)[index % 5] ?? 'OTHER',
  costBasis: 'EXCLUDING_VAT' as const,
  createdAt: `2026-09-24T08:${String(index).padStart(2, '0')}:00.000Z`,
  currency: 'CZK' as const,
  description: `Aggregate expense ${index + 1}`,
  id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  incurredOn: '2026-09-24',
  legalEntityId: principal.legalEntityId,
  revision: 1,
  serviceJobId: aggregateJob.ref.resourceId,
  status: 'RECORDED' as const,
  tenantId: principal.tenantId,
  updatedAt: `2026-09-24T08:${String(index).padStart(2, '0')}:00.000Z`,
  voidedAt: null,
  voidReason: null,
});
const aggregateRows = Array.from({ length: 55 }, (_, index) => aggregateRow(index));
const voidedRow = {
  ...aggregateRow(98),
  amountCzk: '999.00',
  createdAt: '2026-09-24T09:00:00.000Z',
  description: 'Voided aggregate expense',
  id: '71000000-0000-4000-8000-000000000099',
  revision: 2,
  status: 'VOIDED' as const,
  updatedAt: '2026-09-24T09:01:00.000Z',
  voidedAt: '2026-09-24T09:01:00.000Z',
  voidReason: 'Test void',
};
const concurrentRow = {
  ...aggregateRow(99),
  amountCzk: '10.00',
  createdAt: '2026-09-24T10:00:00.000Z',
  description: 'Concurrent expense',
  id: '72000000-0000-4000-8000-000000000001',
  serviceJobId: concurrentJob.ref.resourceId,
  updatedAt: '2026-09-24T10:00:00.000Z',
};
const fixtureIds = [...aggregateRows.map((row) => row.id), voidedRow.id, concurrentRow.id];
const runtimeScope = Effect.map(Schema.decodeEffect(TrustedPrincipalContextSchema)(principal), (scope) => ({
  ...scope,
  correlationId: 'job-expenses-db-test',
}));
const aggregateScenario = Effect.gen(function* completeAggregate() {
  const database = yield* makeWithDefaults({});
  const scope = yield* runtimeScope;
  yield* database.transaction(
    Effect.fn(function* scopedRead(transaction) {
      yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
      yield* transaction.execute(
        sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id',${principal.legalEntityId},true)`,
      );
      const store = yield* expensePersistenceService(transaction, scope);
      const page = yield* store.list({ includeVoided: true, pageSize: 10, serviceJobRef: aggregateJob.ref });
      const aggregate = yield* store.aggregate(aggregateJob.ref.resourceId);
      expect(page.items).toHaveLength(10);
      expect(page.nextCursor).not.toBeNull();
      expect(aggregate).toEqual({
        activeCount: 55,
        categoryTotals: {
          DISPOSAL: '1.10',
          MATERIAL: '1.10',
          OTHER: '1.10',
          TRANSPORT: '1.10',
          WORK: '1.10',
        },
        recordedCostTotal: '5.50',
        voidedCount: 1,
      });
    }),
  );
});

const concurrencyScenario = Effect.gen(function* optimisticConcurrency() {
  const database = yield* makeWithDefaults({});
  const scope = yield* runtimeScope;
  const update = (amountCzk: string) =>
    database.transaction(
      Effect.fn(function* concurrentUpdate(transaction) {
        yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
        yield* transaction.execute(
          sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id',${principal.legalEntityId},true)`,
        );
        const store = yield* expensePersistenceService(transaction, scope);
        const current = yield* store.get(concurrentRow.id);
        return yield* store.saveRecorded(
          {
            ...current,
            amountCzk,
            revision: 2,
            updatedAt: DateTime.makeUnsafe('2026-09-24T10:01:00.000Z'),
          },
          1,
        );
      }),
    );
  const outcomes = yield* Effect.all([update('20.00').pipe(Effect.result), update('30.00').pipe(Effect.result)], {
    concurrency: 2,
  });
  expect(outcomes.filter(Result.isSuccess)).toHaveLength(1);
  const failure = outcomes.find(Result.isFailure);
  expect(failure?.failure).toMatchObject({ code: 'revision_conflict' });
  const current = yield* database.select().from(jobExpenses).where(eq(jobExpenses.id, concurrentRow.id));
  expect(current).toHaveLength(1);
  expect(current[0]?.revision).toBe(2);
});

const isolationScenario = Effect.gen(function* forcedIsolation() {
  const database = yield* makeWithDefaults({});
  yield* database.transaction(
    Effect.fn(function* inspectIsolation(transaction) {
      yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
      for (const [tenant, entity] of [
        [principal.tenantId, ''],
        ['', principal.legalEntityId],
        [principal.tenantId, '40000000-0000-4000-8000-000000000002'],
        ['30000000-0000-4000-8000-000000000002', principal.legalEntityId],
      ]) {
        yield* transaction.execute(
          sql`select set_config('ontos.tenant_id',${tenant ?? ''},true),set_config('ontos.legal_entity_id',${entity ?? ''},true)`,
        );
        expect(
          yield* transaction
            .select()
            .from(jobExpenses)
            .where(and(eq(jobExpenses.id, concurrentRow.id))),
        ).toEqual([]);
        expect(
          yield* transaction
            .update(jobExpenses)
            .set({ description: 'Forbidden' })
            .where(eq(jobExpenses.id, concurrentRow.id))
            .returning(),
        ).toEqual([]);
      }
      yield* transaction.execute(
        sql`select set_config('ontos.tenant_id',${principal.tenantId},true),set_config('ontos.legal_entity_id',${principal.legalEntityId},true)`,
      );
      expect(yield* transaction.select().from(jobExpenses).where(eq(jobExpenses.id, concurrentRow.id))).toHaveLength(1);
      const grants = yield* transaction.execute<{ allowed: boolean }>(
        sql`select has_table_privilege(current_user, 'job_expenses.job_expenses', 'DELETE') as allowed`,
        'objects',
      );
      expect(grants[0]?.allowed).toBe(false);
    }),
  );
});

it.layer(layer, { excludeTestServices: true })('Job Expenses database', (suite) => {
  suite.effect('aggregates all scoped rows independently of list pagination and excludes voided expenses', () =>
    Effect.gen(function* aggregateFixture() {
      const database = yield* makeWithDefaults({});
      return yield* Effect.acquireUseRelease(
        database.insert(jobExpenses).values([...aggregateRows, voidedRow, concurrentRow]),
        () => aggregateScenario,
        () => database.delete(jobExpenses).where(inArray(jobExpenses.id, fixtureIds)).pipe(Effect.orDie),
      );
    }),
  );
  suite.effect('allows only one concurrent write from the same expected revision', () =>
    Effect.gen(function* concurrencyFixture() {
      const database = yield* makeWithDefaults({});
      return yield* Effect.acquireUseRelease(
        database.insert(jobExpenses).values([...aggregateRows, voidedRow, concurrentRow]),
        () => concurrencyScenario,
        () => database.delete(jobExpenses).where(inArray(jobExpenses.id, fixtureIds)).pipe(Effect.orDie),
      );
    }),
  );
  suite.effect('forces Tenant and Legal Entity RLS and denies runtime DELETE', () =>
    Effect.gen(function* isolationFixture() {
      const database = yield* makeWithDefaults({});
      return yield* Effect.acquireUseRelease(
        database.insert(jobExpenses).values([...aggregateRows, voidedRow, concurrentRow]),
        () => isolationScenario,
        () => database.delete(jobExpenses).where(inArray(jobExpenses.id, fixtureIds)).pipe(Effect.orDie),
      );
    }),
  );
});
