import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';

import {
  ProductTypeCurrentBasisSchema,
  ProductTypeCurrentRulesRevisionSchema,
} from '../../shared/domain/product-type-rules.ts';
import type {
  ProductTypeCurrentBasis,
  ProductTypeCurrentRulesRevision,
} from '../../shared/domain/product-type-rules.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import type { ProductTypeRef } from '../../shared/resources/product-type.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import { evaluateCurrentProductTypeReadiness } from './product-type-readiness-evaluator.ts';
import type { ProductTypeReadinessEvaluation } from './product-type-readiness-evaluator.ts';
import {
  productVariantAxes,
  productVariants,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';
import { effectiveAttributeValueReadsForScope } from './effective-attribute-value-reads.ts';
import type {
  AttributeValueSetValidityBasis,
  EffectiveAttributeValueReads,
} from './effective-attribute-value-reads.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class ProductTypeReadinessSourceInvalid extends Schema.TaggedError<ProductTypeReadinessSourceInvalid>()(
  'ProductTypeReadinessSourceInvalid',
  { code: Schema.Literal('product_type_readiness_source_invalid'), reason: Schema.String },
) {}

export type ProductTypeReadinessSource =
  | { readonly productRef: ProductRef; readonly status: 'UNTYPED' }
  | {
      readonly assignmentRevision: number;
      readonly basis: ProductTypeCurrentBasis;
      readonly productRef: ProductRef;
      readonly rulesRevision: ProductTypeCurrentRulesRevision;
      readonly status: 'VERIFIED';
    };

const invalid = (reason: string) =>
  new ProductTypeReadinessSourceInvalid({ code: 'product_type_readiness_source_invalid', reason });
const malformedRulesReason = 'Current Product Type rules are malformed';
const catalogModuleId = 'commerce.catalog' as const;
const attributeDefinitionResourceType = 'commerce.catalog.attribute-definition' as const;

interface ProductTypeReadinessService {
  readonly evaluate: (
    productRef: ProductRef,
    evaluatedAt: DateTime.Utc,
  ) => Effect.Effect<ProductTypeReadinessEvaluation, ProductTypeReadinessSourceInvalid | CatalogPersistenceUnavailable>;
  readonly load: (
    productRef: ProductRef,
    evaluatedAt: DateTime.Utc,
  ) => Effect.Effect<ProductTypeReadinessSource, ProductTypeReadinessSourceInvalid | CatalogPersistenceUnavailable>;
}

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const validProductReference = (productRef: ProductRef, tenantId: string): boolean =>
  productRef.tenantId === tenantId &&
  productRef.moduleId === catalogModuleId &&
  productRef.resourceType === 'commerce.catalog.product';

const validAssignment = (
  assignment: typeof productTypeAssignments.$inferSelect,
  productRef: ProductRef,
  tenantId: string,
): boolean =>
  assignment.tenantId === tenantId &&
  assignment.productId === productRef.resourceId &&
  Number.isInteger(assignment.assignmentRevision) &&
  assignment.assignmentRevision >= 1;

const readVariantSnapshot = Effect.fn('ProductTypeReadinessSource.readVariantSnapshot')(function* readVariantSnapshot(
  reads: EffectiveAttributeValueReads,
  inventory: AttributeValueSetValidityBasis,
  source: ProductTypeReadinessSource,
  productRef: ProductRef,
  variantRef: VariantRef,
) {
  const directEntries = inventory.entries.filter((entry) => entry.variantId === variantRef.resourceId);
  const directIds: string[] = [];
  for (const entry of directEntries) {
    if (entry.currentState === 'SET') {
      directIds.push(entry.attributeDefinitionId);
    }
  }
  const effectiveValues =
    source.status === 'VERIFIED'
      ? yield* Effect.forEach(
          source.rulesRevision.rules.filter((rule) => rule.level === 'VARIANT'),
          (rule) =>
            reads
              .resolveVariant({
                attributeDefinitionRef: {
                  ...rule.attributeDefinitionRef,
                  resourceType: attributeDefinitionResourceType,
                },
                productRef,
                variantRef,
              })
              .pipe(
                Effect.map((result) => ({ attributeDefinitionId: rule.attributeDefinitionRef.resourceId, result })),
              ),
          { concurrency: 1 },
        )
      : [];
  return {
    currentAttributeDefinitionIds: directIds,
    currentValueSource: {
      complete: true as const,
      revisionTokens: directEntries.map((entry) => entry.sourceRevisionToken).toSorted(),
    },
    effectiveValues,
    variantRef,
  };
});

/** Private source for #424; this proves rules provenance, not attribute or overall Catalog readiness. */
export const productTypeReadinessSourceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): ProductTypeReadinessService => ({
  evaluate: Effect.fn('ProductTypeReadinessSource.evaluate')(function* evaluate(
    productRef: ProductRef,
    evaluatedAt: DateTime.Utc,
  ) {
    const [source, reads] = yield* Effect.all(
      [
        productTypeReadinessSourceForScope(transaction, scope).load(productRef, evaluatedAt),
        effectiveAttributeValueReadsForScope(transaction, scope),
      ],
      { concurrency: 2 },
    );
    const inventory = yield* reads.readProductTypeValidity([productRef.resourceId]);
    if (
      !inventory.complete ||
      inventory.tenantId !== scope.tenantId ||
      inventory.entries.some((entry) => entry.productId !== productRef.resourceId)
    ) {
      return { reason: 'Complete Current attribute value inventory is unavailable', status: 'INDETERMINATE' };
    }
    const variantRows = yield* transaction
      .select({
        lifecycleState: productVariants.lifecycleState,
        productId: productVariants.productId,
        tenantId: productVariants.tenantId,
        variantId: productVariants.variantId,
      })
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, scope.tenantId), eq(productVariants.productId, productRef.resourceId)))
      .for('share')
      .pipe(Effect.mapError(unavailable));
    if (variantRows.some((row) => row.tenantId !== scope.tenantId || row.productId !== productRef.resourceId)) {
      return { reason: 'Current Variant inventory is foreign', status: 'INDETERMINATE' };
    }
    const currentVariants = variantRows.filter((row) => row.lifecycleState !== 'RETIRED');
    const variantIds = new Set(currentVariants.map((row) => row.variantId));
    if (
      variantIds.size !== currentVariants.length ||
      inventory.entries.some((entry) => entry.variantId !== null && !variantIds.has(entry.variantId))
    ) {
      return { reason: 'Current Variant value inventory is incomplete or inconsistent', status: 'INDETERMINATE' };
    }
    const productEntries = inventory.entries.filter((entry) => entry.variantId === null);
    const requiredProductDefinitionIds = new Set<string>();
    if (source.status === 'VERIFIED') {
      for (const rule of source.rulesRevision.rules) {
        if (rule.level === 'PRODUCT' && rule.required) {
          requiredProductDefinitionIds.add(rule.attributeDefinitionRef.resourceId);
        }
      }
    }
    const productValues = [];
    for (const entry of productEntries) {
      if (entry.currentState === 'SET') {
        productValues.push({
          attributeDefinitionRef: {
            moduleId: catalogModuleId,
            resourceId: entry.attributeDefinitionId,
            resourceType: attributeDefinitionResourceType,
            tenantId: scope.tenantId,
          },
          valid:
            entry.valid &&
            (!requiredProductDefinitionIds.has(entry.attributeDefinitionId) || entry.confirmsRequiredFact),
        });
      }
    }
    const variantRefs = currentVariants.map((row) => ({
      moduleId: catalogModuleId,
      resourceId: row.variantId,
      resourceType: 'commerce.catalog.variant' as const,
      tenantId: scope.tenantId,
    }));
    const variants = yield* Effect.forEach(
      variantRefs,
      (variantRef) => readVariantSnapshot(reads, inventory, source, productRef, variantRef),
      { concurrency: 1 },
    );
    if (source.status === 'UNTYPED') {
      const axes = yield* transaction
        .select({ attributeDefinitionId: productVariantAxes.attributeDefinitionId })
        .from(productVariantAxes)
        .where(
          and(eq(productVariantAxes.tenantId, scope.tenantId), eq(productVariantAxes.productId, productRef.resourceId)),
        )
        .for('share')
        .pipe(Effect.mapError(unavailable));
      if (axes.length > 0) {
        return { reason: 'Untyped Product still has Variant Axes', status: 'INDETERMINATE' };
      }
    }
    return evaluateCurrentProductTypeReadiness({
      productValues,
      productValueSource: {
        complete: true,
        revisionTokens: productEntries.map((entry) => entry.sourceRevisionToken).toSorted(),
      },
      source,
      variantRefs,
      variants,
    });
  }),
  load: Effect.fn('ProductTypeReadinessSource.load')(function* load(productRef: ProductRef, evaluatedAt: DateTime.Utc) {
    const { tenantId } = scope;
    if (!validProductReference(productRef, tenantId) || !DateTime.isDateTime(evaluatedAt)) {
      return yield* invalid('Invalid Product or evaluation instant');
    }
    const [product] = yield* transaction
      .select({ productId: products.productId })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, productRef.resourceId)))
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (product === undefined) {
      return yield* invalid('Product not found in Tenant');
    }
    const [assignment] = yield* transaction
      .select()
      .from(productTypeAssignments)
      .where(
        and(eq(productTypeAssignments.tenantId, tenantId), eq(productTypeAssignments.productId, productRef.resourceId)),
      )
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (assignment === undefined) {
      return { productRef, status: 'UNTYPED' } as const;
    }
    if (!validAssignment(assignment, productRef, tenantId)) {
      return yield* invalid('Product Type assignment is malformed');
    }
    const [type] = yield* transaction
      .select()
      .from(productTypes)
      .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (type === undefined || type.tenantId !== tenantId || type.productTypeId !== assignment.productTypeId) {
      return yield* invalid('Assigned Product Type is missing');
    }
    const [revision] = yield* transaction
      .select()
      .from(productTypeRevisions)
      .where(
        and(
          eq(productTypeRevisions.tenantId, tenantId),
          eq(productTypeRevisions.productTypeId, type.productTypeId),
          eq(productTypeRevisions.revision, type.currentRevision),
        ),
      )
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      revision === undefined ||
      revision.tenantId !== tenantId ||
      revision.productTypeId !== type.productTypeId ||
      revision.revision !== type.currentRevision
    ) {
      return yield* invalid('Current Product Type revision is missing');
    }
    const rules = yield* transaction
      .select()
      .from(productTypeRevisionAttributes)
      .where(
        and(
          eq(productTypeRevisionAttributes.tenantId, tenantId),
          eq(productTypeRevisionAttributes.productTypeId, type.productTypeId),
          eq(productTypeRevisionAttributes.revision, type.currentRevision),
        ),
      )
      .pipe(Effect.mapError(unavailable));
    if (
      rules.some(
        (rule) =>
          rule.tenantId !== tenantId ||
          rule.productTypeId !== type.productTypeId ||
          rule.revision !== type.currentRevision,
      )
    ) {
      return yield* invalid(malformedRulesReason);
    }
    const productTypeRef: ProductTypeRef = {
      moduleId: catalogModuleId,
      resourceId: type.productTypeId,
      resourceType: 'commerce.catalog.product-type' as const,
      tenantId,
    };
    const decodedRules = Schema.decodeUnknownOption(ProductTypeCurrentRulesRevisionSchema)({
      effectiveFrom: DateTime.formatIso(DateTime.fromDateUnsafe(revision.effectiveAt)),
      productTypeRef,
      revision: revision.revision,
      revisionId: revision.productTypeRevisionId,
      rules: rules.map((rule) => ({
        attributeDefinitionRef: {
          moduleId: catalogModuleId,
          resourceId: rule.attributeDefinitionId,
          resourceType: 'commerce.catalog.attribute-definition',
          tenantId,
        },
        level: rule.level,
        required: rule.requirement === 'REQUIRED',
      })),
    });
    if (Option.isNone(decodedRules)) {
      return yield* invalid(malformedRulesReason);
    }
    const rulesRevision = decodedRules.value;
    const decodedBasis = Schema.decodeOption(ProductTypeCurrentBasisSchema)({
      currentRevision: type.currentRevision,
      effectiveFrom: rulesRevision.effectiveFrom,
      evaluatedAt: DateTime.formatIso(evaluatedAt),
      productTypeRef,
      revision: rulesRevision.revision,
      revisionId: rulesRevision.revisionId,
    });
    if (Option.isNone(decodedBasis)) {
      return yield* invalid('Current Product Type basis is malformed');
    }
    if (DateTime.toEpochMillis(evaluatedAt) < DateTime.toEpochMillis(DateTime.fromDateUnsafe(revision.effectiveAt))) {
      return yield* invalid('Product Type revision is not yet effective');
    }
    return {
      assignmentRevision: assignment.assignmentRevision,
      basis: decodedBasis.value,
      productRef,
      rulesRevision,
      status: 'VERIFIED',
    } as const;
  }),
});
