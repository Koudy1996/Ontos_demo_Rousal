import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';

import type { AttributeValue } from '../../shared/domain/attribute-values.ts';
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
  status: 'INVALID_AUTHORITY',
  reasons: [reason],
});
const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const error = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

/** Private owner service; Core supplies the already scoped read transaction and authorizes its caller. */
export const effectiveAttributeValueReadsForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<EffectiveAttributeValueReads> =>
  Effect.succeed({
    resolveVariant: (input) =>
      Effect.gen(function* () {
        const tenantId = scope.tenantId;
        if (
          !Schema.is(ProductRefSchema)(input.productRef) ||
          !Schema.is(VariantRefSchema)(input.variantRef) ||
          !Schema.is(AttributeDefinitionRefSchema)(input.attributeDefinitionRef) ||
          input.productRef.tenantId !== tenantId ||
          input.variantRef.tenantId !== tenantId ||
          input.attributeDefinitionRef.tenantId !== tenantId
        )
          return invalid('Malformed or foreign Catalog reference');
        const productId = input.productRef.resourceId;
        const variantId = input.variantRef.resourceId;
        const definitionId = input.attributeDefinitionRef.resourceId;
        const query = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.mapError(unavailable));
        const [product] = yield* query(
          transaction
            .select()
            .from(products)
            .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
            .limit(1),
        );
        const [variant] = yield* query(
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
        );
        const [definition] = yield* query(
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
        );
        if (
          product === undefined ||
          variant === undefined ||
          definition === undefined ||
          product.lifecycleState === 'RETIRED' ||
          variant.lifecycleState === 'RETIRED'
        )
          return invalid('Product, Variant, or definition is missing or retired');
        const [assignment] = yield* query(
          transaction
            .select()
            .from(productTypeAssignments)
            .where(and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productId)))
            .limit(1),
        );
        if (assignment === undefined) return invalid('Current Product Type assignment is missing');
        const [productType] = yield* query(
          transaction
            .select()
            .from(productTypes)
            .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
            .limit(1),
        );
        if (productType === undefined) return invalid('Current Product Type is missing');
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
        if (revision === undefined) return invalid('Current Product Type revision is missing');
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
        const domainDefinition = {
          ref: input.attributeDefinitionRef,
          label: definition.name,
          meaning: definition.meaning,
          levels: definition.applicableLevels,
          multiplicity: definition.multiplicity,
          valueKind: definition.valueKind,
          specialStates: [
            ...(definition.allowsUnknown === 1 ? ['UNKNOWN'] : []),
            ...(definition.allowsNone === 1 ? ['NONE'] : []),
            ...(definition.allowsNotApplicable === 1 ? ['NOT_APPLICABLE'] : []),
          ],
          ...(definition.valueKind === 'MEASUREMENT'
            ? {
                measurement: {
                  quantity: definition.measuredQuantity,
                  canonicalUnit: definition.canonicalUnit,
                  decimalPlaces: definition.decimalPlaces,
                  ...(definition.minimumValue === null ? {} : { minimum: Number(definition.minimumValue) }),
                  ...(definition.maximumValue === null ? {} : { maximum: Number(definition.maximumValue) }),
                },
              }
            : {}),
        };
        const decodedDefinition = Schema.decodeUnknownOption(AttributeDefinitionSchema)(domainDefinition);
        if (Option.isNone(decodedDefinition)) return invalid('Current Attribute Definition is malformed');
        const typeRef = ref(tenantId, assignment.productTypeId, 'commerce.catalog.product-type');
      const effectiveFrom = revision.effectiveAt.toISOString();
        const basis = Schema.decodeUnknownOption(ProductTypeCurrentBasisSchema)({
          productTypeRef: typeRef,
          revision: revision.revision,
          currentRevision: productType.currentRevision,
          revisionId: revision.productTypeRevisionId,
          effectiveFrom,
        evaluatedAt: new Date().toISOString(),
        });
        const rulesRevision = Schema.decodeUnknownOption(ProductTypeCurrentRulesRevisionSchema)({
          productTypeRef: typeRef,
          revision: revision.revision,
          revisionId: revision.productTypeRevisionId,
          effectiveFrom,
          rules: rules.map((rule) => ({
            attributeDefinitionRef: input.attributeDefinitionRef,
            level: rule.level,
            required: rule.requirement === 'REQUIRED',
          })),
        });
        if (Option.isNone(basis) || Option.isNone(rulesRevision))
          return invalid('Current Product Type basis is malformed');
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
        const loadSet = Effect.fn('EffectiveAttributeValueReads.loadSet')(function* (
          set: (typeof sets)[number] | undefined,
        ) {
          if (set === undefined) return { valid: true as const, snapshot: null };
          const [record] = yield* query(
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
              .limit(1),
          );
          const items = yield* query(
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
          );
          if (
            record === undefined ||
            record.changeKind !== set.currentState ||
            items.some((item, index) => item.ordinal !== index || item.attributeDefinitionId !== definitionId)
          )
            return { valid: false as const, snapshot: null };
          const values: AttributeValue[] = [];
          for (const item of items) {
            let candidate: unknown;
            switch (item.valueKind) {
              case 'TEXT':
                candidate = { kind: 'TEXT', text: item.textValue };
                break;
              case 'MEASUREMENT':
                candidate = { kind: 'MEASUREMENT', amount: Number(item.numericValue), unit: item.unit };
                break;
              case 'SPECIAL':
                candidate = { kind: 'SPECIAL', state: item.specialState };
                break;
              case 'CONTROLLED': {
                if (item.controlledAttributeValueId === null) return { valid: false as const, snapshot: null };
                const [controlled] = yield* query(
                  transaction
                    .select()
                    .from(controlledAttributeValues)
                    .where(
                      and(
                        eq(controlledAttributeValues.tenantId, tenantId),
                        eq(controlledAttributeValues.attributeDefinitionId, definitionId),
                        eq(controlledAttributeValues.controlledAttributeValueId, item.controlledAttributeValueId),
                      ),
                    )
                    .limit(1),
                );
                if (controlled === undefined || controlled.specialization !== definition.controlledValueKind)
                  return { valid: false as const, snapshot: null };
                candidate = {
                  kind: 'CONTROLLED',
                  valueRef: ref(
                    tenantId,
                    controlled.controlledAttributeValueId,
                    'commerce.catalog.controlled-attribute-value',
                  ),
                };
                break;
              }
              default:
                return { valid: false as const, snapshot: null };
            }
            const decoded = Schema.decodeUnknownOption(AttributeValueSchema)(candidate);
            if (Option.isNone(decoded)) return { valid: false as const, snapshot: null };
            values.push(decoded.value);
          }
          const snapshot: AttributeValueSetSnapshot = {
            state: set.currentState as 'SET' | 'REMOVED',
            revision: set.currentRevision,
            values,
          };
          return { valid: true as const, snapshot };
        });
        const productSet = yield* loadSet(sets.find((set) => set.variantId === null));
        const variantSet = yield* loadSet(sets.find((set) => set.variantId === variantId));
        if (!productSet.valid || !variantSet.valid) return invalid('Current attribute value snapshot is malformed');
        return resolveEffectiveAttributeValues({
          basis: basis.value,
          definition: decodedDefinition.value,
          productRef: input.productRef,
          variantProductRef: input.productRef,
          productSet: productSet.snapshot,
          rulesRevision: rulesRevision.value,
          variantRef: input.variantRef,
          variantSet: variantSet.snapshot,
        });
      }),
  });
