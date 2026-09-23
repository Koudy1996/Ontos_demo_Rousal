import { loadDatabaseConnectionPair } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { eq, sql } from 'drizzle-orm';
import { Effect, Redacted, Schema, Layer } from 'effect';
import { expect, it } from 'effect-rstest';
import { inquiries } from '../../src/db/schema.ts';

class FixtureRollback extends Schema.TaggedError<FixtureRollback>()('FixtureRollback', {}) {}
const tenant = '70000000-0000-4000-8000-000000000001';
const legalEntity = '80000000-0000-4000-8000-000000000001';
const otherEntity = '80000000-0000-4000-8000-000000000002';
const fixture = (id: string, tenantId: string, legalEntityId: string): typeof inquiries.$inferInsert => ({
  createdAt: '2026-09-23T08:00:00.000Z',
  description: 'RLS test',
  id,
  internalNote: '',
  legalEntityId,
  location: { addressLine: 'RLS test', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  objectType: 'APARTMENT',
  partyId: '90000000-0000-4000-8000-000000000001',
  revision: 1,
  stage: 'NEW',
  tenantId,
  updatedAt: '2026-09-23T08:00:00.000Z',
});
const isolationScenario = Effect.gen(function* isolation() {
  const program = Effect.gen(function* isolateInTransaction() {
    const database = yield* makeWithDefaults({});
    yield* database
      .transaction(
        Effect.fn(function* scopedProof(transaction) {
          const visibleId = '60000000-0000-4000-8000-000000000001';
          const foreignId = '60000000-0000-4000-8000-000000000002';
          yield* transaction
            .insert(inquiries)
            .values([
              fixture(visibleId, tenant, legalEntity),
              fixture(foreignId, tenant, otherEntity),
              fixture('60000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', legalEntity),
            ]);
          yield* transaction.execute(sql`SET LOCAL ROLE ontos_runtime`);
          const scope = (tenantId: string, entityId: string) =>
            transaction.execute(
              sql`select set_config('ontos.tenant_id',${tenantId},true),set_config('ontos.legal_entity_id',${entityId},true)`,
            );
          yield* scope('', '');
          expect(yield* transaction.select().from(inquiries)).toEqual([]);
          yield* scope(tenant, legalEntity);
          expect((yield* transaction.select().from(inquiries)).map((row) => row.id)).toEqual([visibleId]);
          expect(yield* transaction.select().from(inquiries).where(eq(inquiries.id, foreignId))).toEqual([]);
          expect(
            yield* transaction
              .update(inquiries)
              .set({ description: 'Forbidden change' })
              .where(eq(inquiries.id, foreignId))
              .returning({ id: inquiries.id }),
          ).toEqual([]);
          yield* scope(tenant, otherEntity);
          expect((yield* transaction.select().from(inquiries)).map((row) => row.id)).toEqual([foreignId]);
          yield* scope(tenant, '');
          expect(yield* transaction.select().from(inquiries)).toEqual([]);
          return yield* new FixtureRollback();
        }),
      )
      .pipe(Effect.catchTag('FixtureRollback', () => Effect.void));
  });
  yield* program;
});

it.layer(
  Layer.unwrap(
    loadDatabaseConnectionPair().pipe(
      Effect.map((configuration) => PgClient.layer({ url: Redacted.make(configuration.admin.connectionString) })),
    ),
  ),
)('Sales Inquiry RLS', (suite) => {
  suite.effect(
    'forced RLS denies unscoped reads and isolates both tenant and Current Legal Entity',
    () => isolationScenario,
  );
});
