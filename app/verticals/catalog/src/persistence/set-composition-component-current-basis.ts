import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option } from 'effect';

import type { SetComponentCurrentProof, SetComponentValidation } from '../../shared/domain/set-component-validation.ts';
import { validateSetComponents } from '../../shared/domain/set-component-validation.ts';
import type { CatalogRevisionInstant } from '../../shared/domain/catalog-revision-reference.ts';
import type { SetComponent, SetCompositionRevision } from '../../shared/domain/set-composition.ts';
import { productVariants, products, setCompositions } from '../database/schema.ts';
import { catalogSelectionPackageUnitBasisForScope } from './catalog-selection-package-unit-basis.ts';
import { SetCompositionPersistenceUnavailable } from './set-composition-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
const packageDefinitionType = 'commerce.catalog.package-definition';

export interface SetComponentDependencyRevision {
  readonly componentId: string;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly revision: number;
  readonly role:
    | 'PRODUCT'
    | 'VARIANT'
    | 'UNIT_RULE'
    | 'UNIT_TARGET_DIVISIBILITY'
    | 'PACKAGE_CONTENT'
    | 'PACKAGE_OPTION_ROLE';
}

/** A component-only snapshot; it does not attest a Set selection or purchase as Current. */
export type SetCompositionComponentCurrentBasis =
  | {
      readonly assessedAt: CatalogRevisionInstant;
      readonly dependencies: readonly SetComponentDependencyRevision[];
      readonly proofs: readonly SetComponentCurrentProof[];
      readonly status: 'VALID';
    }
  | Extract<SetComponentValidation, { readonly status: 'INVALID' | 'INDETERMINATE' }>;

const unavailable = (cause: unknown) => {
  const error = new SetCompositionPersistenceUnavailable({
    code: 'set_composition_persistence_unavailable',
    reason: 'Authoritative component Current basis is unavailable',
  });
  Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  return error;
};

const readComponent = Effect.fn('SetCompositionComponentCurrentBasis.readComponent')(function* readComponent(
  transaction: ScopedTransaction,
  scope: OperationalScope,
  revision: SetCompositionRevision,
  component: SetComponent,
  at: Date,
  assessedAt: CatalogRevisionInstant,
) {
  const { componentId, selection } = component;
  const componentProductId = selection.productRef.resourceId;
  if (selection.productRef.tenantId !== scope.tenantId) {
    return { code: 'COMPONENT_TENANT_MISMATCH', componentId, status: 'INVALID' as const };
  }
  if (selection.setComposition !== undefined || componentProductId === revision.productRef.resourceId) {
    return { code: 'NESTED_SET', componentId, status: 'INVALID' as const };
  }
  // These tenant-qualified owner reads distinguish a confirmed missing target
  // from a failed read. A query failure stays in the typed unavailable channel.
  const [product] = yield* transaction
    .select({ productId: products.productId })
    .from(products)
    .where(and(eq(products.tenantId, scope.tenantId), eq(products.productId, componentProductId)))
    .limit(1);
  if (product === undefined) {
    return { code: 'COMPONENT_PRODUCT_MISSING', componentId, status: 'INVALID' as const };
  }
  const [variant] = yield* transaction
    .select({ variantId: productVariants.variantId })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, scope.tenantId),
        eq(productVariants.productId, componentProductId),
        eq(productVariants.variantId, selection.variantRef.resourceId),
      ),
    )
    .limit(1);
  if (variant === undefined) {
    return { code: 'COMPONENT_VARIANT_MISSING', componentId, status: 'INVALID' as const };
  }
  const [nested] = yield* transaction
    .select({ compositionId: setCompositions.compositionId })
    .from(setCompositions)
    .where(and(eq(setCompositions.tenantId, scope.tenantId), eq(setCompositions.productId, componentProductId)))
    .limit(1);
  if (nested !== undefined) {
    return { code: 'NESTED_SET', componentId, status: 'INVALID' as const };
  }
  const current = yield* catalogSelectionPackageUnitBasisForScope(transaction, scope).read(selection, at);
  if (current.status !== 'CURRENT') {
    return { code: 'CURRENT_COMPONENT_UNVERIFIABLE', componentId, status: current.status };
  }
  if (current.unit.id !== component.quantity.unitRef.resourceId) {
    return { code: 'COMPONENT_UNIT_MISMATCH', componentId, status: 'INVALID' as const };
  }
  const proof: SetComponentCurrentProof = {
    assessedAt,
    attestationId: randomUUID(),
    componentId,
    divisible: current.unit.divisible,
    productKind: 'ATOMIC',
    productLifecycle: 'ACTIVE',
    quantityStep: current.unit.step,
    quantityUnitRef: component.quantity.unitRef,
    selection,
    source: 'CATALOG_OWNER_CURRENT_READ',
    status: 'VALID',
    variantLifecycle: 'ACTIVE',
    variantProductRef: selection.productRef,
  };
  if (selection.packageOption !== undefined) {
    Object.assign(proof, { packageLifecycle: 'ACTIVE', packageProductRef: selection.productRef });
  }
  const dependencies: SetComponentDependencyRevision[] = [
    {
      componentId,
      resourceId: componentProductId,
      resourceType: 'commerce.catalog.product',
      revision: current.productRevision,
      role: 'PRODUCT',
    },
    {
      componentId,
      resourceId: selection.variantRef.resourceId,
      resourceType: 'commerce.catalog.variant',
      revision: current.variantRevision,
      role: 'VARIANT',
    },
    {
      componentId,
      resourceId: current.unit.id,
      resourceType: 'commerce.catalog.product-unit',
      revision: current.unit.ruleRevision,
      role: 'UNIT_RULE',
    },
    {
      componentId,
      resourceId: selection.packageOption?.optionRef.resourceId ?? selection.variantRef.resourceId,
      resourceType: selection.packageOption === undefined ? 'commerce.catalog.variant' : packageDefinitionType,
      revision: current.unit.targetDivisibilityRevision,
      role: 'UNIT_TARGET_DIVISIBILITY',
    },
    ...current.contentPath.map((step) => ({
      componentId,
      resourceId: step.packageDefinitionId,
      resourceType: packageDefinitionType,
      revision: step.revision,
      role: 'PACKAGE_CONTENT' as const,
    })),
  ];
  if (selection.packageOption !== undefined && current.optionRevision !== undefined) {
    dependencies.push({
      componentId,
      resourceId: selection.packageOption.optionRef.resourceId,
      resourceType: packageDefinitionType,
      revision: current.optionRevision,
      role: 'PACKAGE_OPTION_ROLE',
    });
  }
  return { dependencies, proof, status: 'PROVEN' as const };
});

/** All reads share Core's tenant-scoped transaction and one assessment instant. */
export const setCompositionComponentCurrentBasisForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
) => ({
  read: Effect.fn('SetCompositionComponentCurrentBasis.read')(function* read(
    revision: SetCompositionRevision,
    at: Date,
  ) {
    if (Option.isNone(DateTime.make(at)) || revision.productRef.tenantId !== scope.tenantId) {
      return { code: 'SET_CURRENT_SCOPE_OR_TIME_UNVERIFIABLE', status: 'INDETERMINATE' as const };
    }
    const assessedAt = DateTime.formatIso(DateTime.makeUnsafe(at));
    const results = yield* Effect.forEach(
      revision.components,
      (component) => readComponent(transaction, scope, revision, component, at, assessedAt),
      { concurrency: 1 },
    );
    const failure = results.find((result) => result.status !== 'PROVEN');
    if (failure !== undefined) {
      return failure;
    }
    const proven = results.filter((result) => result.status === 'PROVEN');
    const proofs = proven.map(({ proof }) => proof);
    const dependencies = proven.flatMap(({ dependencies: refs }) => refs);
    const validation = validateSetComponents(revision, proofs);
    return validation.status === 'VALID' ? { assessedAt, dependencies, proofs, status: 'VALID' as const } : validation;
  }, Effect.mapError(unavailable)),
});
