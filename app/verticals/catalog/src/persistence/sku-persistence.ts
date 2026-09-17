import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq, isNull } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import { normalizeSku } from '../../shared/domain/commercial-code.ts';
import type { SkuTarget } from '../../shared/domain/commercial-code.ts';
import {
  commercialSkuAssignmentRevisions,
  commercialSkuReservations,
  packageContentRevisions,
  packageDefinitions,
  packageOptionRoleRevisions,
  productVariants,
  productUnits,
  products,
} from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
interface ResolvedTarget {
  readonly packageDefinitionId: string | null;
  readonly productId: string;
  readonly variantId: string;
}

export interface SkuCurrentOptionSnapshot {
  readonly content: Pick<
    typeof packageContentRevisions.$inferSelect,
    'effectiveAt' | 'lifecycleState' | 'productId' | 'unitResourceType' | 'variantId'
  >;
  readonly contentRevision: number;
  readonly definition: Pick<
    typeof packageDefinitions.$inferSelect,
    'currentOptionRevision' | 'currentRevision' | 'lifecycleState' | 'optionState' | 'productId' | 'variantId'
  >;
  readonly now: Date;
  readonly productLifecycle: string;
  readonly role: Pick<
    typeof packageOptionRoleRevisions.$inferSelect,
    | 'contentRevision'
    | 'effectiveAt'
    | 'independentlyRequested'
    | 'looseUnitsSubstitutable'
    | 'productId'
    | 'revision'
    | 'state'
    | 'variantId'
  >;
  readonly unitLifecycle: string;
  readonly variantLifecycle: string;
}

/* oxlint-disable eslint/complexity -- Exact Current proof requires each independent revision, lifecycle, and business-role invariant. expires: 2027-03-31. */
export const currentPackageOptionSnapshotMatches = (snapshot: SkuCurrentOptionSnapshot): boolean => {
  const { content, definition, now, role } = snapshot;
  return (
    definition.lifecycleState === 'ACTIVE' &&
    definition.optionState === 'ACTIVE' &&
    definition.currentRevision > 0 &&
    definition.currentOptionRevision > 0 &&
    content.lifecycleState === 'ACTIVE' &&
    snapshot.contentRevision === definition.currentRevision &&
    content.productId === definition.productId &&
    content.variantId === definition.variantId &&
    content.unitResourceType === 'commerce.catalog.product-unit' &&
    role.state === 'ACTIVE' &&
    role.revision === definition.currentOptionRevision &&
    role.contentRevision === definition.currentRevision &&
    role.productId === definition.productId &&
    role.variantId === definition.variantId &&
    role.independentlyRequested &&
    !role.looseUnitsSubstitutable &&
    snapshot.productLifecycle === 'ACTIVE' &&
    snapshot.variantLifecycle === 'ACTIVE' &&
    snapshot.unitLifecycle === 'ACTIVE' &&
    content.effectiveAt.getTime() <= now.getTime() &&
    role.effectiveAt.getTime() <= now.getTime()
  );
};
/* oxlint-enable eslint/complexity */

/** This owner attests the pinned Option role/content remains a valid Current selection basis. */
export interface SkuPackageOptionBasis {
  readonly verify: (input: {
    readonly contentRevision: number;
    readonly optionRevision: number;
    readonly packageDefinitionId: string;
    readonly productId: string;
    readonly tenantId: string;
    readonly variantId: string;
  }) => Effect.Effect<boolean, SkuPersistenceUnavailable>;
}

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
  target.kind === 'VARIANT'
    ? row.variantId === target.variantId && row.packageDefinitionId === null
    : row.packageDefinitionId === target.packageDefinitionId;

/** Core owns the transaction and permissions. This owner service cannot open or commit one. */
export const skuPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  packageOptionBasis?: SkuPackageOptionBasis,
) => {
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
  const resolveTarget = Effect.fn('SkuPersistence.resolveTarget')(function* resolveTarget(target: SkuTarget) {
    if (target.kind === 'PACKAGE_OPTION') {
      const [definition] = yield* transaction
        .select()
        .from(packageDefinitions)
        .where(
          and(
            eq(packageDefinitions.tenantId, tenantId),
            eq(packageDefinitions.packageDefinitionId, target.packageDefinitionId),
          ),
        )
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (definition === undefined) {
        return null;
      }
      if (packageOptionBasis === undefined) {
        return yield* unavailable();
      }
      const [[content], [role], [variant], [product]] = yield* Effect.all(
        [
          transaction
            .select()
            .from(packageContentRevisions)
            .where(
              and(
                eq(packageContentRevisions.tenantId, tenantId),
                eq(packageContentRevisions.packageDefinitionId, definition.packageDefinitionId),
                eq(packageContentRevisions.revision, definition.currentRevision),
              ),
            )
            .for('update')
            .limit(1),
          transaction
            .select()
            .from(packageOptionRoleRevisions)
            .where(
              and(
                eq(packageOptionRoleRevisions.tenantId, tenantId),
                eq(packageOptionRoleRevisions.packageDefinitionId, definition.packageDefinitionId),
                eq(packageOptionRoleRevisions.revision, definition.currentOptionRevision),
              ),
            )
            .for('update')
            .limit(1),
          transaction
            .select()
            .from(productVariants)
            .where(
              and(
                eq(productVariants.tenantId, tenantId),
                eq(productVariants.productId, definition.productId),
                eq(productVariants.variantId, definition.variantId),
              ),
            )
            .for('update')
            .limit(1),
          transaction
            .select()
            .from(products)
            .where(and(eq(products.tenantId, tenantId), eq(products.productId, definition.productId)))
            .for('update')
            .limit(1),
        ] as const,
        { concurrency: 1 },
      ).pipe(Effect.mapError(unavailable));
      if (content === undefined || role === undefined || variant === undefined || product === undefined) {
        return yield* unavailable();
      }
      const [unit] = yield* transaction
        .select()
        .from(productUnits)
        .where(and(eq(productUnits.tenantId, tenantId), eq(productUnits.unitId, content.unitResourceId)))
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (unit === undefined) {
        return yield* unavailable();
      }
      const now = DateTime.toDateUtc(yield* DateTime.now);
      if (
        !currentPackageOptionSnapshotMatches({
          content,
          contentRevision: content.revision,
          definition,
          now,
          productLifecycle: product.lifecycleState,
          role,
          unitLifecycle: unit.lifecycleState,
          variantLifecycle: variant.lifecycleState,
        }) ||
        !(yield* packageOptionBasis.verify({
          contentRevision: definition.currentRevision,
          optionRevision: definition.currentOptionRevision,
          packageDefinitionId: definition.packageDefinitionId,
          productId: definition.productId,
          tenantId,
          variantId: definition.variantId,
        }))
      ) {
        return yield* unavailable();
      }
      return {
        packageDefinitionId: definition.packageDefinitionId,
        productId: definition.productId,
        variantId: definition.variantId,
      } satisfies ResolvedTarget;
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
    return {
      packageDefinitionId: null,
      productId: variant.productId,
      variantId: variant.variantId,
    } satisfies ResolvedTarget;
  });
  const appendRevision = (
    input: SkuChangeInput,
    target: ResolvedTarget,
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
      packageDefinitionId: target.packageDefinitionId,
      productId: target.productId,
      reason: input.reason,
      revision,
      state,
      tenantId,
      variantId: target.variantId,
    });

  const assign = Effect.fn('SkuPersistence.assign')(function* assign(input: SkuChangeInput) {
    if (!validSkuChangeInput(input, tenantId) || input.expectedRevision !== 0) {
      return { _tag: 'invalid', reason: 'Invalid SKU assignment or initial revision' } as const;
    }
    const target = yield* resolveTarget(input.target);
    if (target === null) {
      return { _tag: 'not_found' } as const;
    }
    const [priorInvocation] = yield* readAnyInvocation(input.actionInvocationId);
    if (priorInvocation !== undefined) {
      return priorInvocation.changeKind === 'ASSIGN' &&
        priorInvocation.normalizedCode === normalizeSku(input.code) &&
        priorInvocation.displayCode === input.code &&
        priorInvocation.variantId === target.variantId &&
        priorInvocation.packageDefinitionId === target.packageDefinitionId &&
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
        packageDefinitionId: target.packageDefinitionId,
        productId: target.productId,
        state: 'CURRENT',
        tenantId,
        updatedAt: now,
        variantId: target.variantId,
      })
      .onConflictDoNothing()
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (inserted === undefined) {
      return { _tag: 'conflict' } as const;
    }
    yield* appendRevision(input, target, 1, 'ASSIGN', now).pipe(Effect.mapError(unavailable));
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
    const target = yield* resolveTarget(input.target);
    if (target === null) {
      return { _tag: 'not_found' } as const;
    }
    const [priorInvocation] = yield* readAnyInvocation(input.actionInvocationId);
    if (priorInvocation !== undefined) {
      return priorInvocation.changeKind === 'CORRECT' &&
        priorInvocation.normalizedCode === normalizeSku(input.code) &&
        priorInvocation.variantId === target.variantId &&
        priorInvocation.packageDefinitionId === target.packageDefinitionId &&
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
          ...(target.packageDefinitionId === null
            ? [
                eq(commercialSkuReservations.variantId, target.variantId),
                isNull(commercialSkuReservations.packageDefinitionId),
              ]
            : [eq(commercialSkuReservations.packageDefinitionId, target.packageDefinitionId)]),
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
        packageDefinitionId: target.packageDefinitionId,
        productId: target.productId,
        updatedAt: now,
        variantId: target.variantId,
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
    yield* appendRevision(input, target, updated.currentRevision, 'CORRECT', now).pipe(Effect.mapError(unavailable));
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
    const target = yield* resolveTarget(input.target);
    if (target === null) {
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
        newRevision.variantId === target.variantId &&
        oldRevision.variantId === target.variantId &&
        newRevision.packageDefinitionId === target.packageDefinitionId &&
        oldRevision.packageDefinitionId === target.packageDefinitionId &&
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
        packageDefinitionId: target.packageDefinitionId,
        productId: target.productId,
        state: 'HISTORICAL',
        tenantId,
        updatedAt: now,
        variantId: target.variantId,
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
      target,
      oldHistorical.currentRevision,
      'RENAME',
      now,
      old.displayCode,
      'HISTORICAL',
    ).pipe(Effect.mapError(unavailable));
    yield* appendRevision(input, target, 1, 'RENAME', now).pipe(Effect.mapError(unavailable));
    return { _tag: 'applied', revision: 1 } as const;
  });
  /* oxlint-enable eslint/complexity */

  return { assign, correct, rename };
};
