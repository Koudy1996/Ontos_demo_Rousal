import type { ActionHandlerContext } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Match, Option, Schema } from 'effect';

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
) => Effect.Effect<Option.Option<readonly PackageContentRevision[]>, PackagePersistenceUnavailable> = Effect.fn(
  'PackageContentBasis.loadLower',
)(function* loadLowerRows(
  transaction: ScopedTransaction,
  content: Content,
  tenantId: string,
  lower: CatalogSelectionRevision,
  seen: ReadonlySet<string>,
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
    row.setCompositionResourceId !== null ||
    row.setCompositionRevision !== null
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
  const revision: PackageContentRevision = next === undefined ? configured : { ...configured, lower: next };
  if (next === undefined) {
    return Option.some([revision]);
  }
  const tail = yield* loadLower(transaction, content, tenantId, next.revision, new Set([...seen, lowerId]));
  return Option.isNone(tail) ? Option.none() : Option.some([revision, ...tail.value]);
}, Effect.mapError(unavailable));

/** All reads share Core's transaction and carry the trusted Tenant predicate. */
export const packageContentBasisForTransaction = (
  transaction: ScopedTransaction,
  trustedTenantId: string,
): PackageContentBasis => ({
  verify: Effect.fn('PackageContentBasis.verify')(function* verify({ content, definitionId, tenantId }) {
    if (
      tenantId !== trustedTenantId ||
      content.setComposition !== undefined ||
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
    if (content.lower === undefined) {
      return true;
    }
    const revisions = yield* loadLower(transaction, content, tenantId, content.lower.revision, new Set([definitionId]));
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
    const proposed: PackageContentRevision =
      content.configurationKey === undefined ? base : { ...base, configurationKey: content.configurationKey };
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
