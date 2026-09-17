import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { PackageDefinitionContentInputSchema } from '../../shared/actions/package-definition-contract.ts';
import { packageContentBasisForTransaction } from '../../src/actions/package-definition-action-support.ts';
import {
  packageDefinitions,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
} from '../../src/database/schema.ts';
import type { packageContentRevisions } from '../../src/database/schema.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const packageId = '55555555-5555-4555-8555-555555555555';
const lowerId = '77777777-7777-4777-8777-777777777777';
const unitId = '66666666-6666-4666-8666-666666666666';
const ref = (resourceType: string, resourceId: string) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType: `commerce.catalog.${resourceType}`,
  tenantId,
});
const content = Schema.decodeUnknownSync(PackageDefinitionContentInputSchema)({
  amount: '20',
  effectiveAt: '2026-09-17T10:00:00.000Z',
  form: { productRef: ref('product', productId), variantRef: ref('variant', variantId) },
  lower: { count: '2', revision: { resourceRef: ref('package-definition', lowerId), revision: 1 } },
  unitRef: ref('product-unit', unitId),
});
const lowerRow = {
  amount: '10',
  configurationKey: null,
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
interface Overrides {
  readonly lower?: typeof lowerRow;
  readonly unit?: { readonly lifecycleState: string } | null;
}
type Table =
  | typeof products
  | typeof productVariants
  | typeof productUnits
  | typeof productUnitRuleRevisions
  | typeof packageDefinitions
  | typeof packageContentRevisions;
const rowsForTable = (table: Table, overrides: Overrides) => {
  if (table === products || table === productVariants) {
    return [{ lifecycleState: 'ACTIVE' }];
  }
  if (table === productUnits) {
    return overrides.unit === null ? [] : [overrides.unit ?? { currentRuleRevision: 1, lifecycleState: 'ACTIVE' }];
  }
  if (table === productUnitRuleRevisions) {
    return [{ lifecycleState: 'ACTIVE' }];
  }
  if (table === packageDefinitions) {
    return [{ productId, variantId }];
  }
  return [overrides.lower ?? lowerRow];
};
const query = (table: Table, overrides: Overrides) => ({
  where: () => ({ for: () => ({ limit: () => Effect.succeed(rowsForTable(table, overrides)) }) }),
});
const transaction = (overrides: Overrides = {}) => ({
  select: () => ({ from: (table: Table) => query(table, overrides) }),
});

describe('Package Content Current basis', () => {
  it.effect('accepts owned Unit and exact lower revision with matching conversion', () =>
    Effect.gen(function* acceptsExactLower() {
      // @ts-expect-error Mock implements only the exercised Drizzle read chain.
      const basis = packageContentBasisForTransaction(transaction(), tenantId);
      expect(yield* basis.verify({ content, definitionId: packageId, tenantId })).toBe(true);
    }),
  );

  it.effect('rejects absent or retired Unit, mismatched conversion, and unverified Set', () =>
    Effect.gen(function* rejectsInvalidBasis() {
      const cases: readonly Overrides[] = [
        { unit: null },
        { unit: { lifecycleState: 'RETIRED' } },
        { lower: { ...lowerRow, amount: '8' } },
      ];
      for (const overrides of cases) {
        // @ts-expect-error Mock implements only the exercised Drizzle read chain.
        const basis = packageContentBasisForTransaction(transaction(overrides), tenantId);
        expect(yield* basis.verify({ content, definitionId: packageId, tenantId })).toBe(false);
      }
      // @ts-expect-error Mock implements only the exercised Drizzle read chain.
      const basis = packageContentBasisForTransaction(transaction(), tenantId);
      const setContent = Schema.decodeUnknownSync(PackageDefinitionContentInputSchema)({
        ...content,
        setComposition: { resourceRef: ref('set-composition', lowerId), revision: 1 },
      });
      expect(yield* basis.verify({ content: setContent, definitionId: packageId, tenantId })).toBe(false);
    }),
  );
});
