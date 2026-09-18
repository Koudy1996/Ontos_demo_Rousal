import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type { CartOpenSelectionPopulationPort } from '../../shared/domain/catalog-open-selection-population.ts';
import { readCartOpenSelectionPopulation } from '../../shared/domain/catalog-open-selection-population.ts';
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
 * Core still supplies an owner-local transaction. A caller-held impact token has no authority
 * until Catalog issues a governed preview and can recheck the complete #479 open-selection
 * population. The Cart owner contract now enters as an injected port: when it is absent Catalog
 * keeps the typed fail-closed rejection and never presumes a Draft Product is selection-free;
 * when it is supplied Catalog reads its own Current evidence for the supplied open selections.
 * The governed preview/token flow itself is #423/#426-owned and still blocks the write.
 */
export const productTypeAssignmentPersistenceForScope = (
  _transaction: ScopedTransaction,
  scope: OperationalScope,
  authoritativeBasis: {
    /** Injected Cart owner contract; absent means Catalog cannot attest the population. */
    readonly openSelections?: CartOpenSelectionPopulationPort;
  } = {},
): Effect.Effect<ProductTypeAssignmentPersistence> =>
  Effect.succeed({
    set: Effect.fn('ProductTypeAssignmentPersistence.set')(function* set(_input) {
      if (authoritativeBasis.openSelections === undefined) {
        return yield* new ProductTypeAssignmentRejected({
          code: 'product_type_stale_impact_basis',
          reason: 'A governed impact preview and Current selection basis are required',
        });
      }
      const population = yield* readCartOpenSelectionPopulation(authoritativeBasis.openSelections, scope.tenantId).pipe(
        Effect.catchTag('CartOpenSelectionPopulationUnavailable', (failure) =>
          Effect.fail(
            new ProductTypeAssignmentRejected({
              code: 'product_type_stale_impact_basis',
              reason: failure.reason,
            }),
          ),
        ),
      );
      return yield* new ProductTypeAssignmentRejected({
        code: 'product_type_stale_impact_basis',
        reason: `A governed impact preview over ${population.selections.length} open selection(s) is required before assignment`,
      });
    }),
  });
