import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import {
  attributeDefinitions,
  attributeDefinitionRevisions,
  attributeValueItems,
  attributeValueSets,
  productTypeAssignments,
  productTypeRevisions,
  productTypeRevisionAttributes,
  productTypes,
  productAttributeApplicability,
  productAttributeApplicabilityRevisions,
  productVariantAxes,
  productVariantAxisEvents,
  productVariants,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';
import { effectiveAttributeValueReadsForScope } from './effective-attribute-value-reads.ts';
import { VariantAxisWriteConflict } from './variant-axis-write-conflict.ts';

export { VariantAxisWriteConflict } from './variant-axis-write-conflict.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const catalogModuleId = 'commerce.catalog';
const productResourceType = 'commerce.catalog.product';

export class VariantAxisBasisUnavailable extends Schema.TaggedError<VariantAxisBasisUnavailable>()(
  'VariantAxisBasisUnavailable',
  { code: Schema.Literal('variant_axis_basis_unavailable'), reason: Schema.String },
) {}

export interface GovernVariantAxesInput {
  readonly actionInvocationId: string;
  readonly axes: readonly { readonly attributeDefinitionId: string; readonly definitionRevision: number }[];
  readonly expectedAxisRevision: number;
  readonly principalId: string;
  readonly productRef: ProductRef;
  readonly reason: string;
}

export interface CurrentVariantAxis {
  readonly attributeDefinitionId: string;
  readonly controlledValueKind: string | null;
  readonly definitionRevision: number;
  readonly inheritable: boolean;
  readonly multiplicity: string;
  readonly ordinal: number;
  readonly valueKind: string;
}

export interface CurrentVariantAxes {
  readonly axes: readonly CurrentVariantAxis[];
  readonly axisRevision: number;
  readonly productId: string;
  readonly productTypeRevision: number | null;
}

export interface VariantAxisPersistence {
  readonly govern: (
    input: GovernVariantAxesInput,
  ) => Effect.Effect<
    { readonly axisRevision: number; readonly changed: boolean },
    CatalogPersistenceUnavailable | VariantAxisWriteConflict
  >;
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
  readonly definitionRevision: number;
  readonly items: readonly (typeof attributeValueItems.$inferSelect)[];
  readonly source: 'PRODUCT' | 'VARIANT' | 'MISSING';
  readonly sourceRevision: number | null;
  readonly sourceValueSetRef: { readonly attributeValueSetId: string; readonly tenantId: string } | null;
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

const writeConflict = (kind: VariantAxisWriteConflict['conflict'], reason: string) =>
  new VariantAxisWriteConflict({ code: 'variant_axis_write_conflict', conflict: kind, reason });

const invalidGovernInput = (input: GovernVariantAxesInput, tenantId: string): boolean =>
  input.productRef.tenantId !== tenantId ||
  input.productRef.moduleId !== catalogModuleId ||
  input.productRef.resourceType !== productResourceType ||
  !Number.isSafeInteger(input.expectedAxisRevision) ||
  input.expectedAxisRevision < 0 ||
  input.axes.length > 32 ||
  new Set(input.axes.map((axis) => axis.attributeDefinitionId)).size !== input.axes.length ||
  input.axes.some((axis) => !Number.isSafeInteger(axis.definitionRevision) || axis.definitionRevision < 1);

const invalidAxisDefinitionPointer = (
  definition: typeof attributeDefinitions.$inferSelect,
  row: typeof productVariantAxes.$inferSelect,
  tenantId: string,
): boolean =>
  definition.tenantId !== tenantId ||
  definition.attributeDefinitionId !== row.attributeDefinitionId ||
  !Number.isSafeInteger(definition.currentRevision) ||
  definition.currentRevision < 1 ||
  !Number.isSafeInteger(row.definitionRevision) ||
  (row.definitionRevision ?? 0) < 1 ||
  definition.currentRevision < (row.definitionRevision ?? 0);

const invalidProductAxisApplicability = (
  applicability: typeof productAttributeApplicability.$inferSelect | undefined,
  tenantId: string,
  productId: string,
  attributeDefinitionId: string,
): boolean =>
  applicability === undefined ||
  applicability.tenantId !== tenantId ||
  applicability.productId !== productId ||
  applicability.attributeDefinitionId !== attributeDefinitionId ||
  !applicability.variantLevel ||
  !Number.isSafeInteger(applicability.currentRevision) ||
  applicability.currentRevision < 1;

const invalidProductAxisApplicabilityRevision = (
  revision: typeof productAttributeApplicabilityRevisions.$inferSelect | undefined,
  applicability: typeof productAttributeApplicability.$inferSelect,
): boolean =>
  revision === undefined ||
  revision.tenantId !== applicability.tenantId ||
  revision.productId !== applicability.productId ||
  revision.attributeDefinitionId !== applicability.attributeDefinitionId ||
  revision.revision !== applicability.currentRevision ||
  !revision.variantLevel ||
  revision.productLevel !== applicability.productLevel;

const malformedAxisSnapshot = (
  event: typeof productVariantAxisEvents.$inferSelect | undefined,
  rows: readonly (typeof productVariantAxes.$inferSelect)[],
  tenantId: string,
  productId: string,
): boolean =>
  (event !== undefined && (event.tenantId !== tenantId || event.productId !== productId)) ||
  (event !== undefined &&
    (event.attributeDefinitionRevisions === null ||
      event.attributeDefinitionRevisions.length !== event.attributeDefinitionIds.length ||
      event.attributeDefinitionRevisions.some((revision) => !Number.isSafeInteger(revision) || revision < 1))) ||
  rows.some((row) => row.tenantId !== tenantId || row.productId !== productId) ||
  (event === undefined && rows.length !== 0) ||
  (event !== undefined &&
    (rows.length !== event.attributeDefinitionIds.length ||
      rows.some(
        (row, index) =>
          row.axisRevision !== event.axisRevision ||
          row.ordinal !== index ||
          row.attributeDefinitionId !== event.attributeDefinitionIds[index] ||
          row.definitionRevision !== event.attributeDefinitionRevisions?.[index] ||
          !Number.isSafeInteger(row.definitionRevision) ||
          (row.definitionRevision ?? 0) < 1,
      )));

/** Constructed only inside Core's already-scoped read or Action transaction. */
export const variantAxisPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantAxisPersistence => {
  const { tenantId } = scope;

  const readAxis = Effect.fn('VariantAxisPersistence.readAxis')(function* readAxis(
    row: typeof productVariantAxes.$inferSelect,
    productId: string,
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
    if (definition === undefined || invalidAxisDefinitionPointer(definition, row, tenantId)) {
      return yield* basisUnavailable();
    }
    const [pinned] = yield* transaction
      .select()
      .from(attributeDefinitionRevisions)
      .where(
        and(
          eq(attributeDefinitionRevisions.tenantId, tenantId),
          eq(attributeDefinitionRevisions.attributeDefinitionId, row.attributeDefinitionId),
          eq(attributeDefinitionRevisions.revision, row.definitionRevision ?? 0),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      pinned === undefined ||
      pinned.tenantId !== tenantId ||
      pinned.attributeDefinitionId !== row.attributeDefinitionId ||
      pinned.revision !== row.definitionRevision ||
      !new Set(pinned.applicableLevels).has('VARIANT')
    ) {
      return yield* basisUnavailable();
    }
    if (row.definitionRevision === definition.currentRevision) {
      const attributeReads = yield* effectiveAttributeValueReadsForScope(transaction, scope);
      const definitionProof = yield* attributeReads.readDefinitionCurrent({
        moduleId: catalogModuleId,
        resourceId: row.attributeDefinitionId,
        resourceType: 'commerce.catalog.attribute-definition',
        tenantId,
      });
      if (
        !definitionProof.complete ||
        definitionProof.tenantId !== tenantId ||
        definitionProof.attributeDefinitionId !== row.attributeDefinitionId ||
        definitionProof.revision !== definition.currentRevision
      ) {
        return yield* basisUnavailable();
      }
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
    const [applicability] = yield* transaction
      .select()
      .from(productAttributeApplicability)
      .where(
        and(
          eq(productAttributeApplicability.tenantId, tenantId),
          eq(productAttributeApplicability.productId, productId),
          eq(productAttributeApplicability.attributeDefinitionId, row.attributeDefinitionId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (invalidProductAxisApplicability(applicability, tenantId, productId, row.attributeDefinitionId)) {
      return yield* basisUnavailable();
    }
    // The preceding guard establishes the current declaration's presence.
    if (applicability === undefined) {
      return yield* basisUnavailable();
    }
    const [applicabilityRevision] = yield* transaction
      .select()
      .from(productAttributeApplicabilityRevisions)
      .where(
        and(
          eq(productAttributeApplicabilityRevisions.tenantId, tenantId),
          eq(productAttributeApplicabilityRevisions.productId, productId),
          eq(productAttributeApplicabilityRevisions.attributeDefinitionId, row.attributeDefinitionId),
          eq(productAttributeApplicabilityRevisions.revision, applicability.currentRevision),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (invalidProductAxisApplicabilityRevision(applicabilityRevision, applicability)) {
      return yield* basisUnavailable();
    }
    let inheritable = false;
    if (new Set(pinned.applicableLevels).has('PRODUCT')) {
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
      controlledValueKind: pinned.controlledValueKind,
      definitionRevision: pinned.revision,
      inheritable,
      multiplicity: pinned.multiplicity,
      ordinal: row.ordinal,
      valueKind: pinned.valueKind,
    } satisfies CurrentVariantAxis;
  });

  const readCurrent: VariantAxisPersistence['readCurrent'] = Effect.fn('VariantAxisPersistence.readCurrent')(
    function* readCurrent(productRef) {
      if (
        productRef.tenantId !== tenantId ||
        productRef.moduleId !== catalogModuleId ||
        productRef.resourceType !== productResourceType
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
        (row) => readAxis(row, productId, assignment?.productTypeId ?? '', productTypeRevision ?? 0),
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
        definitionRevision: axis.definitionRevision,
        items: [],
        source: 'MISSING',
        sourceRevision: null,
        sourceValueSetRef: null,
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
      definitionRevision: axis.definitionRevision,
      items,
      source: selected.variantId === null ? 'PRODUCT' : 'VARIANT',
      sourceRevision: selected.currentRevision,
      sourceValueSetRef: { attributeValueSetId: selected.attributeValueSetId, tenantId },
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
      productRef.resourceType !== productResourceType ||
      variantRef.resourceType !== 'commerce.catalog.variant' ||
      axes.productId !== productRef.resourceId ||
      axes.axisRevision < 1
    ) {
      return yield* basisUnavailable();
    }
    return yield* Effect.forEach(axes.axes, (axis) => readOneValue(productRef, variantRef, axis), { concurrency: 1 });
  });

  const govern: VariantAxisPersistence['govern'] = Effect.fn('VariantAxisPersistence.govern')(function* govern(input) {
    const conflict = writeConflict;
    if (invalidGovernInput(input, tenantId)) {
      return yield* conflict('INVALID_INPUT', 'Invalid Product or duplicate/invalid axis definitions');
    }
    const productId = input.productRef.resourceId;
    const [product] = yield* transaction
      .select({ lifecycleState: products.lifecycleState, productId: products.productId })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (product === undefined) {
      return yield* conflict('NOT_FOUND', 'Product not found in trusted Tenant');
    }
    if (product.lifecycleState === 'RETIRED') {
      return yield* conflict('INVALID_INPUT', 'Retired Product cannot change Variant axes');
    }
    const [latest] = yield* transaction
      .select()
      .from(productVariantAxisEvents)
      .where(and(eq(productVariantAxisEvents.tenantId, tenantId), eq(productVariantAxisEvents.productId, productId)))
      .orderBy(desc(productVariantAxisEvents.axisRevision))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    const currentRevision = latest?.axisRevision ?? 0;
    if (currentRevision !== input.expectedAxisRevision) {
      return yield* conflict('REVISION', 'Product Variant Axis revision changed');
    }
    const current = yield* transaction
      .select()
      .from(productVariantAxes)
      .where(and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.productId, productId)))
      .orderBy(asc(productVariantAxes.ordinal))
      .pipe(Effect.mapError(unavailable));
    if (malformedAxisSnapshot(latest, current, tenantId, productId)) {
      return yield* conflict('REVISION', 'Current axis snapshot is inconsistent');
    }
    const unchanged =
      current.length === input.axes.length &&
      current.every(
        (axis, index) =>
          axis.attributeDefinitionId === input.axes[index]?.attributeDefinitionId &&
          axis.definitionRevision === input.axes[index]?.definitionRevision,
      );
    if (unchanged && latest !== undefined) {
      return { axisRevision: currentRevision, changed: false };
    }
    // #438/#440/#479 do not yet supply revalidation of active combinations or
    // open selections. Never reinterpret an ACTIVE form by changing axes here.
    const variants = yield* transaction
      .select({ lifecycleState: productVariants.lifecycleState, variantId: productVariants.variantId })
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, productId)))
      .for('update')
      .pipe(Effect.mapError(unavailable));
    if (variants.some((variant) => variant.lifecycleState === 'ACTIVE')) {
      return yield* conflict('ACTIVE_SELECTION', 'Active Variant combinations require authoritative impact review');
    }
    const [assignment] = yield* transaction
      .select()
      .from(productTypeAssignments)
      .where(and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (input.axes.length > 0 && assignment === undefined) {
      return yield* conflict('TYPE_RULE', 'Product has no Product Type permitting Variant axes');
    }
    if (assignment !== undefined) {
      const [type] = yield* transaction
        .select({ currentRevision: productTypes.currentRevision })
        .from(productTypes)
        .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (type === undefined || !Number.isSafeInteger(type.currentRevision) || type.currentRevision < 1) {
        return yield* conflict('TYPE_RULE', 'Product Type revision cannot be verified');
      }
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
        return yield* conflict('TYPE_RULE', 'Product Type revision cannot be verified');
      }
      yield* Effect.forEach(
        input.axes,
        Effect.fn('VariantAxisPersistence.verifyAxis')(function* verifyAxis(
          axis: GovernVariantAxesInput['axes'][number],
        ) {
          const [definition] = yield* transaction
            .select({ currentRevision: attributeDefinitions.currentRevision })
            .from(attributeDefinitions)
            .where(
              and(
                eq(attributeDefinitions.tenantId, tenantId),
                eq(attributeDefinitions.attributeDefinitionId, axis.attributeDefinitionId),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
          if (definition?.currentRevision !== axis.definitionRevision) {
            return yield* conflict('DEFINITION', 'Axis must pin the current Attribute Definition revision');
          }
          const [revision] = yield* transaction
            .select({ applicableLevels: attributeDefinitionRevisions.applicableLevels })
            .from(attributeDefinitionRevisions)
            .where(
              and(
                eq(attributeDefinitionRevisions.tenantId, tenantId),
                eq(attributeDefinitionRevisions.attributeDefinitionId, axis.attributeDefinitionId),
                eq(attributeDefinitionRevisions.revision, axis.definitionRevision),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
          if (revision === undefined || !new Set(revision.applicableLevels).has('VARIANT')) {
            return yield* conflict('DEFINITION', 'Definition is not applicable to Variants');
          }
          const [rule] = yield* transaction
            .select({ attributeDefinitionId: productTypeRevisionAttributes.attributeDefinitionId })
            .from(productTypeRevisionAttributes)
            .where(
              and(
                eq(productTypeRevisionAttributes.tenantId, tenantId),
                eq(productTypeRevisionAttributes.productTypeId, assignment.productTypeId),
                eq(productTypeRevisionAttributes.revision, type.currentRevision),
                eq(productTypeRevisionAttributes.attributeDefinitionId, axis.attributeDefinitionId),
                eq(productTypeRevisionAttributes.level, 'VARIANT'),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
          if (rule === undefined) {
            return yield* conflict('TYPE_RULE', 'Definition is not permitted on Variants by Product Type');
          }
          const [applicability] = yield* transaction
            .select()
            .from(productAttributeApplicability)
            .where(
              and(
                eq(productAttributeApplicability.tenantId, tenantId),
                eq(productAttributeApplicability.productId, productId),
                eq(productAttributeApplicability.attributeDefinitionId, axis.attributeDefinitionId),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
          if (
            applicability?.variantLevel !== true ||
            !Number.isSafeInteger(applicability.currentRevision) ||
            applicability.currentRevision < 1
          ) {
            return yield* conflict(
              'TYPE_RULE',
              'Definition is not declared applicable to this Product at Variant level',
            );
          }
          const [applicabilityRevision] = yield* transaction
            .select({ variantLevel: productAttributeApplicabilityRevisions.variantLevel })
            .from(productAttributeApplicabilityRevisions)
            .where(
              and(
                eq(productAttributeApplicabilityRevisions.tenantId, tenantId),
                eq(productAttributeApplicabilityRevisions.productId, productId),
                eq(productAttributeApplicabilityRevisions.attributeDefinitionId, axis.attributeDefinitionId),
                eq(productAttributeApplicabilityRevisions.revision, applicability.currentRevision),
              ),
            )
            .limit(1)
            .pipe(Effect.mapError(unavailable));
          if (applicabilityRevision?.variantLevel !== true) {
            return yield* conflict('TYPE_RULE', 'Current Product applicability revision cannot be verified');
          }
          return null;
        }),
        { concurrency: 1 },
      );
    }
    const axisRevision = currentRevision + 1;
    yield* transaction
      .delete(productVariantAxes)
      .where(and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.productId, productId)))
      .pipe(Effect.mapError(unavailable));
    yield* transaction
      .insert(productVariantAxisEvents)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        attributeDefinitionIds: input.axes.map((axis) => axis.attributeDefinitionId),
        attributeDefinitionRevisions: input.axes.map((axis) => axis.definitionRevision),
        axisRevision,
        evidenceRefs: [],
        productId,
        reason: input.reason,
        tenantId,
      })
      .pipe(Effect.mapError(unavailable));
    if (input.axes.length > 0) {
      yield* transaction
        .insert(productVariantAxes)
        .values(
          input.axes.map((axis, ordinal) => ({
            attributeDefinitionId: axis.attributeDefinitionId,
            axisRevision,
            definitionRevision: axis.definitionRevision,
            ordinal,
            productId,
            tenantId,
          })),
        )
        .pipe(Effect.mapError(unavailable));
    }
    return { axisRevision, changed: true };
  });

  return { govern, readCurrent, readEffectiveValues };
};
