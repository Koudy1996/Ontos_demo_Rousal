import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import { CatalogRevisionNumberSchema } from '../../shared/domain/catalog-revision-reference.ts';
import type { CatalogSelection } from '../../shared/domain/catalog-selection-evidence.ts';
import type { CatalogSelectionCurrentFacts } from '../../shared/domain/catalog-selection-assessment.ts';
import { productVariants, products } from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

/** A snapshot of facts, never an owner guarantee that a purchase remains Current. */
export type CatalogSelectionCurrentBasis = Extract<
  CatalogSelectionCurrentFacts,
  { readonly status: 'INDETERMINATE' | 'INVALID' }
>;

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog Current basis is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const validRequest = (selection: CatalogSelection, purpose: string, tenantId: string): boolean =>
  selection.productRef.tenantId === tenantId &&
  selection.variantRef.tenantId === tenantId &&
  selection.productRef.moduleId === 'commerce.catalog' &&
  selection.variantRef.moduleId === 'commerce.catalog' &&
  selection.productRef.resourceType === 'commerce.catalog.product' &&
  selection.variantRef.resourceType === 'commerce.catalog.variant' &&
  purpose.length > 0 &&
  purpose === purpose.trim();

/**
 * Core supplies one tenant-scoped transaction. The reader deliberately does not promote
 * Product/Variant rows to owner-issued membership or complete dependent-fact proof.
 */
export const catalogSelectionCurrentBasisForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  read: Effect.fn('CatalogSelectionCurrentBasis.read')(function* read(input: {
    readonly purpose: string;
    readonly selection: CatalogSelection;
  }) {
    const { purpose, selection } = input;
    const assessedAt = DateTime.formatIso(yield* DateTime.now);
    const basis: CatalogSelectionCurrentFacts['basis'][number][] = [];
    const result = (status: 'INDETERMINATE' | 'INVALID', reason: string): CatalogSelectionCurrentFacts => ({
      assessedAt,
      basis,
      purpose,
      reason,
      selection,
      source: 'CATALOG_OWNER_CURRENT_READ',
      status,
    });
    if (!validRequest(selection, purpose, scope.tenantId)) {
      return result('INDETERMINATE', 'Selection scope or purpose cannot be verified');
    }

    const [product] = yield* transaction
      .select({ lifecycleState: products.lifecycleState, revision: products.currentRevision })
      .from(products)
      .where(and(eq(products.tenantId, scope.tenantId), eq(products.productId, selection.productRef.resourceId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      product === undefined ||
      !Number.isSafeInteger(product.revision) ||
      product.revision < 1 ||
      product.revision > 2_147_483_647
    ) {
      return result('INDETERMINATE', 'Product Current revision is missing or unavailable');
    }
    const productRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(product.revision).pipe(
      Effect.mapError(unavailable),
    );
    basis.push({
      role: 'PRODUCT',
      source: {
        resourceRef: selection.productRef,
        revision: productRevision,
      },
    });

    const [variant] = yield* transaction
      .select({
        lifecycleState: productVariants.lifecycleState,
        productId: productVariants.productId,
        revision: productVariants.currentRevision,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.tenantId, scope.tenantId),
          eq(productVariants.variantId, selection.variantRef.resourceId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      variant === undefined ||
      !Number.isSafeInteger(variant.revision) ||
      variant.revision < 1 ||
      variant.revision > 2_147_483_647
    ) {
      return result('INDETERMINATE', 'Variant Current revision is missing or unavailable');
    }
    const variantRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(variant.revision).pipe(
      Effect.mapError(unavailable),
    );
    if (variant.productId !== selection.productRef.resourceId) {
      return result('INVALID', 'Variant belongs to another Product');
    }
    basis.push({
      role: 'VARIANT',
      source: {
        resourceRef: selection.variantRef,
        revision: variantRevision,
      },
    });
    if (product.lifecycleState === 'RETIRED' || variant.lifecycleState === 'RETIRED') {
      return result('INVALID', 'Selected Product or Variant is retired');
    }
    if (product.lifecycleState !== 'ACTIVE' || variant.lifecycleState !== 'ACTIVE') {
      return result('INVALID', 'Selected Product or Variant is not active');
    }
    return result('INDETERMINATE', 'Indirect Catalog facts and exact dependent revisions are not yet attested');
  }),
});
