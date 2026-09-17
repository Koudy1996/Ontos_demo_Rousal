/* oxlint-disable perfectionist/sort-objects -- Drizzle declaration order is the physical Catalog schema contract; expires: 2027-03-31. */
import { tenantRlsPolicies } from '@app/core-runtime';
import { defineRelations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const CATALOG_SCHEMA_NAME = 'catalog';

export const CATALOG_TABLE_INVENTORY = [
  'product_categories',
  'product_category_assignments',
  'product_category_events',
  'product_category_hierarchy_revisions',
  'product_lifecycle_events',
  'product_revisions',
  'product_type_assignment_events',
  'product_type_assignments',
  'product_type_revision_attributes',
  'product_type_revisions',
  'product_types',
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

export const productTypes = catalogSchema.table.withRLS(
  'product_types',
  {
    productTypeId: uuid('product_type_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_product_types_scope_id_uk').on(table.tenantId, table.productTypeId),
    index('catalog_product_types_tenant_name_idx').on(table.tenantId, table.name),
    check('catalog_product_types_revision_ck', sql`${table.currentRevision} > 0`),
    check(
      'catalog_product_types_name_ck',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240`,
    ),
    ...tenantRlsPolicies('catalog_product_types_tenant', table.tenantId),
  ],
);

export const productTypeRevisions = catalogSchema.table.withRLS(
  'product_type_revisions',
  {
    productTypeRevisionId: uuid('product_type_revision_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productTypeId: uuid('product_type_id').notNull(),
    revision: integer('revision').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_product_type_revisions_scope_id_uk').on(table.tenantId, table.productTypeRevisionId),
    unique('catalog_product_type_revisions_number_uk').on(table.tenantId, table.productTypeId, table.revision),
    unique('catalog_product_type_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.productTypeId],
      foreignColumns: [productTypes.tenantId, productTypes.productTypeId],
      name: 'catalog_product_type_revisions_type_fk',
    }).onDelete('restrict'),
    check('catalog_product_type_revisions_number_ck', sql`${table.revision} > 0`),
    check(
      'catalog_product_type_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_type_revisions_tenant', table.tenantId),
  ],
);

export const productTypeRevisionAttributes = catalogSchema.table.withRLS(
  'product_type_revision_attributes',
  {
    tenantId: uuid('tenant_id').notNull(),
    productTypeId: uuid('product_type_id').notNull(),
    revision: integer('revision').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    level: text('level').notNull(),
    requirement: text('requirement').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.productTypeId, table.revision, table.attributeDefinitionId, table.level],
      name: 'catalog_product_type_revision_attributes_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.productTypeId, table.revision],
      foreignColumns: [
        productTypeRevisions.tenantId,
        productTypeRevisions.productTypeId,
        productTypeRevisions.revision,
      ],
      name: 'catalog_product_type_revision_attributes_revision_fk',
    }).onDelete('restrict'),
    check(
      'catalog_product_type_revision_attributes_requirement_ck',
      sql`${table.requirement} in ('REQUIRED', 'OPTIONAL')`,
    ),
    check('catalog_product_type_revision_attributes_level_ck', sql`${table.level} in ('PRODUCT', 'VARIANT')`),
    ...tenantRlsPolicies('catalog_product_type_revision_attributes_tenant', table.tenantId),
  ],
);

export const productTypeAssignments = catalogSchema.table.withRLS(
  'product_type_assignments',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    productTypeId: uuid('product_type_id').notNull(),
    assignmentRevision: integer('assignment_revision').default(1).notNull(),
    assignedByActionInvocationId: uuid('assigned_by_action_invocation_id').notNull(),
    assignedByPrincipalId: uuid('assigned_by_principal_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.productId], name: 'catalog_product_type_assignments_pk' }),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_type_assignments_product_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.productTypeId],
      foreignColumns: [productTypes.tenantId, productTypes.productTypeId],
      name: 'catalog_product_type_assignments_type_fk',
    }).onDelete('restrict'),
    index('catalog_product_type_assignments_type_idx').on(table.tenantId, table.productTypeId),
    check('catalog_product_type_assignments_revision_ck', sql`${table.assignmentRevision} > 0`),
    ...tenantRlsPolicies('catalog_product_type_assignments_tenant', table.tenantId),
  ],
);

export const productTypeAssignmentEvents = catalogSchema.table.withRLS(
  'product_type_assignment_events',
  {
    productTypeAssignmentEventId: uuid('product_type_assignment_event_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    previousProductTypeId: uuid('previous_product_type_id'),
    nextProductTypeId: uuid('next_product_type_id'),
    assignmentRevision: integer('assignment_revision').notNull(),
    reason: text('reason').notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_product_type_assignment_events_scope_id_uk').on(table.tenantId, table.productTypeAssignmentEventId),
    unique('catalog_product_type_assignment_events_number_uk').on(
      table.tenantId,
      table.productId,
      table.assignmentRevision,
    ),
    unique('catalog_product_type_assignment_events_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_type_assignment_events_product_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.previousProductTypeId],
      foreignColumns: [productTypes.tenantId, productTypes.productTypeId],
      name: 'catalog_product_type_assignment_events_previous_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.nextProductTypeId],
      foreignColumns: [productTypes.tenantId, productTypes.productTypeId],
      name: 'catalog_product_type_assignment_events_next_fk',
    }).onDelete('restrict'),
    check('catalog_product_type_assignment_events_revision_ck', sql`${table.assignmentRevision} > 0`),
    check(
      'catalog_product_type_assignment_events_transition_ck',
      sql`${table.previousProductTypeId} is distinct from ${table.nextProductTypeId}`,
    ),
    check(
      'catalog_product_type_assignment_events_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_type_assignment_events_tenant', table.tenantId),
  ],
);

export const productCategoryHierarchyRevisions = catalogSchema.table.withRLS(
  'product_category_hierarchy_revisions',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    hierarchyRevision: integer('hierarchy_revision').default(0).notNull(),
    assignmentRevision: integer('assignment_revision').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'catalog_category_hierarchy_revision_ck',
      sql`${table.hierarchyRevision} >= 0 and ${table.assignmentRevision} >= 0`,
    ),
    ...tenantRlsPolicies('catalog_category_hierarchy_revisions_tenant', table.tenantId),
  ],
);

export const productCategories = catalogSchema.table.withRLS(
  'product_categories',
  {
    categoryId: uuid('category_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    parentCategoryId: uuid('parent_category_id'),
    name: text('name').notNull(),
    lifecycleState: text('lifecycle_state').default('ACTIVE').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_product_categories_scope_id_uk').on(table.tenantId, table.categoryId),
    foreignKey({
      columns: [table.tenantId, table.parentCategoryId],
      foreignColumns: [table.tenantId, table.categoryId],
      name: 'catalog_product_categories_parent_fk',
    }).onDelete('restrict'),
    index('catalog_product_categories_parent_idx').on(table.tenantId, table.parentCategoryId),
    check(
      'catalog_product_categories_name_ck',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240`,
    ),
    check('catalog_product_categories_state_ck', sql`${table.lifecycleState} in ('ACTIVE', 'RETIRED')`),
    check('catalog_product_categories_revision_ck', sql`${table.currentRevision} > 0`),
    check(
      'catalog_product_categories_not_self_parent_ck',
      sql`${table.parentCategoryId} is null or ${table.parentCategoryId} <> ${table.categoryId}`,
    ),
    ...tenantRlsPolicies('catalog_product_categories_tenant', table.tenantId),
  ],
);

export const productCategoryAssignments = catalogSchema.table.withRLS(
  'product_category_assignments',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    assignedByActionInvocationId: uuid('assigned_by_action_invocation_id').notNull(),
    assignedByPrincipalId: uuid('assigned_by_principal_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.productId, table.categoryId],
      name: 'catalog_product_category_assignments_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_category_assignments_product_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [productCategories.tenantId, productCategories.categoryId],
      name: 'catalog_product_category_assignments_category_fk',
    }).onDelete('restrict'),
    index('catalog_product_category_assignments_category_idx').on(table.tenantId, table.categoryId),
    ...tenantRlsPolicies('catalog_product_category_assignments_tenant', table.tenantId),
  ],
);

export const productCategoryEvents = catalogSchema.table.withRLS(
  'product_category_events',
  {
    productCategoryEventId: uuid('product_category_event_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    productId: uuid('product_id'),
    previousParentCategoryId: uuid('previous_parent_category_id'),
    nextParentCategoryId: uuid('next_parent_category_id'),
    changeKind: text('change_kind').notNull(),
    hierarchyRevision: integer('hierarchy_revision').notNull(),
    assignmentRevision: integer('assignment_revision').notNull(),
    reason: text('reason').notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_product_category_events_scope_id_uk').on(table.tenantId, table.productCategoryEventId),
    unique('catalog_product_category_events_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [productCategories.tenantId, productCategories.categoryId],
      name: 'catalog_product_category_events_category_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_category_events_product_fk',
    }).onDelete('restrict'),
    index('catalog_product_category_events_history_idx').on(table.tenantId, table.categoryId, table.recordedAt),
    check(
      'catalog_product_category_events_kind_ck',
      sql`${table.changeKind} in ('CREATED', 'RENAMED', 'MOVED', 'RETIRED', 'ASSIGNED', 'UNASSIGNED')`,
    ),
    check(
      'catalog_product_category_events_revisions_ck',
      sql`${table.hierarchyRevision} >= 0 and ${table.assignmentRevision} >= 0`,
    ),
    check(
      'catalog_product_category_events_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_category_events_tenant', table.tenantId),
  ],
);

const catalogDatabaseSchema = {
  productCategories,
  productCategoryAssignments,
  productCategoryEvents,
  productCategoryHierarchyRevisions,
  productLifecycleEvents,
  productRevisions,
  productTypeAssignmentEvents,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  productVariants,
  products,
} as const;

export const CATALOG_TABLES = [
  productCategories,
  productCategoryAssignments,
  productCategoryEvents,
  productCategoryHierarchyRevisions,
  productLifecycleEvents,
  productRevisions,
  productTypeAssignmentEvents,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  productVariants,
  products,
] as const;

export const catalogRelations = defineRelations(catalogDatabaseSchema);
