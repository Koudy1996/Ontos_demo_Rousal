// @effect-diagnostics nodeBuiltinImport:off -- Migration contract reads checked-in Catalog SQL; expires: 2027-03-31.
import { expect, it } from 'effect-rstest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Array as EffectArray, Order } from 'effect';
import { readdirSync, readFileSync } from 'node:fs';

import {
  CATALOG_SCHEMA_NAME,
  CATALOG_TABLE_INVENTORY,
  CATALOG_TABLES,
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
} from '../../src/database/schema.ts';

it('owns thirteen tenant-scoped Catalog tables with RLS and immutable history', () => {
  const qualifiedNames = EffectArray.sort(
    CATALOG_TABLES.map((table) => {
      const config = getTableConfig(table);
      return `${config.schema}.${config.name}`;
    }),
    Order.String,
  );

  expect(CATALOG_SCHEMA_NAME).toBe('catalog');
  expect(CATALOG_TABLE_INVENTORY).toEqual([
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
});

it('keeps Product identity, Variant ownership, and historical revision keys constrained', () => {
  expect(getTableConfig(products).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_products_scope_id_uk',
  );
  expect(getTableConfig(productVariants).foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    'catalog_product_variants_product_fk',
  );
  expect(getTableConfig(productRevisions).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_revisions_number_uk',
  );
  expect(getTableConfig(productLifecycleEvents).uniqueConstraints.map((constraint) => constraint.name)).toContain(
    'catalog_product_lifecycle_invocation_uk',
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
});
