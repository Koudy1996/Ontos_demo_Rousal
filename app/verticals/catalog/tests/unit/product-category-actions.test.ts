import { describe, expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';

import {
  AddProductCategoryAssignmentPayloadSchema,
  addProductCategoryAssignmentAction,
  handleAddProductCategoryAssignment,
} from '../../src/actions/add-product-category-assignment.action.ts';
import {
  CreateProductCategoryPayloadSchema,
  createProductCategoryAction,
  handleCreateProductCategory,
} from '../../src/actions/create-product-category.action.ts';
import {
  MoveProductCategoryPayloadSchema,
  handleMoveProductCategory,
  moveProductCategoryAction,
} from '../../src/actions/move-product-category.action.ts';
import {
  handleRemoveProductCategoryAssignment,
  removeProductCategoryAssignmentAction,
} from '../../src/actions/remove-product-category-assignment.action.ts';
import {
  handleRenameProductCategory,
  renameProductCategoryAction,
} from '../../src/actions/rename-product-category.action.ts';
import {
  handleRetireProductCategory,
  retireProductCategoryAction,
} from '../../src/actions/retire-product-category.action.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '99999999-9999-4999-8999-999999999999';
const categoryRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product-category',
  tenantId,
} as const;
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const category = { categoryRef, lifecycle: 'ACTIVE', name: 'Wall shelves', revision: 1 } as const;

const context = (services: object) => {
  const events: unknown[] = [];
  const reads: unknown[] = [];
  return {
    events,
    reads,
    value: {
      actionInvocationId: 'invocation-1',
      addDomainEvent: (event: unknown) =>
        Effect.sync(() => {
          events.push(event);
        }),
      recordAuditEvidence: () => Effect.void,
      recordDataAccess: (access: unknown) =>
        Effect.sync(() => {
          reads.push(access);
        }),
      scope: { principalId: 'principal-1', tenantId },
      services,
    },
  };
};

describe('Catalog Product Category Actions', () => {
  it('keeps six exact tenant Actions idempotent and legal-entity independent', () => {
    for (const action of [
      createProductCategoryAction,
      renameProductCategoryAction,
      moveProductCategoryAction,
      retireProductCategoryAction,
      addProductCategoryAssignmentAction,
      removeProductCategoryAssignmentAction,
    ]) {
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(action.descriptor.entrypoint.authorization.kind).toBe('action_execution');
    }
  });

  it('validates explicit payloads and rejects empty names or reasons', () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateProductCategoryPayloadSchema)({ name: '', reason: 'Create' }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(MoveProductCategoryPayloadSchema)({ categoryRef, expectedRevision: 1, reason: ' ' }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(AddProductCategoryAssignmentPayloadSchema)({ categoryRef, reason: 'Assign' }),
    ).toThrow();
  });

  it('creates a category in trusted tenant scope and emits one committed fact', async () => {
    let recorded: unknown;
    const run = context({
      createCategory: (input: unknown) =>
        Effect.sync(() => {
          recorded = input;
          return { _tag: 'created', category, changed: true, hierarchyRevision: 1 };
        }),
    });
    const result = await Effect.runPromise(
      handleCreateProductCategory({ name: 'Wall shelves', reason: 'New classification' }, run.value as never),
    );
    expect(result.category.categoryRef).toEqual(categoryRef);
    expect(recorded).toMatchObject({ tenantId, principalId: 'principal-1', name: 'Wall shelves' });
    expect(run.events).toHaveLength(1);
    expect(run.reads).toHaveLength(1);
  });

  it('rejects a cross-tenant move before persistence', async () => {
    let called = false;
    const run = context({
      moveCategory: () => {
        called = true;
        return Effect.succeed({ _tag: 'moved', category, changed: true, hierarchyRevision: 2 });
      },
    });
    const result = await Effect.runPromiseExit(
      handleMoveProductCategory(
        { categoryRef: { ...categoryRef, tenantId: otherTenantId }, expectedRevision: 1, reason: 'Move' },
        run.value as never,
      ),
    );
    expect(result._tag).toBe('Failure');
    expect(called).toBe(false);
  });

  it('treats a duplicate assignment as unchanged with no event', async () => {
    const run = context({
      addAssignment: () => Effect.succeed({ _tag: 'unchanged', assignmentRevision: 1, categoryRef, productRef }),
    });
    const result = await Effect.runPromise(
      handleAddProductCategoryAssignment({ categoryRef, productRef, reason: 'Classify' }, run.value as never),
    );
    expect(result.changed).toBe(false);
    expect(run.events).toHaveLength(0);
    expect(run.reads).toHaveLength(2);
  });

  it('renames in place without replacing identity or assignments, and emits only on change', async () => {
    let recorded: unknown;
    const renamed = { ...category, name: 'Shelves for walls', revision: 2 };
    const run = context({
      renameCategory: (input: unknown) =>
        Effect.sync(() => {
          recorded = input;
          return { _tag: 'renamed', category: renamed, changed: true, hierarchyRevision: 2 };
        }),
    });
    const result = await Effect.runPromise(
      handleRenameProductCategory(
        { categoryRef, expectedRevision: 1, name: 'Shelves for walls', reason: 'Same meaning' },
        run.value as never,
      ),
    );
    expect(result.category.categoryRef).toEqual(categoryRef);
    expect(result.category.name).toBe('Shelves for walls');
    expect(recorded).toMatchObject({ categoryId: categoryRef.resourceId, expectedRevision: 1, tenantId });
    expect(run.events).toHaveLength(1);

    const noChange = context({
      renameCategory: () =>
        Effect.succeed({ _tag: 'renamed', category: renamed, changed: false, hierarchyRevision: 2 }),
    });
    const repeated = await Effect.runPromise(
      handleRenameProductCategory(
        { categoryRef, expectedRevision: 2, name: 'Shelves for walls', reason: 'Same meaning' },
        noChange.value as never,
      ),
    );
    expect(repeated.changed).toBe(false);
    expect(noChange.events).toHaveLength(0);
  });

  it('rejects a move that would cycle the authoritative hierarchy without recording a success event', async () => {
    const run = context({
      moveCategory: () => Effect.succeed({ _tag: 'hierarchy_conflict', reason: 'Descendant cannot become parent' }),
    });
    const result = await Effect.runPromiseExit(
      handleMoveProductCategory(
        {
          categoryRef,
          expectedRevision: 1,
          parentRef: { ...categoryRef, resourceId: '44444444-4444-4444-8444-444444444444' },
          reason: 'Move',
        },
        run.value as never,
      ),
    );
    expect(result._tag).toBe('Failure');
    expect(run.events).toHaveLength(0);
    expect(run.reads).toHaveLength(0);
  });

  it('blocks retirement while direct children or assignments remain, then emits once when resolved', async () => {
    for (const reason of ['DIRECT_CHILDREN_REMAIN', 'DIRECT_ASSIGNMENTS_REMAIN']) {
      const blocked = context({ retireCategory: () => Effect.succeed({ _tag: 'reference_conflict', reason }) });
      const outcome = await Effect.runPromiseExit(
        handleRetireProductCategory({ categoryRef, expectedRevision: 1, reason: 'Retire' }, blocked.value as never),
      );
      expect(outcome._tag).toBe('Failure');
      expect(blocked.events).toHaveLength(0);
    }
    const retired = context({
      retireCategory: () =>
        Effect.succeed({
          _tag: 'retired',
          category: { ...category, lifecycle: 'RETIRED', revision: 2 },
          changed: true,
          hierarchyRevision: 2,
        }),
    });
    const outcome = await Effect.runPromise(
      handleRetireProductCategory({ categoryRef, expectedRevision: 1, reason: 'Retire' }, retired.value as never),
    );
    expect(outcome.category.lifecycle).toBe('RETIRED');
    expect(outcome.category.categoryRef).toEqual(categoryRef);
    expect(retired.events).toHaveLength(1);
  });

  it('removes the last direct assignment without inventing a replacement category', async () => {
    const run = context({
      removeAssignment: () => Effect.succeed({ _tag: 'removed', assignmentRevision: 2, categoryRef, productRef }),
    });
    const result = await Effect.runPromise(
      handleRemoveProductCategoryAssignment({ categoryRef, productRef, reason: 'Unclassify' }, run.value as never),
    );
    expect(result).toMatchObject({ categoryRef, productRef, changed: true, assignmentRevision: 2 });
    expect(result).not.toHaveProperty('replacementCategoryRef');
    expect(run.events).toHaveLength(1);
    const repeated = context({
      removeAssignment: () => Effect.succeed({ _tag: 'unchanged', assignmentRevision: 2, categoryRef, productRef }),
    });
    const unchanged = await Effect.runPromise(
      handleRemoveProductCategoryAssignment({ categoryRef, productRef, reason: 'Unclassify' }, repeated.value as never),
    );
    expect(unchanged.changed).toBe(false);
    expect(repeated.events).toHaveLength(0);
  });
});
