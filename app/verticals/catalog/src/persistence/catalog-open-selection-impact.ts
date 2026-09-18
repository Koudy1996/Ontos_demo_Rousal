import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type {
  CartOpenSelectionPopulationPort,
  CatalogSelectionEvidenceReader,
} from '../../shared/domain/catalog-open-selection-population.ts';
import { openSelectionReferencesProduct } from '../../shared/domain/catalog-open-selection-population.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import { catalogSelectionEvidenceForScope } from './catalog-selection-evidence-service.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class CatalogOpenSelectionImpactUnavailable extends Schema.TaggedError<CatalogOpenSelectionImpactUnavailable>()(
  'CatalogOpenSelectionImpactUnavailable',
  { code: Schema.Literal('catalog_open_selection_impact_unavailable'), reason: Schema.String },
) {}

const unavailable = (reason: string) =>
  new CatalogOpenSelectionImpactUnavailable({ code: 'catalog_open_selection_impact_unavailable', reason });

/**
 * Catalog has no durable registry of open Cart/checkout selections. A positive path exists only
 * when the Cart owner injects a complete population port: Catalog then confirms the population is
 * genuinely complete, finds no open selection for the Product, and reads its own #479 evidence for
 * any selection it does find. An absent or unverifiable owner contract stays a visible typed
 * failure; an absent local row can never attest an empty population or authorize an impact write.
 */
export const catalogOpenSelectionImpactForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  population?: CartOpenSelectionPopulationPort,
  assessOpenSelection?: CatalogSelectionEvidenceReader['assess'],
) => ({
  assess: Effect.fn('CatalogOpenSelectionImpact.assess')(function* assess(productRef: ProductRef) {
    if (population === undefined) {
      return yield* unavailable('Complete durable open-selection population is not available to Catalog');
    }
    const snapshot = yield* population.read.pipe(
      Effect.catchTag('CartOpenSelectionPopulationUnavailable', (failure) => Effect.fail(unavailable(failure.reason))),
    );
    const matching = snapshot.selections.filter(({ selection }) =>
      openSelectionReferencesProduct(selection, productRef),
    );
    if (matching.length === 0) {
      return yield* Effect.void;
    }
    // Catalog still reads its own Current evidence for the open selections it can see; a failed
    // owner read is a typed unavailable outcome, never an assumed absence of impact.
    const assessSelection =
      assessOpenSelection ?? ((request) => catalogSelectionEvidenceForScope(transaction, scope).assess(request));
    const assessments = yield* Effect.forEach(
      matching,
      ({ selection }) => assessSelection({ purpose: 'CART_VALIDATION', selection }),
      { concurrency: 1 },
    );
    return yield* unavailable(
      `Product is referenced by ${matching.length} open Catalog selection(s): ${assessments
        .map(({ evidence: decision }) => ('status' in decision ? decision.status : decision.kind))
        .join(', ')}`,
    );
  }),
});
