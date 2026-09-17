import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import {
  productCategories,
  productCategoryAssignments,
  productCategoryEvents,
  productCategoryHierarchyRevisions,
  products,
} from '../database/schema.ts';

import type { ProductCategoryRef } from '../../shared/resources/product-category.ts';
import type { ProductRef } from '../../shared/resources/product.ts';

export class CategoryPersistenceUnavailable extends Schema.TaggedError<CategoryPersistenceUnavailable>()(
  'CategoryPersistenceUnavailable',
  { code: Schema.Literal('category_persistence_unavailable'), reason: Schema.String },
) {}

export interface CategoryRecord {
  readonly categoryRef: ProductCategoryRef;
  readonly lifecycle: 'ACTIVE' | 'RETIRED';
  readonly name: string;
  readonly parentRef?: ProductCategoryRef;
  readonly revision: number;
}

interface MutationBase {
  readonly actionInvocationId: string;
  readonly principalId: string;
  readonly reason: string;
  readonly tenantId: string;
}

export interface CreateCategoryInput extends MutationBase {
  readonly categoryId: string;
  readonly name: string;
  readonly parentCategoryId?: string;
}

export interface RenameCategoryInput extends MutationBase {
  readonly categoryId: string;
  readonly expectedRevision: number;
  readonly name: string;
}

export interface MoveCategoryInput extends MutationBase {
  readonly categoryId: string;
  readonly expectedRevision: number;
  readonly parentCategoryId?: string;
}

export interface RetireCategoryInput extends MutationBase {
  readonly categoryId: string;
  readonly expectedRevision: number;
}

export interface CategoryAssignmentInput extends MutationBase {
  readonly categoryId: string;
  readonly productId: string;
}

export type CategoryMutationOutcome =
  | {
      readonly _tag: 'created' | 'renamed' | 'moved' | 'retired';
      readonly category: CategoryRecord;
      readonly changed: boolean;
      readonly hierarchyRevision: number;
    }
  | {
      readonly _tag: 'not_found' | 'lifecycle_conflict' | 'hierarchy_conflict' | 'reference_conflict';
      readonly reason: string;
    }
  | { readonly _tag: 'revision_conflict'; readonly actualRevision: number; readonly reason: string };

export type CategoryAssignmentOutcome =
  | {
      readonly _tag: 'added' | 'removed' | 'unchanged';
      readonly assignmentRevision: number;
      readonly categoryRef: ProductCategoryRef;
      readonly productRef: ProductRef;
    }
  | { readonly _tag: 'not_found' | 'lifecycle_conflict' | 'reference_conflict'; readonly reason: string };

/** An owner-local service bound to Core's already-scoped transaction. */
export interface CategoryPersistence {
  readonly addAssignment: (
    input: CategoryAssignmentInput,
  ) => Effect.Effect<CategoryAssignmentOutcome, CategoryPersistenceUnavailable>;
  readonly createCategory: (
    input: CreateCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly moveCategory: (
    input: MoveCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly removeAssignment: (
    input: CategoryAssignmentInput,
  ) => Effect.Effect<CategoryAssignmentOutcome, CategoryPersistenceUnavailable>;
  readonly renameCategory: (
    input: RenameCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly retireCategory: (
    input: RetireCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
}

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
type CategoryRow = typeof productCategories.$inferSelect;
type MutationInput =
  | CreateCategoryInput
  | RenameCategoryInput
  | MoveCategoryInput
  | RetireCategoryInput
  | CategoryAssignmentInput;

const unavailable = (cause?: unknown): CategoryPersistenceUnavailable => {
  const failure = new CategoryPersistenceUnavailable({
    code: 'category_persistence_unavailable',
    reason: 'Category persistence is temporarily unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

const categoryRef = (tenantId: string, resourceId: string): ProductCategoryRef => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType: 'commerce.catalog.product-category',
  tenantId,
});
const productRef = (tenantId: string, resourceId: string): ProductRef => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType: 'commerce.catalog.product',
  tenantId,
});
const record = (row: CategoryRow): CategoryRecord => ({
  categoryRef: categoryRef(row.tenantId, row.categoryId),
  lifecycle: row.lifecycleState === 'RETIRED' ? 'RETIRED' : 'ACTIVE',
  name: row.name,
  ...(row.parentCategoryId === null ? {} : { parentRef: categoryRef(row.tenantId, row.parentCategoryId) }),
  revision: row.currentRevision,
});

/** Core has already opened and scoped this transaction; the revision row serializes this tenant's category writes. */
export const categoryPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<CategoryPersistence> => {
  const { tenantId } = scope;
  const query = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, CategoryPersistenceUnavailable> =>
    effect.pipe(Effect.mapError(unavailable));
  const lock = Effect.fn('CategoryPersistence.lock')(function* lock() {
    yield* query(transaction.insert(productCategoryHierarchyRevisions).values({ tenantId }).onConflictDoNothing());
    const [row] = yield* query(
      transaction
        .select()
        .from(productCategoryHierarchyRevisions)
        .where(eq(productCategoryHierarchyRevisions.tenantId, tenantId))
        .for('update')
        .limit(1),
    );
    if (row === undefined) {
      return yield* unavailable();
    }
    return row;
  });
  const find = Effect.fn('CategoryPersistence.find')(function* find(categoryId: string) {
    const [row] = yield* query(
      transaction
        .select()
        .from(productCategories)
        .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.categoryId, categoryId)))
        .limit(1),
    );
    return row;
  });
  const event = (
    input: MutationInput,
    kind: string,
    categoryId: string,
    revisions: {
      assignmentRevision: number;
      hierarchyRevision: number;
    },
    options?: { nextParentCategoryId?: string | null; previousParentCategoryId?: string | null; productId?: string },
  ) =>
    query(
      transaction.insert(productCategoryEvents).values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        assignmentRevision: revisions.assignmentRevision,
        categoryId,
        changeKind: kind,
        hierarchyRevision: revisions.hierarchyRevision,
        nextParentCategoryId: options?.nextParentCategoryId ?? null,
        previousParentCategoryId: options?.previousParentCategoryId ?? null,
        productId: options?.productId ?? null,
        reason: input.reason,
        tenantId,
      }),
    );
  const bump = Effect.fn('CategoryPersistence.bump')(function* bump(
    kind: 'hierarchy' | 'assignment',
    current: {
      assignmentRevision: number;
      hierarchyRevision: number;
    },
  ) {
    const next = {
      assignmentRevision: current.assignmentRevision + (kind === 'assignment' ? 1 : 0),
      hierarchyRevision: current.hierarchyRevision + (kind === 'hierarchy' ? 1 : 0),
    };
    yield* query(
      transaction
        .update(productCategoryHierarchyRevisions)
        .set({ ...next, updatedAt: DateTime.toDateUtc(yield* DateTime.now) })
        .where(eq(productCategoryHierarchyRevisions.tenantId, tenantId)),
    );
    return next;
  });
  const validParent = Effect.fn('CategoryPersistence.validParent')(function* validParent(parentId?: string) {
    if (parentId === undefined) {
      return true;
    }
    const parent = yield* find(parentId);
    return parent?.lifecycleState === 'ACTIVE';
  });

  const createCategory: CategoryPersistence['createCategory'] = Effect.fn('CategoryPersistence.createCategory')(
    function* createCategory(input) {
      if (input.tenantId !== tenantId) {
        return { _tag: 'not_found', reason: 'Tenant mismatch' } as const;
      }
      const revision = yield* lock();
      if ((yield* find(input.categoryId)) !== undefined) {
        return { _tag: 'reference_conflict', reason: 'Category already exists' } as const;
      }
      if (!(yield* validParent(input.parentCategoryId))) {
        return { _tag: 'reference_conflict', reason: 'Parent is not active' } as const;
      }
      const [created] = yield* query(
        transaction
          .insert(productCategories)
          .values({
            categoryId: input.categoryId,
            createdByActionInvocationId: input.actionInvocationId,
            createdByPrincipalId: input.principalId,
            name: input.name,
            parentCategoryId: input.parentCategoryId ?? null,
            tenantId,
          })
          .returning(),
      );
      if (created === undefined) {
        return yield* unavailable();
      }
      const next = yield* bump('hierarchy', revision);
      yield* event(input, 'CREATED', input.categoryId, next, { nextParentCategoryId: input.parentCategoryId ?? null });
      return {
        _tag: 'created',
        category: record(created),
        changed: true,
        hierarchyRevision: next.hierarchyRevision,
      } as const;
    },
  );

  const renameCategory: CategoryPersistence['renameCategory'] = Effect.fn('CategoryPersistence.renameCategory')(
    function* renameCategory(input) {
      if (input.tenantId !== tenantId) {
        return { _tag: 'not_found', reason: 'Tenant mismatch' } as const;
      }
      const revision = yield* lock();
      const current = yield* find(input.categoryId);
      if (current === undefined) {
        return { _tag: 'not_found', reason: 'Category not found' } as const;
      }
      if (current.currentRevision !== input.expectedRevision) {
        return {
          _tag: 'revision_conflict',
          actualRevision: current.currentRevision,
          reason: 'Revision changed',
        } as const;
      }
      if (current.lifecycleState !== 'ACTIVE') {
        return { _tag: 'lifecycle_conflict', reason: 'Category retired' } as const;
      }
      if (current.name === input.name) {
        return {
          _tag: 'renamed',
          category: record(current),
          changed: false,
          hierarchyRevision: revision.hierarchyRevision,
        } as const;
      }
      const [updated] = yield* query(
        transaction
          .update(productCategories)
          .set({
            currentRevision: current.currentRevision + 1,
            name: input.name,
            updatedAt: DateTime.toDateUtc(yield* DateTime.now),
          })
          .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.categoryId, input.categoryId)))
          .returning(),
      );
      if (updated === undefined) {
        return yield* unavailable();
      }
      const next = yield* bump('hierarchy', revision);
      yield* event(input, 'RENAMED', input.categoryId, next);
      return {
        _tag: 'renamed',
        category: record(updated),
        changed: true,
        hierarchyRevision: next.hierarchyRevision,
      } as const;
    },
  );

  const moveCategory: CategoryPersistence['moveCategory'] = Effect.fn('CategoryPersistence.moveCategory')(
    function* moveCategory(input) {
      if (input.tenantId !== tenantId) {
        return { _tag: 'not_found', reason: 'Tenant mismatch' } as const;
      }
      const revision = yield* lock();
      const current = yield* find(input.categoryId);
      if (current === undefined) {
        return { _tag: 'not_found', reason: 'Category not found' } as const;
      }
      if (current.currentRevision !== input.expectedRevision) {
        return {
          _tag: 'revision_conflict',
          actualRevision: current.currentRevision,
          reason: 'Revision changed',
        } as const;
      }
      if (current.lifecycleState !== 'ACTIVE') {
        return { _tag: 'lifecycle_conflict', reason: 'Category retired' } as const;
      }
      if (current.parentCategoryId === (input.parentCategoryId ?? null)) {
        return {
          _tag: 'moved',
          category: record(current),
          changed: false,
          hierarchyRevision: revision.hierarchyRevision,
        } as const;
      }
      if (!(yield* validParent(input.parentCategoryId))) {
        return { _tag: 'reference_conflict', reason: 'Parent is not active' } as const;
      }
      let ancestorId = input.parentCategoryId;
      const seen = new Set<string>();
      while (ancestorId !== undefined) {
        if (ancestorId === input.categoryId || seen.has(ancestorId)) {
          return { _tag: 'hierarchy_conflict', reason: 'Move would create a cycle' } as const;
        }
        seen.add(ancestorId);
        const ancestor = yield* find(ancestorId);
        if (ancestor === undefined) {
          return { _tag: 'reference_conflict', reason: 'Ancestor not found' } as const;
        }
        ancestorId = ancestor.parentCategoryId ?? undefined;
      }
      const [updated] = yield* query(
        transaction
          .update(productCategories)
          .set({
            currentRevision: current.currentRevision + 1,
            parentCategoryId: input.parentCategoryId ?? null,
            updatedAt: DateTime.toDateUtc(yield* DateTime.now),
          })
          .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.categoryId, input.categoryId)))
          .returning(),
      );
      if (updated === undefined) {
        return yield* unavailable();
      }
      const next = yield* bump('hierarchy', revision);
      yield* event(input, 'MOVED', input.categoryId, next, {
        nextParentCategoryId: input.parentCategoryId ?? null,
        previousParentCategoryId: current.parentCategoryId,
      });
      return {
        _tag: 'moved',
        category: record(updated),
        changed: true,
        hierarchyRevision: next.hierarchyRevision,
      } as const;
    },
  );

  const retireCategory: CategoryPersistence['retireCategory'] = Effect.fn('CategoryPersistence.retireCategory')(
    function* retireCategory(input) {
      if (input.tenantId !== tenantId) {
        return { _tag: 'not_found', reason: 'Tenant mismatch' } as const;
      }
      const revision = yield* lock();
      const current = yield* find(input.categoryId);
      if (current === undefined) {
        return { _tag: 'not_found', reason: 'Category not found' } as const;
      }
      if (current.currentRevision !== input.expectedRevision) {
        return {
          _tag: 'revision_conflict',
          actualRevision: current.currentRevision,
          reason: 'Revision changed',
        } as const;
      }
      if (current.lifecycleState !== 'ACTIVE') {
        return { _tag: 'lifecycle_conflict', reason: 'Category retired' } as const;
      }
      const [child] = yield* query(
        transaction
          .select({ categoryId: productCategories.categoryId })
          .from(productCategories)
          .where(
            and(eq(productCategories.tenantId, tenantId), eq(productCategories.parentCategoryId, input.categoryId)),
          )
          .limit(1),
      );
      if (child !== undefined) {
        return { _tag: 'reference_conflict', reason: 'Category has children' } as const;
      }
      const [assignment] = yield* query(
        transaction
          .select({ productId: productCategoryAssignments.productId })
          .from(productCategoryAssignments)
          .where(
            and(
              eq(productCategoryAssignments.tenantId, tenantId),
              eq(productCategoryAssignments.categoryId, input.categoryId),
            ),
          )
          .limit(1),
      );
      if (assignment !== undefined) {
        return { _tag: 'reference_conflict', reason: 'Category has assignments' } as const;
      }
      const [updated] = yield* query(
        transaction
          .update(productCategories)
          .set({
            currentRevision: current.currentRevision + 1,
            lifecycleState: 'RETIRED',
            updatedAt: DateTime.toDateUtc(yield* DateTime.now),
          })
          .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.categoryId, input.categoryId)))
          .returning(),
      );
      if (updated === undefined) {
        return yield* unavailable();
      }
      const next = yield* bump('hierarchy', revision);
      yield* event(input, 'RETIRED', input.categoryId, next);
      return {
        _tag: 'retired',
        category: record(updated),
        changed: true,
        hierarchyRevision: next.hierarchyRevision,
      } as const;
    },
  );

  const assignment = (
    kind: 'add' | 'remove',
    input: CategoryAssignmentInput,
  ): Effect.Effect<CategoryAssignmentOutcome, CategoryPersistenceUnavailable> =>
    Effect.gen(function* assignment() {
      if (input.tenantId !== tenantId) {
        return { _tag: 'not_found', reason: 'Tenant mismatch' } as const;
      }
      const revision = yield* lock();
      const category = yield* find(input.categoryId);
      const [product] = yield* query(
        transaction
          .select({ productId: products.productId })
          .from(products)
          .where(and(eq(products.tenantId, tenantId), eq(products.productId, input.productId)))
          .limit(1),
      );
      if (category === undefined || product === undefined) {
        return { _tag: 'not_found', reason: 'Product or category not found' } as const;
      }
      if (category.lifecycleState !== 'ACTIVE') {
        return { _tag: 'lifecycle_conflict', reason: 'Category retired' } as const;
      }
      const [existing] = yield* query(
        transaction
          .select({ productId: productCategoryAssignments.productId })
          .from(productCategoryAssignments)
          .where(
            and(
              eq(productCategoryAssignments.tenantId, tenantId),
              eq(productCategoryAssignments.productId, input.productId),
              eq(productCategoryAssignments.categoryId, input.categoryId),
            ),
          )
          .limit(1),
      );
      const changed = kind === 'add' ? existing === undefined : existing !== undefined;
      if (!changed) {
        return {
          _tag: 'unchanged',
          assignmentRevision: revision.assignmentRevision,
          categoryRef: categoryRef(tenantId, input.categoryId),
          productRef: productRef(tenantId, input.productId),
        } as const;
      }
      if (kind === 'add') {
        yield* query(
          transaction.insert(productCategoryAssignments).values({
            tenantId,
            categoryId: input.categoryId,
            productId: input.productId,
            assignedByActionInvocationId: input.actionInvocationId,
            assignedByPrincipalId: input.principalId,
          }),
        );
      } else {
        yield* query(
          transaction
            .delete(productCategoryAssignments)
            .where(
              and(
                eq(productCategoryAssignments.tenantId, tenantId),
                eq(productCategoryAssignments.productId, input.productId),
                eq(productCategoryAssignments.categoryId, input.categoryId),
              ),
            ),
        );
      }
      const next = yield* bump('assignment', revision);
      yield* event(input, kind === 'add' ? 'ASSIGNED' : 'UNASSIGNED', input.categoryId, next, {
        productId: input.productId,
      });
      return {
        _tag: kind === 'add' ? 'added' : 'removed',
        assignmentRevision: next.assignmentRevision,
        categoryRef: categoryRef(tenantId, input.categoryId),
        productRef: productRef(tenantId, input.productId),
      } as const;
    });

  return Effect.succeed({
    addAssignment: (input) => assignment('add', input),
    createCategory,
    moveCategory,
    removeAssignment: (input) => assignment('remove', input),
    renameCategory,
    retireCategory,
  });
};
