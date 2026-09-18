import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type { VariantUseChangeConflict, VariantUseChangeDecision } from '../../shared/domain/variant-use-change.ts';
import { revalidateVariantReactivation } from '../../shared/domain/variant-use-change.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import type { CatalogPersistenceUnavailable } from './errors.ts';
import type {
  CurrentVariantAxes,
  CurrentVariantAxisValue,
  RecordedVariantCombination,
  VariantAxisPersistence,
} from './variant-axis-persistence.ts';
import { recordedVariantCombinationKey, variantAxisPersistenceForScope } from './variant-axis-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class VariantUseChangeBasisUnavailable extends Schema.TaggedError<VariantUseChangeBasisUnavailable>()(
  'VariantUseChangeBasisUnavailable',
  { code: Schema.Literal('variant_use_change_basis_unavailable'), reason: Schema.String },
) {}

export interface VariantReactivationAssessmentInput {
  readonly productRef: ProductRef;
  readonly variantRef: VariantRef;
}

export interface VariantUseChangePersistence {
  /**
   * Reconstruct a retired Variant's recorded combination from its Current effective values and
   * compare it with the recorded ACTIVE combinations. A collision is a definite conflict; a
   * clean identity still requires #479 open-selection revalidation before reactivation.
   */
  readonly assessReactivation: (
    input: VariantReactivationAssessmentInput,
  ) => Effect.Effect<
    VariantUseChangeDecision,
    CatalogPersistenceUnavailable | VariantUseChangeBasisUnavailable | VariantUseChangeConflict
  >;
}

const basisUnavailable = () =>
  new VariantUseChangeBasisUnavailable({
    code: 'variant_use_change_basis_unavailable',
    reason: 'Current axes or recorded Variant forms cannot be verified',
  });

/** Built on the #438/#440 recorded-variant and effective-value reads; no write authority is implied. */
export const variantUseChangePersistenceForAxes = (
  axes: VariantAxisPersistence,
  tenantId: string,
): VariantUseChangePersistence => ({
  assessReactivation: Effect.fn('VariantUseChangePersistence.assessReactivation')(function* assessReactivation(input) {
    if (
      input.productRef.tenantId !== tenantId ||
      input.variantRef.tenantId !== tenantId ||
      input.productRef.moduleId !== 'commerce.catalog' ||
      input.variantRef.moduleId !== 'commerce.catalog' ||
      input.productRef.resourceType !== 'commerce.catalog.product' ||
      input.variantRef.resourceType !== 'commerce.catalog.variant'
    ) {
      return yield* basisUnavailable();
    }
    const current: CurrentVariantAxes = yield* axes
      .readCurrent(input.productRef)
      .pipe(Effect.catchTag('VariantAxisBasisUnavailable', () => Effect.fail(basisUnavailable())));
    if (current.axisRevision < 1) {
      return yield* basisUnavailable();
    }
    const activeRead: Effect.Effect<
      readonly RecordedVariantCombination[],
      CatalogPersistenceUnavailable | VariantUseChangeBasisUnavailable
    > = axes
      .readRecordedCombinations(input.productRef, current)
      .pipe(Effect.catchTag('VariantAxisBasisUnavailable', () => Effect.fail(basisUnavailable())));
    const valuesRead: Effect.Effect<
      readonly CurrentVariantAxisValue[],
      CatalogPersistenceUnavailable | VariantUseChangeBasisUnavailable
    > = axes
      .readEffectiveValues(input.productRef, input.variantRef, current)
      .pipe(Effect.catchTag('VariantAxisBasisUnavailable', () => Effect.fail(basisUnavailable())));
    const [active, values] = yield* Effect.all([activeRead, valuesRead] as const, { concurrency: 2 });
    if (values.some((value) => value.source === 'MISSING')) {
      return yield* basisUnavailable();
    }
    return yield* revalidateVariantReactivation({
      activeCombinationKeys: active.map((combination) => combination.combinationKey),
      reactivationCombinationKey: recordedVariantCombinationKey(values, tenantId),
    });
  }),
});

/** Constructed only inside Core's already-scoped Action transaction. */
export const variantUseChangePersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantUseChangePersistence =>
  variantUseChangePersistenceForAxes(variantAxisPersistenceForScope(transaction, scope), scope.tenantId);
