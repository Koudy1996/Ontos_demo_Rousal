import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Schema } from 'effect';

import type {
  CreateBrandPayload,
  ReactivateBrandPayload,
  RenameBrandPayload,
  RetireBrandPayload,
  SetProductBrandPayload,
} from '../../shared/actions/brand-mutations.ts';
import { BrandRefSchema } from '../../shared/resources/brand.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import { ProductBrandAssignmentSchema } from '../../shared/actions/brand-mutations.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

interface Input<Payload> {
  readonly actionInvocationId: string;
  readonly payload: Payload;
  readonly principalId: string;
}

const FailedMutationOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('invalid', { reason: Schema.String }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('stale', { actualRevision: Schema.Int }),
]);
const BrandMutationOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('applied', { result: Schema.Struct({ brandRef: BrandRefSchema, revision: Schema.Int }) }),
  FailedMutationOutcomeSchema,
]);
const ProductBrandMutationOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('applied', {
    result: Schema.Struct({
      assignment: ProductBrandAssignmentSchema,
      productRef: ProductRefSchema,
      revision: Schema.Int,
    }),
  }),
  FailedMutationOutcomeSchema,
]);
export type BrandMutationOutcome = typeof BrandMutationOutcomeSchema.Type;
export type ProductBrandMutationOutcome = typeof ProductBrandMutationOutcomeSchema.Type;

export class BrandPersistenceUnavailable extends Schema.TaggedError<BrandPersistenceUnavailable>()(
  'BrandPersistenceUnavailable',
  { code: Schema.Literal('brand_persistence_unavailable'), reason: Schema.String },
) {}

export interface BrandPersistence {
  readonly create: (
    input: Input<CreateBrandPayload>,
  ) => Effect.Effect<BrandMutationOutcome, BrandPersistenceUnavailable>;
  readonly reactivate: (
    input: Input<ReactivateBrandPayload>,
  ) => Effect.Effect<BrandMutationOutcome, BrandPersistenceUnavailable>;
  readonly rename: (
    input: Input<RenameBrandPayload>,
  ) => Effect.Effect<BrandMutationOutcome, BrandPersistenceUnavailable>;
  readonly retire: (
    input: Input<RetireBrandPayload>,
  ) => Effect.Effect<BrandMutationOutcome, BrandPersistenceUnavailable>;
  readonly setProductBrand: (
    input: Input<SetProductBrandPayload>,
  ) => Effect.Effect<ProductBrandMutationOutcome, BrandPersistenceUnavailable>;
}

const unavailable = () =>
  new BrandPersistenceUnavailable({
    code: 'brand_persistence_unavailable',
    reason: 'Authoritative Brand and Product Brand persistence is unavailable',
  });

/** No Brand mutation may report success until its tenant-scoped relational substrate exists. */
export const brandPersistenceForScope = (transaction: ScopedTransaction, scope: OperationalScope): BrandPersistence => {
  void transaction;
  void scope;
  const failClosed = () => Effect.fail(unavailable());
  return {
    create: failClosed,
    reactivate: failClosed,
    rename: failClosed,
    retire: failClosed,
    setProductBrand: failClosed,
  };
};
