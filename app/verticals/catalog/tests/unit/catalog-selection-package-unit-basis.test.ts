import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  packageContentRevisions,
  packageDefinitions,
  packageOptionRoleRevisions,
  packageUnitDivisibility,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
} from '../../src/database/schema.ts';
import { catalogSelectionPackageUnitBasisForScope } from '../../src/persistence/catalog-selection-package-unit-basis.ts';
import { CatalogSelectionSchema } from '../../shared/domain/catalog-selection-evidence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const packageId = '44444444-4444-4444-8444-444444444444';
const lowerPackageId = '77777777-7777-4777-8777-777777777777';
const unitId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-09-17T10:00:00.000Z');
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:catalog-selection-package-test:run:1',
    authMethod: 'system',
    principalId: '66666666-6666-4666-8666-666666666666',
    tenantId,
  }),
  correlationId: 'catalog-selection-package-test',
};
const ref = (resourceType: string, resourceId: string) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType,
  tenantId,
});
const selection = Schema.decodeUnknownSync(CatalogSelectionSchema)({
  packageOption: {
    contentRevision: { resourceRef: ref('commerce.catalog.package-definition', packageId), revision: 4 },
    optionRef: ref('commerce.catalog.package-definition', packageId),
  },
  productRef: ref('commerce.catalog.product', productId),
  variantRef: ref('commerce.catalog.variant', variantId),
});
const content = {
  amount: '10',
  configurationKey: null,
  effectiveAt: new Date('2026-09-16T00:00:00.000Z'),
  lifecycleState: 'ACTIVE',
  lowerCount: null,
  lowerPackageDefinitionId: null,
  lowerRevision: null,
  productId,
  setCompositionResourceId: null,
  setCompositionRevision: null,
  unitResourceId: unitId,
  unitResourceType: 'commerce.catalog.product-unit',
  variantId,
};
const role = {
  contentRevision: 4,
  effectiveAt: content.effectiveAt,
  independentlyRequested: true,
  looseUnitsSubstitutable: false,
  productId,
  revision: 2,
  state: 'ACTIVE',
  variantId,
};
const rows = new Map<unknown, unknown>([
  [products, { currentRevision: 2, lifecycleState: 'ACTIVE', productId }],
  [productVariants, { currentRevision: 3, lifecycleState: 'ACTIVE', productId, variantId }],
  [
    packageDefinitions,
    {
      currentOptionRevision: 2,
      currentRevision: 4,
      lifecycleState: 'ACTIVE',
      optionState: 'ACTIVE',
      productId,
      variantId,
    },
  ],
  [packageContentRevisions, content],
  [packageOptionRoleRevisions, role],
  [packageUnitDivisibility, { currentRevision: 5, divisible: false, unitId }],
  [productUnits, { currentRuleRevision: 6, lifecycleState: 'ACTIVE', unitId }],
  [productUnitRuleRevisions, { lifecycleState: 'ACTIVE', revision: 6, rounding: 'UP', step: '1' }],
]);
type ReadTable =
  | typeof products
  | typeof productVariants
  | typeof packageDefinitions
  | typeof packageContentRevisions
  | typeof packageOptionRoleRevisions
  | typeof packageUnitDivisibility
  | typeof productUnits
  | typeof productUnitRuleRevisions;
const queryResult = (table: ReadTable, overrides: Map<unknown, unknown>) => {
  const candidate = overrides.has(table) ? overrides.get(table) : rows.get(table);
  const row = Array.isArray(candidate) ? candidate.shift() : candidate;
  return Effect.succeed(row === null || row === undefined ? [] : [row]);
};
const makeLimit = (table: ReadTable, overrides: Map<unknown, unknown>) => () => queryResult(table, overrides);
const makeWhere = (table: ReadTable, overrides: Map<unknown, unknown>) => () => ({
  limit: makeLimit(table, overrides),
});
const makeFrom = (overrides: Map<unknown, unknown>) => (table: ReadTable) => ({ where: makeWhere(table, overrides) });
const transactionFor = (overrides = new Map<unknown, unknown>()) => ({ select: () => ({ from: makeFrom(overrides) }) });
const read = (overrides = new Map<unknown, unknown>()) =>
  // @ts-expect-error The mock supplies only the read chains exercised here.
  catalogSelectionPackageUnitBasisForScope(transactionFor(overrides), scope).read(selection, now);

describe('Catalog Selection package and Unit owner basis', () => {
  it.effect('attests exact Current Option content and target Unit without a purchase quantity', () =>
    Effect.gen(function* current() {
      const result = yield* read();
      expect(result).toMatchObject({
        contentPath: [{ amount: '10', packageDefinitionId: packageId, revision: 4 }],
        optionRevision: 2,
        status: 'CURRENT',
        unit: { divisible: false, id: unitId, ruleRevision: 6, targetDivisibilityRevision: 5 },
      });
      expect('quantity' in result).toBe(false);
    }),
  );

  it.effect('does not promote a substituteable role or a future content revision', () =>
    Effect.gen(function* stale() {
      const substitute = yield* read(
        new Map([[packageOptionRoleRevisions, { ...role, looseUnitsSubstitutable: true }]]),
      );
      expect(substitute.status).toBe('INVALID');
      const future = yield* read(
        new Map([[packageContentRevisions, { ...content, effectiveAt: new Date('2026-09-18T00:00:00.000Z') }]]),
      );
      expect(future.status).toBe('INVALID');
    }),
  );

  it.effect('keeps missing owner facts and unverified configuration indeterminate', () =>
    Effect.gen(function* incomplete() {
      expect((yield* read(new Map([[packageOptionRoleRevisions, null]]))).status).toBe('INDETERMINATE');
      expect((yield* read(new Map([[packageContentRevisions, { ...content, configurationKey: 'red' }]]))).status).toBe(
        'INDETERMINATE',
      );
    }),
  );

  it.effect('retains a pinned lower Package Content revision and refuses a cycle', () =>
    Effect.gen(function* nested() {
      const top = { ...content, lowerCount: '2', lowerPackageDefinitionId: lowerPackageId, lowerRevision: 2 };
      const lower = { ...content, amount: '5' };
      const definition = rows.get(packageDefinitions);
      const overrides = new Map<unknown, unknown>([
        [packageDefinitions, [definition, definition]],
        [packageContentRevisions, [top, lower]],
      ]);
      const current = yield* read(overrides);
      expect(current).toMatchObject({
        contentPath: [
          { lowerCount: '2', packageDefinitionId: packageId, revision: 4 },
          { amount: '5', packageDefinitionId: lowerPackageId, revision: 2 },
        ],
        status: 'CURRENT',
      });
      const cycle = yield* read(new Map([[packageContentRevisions, { ...top, lowerPackageDefinitionId: packageId }]]));
      expect(cycle.status).toBe('INDETERMINATE');
    }),
  );
});
