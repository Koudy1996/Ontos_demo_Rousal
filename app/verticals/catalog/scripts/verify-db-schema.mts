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

const pointersAreCurrent = (pointers: {
  assignment_mismatch: number;
  attribute_definition_mismatch: number;
  attribute_value_mismatch: number;
  axis_mismatch: number;
  category_mismatch: number;
  controlled_value_mismatch: number;
  counter_mismatch: number;
  package_mismatch: number;
  package_unit_mismatch: number;
  package_unit_reference_mismatch: number;
  type_mismatch: number;
  unit_rule_mismatch: number;
  variant_mismatch: number;
  variant_unit_mismatch: number;
}) => Object.values(pointers).every((count) => count === 0);

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
    yield* new CatalogSchemaVerificationError({
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
    yield* new CatalogSchemaVerificationError({
      reason: 'Catalog column inventory does not match the typed schema',
    });
  }
  const infrastructure = yield* Effect.tryPromise({
    catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to inspect Catalog security metadata' }),
    try: async () =>
      await client.query<{
        forced_rls: number;
        foreign_key_count: number;
        journal_count: number;
        policy_count: number;
        trigger_count: number;
      }>(`select
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) forced_rls,
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='drizzle' and c.relname='__drizzle_migrations_catalog') journal_count,
      (select count(*)::integer from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog') policy_count,
      (select count(*)::integer from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and not t.tgisinternal) trigger_count,
      (select count(*)::integer from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and k.contype='f') foreign_key_count`),
  });
  const [row] = infrastructure.rows;
  const expectedPolicyCount = CATALOG_TABLES.reduce((count, table) => count + getTableConfig(table).policies.length, 0);
  const expectedForeignKeyCount = CATALOG_TABLES.reduce(
    (count, table) => count + getTableConfig(table).foreignKeys.length,
    0,
  );
  if (
    row?.forced_rls !== CATALOG_TABLES.length ||
    row.journal_count !== 1 ||
    row.policy_count !== expectedPolicyCount ||
    row.trigger_count !== 29 ||
    row.foreign_key_count !== expectedForeignKeyCount
  ) {
    yield* new CatalogSchemaVerificationError({
      reason: 'Catalog RLS, journal, trigger, or foreign-key inventory differs from its migration',
    });
  }
  const currentPointers = yield* Effect.tryPromise({
    catch: () => new CatalogSchemaVerificationError({ reason: 'Unable to inspect Catalog revision pointers' }),
    try: async () =>
      await client.query<{
        assignment_mismatch: number;
        attribute_definition_mismatch: number;
        attribute_value_mismatch: number;
        axis_mismatch: number;
        category_mismatch: number;
        controlled_value_mismatch: number;
        counter_mismatch: number;
        package_mismatch: number;
        package_unit_mismatch: number;
        package_unit_reference_mismatch: number;
        type_mismatch: number;
        unit_rule_mismatch: number;
        variant_mismatch: number;
        variant_unit_mismatch: number;
      }>(`select
      (select count(*)::integer from catalog.product_type_assignments a
        where not exists (select 1 from catalog.product_type_assignment_events e
          where e.tenant_id=a.tenant_id and e.product_id=a.product_id
            and e.assignment_revision=a.assignment_revision
            and e.next_product_type_id=a.product_type_id
            and not exists (select 1 from catalog.product_type_assignment_events newer
              where newer.tenant_id=e.tenant_id and newer.product_id=e.product_id
                and newer.assignment_revision > e.assignment_revision)))
      + (select count(*)::integer from catalog.product_type_assignment_events e
        where e.next_product_type_id is not null
          and not exists (select 1 from catalog.product_type_assignment_events newer
            where newer.tenant_id=e.tenant_id and newer.product_id=e.product_id
              and newer.assignment_revision > e.assignment_revision)
          and not exists (select 1 from catalog.product_type_assignments a
            where a.tenant_id=e.tenant_id and a.product_id=e.product_id
              and a.assignment_revision=e.assignment_revision and a.product_type_id=e.next_product_type_id)) assignment_mismatch,
      (select count(*)::integer from catalog.product_types t
        where not exists (select 1 from catalog.product_type_revisions r
          where r.tenant_id=t.tenant_id and r.product_type_id=t.product_type_id and r.revision=t.current_revision)
          or t.current_revision <> (select max(r.revision) from catalog.product_type_revisions r
            where r.tenant_id=t.tenant_id and r.product_type_id=t.product_type_id)) type_mismatch,
      (select count(*)::integer from catalog.attribute_definitions d
        where not exists (select 1 from catalog.attribute_definition_revisions r
          where r.tenant_id=d.tenant_id and r.attribute_definition_id=d.attribute_definition_id
            and r.revision=d.current_revision and r.name=d.name and r.value_kind=d.value_kind
            and r.meaning=d.meaning and r.controlled_value_kind is not distinct from d.controlled_value_kind
            and r.multiplicity=d.multiplicity and r.applicable_levels=d.applicable_levels
            and r.measured_quantity is not distinct from d.measured_quantity
            and r.canonical_unit is not distinct from d.canonical_unit
            and r.minimum_value is not distinct from d.minimum_value
            and r.maximum_value is not distinct from d.maximum_value
            and r.decimal_places is not distinct from d.decimal_places
            and r.allows_unknown=d.allows_unknown and r.allows_not_applicable=d.allows_not_applicable
            and r.allows_none=d.allows_none)) attribute_definition_mismatch,
      (select count(*)::integer from catalog.controlled_attribute_values v
        where not exists (select 1 from catalog.controlled_attribute_value_revisions r
          where r.tenant_id=v.tenant_id and r.controlled_attribute_value_id=v.controlled_attribute_value_id
            and r.attribute_definition_id=v.attribute_definition_id and r.revision=v.current_revision
            and r.name=v.name and r.meaning=v.meaning and r.specialization=v.specialization
            and r.lifecycle_state=v.lifecycle_state
            and r.color_group is not distinct from v.color_group
            and r.swatch_system is not distinct from v.swatch_system
            and r.swatch_code is not distinct from v.swatch_code
            and r.preview_hex is not distinct from v.preview_hex
            and r.preview_evidence_ref is not distinct from v.preview_evidence_ref)) controlled_value_mismatch,
      (select count(*)::integer from catalog.attribute_value_sets s
        where not exists (select 1 from catalog.attribute_value_revisions r
          where r.tenant_id=s.tenant_id and r.attribute_value_set_id=s.attribute_value_set_id
            and r.revision=s.current_revision and r.change_kind=s.current_state)
          or s.current_revision <> (select max(r.revision) from catalog.attribute_value_revisions r
            where r.tenant_id=s.tenant_id and r.attribute_value_set_id=s.attribute_value_set_id)
          or (s.current_state='REMOVED' and exists (select 1 from catalog.attribute_value_items i
            where i.tenant_id=s.tenant_id and i.attribute_value_set_id=s.attribute_value_set_id))) attribute_value_mismatch,
      (select count(*)::integer from catalog.product_variants v
        where not exists (select 1 from catalog.product_variant_revisions r
          where r.tenant_id=v.tenant_id and r.variant_id=v.variant_id and r.revision=v.current_revision
            and r.product_id=v.product_id and r.lifecycle_state=v.lifecycle_state
            and r.combination_key is not distinct from v.combination_key
            and r.combination_axis_revision is not distinct from v.combination_axis_revision)
          or v.current_revision <> (select max(r.revision) from catalog.product_variant_revisions r
            where r.tenant_id=v.tenant_id and r.variant_id=v.variant_id)) variant_mismatch,
      (select count(*)::integer from catalog.product_variant_axes a
        where not exists (select 1 from catalog.product_variant_axis_events e
          where e.tenant_id=a.tenant_id and e.product_id=a.product_id and e.axis_revision=a.axis_revision
            and e.attribute_definition_ids[a.ordinal + 1] = a.attribute_definition_id)
          or a.axis_revision <> (select max(e.axis_revision) from catalog.product_variant_axis_events e
            where e.tenant_id=a.tenant_id and e.product_id=a.product_id)) axis_mismatch,
      (select count(*)::integer from catalog.product_categories c
        where not exists (select 1 from catalog.product_category_events e
          where e.tenant_id=c.tenant_id and e.category_id=c.category_id
            and e.category_revision=c.current_revision
            and e.next_name=c.name and e.next_lifecycle_state=c.lifecycle_state
            and e.next_parent_category_id is not distinct from c.parent_category_id
            and e.change_kind in ('CREATED','RENAMED','MOVED','RETIRED'))
          or c.current_revision <> (select max(e.category_revision) from catalog.product_category_events e
            where e.tenant_id=c.tenant_id and e.category_id=c.category_id
              and e.change_kind in ('CREATED','RENAMED','MOVED','RETIRED'))) category_mismatch,
      (select count(*)::integer from catalog.package_definitions d
        where not exists (select 1 from catalog.package_content_revisions r
          where r.tenant_id=d.tenant_id and r.package_definition_id=d.package_definition_id
            and r.revision=d.current_revision and r.product_id=d.product_id and r.variant_id=d.variant_id
            and r.lifecycle_state=d.lifecycle_state)
          or d.current_revision <> (select max(r.revision) from catalog.package_content_revisions r
            where r.tenant_id=d.tenant_id and r.package_definition_id=d.package_definition_id)) package_mismatch,
      (select count(*)::integer from catalog.product_units u
        where not exists (select 1 from catalog.product_unit_rule_revisions r
          where r.tenant_id=u.tenant_id and r.unit_id=u.unit_id and r.revision=u.current_rule_revision
            and r.lifecycle_state=u.lifecycle_state)
          or u.current_rule_revision <> (select max(r.revision) from catalog.product_unit_rule_revisions r
            where r.tenant_id=u.tenant_id and r.unit_id=u.unit_id)) unit_rule_mismatch,
      (select count(*)::integer from catalog.variant_unit_divisibility d
        where not exists (select 1 from catalog.variant_unit_divisibility_revisions r
          where r.tenant_id=d.tenant_id and r.variant_id=d.variant_id and r.revision=d.current_revision
            and r.unit_id=d.unit_id and r.divisible=d.divisible)
          or d.current_revision <> (select max(r.revision) from catalog.variant_unit_divisibility_revisions r
            where r.tenant_id=d.tenant_id and r.variant_id=d.variant_id)) variant_unit_mismatch,
      (select count(*)::integer from catalog.package_unit_divisibility d
        where not exists (select 1 from catalog.package_unit_divisibility_revisions r
          where r.tenant_id=d.tenant_id and r.package_definition_id=d.package_definition_id
            and r.revision=d.current_revision and r.unit_id=d.unit_id and r.divisible=d.divisible)
          or d.current_revision <> (select max(r.revision) from catalog.package_unit_divisibility_revisions r
            where r.tenant_id=d.tenant_id and r.package_definition_id=d.package_definition_id)) package_unit_mismatch,
      (select count(*)::integer from catalog.package_content_revisions c
        where c.unit_resource_type <> 'commerce.catalog.product-unit'
          or not exists (select 1 from catalog.product_units u
            where u.tenant_id=c.tenant_id and u.unit_id=c.unit_resource_id)) package_unit_reference_mismatch,
      (select count(*)::integer from catalog.product_category_hierarchy_revisions h
        where h.hierarchy_revision <> coalesce((select max(e.hierarchy_revision)
          from catalog.product_category_events e where e.tenant_id=h.tenant_id
          and e.change_kind in ('CREATED','RENAMED','MOVED','RETIRED')), 0)
        or h.assignment_revision <> coalesce((select max(e.assignment_revision)
          from catalog.product_category_events e where e.tenant_id=h.tenant_id
          and e.change_kind in ('ASSIGNED','UNASSIGNED')), 0)) counter_mismatch`),
  });
  const [pointers] = currentPointers.rows;
  if (pointers === undefined || !pointersAreCurrent(pointers)) {
    yield* new CatalogSchemaVerificationError({
      reason: 'Catalog Current revision pointers or category counters differ from durable events',
    });
  }
  yield* Console.log('Verified Catalog database schema, columns, and security metadata');
}).pipe(Effect.scoped, Effect.tapError(Console.error));

const exit = await Effect.runPromiseExit(verification);
process.exitCode = Exit.isFailure(exit) ? 1 : 0;
