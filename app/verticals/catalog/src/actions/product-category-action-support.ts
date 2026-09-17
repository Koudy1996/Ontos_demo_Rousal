import type { ActionHandlerContext, DomainEventContractMap } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import { ProductCategoryRefSchema } from '../../shared/resources/product-category.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import type {
  CategoryAssignmentOutcome,
  CategoryMutationOutcome,
  CategoryPersistence,
} from '../persistence/category-persistence.ts';
import { CategoryPersistenceUnavailable } from '../persistence/category-persistence.ts';

const uuid = Schema.String.check(Schema.isUUID());
export const CategoryIdSchema = uuid;
export const CategoryNameSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(240),
  Schema.isTrimmed(),
);
export const CategoryReasonSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1000),
  Schema.isTrimmed(),
);
export const CategoryRevisionSchema = Schema.Finite.check(Schema.isInt(), Schema.isGreaterThan(0));
export const CategoryCounterSchema = Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
export const CategoryRecordSchema = Schema.Struct({
  categoryRef: ProductCategoryRefSchema,
  lifecycle: Schema.Literals(['ACTIVE', 'RETIRED']),
  name: CategoryNameSchema,
  parentRef: Schema.optionalKey(ProductCategoryRefSchema),
  revision: CategoryRevisionSchema,
});
export const CategoryMutationResultSchema = Schema.Struct({
  category: CategoryRecordSchema,
  changed: Schema.Boolean,
  hierarchyRevision: CategoryCounterSchema,
});
export const CategoryAssignmentResultSchema = Schema.Struct({
  assignmentRevision: CategoryCounterSchema,
  categoryRef: ProductCategoryRefSchema,
  changed: Schema.Boolean,
  productRef: ProductRefSchema,
});
export const CategoryAuditEvidenceSchema = Schema.Struct({ reason: CategoryReasonSchema });

export class CategoryActionRejected extends Schema.TaggedError<CategoryActionRejected>()('CategoryActionRejected', {
  code: Schema.Literals([
    'category_not_found',
    'category_conflict',
    'category_revision_conflict',
    'category_reference_conflict',
  ]),
  reason: Schema.String,
}) {}

export const CategoryActionErrorSchema = Schema.Union([CategoryActionRejected, CategoryPersistenceUnavailable]);

/** Build a JSON value without leaking an absent parent as `undefined`. */
export const categoryEventPayload = (
  result: typeof CategoryMutationResultSchema.Type | typeof CategoryAssignmentResultSchema.Type,
): Schema.Schema.Type<typeof Schema.Json> => {
  if ('category' in result) {
    const { category } = result;
    return {
      category: {
        categoryRef: { ...category.categoryRef },
        lifecycle: category.lifecycle,
        name: category.name,
        ...(category.parentRef === undefined ? {} : { parentRef: { ...category.parentRef } }),
        revision: category.revision,
      },
      changed: result.changed,
      hierarchyRevision: result.hierarchyRevision,
    };
  }
  return {
    assignmentRevision: result.assignmentRevision,
    categoryRef: { ...result.categoryRef },
    changed: result.changed,
    productRef: { ...result.productRef },
  };
};

export const mutationFailure = (
  outcome: Exclude<CategoryMutationOutcome, { readonly category: unknown }>,
): CategoryActionRejected =>
  new CategoryActionRejected({
    code:
      outcome._tag === 'not_found'
        ? 'category_not_found'
        : outcome._tag === 'revision_conflict'
          ? 'category_revision_conflict'
          : outcome._tag === 'reference_conflict'
            ? 'category_reference_conflict'
            : 'category_conflict',
    reason:
      outcome._tag === 'not_found'
        ? 'The category was not found in the trusted tenant'
        : 'The category operation conflicts with current Catalog state',
  });

export const assignmentFailure = (
  outcome: Exclude<CategoryAssignmentOutcome, { readonly categoryRef: unknown }>,
): CategoryActionRejected =>
  new CategoryActionRejected({
    code:
      outcome._tag === 'not_found'
        ? 'category_not_found'
        : outcome._tag === 'reference_conflict'
          ? 'category_reference_conflict'
          : 'category_conflict',
    reason:
      outcome._tag === 'not_found'
        ? 'The Product or category was not found in the trusted tenant'
        : 'The assignment conflicts with current Catalog state',
  });

export const crossTenantFailure = (): CategoryActionRejected =>
  new CategoryActionRejected({
    code: 'category_not_found',
    reason: 'The reference does not belong to the trusted tenant',
  });

export type CategoryContext<Events extends DomainEventContractMap> = ActionHandlerContext<Events, CategoryPersistence>;

export const recordCategoryAccess = Effect.fn('CategoryAction.recordAccess')(function* recordCategoryAccess<
  Events extends DomainEventContractMap,
>(context: CategoryContext<Events>, resourceId: string, resourceType = 'commerce.catalog.product-category') {
  yield* context.recordDataAccess({
    accessKind: 'read',
    queryHash: `catalog-category:${resourceId}`,
    resultCount: 1,
    servingModuleKey: 'commerce.catalog',
    targetModuleKey: 'commerce.catalog',
    targetResourceId: resourceId,
    targetResourceType: resourceType,
  });
});

export const recordCategoryEvent = Effect.fn('CategoryAction.recordEvent')(function* recordCategoryEvent<
  Events extends DomainEventContractMap,
>(
  context: CategoryContext<Events>,
  eventType: keyof Events & string,
  resourceId: string,
  payloadJson: Schema.Schema.Type<typeof Schema.Json>,
) {
  yield* context.addDomainEvent({
    eventType,
    payloadJson,
    producerModuleKey: 'commerce.catalog',
    subjectModuleKey: 'commerce.catalog',
    subjectResourceId: resourceId,
    subjectResourceType: 'commerce.catalog.product-category',
  });
});

export { categoryPersistenceForScope as categoryPersistenceServiceFactory } from '../persistence/category-persistence.ts';
