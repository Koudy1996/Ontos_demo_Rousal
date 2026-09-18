import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import type {
  CartOpenSelectionPopulationPort,
  CartOpenSelectionReference,
} from '../../shared/domain/catalog-open-selection-population.ts';
import {
  CartOpenSelectionPopulationUnavailable,
  CartOpenSelectionReferenceSchema,
} from '../../shared/domain/catalog-open-selection-population.ts';
import type { CatalogSelectionCurrentFacts } from '../../shared/domain/catalog-selection-assessment.ts';
import {
  CatalogSelectionBasisSchema,
  CatalogSelectionMembershipSchema,
  CatalogSelectionSchema,
} from '../../shared/domain/catalog-selection-evidence.ts';
import type { CatalogSelection } from '../../shared/domain/catalog-selection-evidence.ts';
import { assembleCatalogSelectionEvidence } from '../../src/persistence/catalog-selection-evidence-service.ts';
import type { CatalogSelectionEvidenceServiceResult } from '../../src/persistence/catalog-selection-evidence-service.ts';
import {
  assessCatalogOpenSelectionSnapshot,
  catalogSelectionOpenPopulationImpactForScope,
} from '../../src/persistence/catalog-selection-open-population.ts';
import {
  packageActivationSelectionImpactForScope,
  productConfigurationSelectionImpactForScope,
  setCompositionSelectionImpactForScope,
} from '../../src/persistence/catalog-selection-change-impact.ts';
import { PackageActivationUnavailable } from '../../src/persistence/package-activation-persistence.ts';
import { ProductConfigurationPersistenceUnavailable } from '../../src/persistence/product-configuration-persistence.ts';
import { SetCompositionPersistenceUnavailable } from '../../src/persistence/set-composition-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const assessedAt = '2026-09-18T12:00:00.000Z';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const typeId = '44444444-4444-4444-8444-444444444444';
const valueSetId = '66666666-6666-4666-8666-666666666666';
const unitRuleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const packageDefinitionId = '77777777-7777-4777-8777-777777777777';
const compositionId = '88888888-8888-4888-8888-888888888888';
const ref = (resourceType: string, resourceId: string) => ({
  moduleId: 'commerce.catalog' as const,
  resourceId,
  resourceType,
  tenantId,
});
const productRef = ref('commerce.catalog.product', productId);
const variantRef = ref('commerce.catalog.variant', variantId);
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:selection-change-impact:run:1',
    authMethod: 'system',
    principalId: '55555555-5555-4555-8555-555555555555',
    tenantId,
  }),
  correlationId: 'selection-change-impact',
};

const decodeSelection = Schema.decodeUnknownSync(CatalogSelectionSchema, { onExcessProperty: 'error' });
const decodeBasis = Schema.decodeUnknownSync(CatalogSelectionBasisSchema, { onExcessProperty: 'error' });
const decodeMembership = Schema.decodeUnknownSync(CatalogSelectionMembershipSchema, { onExcessProperty: 'error' });
const selection = decodeSelection({ productRef, variantRef });
const packageSelection = decodeSelection({
  packageOption: {
    contentRevision: { resourceRef: ref('commerce.catalog.package-definition', packageDefinitionId), revision: 1 },
    optionRef: ref('commerce.catalog.package-definition', packageDefinitionId),
  },
  productRef,
  variantRef,
});
const setSelection = decodeSelection({
  productRef,
  setComposition: { resourceRef: ref('commerce.catalog.set-composition', compositionId), revision: 1 },
  variantRef,
});
const fact = (role: string, source: ReturnType<typeof ref>, revision: number) =>
  decodeBasis({ role, source: { resourceRef: source, revision } });
const purchaseBasis = [
  fact('PRODUCT', productRef, 4),
  fact('VARIANT', variantRef, 2),
  fact('PRODUCT_TYPE', ref('commerce.catalog.product-type', typeId), 1),
  fact('VARIANT_AXIS', productRef, 3),
  fact('INHERITED_VALUE', ref('commerce.catalog.attribute-value-set', valueSetId), 5),
  fact('UNIT_RULE', ref('commerce.catalog.product-unit', unitRuleId), 6),
  fact('UNIT_TARGET_DIVISIBILITY', variantRef, 2),
];
const observedFacts: CatalogSelectionCurrentFacts = {
  assessedAt,
  basis: purchaseBasis,
  dependentFactsComplete: true,
  membership: decodeMembership({
    attestationId: 'catalog-membership-change-impact-1',
    observedAt: assessedAt,
    productRef,
    source: 'CATALOG_OWNER_CURRENT_READ',
    variant: { resourceRef: variantRef, revision: 2 },
  }),
  productLifecycle: 'ACTIVE',
  purpose: 'PURCHASE_ACCEPTANCE',
  selection,
  source: 'CATALOG_OWNER_CURRENT_READ',
  status: 'OBSERVED',
  variantLifecycle: 'ACTIVE',
};
const validResult = (): CatalogSelectionEvidenceServiceResult => {
  const assembly = assembleCatalogSelectionEvidence({
    current: observedFacts,
    purpose: 'PURCHASE_ACCEPTANCE',
    selection,
  });
  return { evidence: assembly.evidence, missingRoles: assembly.missingRoles };
};
const assessValid = () => Effect.succeed(validResult());
const assessInvalid = (): Effect.Effect<CatalogSelectionEvidenceServiceResult> =>
  Effect.succeed({ evidence: { kind: 'NOT_FOUND', requested: selection }, missingRoles: [] });

const population = (selections: readonly CartOpenSelectionReference[]): CartOpenSelectionPopulationPort => ({
  read: Effect.succeed({
    complete: true,
    observedAt: assessedAt,
    revisionToken: 'cart-population-1',
    selections,
  }),
});
const reference = (selectionId: string, value: CatalogSelection = selection): CartOpenSelectionReference =>
  Schema.decodeUnknownSync(CartOpenSelectionReferenceSchema)({ selection: value, selectionId });
const untouchedTransaction = {
  delete: () => Effect.die('must not write'),
  insert: () => Effect.die('must not write'),
  select: () => Effect.die('must not query'),
  update: () => Effect.die('must not write'),
};
// @ts-expect-error SAFETY: Every impact under test decides before any transaction read or write.
const transaction: Parameters<typeof productConfigurationPersistenceForScope>[0] = untouchedTransaction;
const definitionImpactInput = {
  definitionId: 'definition-1',
  effectiveFrom: new Date('2026-09-18T00:00:00.000Z'),
  previousRevision: 0,
  productId,
  proposed: { choices: [], compatibilityRules: [], measuredRules: [], optionAllowances: [] },
  proposedRevision: 1,
  tenantId,
};
const packageImpactInput = { packageDefinitionId, revision: 1, tenantId };
const setImpactInput = {
  at: new Date('2026-09-18T00:00:00.000Z'),
  compositionId,
  previousRevision: 1,
  tenantId,
};

describe('Catalog open-selection population impact (#479 wiring)', () => {
  it.effect('fails closed when the Cart owner population port is absent', () =>
    Effect.gen(function* absentPort() {
      const impact = catalogSelectionOpenPopulationImpactForScope(transaction, scope);
      const impacted = yield* impact.assess({ purpose: 'PURCHASE_ACCEPTANCE' });
      expect(impacted).toMatchObject({ kind: 'POPULATION_UNAVAILABLE' });
    }),
  );

  it.effect('propagates a failing Cart owner read as a typed owner error', () =>
    Effect.gen(function* failingOwnerRead() {
      const failing: CartOpenSelectionPopulationPort = {
        read: Effect.fail(
          new CartOpenSelectionPopulationUnavailable({
            code: 'cart_open_selection_population_unavailable',
            reason: 'Cart is unavailable',
          }),
        ),
      };
      const impact = catalogSelectionOpenPopulationImpactForScope(transaction, scope, failing);
      const failure = yield* Effect.flip(impact.assess({ purpose: 'PURCHASE_ACCEPTANCE' }));
      expect(failure).toBeInstanceOf(CartOpenSelectionPopulationUnavailable);
    }),
  );

  it.effect('proves an empty but owner-confirmed population', () =>
    Effect.gen(function* emptyPopulation() {
      const snapshot = yield* assessCatalogOpenSelectionSnapshot({
        assess: assessInvalid,
        purpose: 'PURCHASE_ACCEPTANCE',
        snapshot: { complete: true, observedAt: assessedAt, revisionToken: 'cart-population-empty', selections: [] },
      });
      expect(snapshot).toEqual({ evidence: [], kind: 'PROVEN' });
    }),
  );

  it.effect('blocks when an affected open selection has no Current-VALID Catalog evidence', () =>
    Effect.gen(function* invalidEvidence() {
      const snapshot = yield* assessCatalogOpenSelectionSnapshot({
        assess: assessInvalid,
        purpose: 'PURCHASE_ACCEPTANCE',
        snapshot: {
          complete: true,
          observedAt: assessedAt,
          revisionToken: 'cart-population-1',
          selections: [reference('cart-open-1')],
        },
      });
      expect(snapshot).toMatchObject({ kind: 'NOT_PROVEN' });
    }),
  );

  it.effect('proves a complete population whose affected selections are Current-VALID', () =>
    Effect.gen(function* validEvidence() {
      const snapshot = yield* assessCatalogOpenSelectionSnapshot({
        assess: assessValid,
        purpose: 'PURCHASE_ACCEPTANCE',
        snapshot: {
          complete: true,
          observedAt: assessedAt,
          revisionToken: 'cart-population-1',
          selections: [reference('cart-open-1')],
        },
      });
      expect(snapshot.kind).toBe('PROVEN');
    }),
  );

  it.effect('keeps every Catalog path fail-closed without an injected owner population', () =>
    Effect.gen(function* absentPopulationAllPaths() {
      const config = productConfigurationSelectionImpactForScope(transaction, scope);
      const configFailure = yield* Effect.flip(config.verify(definitionImpactInput));
      expect(configFailure).toBeInstanceOf(ProductConfigurationPersistenceUnavailable);
      const packageImpact = packageActivationSelectionImpactForScope(transaction, scope);
      const packageFailure = yield* Effect.flip(packageImpact.verify(packageImpactInput));
      expect(packageFailure).toBeInstanceOf(PackageActivationUnavailable);
      const setImpact = setCompositionSelectionImpactForScope(transaction, scope);
      const setFailure = yield* Effect.flip(setImpact.verify(setImpactInput));
      expect(setFailure).toBeInstanceOf(SetCompositionPersistenceUnavailable);
    }),
  );

  it.effect('succeeds when the caller supplies a complete owner population and Catalog evidence is VALID', () =>
    Effect.gen(function* provenPopulation() {
      const empty = population([]);
      const packageImpact = packageActivationSelectionImpactForScope(transaction, scope, empty, assessInvalid);
      expect(yield* packageImpact.verify(packageImpactInput)).toBe(true);
      const setImpact = setCompositionSelectionImpactForScope(transaction, scope, empty, assessInvalid);
      expect(yield* setImpact.verify(setImpactInput)).toBe(true);
      const provenPackage = packageActivationSelectionImpactForScope(
        transaction,
        scope,
        population([reference('cart-open-1', packageSelection)]),
        assessValid,
      );
      expect(yield* provenPackage.verify(packageImpactInput)).toBe(true);
    }),
  );

  it.effect('blocks an affected Package or Set transition when Catalog evidence is not VALID', () =>
    Effect.gen(function* blockedEvidence() {
      const packageImpact = packageActivationSelectionImpactForScope(
        transaction,
        scope,
        population([reference('cart-open-package', packageSelection)]),
        assessInvalid,
      );
      expect(yield* packageImpact.verify(packageImpactInput)).toBe(false);
      const setImpact = setCompositionSelectionImpactForScope(
        transaction,
        scope,
        population([reference('cart-open-set', setSelection)]),
        assessInvalid,
      );
      expect(yield* setImpact.verify(setImpactInput)).toBe(false);
    }),
  );

  it('exposes the exact Cart owner port and Catalog evidence seam', () => {
    const port: CartOpenSelectionPopulationPort = population([]);
    expect(port).toHaveProperty('read');
    expect(catalogSelectionOpenPopulationImpactForScope).toBeDefined();
  });
});
