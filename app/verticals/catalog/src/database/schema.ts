/* oxlint-disable perfectionist/sort-objects -- Drizzle declaration order is the physical Catalog schema contract; expires: 2027-03-31. */
import { tenantRlsPolicies } from '@app/core-runtime';
import { defineRelations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const CATALOG_SCHEMA_NAME = 'catalog';

export const CATALOG_TABLE_INVENTORY = [
  'attribute_definition_revisions',
  'attribute_definitions',
  'attribute_value_items',
  'attribute_value_revisions',
  'attribute_value_sets',
  'controlled_attribute_value_revisions',
  'controlled_attribute_values',
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
  'product_variant_axes',
  'product_variant_axis_events',
  'product_variant_revisions',
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
    currentRevision: integer('current_revision').default(1).notNull(),
    combinationKey: text('combination_key'),
    combinationAxisRevision: integer('combination_axis_revision'),
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
    uniqueIndex('catalog_product_variants_active_combination_uk')
      .on(table.tenantId, table.productId, table.combinationKey)
      .where(sql`${table.lifecycleState} = 'ACTIVE'`),
    check('catalog_product_variants_revision_ck', sql`${table.currentRevision} > 0`),
    check(
      'catalog_product_variants_axis_revision_ck',
      sql`${table.combinationAxisRevision} is null or ${table.combinationAxisRevision} > 0`,
    ),
    check(
      'catalog_product_variants_combination_ck',
      sql`(${table.lifecycleState} = 'ACTIVE' and ${table.combinationKey} is not null and ${table.combinationAxisRevision} is not null and length(${table.combinationKey}) = 64 and ${table.combinationKey} ~ '^[0-9a-f]{64}$') or (${table.lifecycleState} <> 'ACTIVE' and ${table.combinationKey} is null and ${table.combinationAxisRevision} is null)`,
    ),
    check(
      'catalog_product_variants_lifecycle_ck',
      sql`${table.lifecycleState} in ('WORK_IN_PROGRESS', 'ACTIVE', 'RETIRED')`,
    ),
    ...tenantRlsPolicies('catalog_product_variants_tenant', table.tenantId),
  ],
);

export const productVariantRevisions = catalogSchema.table.withRLS(
  'product_variant_revisions',
  {
    tenantId: uuid('tenant_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    productId: uuid('product_id').notNull(),
    revision: integer('revision').notNull(),
    lifecycleState: text('lifecycle_state').notNull(),
    combinationKey: text('combination_key'),
    combinationAxisRevision: integer('combination_axis_revision'),
    changeKind: text('change_kind').notNull(),
    reason: text('reason').notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.variantId, table.revision],
      name: 'catalog_product_variant_revisions_pk',
    }),
    unique('catalog_product_variant_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.variantId],
      name: 'catalog_product_variant_revisions_variant_fk',
    }).onDelete('restrict'),
    check('catalog_product_variant_revisions_number_ck', sql`${table.revision} > 0`),
    check(
      'catalog_product_variant_revisions_lifecycle_ck',
      sql`${table.lifecycleState} in ('WORK_IN_PROGRESS', 'ACTIVE', 'RETIRED')`,
    ),
    check(
      'catalog_product_variant_revisions_kind_ck',
      sql`${table.changeKind} in ('CREATED', 'CORRECTED', 'LIFECYCLE', 'PARENT_CORRECTION', 'AXIS_REVALIDATION')`,
    ),
    check(
      'catalog_product_variant_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_variant_revisions_tenant', table.tenantId),
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
    // Create/revise writes the immutable revision in the same Core transaction; the verifier proves this pointer.
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

export const attributeDefinitions = catalogSchema.table.withRLS(
  'attribute_definitions',
  {
    attributeDefinitionId: uuid('attribute_definition_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    name: text('name').notNull(),
    meaning: text('meaning').notNull(),
    valueKind: text('value_kind').notNull(),
    controlledValueKind: text('controlled_value_kind'),
    multiplicity: text('multiplicity').notNull(),
    applicableLevels: text('applicable_levels').array().notNull(),
    measuredQuantity: text('measured_quantity'),
    canonicalUnit: text('canonical_unit'),
    minimumValue: numeric('minimum_value'),
    maximumValue: numeric('maximum_value'),
    decimalPlaces: integer('decimal_places'),
    allowsUnknown: integer('allows_unknown').default(0).notNull(),
    allowsNotApplicable: integer('allows_not_applicable').default(0).notNull(),
    allowsNone: integer('allows_none').default(0).notNull(),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_attribute_definitions_scope_id_uk').on(table.tenantId, table.attributeDefinitionId),
    check('catalog_attribute_definitions_revision_ck', sql`${table.currentRevision} > 0`),
    check('catalog_attribute_definitions_kind_ck', sql`${table.valueKind} in ('TEXT', 'CONTROLLED', 'MEASUREMENT')`),
    check('catalog_attribute_definitions_multiplicity_ck', sql`${table.multiplicity} in ('SINGLE', 'MULTIPLE')`),
    check(
      'catalog_attribute_definitions_controlled_kind_ck',
      sql`(${table.valueKind} = 'CONTROLLED' and ${table.controlledValueKind} in ('GENERAL', 'COLOR', 'SIZE')) or (${table.valueKind} <> 'CONTROLLED' and ${table.controlledValueKind} is null)`,
    ),
    check(
      'catalog_attribute_definitions_levels_ck',
      sql`cardinality(${table.applicableLevels}) between 1 and 2 and ${table.applicableLevels} <@ array['PRODUCT', 'VARIANT']::text[] and array_position(${table.applicableLevels}, null) is null and (${table.applicableLevels} = array['PRODUCT']::text[] or ${table.applicableLevels} = array['VARIANT']::text[] or ${table.applicableLevels} in (array['PRODUCT','VARIANT']::text[], array['VARIANT','PRODUCT']::text[]))`,
    ),
    check(
      'catalog_attribute_definitions_meaning_ck',
      sql`${table.meaning} = btrim(${table.meaning}) and length(${table.meaning}) between 1 and 1000`,
    ),
    check(
      'catalog_attribute_definitions_name_ck',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240`,
    ),
    check(
      'catalog_attribute_definitions_measurement_ck',
      sql`(${table.valueKind} = 'MEASUREMENT' and ${table.measuredQuantity} is not null and ${table.canonicalUnit} is not null and ${table.decimalPlaces} is not null) or (${table.valueKind} <> 'MEASUREMENT' and ${table.measuredQuantity} is null and ${table.canonicalUnit} is null and ${table.minimumValue} is null and ${table.maximumValue} is null and ${table.decimalPlaces} is null)`,
    ),
    check(
      'catalog_attribute_definitions_range_ck',
      sql`${table.minimumValue} is null or ${table.maximumValue} is null or ${table.minimumValue} <= ${table.maximumValue}`,
    ),
    check(
      'catalog_attribute_definitions_precision_ck',
      sql`${table.decimalPlaces} is null or ${table.decimalPlaces} between 0 and 12`,
    ),
    check(
      'catalog_attribute_definitions_special_ck',
      sql`${table.allowsUnknown} in (0, 1) and ${table.allowsNotApplicable} in (0, 1) and ${table.allowsNone} in (0, 1)`,
    ),
    ...tenantRlsPolicies('catalog_attribute_definitions_tenant', table.tenantId),
  ],
);

export const attributeDefinitionRevisions = catalogSchema.table.withRLS(
  'attribute_definition_revisions',
  {
    attributeDefinitionRevisionId: uuid('attribute_definition_revision_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    revision: integer('revision').notNull(),
    name: text('name').notNull(),
    meaning: text('meaning').notNull(),
    valueKind: text('value_kind').notNull(),
    controlledValueKind: text('controlled_value_kind'),
    multiplicity: text('multiplicity').notNull(),
    applicableLevels: text('applicable_levels').array().notNull(),
    measuredQuantity: text('measured_quantity'),
    canonicalUnit: text('canonical_unit'),
    minimumValue: numeric('minimum_value'),
    maximumValue: numeric('maximum_value'),
    decimalPlaces: integer('decimal_places'),
    allowsUnknown: integer('allows_unknown').notNull(),
    allowsNotApplicable: integer('allows_not_applicable').notNull(),
    allowsNone: integer('allows_none').notNull(),
    reason: text('reason').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_attribute_definition_revisions_number_uk').on(
      table.tenantId,
      table.attributeDefinitionId,
      table.revision,
    ),
    unique('catalog_attribute_definition_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId],
      foreignColumns: [attributeDefinitions.tenantId, attributeDefinitions.attributeDefinitionId],
      name: 'catalog_attribute_definition_revisions_definition_fk',
    }).onDelete('restrict'),
    check('catalog_attribute_definition_revisions_number_ck', sql`${table.revision} > 0`),
    check(
      'catalog_attribute_definition_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_attribute_definition_revisions_tenant', table.tenantId),
  ],
);

export const controlledAttributeValues = catalogSchema.table.withRLS(
  'controlled_attribute_values',
  {
    controlledAttributeValueId: uuid('controlled_attribute_value_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    name: text('name').notNull(),
    meaning: text('meaning').notNull(),
    specialization: text('specialization').notNull(),
    lifecycleState: text('lifecycle_state').default('ACTIVE').notNull(),
    colorGroup: text('color_group'),
    swatchSystem: text('swatch_system'),
    swatchCode: text('swatch_code'),
    previewHex: text('preview_hex'),
    previewEvidenceRef: text('preview_evidence_ref'),
    createdByActionInvocationId: uuid('created_by_action_invocation_id').notNull(),
    createdByPrincipalId: uuid('created_by_principal_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_controlled_values_scope_id_uk').on(table.tenantId, table.controlledAttributeValueId),
    unique('catalog_controlled_values_definition_id_uk').on(
      table.tenantId,
      table.attributeDefinitionId,
      table.controlledAttributeValueId,
    ),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId],
      foreignColumns: [attributeDefinitions.tenantId, attributeDefinitions.attributeDefinitionId],
      name: 'catalog_controlled_values_definition_fk',
    }).onDelete('restrict'),
    check('catalog_controlled_values_revision_ck', sql`${table.currentRevision} > 0`),
    check(
      'catalog_controlled_values_name_ck',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 240`,
    ),
    check('catalog_controlled_values_lifecycle_ck', sql`${table.lifecycleState} in ('ACTIVE', 'RETIRED')`),
    check('catalog_controlled_values_specialization_ck', sql`${table.specialization} in ('GENERAL', 'COLOR', 'SIZE')`),
    check(
      'catalog_controlled_values_swatch_ck',
      sql`(${table.swatchSystem} is null and ${table.swatchCode} is null) or (${table.specialization} = 'COLOR' and ${table.swatchSystem} is not null and ${table.swatchCode} is not null)`,
    ),
    check(
      'catalog_controlled_values_meaning_ck',
      sql`${table.meaning} = btrim(${table.meaning}) and length(${table.meaning}) between 1 and 1000`,
    ),
    check(
      'catalog_controlled_values_preview_ck',
      sql`${table.previewHex} is null or ${table.previewHex} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    ...tenantRlsPolicies('catalog_controlled_values_tenant', table.tenantId),
  ],
);

export const controlledAttributeValueRevisions = catalogSchema.table.withRLS(
  'controlled_attribute_value_revisions',
  {
    controlledAttributeValueRevisionId: uuid('controlled_attribute_value_revision_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    controlledAttributeValueId: uuid('controlled_attribute_value_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    revision: integer('revision').notNull(),
    name: text('name').notNull(),
    meaning: text('meaning').notNull(),
    specialization: text('specialization').notNull(),
    lifecycleState: text('lifecycle_state').notNull(),
    colorGroup: text('color_group'),
    swatchSystem: text('swatch_system'),
    swatchCode: text('swatch_code'),
    previewHex: text('preview_hex'),
    previewEvidenceRef: text('preview_evidence_ref'),
    reason: text('reason').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    unique('catalog_controlled_value_revisions_number_uk').on(
      table.tenantId,
      table.controlledAttributeValueId,
      table.revision,
    ),
    unique('catalog_controlled_value_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId, table.controlledAttributeValueId],
      foreignColumns: [
        controlledAttributeValues.tenantId,
        controlledAttributeValues.attributeDefinitionId,
        controlledAttributeValues.controlledAttributeValueId,
      ],
      name: 'catalog_controlled_value_revisions_value_fk',
    }).onDelete('restrict'),
    check('catalog_controlled_value_revisions_number_ck', sql`${table.revision} > 0`),
    check('catalog_controlled_value_revisions_lifecycle_ck', sql`${table.lifecycleState} in ('ACTIVE', 'RETIRED')`),
    check(
      'catalog_controlled_value_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_controlled_value_revisions_tenant', table.tenantId),
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
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId],
      foreignColumns: [attributeDefinitions.tenantId, attributeDefinitions.attributeDefinitionId],
      name: 'catalog_product_type_revision_attributes_definition_fk',
    }).onDelete('restrict'),
    check(
      'catalog_product_type_revision_attributes_requirement_ck',
      sql`${table.requirement} in ('REQUIRED', 'OPTIONAL')`,
    ),
    check('catalog_product_type_revision_attributes_level_ck', sql`${table.level} in ('PRODUCT', 'VARIANT')`),
    ...tenantRlsPolicies('catalog_product_type_revision_attributes_tenant', table.tenantId),
  ],
);

// An axis is a Product-local role for a shared definition.  The revision is a
// compare-and-swap token for whole-product combination revalidation.
export const productVariantAxes = catalogSchema.table.withRLS(
  'product_variant_axes',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    axisRevision: integer('axis_revision').notNull(),
    ordinal: integer('ordinal').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.productId, table.attributeDefinitionId],
      name: 'catalog_product_variant_axes_pk',
    }),
    unique('catalog_product_variant_axes_ordinal_uk').on(table.tenantId, table.productId, table.ordinal),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_variant_axes_product_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId],
      foreignColumns: [attributeDefinitions.tenantId, attributeDefinitions.attributeDefinitionId],
      name: 'catalog_product_variant_axes_definition_fk',
    }).onDelete('restrict'),
    check('catalog_product_variant_axes_revision_ck', sql`${table.axisRevision} > 0 and ${table.ordinal} >= 0`),
    ...tenantRlsPolicies('catalog_product_variant_axes_tenant', table.tenantId),
  ],
);

export const productVariantAxisEvents = catalogSchema.table.withRLS(
  'product_variant_axis_events',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    axisRevision: integer('axis_revision').notNull(),
    attributeDefinitionIds: uuid('attribute_definition_ids').array().notNull(),
    reason: text('reason').notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.productId, table.axisRevision],
      name: 'catalog_product_variant_axis_events_pk',
    }),
    unique('catalog_product_variant_axis_events_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_product_variant_axis_events_product_fk',
    }).onDelete('restrict'),
    check('catalog_product_variant_axis_events_revision_ck', sql`${table.axisRevision} > 0`),
    check(
      'catalog_product_variant_axis_events_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_variant_axis_events_tenant', table.tenantId),
  ],
);

// A missing Variant set means inheritance.  A present set (including SPECIAL)
// is an explicit complete override; item rows never merge with Product items.
export const attributeValueSets = catalogSchema.table.withRLS(
  'attribute_value_sets',
  {
    attributeValueSetId: uuid('attribute_value_set_id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    variantId: uuid('variant_id'),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    currentRevision: integer('current_revision').default(1).notNull(),
    currentState: text('current_state').default('SET').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('catalog_attribute_value_sets_scope_id_uk').on(table.tenantId, table.attributeValueSetId),
    unique('catalog_attribute_value_sets_definition_id_uk').on(
      table.tenantId,
      table.attributeValueSetId,
      table.attributeDefinitionId,
    ),
    uniqueIndex('catalog_attribute_value_sets_product_uk')
      .on(table.tenantId, table.productId, table.attributeDefinitionId)
      .where(sql`${table.variantId} is null`),
    uniqueIndex('catalog_attribute_value_sets_variant_uk')
      .on(table.tenantId, table.variantId, table.attributeDefinitionId)
      .where(sql`${table.variantId} is not null`),
    foreignKey({
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.productId],
      name: 'catalog_attribute_value_sets_product_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.productId, table.variantId],
      foreignColumns: [productVariants.tenantId, productVariants.productId, productVariants.variantId],
      name: 'catalog_attribute_value_sets_variant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId],
      foreignColumns: [attributeDefinitions.tenantId, attributeDefinitions.attributeDefinitionId],
      name: 'catalog_attribute_value_sets_definition_fk',
    }).onDelete('restrict'),
    check('catalog_attribute_value_sets_revision_ck', sql`${table.currentRevision} > 0`),
    check('catalog_attribute_value_sets_state_ck', sql`${table.currentState} in ('SET', 'REMOVED')`),
    ...tenantRlsPolicies('catalog_attribute_value_sets_tenant', table.tenantId),
  ],
);

export const attributeValueItems = catalogSchema.table.withRLS(
  'attribute_value_items',
  {
    tenantId: uuid('tenant_id').notNull(),
    attributeValueSetId: uuid('attribute_value_set_id').notNull(),
    attributeDefinitionId: uuid('attribute_definition_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    valueKind: text('value_kind').notNull(),
    textValue: text('text_value'),
    numericValue: numeric('numeric_value'),
    unit: text('unit'),
    controlledAttributeValueId: uuid('controlled_attribute_value_id'),
    specialState: text('special_state'),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.attributeValueSetId, table.ordinal],
      name: 'catalog_attribute_value_items_pk',
    }),
    foreignKey({
      columns: [table.tenantId, table.attributeValueSetId, table.attributeDefinitionId],
      foreignColumns: [
        attributeValueSets.tenantId,
        attributeValueSets.attributeValueSetId,
        attributeValueSets.attributeDefinitionId,
      ],
      name: 'catalog_attribute_value_items_set_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.attributeDefinitionId, table.controlledAttributeValueId],
      foreignColumns: [
        controlledAttributeValues.tenantId,
        controlledAttributeValues.attributeDefinitionId,
        controlledAttributeValues.controlledAttributeValueId,
      ],
      name: 'catalog_attribute_value_items_controlled_fk',
    }).onDelete('restrict'),
    check('catalog_attribute_value_items_ordinal_ck', sql`${table.ordinal} >= 0`),
    check(
      'catalog_attribute_value_items_shape_ck',
      sql`(${table.valueKind} = 'TEXT' and ${table.textValue} is not null and ${table.numericValue} is null and ${table.unit} is null and ${table.controlledAttributeValueId} is null and ${table.specialState} is null) or (${table.valueKind} = 'MEASUREMENT' and ${table.textValue} is null and ${table.numericValue} is not null and ${table.unit} is not null and ${table.controlledAttributeValueId} is null and ${table.specialState} is null) or (${table.valueKind} = 'CONTROLLED' and ${table.textValue} is null and ${table.numericValue} is null and ${table.unit} is null and ${table.controlledAttributeValueId} is not null and ${table.specialState} is null) or (${table.valueKind} = 'SPECIAL' and ${table.textValue} is null and ${table.numericValue} is null and ${table.unit} is null and ${table.controlledAttributeValueId} is null and ${table.specialState} in ('UNKNOWN', 'NOT_APPLICABLE', 'NONE'))`,
    ),
    ...tenantRlsPolicies('catalog_attribute_value_items_tenant', table.tenantId),
  ],
);

export const attributeValueRevisions = catalogSchema.table.withRLS(
  'attribute_value_revisions',
  {
    tenantId: uuid('tenant_id').notNull(),
    attributeValueSetId: uuid('attribute_value_set_id').notNull(),
    revision: integer('revision').notNull(),
    changeKind: text('change_kind').notNull(),
    valueSnapshot: jsonb('value_snapshot').notNull(),
    reason: text('reason').notNull(),
    evidenceRefs: text('evidence_refs').array().notNull(),
    actionInvocationId: uuid('action_invocation_id').notNull(),
    actingPrincipalId: uuid('acting_principal_id').notNull(),
    recordedAt: recordedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.attributeValueSetId, table.revision],
      name: 'catalog_attribute_value_revisions_pk',
    }),
    unique('catalog_attribute_value_revisions_invocation_uk').on(table.tenantId, table.actionInvocationId),
    foreignKey({
      columns: [table.tenantId, table.attributeValueSetId],
      foreignColumns: [attributeValueSets.tenantId, attributeValueSets.attributeValueSetId],
      name: 'catalog_attribute_value_revisions_set_fk',
    }).onDelete('restrict'),
    check('catalog_attribute_value_revisions_number_ck', sql`${table.revision} > 0`),
    check('catalog_attribute_value_revisions_kind_ck', sql`${table.changeKind} in ('SET', 'REMOVED')`),
    check(
      'catalog_attribute_value_revisions_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_attribute_value_revisions_tenant', table.tenantId),
  ],
);

export const productTypeAssignments = catalogSchema.table.withRLS(
  'product_type_assignments',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    productTypeId: uuid('product_type_id').notNull(),
    // Assignment writes append the matching event in the same transaction; removal leaves only the event.
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
    // Every Category writer locks this row first, advances exactly one counter, and appends its event atomically.
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
    previousName: text('previous_name'),
    nextName: text('next_name'),
    previousLifecycleState: text('previous_lifecycle_state'),
    nextLifecycleState: text('next_lifecycle_state'),
    categoryRevision: integer('category_revision'),
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
    uniqueIndex('catalog_product_category_events_category_revision_uk')
      .on(table.tenantId, table.categoryId, table.categoryRevision)
      .where(sql`${table.changeKind} in ('CREATED', 'RENAMED', 'MOVED', 'RETIRED')`),
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
    foreignKey({
      columns: [table.tenantId, table.previousParentCategoryId],
      foreignColumns: [productCategories.tenantId, productCategories.categoryId],
      name: 'catalog_product_category_events_previous_parent_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.nextParentCategoryId],
      foreignColumns: [productCategories.tenantId, productCategories.categoryId],
      name: 'catalog_product_category_events_next_parent_fk',
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
    check('catalog_product_category_events_category_revision_ck', sql`${table.categoryRevision} > 0`),
    check(
      'catalog_product_category_events_snapshot_ck',
      sql`${table.changeKind} not in ('CREATED', 'RENAMED', 'MOVED', 'RETIRED') or (${table.nextName} is not null and ${table.nextLifecycleState} is not null)`,
    ),
    check(
      'catalog_product_category_events_previous_lifecycle_ck',
      sql`${table.previousLifecycleState} is null or ${table.previousLifecycleState} in ('ACTIVE', 'RETIRED')`,
    ),
    check(
      'catalog_product_category_events_next_lifecycle_ck',
      sql`${table.nextLifecycleState} is null or ${table.nextLifecycleState} in ('ACTIVE', 'RETIRED')`,
    ),
    check(
      'catalog_product_category_events_previous_name_ck',
      sql`${table.previousName} is null or (${table.previousName} = btrim(${table.previousName}) and length(${table.previousName}) between 1 and 240)`,
    ),
    check(
      'catalog_product_category_events_next_name_ck',
      sql`${table.nextName} is null or (${table.nextName} = btrim(${table.nextName}) and length(${table.nextName}) between 1 and 240)`,
    ),
    check(
      'catalog_product_category_events_reason_ck',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) between 1 and 1000`,
    ),
    ...tenantRlsPolicies('catalog_product_category_events_tenant', table.tenantId),
  ],
);

const catalogDatabaseSchema = {
  attributeDefinitionRevisions,
  attributeDefinitions,
  attributeValueItems,
  attributeValueRevisions,
  attributeValueSets,
  controlledAttributeValueRevisions,
  controlledAttributeValues,
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
  productVariantAxes,
  productVariantAxisEvents,
  productVariantRevisions,
  productVariants,
  products,
} as const;

export const CATALOG_TABLES = [
  attributeDefinitionRevisions,
  attributeDefinitions,
  attributeValueItems,
  attributeValueRevisions,
  attributeValueSets,
  controlledAttributeValueRevisions,
  controlledAttributeValues,
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
  productVariantAxes,
  productVariantAxisEvents,
  productVariantRevisions,
  productVariants,
  products,
] as const;

export const catalogRelations = defineRelations(catalogDatabaseSchema);
