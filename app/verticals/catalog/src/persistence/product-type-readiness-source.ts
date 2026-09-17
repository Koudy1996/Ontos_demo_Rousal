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
import {
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  products,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

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

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

/** Private source for #424; this proves rules provenance, not attribute or overall Catalog readiness. */
export const productTypeReadinessSourceForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  load: Effect.fn('ProductTypeReadinessSource.load')(function* load(productRef: ProductRef, evaluatedAt: DateTime.Utc) {
    const { tenantId } = scope;
    if (productRef.tenantId !== tenantId || !DateTime.isDateTime(evaluatedAt)) {
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
    const [type] = yield* transaction
      .select()
      .from(productTypes)
      .where(and(eq(productTypes.tenantId, tenantId), eq(productTypes.productTypeId, assignment.productTypeId)))
      .for('share')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (type === undefined) {
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
    if (revision === undefined) {
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
    const productTypeRef = {
      moduleId: 'commerce.catalog' as const,
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
          moduleId: 'commerce.catalog',
          resourceId: rule.attributeDefinitionId,
          resourceType: 'commerce.catalog.attribute-definition',
          tenantId,
        },
        level: rule.level,
        required: rule.requirement === 'REQUIRED',
      })),
    });
    if (Option.isNone(decodedRules)) {
      return yield* invalid('Current Product Type rules are malformed');
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
