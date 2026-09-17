import { findPostgresFailure, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { eq, inArray, sql } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  makeTestDatabaseFromPool,
  testDatabasePools,
} from '../../../../packages/core-runtime/tests/support/database.ts';
import { purgeFixtureRows } from '../../../../packages/core-runtime/tests/support/fixture-cleanup.ts';
import {
  catalogRelations,
  productCategories,
  productCategoryAssignments,
  productCategoryEvents,
  productCategoryHierarchyRevisions,
  products,
} from '../../src/database/schema.ts';
import type { CatalogTransaction } from '../../src/database/types.ts';
import { categoryPersistenceForScope } from '../../src/persistence/category-persistence.ts';

const tenantA = 'c4050000-0000-4000-8000-000000000001';
const tenantB = 'c4050000-0000-4000-8000-000000000002';
const principalId = 'c4050000-0000-4000-8000-000000000003';
const firstId = 'c4050000-0000-4000-8000-000000000004';
const secondId = 'c4050000-0000-4000-8000-000000000005';
const retiringId = 'c4050000-0000-4000-8000-000000000006';
const productA = 'c4050000-0000-4000-8000-000000000007';
const productB = 'c4050000-0000-4000-8000-000000000008';
const fixtureTenants = [tenantA, tenantB];

const scopeFor = (tenantId: string) => ({
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:category-postgres-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'category-postgres-test',
});

const mutation = (tenantId: string, actionInvocationId: string) => ({
  actionInvocationId,
  principalId,
  reason: 'PostgreSQL category boundary proof',
  tenantId,
});

it.live('serializes category moves and retirement against assignments while enforcing tenant boundaries', () =>
  Effect.scoped(
    Effect.gen(function* categoryPostgresBoundary() {
      const { admin: adminPool, runtimePool } = yield* testDatabasePools;
      const admin = yield* makeTestDatabaseFromPool(adminPool, catalogRelations);
      const runtime = yield* makeTestDatabaseFromPool(runtimePool, catalogRelations);
      const cleanup = () =>
        purgeFixtureRows([
          admin.delete(productCategoryEvents).where(inArray(productCategoryEvents.tenantId, fixtureTenants)),
          admin.delete(productCategoryAssignments).where(inArray(productCategoryAssignments.tenantId, fixtureTenants)),
          admin.delete(productCategories).where(inArray(productCategories.tenantId, fixtureTenants)),
          admin
            .delete(productCategoryHierarchyRevisions)
            .where(inArray(productCategoryHierarchyRevisions.tenantId, fixtureTenants)),
          admin.delete(products).where(inArray(products.tenantId, fixtureTenants)),
        ]);
      yield* Effect.acquireRelease(cleanup(), () => cleanup().pipe(Effect.orDie));

      const withTenant = <Value, Failure>(
        tenantId: string,
        operation: (transaction: CatalogTransaction) => Effect.Effect<Value, Failure>,
      ) =>
        runtime.transaction((transaction) =>
          Effect.gen(function* scopedCategoryTransaction() {
            yield* transaction.execute(sql`select set_config('ontos.tenant_id', ${tenantId}, true)`, 'objects');
            return yield* operation(transaction);
          }),
        );
      const categoryService = (transaction: CatalogTransaction) =>
        // The fixture installs tenant scope before passing the owner transaction. Core's private
        // brand is intentionally unavailable to package tests, while the query methods are real.
        categoryPersistenceForScope(
          // @ts-expect-error The test transaction intentionally lacks only Core's private scope brand.
          transaction,
          scopeFor(tenantA),
        );

      yield* admin.insert(productCategories).values([
        {
          categoryId: firstId,
          createdByActionInvocationId: firstId,
          createdByPrincipalId: principalId,
          name: 'First',
          tenantId: tenantA,
        },
        {
          categoryId: secondId,
          createdByActionInvocationId: secondId,
          createdByPrincipalId: principalId,
          name: 'Second',
          tenantId: tenantA,
        },
        {
          categoryId: retiringId,
          createdByActionInvocationId: retiringId,
          createdByPrincipalId: principalId,
          name: 'Retiring',
          tenantId: tenantA,
        },
      ]);
      yield* admin.insert(products).values([
        {
          createdByActionInvocationId: productA,
          createdByPrincipalId: principalId,
          productId: productA,
          tenantId: tenantA,
        },
        {
          createdByActionInvocationId: productB,
          createdByPrincipalId: principalId,
          productId: productB,
          tenantId: tenantB,
        },
      ]);

      const moves = yield* Effect.all(
        [
          withTenant(tenantA, (transaction) =>
            Effect.gen(function* moveFirst() {
              const service = yield* categoryService(transaction);
              return yield* service.moveCategory({
                ...mutation(tenantA, 'c4050000-0000-4000-8000-000000000009'),
                categoryId: firstId,
                expectedRevision: 1,
                parentCategoryId: secondId,
              });
            }),
          ),
          withTenant(tenantA, (transaction) =>
            Effect.gen(function* moveSecond() {
              const service = yield* categoryService(transaction);
              return yield* service.moveCategory({
                ...mutation(tenantA, 'c4050000-0000-4000-8000-00000000000a'),
                categoryId: secondId,
                expectedRevision: 1,
                parentCategoryId: firstId,
              });
            }),
          ),
        ],
        { concurrency: 2 },
      );
      expect(new Set(moves.map((outcome) => outcome._tag))).toEqual(new Set(['hierarchy_conflict', 'moved']));
      const rows = yield* admin.select().from(productCategories).where(eq(productCategories.tenantId, tenantA));
      const first = rows.find((row) => row.categoryId === firstId);
      const second = rows.find((row) => row.categoryId === secondId);
      expect(first?.parentCategoryId === secondId && second?.parentCategoryId === firstId).toBe(false);

      const race = yield* Effect.all(
        [
          withTenant(tenantA, (transaction) =>
            Effect.gen(function* assignBeforeRetire() {
              const service = yield* categoryService(transaction);
              return yield* service.addAssignment({
                ...mutation(tenantA, 'c4050000-0000-4000-8000-00000000000b'),
                categoryId: retiringId,
                productId: productA,
              });
            }),
          ),
          withTenant(tenantA, (transaction) =>
            Effect.gen(function* retireBeforeAssign() {
              const service = yield* categoryService(transaction);
              return yield* service.retireCategory({
                ...mutation(tenantA, 'c4050000-0000-4000-8000-00000000000c'),
                categoryId: retiringId,
                expectedRevision: 1,
              });
            }),
          ),
        ],
        { concurrency: 2 },
      );
      const [retiring] = yield* admin
        .select()
        .from(productCategories)
        .where(eq(productCategories.categoryId, retiringId));
      const assignments = yield* admin
        .select()
        .from(productCategoryAssignments)
        .where(eq(productCategoryAssignments.categoryId, retiringId));
      expect(retiring?.lifecycleState === 'RETIRED' && assignments.length > 0).toBe(false);
      expect(new Set(race.map((outcome) => outcome._tag))).toEqual(
        new Set(
          retiring?.lifecycleState === 'RETIRED' ? ['lifecycle_conflict', 'retired'] : ['added', 'reference_conflict'],
        ),
      );

      expect(yield* withTenant(tenantB, (transaction) => transaction.select().from(productCategories))).toEqual([]);
      const role = yield* runtime.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
        sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
        'objects',
      );
      expect(role).toEqual([{ rolbypassrls: false, rolsuper: false }]);
      const foreignInsertError = yield* Effect.flip(
        withTenant(tenantB, (transaction) =>
          transaction.insert(productCategoryAssignments).values({
            assignedByActionInvocationId: 'c4050000-0000-4000-8000-00000000000d',
            assignedByPrincipalId: principalId,
            categoryId: retiringId,
            productId: productB,
            tenantId: tenantB,
          }),
        ),
      );
      expect(Option.exists(findPostgresFailure(foreignInsertError), ({ code }) => code === '23503')).toBe(true);
    }),
  ),
);
