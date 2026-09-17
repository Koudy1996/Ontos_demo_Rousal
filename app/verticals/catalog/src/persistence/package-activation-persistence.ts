import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Schema } from 'effect';

import { PackageDefinitionContentInputSchema } from '../../shared/actions/package-definition-contract.ts';
import { packageContentRevisions, packageDefinitions, productVariants, products } from '../database/schema.ts';
import type { PackageContentBasis } from './package-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class PackageActivationUnavailable extends Schema.TaggedError<PackageActivationUnavailable>()(
  'PackageActivationUnavailable',
  { code: Schema.Literal('package_activation_unavailable'), reason: Schema.String },
) {}

/** An owner-issued proof that this transition preserves every already-issued selection. */
export interface PackageActivationSelectionImpact {
  readonly verify: (input: {
    readonly packageDefinitionId: string;
    readonly revision: number;
    readonly tenantId: string;
  }) => Effect.Effect<boolean, PackageActivationUnavailable>;
}

export interface PackageActivationInput {
  readonly actionInvocationId: string;
  readonly evidenceRefs: readonly string[];
  readonly expectedRevision: number;
  readonly packageDefinitionId: string;
  readonly principalId: string;
  readonly reason: string;
}

export type PackageActivationOutcome =
  | { readonly _tag: 'activated'; readonly revision: number }
  | { readonly _tag: 'invalid'; readonly reason: string }
  | { readonly _tag: 'not_found' }
  | { readonly _tag: 'stale'; readonly actualRevision: number };

const unavailable = (cause?: unknown): PackageActivationUnavailable => {
  const failure = new PackageActivationUnavailable({
    code: 'package_activation_unavailable',
    reason: 'Authoritative Package activation basis or persistence is unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

const validEvidence = (input: PackageActivationInput): boolean =>
  input.actionInvocationId.length > 0 &&
  input.principalId.length > 0 &&
  Number.isSafeInteger(input.expectedRevision) &&
  input.expectedRevision > 0 &&
  input.reason.length > 0 &&
  input.reason.length <= 1000 &&
  input.reason === input.reason.trim() &&
  input.evidenceRefs.length > 0 &&
  input.evidenceRefs.every((ref) => ref.length > 0 && ref.length <= 300 && ref === ref.trim());

/** Core supplies the scoped transaction; this service never opens or commits one. */
export const packageActivationPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  contentBasis?: PackageContentBasis,
  selectionImpact?: PackageActivationSelectionImpact,
) => ({
  activate: Effect.fn('PackageActivationPersistence.activate')(function* activate(input: PackageActivationInput) {
    const { tenantId } = scope;
    if (!validEvidence(input)) {
      return { _tag: 'invalid', reason: 'Invalid Package activation evidence or revision' } as const;
    }
    const [definition] = yield* transaction
      .select()
      .from(packageDefinitions)
      .where(
        and(
          eq(packageDefinitions.tenantId, tenantId),
          eq(packageDefinitions.packageDefinitionId, input.packageDefinitionId),
        ),
      )
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (definition === undefined) {
      return { _tag: 'not_found' } as const;
    }
    if (definition.currentRevision !== input.expectedRevision) {
      return { _tag: 'stale', actualRevision: definition.currentRevision } as const;
    }
    if (definition.lifecycleState !== 'DRAFT' || definition.optionState !== 'NOT_SELECTABLE') {
      return { _tag: 'invalid', reason: 'Only a non-selectable Draft Package Definition can activate' } as const;
    }
    if (contentBasis === undefined || selectionImpact === undefined) {
      return yield* unavailable();
    }
    const [content] = yield* transaction
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
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      content === undefined ||
      content.lifecycleState !== 'DRAFT' ||
      content.productId !== definition.productId ||
      content.variantId !== definition.variantId ||
      content.unitResourceType !== 'commerce.catalog.product-unit' ||
      (content.lowerPackageDefinitionId === null) !== (content.lowerRevision === null) ||
      (content.lowerPackageDefinitionId === null) !== (content.lowerCount === null)
    ) {
      return yield* unavailable();
    }
    const seen = new Set([definition.packageDefinitionId]);
    let lowerId = content.lowerPackageDefinitionId;
    let lowerRevision = content.lowerRevision;
    while (lowerId !== null && lowerRevision !== null) {
      if (seen.has(lowerId)) {
        return { _tag: 'invalid', reason: 'Package content has a lower-level cycle' } as const;
      }
      seen.add(lowerId);
      const [lowerDefinition] = yield* transaction
        .select()
        .from(packageDefinitions)
        .where(and(eq(packageDefinitions.tenantId, tenantId), eq(packageDefinitions.packageDefinitionId, lowerId)))
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      const [lowerContent] = yield* transaction
        .select()
        .from(packageContentRevisions)
        .where(
          and(
            eq(packageContentRevisions.tenantId, tenantId),
            eq(packageContentRevisions.packageDefinitionId, lowerId),
            eq(packageContentRevisions.revision, lowerRevision),
          ),
        )
        .for('update')
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (
        lowerDefinition?.lifecycleState !== 'ACTIVE' ||
        lowerContent?.lifecycleState !== 'ACTIVE' ||
        lowerDefinition.productId !== definition.productId ||
        lowerDefinition.variantId !== definition.variantId ||
        lowerContent.productId !== definition.productId ||
        lowerContent.variantId !== definition.variantId
      ) {
        return { _tag: 'invalid', reason: 'Pinned lower content must be Current, active, and homogeneous' } as const;
      }
      lowerId = lowerContent.lowerPackageDefinitionId;
      lowerRevision = lowerContent.lowerRevision;
    }
    const [[product], [variant]] = yield* Effect.all(
      [
        transaction
          .select()
          .from(products)
          .where(and(eq(products.tenantId, tenantId), eq(products.productId, definition.productId)))
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
      ] as const,
      { concurrency: 1 },
    ).pipe(Effect.mapError(unavailable));
    if (product?.lifecycleState !== 'ACTIVE' || variant?.lifecycleState !== 'ACTIVE') {
      return { _tag: 'invalid', reason: 'Product and Variant must both be Current and active' } as const;
    }
    const ref = (resourceType: string, resourceId: string) => ({
      moduleId: 'commerce.catalog',
      resourceId,
      resourceType: `commerce.catalog.${resourceType}`,
      tenantId,
    });
    const candidate = yield* Schema.decodeUnknownEffect(PackageDefinitionContentInputSchema)({
      amount: content.amount,
      ...(content.configurationKey === null ? {} : { configurationKey: content.configurationKey }),
      effectiveAt: content.effectiveAt.toISOString(),
      form: { productRef: ref('product', definition.productId), variantRef: ref('variant', definition.variantId) },
      ...(content.lowerPackageDefinitionId === null
        ? {}
        : {
            lower: {
              count: content.lowerCount,
              revision: {
                resourceRef: ref('package-definition', content.lowerPackageDefinitionId),
                revision: content.lowerRevision,
              },
            },
          }),
      ...(content.setCompositionResourceId === null
        ? {}
        : {
            setComposition: {
              resourceRef: ref('set-composition', content.setCompositionResourceId),
              revision: content.setCompositionRevision,
            },
          }),
      unitRef: ref('product-unit', content.unitResourceId),
    }).pipe(Effect.mapError(unavailable));
    if (
      !(yield* contentBasis
        .verify({ content: candidate, definitionId: definition.packageDefinitionId, tenantId })
        .pipe(Effect.mapError(unavailable)))
    ) {
      return { _tag: 'invalid', reason: 'Current Package content or Unit basis is invalid' } as const;
    }
    if (
      !(yield* selectionImpact.verify({
        packageDefinitionId: definition.packageDefinitionId,
        revision: definition.currentRevision,
        tenantId,
      }))
    ) {
      return { _tag: 'invalid', reason: 'Issued selection impact is not proven safe' } as const;
    }
    const now = DateTime.toDateUtc(yield* DateTime.now);
    if (now.getTime() <= content.effectiveAt.getTime()) {
      return { _tag: 'invalid', reason: 'Draft content is not yet effective' } as const;
    }
    const [updated] = yield* transaction
      .update(packageDefinitions)
      .set({ currentRevision: definition.currentRevision + 1, lifecycleState: 'ACTIVE', updatedAt: now })
      .where(
        and(
          eq(packageDefinitions.tenantId, tenantId),
          eq(packageDefinitions.packageDefinitionId, definition.packageDefinitionId),
          eq(packageDefinitions.currentRevision, definition.currentRevision),
          eq(packageDefinitions.lifecycleState, 'DRAFT'),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) {
      return { _tag: 'stale', actualRevision: definition.currentRevision } as const;
    }
    yield* transaction
      .insert(packageContentRevisions)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        amount: content.amount,
        configurationKey: content.configurationKey,
        effectiveAt: now,
        evidenceRefs: [...input.evidenceRefs],
        lifecycleState: 'ACTIVE',
        lowerCount: content.lowerCount,
        lowerPackageDefinitionId: content.lowerPackageDefinitionId,
        lowerRevision: content.lowerRevision,
        packageDefinitionId: definition.packageDefinitionId,
        productId: definition.productId,
        reason: input.reason,
        revision: updated.currentRevision,
        setCompositionResourceId: content.setCompositionResourceId,
        setCompositionRevision: content.setCompositionRevision,
        tenantId,
        unitResourceId: content.unitResourceId,
        unitResourceType: content.unitResourceType,
        variantId: definition.variantId,
      })
      .pipe(Effect.mapError(unavailable));
    return { _tag: 'activated', revision: updated.currentRevision } as const;
  }),
});
