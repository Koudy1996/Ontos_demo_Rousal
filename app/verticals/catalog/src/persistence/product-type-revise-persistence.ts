import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { and, eq } from 'drizzle-orm';

import { productTypes } from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export interface ReviseProductTypePersistenceInput {
  readonly expectedCurrentRevision: number;
  readonly impactBasisToken: string;
  readonly productTypeId: string;
}

export const ReviseProductTypePersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Finite }),
]);
export type ReviseProductTypePersistenceOutcome = typeof ReviseProductTypePersistenceOutcomeSchema.Type;

/** A preview token has no authority until Catalog can verify its complete source population. */
export class ProductTypeImpactBasisUnavailable extends Schema.TaggedError<ProductTypeImpactBasisUnavailable>()(
  'ProductTypeImpactBasisUnavailable',
  {
    code: Schema.Literal('product_type_impact_basis_unavailable'),
    reason: Schema.String,
  },
) {}

/**
 * Bound only to Core's tenant-scoped transaction. It locks and checks the Type,
 * but cannot insert a revision while Attribute Values and Variant Axes lack an
 * authoritative population/evidence reader (#402/#403). The caller's token is
 * never treated as proof by itself.
 */
export const productTypeRevisePersistenceForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  revise: Effect.fn('ProductTypeRevisePersistence.revise')(function* revise(input: ReviseProductTypePersistenceInput) {
    const [row] = yield* transaction
      .select({ currentRevision: productTypes.currentRevision })
      .from(productTypes)
      .where(and(eq(productTypes.tenantId, scope.tenantId), eq(productTypes.productTypeId, input.productTypeId)))
      .for('update')
      .limit(1)
      .pipe(
        Effect.mapError((error) => {
          const failure = new CatalogPersistenceUnavailable({
            code: 'catalog_persistence_unavailable',
            reason: 'Catalog persistence is temporarily unavailable',
          });
          Object.defineProperty(failure, 'cause', { configurable: true, value: error });
          return failure;
        }),
      );
    if (row === undefined) {
      return { _tag: 'not_found' };
    }
    if (row.currentRevision !== input.expectedCurrentRevision) {
      return { _tag: 'revision_conflict', actualRevision: row.currentRevision };
    }
    return yield* new ProductTypeImpactBasisUnavailable({
      code: 'product_type_impact_basis_unavailable',
      reason: 'Catalog cannot yet verify the complete Product and Variant impact basis',
    });
  }),
});
