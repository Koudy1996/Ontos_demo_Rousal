import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Match, Option, Schema } from 'effect';

import type { AttributeDefinition, AttributeValue } from '../../shared/domain/attribute-values.ts';
import { AttributeDefinitionSchema, AttributeValueSchema } from '../../shared/domain/attribute-values.ts';
import type {
  EffectiveAttributeValuesResult,
  AttributeValueSetSnapshot,
} from '../../shared/domain/effective-attribute-values.ts';
import { resolveEffectiveAttributeValues } from '../../shared/domain/effective-attribute-values.ts';
import {
  ProductTypeCurrentBasisSchema,
  ProductTypeCurrentRulesRevisionSchema,
} from '../../shared/domain/product-type-rules.ts';
import type { AttributeDefinitionRef } from '../../shared/resources/attribute-definition.ts';
import { AttributeDefinitionRefSchema } from '../../shared/resources/attribute-definition.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import { VariantRefSchema } from '../../shared/resources/variant.ts';
import {
  attributeDefinitions,
  attributeValueItems,
  attributeValueRevisions,
  attributeValueSets,
  controlledAttributeValues,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  productVariants,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export interface EffectiveAttributeValueReadInput {
  readonly attributeDefinitionRef: AttributeDefinitionRef;
  readonly productRef: ProductRef;
  readonly variantRef: VariantRef;
}

export interface EffectiveAttributeValueReads {
  readonly resolveVariant: (
    input: EffectiveAttributeValueReadInput,
  ) => Effect.Effect<EffectiveAttributeValuesResult, CatalogPersistenceUnavailable>;
}

const ref = (tenantId: string, resourceId: string, resourceType: string) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType,
  tenantId,
});
const invalid = (reason: string): EffectiveAttributeValuesResult => ({
  reasons: [reason],
  status: 'INVALID_AUTHORITY',
});
const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const error = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

type DefinitionRow = typeof attributeDefinitions.$inferSelect;
type ValueItemRow = typeof attributeValueItems.$inferSelect;
type ValueSetRow = typeof attributeValueSets.$inferSelect;

const decodeDefinition = (
  row: DefinitionRow,
  definitionRef: AttributeDefinitionRef,
): Option.Option<AttributeDefinition> => {
  const measurement =
    row.valueKind === 'MEASUREMENT'
      ? {
          canonicalUnit: row.canonicalUnit,
          decimalPlaces: row.decimalPlaces,
          maximum: row.maximumValue === null ? undefined : Number(row.maximumValue),
          minimum: row.minimumValue === null ? undefined : Number(row.minimumValue),
          quantity: row.measuredQuantity,
        }
      : undefined;
  const definition = {
    label: row.name,
    levels: row.applicableLevels,
    meaning: row.meaning,
    multiplicity: row.multiplicity,
    ref: definitionRef,
    specialStates: [
      ...(row.allowsUnknown === 1 ? ['UNKNOWN'] : []),
      ...(row.allowsNone === 1 ? ['NONE'] : []),
      ...(row.allowsNotApplicable === 1 ? ['NOT_APPLICABLE'] : []),
    ],
    valueKind: row.valueKind,
  };
  return Schema.decodeUnknownOption(AttributeDefinitionSchema)(
    measurement === undefined ? definition : { ...definition, measurement },
  );
};

const decodePlainItem = (item: ValueItemRow): Option.Option<AttributeValue> =>
  Match.value(item.valueKind).pipe(
    Match.when('TEXT', () => Schema.decodeUnknownOption(AttributeValueSchema)({ kind: 'TEXT', text: item.textValue })),
    Match.when('MEASUREMENT', () =>
      Schema.decodeUnknownOption(AttributeValueSchema)({
        amount: Number(item.numericValue),
        kind: 'MEASUREMENT',
        unit: item.unit,
      }),
    ),
    Match.when('SPECIAL', () =>
      Schema.decodeUnknownOption(AttributeValueSchema)({ kind: 'SPECIAL', state: item.specialState }),
    ),
    Match.orElse(() => Option.none()),
  );

const decodeItem = Effect.fn('EffectiveAttributeValueReads.decodeItem')(function* decodeItem(
  transaction: ScopedTransaction,
  tenantId: string,
  definitionId: string,
  controlledKind: string | null,
  item: ValueItemRow,
) {
  if (item.valueKind !== 'CONTROLLED') {
    return decodePlainItem(item);
  }
  if (item.controlledAttributeValueId === null) {
    return Option.none<AttributeValue>();
  }
  const [controlled] = yield* transaction
    .select()
    .from(controlledAttributeValues)
    .where(
      and(
        eq(controlledAttributeValues.tenantId, tenantId),
        eq(controlledAttributeValues.attributeDefinitionId, definitionId),
        eq(controlledAttributeValues.controlledAttributeValueId, item.controlledAttributeValueId),
      ),
    )
    .limit(1)
    .pipe(Effect.mapError(unavailable));
  if (controlled === undefined || controlled.specialization !== controlledKind) {
    return Option.none<AttributeValue>();
  }
  return Schema.decodeUnknownOption(AttributeValueSchema)({
    kind: 'CONTROLLED',
    valueRef: ref(tenantId, controlled.controlledAttributeValueId, 'commerce.catalog.controlled-attribute-value'),
  });
});

/** Private owner service; Core supplies the already scoped read transaction and authorizes its caller. */
export const effectiveAttributeValueReadsForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<EffectiveAttributeValueReads> =>
  Effect.succeed({
    resolveVariant: Effect.fn('EffectiveAttributeValueReads.resolveVariant')(function* resolveVariant(input) {
      const { tenantId } = scope;
      if (
        !Schema.is(ProductRefSchema)(input.productRef) ||
        !Schema.is(VariantRefSchema)(input.variantRef) ||
        !Schema.is(AttributeDefinitionRefSchema)(input.attributeDefinitionRef) ||
        input.productRef.tenantId !== tenantId ||
        input.variantRef.tenantId !== tenantId ||
        input.attributeDefinitionRef.tenantId !== tenantId
      ) {
        return invalid('Malformed or foreign Catalog reference');
      }
      const productId = input.productRef.resourceId;
      const variantId = input.variantRef.resourceId;
      const definitionId = input.attributeDefinitionRef.resourceId;
      const query = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.mapError(unavailable));
      const [[product], [variant], [definition]] = yield* Effect.all(
        [
          query(
            transaction
              .select()
              .from(products)
              .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
              .limit(1),
          ),
          query(
            transaction
              .select()
              .from(productVariants)
              .where(
                and(
                  eq(productVariants.tenantId, tenantId),
                  eq(productVariants.productId, productId),
                  eq(productVariants.variantId, variantId),
                ),
              )
              .limit(1),
          ),
          query(
            transaction
              .select()
              .from(attributeDefinitions)
              .where(
                and(
                  eq(attributeDefinitions.tenantId, tenantId),
                  eq(attributeDefinitions.attributeDefinitionId, definitionId),
                ),
              )
              .limit(1),
          ),
        ],
        { concurrency: 3 },
      );
      if (
        product === undefined ||
        variant === undefined ||
        definition === undefined ||
        product.lifecycleState === 'RETIRED' ||
        variant.lifecycleState === 'RETIRED'
      ) {
        return invalid('Product, Variant, or definition is missing or retired');
      }
      const [assignment] = yield* query(
        transaction
          .select()
          .from(productTypeAssignments)
          .where(and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productId)))
          .limit(1),
      );
      if (assignment === undefined) {
        return invalid('Current Product Type assignment is missing');
      }
      const [productType] = yield* query(
        transaction
          .select()
          .from(productTypes)
          .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
          .limit(1),
      );
      if (productType === undefined) {
        return invalid('Current Product Type is missing');
      }
      const [revision] = yield* query(
        transaction
          .select()
          .from(productTypeRevisions)
          .where(
            and(
              eq(productTypeRevisions.tenantId, tenantId),
              eq(productTypeRevisions.productTypeId, assignment.productTypeId),
              eq(productTypeRevisions.revision, productType.currentRevision),
            ),
          )
          .limit(1),
      );
      if (revision === undefined) {
        return invalid('Current Product Type revision is missing');
      }
      const rules = yield* query(
        transaction
          .select()
          .from(productTypeRevisionAttributes)
          .where(
            and(
              eq(productTypeRevisionAttributes.tenantId, tenantId),
              eq(productTypeRevisionAttributes.productTypeId, assignment.productTypeId),
              eq(productTypeRevisionAttributes.revision, productType.currentRevision),
              eq(productTypeRevisionAttributes.attributeDefinitionId, definitionId),
            ),
          ),
      );
      const decodedDefinition = decodeDefinition(definition, input.attributeDefinitionRef);
      if (Option.isNone(decodedDefinition)) {
        return invalid('Current Attribute Definition is malformed');
      }
      const typeRef = ref(tenantId, assignment.productTypeId, 'commerce.catalog.product-type');
      const effectiveFrom = revision.effectiveAt.toISOString();
      const basis = Schema.decodeUnknownOption(ProductTypeCurrentBasisSchema)({
        currentRevision: productType.currentRevision,
        effectiveFrom,
        evaluatedAt: DateTime.formatIso(yield* DateTime.now),
        productTypeRef: typeRef,
        revision: revision.revision,
        revisionId: revision.productTypeRevisionId,
      });
      const rulesRevision = Schema.decodeUnknownOption(ProductTypeCurrentRulesRevisionSchema)({
        effectiveFrom,
        productTypeRef: typeRef,
        revision: revision.revision,
        revisionId: revision.productTypeRevisionId,
        rules: rules.map((rule) => ({
          attributeDefinitionRef: input.attributeDefinitionRef,
          level: rule.level,
          required: rule.requirement === 'REQUIRED',
        })),
      });
      if (Option.isNone(basis) || Option.isNone(rulesRevision)) {
        return invalid('Current Product Type basis is malformed');
      }
      const sets = yield* query(
        transaction
          .select()
          .from(attributeValueSets)
          .where(
            and(
              eq(attributeValueSets.tenantId, tenantId),
              eq(attributeValueSets.productId, productId),
              eq(attributeValueSets.attributeDefinitionId, definitionId),
            ),
          ),
      );
      const loadSet = Effect.fn('EffectiveAttributeValueReads.loadSet')(function* loadSet(
        set: ValueSetRow | undefined,
      ) {
        if (set === undefined) {
          return { snapshot: null, valid: true };
        }
        const [records, items] = yield* Effect.all(
          [
            query(
              transaction
                .select()
                .from(attributeValueRevisions)
                .where(
                  and(
                    eq(attributeValueRevisions.tenantId, tenantId),
                    eq(attributeValueRevisions.attributeValueSetId, set.attributeValueSetId),
                    eq(attributeValueRevisions.revision, set.currentRevision),
                  ),
                )
                .limit(2),
            ),
            query(
              transaction
                .select()
                .from(attributeValueItems)
                .where(
                  and(
                    eq(attributeValueItems.tenantId, tenantId),
                    eq(attributeValueItems.attributeValueSetId, set.attributeValueSetId),
                  ),
                )
                .orderBy(attributeValueItems.ordinal),
            ),
          ],
          { concurrency: 2 },
        );
        if (
          records.length !== 1 ||
          records[0]?.tenantId !== tenantId ||
          records[0].attributeValueSetId !== set.attributeValueSetId ||
          records[0].revision !== set.currentRevision ||
          set.tenantId !== tenantId ||
          set.productId !== productId ||
          set.attributeDefinitionId !== definitionId ||
          (set.variantId !== null && set.variantId !== variantId) ||
          !Number.isInteger(set.currentRevision) ||
          set.currentRevision < 1 ||
          records[0].changeKind !== set.currentState ||
          items.some(
            (item, index) =>
              item.tenantId !== tenantId ||
              item.attributeValueSetId !== set.attributeValueSetId ||
              item.ordinal !== index ||
              item.attributeDefinitionId !== definitionId,
          )
        ) {
          return { snapshot: null, valid: false };
        }
        const decoded = yield* Effect.forEach(
          items,
          (item) => decodeItem(transaction, tenantId, definitionId, definition.controlledValueKind, item),
          { concurrency: 1 },
        );
        if (decoded.some(Option.isNone)) {
          return { snapshot: null, valid: false };
        }
        const values = Option.all(decoded);
        if (Option.isNone(values)) {
          return { snapshot: null, valid: false };
        }
        if (set.currentState !== 'SET' && set.currentState !== 'REMOVED') {
          return { snapshot: null, valid: false };
        }
        const snapshot: AttributeValueSetSnapshot = {
          revision: set.currentRevision,
          state: set.currentState,
          values: values.value,
        };
        return { snapshot, valid: true };
      });
      if (
        sets.some(
          (set) =>
            set.tenantId !== tenantId ||
            set.productId !== productId ||
            set.attributeDefinitionId !== definitionId ||
            (set.variantId !== null && set.variantId !== variantId),
        ) ||
        sets.filter((set) => set.variantId === null).length > 1 ||
        sets.filter((set) => set.variantId === variantId).length > 1
      ) {
        return invalid('Current attribute value sets are ambiguous or malformed');
      }
      const [productSet, variantSet] = yield* Effect.all(
        [loadSet(sets.find((set) => set.variantId === null)), loadSet(sets.find((set) => set.variantId === variantId))],
        { concurrency: 2 },
      );
      if (!productSet.valid || !variantSet.valid) {
        return invalid('Current attribute value snapshot is malformed');
      }
      return resolveEffectiveAttributeValues({
        basis: basis.value,
        definition: decodedDefinition.value,
        productRef: input.productRef,
        productSet: productSet.snapshot,
        rulesRevision: rulesRevision.value,
        variantProductRef: input.productRef,
        variantRef: input.variantRef,
        variantSet: variantSet.snapshot,
      });
    }),
  });
