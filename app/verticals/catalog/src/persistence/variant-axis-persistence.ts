import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import {
  attributeDefinitions,
  attributeValueItems,
  attributeValueSets,
  attributeDefinitionRevisions,
  productTypeAssignments,
  productTypeRevisions,
  productTypeRevisionAttributes,
  productTypes,
  productVariantAxes,
  productVariantAxisEvents,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const catalogModuleId = 'commerce.catalog';

export class VariantAxisBasisUnavailable extends Schema.TaggedError<VariantAxisBasisUnavailable>()(
  'VariantAxisBasisUnavailable',
  { code: Schema.Literal('variant_axis_basis_unavailable'), reason: Schema.String },
) {}

interface CurrentVariantAxis {
  readonly attributeDefinitionId: string;
  readonly controlledValueKind: string | null;
  readonly inheritable: boolean;
  readonly multiplicity: string;
  readonly ordinal: number;
  readonly valueKind: string;
}

interface CurrentVariantAxes {
  readonly axes: readonly CurrentVariantAxis[];
  readonly axisRevision: number;
  readonly productId: string;
  readonly productTypeRevision: number | null;
}

export interface VariantAxisPersistence {
  readonly readCurrent: (
    productRef: ProductRef,
  ) => Effect.Effect<CurrentVariantAxes, CatalogPersistenceUnavailable | VariantAxisBasisUnavailable>;
  /** Complete source-qualified value rows for the declared Current axes, not allowed-set proof. */
  readonly readEffectiveValues: (
    productRef: ProductRef,
    variantRef: VariantRef,
    axes: CurrentVariantAxes,
  ) => Effect.Effect<readonly CurrentVariantAxisValue[], CatalogPersistenceUnavailable | VariantAxisBasisUnavailable>;
}

export interface CurrentVariantAxisValue {
  readonly attributeDefinitionId: string;
  readonly items: readonly (typeof attributeValueItems.$inferSelect)[];
  readonly source: 'PRODUCT' | 'VARIANT' | 'MISSING';
  readonly sourceRevision: number | null;
}

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const error = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

const basisUnavailable = () =>
  new VariantAxisBasisUnavailable({
    code: 'variant_axis_basis_unavailable',
    reason: 'Current Product axes or allowed values cannot be verified',
  });

const malformedAxisSnapshot = (
  event: typeof productVariantAxisEvents.$inferSelect | undefined,
  rows: readonly (typeof productVariantAxes.$inferSelect)[],
  tenantId: string,
  productId: string,
): boolean =>
  (event !== undefined && (event.tenantId !== tenantId || event.productId !== productId)) ||
  rows.some((row) => row.tenantId !== tenantId || row.productId !== productId) ||
  (event === undefined && rows.length !== 0) ||
  (event !== undefined &&
    (rows.length !== event.attributeDefinitionIds.length ||
      rows.some(
        (row, index) =>
          row.axisRevision !== event.axisRevision ||
          row.ordinal !== index ||
          row.attributeDefinitionId !== event.attributeDefinitionIds[index],
      )));

/** Constructed only inside Core's already-scoped read or Action transaction. */
export const variantAxisPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantAxisPersistence => {
  const { tenantId } = scope;

  const readAxis = Effect.fn('VariantAxisPersistence.readAxis')(function* readAxis(
    row: typeof productVariantAxes.$inferSelect,
    productTypeId: string,
    productTypeRevision: number,
  ) {
    const [definition] = yield* transaction
      .select()
      .from(attributeDefinitions)
      .where(
        and(
          eq(attributeDefinitions.tenantId, tenantId),
          eq(attributeDefinitions.attributeDefinitionId, row.attributeDefinitionId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      definition === undefined ||
      definition.tenantId !== tenantId ||
      definition.attributeDefinitionId !== row.attributeDefinitionId ||
      !new Set(definition.applicableLevels).has('VARIANT')
    ) {
      return yield* basisUnavailable();
    }
    const [definitionRevision] = yield* transaction
      .select({
        applicableLevels: attributeDefinitionRevisions.applicableLevels,
        controlledValueKind: attributeDefinitionRevisions.controlledValueKind,
        multiplicity: attributeDefinitionRevisions.multiplicity,
        valueKind: attributeDefinitionRevisions.valueKind,
      })
      .from(attributeDefinitionRevisions)
      .where(
        and(
          eq(attributeDefinitionRevisions.tenantId, tenantId),
          eq(attributeDefinitionRevisions.attributeDefinitionId, row.attributeDefinitionId),
          eq(attributeDefinitionRevisions.revision, definition.currentRevision),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      definitionRevision === undefined ||
      !new Set(definitionRevision.applicableLevels).has('VARIANT') ||
      definitionRevision.valueKind !== definition.valueKind ||
      definitionRevision.controlledValueKind !== definition.controlledValueKind ||
      definitionRevision.multiplicity !== definition.multiplicity
    ) {
      return yield* basisUnavailable();
    }
    const [rule] = yield* transaction
      .select({ attributeDefinitionId: productTypeRevisionAttributes.attributeDefinitionId })
      .from(productTypeRevisionAttributes)
      .where(
        and(
          eq(productTypeRevisionAttributes.tenantId, tenantId),
          eq(productTypeRevisionAttributes.productTypeId, productTypeId),
          eq(productTypeRevisionAttributes.revision, productTypeRevision),
          eq(productTypeRevisionAttributes.attributeDefinitionId, row.attributeDefinitionId),
          eq(productTypeRevisionAttributes.level, 'VARIANT'),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (rule === undefined) {
      return yield* basisUnavailable();
    }
    let inheritable = false;
    if (new Set(definition.applicableLevels).has('PRODUCT')) {
      const [productRule] = yield* transaction
        .select({ attributeDefinitionId: productTypeRevisionAttributes.attributeDefinitionId })
        .from(productTypeRevisionAttributes)
        .where(
          and(
            eq(productTypeRevisionAttributes.tenantId, tenantId),
            eq(productTypeRevisionAttributes.productTypeId, productTypeId),
            eq(productTypeRevisionAttributes.revision, productTypeRevision),
            eq(productTypeRevisionAttributes.attributeDefinitionId, row.attributeDefinitionId),
            eq(productTypeRevisionAttributes.level, 'PRODUCT'),
          ),
        )
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      inheritable = productRule !== undefined;
    }
    // This is definition/rule evidence only. Shared vocabulary is not a
    // Product-specific allowed set and cannot authorize Current selection.
    return {
      attributeDefinitionId: row.attributeDefinitionId,
      controlledValueKind: definition.controlledValueKind,
      inheritable,
      multiplicity: definition.multiplicity,
      ordinal: row.ordinal,
      valueKind: definition.valueKind,
    } satisfies CurrentVariantAxis;
  });

  const readCurrent: VariantAxisPersistence['readCurrent'] = Effect.fn('VariantAxisPersistence.readCurrent')(
    function* readCurrent(productRef) {
      if (
        productRef.tenantId !== tenantId ||
        productRef.moduleId !== catalogModuleId ||
        productRef.resourceType !== 'commerce.catalog.product'
      ) {
        return yield* basisUnavailable();
      }
      const productId = productRef.resourceId;
      const [product] = yield* transaction
        .select({ productId: products.productId })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (product === undefined) {
        return yield* basisUnavailable();
      }

      const events = yield* transaction
        .select()
        .from(productVariantAxisEvents)
        .where(and(eq(productVariantAxisEvents.tenantId, tenantId), eq(productVariantAxisEvents.productId, productId)))
        .orderBy(desc(productVariantAxisEvents.axisRevision))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      const [event] = events;
      const rows = yield* transaction
        .select()
        .from(productVariantAxes)
        .where(and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.productId, productId)))
        .orderBy(asc(productVariantAxes.ordinal))
        .pipe(Effect.mapError(unavailable));
      if (malformedAxisSnapshot(event, rows, tenantId, productId)) {
        return yield* basisUnavailable();
      }

      const [assignment] = yield* transaction
        .select()
        .from(productTypeAssignments)
        .where(and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      let productTypeRevision: number | null = null;
      if (assignment !== undefined) {
        const [type] = yield* transaction
          .select({ currentRevision: productTypes.currentRevision })
          .from(productTypes)
          .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
          .limit(1)
          .pipe(Effect.mapError(unavailable));
        if (type === undefined || !Number.isInteger(type.currentRevision) || type.currentRevision < 1) {
          return yield* basisUnavailable();
        }
        productTypeRevision = type.currentRevision;
        const [typeRevision] = yield* transaction
          .select({ revision: productTypeRevisions.revision })
          .from(productTypeRevisions)
          .where(
            and(
              eq(productTypeRevisions.tenantId, tenantId),
              eq(productTypeRevisions.productTypeId, assignment.productTypeId),
              eq(productTypeRevisions.revision, type.currentRevision),
            ),
          )
          .limit(1)
          .pipe(Effect.mapError(unavailable));
        if (typeRevision === undefined) {
          return yield* basisUnavailable();
        }
      } else if (rows.length !== 0) {
        return yield* basisUnavailable();
      }

      const axes = yield* Effect.forEach(
        rows,
        (row) => readAxis(row, assignment?.productTypeId ?? '', productTypeRevision ?? 0),
        { concurrency: 1 },
      );
      return { axes, axisRevision: event?.axisRevision ?? 0, productId, productTypeRevision };
    },
  );

  const readOneValue = Effect.fn('VariantAxisPersistence.readOneValue')(function* readOneValue(
    productRef: ProductRef,
    variantRef: VariantRef,
    axis: CurrentVariantAxis,
  ) {
    const sets = yield* transaction
      .select()
      .from(attributeValueSets)
      .where(
        and(
          eq(attributeValueSets.tenantId, tenantId),
          eq(attributeValueSets.productId, productRef.resourceId),
          eq(attributeValueSets.attributeDefinitionId, axis.attributeDefinitionId),
          or(isNull(attributeValueSets.variantId), eq(attributeValueSets.variantId, variantRef.resourceId)),
        ),
      )
      .pipe(Effect.mapError(unavailable));
    if (
      sets.length > 2 ||
      sets.some(
        (set) =>
          set.tenantId !== tenantId ||
          set.productId !== productRef.resourceId ||
          set.attributeDefinitionId !== axis.attributeDefinitionId ||
          (set.variantId !== null && set.variantId !== variantRef.resourceId),
      ) ||
      sets.filter((set) => set.variantId === null).length > 1 ||
      sets.filter((set) => set.variantId === variantRef.resourceId).length > 1
    ) {
      return yield* basisUnavailable();
    }
    const direct = sets.find((set) => set.variantId === variantRef.resourceId);
    const inherited = sets.find((set) => set.variantId === null);
    let selected = direct?.currentState === 'SET' ? direct : null;
    if (selected === null && axis.inheritable && inherited?.currentState === 'SET') {
      selected = inherited;
    }
    if (selected === null) {
      return {
        attributeDefinitionId: axis.attributeDefinitionId,
        items: [],
        source: 'MISSING',
        sourceRevision: null,
      } satisfies CurrentVariantAxisValue;
    }
    if (!Number.isSafeInteger(selected.currentRevision) || selected.currentRevision < 1) {
      return yield* basisUnavailable();
    }
    const items = yield* transaction
      .select()
      .from(attributeValueItems)
      .where(
        and(
          eq(attributeValueItems.tenantId, tenantId),
          eq(attributeValueItems.attributeValueSetId, selected.attributeValueSetId),
        ),
      )
      .orderBy(asc(attributeValueItems.ordinal))
      .pipe(Effect.mapError(unavailable));
    if (
      items.length === 0 ||
      items.some(
        (item, index) =>
          item.tenantId !== tenantId ||
          item.attributeValueSetId !== selected.attributeValueSetId ||
          item.attributeDefinitionId !== axis.attributeDefinitionId ||
          item.ordinal !== index,
      )
    ) {
      return yield* basisUnavailable();
    }
    return {
      attributeDefinitionId: axis.attributeDefinitionId,
      items,
      source: selected.variantId === null ? 'PRODUCT' : 'VARIANT',
      sourceRevision: selected.currentRevision,
    } satisfies CurrentVariantAxisValue;
  });

  const readEffectiveValues: VariantAxisPersistence['readEffectiveValues'] = Effect.fn(
    'VariantAxisPersistence.readEffectiveValues',
  )(function* readEffectiveValues(productRef, variantRef, axes) {
    if (
      productRef.tenantId !== tenantId ||
      variantRef.tenantId !== tenantId ||
      productRef.moduleId !== catalogModuleId ||
      variantRef.moduleId !== catalogModuleId ||
      productRef.resourceType !== 'commerce.catalog.product' ||
      variantRef.resourceType !== 'commerce.catalog.variant' ||
      axes.productId !== productRef.resourceId ||
      axes.axisRevision < 1
    ) {
      return yield* basisUnavailable();
    }
    return yield* Effect.forEach(axes.axes, (axis) => readOneValue(productRef, variantRef, axis), { concurrency: 1 });
  });

  return { readCurrent, readEffectiveValues };
};
