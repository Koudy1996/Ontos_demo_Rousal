import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type { ProductRef } from '../../shared/resources/product.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class CatalogOpenSelectionImpactUnavailable extends Schema.TaggedError<CatalogOpenSelectionImpactUnavailable>()(
  'CatalogOpenSelectionImpactUnavailable',
  { code: Schema.Literal('catalog_open_selection_impact_unavailable'), reason: Schema.String },
) {}

/**
 * Catalog has no durable registry of open Cart/checkout selections. Until that owner source
 * exists, an absent local row cannot attest an empty population or authorize an impact write.
 */
export const catalogOpenSelectionImpactForScope = (_transaction: ScopedTransaction, _scope: OperationalScope) => ({
  assess: Effect.fn('CatalogOpenSelectionImpact.assess')(function* assess(_productRef: ProductRef) {
    return yield* new CatalogOpenSelectionImpactUnavailable({
      code: 'catalog_open_selection_impact_unavailable',
      reason: 'Complete durable open-selection population is not available to Catalog',
    });
  }),
});
