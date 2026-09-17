import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import type { SetProductTypeResult } from '../../shared/actions/set-product-type.ts';
import type { ProductTypeRef } from '../../shared/resources/product-type.ts';
import {
  attributeValueSets,
  productTypeAssignmentEvents,
  productTypeAssignments,
  productTypes,
  productVariantAxes,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class ProductTypeAssignmentRejected extends Schema.TaggedError<ProductTypeAssignmentRejected>()(
  'ProductTypeAssignmentRejected',
  {
    code: Schema.Literal('product_type_stale_impact_basis'),
    reason: Schema.String,
  },
) {}

const stale = (reason: string) =>
  new ProductTypeAssignmentRejected({ code: 'product_type_stale_impact_basis', reason });
const unavailable = (cause: unknown) => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

/** A versioned token for the only currently provable impact class: an empty Draft. */
export const emptyDraftProductTypeImpactBasis = (input: {
  readonly currentProductTypeId: string | null;
  readonly currentProductTypeRevision: number | null;
  readonly nextProductTypeId: string | null;
  readonly nextProductTypeRevision: number | null;
  readonly productId: string;
  readonly productRevision: number;
  readonly tenantId: string;
}): string =>
  createHash('sha256')
    .update(
      [
        'product-type-empty-draft-v1',
        input.tenantId,
        input.productId,
        String(input.productRevision),
        input.currentProductTypeId ?? '-',
        String(input.currentProductTypeRevision ?? '-'),
        input.nextProductTypeId ?? '-',
        String(input.nextProductTypeRevision ?? '-'),
      ].join('|'),
    )
    .digest('hex');

export interface SetProductTypePersistenceInput {
  readonly actionInvocationId: string;
  readonly expectedProductRevision: number;
  readonly impactBasis: string;
  readonly nextProductTypeRef?: ProductTypeRef;
  readonly principalId: string;
  readonly productId: string;
  readonly reason: string;
}

export interface ProductTypeAssignmentPersistence {
  readonly set: (
    input: SetProductTypePersistenceInput,
  ) => Effect.Effect<SetProductTypeResult, ProductTypeAssignmentRejected | CatalogPersistenceUnavailable>;
}

export const productTypeAssignmentPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<ProductTypeAssignmentPersistence> => {
  const { tenantId } = scope;
  const set: ProductTypeAssignmentPersistence['set'] = Effect.fn('ProductTypeAssignmentPersistence.set')(
    // oxlint-disable-next-line eslint/complexity -- One transaction deliberately keeps all fail-closed checks adjacent to its write; #479 selection authority can remove the narrow Draft branch. expires: 2027-03-31.
    function* set(input) {
      if (input.nextProductTypeRef !== undefined && input.nextProductTypeRef.tenantId !== tenantId) {
        return yield* stale('Product Type is outside the trusted Tenant');
      }
      const [product] = yield* transaction
        .select({ currentRevision: products.currentRevision, lifecycleState: products.lifecycleState })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.productId, input.productId)))
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (product === undefined || product.currentRevision !== input.expectedProductRevision) {
        return yield* stale('Product is absent or changed since impact review');
      }
      if (product.lifecycleState !== 'DRAFT') {
        return yield* stale('Only empty Draft Products have a verifiable assignment impact basis');
      }
      const [assignment] = yield* transaction
        .select({
          assignmentRevision: productTypeAssignments.assignmentRevision,
          productTypeId: productTypeAssignments.productTypeId,
        })
        .from(productTypeAssignments)
        .where(
          and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, input.productId)),
        )
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      // oxlint-disable-next-line effect-native/no-sequential-independent-yields -- Keep assignment and its event sequence in one ordered snapshot under the locked Product. expires: 2027-03-31.
      const [latestEvent] = yield* transaction
        .select({ assignmentRevision: productTypeAssignmentEvents.assignmentRevision })
        .from(productTypeAssignmentEvents)
        .where(
          and(
            eq(productTypeAssignmentEvents.tenantId, tenantId),
            eq(productTypeAssignmentEvents.productId, input.productId),
          ),
        )
        .orderBy(desc(productTypeAssignmentEvents.assignmentRevision))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      const nextId = input.nextProductTypeRef?.resourceId ?? null;
      const [nextType] =
        nextId === null
          ? [undefined]
          : yield* transaction
              .select({ currentRevision: productTypes.currentRevision })
              .from(productTypes)
              .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, nextId)))
              .for('share')
              .limit(1)
              .pipe(Effect.mapError(unavailable));
      if (nextId !== null && nextType === undefined) {
        return yield* stale('Product Type is absent from the trusted Tenant');
      }
      const [values, axes] = yield* Effect.all(
        [
          transaction
            .select({ id: attributeValueSets.attributeValueSetId })
            .from(attributeValueSets)
            .where(and(eq(attributeValueSets.tenantId, tenantId), eq(attributeValueSets.productId, input.productId)))
            .limit(1)
            .pipe(Effect.mapError(unavailable)),
          transaction
            .select({ id: productVariantAxes.attributeDefinitionId })
            .from(productVariantAxes)
            .where(and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.productId, input.productId)))
            .limit(1)
            .pipe(Effect.mapError(unavailable)),
        ],
        { concurrency: 1 },
      );
      if (values.length > 0 || axes.length > 0) {
        return yield* stale('Existing structured Product data requires a complete impact review');
      }
      const previousId = assignment?.productTypeId ?? null;
      if (previousId === nextId) {
        return yield* stale('No Product Type transition exists');
      }
      const [currentType] =
        previousId === null
          ? [undefined]
          : yield* transaction
              .select({ currentRevision: productTypes.currentRevision })
              .from(productTypes)
              .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, previousId)))
              .for('share')
              .limit(1)
              .pipe(Effect.mapError(unavailable));
      if (previousId !== null && currentType === undefined) {
        return yield* stale('Current Product Type cannot be verified');
      }
      const expectedBasis = emptyDraftProductTypeImpactBasis({
        currentProductTypeId: previousId,
        currentProductTypeRevision: currentType?.currentRevision ?? null,
        nextProductTypeId: nextId,
        nextProductTypeRevision: nextType?.currentRevision ?? null,
        productId: input.productId,
        productRevision: product.currentRevision,
        tenantId,
      });
      if (input.impactBasis !== expectedBasis) {
        return yield* stale('Product Type impact basis is stale or unverifiable');
      }
      const revision = product.currentRevision + 1;
      const assignmentRevision = (latestEvent?.assignmentRevision ?? 0) + 1;
      const updatedAt = yield* DateTime.nowAsDate;
      yield* nextId === null
        ? transaction
            .delete(productTypeAssignments)
            .where(
              and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, input.productId)),
            )
            .pipe(Effect.mapError(unavailable))
        : transaction
            .insert(productTypeAssignments)
            .values({
              assignedByActionInvocationId: input.actionInvocationId,
              assignedByPrincipalId: input.principalId,
              assignmentRevision,
              productId: input.productId,
              productTypeId: nextId,
              tenantId,
            })
            .onConflictDoUpdate({
            set: {
              assignedAt: updatedAt,
              assignedByActionInvocationId: input.actionInvocationId,
                assignedByPrincipalId: input.principalId,
                assignmentRevision,
                productTypeId: nextId,
              },
              target: [productTypeAssignments.tenantId, productTypeAssignments.productId],
            })
            .pipe(Effect.mapError(unavailable));
      yield* transaction
        .insert(productTypeAssignmentEvents)
        .values({
          actingPrincipalId: input.principalId,
          actionInvocationId: input.actionInvocationId,
          assignmentRevision,
          nextProductTypeId: nextId,
          previousProductTypeId: previousId,
          productId: input.productId,
          reason: input.reason,
          tenantId,
        })
        .pipe(Effect.mapError(unavailable));
      yield* transaction
        .update(products)
        .set({ currentRevision: revision, updatedAt })
        .where(and(eq(products.tenantId, tenantId), eq(products.productId, input.productId)))
        .pipe(Effect.mapError(unavailable));
      const productRef = {
        moduleId: 'commerce.catalog' as const,
        resourceId: input.productId,
        resourceType: 'commerce.catalog.product' as const,
        tenantId,
      };
      const result = {
        productRef,
        revision,
        unresolvedProductRefs: [],
      };
      return input.nextProductTypeRef === undefined
        ? result
        : { ...result, currentProductTypeRef: input.nextProductTypeRef };
    },
  );
  return Effect.succeed({ set });
};
