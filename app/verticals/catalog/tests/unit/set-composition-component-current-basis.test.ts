import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { SetCompositionRevisionSchema } from '../../shared/domain/set-composition.ts';
import {
  packageContentRevisions,
  packageDefinitions,
  packageOptionRoleRevisions,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
  setCompositions,
  variantUnitDivisibility,
} from '../../src/database/schema.ts';
import { setCompositionComponentCurrentBasisForScope } from '../../src/persistence/set-composition-component-current-basis.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const setProductId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const ref = (type: string, resourceId: string) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType: `commerce.catalog.${type}`,
  tenantId,
});
const revision = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
  components: [
    {
      componentId: '44444444-4444-4444-8444-444444444444',
      quantity: { amount: '1', unitRef: ref('product-unit', unitId) },
      selection: {
        productRef: ref('product', '55555555-5555-4555-8555-555555555555'),
        variantRef: ref('variant', '66666666-6666-4666-8666-666666666666'),
      },
    },
    {
      componentId: '77777777-7777-4777-8777-777777777777',
      quantity: { amount: '2', unitRef: ref('product-unit', unitId) },
      selection: {
        productRef: ref('product', '88888888-8888-4888-8888-888888888888'),
        variantRef: ref('variant', '99999999-9999-4999-8999-999999999999'),
      },
    },
  ],
  productRef: ref('product', setProductId),
  provenance: { changeKind: 'INITIAL', evidenceRefs: ['set-proof'], reason: 'Fixed contents' },
  reference: { resourceRef: ref('set-composition', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), revision: 1 },
  variantRef: ref('variant', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
});
const scope = { tenantId };
const at = new Date('2026-09-18T00:00:00.000Z');

interface BasisOptions {
  readonly nested?: boolean;
  readonly retired?: boolean;
  readonly unitId?: string;
}
type BasisTable =
  | typeof setCompositions
  | typeof products
  | typeof productVariants
  | typeof variantUnitDivisibility
  | typeof productUnits
  | typeof productUnitRuleRevisions
  | typeof packageDefinitions
  | typeof packageContentRevisions
  | typeof packageOptionRoleRevisions;
const rowsFor = (table: BasisTable, options: BasisOptions): readonly object[] => {
  if (table === setCompositions) {
    return options.nested === true ? [{ compositionId: 'nested' }] : [];
  }
  if (table === products) {
    return [
      { currentRevision: 3, lifecycleState: options.retired === true ? 'RETIRED' : 'ACTIVE', productId: 'product' },
    ];
  }
  if (table === productVariants) {
    return [{ currentRevision: 4, lifecycleState: 'ACTIVE', productId: 'product', variantId: 'variant' }];
  }
  if (table === variantUnitDivisibility) {
    return [{ currentRevision: 5, divisible: false, unitId: options.unitId ?? unitId }];
  }
  if (table === productUnits) {
    return [{ currentRuleRevision: 6, lifecycleState: 'ACTIVE', unitId: options.unitId ?? unitId }];
  }
  if (table === productUnitRuleRevisions) {
    return [{ lifecycleState: 'ACTIVE', revision: 6, rounding: 'UP', step: '1' }];
  }
  if (table === packageDefinitions) {
    return [
      {
        currentOptionRevision: 1,
        currentRevision: 2,
        lifecycleState: 'ACTIVE',
        optionState: 'ACTIVE',
        packageDefinitionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        productId: 'product',
        variantId: 'variant',
      },
    ];
  }
  if (table === packageContentRevisions) {
    return [
      {
        amount: '1',
        configurationKey: null,
        effectiveAt: new Date('2026-09-17T00:00:00.000Z'),
        lifecycleState: 'ACTIVE',
        lowerCount: null,
        lowerPackageDefinitionId: null,
        lowerRevision: null,
        productId: 'product',
        setCompositionResourceId: null,
        setCompositionRevision: null,
        unitResourceId: unitId,
        unitResourceType: 'commerce.catalog.product-unit',
        variantId: 'variant',
      },
    ];
  }
  if (table === packageOptionRoleRevisions) {
    return [
      {
        contentRevision: 1,
        effectiveAt: new Date('2026-09-17T00:00:00.000Z'),
        independentlyRequested: true,
        looseUnitsSubstitutable: false,
        productId: 'product',
        revision: 1,
        state: 'ACTIVE',
        variantId: 'variant',
      },
    ];
  }
  throw new Error('Unexpected component basis table');
};
const selectedRows = (rows: readonly object[]) => ({ where: () => ({ limit: () => Effect.succeed(rows) }) });
const transactionFor = (options: BasisOptions = {}) => ({
  select: () => ({ from: (table: BasisTable) => selectedRows(rowsFor(table, options)) }),
});

const read = (options?: Parameters<typeof transactionFor>[0], candidate = revision) => {
  // @ts-expect-error Only the exercised owner-local Drizzle query chains are mocked.
  const service = setCompositionComponentCurrentBasisForScope(transactionFor(options), scope);
  return service.read(candidate, at);
};

describe('Set composition component Current basis', () => {
  it.effect('issues exact component and dependency revisions without claiming selection Current', () =>
    Effect.gen(function* validComponents() {
      const result = yield* read();
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.proofs.map((proof) => proof.componentId)).toEqual(
          revision.components.map((item) => item.componentId),
        );
        expect(result.dependencies).toHaveLength(8);
        expect(result.dependencies.map((item) => item.revision)).toEqual([3, 4, 6, 5, 3, 4, 6, 5]);
      }
    }),
  );

  it.effect('rejects nested and retired components without dropping a need', () =>
    Effect.gen(function* invalidComponents() {
      expect(yield* read({ nested: true })).toMatchObject({ code: 'NESTED_SET', status: 'INVALID' });
      expect(yield* read({ retired: true })).toMatchObject({ status: 'INVALID' });
    }),
  );

  it.effect('rejects an exact Unit mismatch instead of treating a stale target basis as Current', () =>
    Effect.gen(function* staleUnit() {
      expect(yield* read({ unitId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })).toMatchObject({
        code: 'COMPONENT_UNIT_MISMATCH',
        status: 'INVALID',
      });
    }),
  );

  it.effect('rejects a stale selected Package Content revision', () =>
    Effect.gen(function* stalePackage() {
      const candidate = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [
          {
            ...revision.components[0],
            selection: {
              ...revision.components[0]?.selection,
              packageOption: {
                contentRevision: {
                  resourceRef: ref('package-definition', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
                  revision: 1,
                },
                optionRef: ref('package-definition', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
              },
            },
          },
          revision.components[1],
        ],
      });
      expect(yield* read({}, candidate)).toMatchObject({ status: 'INVALID' });
    }),
  );

  it.effect('issues fresh component-bound proofs when stable needs are re-keyed', () =>
    Effect.gen(function* rekeyedComponent() {
      const candidate = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [
          { ...revision.components[0], componentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
          revision.components[1],
        ],
      });
      const result = yield* read({}, candidate);
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.proofs[0]?.componentId).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        expect(result.dependencies[0]?.componentId).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
      }
    }),
  );
});
