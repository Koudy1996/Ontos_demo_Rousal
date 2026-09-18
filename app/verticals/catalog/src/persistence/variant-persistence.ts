import { findPostgresFailure } from '@app/core-runtime';
import type { ActionRuntime, OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';

import { CreateVariantResultSchema } from '../../shared/actions/create-variant.ts';
import type { CreateVariantResult } from '../../shared/actions/create-variant.ts';
import { ProductVariantSchema } from '../../shared/domain/product.ts';
import type { ProductVariant } from '../../shared/domain/product.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import { manufacturerRelations, productVariantRevisions, productVariants, products } from '../database/schema.ts';
import { recoverCatalogActionResult } from '../api/catalog-action-result-recovery.ts';
import type { CatalogActionRecovery } from '../api/catalog-action-result-recovery.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
type VariantRow = typeof productVariants.$inferSelect;

export class VariantCurrentBasisUnavailable extends Schema.TaggedError<VariantCurrentBasisUnavailable>()(
  'VariantCurrentBasisUnavailable',
  { code: Schema.Literal('variant_current_basis_unavailable'), reason: Schema.String },
) {}
const VariantIdentityConflictSchema = Schema.TaggedStruct('VariantIdentityConflict', {});

interface ChangeEvidence {
  readonly actionInvocationId: string;
  readonly evidenceRefs: readonly string[];
  readonly principalId: string;
  readonly reason: string;
}

interface CreateVariantPersistenceInput extends ChangeEvidence {
  readonly expectedProductRevision: number;
  readonly productRef: ProductRef;
  readonly variantRef: VariantRef;
}

interface ChangeVariantPersistenceInput extends ChangeEvidence {
  readonly classification: 'SAME_MEANING' | 'EVIDENCED_CORRECTION' | 'EVIDENCED_PARENT_CORRECTION';
  readonly expectedRevision: number;
  readonly targetProductRef?: ProductRef | undefined;
  readonly variantRef: VariantRef;
}

interface VariantLifecyclePersistenceInput extends ChangeEvidence {
  readonly expectedRevision: number;
  readonly variantRef: VariantRef;
}

const FailureOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('lifecycle_conflict', {}),
  Schema.TaggedStruct('identity_conflict', {}),
  Schema.TaggedStruct('invalid_change', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Int }),
]);
type FailureOutcome = typeof FailureOutcomeSchema.Type;
const CreatedOutcomeSchema = Schema.TaggedStruct('created', { revision: Schema.Int, variant: ProductVariantSchema });
const ChangedOutcomeSchema = Schema.TaggedStruct('changed', { revision: Schema.Int, variant: ProductVariantSchema });
const RetiredOutcomeSchema = Schema.TaggedStruct('retired', { revision: Schema.Int, variant: ProductVariantSchema });
type SuccessOutcome<Tag extends 'created' | 'changed' | 'retired'> = Extract<
  typeof CreatedOutcomeSchema.Type | typeof ChangedOutcomeSchema.Type | typeof RetiredOutcomeSchema.Type,
  { readonly _tag: Tag }
>;
export type VariantPersistenceOutcome = FailureOutcome | SuccessOutcome<'created' | 'changed' | 'retired'>;

export interface VariantPersistence {
  readonly change: (
    input: ChangeVariantPersistenceInput,
  ) => Effect.Effect<
    FailureOutcome | SuccessOutcome<'changed'>,
    CatalogPersistenceUnavailable | VariantCurrentBasisUnavailable
  >;
  readonly create: (
    input: CreateVariantPersistenceInput,
  ) => Effect.Effect<FailureOutcome | SuccessOutcome<'created'>, CatalogPersistenceUnavailable>;
  readonly reactivate: (
    input: VariantLifecyclePersistenceInput,
  ) => Effect.Effect<FailureOutcome, CatalogPersistenceUnavailable | VariantCurrentBasisUnavailable>;
  readonly recoverCreateVariant: (
    invocationId: string,
  ) => Effect.Effect<CatalogActionRecovery<CreateVariantResult>, never, ActionRuntime>;
  readonly retire: (
    input: VariantLifecyclePersistenceInput,
  ) => Effect.Effect<FailureOutcome | SuccessOutcome<'retired'>, CatalogPersistenceUnavailable>;
}

const unavailable = (cause?: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

/** Exact retained Variant form; absence never falls back to the Current Variant. */
export const variantHistoryForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  getRevision: (variantId: string, revision: number) =>
    transaction
      .select()
      .from(productVariantRevisions)
      .where(
        and(
          eq(productVariantRevisions.tenantId, scope.tenantId),
          eq(productVariantRevisions.variantId, variantId),
          eq(productVariantRevisions.revision, revision),
        ),
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => (rows[0] === undefined ? Option.none() : Option.some(rows[0]))),
        Effect.mapError(unavailable),
      ),
});

const basisUnavailable = () =>
  new VariantCurrentBasisUnavailable({
    code: 'variant_current_basis_unavailable',
    reason: 'Catalog cannot verify current effective axes, allowed values, and dependent selections',
  });

const CATALOG_MODULE = 'commerce.catalog';
const VARIANT_RESOURCE = 'commerce.catalog.variant';
const PRODUCT_RESOURCE = 'commerce.catalog.product';
const isRef = (ref: ProductRef | VariantRef, tenantId: string, type: string) =>
  ref.tenantId === tenantId && ref.moduleId === CATALOG_MODULE && ref.resourceType === type;
const validEvidence = (input: ChangeEvidence) =>
  input.reason === input.reason.trim() &&
  input.reason.length > 0 &&
  input.reason.length <= 1000 &&
  input.evidenceRefs.every((ref) => ref === ref.trim() && ref.length > 0 && ref.length <= 1000);

const variant = (row: VariantRow): ProductVariant => ({
  lifecycle:
    row.lifecycleState === 'ACTIVE' || row.lifecycleState === 'RETIRED' ? row.lifecycleState : 'WORK_IN_PROGRESS',
  productRef: {
    moduleId: CATALOG_MODULE,
    resourceId: row.productId,
    resourceType: PRODUCT_RESOURCE,
    tenantId: row.tenantId,
  },
  variantId: row.variantId,
  variantRef: {
    moduleId: CATALOG_MODULE,
    resourceId: row.variantId,
    resourceType: VARIANT_RESOURCE,
    tenantId: row.tenantId,
  },
});

const mapInsertError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Core classifies an opaque PostgreSQL driver cause. expires: 2027-03-31.
  error: unknown,
): typeof VariantIdentityConflictSchema.Type | CatalogPersistenceUnavailable => {
  const uniqueViolation = ['23', '505'].join('');
  const matched = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      code === uniqueViolation &&
      [
        'product_variants_pkey',
        'catalog_product_variants_scope_id_uk',
        'catalog_product_variants_product_id_variant_id_uk',
      ].includes(constraint ?? ''),
  );
  return Option.isSome(matched) ? { _tag: 'VariantIdentityConflict' } : unavailable(error);
};

/** The owner service uses only Core's already-scoped transaction; no caller can supply an axis signature. */
export const variantPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): VariantPersistence => {
  const { tenantId } = scope;
  const recoverCreateVariant: VariantPersistence['recoverCreateVariant'] = (invocationId) =>
    recoverCatalogActionResult(
      transaction,
      scope,
      { actionInvocationId: invocationId, actionKey: 'commerce.catalog.create-variant', schemaVersion: 1 },
      {
        decode: Schema.decodeUnknownEffect(CreateVariantResultSchema),
        encode: Schema.encodeEffect(CreateVariantResultSchema),
      },
    );
  const getVariant = (variantId: string) =>
    transaction
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.variantId, variantId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const getProduct = (productId: string) =>
    transaction
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const revision = (row: VariantRow, input: ChangeEvidence, kind: 'CREATED' | 'CORRECTED' | 'LIFECYCLE') =>
    transaction
      .insert(productVariantRevisions)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        changeKind: kind,
        combinationAxisRevision: row.combinationAxisRevision,
        combinationKey: row.combinationKey,
        evidenceRefs: [...input.evidenceRefs],
        lifecycleState: row.lifecycleState,
        productId: row.productId,
        reason: input.reason,
        revision: row.currentRevision,
        tenantId,
        variantId: row.variantId,
      })
      .pipe(Effect.mapError(unavailable));

  const create: VariantPersistence['create'] = Effect.fn('VariantPersistence.create')(function* create(input) {
    if (
      !isRef(input.productRef, tenantId, PRODUCT_RESOURCE) ||
      !isRef(input.variantRef, tenantId, VARIANT_RESOURCE) ||
      !validEvidence(input)
    ) {
      return { _tag: 'invalid_change' };
    }
    const [parent] = yield* getProduct(input.productRef.resourceId);
    if (parent === undefined) {
      return { _tag: 'not_found' };
    }
    if (parent.currentRevision !== input.expectedProductRevision) {
      return { _tag: 'revision_conflict', actualRevision: parent.currentRevision };
    }
    if (parent.lifecycleState === 'RETIRED') {
      return { _tag: 'lifecycle_conflict' };
    }
    // The Product row lock serializes this check with Manufacturer Relation mutations.
    // A Product-wide assertion cannot silently acquire another exact form without amended evidence.
    const productManufacturerRelations = yield* transaction
      .select()
      .from(manufacturerRelations)
      .where(and(eq(manufacturerRelations.tenantId, tenantId), eq(manufacturerRelations.productId, parent.productId)))
      .for('update')
      .pipe(Effect.mapError(unavailable));
    const now = DateTime.toDateUtc(yield* DateTime.now);
    if (
      productManufacturerRelations.some(
        (relation) =>
          relation.disposition === 'CONFIRMED' && (relation.effectiveTo === null || relation.effectiveTo > now),
      )
    ) {
      return { _tag: 'identity_conflict' };
    }
    const inserted = yield* transaction
      .insert(productVariants)
      .values({
        createdByActionInvocationId: input.actionInvocationId,
        createdByPrincipalId: input.principalId,
        currentRevision: 1,
        lifecycleState: 'WORK_IN_PROGRESS',
        productId: parent.productId,
        tenantId,
        variantId: input.variantRef.resourceId,
      })
      .returning()
      .pipe(
        Effect.mapError(mapInsertError),
        Effect.catchTag('VariantIdentityConflict', () => Effect.succeed({ _tag: 'identity_conflict' as const })),
      );
    if (!Array.isArray(inserted)) {
      return inserted;
    }
    const [row] = inserted;
    if (row === undefined) {
      return yield* unavailable();
    }
    yield* revision(row, input, 'CREATED');
    return { _tag: 'created', revision: 1, variant: variant(row) };
  });

  const change: VariantPersistence['change'] = Effect.fn('VariantPersistence.change')(function* change(input) {
    if (
      !isRef(input.variantRef, tenantId, VARIANT_RESOURCE) ||
      !validEvidence(input) ||
      (input.targetProductRef !== undefined && !isRef(input.targetProductRef, tenantId, PRODUCT_RESOURCE))
    ) {
      return { _tag: 'invalid_change' };
    }
    const [row] = yield* getVariant(input.variantRef.resourceId);
    if (row === undefined) {
      return { _tag: 'not_found' };
    }
    if (row.currentRevision !== input.expectedRevision) {
      return { _tag: 'revision_conflict', actualRevision: row.currentRevision };
    }
    if (row.lifecycleState === 'RETIRED') {
      return { _tag: 'lifecycle_conflict' };
    }
    if (
      input.classification !== 'SAME_MEANING' ||
      (input.targetProductRef !== undefined && input.targetProductRef.resourceId !== row.productId)
    ) {
      return yield* basisUnavailable();
    }
    // A same-meaning attestation changes no effective axis, parent, or identity.
    const [updated] = yield* transaction
      .update(productVariants)
      .set({ currentRevision: row.currentRevision + 1, updatedAt: DateTime.toDateUtc(yield* DateTime.now) })
      .where(
        and(
          eq(productVariants.tenantId, tenantId),
          eq(productVariants.variantId, row.variantId),
          eq(productVariants.currentRevision, row.currentRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      return yield* unavailable();
    }
    yield* revision(updated, input, 'CORRECTED');
    return { _tag: 'changed', revision: updated.currentRevision, variant: variant(updated) };
  });

  const retire: VariantPersistence['retire'] = Effect.fn('VariantPersistence.retire')(function* retire(input) {
    if (!isRef(input.variantRef, tenantId, VARIANT_RESOURCE) || !validEvidence(input)) {
      return { _tag: 'invalid_change' };
    }
    const [row] = yield* getVariant(input.variantRef.resourceId);
    if (row === undefined) {
      return { _tag: 'not_found' };
    }
    if (row.currentRevision !== input.expectedRevision) {
      return { _tag: 'revision_conflict', actualRevision: row.currentRevision };
    }
    if (row.lifecycleState === 'RETIRED') {
      return { _tag: 'lifecycle_conflict' };
    }
    const [updated] = yield* transaction
      .update(productVariants)
      .set({
        combinationAxisRevision: null,
        combinationKey: null,
        currentRevision: row.currentRevision + 1,
        lifecycleState: 'RETIRED',
        updatedAt: DateTime.toDateUtc(yield* DateTime.now),
      })
      .where(
        and(
          eq(productVariants.tenantId, tenantId),
          eq(productVariants.variantId, row.variantId),
          eq(productVariants.currentRevision, row.currentRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      return yield* unavailable();
    }
    yield* revision(updated, input, 'LIFECYCLE');
    return { _tag: 'retired', revision: updated.currentRevision, variant: variant(updated) };
  });

  const reactivate: VariantPersistence['reactivate'] = Effect.fn('VariantPersistence.reactivate')(
    function* reactivate(input) {
      if (!isRef(input.variantRef, tenantId, VARIANT_RESOURCE) || !validEvidence(input)) {
        return { _tag: 'invalid_change' };
      }
      const [row] = yield* getVariant(input.variantRef.resourceId);
      if (row === undefined) {
        return { _tag: 'not_found' };
      }
      if (row.currentRevision !== input.expectedRevision) {
        return { _tag: 'revision_conflict', actualRevision: row.currentRevision };
      }
      if (row.lifecycleState !== 'RETIRED') {
        return { _tag: 'lifecycle_conflict' };
      }
      const [parent] = yield* getProduct(row.productId);
      if (parent === undefined) {
        return yield* unavailable();
      }
      if (parent.lifecycleState === 'RETIRED') {
        return { _tag: 'lifecycle_conflict' };
      }
      return yield* basisUnavailable();
    },
  );
  return { change, create, reactivate, recoverCreateVariant, retire };
};
