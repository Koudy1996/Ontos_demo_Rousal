import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';

import {
  CatalogRevisionNumberSchema,
  sameCatalogRevisionReference,
} from '../../shared/domain/catalog-revision-reference.ts';
import type { CatalogSelection } from '../../shared/domain/catalog-selection-evidence.ts';
import type { CatalogSelectionCurrentFacts } from '../../shared/domain/catalog-selection-assessment.ts';
import { productVariants, products } from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';
import { catalogSelectionPackageUnitBasisForScope } from './catalog-selection-package-unit-basis.ts';
import { productConfigurationPersistenceForScope } from './product-configuration-persistence.ts';
import { productTypeReadinessSourceForScope } from './product-type-readiness-source.ts';
import { setCompositionPersistenceForScope } from './set-composition-persistence.ts';
import { variantAxisPersistenceForScope } from './variant-axis-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const catalogModuleId = 'commerce.catalog';

/** A snapshot of facts, never an owner guarantee that a purchase remains Current. */
export type CatalogSelectionCurrentBasis = Extract<
  CatalogSelectionCurrentFacts,
  { readonly status: 'INDETERMINATE' | 'INVALID' }
>;

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog Current basis is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const validRequest = (selection: CatalogSelection, purpose: string, tenantId: string): boolean =>
  selection.productRef.tenantId === tenantId &&
  selection.variantRef.tenantId === tenantId &&
  selection.productRef.moduleId === catalogModuleId &&
  selection.variantRef.moduleId === catalogModuleId &&
  selection.productRef.resourceType === 'commerce.catalog.product' &&
  selection.variantRef.resourceType === 'commerce.catalog.variant' &&
  purpose.length > 0 &&
  purpose === purpose.trim();

const validDependentRef = (
  ref: { readonly moduleId: string; readonly resourceType: string; readonly tenantId: string },
  tenantId: string,
  resourceType: string,
): boolean => ref.moduleId === catalogModuleId && ref.resourceType === resourceType && ref.tenantId === tenantId;

/** Only exact effective revisions may enter the basis; component and choice validity is still separate. */
const readSelectedDependencies = Effect.fn('CatalogSelectionCurrentBasis.readSelectedDependencies')(
  function* readSelectedDependencies(
    transaction: ScopedTransaction,
    scope: OperationalScope,
    selection: CatalogSelection,
    at: Date,
  ) {
    const basis: CatalogSelectionCurrentFacts['basis'][number][] = [];
    if (selection.configuration !== undefined) {
      const selected = selection.configuration.definition;
      if (
        selected.revisionId !== undefined ||
        !validDependentRef(selected.resourceRef, scope.tenantId, 'commerce.catalog.configuration-definition')
      ) {
        return {
          basis,
          reason: 'Selected Configuration reference is not owner-verifiable',
          status: 'INDETERMINATE' as const,
        };
      }
      const current = yield* productConfigurationPersistenceForScope(transaction, scope)
        .readCurrent({
          at,
          definitionId: selected.resourceRef.resourceId,
          productId: selection.productRef.resourceId,
        })
        .pipe(Effect.catchTag('ProductConfigurationPersistenceUnavailable', () => Effect.succeedNone));
      if (Option.isNone(current)) {
        return {
          basis,
          reason: 'Configuration Current revision is unavailable or missing',
          status: 'INDETERMINATE' as const,
        };
      }
      if (
        current.value.revision !== selected.revision ||
        current.value.definitionId !== selected.resourceRef.resourceId ||
        current.value.productId !== selection.productRef.resourceId
      ) {
        return { basis, reason: 'Selected Configuration revision is not Current', status: 'INVALID' as const };
      }
      const revision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(current.value.revision).pipe(
        Effect.mapError(unavailable),
      );
      basis.push({
        role: 'CONFIGURATION_DEFINITION',
        source: {
          resourceRef: {
            moduleId: catalogModuleId,
            resourceId: current.value.definitionId,
            resourceType: 'commerce.catalog.configuration-definition',
            tenantId: scope.tenantId,
          },
          revision,
        },
      });
    }
    if (selection.setComposition !== undefined) {
      const selected = selection.setComposition;
      if (
        selected.revisionId !== undefined ||
        !validDependentRef(selected.resourceRef, scope.tenantId, 'commerce.catalog.set-composition')
      ) {
        return { basis, reason: 'Selected Set reference is not owner-verifiable', status: 'INDETERMINATE' as const };
      }
      const current = yield* setCompositionPersistenceForScope(transaction, scope)
        .readCurrent({
          at,
          compositionId: selected.resourceRef.resourceId,
        })
        .pipe(Effect.catchTag('SetCompositionPersistenceUnavailable', () => Effect.succeedNone));
      if (Option.isNone(current)) {
        return {
          basis,
          reason: 'Set Composition Current revision is unavailable or missing',
          status: 'INDETERMINATE' as const,
        };
      }
      const { effectiveFrom, effectiveTo, revision } = current.value;
      if (
        !sameCatalogRevisionReference(revision.reference, selected) ||
        current.value.lifecycleState !== 'ACTIVE' ||
        revision.productRef.resourceId !== selection.productRef.resourceId ||
        revision.variantRef.resourceId !== selection.variantRef.resourceId ||
        effectiveFrom > at ||
        (effectiveTo !== undefined && at >= effectiveTo)
      ) {
        return {
          basis,
          reason: 'Selected Set Composition is not Current for this exact target',
          status: 'INVALID' as const,
        };
      }
      basis.push({ role: 'SET_COMPOSITION', source: revision.reference });
    }
    return { basis, reason: null, status: 'INDETERMINATE' as const };
  },
);

const readIndirectDependencies = Effect.fn('CatalogSelectionCurrentBasis.readIndirectDependencies')(
  function* readIndirectDependencies(
    transaction: ScopedTransaction,
    scope: OperationalScope,
    selection: CatalogSelection,
    now: DateTime.Utc,
    productRevision: number,
    variantRevision: number,
  ) {
    const basis: CatalogSelectionCurrentFacts['basis'][number][] = [];
    const unknown = (reason: string) => ({ basis, reason, status: 'INDETERMINATE' as const });
    const typeSource = yield* productTypeReadinessSourceForScope(transaction, scope)
      .load(selection.productRef, now)
      .pipe(Effect.orElseSucceed(() => null));
    if (typeSource === null || typeSource.status !== 'VERIFIED') {
      return unknown('Current Product Type assignment and rules are not owner-attested');
    }
    const typeRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(typeSource.basis.revision).pipe(
      Effect.mapError(unavailable),
    );
    basis.push({
      role: 'PRODUCT_TYPE',
      source: {
        resourceRef: typeSource.basis.productTypeRef,
        revision: typeRevision,
        revisionId: typeSource.basis.revisionId,
      },
    });
    const axes = yield* variantAxisPersistenceForScope(transaction, scope)
      .readCurrent(selection.productRef)
      .pipe(Effect.orElseSucceed(() => null));
    if (
      axes === null ||
      axes.productId !== selection.productRef.resourceId ||
      axes.productTypeRevision !== typeSource.basis.revision
    ) {
      return unknown('Current Variant axes are unavailable or stale against Product Type');
    }
    if (!Number.isSafeInteger(axes.axisRevision) || axes.axisRevision < 1) {
      return unknown('Current Variant axis revision is not owner-attested');
    }
    const axisRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(axes.axisRevision).pipe(
      Effect.mapError(unavailable),
    );
    basis.push({ role: 'VARIANT_AXIS', source: { resourceRef: selection.productRef, revision: axisRevision } });

    const packageBasis = yield* catalogSelectionPackageUnitBasisForScope(transaction, scope)
      .read(selection, DateTime.toDateUtc(now))
      .pipe(Effect.orElseSucceed(() => null));
    if (packageBasis === null) {
      return unknown('Current Package and Unit basis is unavailable');
    }
    if (packageBasis.status !== 'CURRENT') {
      return { basis, reason: packageBasis.reason, status: packageBasis.status };
    }
    if (packageBasis.productRevision !== productRevision || packageBasis.variantRevision !== variantRevision) {
      return unknown('Package or Unit basis does not match the Current target');
    }
    if (selection.packageOption !== undefined) {
      const option = selection.packageOption;
      if (
        packageBasis.contentPath[0]?.revision !== option.contentRevision.revision ||
        packageBasis.contentPath[0].packageDefinitionId !== option.optionRef.resourceId
      ) {
        return unknown('Package basis does not match the selected Current content');
      }
      basis.push({ role: 'PACKAGE_CONTENT', source: option.contentRevision });
    }
    const unitRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(packageBasis.unit.ruleRevision).pipe(
      Effect.mapError(unavailable),
    );
    basis.push({
      role: 'UNIT',
      source: {
        resourceRef: {
          moduleId: catalogModuleId,
          resourceId: packageBasis.unit.id,
          resourceType: 'commerce.catalog.product-unit',
          tenantId: scope.tenantId,
        },
        revision: unitRevision,
      },
    });
    return unknown('Indirect Catalog facts and exact dependent revisions are not yet attested');
  },
);

/**
 * Core supplies one tenant-scoped transaction. The reader deliberately does not promote
 * Product/Variant rows to owner-issued membership or complete dependent-fact proof.
 */
export const catalogSelectionCurrentBasisForScope = (transaction: ScopedTransaction, scope: OperationalScope) => ({
  read: Effect.fn('CatalogSelectionCurrentBasis.read')(function* read(input: {
    readonly purpose: string;
    readonly selection: CatalogSelection;
  }) {
    const { purpose, selection } = input;
    const now = yield* DateTime.now;
    const assessedAt = DateTime.formatIso(now);
    const basis: CatalogSelectionCurrentFacts['basis'][number][] = [];
    const result = (status: 'INDETERMINATE' | 'INVALID', reason: string): CatalogSelectionCurrentFacts => ({
      assessedAt,
      basis,
      purpose,
      reason,
      selection,
      source: 'CATALOG_OWNER_CURRENT_READ',
      status,
    });
    if (!validRequest(selection, purpose, scope.tenantId)) {
      return result('INDETERMINATE', 'Selection scope or purpose cannot be verified');
    }

    const [product] = yield* transaction
      .select({ lifecycleState: products.lifecycleState, revision: products.currentRevision })
      .from(products)
      .where(and(eq(products.tenantId, scope.tenantId), eq(products.productId, selection.productRef.resourceId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      product === undefined ||
      !Number.isSafeInteger(product.revision) ||
      product.revision < 1 ||
      product.revision > 2_147_483_647
    ) {
      return result('INDETERMINATE', 'Product Current revision is missing or unavailable');
    }
    const productRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(product.revision).pipe(
      Effect.mapError(unavailable),
    );
    basis.push({
      role: 'PRODUCT',
      source: {
        resourceRef: selection.productRef,
        revision: productRevision,
      },
    });

    const [variant] = yield* transaction
      .select({
        lifecycleState: productVariants.lifecycleState,
        productId: productVariants.productId,
        revision: productVariants.currentRevision,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.tenantId, scope.tenantId),
          eq(productVariants.variantId, selection.variantRef.resourceId),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (
      variant === undefined ||
      !Number.isSafeInteger(variant.revision) ||
      variant.revision < 1 ||
      variant.revision > 2_147_483_647
    ) {
      return result('INDETERMINATE', 'Variant Current revision is missing or unavailable');
    }
    const variantRevision = yield* Schema.decodeEffect(CatalogRevisionNumberSchema)(variant.revision).pipe(
      Effect.mapError(unavailable),
    );
    if (variant.productId !== selection.productRef.resourceId) {
      return result('INVALID', 'Variant belongs to another Product');
    }
    basis.push({
      role: 'VARIANT',
      source: {
        resourceRef: selection.variantRef,
        revision: variantRevision,
      },
    });
    if (product.lifecycleState === 'RETIRED' || variant.lifecycleState === 'RETIRED') {
      return result('INVALID', 'Selected Product or Variant is retired');
    }
    if (product.lifecycleState !== 'ACTIVE' || variant.lifecycleState !== 'ACTIVE') {
      return result('INVALID', 'Selected Product or Variant is not active');
    }
    const dependent = yield* readSelectedDependencies(transaction, scope, selection, DateTime.toDateUtc(now));
    basis.push(...dependent.basis);
    if (dependent.reason !== null) {
      return result(dependent.status, dependent.reason);
    }
    const indirect = yield* readIndirectDependencies(
      transaction,
      scope,
      selection,
      now,
      product.revision,
      variant.revision,
    );
    basis.push(...indirect.basis);
    return result(indirect.status, indirect.reason);
  }),
});
