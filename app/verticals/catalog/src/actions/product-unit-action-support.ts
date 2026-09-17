import { Effect } from 'effect';

import { ProductUnitActionError } from '../../shared/actions/product-unit-contract.ts';
import type { ProductUnitMutationOutcome } from '../persistence/product-unit-persistence.ts';
import { productUnitPersistenceForScope } from '../persistence/product-unit-persistence.ts';

export const productUnitPersistenceServiceFactory = (...args: Parameters<typeof productUnitPersistenceForScope>) =>
  Effect.succeed(productUnitPersistenceForScope(...args));

export const mapProductUnitPersistenceError = () =>
  new ProductUnitActionError({
    code: 'product_unit_unavailable',
    reason: 'Authoritative Product Unit persistence or Current basis is unavailable',
  });

export const resolveProductUnitMutation = (outcome: ProductUnitMutationOutcome) => {
  switch (outcome._tag) {
    case 'created':
    case 'revised':
    case 'retired':
    case 'divisibility_set':
      return Effect.succeed(outcome.targetDivisibility === undefined
        ? { ruleRevision: outcome.ruleRevision, unit: outcome.unit }
        : { ruleRevision: outcome.ruleRevision, targetDivisibility: outcome.targetDivisibility, unit: outcome.unit });
    case 'invalid':
      return Effect.fail(new ProductUnitActionError({ code: 'product_unit_invalid', reason: outcome.reason }));
    case 'not_found':
      return Effect.fail(
        new ProductUnitActionError({
          code: 'product_unit_invalid',
          reason: 'Product Unit was not found in the trusted Tenant',
        }),
      );
    case 'stale':
      return Effect.fail(
        new ProductUnitActionError({ code: 'product_unit_stale', reason: 'Product Unit Current revision changed' }),
      );
  }
};
