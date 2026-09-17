import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type { SetProductTypeResult } from '../../shared/actions/set-product-type.ts';
import type { ProductTypeRef } from '../../shared/resources/product-type.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class ProductTypeAssignmentRejected extends Schema.TaggedError<ProductTypeAssignmentRejected>()(
  'ProductTypeAssignmentRejected',
  {
    code: Schema.Literal('product_type_stale_impact_basis'),
    reason: Schema.String,
  },
) {}

interface SetProductTypePersistenceInput {
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
  ) => Effect.Effect<SetProductTypeResult, ProductTypeAssignmentRejected>;
}

/**
 * Core still supplies an owner-local transaction. A caller-held impact token has no
 * authority until Catalog issues a governed preview and can recheck the complete
 * #479 open-selection population. Neither boundary exists yet, so all writes fail
 * closed; in particular, a Draft Product is not presumed selection-free.
 */
export const productTypeAssignmentPersistenceForScope = (
  _transaction: ScopedTransaction,
  _scope: OperationalScope,
): Effect.Effect<ProductTypeAssignmentPersistence> =>
  Effect.succeed({
    set: Effect.fn('ProductTypeAssignmentPersistence.set')(function* set(_input) {
      return yield* new ProductTypeAssignmentRejected({
        code: 'product_type_stale_impact_basis',
        reason: 'A governed impact preview and Current selection basis are required',
      });
    }),
  });
