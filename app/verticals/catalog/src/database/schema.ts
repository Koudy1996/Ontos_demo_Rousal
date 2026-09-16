/* oxlint-disable perfectionist/sort-objects -- Drizzle declaration order is the physical Catalog schema contract; expires: 2027-03-31. */
import { tenantRlsPolicies } from '@app/core-runtime';
import { defineRelations, sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const CATALOG_SCHEMA_NAME = 'catalog';

export const CATALOG_TABLE_INVENTORY = [
  'product_lifecycle_events',
  'product_revisions',
  'product_variants',
  'products',
] as const;

export const catalogSchema = pgSchema(CATALOG_SCHEMA_NAME);

const recordedAt = () => timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull();

export const products = catalogSchema.table.withRLS(
  'products',
  {
    productId: uuid('product_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    lifecycleState: text('lifecycle_state').default('DRAFT').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    name: text('name'),
    description: text('description'),
    retiredEffectiveAt: timestamp('retired_effective_at', { withTimezone: true }),
    retiredReason: text('retired_reason'),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_products_scope_id_uk').on(table.tenantId, table.productId),
    index('catalog_products_tenant_lifecycle_idx').on(table.tenantId, table.lifecycleState),
    index('catalog_products_tenant_name_idx').on(table.tenantId, table.name),
    check('catalog_products_lifecycle_ck', sql`${table.lifecycleState} in ('DRAFT', 'ACTIVE', 'RETIRED')`),
    check('catalog_products_revision_ck', sql`${table.currentRevision} > 0`),
    check(
      'catalog_products_name_ck',
      sql`${table.name} is null or (${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240)`,
    ),
    check(
      'catalog_products_description_ck',
      sql`${table.description} is null or (${table.description} = btrim(${table.description}) and length(${table.description}) <= 4000)`,
    ),
    check(
      'catalog_products_retirement_ck',
      sql`(${table.lifecycleState} <> 'RETIRED' and ${table.retiredEffectiveAt} is null and ${table.retiredReason} is null) or (${table.lifecycleState} = 'RETIRED' and ${table.retiredEffectiveAt} is not null and ${table.retiredReason} is not null and ${table.retiredReason} = btrim(${table.retiredReason}) and length(${table.retiredReason}) between 1 and 1000)`,
    ),
    ...tenantRlsPolicies('catalog_products_tenant', table.tenantId),
  ],
);

export const productVariants = catalogSchema.table.withRLS(
  'product_variants',
  {
    variantId: uuid('variant_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    lifecycleState: text('lifecycle_state').default('WORK_IN_PROGRESS').notNull(),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_product_variants_scope_id_uk').on(table.tenantId, table.variantId),
    unique('catalog_product_variants_product_id_variant_id_uk').on(table.tenantId, table.productId, table.variantId),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_variants_product_fk',
    }).onDelete('restrict'),
    index('catalog_product_variants_product_idx').on(table.tenantId, table.productId, table.lifecycleState),
    check(
      'catalog_product_variants_lifecycle_ck',
      sql`${table.lifecycleState} in ('WORK_IN_PROGRESS', 'ACTIVE', 'RETIRED')`,
    ),
    ...tenantRlsPolicies('catalog_product_variants_tenant', table.tenantId),
  ],
);

export const productRevisions = catalogSchema.table.withRLS(
  'product_revisions',
  {
    productRevisionId: uuid('product_revision_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    revision: integer('revision').notNull(),
    changeKind: text('change_kind').notNull(),
    lifecycleState: text('lifecycle_state').notNull(),
    name: text('name'),
    description: text('description'),
    reason: text('reason').notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_product_revisions_scope_id_uk').on(table.tenantId, table.productRevisionId),
    unique('catalog_product_revisions_number_uk').on(table.tenantId, table.productId, table.revision),
    unique('catalog_product_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_revisions_product_fk',
    }).onDelete('restrict'),
    index('catalog_product_revisions_history_idx').on(table.tenantId, table.productId, table.revision),
    check('catalog_product_revisions_revision_ck', sql`${table.revision} > 0`),
    check(
      'catalog_product_revisions_change_kind_ck',
      sql`${table.changeKind} in ('CREATED', 'UPDATED', 'COSMETIC_CORRECTION', 'LIFECYCLE')`,
    ),
    check('catalog_product_revisions_lifecycle_ck', sql`${table.lifecycleState} in ('DRAFT', 'ACTIVE', 'RETIRED')`),
    check(
      'catalog_product_revisions_name_ck',
      sql`${table.name} is null or (${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240)`,
    ),
    check(
      'catalog_product_revisions_description_ck',
      sql`${table.description} is null or (${table.description} = btrim(${table.description}) and length(${table.description}) <= 4000)`,
    ),
    check(
      'catalog_product_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_revisions_tenant', table.tenantId),
  ],
);

export const productLifecycleEvents = catalogSchema.table.withRLS(
  'product_lifecycle_events',
  {
    productLifecycleEventId: uuid('product_lifecycle_event_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    event: text('event').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_product_lifecycle_scope_id_uk').on(table.tenantId, table.productLifecycleEventId),
    unique('catalog_product_lifecycle_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_lifecycle_product_fk',
    }).onDelete('restrict'),
    index('catalog_product_lifecycle_history_idx').on(table.tenantId, table.productId, table.effectiveAt),
    check('catalog_product_lifecycle_event_ck', sql`${table.event} in ('ACTIVATED', 'RETIRED')`),
    check(
      'catalog_product_lifecycle_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_lifecycle_tenant', table.tenantId),
  ],
);

const catalogDatabaseSchema = {
  productLifecycleEvents,
  productRevisions,
  productVariants,
  products,
} as const;

export const CATALOG_TABLES = [productLifecycleEvents, productRevisions, productVariants, products] as const;

export const catalogRelations = defineRelations(catalogDatabaseSchema);
