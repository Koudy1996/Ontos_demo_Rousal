import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { CatalogSelection, CatalogSelectionRevision } from '../../shared/domain/catalog-selection-evidence.ts';
import {
  CatalogSelectionRevisionSchema,
  CatalogSelectionSchema,
} from '../../shared/domain/catalog-selection-evidence.ts';
import type { QuantityNormalization, QuantityPhase } from '../../shared/domain/purchase-quantity.ts';
import { normalizePurchaseQuantity } from '../../shared/domain/purchase-quantity.ts';
import type { CatalogResourceRef } from '../../shared/domain/catalog-revision-reference.ts';
import {
  packageDefinitions,
  packageUnitDivisibility,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
  variantUnitDivisibility,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export interface CatalogQuantityPreparationRequest {
  readonly amount: string;
  /** Revisions previously observed by the candidate; mismatch requires re-preparation. */
  readonly expected?: {
    readonly productRevision: number;
    readonly variantRevision: number;
    readonly packageDefinitionRevision?: number;
    readonly unitRuleRevision: number;
    readonly targetDivisibilityRevision: number;
  };
  readonly phase: QuantityPhase;
  readonly selection: CatalogSelection;
}

export type CatalogQuantityPreparation =
  | {
      readonly divisible: boolean;
      readonly quantity: Extract<QuantityNormalization, { status: 'VALID' }>;
      readonly selection: CatalogSelection;
      readonly sources: {
        readonly product: CatalogSelectionRevision;
        readonly variant: CatalogSelectionRevision;
        readonly packageDefinition: CatalogSelectionRevision | undefined;
        readonly unitRuleRevision: number;
        readonly targetDivisibilityRevision: number;
      };
      readonly status: 'PREPARED';
      readonly unitRef: CatalogResourceRef;
    }
  | { readonly reason: string; readonly status: 'INVALID' | 'INDETERMINATE' | 'STALE' };

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog quantity preparation basis is unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const failure = (status: 'INVALID' | 'INDETERMINATE' | 'STALE', reason: string): CatalogQuantityPreparation => ({
  reason,
  status,
});

const validRevision = (revision: number): boolean =>
  Number.isSafeInteger(revision) && revision > 0 && revision <= 2_147_483_647;

/** Owner-local candidate preparation. The caller supplies Core's one scoped transaction. */
export const catalogQuantityPreparationForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  prepare: Effect.fn('CatalogQuantityPreparation.prepare')(function* prepare(
    input: CatalogQuantityPreparationRequest,
  ): Effect.fn.Return<CatalogQuantityPreparation, CatalogPersistenceUnavailable> {
    const { selection } = input;
    const { tenantId } = scope;
    if (!Schema.is(CatalogSelectionSchema)(selection) || selection.productRef.tenantId !== tenantId) {
      return failure('INVALID', 'Selection is malformed or outside the trusted Tenant');
    }
    if (input.phase !== 'PREPARE' && input.expected === undefined) {
      return failure('INDETERMINATE', 'Later phases require the prepared candidate revisions');
    }
    const [product] = yield* transaction
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, selection.productRef.resourceId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (product === undefined) {
      return failure('INDETERMINATE', 'Product basis is missing');
    }
    const [variant] = yield* transaction
      .select()
      .from(productVariants)
      .where(
        and(eq(productVariants.tenantId, tenantId), eq(productVariants.variantId, selection.variantRef.resourceId)),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (variant === undefined) {
      return failure('INDETERMINATE', 'Variant basis is missing');
    }
    if (variant.productId !== product.productId) {
      return failure('INVALID', 'Variant belongs to another Product');
    }
    if (product.lifecycleState !== 'ACTIVE' || variant.lifecycleState !== 'ACTIVE') {
      return failure('INVALID', 'Product or Variant is not active');
    }
    if (!validRevision(product.currentRevision) || !validRevision(variant.currentRevision)) {
      return failure('INDETERMINATE', 'Product or Variant revision is unusable');
    }

    const packageId = selection.packageOption?.optionRef.resourceId;
    const [pack] =
      packageId === undefined
        ? [undefined]
        : yield* transaction
            .select()
            .from(packageDefinitions)
            .where(
              and(eq(packageDefinitions.tenantId, tenantId), eq(packageDefinitions.packageDefinitionId, packageId)),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
    if (packageId !== undefined && pack === undefined) {
      return failure('INDETERMINATE', 'Package Definition basis is missing');
    }
    if (pack !== undefined) {
      if (pack.productId !== product.productId || pack.variantId !== variant.variantId) {
        return failure('INVALID', 'Package Definition belongs to another Product or Variant');
      }
      if (pack.lifecycleState !== 'ACTIVE' || pack.optionState !== 'ACTIVE') {
        return failure('INVALID', 'Package Option is not selectable');
      }
      if (!validRevision(pack.currentRevision)) {
        return failure('INDETERMINATE', 'Package Definition revision is unusable');
      }
    }

    const targetId = packageId ?? variant.variantId;
    const [target] =
      packageId === undefined
        ? yield* transaction
            .select()
            .from(variantUnitDivisibility)
            .where(and(eq(variantUnitDivisibility.tenantId, tenantId), eq(variantUnitDivisibility.variantId, targetId)))
            .limit(1)
            .pipe(Effect.mapError(unavailable))
        : yield* transaction
            .select()
            .from(packageUnitDivisibility)
            .where(
              and(
                eq(packageUnitDivisibility.tenantId, tenantId),
                eq(packageUnitDivisibility.packageDefinitionId, targetId),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
    if (target === undefined || !validRevision(target.currentRevision)) {
      return failure('INDETERMINATE', 'Target Unit or divisibility revision is missing');
    }
    const [unit] = yield* transaction
      .select()
      .from(productUnits)
      .where(and(eq(productUnits.tenantId, tenantId), eq(productUnits.unitId, target.unitId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (unit === undefined || !validRevision(unit.currentRuleRevision)) {
      return failure('INDETERMINATE', 'Product Unit basis is missing');
    }
    if (unit.lifecycleState !== 'ACTIVE') {
      return failure('INVALID', 'Product Unit is retired');
    }
    const [rule] = yield* transaction
      .select()
      .from(productUnitRuleRevisions)
      .where(
        and(
          eq(productUnitRuleRevisions.tenantId, tenantId),
          eq(productUnitRuleRevisions.unitId, unit.unitId),
          eq(productUnitRuleRevisions.revision, unit.currentRuleRevision),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (rule === undefined || (rule.rounding !== 'UP' && rule.rounding !== 'DOWN' && rule.rounding !== 'HALF_UP')) {
      return failure('INDETERMINATE', 'Current Unit rule is missing or unusable');
    }

    const { expected } = input;
    if (
      expected !== undefined &&
      (expected.productRevision !== product.currentRevision ||
        expected.variantRevision !== variant.currentRevision ||
        expected.packageDefinitionRevision !== pack?.currentRevision ||
        expected.unitRuleRevision !== unit.currentRuleRevision ||
        expected.targetDivisibilityRevision !== target.currentRevision)
    ) {
      return failure('STALE', 'Candidate Catalog quantity sources changed');
    }

    const quantity = normalizePurchaseQuantity(
      {
        amount: input.amount,
        divisible: target.divisible,
        targetId,
        tenantId,
        unitId: unit.unitId,
      },
      {
        revision: rule.revision,
        rounding: rule.rounding,
        step: rule.step,
        tenantId,
        unitId: unit.unitId,
      },
      input.phase,
    );
    if (quantity.status !== 'VALID') {
      if (quantity.status === 'INVALID') return failure('INVALID', quantity.reason);
      if (quantity.status === 'REPREPARE_REQUIRED') return failure('STALE', quantity.reason);
      return failure('INDETERMINATE', quantity.reason);
    }
    const unitRef = {
      moduleId: 'commerce.catalog',
      resourceId: unit.unitId,
      resourceType: 'commerce.catalog.product-unit',
      tenantId,
    } as const;
    const productSource = yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
      resourceRef: selection.productRef,
      revision: product.currentRevision,
    }).pipe(Effect.mapError(unavailable));
    const variantSource = yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
      resourceRef: selection.variantRef,
      revision: variant.currentRevision,
    }).pipe(Effect.mapError(unavailable));
    const packageSource =
      pack === undefined || selection.packageOption === undefined
        ? undefined
        : yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
            resourceRef: selection.packageOption.optionRef,
            revision: pack.currentRevision,
          }).pipe(Effect.mapError(unavailable));
    const sources = {
      product: productSource,
      variant: variantSource,
      targetDivisibilityRevision: target.currentRevision,
      unitRuleRevision: unit.currentRuleRevision,
      packageDefinition: packageSource,
    };
    return {
      divisible: target.divisible,
      quantity,
      selection,
      sources,
      status: 'PREPARED',
      unitRef,
    };
  }),
});
