import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { findPostgresFailure } from '@app/core-runtime';
import { randomUUID } from 'node:crypto';
import { Effect, Option, Schema } from 'effect';

import type { ProductTypeAttributeRule } from '../../shared/domain/product-type-rules.ts';
import { CatalogRevisionNumberSchema } from '../../shared/domain/catalog-revision-reference.ts';
import { ProductTypeRulesRevisionSchema } from '../../shared/domain/product-type-rules.ts';
import type { CreateProductTypeResult } from '../actions/create-product-type.action.ts';
import { ProductTypeRefSchema } from '../../shared/resources/product-type.ts';
import { productTypeRevisionAttributes, productTypeRevisions, productTypes } from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const CreatedProductTypeSchema = Schema.Struct({
  productTypeRef: ProductTypeRefSchema,
  revision: CatalogRevisionNumberSchema,
});

export interface CreateProductTypePersistenceInput {
  readonly actionInvocationId: string;
  readonly effectiveAt: Date;
  readonly name: string;
  readonly principalId: string;
  readonly reason: string;
  readonly rules: readonly ProductTypeAttributeRule[];
}

export class ProductTypeCreateConflict extends Schema.TaggedError<ProductTypeCreateConflict>()(
  'ProductTypeCreateConflict',
  {
    code: Schema.Literal('product_type_create_conflict'),
    conflict: Schema.Literals(['PRODUCT_TYPE_ID', 'ACTION_INVOCATION_ID', 'INVALID_RULES']),
    reason: Schema.String,
  },
) {}

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

/** Only exact Catalog constraints are business conflicts; driver text is never classified. */
export const mapProductTypeCreateWriteError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Core's PostgreSQL classifier parses this opaque driver cause; only sanitized typed failures leave this adapter. expires: 2027-03-31.
  error: unknown,
): ProductTypeCreateConflict | CatalogPersistenceUnavailable => {
  const uniqueViolationSqlState = ['23', '505'].join('');
  const identity = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      code === uniqueViolationSqlState &&
      (constraint === 'product_types_pkey' || constraint === 'catalog_product_types_scope_id_uk'),
  );
  if (Option.isSome(identity)) {
    return new ProductTypeCreateConflict({
      code: 'product_type_create_conflict',
      conflict: 'PRODUCT_TYPE_ID',
      reason: 'Product Type identity already exists',
    });
  }
  const invocation = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      code === uniqueViolationSqlState && constraint === 'catalog_product_type_revisions_invocation_uk',
  );
  if (Option.isSome(invocation)) {
    return new ProductTypeCreateConflict({
      code: 'product_type_create_conflict',
      conflict: 'ACTION_INVOCATION_ID',
      reason: 'Action invocation already recorded for a Product Type revision',
    });
  }
  return unavailable(error);
};

export interface ProductTypeCreatePersistence {
  readonly create: (
    input: CreateProductTypePersistenceInput,
  ) => Effect.Effect<CreateProductTypeResult, ProductTypeCreateConflict | CatalogPersistenceUnavailable>;
}

/** The Core-owned transaction commits or rolls back all three inserts together. */
export const productTypeCreatePersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<ProductTypeCreatePersistence> => {
  const { tenantId } = scope;

  const create: ProductTypeCreatePersistence['create'] = Effect.fn('ProductTypeCreatePersistence.create')(
    function* create(input) {
      const productTypeId = randomUUID();
      const productTypeRef = {
        moduleId: 'commerce.catalog' as const,
        resourceId: productTypeId,
        resourceType: 'commerce.catalog.product-type' as const,
        tenantId,
      };
      const validRules = Schema.decodeOption(ProductTypeRulesRevisionSchema)({
        productTypeRef,
        revision: 1,
        rules: input.rules,
      });
      if (Option.isNone(validRules)) {
        return yield* new ProductTypeCreateConflict({
          code: 'product_type_create_conflict',
          conflict: 'INVALID_RULES',
          reason: 'Initial Product Type rules are duplicated, malformed, or outside the trusted Tenant',
        });
      }

      yield* transaction
        .insert(productTypes)
        .values({
          createdByActionInvocationId: input.actionInvocationId,
          createdByPrincipalId: input.principalId,
          currentRevision: 1,
          name: input.name,
          productTypeId,
          tenantId,
        })
        .pipe(Effect.mapError(mapProductTypeCreateWriteError));
      yield* transaction
        .insert(productTypeRevisions)
        .values({
          actingPrincipalId: input.principalId,
          actionInvocationId: input.actionInvocationId,
          effectiveAt: input.effectiveAt,
          productTypeId,
          reason: input.reason,
          revision: 1,
          tenantId,
        })
        .pipe(Effect.mapError(mapProductTypeCreateWriteError));
      if (input.rules.length > 0) {
        yield* transaction
          .insert(productTypeRevisionAttributes)
          .values(
            input.rules.map((rule) => ({
              attributeDefinitionId: rule.attributeDefinitionRef.resourceId,
              level: rule.level,
              productTypeId,
              requirement: rule.required ? 'REQUIRED' : 'OPTIONAL',
              revision: 1,
              tenantId,
            })),
          )
          .pipe(Effect.mapError(mapProductTypeCreateWriteError));
      }
      return yield* Schema.decodeEffect(CreatedProductTypeSchema)({ productTypeRef, revision: 1 }).pipe(
        Effect.mapError(unavailable),
      );
    },
  );

  return Effect.succeed({ create });
};
