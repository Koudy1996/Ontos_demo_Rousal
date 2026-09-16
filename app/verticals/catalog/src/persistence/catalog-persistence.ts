import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { DateTime, Effect, Option, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

/* oxlint-disable anti-slop/no-conditional-empty-object-spread, effect-native/no-sequential-independent-yields, eslint/no-negated-condition, eslint/no-nested-ternary, eslint/prefer-destructuring, perfectionist/sort-object-types, perfectionist/sort-objects, typescript/consistent-type-specifier-style -- Drizzle rows and optional SQL columns are decoded at this tenant-scoped persistence boundary; generated insert key order and transactional read ordering are intentional. expires: 2027-03-31. */
import {
  catalogReadiness,
  ProductSchema,
  ProductVariantSchema,
  type Product,
  type ProductChangeKind,
  type ProductHistory,
  type ProductLifecycle,
  type ProductRevisionRecord,
  type ProductVariant,
} from '../../shared/domain/product.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import { ProductRevisionReferenceSchema } from '../../shared/domain/catalog-revision-reference.ts';
import { CatalogPersistenceConflict, CatalogPersistenceUnavailable } from './errors.ts';
import { productLifecycleEvents, productRevisions, productVariants, products } from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

const ProductIdSchema = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('CatalogProductId'));

export interface CreateProductPersistenceInput {
  readonly actionInvocationId: string;
  readonly description: string | undefined;
  readonly name: string | undefined;
  readonly principalId: string;
  readonly reason: string;
  readonly tenantId: string;
  readonly variantId: string | undefined;
}

export interface UpdateProductPersistenceInput {
  readonly actionInvocationId: string;
  readonly activateVariantId: string | undefined;
  readonly description: string | undefined;
  readonly expectedRevision: number;
  readonly name: string | undefined;
  readonly principalId: string;
  readonly productId: string;
  readonly reason: string;
  readonly targetLifecycle: ProductLifecycle | undefined;
  readonly tenantId: string;
}

export interface RetireProductPersistenceInput {
  readonly actionInvocationId: string;
  readonly effectiveAt: Date;
  readonly expectedRevision: number;
  readonly principalId: string;
  readonly productId: string;
  readonly reason: string;
  readonly tenantId: string;
}

export interface ReactivateProductPersistenceInput {
  readonly actionInvocationId: string;
  readonly expectedRevision: number;
  readonly principalId: string;
  readonly productId: string;
  readonly reason: string;
  readonly tenantId: string;
}

export interface CorrectProductPersistenceInput {
  readonly actionInvocationId: string;
  readonly description: string | undefined;
  readonly evidenceRefs: readonly string[];
  readonly expectedRevision: number;
  readonly name: string | undefined;
  readonly principalId: string;
  readonly productId: string;
  readonly reason: string;
  readonly tenantId: string;
  readonly variantId: string | undefined;
}

const CreateProductCreatedSchema = Schema.TaggedStruct('created', {
  product: ProductSchema,
  variantId: ProductVariantSchema.fields.variantId,
});
const CreateProductConflictSchema = Schema.TaggedStruct('conflict', {});
const CreateProductPersistenceOutcomeSchema = Schema.Union([CreateProductCreatedSchema, CreateProductConflictSchema]);
export type CreateProductPersistenceOutcome = typeof CreateProductPersistenceOutcomeSchema.Type;

const UpdateProductPersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('updated', {
    changed: Schema.Boolean,
    product: ProductSchema,
  }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Finite }),
  Schema.TaggedStruct('lifecycle_conflict', { product: ProductSchema }),
  Schema.TaggedStruct('variant_conflict', { product: ProductSchema }),
  Schema.TaggedStruct('not_catalog_ready', {
    product: ProductSchema,
    reasons: Schema.Array(Schema.String),
  }),
]);
export type UpdateProductPersistenceOutcome = typeof UpdateProductPersistenceOutcomeSchema.Type;

const RetireProductPersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('retired', { product: ProductSchema }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Finite }),
  Schema.TaggedStruct('already_retired', { product: ProductSchema }),
]);
export type RetireProductPersistenceOutcome = typeof RetireProductPersistenceOutcomeSchema.Type;

const ReactivateProductPersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('reactivated', { product: ProductSchema }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Finite }),
  Schema.TaggedStruct('lifecycle_conflict', { product: ProductSchema }),
  Schema.TaggedStruct('not_catalog_ready', {
    product: ProductSchema,
    reasons: Schema.Array(Schema.String),
  }),
]);
export type ReactivateProductPersistenceOutcome = typeof ReactivateProductPersistenceOutcomeSchema.Type;

const CorrectProductPersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('corrected', {
    changed: Schema.Boolean,
    product: ProductSchema,
  }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('revision_conflict', { actualRevision: Schema.Finite }),
  Schema.TaggedStruct('retired', { product: ProductSchema }),
  Schema.TaggedStruct('variant_conflict', {}),
]);
export type CorrectProductPersistenceOutcome = typeof CorrectProductPersistenceOutcomeSchema.Type;

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

const conflict = (reason: string): CatalogPersistenceConflict =>
  new CatalogPersistenceConflict({
    code: 'catalog_persistence_conflict',
    conflict: 'ACTION_INVOCATION_ID',
    reason,
  });

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Drizzle driver causes stay opaque and are attached only as non-serialized diagnostics. expires: 2027-03-31.
const mapWriteError = (error: unknown): CatalogPersistenceConflict | CatalogPersistenceUnavailable =>
  String(error).includes('invocation') ? conflict('Action invocation already recorded') : unavailable(error);

const productRef = (tenantId: string, productId: string): ProductRef => ({
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
});

const toLifecycle = (value: string): ProductLifecycle => {
  if (value === 'ACTIVE' || value === 'RETIRED') {
    return value;
  }
  return 'DRAFT';
};

const toVariant = (row: typeof productVariants.$inferSelect): ProductVariant => ({
  lifecycle:
    row.lifecycleState === 'ACTIVE' || row.lifecycleState === 'RETIRED' ? row.lifecycleState : 'WORK_IN_PROGRESS',
  productRef: productRef(row.tenantId, row.productId),
  variantId: row.variantId,
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: row.variantId,
    resourceType: 'commerce.catalog.variant',
    tenantId: row.tenantId,
  },
});

const toProduct = (
  tenantId: string,
  row: typeof products.$inferSelect,
  variants: readonly (typeof productVariants.$inferSelect)[],
): Product => {
  const lifecycle = toLifecycle(row.lifecycleState);
  const candidate = {
    lifecycle,
    ...(row.name === null ? {} : { name: row.name }),
    variants: variants.map(toVariant),
  } as const;
  const readiness = catalogReadiness(candidate);
  return {
    catalogReady: readiness.catalogReady,
    createdAt: row.createdAt.toISOString(),
    ...(row.description === null ? {} : { description: row.description }),
    lifecycle,
    ...(row.name === null ? {} : { name: row.name }),
    productRef: productRef(tenantId, row.productId),
    revision: row.currentRevision,
    updatedAt: row.updatedAt.toISOString(),
    variants: candidate.variants,
  };
};

const getProductRow = (transaction: ScopedTransaction, tenantId: string, productId: string) =>
  transaction
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
    .limit(1)
    .pipe(Effect.mapError(unavailable));

const getVariants = (transaction: ScopedTransaction, tenantId: string, productId: string) =>
  transaction
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, productId)))
    .orderBy(asc(productVariants.createdAt))
    .pipe(Effect.mapError(unavailable));

const loadProduct = Effect.fn('CatalogPersistence.loadProduct')(function* loadProduct(
  transaction: ScopedTransaction,
  tenantId: string,
  productId: string,
) {
  const [row] = yield* getProductRow(transaction, tenantId, productId);
  if (row === undefined) {
    return Option.none<Product>();
  }
  return Option.some(toProduct(tenantId, row, yield* getVariants(transaction, tenantId, productId)));
});

const insertRevision = (
  transaction: ScopedTransaction,
  input: {
    readonly actionInvocationId: string;
    readonly actingPrincipalId: string;
    readonly changeKind: ProductChangeKind;
    readonly description: string | undefined;
    readonly evidenceRefs: readonly string[];
    readonly lifecycle: ProductLifecycle;
    readonly name: string | undefined;
    readonly productId: string;
    readonly reason: string;
    readonly revision: number;
    readonly tenantId: string;
  },
) =>
  transaction
    .insert(productRevisions)
    .values({
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.actingPrincipalId,
      changeKind: input.changeKind,
      description: input.description ?? null,
      evidenceRefs: [...input.evidenceRefs],
      lifecycleState: input.lifecycle,
      name: input.name ?? null,
      productId: input.productId,
      reason: input.reason,
      revision: input.revision,
      tenantId: input.tenantId,
    })
    .pipe(Effect.mapError(mapWriteError));

const insertLifecycleEvent = (
  transaction: ScopedTransaction,
  input: {
    readonly actionInvocationId: string;
    readonly actingPrincipalId: string;
    readonly effectiveAt: Date;
    readonly event: 'ACTIVATED' | 'RETIRED';
    readonly productId: string;
    readonly reason: string;
    readonly tenantId: string;
  },
) =>
  transaction
    .insert(productLifecycleEvents)
    .values({
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.actingPrincipalId,
      effectiveAt: input.effectiveAt,
      event: input.event,
      productId: input.productId,
      reason: input.reason,
      tenantId: input.tenantId,
    })
    .pipe(Effect.mapError(mapWriteError));

export interface CatalogPersistence {
  readonly correct: (
    input: CorrectProductPersistenceInput,
  ) => Effect.Effect<CorrectProductPersistenceOutcome, CatalogPersistenceConflict | CatalogPersistenceUnavailable>;
  readonly create: (
    input: CreateProductPersistenceInput,
  ) => Effect.Effect<CreateProductPersistenceOutcome, CatalogPersistenceConflict | CatalogPersistenceUnavailable>;
  readonly getCurrent: (productId: string) => Effect.Effect<Option.Option<Product>, CatalogPersistenceUnavailable>;
  readonly getHistory: (
    productId: string,
  ) => Effect.Effect<Option.Option<ProductHistory>, CatalogPersistenceUnavailable>;
  readonly reactivate: (
    input: ReactivateProductPersistenceInput,
  ) => Effect.Effect<ReactivateProductPersistenceOutcome, CatalogPersistenceConflict | CatalogPersistenceUnavailable>;
  readonly retire: (
    input: RetireProductPersistenceInput,
  ) => Effect.Effect<RetireProductPersistenceOutcome, CatalogPersistenceConflict | CatalogPersistenceUnavailable>;
  readonly update: (
    input: UpdateProductPersistenceInput,
  ) => Effect.Effect<UpdateProductPersistenceOutcome, CatalogPersistenceConflict | CatalogPersistenceUnavailable>;
}

export const catalogPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): Effect.Effect<CatalogPersistence> => {
  const tenantId = scope.tenantId;

  const getCurrent: CatalogPersistence['getCurrent'] = Effect.fn('CatalogPersistence.getCurrent')(
    function* getCurrent(productId) {
      const parsedProductId = Schema.decodeOption(ProductIdSchema)(productId);
      if (Option.isNone(parsedProductId)) {
        return Option.none<Product>();
      }
      return yield* loadProduct(transaction, tenantId, parsedProductId.value);
    },
  );

  const create: CatalogPersistence['create'] = Effect.fn('CatalogPersistence.create')(function* create(input) {
    const productId = randomUUID();
    const variantId = input.variantId ?? randomUUID();
    yield* transaction
      .insert(products)
      .values({
        createdByActionInvocationId: input.actionInvocationId,
        createdByPrincipalId: input.principalId,
        description: input.description ?? null,
        lifecycleState: 'DRAFT',
        name: input.name ?? null,
        productId,
        tenantId,
      })
      .pipe(
        Effect.mapError((error) =>
          String(error).includes('product') ? conflict('Product identity already exists') : unavailable(error),
        ),
      );
    yield* transaction
      .insert(productVariants)
      .values({
        createdByActionInvocationId: input.actionInvocationId,
        createdByPrincipalId: input.principalId,
        lifecycleState: 'WORK_IN_PROGRESS',
        productId,
        tenantId,
        variantId,
      })
      .pipe(
        Effect.mapError((error) =>
          String(error).includes('variant') ? conflict('Variant identity already exists') : unavailable(error),
        ),
      );
    yield* insertRevision(transaction, {
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.principalId,
      changeKind: 'CREATED',
      description: input.description,
      evidenceRefs: [],
      lifecycle: 'DRAFT',
      name: input.name,
      productId,
      reason: input.reason,
      revision: 1,
      tenantId,
    });
    const product = yield* loadProduct(transaction, tenantId, productId);
    if (Option.isNone(product)) {
      return yield* unavailable();
    }
    return { _tag: 'created' as const, product: product.value, variantId };
  });

  // oxlint-disable-next-line complexity -- Lifecycle and optimistic-concurrency branches are the complete Product update state machine. expires: 2027-03-31.
  const update: CatalogPersistence['update'] = Effect.fn('CatalogPersistence.update')(function* update(input) {
    const current = yield* loadProduct(transaction, tenantId, input.productId);
    if (Option.isNone(current)) {
      return { _tag: 'not_found' as const };
    }
    const existing = current.value;
    if (existing.revision !== input.expectedRevision) {
      return { _tag: 'revision_conflict' as const, actualRevision: existing.revision };
    }
    if (existing.lifecycle === 'RETIRED') {
      return { _tag: 'lifecycle_conflict' as const, product: existing };
    }
    const lifecycle = input.targetLifecycle ?? existing.lifecycle;
    if (lifecycle === 'RETIRED') {
      return { _tag: 'lifecycle_conflict' as const, product: existing };
    }
    const activatingVariant =
      input.activateVariantId === undefined
        ? undefined
        : existing.variants.find((variant) => variant.variantId === input.activateVariantId);
    if (
      input.activateVariantId !== undefined &&
      (activatingVariant === undefined || activatingVariant.lifecycle === 'RETIRED')
    ) {
      return { _tag: 'variant_conflict' as const, product: existing };
    }
    const variantActivationChanges = activatingVariant?.lifecycle === 'WORK_IN_PROGRESS';
    const candidate = {
      lifecycle,
      ...(input.name === undefined
        ? existing.name === undefined
          ? {}
          : { name: existing.name }
        : { name: input.name }),
      variants: existing.variants.map((variant) =>
        variantActivationChanges && variant.variantId === input.activateVariantId
          ? { ...variant, lifecycle: 'ACTIVE' as const }
          : variant,
      ),
    } as const;
    if (lifecycle === 'ACTIVE') {
      const readiness = catalogReadiness(candidate);
      if (!readiness.catalogReady) {
        return { _tag: 'not_catalog_ready' as const, product: existing, reasons: readiness.reasons };
      }
    }
    const changed =
      input.name !== undefined ||
      input.description !== undefined ||
      lifecycle !== existing.lifecycle ||
      variantActivationChanges;
    if (!changed) {
      return { _tag: 'updated' as const, changed: false, product: existing };
    }
    const revision = existing.revision + 1;
    const now = DateTime.toDateUtc(yield* DateTime.now);
    const [updated] = yield* transaction
      .update(products)
      .set({
        ...(input.description === undefined ? {} : { description: input.description }),
        lifecycleState: lifecycle,
        currentRevision: revision,
        ...(input.name === undefined ? {} : { name: input.name }),
        retiredEffectiveAt: null,
        retiredReason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.productId, input.productId),
          eq(products.tenantId, tenantId),
          eq(products.currentRevision, input.expectedRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      const [latest] = yield* getProductRow(transaction, tenantId, input.productId);
      return {
        _tag: 'revision_conflict' as const,
        actualRevision: latest?.currentRevision ?? input.expectedRevision,
      };
    }
    if (variantActivationChanges && input.activateVariantId !== undefined) {
      const [activated] = yield* transaction
        .update(productVariants)
        .set({ lifecycleState: 'ACTIVE', updatedAt: now })
        .where(
          and(
            eq(productVariants.tenantId, tenantId),
            eq(productVariants.productId, input.productId),
            eq(productVariants.variantId, input.activateVariantId),
            eq(productVariants.lifecycleState, 'WORK_IN_PROGRESS'),
          ),
        )
        .returning()
        .pipe(Effect.mapError(unavailable));
      if (activated === undefined) {
        return yield* conflict('Variant activation changed concurrently');
      }
    }
    yield* insertRevision(transaction, {
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.principalId,
      changeKind: lifecycle !== existing.lifecycle ? 'LIFECYCLE' : 'UPDATED',
      description: input.description ?? existing.description,
      evidenceRefs: [],
      lifecycle,
      name: input.name ?? existing.name,
      productId: input.productId,
      reason: input.reason,
      revision,
      tenantId,
    });
    if (lifecycle === 'ACTIVE' && existing.lifecycle !== 'ACTIVE') {
      yield* insertLifecycleEvent(transaction, {
        actionInvocationId: input.actionInvocationId,
        actingPrincipalId: input.principalId,
        effectiveAt: now,
        event: 'ACTIVATED',
        productId: input.productId,
        reason: input.reason,
        tenantId,
      });
    }
    const resulting = yield* loadProduct(transaction, tenantId, input.productId);
    return Option.isSome(resulting)
      ? { _tag: 'updated' as const, changed: true, product: resulting.value }
      : { _tag: 'not_found' as const };
  });

  const retire: CatalogPersistence['retire'] = Effect.fn('CatalogPersistence.retire')(function* retire(input) {
    const current = yield* loadProduct(transaction, tenantId, input.productId);
    if (Option.isNone(current)) {
      return { _tag: 'not_found' as const };
    }
    const existing = current.value;
    if (existing.revision !== input.expectedRevision) {
      return { _tag: 'revision_conflict' as const, actualRevision: existing.revision };
    }
    if (existing.lifecycle === 'RETIRED') {
      return { _tag: 'already_retired' as const, product: existing };
    }
    const revision = existing.revision + 1;
    const effectiveAt = input.effectiveAt;
    const now = DateTime.toDateUtc(yield* DateTime.now);
    const [updated] = yield* transaction
      .update(products)
      .set({
        currentRevision: revision,
        lifecycleState: 'RETIRED',
        retiredEffectiveAt: effectiveAt,
        retiredReason: input.reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.productId, input.productId),
          eq(products.tenantId, tenantId),
          eq(products.currentRevision, input.expectedRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      const [latest] = yield* getProductRow(transaction, tenantId, input.productId);
      return {
        _tag: 'revision_conflict' as const,
        actualRevision: latest?.currentRevision ?? input.expectedRevision,
      };
    }
    yield* insertRevision(transaction, {
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.principalId,
      changeKind: 'LIFECYCLE',
      description: existing.description,
      evidenceRefs: [],
      lifecycle: 'RETIRED',
      name: existing.name,
      productId: input.productId,
      reason: input.reason,
      revision,
      tenantId,
    });
    yield* insertLifecycleEvent(transaction, {
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.principalId,
      effectiveAt,
      event: 'RETIRED',
      productId: input.productId,
      reason: input.reason,
      tenantId,
    });
    const resulting = yield* loadProduct(transaction, tenantId, input.productId);
    return Option.isSome(resulting)
      ? { _tag: 'retired' as const, product: resulting.value }
      : { _tag: 'not_found' as const };
  });

  const reactivate: CatalogPersistence['reactivate'] = Effect.fn('CatalogPersistence.reactivate')(
    function* reactivate(input) {
      const current = yield* loadProduct(transaction, tenantId, input.productId);
      if (Option.isNone(current)) {
        return { _tag: 'not_found' as const };
      }
      const existing = current.value;
      if (existing.revision !== input.expectedRevision) {
        return { _tag: 'revision_conflict' as const, actualRevision: existing.revision };
      }
      if (existing.lifecycle !== 'RETIRED') {
        return { _tag: 'lifecycle_conflict' as const, product: existing };
      }
      const readiness = catalogReadiness({
        lifecycle: 'ACTIVE',
        ...(existing.name === undefined ? {} : { name: existing.name }),
        variants: existing.variants,
      });
      if (!readiness.catalogReady) {
        return { _tag: 'not_catalog_ready' as const, product: existing, reasons: readiness.reasons };
      }
      const revision = existing.revision + 1;
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const [updated] = yield* transaction
        .update(products)
        .set({
          currentRevision: revision,
          lifecycleState: 'ACTIVE',
          retiredEffectiveAt: null,
          retiredReason: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(products.productId, input.productId),
            eq(products.tenantId, tenantId),
            eq(products.currentRevision, input.expectedRevision),
          ),
        )
        .returning()
        .pipe(Effect.mapError(unavailable));
      if (updated === undefined) {
        const [latest] = yield* getProductRow(transaction, tenantId, input.productId);
        return {
          _tag: 'revision_conflict' as const,
          actualRevision: latest?.currentRevision ?? input.expectedRevision,
        };
      }
      yield* insertRevision(transaction, {
        actionInvocationId: input.actionInvocationId,
        actingPrincipalId: input.principalId,
        changeKind: 'LIFECYCLE',
        description: existing.description,
        evidenceRefs: [],
        lifecycle: 'ACTIVE',
        name: existing.name,
        productId: input.productId,
        reason: input.reason,
        revision,
        tenantId,
      });
      yield* insertLifecycleEvent(transaction, {
        actionInvocationId: input.actionInvocationId,
        actingPrincipalId: input.principalId,
        effectiveAt: now,
        event: 'ACTIVATED',
        productId: input.productId,
        reason: input.reason,
        tenantId,
      });
      const resulting = yield* loadProduct(transaction, tenantId, input.productId);
      return Option.isSome(resulting)
        ? { _tag: 'reactivated' as const, product: resulting.value }
        : { _tag: 'not_found' as const };
    },
  );

  const correct: CatalogPersistence['correct'] = Effect.fn('CatalogPersistence.correct')(function* correct(input) {
    const current = yield* loadProduct(transaction, tenantId, input.productId);
    if (Option.isNone(current)) {
      return { _tag: 'not_found' as const };
    }
    const existing = current.value;
    if (existing.revision !== input.expectedRevision) {
      return { _tag: 'revision_conflict' as const, actualRevision: existing.revision };
    }
    if (existing.lifecycle === 'RETIRED') {
      return { _tag: 'retired' as const, product: existing };
    }
    if (input.variantId !== undefined && !existing.variants.some((variant) => variant.variantId === input.variantId)) {
      return { _tag: 'variant_conflict' as const };
    }
    const changed = input.name !== undefined || input.description !== undefined;
    if (!changed) {
      return { _tag: 'corrected' as const, changed: false, product: existing };
    }
    const revision = existing.revision + 1;
    const now = DateTime.toDateUtc(yield* DateTime.now);
    const [updated] = yield* transaction
      .update(products)
      .set({
        ...(input.description === undefined ? {} : { description: input.description }),
        currentRevision: revision,
        ...(input.name === undefined ? {} : { name: input.name }),
        updatedAt: now,
      })
      .where(
        and(
          eq(products.productId, input.productId),
          eq(products.tenantId, tenantId),
          eq(products.currentRevision, input.expectedRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      const [latest] = yield* getProductRow(transaction, tenantId, input.productId);
      return {
        _tag: 'revision_conflict' as const,
        actualRevision: latest?.currentRevision ?? input.expectedRevision,
      };
    }
    yield* insertRevision(transaction, {
      actionInvocationId: input.actionInvocationId,
      actingPrincipalId: input.principalId,
      changeKind: 'COSMETIC_CORRECTION',
      description: input.description ?? existing.description,
      evidenceRefs: input.evidenceRefs,
      lifecycle: existing.lifecycle,
      name: input.name ?? existing.name,
      productId: input.productId,
      reason: input.reason,
      revision,
      tenantId,
    });
    const resulting = yield* loadProduct(transaction, tenantId, input.productId);
    return Option.isSome(resulting)
      ? { _tag: 'corrected' as const, changed: true, product: resulting.value }
      : { _tag: 'not_found' as const };
  });

  const getHistory: CatalogPersistence['getHistory'] = Effect.fn('CatalogPersistence.getHistory')(
    function* getHistory(productId) {
      const parsedProductId = Schema.decodeOption(ProductIdSchema)(productId);
      if (Option.isNone(parsedProductId)) {
        return Option.none<ProductHistory>();
      }
      const current = yield* loadProduct(transaction, tenantId, parsedProductId.value);
      if (Option.isNone(current)) {
        return Option.none<ProductHistory>();
      }
      const revisions = yield* transaction
        .select()
        .from(productRevisions)
        .where(and(eq(productRevisions.tenantId, tenantId), eq(productRevisions.productId, parsedProductId.value)))
        .orderBy(asc(productRevisions.revision))
        .pipe(Effect.mapError(unavailable));
      const lifecycle = yield* transaction
        .select()
        .from(productLifecycleEvents)
        .where(
          and(
            eq(productLifecycleEvents.tenantId, tenantId),
            eq(productLifecycleEvents.productId, parsedProductId.value),
          ),
        )
        .orderBy(asc(productLifecycleEvents.effectiveAt))
        .pipe(Effect.mapError(unavailable));
      const revisionRecords: ProductRevisionRecord[] = yield* Effect.forEach(
        revisions,
        (row) =>
          Schema.decodeEffect(ProductRevisionReferenceSchema)({
            resourceRef: productRef(tenantId, row.productId),
            revision: row.revision,
            revisionId: row.productRevisionId,
          }).pipe(
            Effect.map((revisionReference): ProductRevisionRecord => ({
              actionInvocationId: row.actionInvocationId,
              changeKind:
                row.changeKind === 'COSMETIC_CORRECTION' ||
                row.changeKind === 'UPDATED' ||
                row.changeKind === 'LIFECYCLE'
                  ? row.changeKind
                  : 'CREATED',
              ...(row.description === null ? {} : { description: row.description }),
              evidenceRefs: row.evidenceRefs,
              lifecycle: toLifecycle(row.lifecycleState),
              ...(row.name === null ? {} : { name: row.name }),
              productRef: productRef(tenantId, row.productId),
              reason: row.reason,
              recordedAt: row.recordedAt.toISOString(),
              revision: row.revision,
              revisionReference,
            })),
            Effect.mapError(unavailable),
          ),
        { concurrency: 1 },
      );
      return Option.some<ProductHistory>({
        historical: true,
        lifecycle: lifecycle.map((row) => ({
          actionInvocationId: row.actionInvocationId,
          effectiveAt: row.effectiveAt.toISOString(),
          event: row.event === 'RETIRED' ? 'RETIRED' : 'ACTIVATED',
          productRef: productRef(tenantId, row.productId),
          reason: row.reason,
          recordedAt: row.recordedAt.toISOString(),
        })),
        productRef: current.value.productRef,
        revisions: revisionRecords,
      });
    },
  );

  return Effect.succeed(
    Object.freeze({
      correct,
      create,
      getCurrent,
      getHistory,
      reactivate,
      retire,
      update,
    }),
  );
};
