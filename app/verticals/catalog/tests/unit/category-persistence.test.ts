import type { OperationalScope } from '@app/core-runtime';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { productCategories, productCategoryHierarchyRevisions } from '../../src/database/schema.ts';
import { categoryPersistenceForScope } from '../../src/persistence/category-persistence.ts';

const tenantId = '00000000-0000-4000-8000-000000000001';
const categoryA = '00000000-0000-4000-8000-000000000002';
const categoryB = '00000000-0000-4000-8000-000000000003';
const scope = { tenantId } as OperationalScope;
const input = {
  actionInvocationId: '00000000-0000-4000-8000-000000000004',
  principalId: '00000000-0000-4000-8000-000000000005',
  reason: 'Organize catalog',
  tenantId,
};

describe('Category persistence transaction boundary', () => {
  it('rejects a tenant mismatch before touching the transaction', async () => {
    const transaction = new Proxy(
      {},
      {
        get: () => {
          throw new Error('transaction touched');
        },
      },
    );
    const persistence = await Effect.runPromise(categoryPersistenceForScope(transaction as never, scope));
    const outcome = await Effect.runPromise(
      persistence.createCategory({
        ...input,
        categoryId: categoryA,
        name: 'A',
        tenantId: '00000000-0000-4000-8000-000000000099',
      }),
    );
    expect(outcome._tag).toBe('not_found');
  });

  it('locks the tenant revision before reading a move and rejects a reciprocal cycle', async () => {
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
      insert: (table: unknown) => {
        expect(table).toBe(productCategoryHierarchyRevisions);
        calls.push('revision-upsert');
        return { values: () => ({ onConflictDoNothing: () => Effect.succeed([]) }) };
      },
      select: () => ({
        from: (table: unknown) => {
          if (table === productCategoryHierarchyRevisions) {
            calls.push('revision-select');
            return {
              where: () => ({
                for: () => {
                  calls.push('revision-lock');
                  return { limit: () => Effect.succeed([{ assignmentRevision: 0, hierarchyRevision: 1, tenantId }]) };
                },
              }),
            };
          }
          expect(table).toBe(productCategories);
          calls.push('category-read');
          return { where: () => ({ limit: () => Effect.succeed([categoryRows.shift()]) }) };
        },
      }),
      update: () => {
        throw new Error('cycle must not write');
      },
    };
    const persistence = await Effect.runPromise(categoryPersistenceForScope(transaction as never, scope));
    const outcome = await Effect.runPromise(
      persistence.moveCategory({
        ...input,
        categoryId: categoryA,
        expectedRevision: 1,
        parentCategoryId: categoryB,
      }),
    );
    expect(outcome._tag).toBe('hierarchy_conflict');
    expect(calls).toEqual([
      'revision-upsert',
      'revision-select',
      'revision-lock',
      'category-read',
      'category-read',
      'category-read',
    ]);
  });
});
