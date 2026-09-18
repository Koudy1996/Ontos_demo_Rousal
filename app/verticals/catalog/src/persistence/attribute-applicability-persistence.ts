import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { findPostgresFailure } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';

import type { AttributeDefinitionRef } from '../../shared/resources/attribute-definition.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import {
  attributeDefinitions,
  attributeValueSets,
  productAttributeApplicability,
  productAttributeApplicabilityRevisions,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypes,
  productVariantAxes,
  productVariants,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class AttributeApplicabilityConflict extends Schema.TaggedError<AttributeApplicabilityConflict>()(
  'AttributeApplicabilityConflict',
  {
    code: Schema.Literal('attribute_applicability_conflict'),
    conflict: Schema.Literals([
      'INVALID_INPUT',
      'NOT_FOUND',
      'REVISION',
      'INAPPLICABLE',
      'REQUIRED',
      'VALUE_IMPACT',
      'IDENTITY_IMPACT',
      'SELECTION_IMPACT',
      'ACTION_INVOCATION_ID',
    ]),
    reason: Schema.String,
  },
) {}

const conflict = (kind: AttributeApplicabilityConflict['conflict'], reason: string) =>
  new AttributeApplicabilityConflict({ code: 'attribute_applicability_conflict', conflict: kind, reason });
const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const error = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

export const mapAttributeApplicabilityWriteError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Core's PostgreSQL classifier reads an opaque driver cause; only typed failures escape. expires: 2027-03-31.
  error: unknown,
) => {
  const unique = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      // oxlint-disable-next-line effect-native/no-driver-failure-inspection -- Match the exact owner constraint after Core's sanitized classifier. expires: 2027-03-31.
      code === '23505' && constraint === 'catalog_product_attribute_applicability_revisions_invocation_uk',
  );
  return Option.isSome(unique)
    ? conflict('ACTION_INVOCATION_ID', 'Action invocation already recorded')
    : unavailable(error);
};

export interface ChangeAttributeApplicabilityInput {
  readonly actionInvocationId: string;
  readonly attributeDefinitionRef: AttributeDefinitionRef;
  readonly evidenceRefs?: readonly string[];
  readonly expectedRevision: number | null;
  readonly principalId: string;
  readonly productLevel: boolean;
  readonly productRef: ProductRef;
  readonly reason: string;
  readonly variantLevel: boolean;
}

export interface AttributeApplicabilityPersistence {
  readonly change: (
    input: ChangeAttributeApplicabilityInput,
  ) => Effect.Effect<
    { readonly productLevel: boolean; readonly revision: number; readonly variantLevel: boolean },
    AttributeApplicabilityConflict | CatalogPersistenceUnavailable
  >;
}

const validRef = (ref: ProductRef | AttributeDefinitionRef, tenantId: string, resourceType: string) =>
  ref.moduleId === 'commerce.catalog' && ref.resourceType === resourceType && ref.tenantId === tenantId;

/** Product-local applicability changes never manufacture, merge, or delete value rows. */
export const attributeApplicabilityPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<AttributeApplicabilityPersistence> =>
  Effect.succeed({
    // oxlint-disable-next-line eslint/complexity -- Transactional guard chain preserves each typed business conflict and fails closed. expires: 2027-03-31.
    change: Effect.fn('AttributeApplicabilityPersistence.change')(function* change(input) {
      const { tenantId } = scope;
      if (
        !validRef(input.productRef, tenantId, 'commerce.catalog.product') ||
        !validRef(input.attributeDefinitionRef, tenantId, 'commerce.catalog.attribute-definition') ||
        (!input.productLevel && !input.variantLevel && input.expectedRevision === null) ||
        (input.expectedRevision !== null &&
          (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)) ||
        input.reason !== input.reason.trim() ||
        input.reason.length < 1 ||
        input.reason.length > 1000 ||
        (input.evidenceRefs ?? []).some((ref) => ref.length === 0 || ref !== ref.trim())
      ) {
        return yield* conflict('INVALID_INPUT', 'Malformed or cross-Tenant applicability change');
      }
      const productId = input.productRef.resourceId;
      const attributeDefinitionId = input.attributeDefinitionRef.resourceId;
      const [product] = yield* transaction
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (product === undefined || product.lifecycleState === 'RETIRED') {
        return yield* conflict('NOT_FOUND', 'Current Product not found');
      }
      const [definition] = yield* transaction
        .select()
        .from(attributeDefinitions)
        .where(
          and(
            eq(attributeDefinitions.tenantId, tenantId),
            eq(attributeDefinitions.attributeDefinitionId, attributeDefinitionId),
          ),
        )
        .for('share')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (definition === undefined) {
        return yield* conflict('NOT_FOUND', 'Attribute Definition not found');
      }
      if (
        (input.productLevel && !definition.applicableLevels.includes('PRODUCT')) ||
        (input.variantLevel && !definition.applicableLevels.includes('VARIANT'))
      ) {
        return yield* conflict('INAPPLICABLE', 'Definition does not permit requested level');
      }
      const [assignment] = yield* transaction
        .select()
        .from(productTypeAssignments)
        .where(and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productId)))
        .for('share')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (assignment === undefined) {
        return yield* conflict('INAPPLICABLE', 'Product Type assignment is required');
      }
      const [productType] = yield* transaction
        .select()
        .from(productTypes)
        .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
        .for('share')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (productType === undefined) {
        return yield* conflict('INAPPLICABLE', 'Product Type basis is missing');
      }
      const rules = yield* transaction
        .select()
        .from(productTypeRevisionAttributes)
        .where(
          and(
            eq(productTypeRevisionAttributes.tenantId, tenantId),
            eq(productTypeRevisionAttributes.productTypeId, assignment.productTypeId),
            eq(productTypeRevisionAttributes.revision, productType.currentRevision),
            eq(productTypeRevisionAttributes.attributeDefinitionId, attributeDefinitionId),
          ),
        )
        .pipe(Effect.mapError(unavailable));
      const productRule = rules.find((rule) => rule.level === 'PRODUCT');
      const variantRule = rules.find((rule) => rule.level === 'VARIANT');
      if ((input.productLevel && productRule === undefined) || (input.variantLevel && variantRule === undefined)) {
        return yield* conflict('INAPPLICABLE', 'Attribute is not allowed at requested Current Product Type level');
      }
      if (
        (!input.productLevel && productRule?.requirement === 'REQUIRED') ||
        (!input.variantLevel && variantRule?.requirement === 'REQUIRED')
      ) {
        return yield* conflict('REQUIRED', 'Required Product Type minimum cannot be removed locally');
      }
      const [current] = yield* transaction
        .select()
        .from(productAttributeApplicability)
        .where(
          and(
            eq(productAttributeApplicability.tenantId, tenantId),
            eq(productAttributeApplicability.productId, productId),
            eq(productAttributeApplicability.attributeDefinitionId, attributeDefinitionId),
          ),
        )
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (
        current?.currentRevision !== input.expectedRevision &&
        !(current === undefined && input.expectedRevision === null)
      ) {
        return yield* conflict('REVISION', 'Applicability revision changed');
      }
      if (current?.productLevel === input.productLevel && current.variantLevel === input.variantLevel) {
        return yield* conflict('INVALID_INPUT', 'Applicability is unchanged');
      }
      // DRAFT is not a valid exact-selection basis. The locked Product row also
      // serializes owner writes that could introduce values, axes, or variants.
      // Used Products remain blocked until #479 supplies impact/repair authority.
      if (product.lifecycleState !== 'DRAFT') {
        return yield* conflict('SELECTION_IMPACT', 'Governed selection-impact basis is required');
      }
      const [value] = yield* transaction
        .select()
        .from(attributeValueSets)
        .where(and(eq(attributeValueSets.tenantId, tenantId), eq(attributeValueSets.productId, productId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (value !== undefined) {
        return yield* conflict('VALUE_IMPACT', 'Existing values require explicit repair');
      }
      const [axis] = yield* transaction
        .select()
        .from(productVariantAxes)
        .where(and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.productId, productId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (axis !== undefined) {
        return yield* conflict('IDENTITY_IMPACT', 'Variant Axis requires identity revalidation');
      }
      const [variant] = yield* transaction
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, productId)))
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (variant !== undefined) {
        return yield* conflict('IDENTITY_IMPACT', 'Existing Variant requires impact revalidation');
      }
      const revision = (current?.currentRevision ?? 0) + 1;
      const write =
        current === undefined
          ? transaction.insert(productAttributeApplicability).values({
              attributeDefinitionId,
              currentRevision: revision,
              productId,
              productLevel: input.productLevel,
              tenantId,
              variantLevel: input.variantLevel,
            })
          : transaction
              .update(productAttributeApplicability)
              .set({
                currentRevision: revision,
                productLevel: input.productLevel,
                variantLevel: input.variantLevel,
              })
              .where(
                and(
                  eq(productAttributeApplicability.tenantId, tenantId),
                  eq(productAttributeApplicability.productId, productId),
                  eq(productAttributeApplicability.attributeDefinitionId, attributeDefinitionId),
                  eq(productAttributeApplicability.currentRevision, current.currentRevision),
                ),
              );
      yield* write.pipe(Effect.mapError(mapAttributeApplicabilityWriteError));
      yield* transaction
        .insert(productAttributeApplicabilityRevisions)
        .values({
          actingPrincipalId: input.principalId,
          actionInvocationId: input.actionInvocationId,
          attributeDefinitionId,
          evidenceRefs: [...(input.evidenceRefs ?? [])],
          productId,
          productLevel: input.productLevel,
          reason: input.reason,
          revision,
          tenantId,
          variantLevel: input.variantLevel,
        })
        .pipe(Effect.mapError(mapAttributeApplicabilityWriteError));
      return { productLevel: input.productLevel, revision, variantLevel: input.variantLevel };
    }),
  });
