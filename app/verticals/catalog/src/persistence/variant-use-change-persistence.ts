import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type {
  VariantReactivationRequiredPackageOption,
  VariantUseChangeConflict,
  VariantUseChangeDecision,
} from '../../shared/domain/variant-use-change.ts';
import { revalidateVariantReactivation } from '../../shared/domain/variant-use-change.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import { packageDefinitions, packageOptionRoleRevisions, products } from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';
import type {
  CurrentVariantAxes,
  CurrentVariantAxisValue,
  RecordedVariantCombination,
  VariantAxisPersistence,
} from './variant-axis-persistence.ts';
import { recordedVariantCombinationKey, variantAxisPersistenceForScope } from './variant-axis-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

const catalogModuleId = 'commerce.catalog';
const productResourceType = 'commerce.catalog.product';
const variantResourceType = 'commerce.catalog.variant';

export class VariantUseChangeBasisUnavailable extends Schema.TaggedError<VariantUseChangeBasisUnavailable>()(
  'VariantUseChangeBasisUnavailable',
  { code: Schema.Literal('variant_use_change_basis_unavailable'), reason: Schema.String },
) {}

export interface VariantReactivationAssessmentInput {
  readonly productRef: ProductRef;
  readonly variantRef: VariantRef;
}

export interface VariantReactivationBasis {
  readonly parentProductLifecycle: 'ACTIVE' | 'DRAFT' | 'RETIRED';
  readonly requiredPackageOptions: readonly VariantReactivationRequiredPackageOption[];
}

/** Owner-issued lifecycle facts for rule 10: a retired parent or required Package Option blocks reactivation. */
export interface VariantReactivationBasisPersistence {
  readonly read: (
    input: VariantReactivationAssessmentInput,
  ) => Effect.Effect<VariantReactivationBasis, CatalogPersistenceUnavailable | VariantUseChangeBasisUnavailable>;
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

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const error = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog reactivation basis is temporarily unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

const productLifecycle = (value: string): VariantReactivationBasis['parentProductLifecycle'] | undefined =>
  value === 'ACTIVE' || value === 'DRAFT' || value === 'RETIRED' ? value : undefined;

const requiredOptionBasis = Effect.fn('VariantReactivationBasis.requiredOption')(function* requiredOption(
  transaction: ScopedTransaction,
  tenantId: string,
  definition: {
    readonly currentOptionRevision: number;
    readonly lifecycleState: string;
    readonly optionState: string;
    readonly packageDefinitionId: string;
  },
) {
  if (!Number.isSafeInteger(definition.currentOptionRevision) || definition.currentOptionRevision < 0) {
    return yield* basisUnavailable();
  }
  if (definition.currentOptionRevision === 0) {
    return null;
  }
  const [role] = yield* transaction
    .select({
      independentlyRequested: packageOptionRoleRevisions.independentlyRequested,
      looseUnitsSubstitutable: packageOptionRoleRevisions.looseUnitsSubstitutable,
      state: packageOptionRoleRevisions.state,
    })
    .from(packageOptionRoleRevisions)
    .where(
      and(
        eq(packageOptionRoleRevisions.tenantId, tenantId),
        eq(packageOptionRoleRevisions.packageDefinitionId, definition.packageDefinitionId),
        eq(packageOptionRoleRevisions.revision, definition.currentOptionRevision),
      ),
    )
    .limit(1)
    .pipe(Effect.mapError(unavailable));
  if (role === undefined || (role.state !== 'ACTIVE' && role.state !== 'RETIRED')) {
    return yield* basisUnavailable();
  }
  // Loose Variant quantity already satisfies the same legitimate request; it is not a required Option.
  if (!role.independentlyRequested || role.looseUnitsSubstitutable) {
    return null;
  }
  const active =
    definition.lifecycleState === 'ACTIVE' && definition.optionState === 'ACTIVE' && role.state === 'ACTIVE';
  return { lifecycle: active ? ('ACTIVE' as const) : ('RETIRED' as const) };
});

/** Owner-issued rule 10 lifecycle facts; no write authority and no #479 open-selection proof is implied. */
export const variantReactivationBasisForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantReactivationBasisPersistence => {
  const { tenantId } = scope;
  return {
    read: Effect.fn('VariantReactivationBasis.read')(function* read(input) {
      if (
        input.productRef.tenantId !== tenantId ||
        input.variantRef.tenantId !== tenantId ||
        input.productRef.moduleId !== catalogModuleId ||
        input.variantRef.moduleId !== catalogModuleId ||
        input.productRef.resourceType !== productResourceType ||
        input.variantRef.resourceType !== variantResourceType
      ) {
        return yield* basisUnavailable();
      }
      const [product] = yield* transaction
        .select({ lifecycleState: products.lifecycleState, productId: products.productId })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.productId, input.productRef.resourceId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (product === undefined || product.productId !== input.productRef.resourceId) {
        return yield* basisUnavailable();
      }
      const lifecycle = productLifecycle(product.lifecycleState);
      if (lifecycle === undefined) {
        return yield* basisUnavailable();
      }
      const definitions = yield* transaction
        .select({
          currentOptionRevision: packageDefinitions.currentOptionRevision,
          lifecycleState: packageDefinitions.lifecycleState,
          optionState: packageDefinitions.optionState,
          packageDefinitionId: packageDefinitions.packageDefinitionId,
        })
        .from(packageDefinitions)
        .where(
          and(
            eq(packageDefinitions.tenantId, tenantId),
            eq(packageDefinitions.productId, input.productRef.resourceId),
            eq(packageDefinitions.variantId, input.variantRef.resourceId),
          ),
        )
        .pipe(Effect.mapError(unavailable));
      const candidates = yield* Effect.forEach(
        definitions,
        (definition) => requiredOptionBasis(transaction, tenantId, definition),
        { concurrency: 1 },
      );
      const requiredPackageOptions = candidates.filter(
        (candidate): candidate is VariantReactivationRequiredPackageOption => candidate !== null,
      );
      return { parentProductLifecycle: lifecycle, requiredPackageOptions };
    }),
  };
};

/** Built on the #438/#440 recorded-variant and effective-value reads; no write authority is implied. */
export const variantUseChangePersistenceForAxes = (
  axes: VariantAxisPersistence,
  reactivationBasis: VariantReactivationBasisPersistence,
  tenantId: string,
): VariantUseChangePersistence => ({
  assessReactivation: Effect.fn('VariantUseChangePersistence.assessReactivation')(function* assessReactivation(input) {
    if (
      input.productRef.tenantId !== tenantId ||
      input.variantRef.tenantId !== tenantId ||
      input.productRef.moduleId !== catalogModuleId ||
      input.variantRef.moduleId !== catalogModuleId ||
      input.productRef.resourceType !== productResourceType ||
      input.variantRef.resourceType !== variantResourceType
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
    const basisRead: Effect.Effect<
      VariantReactivationBasis,
      CatalogPersistenceUnavailable | VariantUseChangeBasisUnavailable
    > = reactivationBasis.read(input);
    const [active, values, basis] = yield* Effect.all([activeRead, valuesRead, basisRead] as const, { concurrency: 3 });
    if (values.some((value) => value.source === 'MISSING')) {
      return yield* basisUnavailable();
    }
    return yield* revalidateVariantReactivation({
      activeCombinationKeys: active.map((combination) => combination.combinationKey),
      parentProductLifecycle: basis.parentProductLifecycle,
      reactivationCombinationKey: recordedVariantCombinationKey(values, tenantId),
      requiredPackageOptions: basis.requiredPackageOptions,
    });
  }),
});

/** Constructed only inside Core's already-scoped Action transaction. */
export const variantUseChangePersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantUseChangePersistence =>
  variantUseChangePersistenceForAxes(
    variantAxisPersistenceForScope(transaction, scope),
    variantReactivationBasisForScope(transaction, scope),
    scope.tenantId,
  );
