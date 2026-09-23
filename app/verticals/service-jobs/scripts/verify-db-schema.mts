import { NodeRuntime } from '@effect/platform-node';
import { loadDatabaseConnectionPair } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { Console, Effect, Redacted, Schema, Layer, Array as EffectArray, Order } from 'effect';
import { jobs, gatewayAssertionRedemptions } from '../src/db/schema.ts';

class JobDatabaseVerificationError extends Schema.TaggedError<JobDatabaseVerificationError>()(
  'JobDatabaseVerificationError',
  { reason: Schema.String },
) {}
const verification = Effect.gen(function* verifyJobDatabase() {
  const database = yield* makeWithDefaults({});
  const tables = [jobs, gatewayAssertionRedemptions];
  for (const table of tables) {
    yield* database.select().from(table).limit(0);
  }
  const inventory = yield* database.execute<{ name: string }>(
    sql`select relname as name from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace where nspname='service_jobs' and relkind='r' order by relname`,
    'objects',
  );
  const expected = EffectArray.sort(
    tables.map((table) => getTableConfig(table).name),
    Order.String,
  );
  if (inventory.length !== expected.length || inventory.some((row, index) => row.name !== expected[index])) {
    return yield* new JobDatabaseVerificationError({ reason: 'Service Job table inventory mismatch' });
  }
  const security = yield* database.execute<{
    bypass: boolean;
    delete: boolean;
    enabled: boolean;
    forced: boolean;
    insert: boolean;
    select: boolean;
    superuser: boolean;
    update: boolean;
  }>(
    sql`
    select relforcerowsecurity as forced, relrowsecurity as enabled,
      has_table_privilege('ontos_runtime',pg_class.oid,'SELECT') as select,
      has_table_privilege('ontos_runtime',pg_class.oid,'INSERT') as insert,
      has_table_privilege('ontos_runtime',pg_class.oid,'UPDATE') as update,
      has_table_privilege('ontos_runtime',pg_class.oid,'DELETE') as delete,
      rolsuper as superuser,rolbypassrls as bypass
    from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
    cross join pg_roles where nspname='service_jobs' and relname='jobs' and rolname='ontos_runtime'`,
    'objects',
  );
  const [row] = security;
  if (
    row === undefined ||
    !row.forced ||
    !row.enabled ||
    !row.select ||
    !row.insert ||
    !row.update ||
    row.delete ||
    row.superuser ||
    row.bypass
  ) {
    return yield* new JobDatabaseVerificationError({ reason: 'Service Job RLS or runtime grants mismatch' });
  }
  const journal = yield* database.execute<{ count: number }>(
    sql`select count(*)::integer as count from drizzle.__drizzle_migrations_service_jobs`,
    'objects',
  );
  if (journal[0]?.count !== 1) {
    return yield* new JobDatabaseVerificationError({ reason: 'Service Job migration journal mismatch' });
  }
  return yield* Console.log('Verified Service Job tables, migration journal, forced RLS and runtime privileges');
});
const databaseLive = Layer.unwrap(
  loadDatabaseConnectionPair().pipe(
    Effect.map((configuration) => PgClient.layer({ url: Redacted.make(configuration.admin.connectionString) })),
  ),
);

const mainLayer = Layer.effectDiscard(verification).pipe(Layer.provide(databaseLive));
NodeRuntime.runMain(Effect.scoped(Layer.build(mainLayer)));
