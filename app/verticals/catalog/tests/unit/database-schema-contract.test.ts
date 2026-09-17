// @effect-diagnostics nodeBuiltinImport:off -- Migration contract reads checked-in Catalog SQL; expires: 2027-03-31.
import { expect, it } from 'effect-rstest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Array as EffectArray, Order } from 'effect';
import { readdirSync, readFileSync } from 'node:fs';

import {
  CATALOG_SCHEMA_NAME,
  CATALOG_TABLE_INVENTORY,
  CATALOG_TABLES,
  attributeDefinitionRevisions,
  attributeDefinitions,
  attributeValueItems,
  attributeValueRevisions,
  attributeValueSets,
  controlledAttributeValueRevisions,
  controlledAttributeValues,
  packageContentRevisions,
  packageDefinitions,
  packageUnitDivisibility,
  packageUnitDivisibilityRevisions,
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
  productUnits,
  productUnitRuleRevisions,
  variantUnitDivisibility,
  variantUnitDivisibilityRevisions,
  productVariants,
  productVariantAxes,
  productVariantAxisEvents,
  productVariantRevisions,
  products,
} from '../../src/database/schema.ts';

it('owns thirty-one tenant-scoped Catalog tables with RLS and immutable history', () => {
  const qualifiedNames = EffectArray.sort(
    CATALOG_TABLES.map((table) => {
      const config = getTableConfig(table);
      return `${config.schema}.${config.name}`;
    }),
    Order.String,
  );

  expect(CATALOG_SCHEMA_NAME).toBe('catalog');
  expect(CATALOG_TABLE_INVENTORY).toEqual([
    'attribute_definition_revisions',
    'attribute_definitions',
    'attribute_value_items',
    'attribute_value_revisions',
    'attribute_value_sets',
    'controlled_attribute_value_revisions',
    'controlled_attribute_values',
    'package_content_revisions',
    'package_definitions',
    'package_unit_divisibility',
    'package_unit_divisibility_revisions',
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
    'product_unit_rule_revisions',
    'product_units',
    'product_variant_axes',
    'product_variant_axis_events',
    'product_variant_revisions',
    'product_variants',
    'products',
    'variant_unit_divisibility',
    'variant_unit_divisibility_revisions',
  ]);
  expect(qualifiedNames).toEqual(CATALOG_TABLE_INVENTORY.map((name) => `catalog.${name}`));
  for (const table of CATALOG_TABLES) {
    const config = getTableConfig(table);
    expect(config.enableRLS, `${config.name} must enable RLS`).toBe(true);
    expect(config.columns.some((column) => column.name === 'tenant_id' && column.notNull)).toBe(true);
    expect(config.policies.map((policy) => policy.for)).toEqual(['select', 'insert', 'update', 'delete']);
    expect(config.policies.every((policy) => policy.to === 'ontos_runtime')).toBe(true);
  }
});

it('pins homogeneous Package content to one Variant and an exact lower revision', () => {
  expect(getTableConfig(packageDefinitions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_package_definitions_variant_fk',
  ]);
  expect(getTableConfig(packageContentRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_package_content_revisions_definition_fk',
    'catalog_package_content_revisions_unit_fk',
    'catalog_package_content_revisions_lower_form_fk',
    'catalog_package_content_revisions_lower_revision_fk',
  ]);
  expect(getTableConfig(packageContentRevisions).checks.map((key) => key.name)).toEqual(
    expect.arrayContaining([
      'catalog_package_content_revisions_amount_ck',
      'catalog_package_content_revisions_lower_ck',
      'catalog_package_content_revisions_set_ck',
      'catalog_package_content_revisions_unit_ck',
    ]),
  );
  expect(getTableConfig(packageDefinitions).columns.map((column) => column.name)).toContain('option_state');
});

it('anchors Unit rules and target divisibility in tenant-owned immutable revision history', () => {
  expect(getTableConfig(productUnits).uniqueConstraints.map((key) => key.name)).toContain(
    'catalog_product_units_code_uk',
  );
  expect(getTableConfig(productUnitRuleRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_product_unit_rule_revisions_unit_fk',
  ]);
  expect(getTableConfig(variantUnitDivisibility).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_variant_unit_divisibility_variant_fk',
    'catalog_variant_unit_divisibility_unit_fk',
  ]);
  expect(getTableConfig(variantUnitDivisibilityRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_variant_unit_divisibility_revisions_target_fk',
    'catalog_variant_unit_divisibility_revisions_unit_fk',
  ]);
  expect(getTableConfig(packageUnitDivisibility).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_package_unit_divisibility_package_fk',
    'catalog_package_unit_divisibility_unit_fk',
  ]);
  expect(getTableConfig(packageUnitDivisibilityRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_package_unit_divisibility_revisions_target_fk',
    'catalog_package_unit_divisibility_revisions_unit_fk',
  ]);
});

it('constrains Product Type revisions, rule levels, and a single current assignment', () => {
  expect(getTableConfig(productTypes).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_types_scope_id_uk',
  );
  expect(getTableConfig(productTypeRevisions).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_type_revisions_number_uk',
  );
  expect(getTableConfig(productTypeRevisionAttributes).primaryKeys.map((key) => key.getName())).toContain(
    'catalog_product_type_revision_attributes_pk',
  );
  expect(getTableConfig(productTypeRevisionAttributes).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_product_type_revision_attributes_revision_fk',
    'catalog_product_type_revision_attributes_definition_fk',
  ]);
  expect(getTableConfig(productTypeAssignments).primaryKeys.map((key) => key.getName())).toContain(
    'catalog_product_type_assignments_pk',
  );
  expect(getTableConfig(productTypeAssignments).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_product_type_assignments_product_fk',
    'catalog_product_type_assignments_type_fk',
  ]);
  expect(getTableConfig(productTypeAssignmentEvents).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_type_assignment_events_number_uk',
  );
});

it('constrains shared Attribute identity, revision history, and controlled-value ownership', () => {
  expect(getTableConfig(attributeDefinitions).uniqueConstraints.map((key) => key.name)).toContain(
    'catalog_attribute_definitions_scope_id_uk',
  );
  expect(getTableConfig(attributeDefinitionRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_attribute_definition_revisions_definition_fk',
  ]);
  expect(getTableConfig(controlledAttributeValues).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_controlled_values_definition_fk',
  ]);
  expect(getTableConfig(controlledAttributeValueRevisions).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_controlled_value_revisions_value_fk',
  ]);
  expect(getTableConfig(controlledAttributeValueRevisions).uniqueConstraints.map((key) => key.name)).toContain(
    'catalog_controlled_value_revisions_number_uk',
  );
});

it('constrains tenant-qualified Category hierarchy, direct links, and revision lock', () => {
  expect(getTableConfig(productCategories).foreignKeys.map((key) => key.getName())).toContain(
    'catalog_product_categories_parent_fk',
  );
  expect(getTableConfig(productCategoryAssignments).primaryKeys.map((key) => key.getName())).toContain(
    'catalog_product_category_assignments_pk',
  );
  expect(getTableConfig(productCategoryAssignments).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_product_category_assignments_product_fk',
    'catalog_product_category_assignments_category_fk',
  ]);
  expect(getTableConfig(productCategoryHierarchyRevisions).columns.map((column) => column.name)).toContain(
    'assignment_revision',
  );
  expect(getTableConfig(productCategoryEvents).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_category_events_invocation_uk',
  );
  expect(getTableConfig(productCategoryEvents).indexes.map((index) => index.config.name)).toContain(
    'catalog_product_category_events_category_revision_uk',
  );
  expect(getTableConfig(productCategoryEvents).checks.map((constraint) => constraint.name)).toContain(
    'catalog_product_category_events_snapshot_ck',
  );
  expect(getTableConfig(productCategoryEvents).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_product_category_events_category_fk',
    'catalog_product_category_events_product_fk',
    'catalog_product_category_events_previous_parent_fk',
    'catalog_product_category_events_next_parent_fk',
  ]);
  for (const name of [
    'previous_name',
    'next_name',
    'previous_lifecycle_state',
    'next_lifecycle_state',
    'category_revision',
  ]) {
    expect(getTableConfig(productCategoryEvents).columns.map((column) => column.name)).toContain(name);
  }
});

it('keeps Product identity, Variant ownership, and historical revision keys constrained', () => {
  expect(getTableConfig(products).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_products_scope_id_uk',
  );
  expect(getTableConfig(productVariants).foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    'catalog_product_variants_product_fk',
  );
  expect(getTableConfig(productVariants).indexes.map((index) => index.config.name)).toContain(
    'catalog_product_variants_active_combination_uk',
  );
  expect(getTableConfig(productVariantRevisions).foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    'catalog_product_variant_revisions_variant_fk',
  );
  expect(getTableConfig(productVariantAxes).foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual([
    'catalog_product_variant_axes_product_fk',
    'catalog_product_variant_axes_definition_fk',
  ]);
  expect(getTableConfig(productVariantAxisEvents).primaryKeys.map((key) => key.getName())).toContain(
    'catalog_product_variant_axis_events_pk',
  );
  expect(getTableConfig(productRevisions).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_revisions_number_uk',
  );
  expect(getTableConfig(productLifecycleEvents).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_lifecycle_invocation_uk',
  );
});

it('separates Product and Variant value sets with controlled-value ownership and immutable revisions', () => {
  expect(getTableConfig(attributeValueSets).indexes.map((index) => index.config.name)).toEqual([
    'catalog_attribute_value_sets_product_uk',
    'catalog_attribute_value_sets_variant_uk',
  ]);
  expect(getTableConfig(attributeValueItems).foreignKeys.map((key) => key.getName())).toEqual([
    'catalog_attribute_value_items_set_fk',
    'catalog_attribute_value_items_controlled_fk',
  ]);
  expect(getTableConfig(attributeValueRevisions).primaryKeys.map((key) => key.getName())).toContain(
    'catalog_attribute_value_revisions_pk',
  );
});

it('checks migration hardening for force-RLS, append-only history, and stable identity', () => {
  const migrationRoot = new URL('../../drizzle/', import.meta.url);
  const combined = EffectArray.sort(readdirSync(migrationRoot), Order.String)
    .map((folder) => readFileSync(new URL(`${folder}/migration.sql`, migrationRoot), 'utf-8'))
    .join('\n');

  for (const table of CATALOG_TABLE_INVENTORY) {
    expect(combined).toContain(`ALTER TABLE "catalog"."${table}" FORCE ROW LEVEL SECURITY`);
  }
  expect(combined).toContain('catalog_product_revisions_append_only');
  expect(combined).toContain('catalog_product_lifecycle_events_append_only');
  expect(combined).toContain('catalog_products_identity_immutable');
  expect(combined).toContain('catalog_product_variants_identity_immutable');
  expect(combined).toContain('catalog_product_type_revisions_append_only');
  expect(combined).toContain('catalog_product_type_revision_attributes_append_only');
  expect(combined).toContain('catalog_product_type_assignment_events_append_only');
  expect(combined).toContain('catalog_product_category_events_append_only');
  expect(combined).toContain('catalog_product_types_identity_immutable');
  expect(combined).toContain('catalog_product_categories_identity_immutable');
  expect(combined).toContain('catalog_category_revision_counters_monotonic');
  expect(combined).toContain('catalog_attribute_definition_revisions_append_only');
  expect(combined).toContain('catalog_controlled_value_revisions_append_only');
  expect(combined).toContain('catalog_attribute_definitions_identity_immutable');
  expect(combined).toContain('catalog_controlled_values_identity_immutable');
  expect(combined).toContain('catalog_controlled_values_definition_kind');
  expect(combined).toContain('catalog_attribute_value_revisions_append_only');
  expect(combined).toContain('catalog_product_variant_axis_events_append_only');
  expect(combined).toContain('catalog_product_variant_revisions_append_only');
  expect(combined).toContain('catalog_product_type_assignment_current_pointer');
  expect(combined).toContain('catalog_product_type_assignment_event_pointer');
  expect(combined).toContain('catalog_package_content_revisions_append_only');
  expect(combined).toContain('catalog_package_definitions_identity_immutable');
  expect(combined).toContain('catalog_product_unit_rule_revisions_append_only');
  expect(combined).toContain('catalog_variant_unit_divisibility_revisions_append_only');
  expect(combined).toContain('catalog_package_unit_divisibility_revisions_append_only');
  expect(combined).toContain('catalog_product_units_identity_immutable');
  expect(combined).toContain('catalog_variant_unit_divisibility_identity_immutable');
  expect(combined).toContain('catalog_package_unit_divisibility_identity_immutable');
  expect(combined).toContain('catalog_package_content_revisions_unit_fk');
  expect(combined).toContain("'commerce.catalog.product-unit') NOT VALID");
});
