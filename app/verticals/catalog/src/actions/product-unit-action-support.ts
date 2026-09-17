import { and, eq } from 'drizzle-orm';
import { Effect, Match } from 'effect';

import { ProductUnitActionError } from '../../shared/actions/product-unit-contract.ts';
import { packageDefinitions, productVariants, products } from '../database/schema.ts';
import type { ProductUnitMutationOutcome, ProductUnitTargetBasis } from '../persistence/product-unit-persistence.ts';
import {
  ProductUnitPersistenceUnavailable,
  productUnitPersistenceForScope,
} from '../persistence/product-unit-persistence.ts';

const unavailable = (cause: unknown) => {
  const failure = new ProductUnitPersistenceUnavailable({
    code: 'product_unit_persistence_unavailable',
    reason: 'Authoritative Product Unit target basis is unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

type VerifyTarget = Parameters<ProductUnitTargetBasis['verify']>[0];
type VerifySources = Parameters<ProductUnitTargetBasis['verify']>[1];

const validTargetSources = (target: VerifyTarget, expectedSources: VerifySources, tenantId: string) =>
  target.tenantId === tenantId &&
  expectedSources.product.resourceRef.tenantId === tenantId &&
  expectedSources.variant.resourceRef.tenantId === tenantId &&
  (expectedSources.packageDefinition === undefined ||
    expectedSources.packageDefinition.resourceRef.tenantId === tenantId) &&
  (target.targetType === 'commerce.catalog.variant'
    ? expectedSources.packageDefinition === undefined
    : expectedSources.packageDefinition !== undefined);

export const productUnitPersistenceServiceFactory = (
  transaction: Parameters<typeof productUnitPersistenceForScope>[0],
  scope: Parameters<typeof productUnitPersistenceForScope>[1],
) => {
  const basis: NonNullable<Parameters<typeof productUnitPersistenceForScope>[2]> = {
    verify: Effect.fn('ProductUnitTargetBasis.verify')(function* verify(target, expectedSources) {
      if (!validTargetSources(target, expectedSources, scope.tenantId)) {
        return 'invalid' as const;
      }
      let variantId = target.targetId;
      let packageProductId: string | undefined;
      if (target.targetType === 'commerce.catalog.package-definition') {
        const [packageRow] = yield* transaction
          .select()
          .from(packageDefinitions)
          .where(
            and(
              eq(packageDefinitions.tenantId, scope.tenantId),
              eq(packageDefinitions.packageDefinitionId, target.targetId),
            ),
          )
          .for('update')
          .limit(1);
        if (packageRow === undefined || packageRow.lifecycleState !== 'ACTIVE') {
          return 'invalid' as const;
        }
        if (expectedSources.packageDefinition?.resourceRef.resourceId !== packageRow.packageDefinitionId) {
          return 'invalid' as const;
        }
        if (expectedSources.packageDefinition.revision !== packageRow.currentRevision) {
          return 'stale' as const;
        }
        ({ variantId } = packageRow);
        packageProductId = packageRow.productId;
      }
      const [variantRow] = yield* transaction
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.tenantId, scope.tenantId), eq(productVariants.variantId, variantId)))
        .for('update')
        .limit(1);
      if (variantRow === undefined) {
        return 'invalid' as const;
      }
      if (variantRow.lifecycleState !== 'ACTIVE') {
        return 'invalid' as const;
      }
      if (expectedSources.variant.resourceRef.resourceId !== variantRow.variantId) {
        return 'invalid' as const;
      }
      if (expectedSources.variant.revision !== variantRow.currentRevision) {
        return 'stale' as const;
      }
      if (packageProductId !== undefined && packageProductId !== variantRow.productId) {
        return 'invalid' as const;
      }
      const [product] = yield* transaction
        .select()
        .from(products)
        .where(and(eq(products.tenantId, scope.tenantId), eq(products.productId, variantRow.productId)))
        .for('update')
        .limit(1);
      if (product?.lifecycleState !== 'ACTIVE') {
        return 'invalid' as const;
      }
      if (expectedSources.product.resourceRef.resourceId !== product.productId) {
        return 'invalid' as const;
      }
      return expectedSources.product.revision === product.currentRevision ? ('valid' as const) : ('stale' as const);
    }, Effect.mapError(unavailable)),
  };
  return Effect.succeed(productUnitPersistenceForScope(transaction, scope, basis));
};

export const mapProductUnitPersistenceError = () =>
  new ProductUnitActionError({
    code: 'product_unit_unavailable',
    reason: 'Authoritative Product Unit persistence or Current basis is unavailable',
  });

export const resolveProductUnitMutation = (outcome: ProductUnitMutationOutcome) =>
  Match.value(outcome).pipe(
    Match.whenOr(
      { _tag: 'created' },
      { _tag: 'revised' },
      { _tag: 'retired' },
      { _tag: 'divisibility_set' },
      ({ ruleRevision, targetDivisibility, unit }) =>
        Effect.succeed(
          targetDivisibility === undefined ? { ruleRevision, unit } : { ruleRevision, targetDivisibility, unit },
        ),
    ),
    Match.tag('invalid', ({ reason }) =>
      Effect.fail(new ProductUnitActionError({ code: 'product_unit_invalid', reason })),
    ),
    Match.tag('not_found', () =>
      Effect.fail(
        new ProductUnitActionError({
          code: 'product_unit_invalid',
          reason: 'Product Unit was not found in the trusted Tenant',
        }),
      ),
    ),
    Match.tag('stale', () =>
      Effect.fail(
        new ProductUnitActionError({ code: 'product_unit_stale', reason: 'Product Unit Current revision changed' }),
      ),
    ),
    Match.exhaustive,
  );
