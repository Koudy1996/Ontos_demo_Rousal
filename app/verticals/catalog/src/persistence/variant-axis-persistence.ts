import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ProductRef } from '../../shared/resources/product.ts';
import {
  attributeDefinitions,
  controlledAttributeValues,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypes,
  productVariantAxes,
  productVariantAxisEvents,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class VariantAxisBasisUnavailable extends Schema.TaggedError<VariantAxisBasisUnavailable>()(
  'VariantAxisBasisUnavailable',
  { code: Schema.Literal('variant_axis_basis_unavailable'), reason: Schema.String },
) {}

export interface CurrentVariantAxis {
  readonly attributeDefinitionId: string;
  readonly allowedControlledValueIds: readonly string[];
  readonly controlledValueKind: string | null;
  readonly multiplicity: string;
  readonly ordinal: number;
  readonly valueKind: string;
}

export interface CurrentVariantAxes {
  readonly axisRevision: number;
  readonly axes: readonly CurrentVariantAxis[];
  readonly productId: string;
  readonly productTypeRevision: number | null;
}

export interface VariantAxisPersistence {
  readonly readCurrent: (
    productRef: ProductRef,
  ) => Effect.Effect<CurrentVariantAxes, CatalogPersistenceUnavailable | VariantAxisBasisUnavailable>;
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

/** Constructed only inside Core's already-scoped read or Action transaction. */
export const variantAxisPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantAxisPersistence => {
  const { tenantId } = scope;

  const readCurrent: VariantAxisPersistence['readCurrent'] = Effect.fn('VariantAxisPersistence.readCurrent')(
    function* readCurrent(productRef) {
      if (
        productRef.tenantId !== tenantId ||
        productRef.moduleId !== 'commerce.catalog' ||
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
      if (
        (event === undefined && rows.length !== 0) ||
        (event !== undefined &&
          (rows.length !== event.attributeDefinitionIds.length ||
            rows.some(
              (row, index) =>
                row.axisRevision !== event.axisRevision ||
                row.ordinal !== index ||
                row.attributeDefinitionId !== event.attributeDefinitionIds[index],
            )))
      ) {
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
        if (type === undefined) {
          return yield* basisUnavailable();
        }
        productTypeRevision = type.currentRevision;
      } else if (rows.length !== 0) {
        return yield* basisUnavailable();
      }

      const axes: CurrentVariantAxis[] = [];
      for (const row of rows) {
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
        if (definition === undefined || !definition.applicableLevels.includes('VARIANT') || assignment === undefined) {
          return yield* basisUnavailable();
        }
        const [rule] = yield* transaction
          .select({ attributeDefinitionId: productTypeRevisionAttributes.attributeDefinitionId })
          .from(productTypeRevisionAttributes)
          .where(
            and(
              eq(productTypeRevisionAttributes.tenantId, tenantId),
              eq(productTypeRevisionAttributes.productTypeId, assignment.productTypeId),
              eq(productTypeRevisionAttributes.revision, productTypeRevision ?? 0),
              eq(productTypeRevisionAttributes.attributeDefinitionId, row.attributeDefinitionId),
              eq(productTypeRevisionAttributes.level, 'VARIANT'),
            ),
          )
          .limit(1)
          .pipe(Effect.mapError(unavailable));
        if (rule === undefined) {
          return yield* basisUnavailable();
        }
        const controlled =
          definition.valueKind === 'CONTROLLED'
            ? yield* transaction
                .select({
                  id: controlledAttributeValues.controlledAttributeValueId,
                  kind: controlledAttributeValues.specialization,
                })
                .from(controlledAttributeValues)
                .where(
                  and(
                    eq(controlledAttributeValues.tenantId, tenantId),
                    eq(controlledAttributeValues.attributeDefinitionId, row.attributeDefinitionId),
                    eq(controlledAttributeValues.lifecycleState, 'ACTIVE'),
                  ),
                )
                .orderBy(asc(controlledAttributeValues.controlledAttributeValueId))
                .pipe(Effect.mapError(unavailable))
            : [];
        if (controlled.some((value) => value.kind !== definition.controlledValueKind)) {
          return yield* basisUnavailable();
        }
        axes.push({
          attributeDefinitionId: row.attributeDefinitionId,
          allowedControlledValueIds: controlled.map((value) => value.id),
          controlledValueKind: definition.controlledValueKind,
          multiplicity: definition.multiplicity,
          ordinal: row.ordinal,
          valueKind: definition.valueKind,
        });
      }
      return { axisRevision: event?.axisRevision ?? 0, axes, productId, productTypeRevision };
    },
  );

  return { readCurrent };
};
