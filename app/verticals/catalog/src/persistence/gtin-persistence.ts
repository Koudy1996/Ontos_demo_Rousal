import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';

import { assessGtinAssignment } from '../../shared/domain/commercial-code.ts';
import type { GtinTarget } from '../../shared/domain/commercial-code.ts';
import {
  commercialGtinAssignmentRevisions,
  commercialGtinAssignments,
  packageDefinitions,
  productVariants,
  products,
} from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class GtinPersistenceUnavailable extends Schema.TaggedError<GtinPersistenceUnavailable>()(
  'GtinPersistenceUnavailable',
  { code: Schema.Literal('gtin_persistence_unavailable'), reason: Schema.String },
) {}

export interface ConfirmGtinInput {
  readonly actionInvocationId: string;
  readonly attributionEvidenceRef: string;
  readonly code: string;
  readonly effectiveAt: Date;
  /** Zero means no assignment exists; later revisions permit only the same exact target. */
  readonly expectedRevision: number;
  readonly principalId: string;
  readonly reason: string;
  readonly target: GtinTarget;
}

const GtinPersistenceOutcomeSchema = Schema.Union([
  Schema.TaggedStruct('confirmed', { revision: Schema.Int }),
  Schema.TaggedStruct('invalid', { reason: Schema.String }),
  Schema.TaggedStruct('not_found', {}),
  Schema.TaggedStruct('stale', { actualRevision: Schema.Int }),
]);
export type GtinPersistenceOutcome = typeof GtinPersistenceOutcomeSchema.Type;

export interface GtinPersistence {
  readonly confirm: (input: ConfirmGtinInput) => Effect.Effect<GtinPersistenceOutcome, GtinPersistenceUnavailable>;
}

const unavailable = (cause?: unknown): GtinPersistenceUnavailable => {
  const failure = new GtinPersistenceUnavailable({
    code: 'gtin_persistence_unavailable',
    reason: 'Authoritative GTIN attribution or persistence is unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

const validText = (value: string): boolean => value.length > 0 && value.length <= 1000 && value === value.trim();

const inputProblem = (input: ConfirmGtinInput, tenantId: string): string | undefined => {
  const decision = assessGtinAssignment({ attribution: 'CONFIRMED', code: input.code, target: input.target });
  if (decision.status !== 'VALID') {
    return decision.reason;
  }
  if (
    input.target.tenantId !== tenantId ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !validText(input.attributionEvidenceRef) ||
    !validText(input.reason) ||
    input.actionInvocationId.length === 0 ||
    input.principalId.length === 0 ||
    Option.isNone(DateTime.make(input.effectiveAt))
  ) {
    return 'Invalid GTIN attribution evidence or scope';
  }
  return undefined;
};

const replayMatches = (
  prior: typeof commercialGtinAssignmentRevisions.$inferSelect,
  input: ConfirmGtinInput,
): boolean =>
  prior.gtin === input.code &&
  (input.target.kind !== 'VARIANT' || prior.variantId === input.target.variantId) &&
  prior.packageDefinitionId === (input.target.kind === 'PACKAGE_LEVEL' ? input.target.packageDefinitionId : null) &&
  prior.attributionEvidenceRef === input.attributionEvidenceRef &&
  prior.reason === input.reason &&
  DateTime.toEpochMillis(DateTime.makeUnsafe(prior.effectiveAt)) ===
    DateTime.toEpochMillis(DateTime.makeUnsafe(input.effectiveAt)) &&
  prior.actingPrincipalId === input.principalId &&
  prior.state === 'CONFIRMED';

/** Core owns the scoped transaction and rollback. This service never infers attribution from a code or name. */
export const gtinPersistenceForScope = (transaction: ScopedTransaction, scope: OperationalScope): GtinPersistence => {
  const { tenantId } = scope;
  const resolveTarget = Effect.fn('GtinPersistence.resolveTarget')(function* resolveTarget(target: GtinTarget) {
    const [pack] =
      target.kind === 'PACKAGE_LEVEL'
        ? yield* transaction
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
        : [undefined];
    const variantId = target.kind === 'VARIANT' ? target.variantId : pack?.variantId;
    if (variantId === undefined || (pack !== undefined && pack.lifecycleState !== 'ACTIVE')) {
      return null;
    }
    const variants = yield* transaction
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.variantId, variantId)))
      .for('update')
      .limit(2);
    const [variant] = variants;
    if (
      variants.length !== 1 ||
      variant === undefined ||
      (pack !== undefined && pack.productId !== variant.productId)
    ) {
      return null;
    }
    const [product] = yield* transaction
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.productId, variant.productId)))
      .for('update')
      .limit(1);
    if (variant.lifecycleState !== 'ACTIVE' || product?.lifecycleState !== 'ACTIVE') {
      return null;
    }
    return { packageDefinitionId: pack?.packageDefinitionId ?? null, productId: variant.productId, variantId };
  }, Effect.mapError(unavailable));

  const persist = Effect.fn('GtinPersistence.persist')(function* persist(
    input: ConfirmGtinInput,
    target: { readonly packageDefinitionId: string | null; readonly productId: string; readonly variantId: string },
    existing: typeof commercialGtinAssignments.$inferSelect | undefined,
  ) {
    const revision = (existing?.currentRevision ?? 0) + 1;
    if (existing === undefined) {
      yield* transaction
        .insert(commercialGtinAssignments)
        .values({
          currentRevision: revision,
          gtin: input.code,
          packageDefinitionId: target.packageDefinitionId,
          productId: target.productId,
          state: 'CONFIRMED',
          tenantId,
          variantId: target.variantId,
        })
        .pipe(Effect.mapError(unavailable));
    } else {
      const [updated] = yield* transaction
        .update(commercialGtinAssignments)
        .set({ currentRevision: revision, updatedAt: DateTime.toDateUtc(yield* DateTime.now) })
        .where(
          and(
            eq(commercialGtinAssignments.tenantId, tenantId),
            eq(commercialGtinAssignments.gtin, input.code),
            eq(commercialGtinAssignments.currentRevision, input.expectedRevision),
          ),
        )
        .returning()
        .pipe(Effect.mapError(unavailable));
      if (updated === undefined) {
        return { _tag: 'stale', actualRevision: existing.currentRevision } as const;
      }
    }
    yield* transaction
      .insert(commercialGtinAssignmentRevisions)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        attributionEvidenceRef: input.attributionEvidenceRef,
        effectiveAt: input.effectiveAt,
        gtin: input.code,
        packageDefinitionId: target.packageDefinitionId,
        productId: target.productId,
        reason: input.reason,
        revision,
        state: 'CONFIRMED',
        tenantId,
        variantId: target.variantId,
      })
      .pipe(Effect.mapError(unavailable));
    return { _tag: 'confirmed', revision } as const;
  });
  const confirm: GtinPersistence['confirm'] = Effect.fn('GtinPersistence.confirm')(function* confirm(input) {
    const problem = inputProblem(input, tenantId);
    if (problem !== undefined) {
      return { _tag: 'invalid', reason: problem };
    }
    const [priorInvocation] = yield* transaction
      .select()
      .from(commercialGtinAssignmentRevisions)
      .where(
        and(
          eq(commercialGtinAssignmentRevisions.tenantId, tenantId),
          eq(commercialGtinAssignmentRevisions.actionInvocationId, input.actionInvocationId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (priorInvocation !== undefined) {
      if (!replayMatches(priorInvocation, input)) {
        return { _tag: 'invalid', reason: 'Action invocation already records different GTIN evidence' };
      }
      return { _tag: 'confirmed', revision: priorInvocation.revision };
    }
    const [existing] = yield* transaction
      .select()
      .from(commercialGtinAssignments)
      .where(and(eq(commercialGtinAssignments.tenantId, tenantId), eq(commercialGtinAssignments.gtin, input.code)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (existing === undefined && input.expectedRevision !== 0) {
      return { _tag: 'not_found' };
    }
    if (existing !== undefined && existing.currentRevision !== input.expectedRevision) {
      return { _tag: 'stale', actualRevision: existing.currentRevision };
    }
    if (existing?.state === 'RETIRED' || existing?.state === 'UNRESOLVED') {
      return { _tag: 'invalid', reason: 'A retired or unresolved GTIN cannot be silently reassigned' };
    }
    const target = yield* resolveTarget(input.target);
    if (target === null) {
      return { _tag: 'invalid', reason: 'Exact Current GTIN target is unavailable' };
    }
    if (
      existing !== undefined &&
      (existing.productId !== target.productId ||
        existing.variantId !== target.variantId ||
        existing.packageDefinitionId !== target.packageDefinitionId)
    ) {
      return { _tag: 'invalid', reason: 'GTIN is retained for a different exact target' };
    }
    return yield* persist(input, target, existing);
  });
  return { confirm };
};
