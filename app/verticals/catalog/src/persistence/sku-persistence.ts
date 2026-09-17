import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq, isNull } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import { normalizeSku } from '../../shared/domain/commercial-code.ts';
import type { SkuTarget } from '../../shared/domain/commercial-code.ts';
import {
  commercialSkuAssignmentRevisions,
  commercialSkuReservations,
  productVariants,
  products,
} from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class SkuPersistenceUnavailable extends Schema.TaggedError<SkuPersistenceUnavailable>()(
  'SkuPersistenceUnavailable',
  { code: Schema.Literal('sku_persistence_unavailable'), reason: Schema.String },
) {}

export interface SkuChangeInput {
  readonly actionInvocationId: string;
  readonly code: string;
  readonly evidenceRefs: readonly string[];
  /** Zero means this is a new tenant-wide reservation. */
  readonly expectedRevision: number;
  readonly principalId: string;
  readonly reason: string;
  readonly target: SkuTarget;
}

export interface SkuCorrectionInput extends SkuChangeInput {
  /** The original mistaken target is preserved in the preceding revision. */
  readonly previousTarget: SkuTarget;
}

export interface SkuRenameInput extends SkuChangeInput {
  readonly oldCode: string;
}

export const SkuChangeOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('applied', { revision: Schema.Int }),
  Schema.TaggedStruct('conflict', {}),
  Schema.TaggedStruct('invalid', { reason: Schema.String }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('stale', { actualRevision: Schema.Int }),
]);
export type SkuChangeOutcome = typeof SkuChangeOutcomeSchema.Type;

const unavailable = (cause?: unknown): SkuPersistenceUnavailable => {
  const failure = new SkuPersistenceUnavailable({
    code: 'sku_persistence_unavailable',
    reason: 'Authoritative SKU target or persistence is unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

export const validSkuChangeInput = (input: SkuChangeInput, tenantId: string): boolean =>
  input.target.tenantId === tenantId &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.actionInvocationId) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.principalId) &&
  (input.target.kind === 'VARIANT'
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.target.variantId)
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.target.packageDefinitionId)) &&
  Number.isSafeInteger(input.expectedRevision) &&
  input.expectedRevision >= 0 &&
  normalizeSku(input.code).length > 0 &&
  normalizeSku(input.code).length <= 240 &&
  input.reason === input.reason.trim() &&
  input.reason.length > 0 &&
  input.reason.length <= 1000 &&
  input.evidenceRefs.length > 0 &&
  input.evidenceRefs.every((ref) => ref.length > 0 && ref.length <= 300 && ref === ref.trim());

const sameEvidence = (row: typeof commercialSkuAssignmentRevisions.$inferSelect, input: SkuChangeInput) =>
  row.reason === input.reason &&
  row.evidenceRefs.length === input.evidenceRefs.length &&
  row.evidenceRefs.every((ref, index) => ref === input.evidenceRefs[index]);

const sameTarget = (row: typeof commercialSkuReservations.$inferSelect, target: SkuTarget) =>
  target.kind === 'VARIANT' && row.variantId === target.variantId && row.packageDefinitionId === null;

/** Core owns the transaction and permissions. This owner service cannot open or commit one. */
export const skuPersistenceForScope = (transaction: ScopedTransaction, scope: OperationalScope) => {
  const { tenantId } = scope;
  const reservationWhere = (normalizedCode: string) =>
    and(eq(commercialSkuReservations.tenantId, tenantId), eq(commercialSkuReservations.normalizedCode, normalizedCode));
  const readInvocation = (actionInvocationId: string, normalizedCode: string) =>
    transaction
      .select()
      .from(commercialSkuAssignmentRevisions)
      .where(
        and(
          eq(commercialSkuAssignmentRevisions.tenantId, tenantId),
          eq(commercialSkuAssignmentRevisions.actionInvocationId, actionInvocationId),
          eq(commercialSkuAssignmentRevisions.normalizedCode, normalizedCode),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const readAnyInvocation = (actionInvocationId: string) =>
    transaction
      .select()
      .from(commercialSkuAssignmentRevisions)
      .where(
        and(
          eq(commercialSkuAssignmentRevisions.tenantId, tenantId),
          eq(commercialSkuAssignmentRevisions.actionInvocationId, actionInvocationId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const resolveVariant = Effect.fn('SkuPersistence.resolveVariant')(function* resolveVariant(target: SkuTarget) {
    if (target.kind === 'PACKAGE_OPTION') {
      // A selectable option requires a Current role/content proof, not merely a Definition FK.
      return yield* unavailable();
    }
    const [variant] = yield* transaction
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.variantId, target.variantId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (variant === undefined) {
      return null;
    }
    const [product] = yield* transaction
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, variant.productId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (product === undefined || product.lifecycleState !== 'ACTIVE' || variant.lifecycleState !== 'ACTIVE') {
      return yield* unavailable();
    }
    return variant;
  });
  const appendRevision = (
    input: SkuChangeInput,
    productId: string,
    revision: number,
    changeKind: string,
    now: Date,
    code = input.code,
    state = 'CURRENT',
  ) =>
    transaction.insert(commercialSkuAssignmentRevisions).values({
      actingPrincipalId: input.principalId,
      actionInvocationId: input.actionInvocationId,
      changeKind,
      displayCode: code,
      effectiveAt: now,
      evidenceRefs: [...input.evidenceRefs],
      normalizedCode: normalizeSku(code),
      packageDefinitionId: null,
      productId,
      reason: input.reason,
      revision,
      state,
      tenantId,
      variantId: input.target.kind === 'VARIANT' ? input.target.variantId : '',
    });

  const assign = Effect.fn('SkuPersistence.assign')(function* assign(input: SkuChangeInput) {
    if (!validSkuChangeInput(input, tenantId) || input.expectedRevision !== 0) {
      return { _tag: 'invalid', reason: 'Invalid SKU assignment or initial revision' } as const;
    }
    const variant = yield* resolveVariant(input.target);
    if (variant === null) {
      return { _tag: 'not_found' } as const;
    }
    const [priorInvocation] = yield* readAnyInvocation(input.actionInvocationId);
    if (priorInvocation !== undefined) {
      return priorInvocation.changeKind === 'ASSIGN' &&
        priorInvocation.normalizedCode === normalizeSku(input.code) &&
        priorInvocation.displayCode === input.code &&
        priorInvocation.variantId === variant.variantId &&
        priorInvocation.actingPrincipalId === input.principalId &&
        sameEvidence(priorInvocation, input)
        ? ({ _tag: 'applied', revision: priorInvocation.revision } as const)
        : ({ _tag: 'conflict' } as const);
    }
    const [existing] = yield* transaction
      .select()
      .from(commercialSkuReservations)
      .where(reservationWhere(normalizeSku(input.code)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (existing !== undefined) {
      return { _tag: 'conflict' } as const;
    }
    const now = DateTime.toDateUtc(yield* DateTime.now);
    const [inserted] = yield* transaction
      .insert(commercialSkuReservations)
      .values({
        currentRevision: 1,
        displayCode: input.code,
        normalizedCode: normalizeSku(input.code),
        packageDefinitionId: null,
        productId: variant.productId,
        state: 'CURRENT',
        tenantId,
        updatedAt: now,
        variantId: variant.variantId,
      })
      .onConflictDoNothing()
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (inserted === undefined) {
      return { _tag: 'conflict' } as const;
    }
    yield* appendRevision(input, variant.productId, 1, 'ASSIGN', now).pipe(Effect.mapError(unavailable));
    return { _tag: 'applied', revision: 1 } as const;
  });

  const correct = Effect.fn('SkuPersistence.correct')(function* correct(input: SkuCorrectionInput) {
    if (
      !validSkuChangeInput(input, tenantId) ||
      input.expectedRevision < 1 ||
      input.previousTarget.tenantId !== tenantId
    ) {
      return { _tag: 'invalid', reason: 'Invalid documented SKU correction' } as const;
    }
    if (input.target.kind === 'PACKAGE_OPTION' || input.previousTarget.kind === 'PACKAGE_OPTION') {
      return yield* unavailable();
    }
    const variant = yield* resolveVariant(input.target);
    if (variant === null) {
      return { _tag: 'not_found' } as const;
    }
    const [priorInvocation] = yield* readAnyInvocation(input.actionInvocationId);
    if (priorInvocation !== undefined) {
      return priorInvocation.changeKind === 'CORRECT' &&
        priorInvocation.normalizedCode === normalizeSku(input.code) &&
        priorInvocation.variantId === variant.variantId &&
        priorInvocation.actingPrincipalId === input.principalId &&
        sameEvidence(priorInvocation, input)
        ? ({ _tag: 'applied', revision: priorInvocation.revision } as const)
        : ({ _tag: 'conflict' } as const);
    }
    const [existing] = yield* transaction
      .select()
      .from(commercialSkuReservations)
      .where(reservationWhere(normalizeSku(input.code)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (existing === undefined) {
      return { _tag: 'not_found' } as const;
    }
    if (existing.currentRevision !== input.expectedRevision) {
      return { _tag: 'stale', actualRevision: existing.currentRevision } as const;
    }
    if (!sameTarget(existing, input.previousTarget) || existing.state !== 'CURRENT') {
      return { _tag: 'conflict' } as const;
    }
    if (sameTarget(existing, input.target)) {
      return { _tag: 'invalid', reason: 'Correction requires a different exact target' } as const;
    }
    const [targetCurrent] = yield* transaction
      .select({ normalizedCode: commercialSkuReservations.normalizedCode })
      .from(commercialSkuReservations)
      .where(
        and(
          eq(commercialSkuReservations.tenantId, tenantId),
          eq(commercialSkuReservations.variantId, variant.variantId),
          isNull(commercialSkuReservations.packageDefinitionId),
          eq(commercialSkuReservations.state, 'CURRENT'),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (targetCurrent !== undefined) {
      return { _tag: 'conflict' } as const;
    }
    const now = DateTime.toDateUtc(yield* DateTime.now);
    const [updated] = yield* transaction
      .update(commercialSkuReservations)
      .set({
        currentRevision: existing.currentRevision + 1,
        displayCode: input.code,
        productId: variant.productId,
        updatedAt: now,
        variantId: variant.variantId,
      })
      .where(
        and(
          reservationWhere(normalizeSku(input.code)),
          eq(commercialSkuReservations.currentRevision, input.expectedRevision),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      return { _tag: 'stale', actualRevision: existing.currentRevision } as const;
    }
    yield* appendRevision(input, variant.productId, updated.currentRevision, 'CORRECT', now).pipe(
      Effect.mapError(unavailable),
    );
    return { _tag: 'applied', revision: updated.currentRevision } as const;
  });

  /* oxlint-disable eslint/complexity -- One transaction coordinates two reservations, CAS, and two append-only revisions. expires: 2027-03-31. */
  const rename = Effect.fn('SkuPersistence.rename')(function* rename(input: SkuRenameInput) {
    const oldNormalized = normalizeSku(input.oldCode);
    const newNormalized = normalizeSku(input.code);
    if (
      !validSkuChangeInput(input, tenantId) ||
      input.expectedRevision < 1 ||
      oldNormalized.length === 0 ||
      oldNormalized === newNormalized
    ) {
      return { _tag: 'invalid', reason: 'Invalid SKU rename or unchanged comparison code' } as const;
    }
    const variant = yield* resolveVariant(input.target);
    if (variant === null) {
      return { _tag: 'not_found' } as const;
    }
    const [anyInvocation] = yield* readAnyInvocation(input.actionInvocationId);
    if (anyInvocation !== undefined) {
      const [[newRevision], [oldRevision]] = yield* Effect.all(
        [
          readInvocation(input.actionInvocationId, newNormalized),
          readInvocation(input.actionInvocationId, oldNormalized),
        ],
        { concurrency: 2 },
      );
      return newRevision?.changeKind === 'RENAME' &&
        oldRevision?.changeKind === 'RENAME' &&
        newRevision.displayCode === input.code &&
        oldRevision.normalizedCode === oldNormalized &&
        newRevision.variantId === variant.variantId &&
        oldRevision.variantId === variant.variantId &&
        newRevision.actingPrincipalId === input.principalId &&
        sameEvidence(newRevision, input) &&
        sameEvidence(oldRevision, input)
        ? ({ _tag: 'applied', revision: newRevision.revision } as const)
        : ({ _tag: 'conflict' } as const);
    }
    const [old] = yield* transaction
      .select()
      .from(commercialSkuReservations)
      .where(reservationWhere(oldNormalized))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (old === undefined) {
      return { _tag: 'not_found' } as const;
    }
    if (old.currentRevision !== input.expectedRevision) {
      return { _tag: 'stale', actualRevision: old.currentRevision } as const;
    }
    if (!sameTarget(old, input.target) || old.state !== 'CURRENT') {
      return { _tag: 'conflict' } as const;
    }
    const now = DateTime.toDateUtc(yield* DateTime.now);
    // Reserve the new code before changing the old one. A concurrent claimant
    // loses at the tenant-wide PK, leaving this transaction without partial changes.
    const [newReservation] = yield* transaction
      .insert(commercialSkuReservations)
      .values({
        currentRevision: 1,
        displayCode: input.code,
        normalizedCode: newNormalized,
        packageDefinitionId: null,
        productId: variant.productId,
        state: 'HISTORICAL',
        tenantId,
        updatedAt: now,
        variantId: variant.variantId,
      })
      .onConflictDoNothing()
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (newReservation === undefined) {
      return { _tag: 'conflict' } as const;
    }
    const [oldHistorical] = yield* transaction
      .update(commercialSkuReservations)
      .set({ currentRevision: old.currentRevision + 1, state: 'HISTORICAL', updatedAt: now })
      .where(
        and(reservationWhere(oldNormalized), eq(commercialSkuReservations.currentRevision, input.expectedRevision)),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (oldHistorical === undefined) {
      return yield* unavailable();
    }
    const [newCurrent] = yield* transaction
      .update(commercialSkuReservations)
      .set({ state: 'CURRENT', updatedAt: now })
      .where(reservationWhere(newNormalized))
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (newCurrent === undefined) {
      return yield* unavailable();
    }
    yield* appendRevision(
      input,
      variant.productId,
      oldHistorical.currentRevision,
      'RENAME',
      now,
      old.displayCode,
      'HISTORICAL',
    ).pipe(Effect.mapError(unavailable));
    yield* appendRevision(input, variant.productId, 1, 'RENAME', now).pipe(Effect.mapError(unavailable));
    return { _tag: 'applied', revision: 1 } as const;
  });
  /* oxlint-enable eslint/complexity */

  return { assign, correct, rename };
};
