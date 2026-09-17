import { Schema, type Effect } from 'effect';

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
  readonly createCategory: (
    input: CreateCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly renameCategory: (
    input: RenameCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly moveCategory: (
    input: MoveCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly retireCategory: (
    input: RetireCategoryInput,
  ) => Effect.Effect<CategoryMutationOutcome, CategoryPersistenceUnavailable>;
  readonly addAssignment: (
    input: CategoryAssignmentInput,
  ) => Effect.Effect<CategoryAssignmentOutcome, CategoryPersistenceUnavailable>;
  readonly removeAssignment: (
    input: CategoryAssignmentInput,
  ) => Effect.Effect<CategoryAssignmentOutcome, CategoryPersistenceUnavailable>;
}
