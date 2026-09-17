import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Match, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { productCategories, productCategoryHierarchyRevisions } from '../../src/database/schema.ts';
import { categoryPersistenceForScope } from '../../src/persistence/category-persistence.ts';

const tenantId = '00000000-0000-4000-8000-000000000001';
const categoryA = '00000000-0000-4000-8000-000000000002';
const categoryB = '00000000-0000-4000-8000-000000000003';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:category-test:run:1',
    authMethod: 'system',
    principalId: '00000000-0000-4000-8000-000000000005',
    tenantId,
  }),
  correlationId: 'category-test',
};
const input = {
  actionInvocationId: '00000000-0000-4000-8000-000000000004',
  principalId: '00000000-0000-4000-8000-000000000005',
  reason: 'Organize catalog',
  tenantId,
};

const revisionLockQuery = (calls: string[]) => ({
  where: () => ({
    for: () => {
      calls.push('revision-lock');
      return { limit: () => Effect.succeed([{ assignmentRevision: 0, hierarchyRevision: 1, tenantId }]) };
    },
  }),
});

const categoryReadQuery = (
  rows: {
    categoryId: string;
    currentRevision: number;
    lifecycleState: string;
    name: string;
    parentCategoryId: string | null;
    tenantId: string;
  }[],
) => ({
  where: () => ({ limit: () => Effect.succeed([rows.shift()]) }),
});

describe('Category persistence transaction boundary', () => {
  it.effect('rejects a tenant mismatch before touching the transaction', () =>
    Effect.gen(function* tenantMismatch() {
      const transaction = new Proxy(
        {},
        {
          get: () => {
            throw new Error('transaction touched');
          },
        },
      );
      // @ts-expect-error The deliberately uncallable transaction proves that no DB access occurs.
      const persistence = yield* categoryPersistenceForScope(transaction, scope);
      const outcome = yield* persistence.createCategory({
        ...input,
        categoryId: categoryA,
        name: 'A',
        tenantId: '00000000-0000-4000-8000-000000000099',
      });
      expect(
        Match.value(outcome).pipe(
          Match.tag('not_found', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
    }),
  );

  it.effect('locks the tenant revision before reading a move and rejects a reciprocal cycle', () =>
    Effect.gen(function* reciprocalCycle() {
      const calls: string[] = [];
      const categoryRows = [
        {
          categoryId: categoryA,
          currentRevision: 1,
          lifecycleState: 'ACTIVE',
          name: 'A',
          parentCategoryId: null,
          tenantId,
        },
        {
          categoryId: categoryB,
          currentRevision: 1,
          lifecycleState: 'ACTIVE',
          name: 'B',
          parentCategoryId: categoryA,
          tenantId,
        },
        {
          categoryId: categoryB,
          currentRevision: 1,
          lifecycleState: 'ACTIVE',
          name: 'B',
          parentCategoryId: categoryA,
          tenantId,
        },
      ];
      const transaction = {
        insert: (table: typeof productCategories | typeof productCategoryHierarchyRevisions) => {
          expect(table).toBe(productCategoryHierarchyRevisions);
          calls.push('revision-upsert');
          return { values: () => ({ onConflictDoNothing: () => Effect.succeed([]) }) };
        },
        select: () => ({
          from: (table: typeof productCategories | typeof productCategoryHierarchyRevisions) => {
            if (table === productCategoryHierarchyRevisions) {
              calls.push('revision-select');
              return revisionLockQuery(calls);
            }
            expect(table).toBe(productCategories);
            calls.push('category-read');
            return categoryReadQuery(categoryRows);
          },
        }),
        update: () => {
          throw new Error('cycle must not write');
        },
      };
      // @ts-expect-error The mock implements only the query chain reached by a rejected cycle.
      const persistence = yield* categoryPersistenceForScope(transaction, scope);
      const outcome = yield* persistence.moveCategory({
        ...input,
        categoryId: categoryA,
        expectedRevision: 1,
        parentCategoryId: categoryB,
      });
      expect(
        Match.value(outcome).pipe(
          Match.tag('hierarchy_conflict', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(calls).toEqual([
        'revision-upsert',
        'revision-select',
        'revision-lock',
        'category-read',
        'category-read',
        'category-read',
      ]);
    }),
  );
});
