// @effect-diagnostics asyncFunction:off globalConsole:off nodeBuiltinImport:off -- Operator-only database verification adapts the PostgreSQL driver at the infrastructure edge; expires: 2027-03-31.
import { loadDatabaseConnectionPair } from '@app/core-runtime';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Array as EffectArray, Console, Effect, Exit, Order, Schema } from 'effect';
import { Client } from 'pg';

import { compareCatalogTables } from '../src/database/catalog.ts';
import { CATALOG_SCHEMA_NAME, CATALOG_TABLES } from '../src/database/schema.ts';

class CatalogSchemaVerificationError extends Schema.TaggedError<CatalogSchemaVerificationError>()(
  'CatalogSchemaVerificationError',
  { reason: Schema.String },
) {}

const expectedColumns = EffectArray.sort(
  CATALOG_TABLES.flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.map((column) => `${config.name}.${column.name}`);
  }),
  Order.String,
);

const verification = Effect.gen(function* verifyCatalogDatabase() {
  const configuration = yield* loadDatabaseConnectionPair();
  const client = yield* Effect.acquireRelease(
    Effect.tryPromise({
      catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to connect to the Catalog database' }),
      try: async () => {
        const connection = new Client({ connectionString: configuration.admin.connectionString });
        await connection.connect();
        return connection;
      },
    }),
    (connection) => Effect.promise(async () => await connection.end()),
  );
  // Typed Drizzle definitions define the complete inventory; catalog queries verify deployment metadata only.
  for (const table of CATALOG_TABLES) {
    const config = getTableConfig(table);
    yield* Effect.tryPromise({
      catch: () => new CatalogSchemaVerificationError({ reason: `Catalog table ${config.name} is unavailable` }),
      try: async () => await client.query(`select * from "catalog"."${config.name}" limit 0`),
    });
  }
  const tables = yield* Effect.tryPromise({
    catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to inspect Catalog tables' }),
    try: async () =>
      await client.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'catalog' and table_type = 'BASE TABLE' order by table_name",
      ),
  });
  const difference = compareCatalogTables(tables.rows.map((row) => `${CATALOG_SCHEMA_NAME}.${row.table_name}`));
  if (difference.missing.length > 0 || difference.unexpected.length > 0) {
    return yield* new CatalogSchemaVerificationError({
      reason: `Catalog table mismatch; missing=[${difference.missing.join(', ')}], unexpected=[${difference.unexpected.join(', ')}]`,
    });
  }
  const columns = yield* Effect.tryPromise({
    catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to inspect Catalog columns' }),
    try: async () =>
      await client.query<{ column_name: string; table_name: string }>(
        "select table_name, column_name from information_schema.columns where table_schema = 'catalog' order by table_name, column_name",
      ),
  });
  const actualColumns = EffectArray.sort(
    columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
    Order.String,
  );
  if (
    actualColumns.length !== expectedColumns.length ||
    actualColumns.some((column, index) => column !== expectedColumns[index])
  ) {
    return yield* new CatalogSchemaVerificationError({
      reason: 'Catalog column inventory does not match the typed schema',
    });
  }
  const infrastructure = yield* Effect.tryPromise({
    catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to inspect Catalog security metadata' }),
    try: async () =>
      await client.query<{
        forced_rls: number;
        journal_count: number;
        policy_count: number;
        trigger_count: number;
        foreign_key_count: number;
      }>(`select
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) forced_rls,
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='drizzle' and c.relname='__drizzle_migrations_catalog') journal_count,
      (select count(*)::integer from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog') policy_count,
      (select count(*)::integer from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and not t.tgisinternal) trigger_count,
      (select count(*)::integer from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and k.contype='f') foreign_key_count`),
  });
  const row = infrastructure.rows[0];
  if (
    row?.forced_rls !== 4 ||
    row.journal_count !== 1 ||
    row.policy_count !== 16 ||
    row.trigger_count !== 4 ||
    row.foreign_key_count !== 3
  ) {
    return yield* new CatalogSchemaVerificationError({
      reason: 'Catalog RLS, journal, trigger, or foreign-key inventory differs from its migration',
    });
  }
  yield* Console.log('Verified Catalog database schema, columns, and security metadata');
}).pipe(
  Effect.scoped,
  Effect.tapError((error) => Console.error(error.reason)),
);

const exit = await Effect.runPromiseExit(verification);
process.exitCode = Exit.isFailure(exit) ? 1 : 0;
