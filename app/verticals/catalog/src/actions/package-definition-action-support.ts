import type { ActionHandlerContext } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Match, Option, Schema } from 'effect';

import { PackageDefinitionActionError } from '../../shared/actions/package-definition-contract.ts';
import { resolvePackageContent } from '../../shared/domain/package-content.ts';
import type { PackageContentRevision } from '../../shared/domain/package-content.ts';
import { CatalogSelectionRevisionSchema } from '../../shared/domain/catalog-selection-evidence.ts';
import type { CatalogSelectionRevision } from '../../shared/domain/catalog-selection-evidence.ts';
import {
  packageContentRevisions,
  packageDefinitions,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
  setCompositionRevisions,
  setCompositions,
} from '../database/schema.ts';
import type {
  PackageContentBasis,
  PackageMutationOutcome,
  PackagePersistence,
} from '../persistence/package-persistence.ts';
import { packagePersistenceForScope, PackagePersistenceUnavailable } from '../persistence/package-persistence.ts';

type ScopedTransaction = Parameters<typeof packagePersistenceForScope>[0];
const packageType = 'commerce.catalog.package-definition';
const moduleId = 'commerce.catalog';
const productUnitType = 'commerce.catalog.product-unit';
const setCompositionType = 'commerce.catalog.set-composition';
const unavailable = (cause?: unknown) => {
  const failure = new PackagePersistenceUnavailable({
    code: 'package_persistence_unavailable',
    reason: 'Authoritative Package Definition basis is unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

type Content = Parameters<PackageContentBasis['verify']>[0]['content'];
const hasIncompleteSetReference = (row: typeof packageContentRevisions.$inferSelect): boolean =>
  (row.setCompositionResourceId === null) !== (row.setCompositionRevision === null);

const setCompositionFromRow = Effect.fn('PackageContentBasis.setCompositionFromRow')(function* decodeSetComposition(
  row: typeof packageContentRevisions.$inferSelect,
  tenantId: string,
) {
  if (row.setCompositionResourceId === null || row.setCompositionRevision === null) {
    return Option.none();
  }
  return Option.some(
    yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
      resourceRef: { moduleId, resourceId: row.setCompositionResourceId, resourceType: setCompositionType, tenantId },
      revision: row.setCompositionRevision,
    }),
  );
});
/** Supplied by the Set owner only when component selections have authoritative Current proof in this transaction. */
export interface CurrentSetCompositionBasis {
  readonly verifyComponents: (input: {
    readonly composition: CatalogSelectionRevision;
    readonly productId: string;
    readonly tenantId: string;
    readonly transaction: ScopedTransaction;
    readonly variantId: string;
  }) => Effect.Effect<boolean, PackagePersistenceUnavailable>;
}

const currentSetComposition = Effect.fn('PackageContentBasis.currentSetComposition')(
  function* currentSetCompositionRows(
    transaction: ScopedTransaction,
    content: Pick<Content, 'form' | 'setComposition'>,
    tenantId: string,
    basis: CurrentSetCompositionBasis | undefined,
  ) {
    const composition = content.setComposition;
    if (composition === undefined) {
      return true;
    }
    const { resourceRef, revision } = composition;
    if (
      basis === undefined ||
      resourceRef.moduleId !== moduleId ||
      resourceRef.resourceType !== setCompositionType ||
      resourceRef.tenantId !== tenantId ||
      composition.revisionId !== undefined
    ) {
      return false;
    }
    const productId = content.form.productRef.resourceId;
    const variantId = content.form.variantRef.resourceId;
    const [current] = yield* transaction
      .select()
      .from(setCompositions)
      .where(
        and(
          eq(setCompositions.tenantId, tenantId),
          eq(setCompositions.compositionId, resourceRef.resourceId),
          eq(setCompositions.productId, productId),
          eq(setCompositions.variantId, variantId),
        ),
      )
      .for('update')
      .limit(1);
    if (current === undefined || current.currentRevision !== revision) {
      return false;
    }
    const [issued] = yield* transaction
      .select()
      .from(setCompositionRevisions)
      .where(
        and(
          eq(setCompositionRevisions.tenantId, tenantId),
          eq(setCompositionRevisions.compositionId, resourceRef.resourceId),
          eq(setCompositionRevisions.productId, productId),
          eq(setCompositionRevisions.variantId, variantId),
          eq(setCompositionRevisions.revision, revision),
        ),
      )
      .for('update')
      .limit(1);
    const now = DateTime.toDateUtc(yield* DateTime.now);
    if (
      issued === undefined ||
      issued.lifecycleState !== 'ACTIVE' ||
      issued.effectiveFrom > now ||
      (issued.effectiveTo !== null && issued.effectiveTo <= now)
    ) {
      return false;
    }
    return yield* basis.verifyComponents({ composition, productId, tenantId, transaction, variantId });
  },
  Effect.mapError(unavailable),
);
const currentSubject = Effect.fn('PackageContentBasis.currentSubject')(function* currentSubjectRows(
  transaction: ScopedTransaction,
  content: Content,
  tenantId: string,
) {
  const productId = content.form.productRef.resourceId;
  const variantId = content.form.variantRef.resourceId;
  const unitId = content.unitRef.resourceId;
  const [product] = yield* transaction
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.productId, productId)))
    .for('update')
    .limit(1);
  if (product === undefined || product.lifecycleState === 'RETIRED') {
    return false;
  }
  const [variant] = yield* transaction
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.productId, productId),
        eq(productVariants.variantId, variantId),
      ),
    )
    .for('update')
    .limit(1);
  if (variant === undefined || variant.lifecycleState === 'RETIRED') {
    return false;
  }
  const [unit] = yield* transaction
    .select()
    .from(productUnits)
    .where(and(eq(productUnits.tenantId, tenantId), eq(productUnits.unitId, unitId)))
    .for('update')
    .limit(1);
  if (unit === undefined || unit.lifecycleState !== 'ACTIVE') {
    return false;
  }
  const [rule] = yield* transaction
    .select()
    .from(productUnitRuleRevisions)
    .where(
      and(
        eq(productUnitRuleRevisions.tenantId, tenantId),
        eq(productUnitRuleRevisions.unitId, unitId),
        eq(productUnitRuleRevisions.revision, unit.currentRuleRevision),
      ),
    )
    .for('update')
    .limit(1);
  return rule !== undefined && rule.lifecycleState === 'ACTIVE';
});

const loadLower: (
  transaction: ScopedTransaction,
  content: Content,
  tenantId: string,
  lower: CatalogSelectionRevision,
  seen: ReadonlySet<string>,
  setBasis: CurrentSetCompositionBasis | undefined,
) => Effect.Effect<Option.Option<readonly PackageContentRevision[]>, PackagePersistenceUnavailable> = Effect.fn(
  'PackageContentBasis.loadLower',
)(function* loadLowerRows(
  transaction: ScopedTransaction,
  content: Content,
  tenantId: string,
  lower: CatalogSelectionRevision,
  seen: ReadonlySet<string>,
  setBasis: CurrentSetCompositionBasis | undefined,
) {
  const lowerId = lower.resourceRef.resourceId;
  if (lower.resourceRef.tenantId !== tenantId || lower.resourceRef.resourceType !== packageType || seen.has(lowerId)) {
    return Option.none();
  }
  const [definition] = yield* transaction
    .select()
    .from(packageDefinitions)
    .where(and(eq(packageDefinitions.tenantId, tenantId), eq(packageDefinitions.packageDefinitionId, lowerId)))
    .for('update')
    .limit(1);
  if (
    definition === undefined ||
    definition.productId !== content.form.productRef.resourceId ||
    definition.variantId !== content.form.variantRef.resourceId
  ) {
    return Option.none();
  }
  const [row] = yield* transaction
    .select()
    .from(packageContentRevisions)
    .where(
      and(
        eq(packageContentRevisions.tenantId, tenantId),
        eq(packageContentRevisions.packageDefinitionId, lowerId),
        eq(packageContentRevisions.revision, lower.revision),
      ),
    )
    .for('update')
    .limit(1);
  if (
    row === undefined ||
    row.productId !== definition.productId ||
    row.variantId !== definition.variantId ||
    hasIncompleteSetReference(row)
  ) {
    return Option.none();
  }
  const next =
    row.lowerPackageDefinitionId === null || row.lowerRevision === null || row.lowerCount === null
      ? undefined
      : {
          count: row.lowerCount,
          revision: yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
            resourceRef: { moduleId, resourceId: row.lowerPackageDefinitionId, resourceType: packageType, tenantId },
            revision: row.lowerRevision,
          }),
        };
  const base = {
    amount: row.amount,
    form: content.form,
    reference: yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)(lower),
    unitRef: { moduleId, resourceId: row.unitResourceId, resourceType: row.unitResourceType, tenantId } as const,
  };
  const configured = row.configurationKey === null ? base : { ...base, configurationKey: row.configurationKey };
  const setComposition = yield* setCompositionFromRow(row, tenantId);
  const withSet = Option.isNone(setComposition) ? configured : { ...configured, setComposition: setComposition.value };
  const revision: PackageContentRevision = next === undefined ? withSet : { ...withSet, lower: next };
  if (!(yield* currentSetComposition(transaction, revision, tenantId, setBasis))) {
    return Option.none();
  }
  if (next === undefined) {
    return Option.some([revision]);
  }
  const tail = yield* loadLower(transaction, content, tenantId, next.revision, new Set([...seen, lowerId]), setBasis);
  return Option.isNone(tail) ? Option.none() : Option.some([revision, ...tail.value]);
}, Effect.mapError(unavailable));

/** All reads share Core's transaction and carry the trusted Tenant predicate. */
export const packageContentBasisForTransaction = (
  transaction: ScopedTransaction,
  trustedTenantId: string,
  setBasis?: CurrentSetCompositionBasis,
): PackageContentBasis => ({
  verify: Effect.fn('PackageContentBasis.verify')(function* verify({ content, definitionId, tenantId }) {
    if (
      tenantId !== trustedTenantId ||
      content.form.productRef.tenantId !== tenantId ||
      content.form.variantRef.tenantId !== tenantId ||
      content.unitRef.tenantId !== tenantId ||
      content.unitRef.resourceType !== productUnitType
    ) {
      return false;
    }
    if (!(yield* currentSubject(transaction, content, tenantId))) {
      return false;
    }
    if (!(yield* currentSetComposition(transaction, content, tenantId, setBasis))) {
      return false;
    }
    if (content.lower === undefined) {
      return true;
    }
    const revisions = yield* loadLower(
      transaction,
      content,
      tenantId,
      content.lower.revision,
      new Set([definitionId]),
      setBasis,
    );
    if (Option.isNone(revisions)) {
      return false;
    }
    const base = {
      amount: content.amount,
      form: content.form,
      lower: content.lower,
      reference: yield* Schema.decodeEffect(CatalogSelectionRevisionSchema)({
        resourceRef: { moduleId, resourceId: definitionId, resourceType: packageType, tenantId },
        revision: 1,
      }),
      unitRef: content.unitRef,
    };
    const withConfiguration =
      content.configurationKey === undefined ? base : { ...base, configurationKey: content.configurationKey };
    const proposed: PackageContentRevision =
      content.setComposition === undefined
        ? withConfiguration
        : { ...withConfiguration, setComposition: content.setComposition };
    return resolvePackageContent(proposed.reference, [proposed, ...revisions.value], '1').status === 'VALID';
  }, Effect.mapError(unavailable)),
});

export const packageDefinitionPersistenceServiceFactory = (
  transaction: ScopedTransaction,
  scope: Parameters<typeof packagePersistenceForScope>[1],
) =>
  Effect.succeed(
    packagePersistenceForScope(transaction, scope, packageContentBasisForTransaction(transaction, scope.tenantId)),
  );

export const packageDefinitionUnavailable = () =>
  new PackageDefinitionActionError({
    code: 'package_definition_unavailable',
    reason: 'Authoritative Package Definition persistence or Current basis is unavailable',
  });

export const mapPackagePersistenceError = () => packageDefinitionUnavailable();

export const recordPackageDefinitionAccess = (
  context: ActionHandlerContext<Readonly<Record<string, never>>, PackagePersistence>,
  definitionId: string,
) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: `catalog-package-definition:${definitionId}`,
    resultCount: 1,
    servingModuleKey: moduleId,
    targetModuleKey: moduleId,
    targetResourceId: definitionId,
    targetResourceType: 'commerce.catalog.package-definition',
  });

export const resolvePackageMutation = (outcome: PackageMutationOutcome) =>
  Match.value(outcome).pipe(
    Match.tags({
      created: ({ contentRevision, definitionRef }) => Effect.succeed({ contentRevision, definitionRef }),
      retired: ({ contentRevision, definitionRef }) => Effect.succeed({ contentRevision, definitionRef }),
      revised: ({ contentRevision, definitionRef }) => Effect.succeed({ contentRevision, definitionRef }),
    }),
    Match.tag('stale', () =>
      Effect.fail(
        new PackageDefinitionActionError({
          code: 'package_definition_stale',
          reason: 'Package Definition Current revision changed',
        }),
      ),
    ),
    Match.tag('invalid', ({ reason }) =>
      Effect.fail(new PackageDefinitionActionError({ code: 'package_definition_invalid', reason })),
    ),
    Match.tag('not_found', () =>
      Effect.fail(
        new PackageDefinitionActionError({
          code: 'package_definition_invalid',
          reason: 'Package Definition was not found in the trusted Tenant',
        }),
      ),
    ),
    Match.exhaustive,
  );
