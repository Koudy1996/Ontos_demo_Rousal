import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  attributeDefinitionRevisions,
  attributeDefinitions,
  attributeValueItems,
  attributeValueSets,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productAttributeApplicability,
  productAttributeApplicabilityRevisions,
  productTypeRevisions,
  productTypes,
  productVariantAxes,
  productVariantAxisEvents,
  productVariants,
  products,
} from '../../src/database/schema.ts';
import {
  VariantAxisBasisUnavailable,
  VariantAxisWriteConflict,
  variantAxisPersistenceForScope,
} from '../../src/persistence/variant-axis-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const definitionId = '33333333-3333-4333-8333-333333333333';
const typeId = '44444444-4444-4444-8444-444444444444';
const variantId = '66666666-6666-4666-8666-666666666666';
const valueSetId = '77777777-7777-4777-8777-777777777777';
const definitionRules = {
  allowsNone: 0,
  allowsNotApplicable: 0,
  allowsUnknown: 0,
  applicableLevels: ['VARIANT'],
  canonicalUnit: null,
  controlledValueKind: 'COLOR',
  decimalPlaces: null,
  maximumValue: null,
  meaning: 'Actual color',
  measuredQuantity: null,
  minimumValue: null,
  multiplicity: 'SINGLE',
  name: 'Color',
  valueKind: 'CONTROLLED',
};
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:variant-axis-test:run:1',
    authMethod: 'system',
    principalId: '55555555-5555-4555-8555-555555555555',
    tenantId,
  }),
  correlationId: 'variant-axis-test',
};
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: variantId,
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;

type AxisTable =
  | typeof products
  | typeof productVariantAxisEvents
  | typeof productVariants
  | typeof productVariantAxes
  | typeof productTypeAssignments
  | typeof productTypes
  | typeof productTypeRevisions
  | typeof attributeDefinitions
  | typeof attributeDefinitionRevisions
  | typeof productTypeRevisionAttributes
  | typeof productAttributeApplicability
  | typeof productAttributeApplicabilityRevisions
  | typeof attributeValueSets
  | typeof attributeValueItems;

type AxisWriteValues =
  | typeof productVariantAxisEvents.$inferInsert
  | readonly (typeof productVariantAxes.$inferInsert)[];

const transactionWith = (overrides = new Map<AxisTable, readonly object[]>(), writes: object[] = []) => {
  const rows = new Map<AxisTable, readonly object[]>([
    [products, [{ productId }]],
    [
      productVariantAxisEvents,
      [
        {
          attributeDefinitionIds: [definitionId],
          attributeDefinitionRevisions: [3],
          axisRevision: 1,
          productId,
          tenantId,
        },
      ],
    ],
    [
      productVariantAxes,
      [
        {
          attributeDefinitionId: definitionId,
          axisRevision: 1,
          definitionRevision: 3,
          ordinal: 0,
          productId,
          tenantId,
        },
      ],
    ],
    [productTypeAssignments, [{ productTypeId: typeId }]],
    [productTypes, [{ currentRevision: 2 }]],
    [productTypeRevisions, [{ revision: 2 }]],
    [
      attributeDefinitions,
      [
        {
          ...definitionRules,
          attributeDefinitionId: definitionId,
          currentRevision: 3,
          tenantId,
        },
      ],
    ],
    [
      attributeDefinitionRevisions,
      [
        {
          ...definitionRules,
          attributeDefinitionId: definitionId,
          revision: 3,
          tenantId,
        },
      ],
    ],
    [productTypeRevisionAttributes, [{ attributeDefinitionId: definitionId }]],
    [
      productAttributeApplicability,
      [
        {
          attributeDefinitionId: definitionId,
          currentRevision: 1,
          productId,
          productLevel: false,
          tenantId,
          variantLevel: true,
        },
      ],
    ],
    [
      productAttributeApplicabilityRevisions,
      [
        {
          attributeDefinitionId: definitionId,
          productId,
          productLevel: false,
          revision: 1,
          tenantId,
          variantLevel: true,
        },
      ],
    ],
  ]);
  for (const [table, value] of overrides) {
    rows.set(table, value);
  }
  const selected = (table: AxisTable) => {
    const result = Object.assign(Effect.succeed(rows.get(table) ?? []), {
      limit: () => Effect.succeed(rows.get(table) ?? []),
    });
    return { where: () => ({ for: () => result, limit: () => result, orderBy: () => result, pipe: () => result }) };
  };
  return {
    delete: (table: AxisTable) => ({
      where: () =>
        Effect.sync(() => {
          writes.push({ delete: table });
        }),
    }),
    insert: (table: AxisTable) => ({
      values: (values: AxisWriteValues) =>
        Effect.sync(() => {
          writes.push({ insert: table, values });
        }),
    }),
    select: () => ({ from: selected }),
  };
};

describe('Variant Axis Current basis', () => {
  it.effect('rejects foreign tenant before querying', () =>
    Effect.gen(function* rejectsForeignTenant() {
      const transaction = {
        select: () => {
          throw new Error('must not query');
        },
      };
      // @ts-expect-error Deliberately mocks only the forbidden path.
      const persistence = variantAxisPersistenceForScope(transaction, scope);
      const failure = yield* Effect.flip(
        persistence.readCurrent({ ...productRef, tenantId: '66666666-6666-4666-8666-666666666666' }),
      );
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('reads axis definition and Type applicability without claiming Product allowed values', () =>
    Effect.gen(function* readsAxisRole() {
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transactionWith(), scope);
      const current = yield* persistence.readCurrent(productRef);
      expect(current.axes).toEqual([
        expect.objectContaining({
          attributeDefinitionId: definitionId,
          definitionRevision: 3,
          valueKind: 'CONTROLLED',
        }),
      ]);
    }),
  );

  it.effect('reads the pinned Definition revision after the current Definition advances', () =>
    Effect.gen(function* readsPinnedRevision() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(
          new Map([
            [
              attributeDefinitions,
              [
                {
                  ...definitionRules,
                  attributeDefinitionId: definitionId,
                  currentRevision: 4,
                  meaning: 'New meaning',
                  tenantId,
                },
              ],
            ],
          ]),
        ),
        scope,
      );
      const current = yield* persistence.readCurrent(productRef);
      expect(current.axes[0]).toEqual(expect.objectContaining({ definitionRevision: 3, valueKind: 'CONTROLLED' }));
    }),
  );

  it.effect('rejects an axis after its Product-local Variant declaration is removed', () =>
    Effect.gen(function* rejectsRemovedApplicability() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(new Map([[productAttributeApplicability, []]])),
        scope,
      );
      expect(Schema.is(VariantAxisBasisUnavailable)(yield* Effect.flip(persistence.readCurrent(productRef)))).toBe(
        true,
      );
    }),
  );

  it.effect('rejects a declaration whose current revision evidence is missing or stale', () =>
    Effect.gen(function* rejectsStaleApplicabilityRevision() {
      for (const revisions of [
        [],
        [
          {
            attributeDefinitionId: definitionId,
            productId,
            productLevel: false,
            revision: 2,
            tenantId,
            variantLevel: true,
          },
        ],
      ]) {
        const persistence = variantAxisPersistenceForScope(
          // @ts-expect-error Focused Drizzle read-chain mock.
          transactionWith(new Map([[productAttributeApplicabilityRevisions, revisions]])),
          scope,
        );
        expect(Schema.is(VariantAxisBasisUnavailable)(yield* Effect.flip(persistence.readCurrent(productRef)))).toBe(
          true,
        );
      }
    }),
  );

  it.effect('rejects Product-local applicability from a different source or without Variant permission', () =>
    Effect.gen(function* rejectsMismatchedApplicability() {
      for (const revision of [
        {
          attributeDefinitionId: definitionId,
          productId: variantId,
          productLevel: false,
          revision: 1,
          tenantId,
          variantLevel: true,
        },
        {
          attributeDefinitionId: definitionId,
          productId,
          productLevel: false,
          revision: 1,
          tenantId,
          variantLevel: false,
        },
      ]) {
        const persistence = variantAxisPersistenceForScope(
          // @ts-expect-error Focused Drizzle read-chain mock.
          transactionWith(new Map([[productAttributeApplicabilityRevisions, [revision]]])),
          scope,
        );
        expect(Schema.is(VariantAxisBasisUnavailable)(yield* Effect.flip(persistence.readCurrent(productRef)))).toBe(
          true,
        );
      }
    }),
  );

  it.effect('rejects axis rows without pinned revision evidence', () =>
    Effect.gen(function* rejectsUnpinnedAxis() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(
          new Map([
            [
              productVariantAxes,
              [
                {
                  attributeDefinitionId: definitionId,
                  axisRevision: 1,
                  definitionRevision: null,
                  ordinal: 0,
                  productId,
                  tenantId,
                },
              ],
            ],
          ]),
        ),
        scope,
      );
      expect(Schema.is(VariantAxisBasisUnavailable)(yield* Effect.flip(persistence.readCurrent(productRef)))).toBe(
        true,
      );
    }),
  );

  it.effect('rejects an event whose pinned revisions disagree with the live axes', () =>
    Effect.gen(function* rejectsMismatchedEvidence() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(
          new Map([
            [
              productVariantAxisEvents,
              [
                {
                  attributeDefinitionIds: [definitionId],
                  attributeDefinitionRevisions: [2],
                  axisRevision: 1,
                  productId,
                  tenantId,
                },
              ],
            ],
          ]),
        ),
        scope,
      );
      expect(Schema.is(VariantAxisBasisUnavailable)(yield* Effect.flip(persistence.readCurrent(productRef)))).toBe(
        true,
      );
    }),
  );

  it.effect('reads explicit Variant value rows and source revision without inventing a sibling combination', () =>
    Effect.gen(function* readsEffectiveValue() {
      const item = {
        attributeDefinitionId: definitionId,
        attributeValueSetId: valueSetId,
        controlledAttributeValueId: '88888888-8888-4888-8888-888888888888',
        ordinal: 0,
        tenantId,
        valueKind: 'CONTROLLED',
      };
      const transaction = transactionWith(
        new Map<AxisTable, readonly object[]>([
          [
            attributeValueSets,
            [
              {
                attributeDefinitionId: definitionId,
                attributeValueSetId: valueSetId,
                currentRevision: 5,
                currentState: 'SET',
                productId,
                tenantId,
                variantId,
              },
            ],
          ],
          [attributeValueItems, [item]],
        ]),
      );
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transaction, scope);
      const axes = yield* persistence.readCurrent(productRef);
      expect(yield* persistence.readEffectiveValues(productRef, variantRef, axes)).toEqual([
        {
          attributeDefinitionId: definitionId,
          definitionRevision: 3,
          items: [item],
          source: 'VARIANT',
          sourceRevision: 5,
          sourceValueSetRef: { attributeValueSetId: valueSetId, tenantId },
        },
      ]);
    }),
  );

  it.effect('lists only three explicitly recorded combinations and excludes an unconfirmed draft', () =>
    Effect.gen(function* readsOnlyRecorded() {
      const recorded = [
        { combinationKey: 'a'.repeat(64), variantId },
        { combinationKey: 'b'.repeat(64), variantId: '88888888-8888-4888-8888-888888888888' },
        { combinationKey: 'c'.repeat(64), variantId: '99999999-9999-4999-8999-999999999999' },
      ];
      const transaction = transactionWith(
        new Map([
          [
            productVariants,
            [
              ...recorded.map((row) => ({
                ...row,
                axisRevision: 1,
                combinationAxisRevision: 1,
                lifecycleState: 'ACTIVE',
                productId,
                tenantId,
              })),
              {
                combinationAxisRevision: null,
                combinationKey: null,
                lifecycleState: 'WORK_IN_PROGRESS',
                productId,
                tenantId,
                variantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              },
            ],
          ],
        ]),
      );
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transaction, scope);
      const axes = yield* persistence.readCurrent(productRef);
      expect(yield* persistence.readRecordedCombinations(productRef, axes)).toEqual(
        recorded.map((row) => ({ axisRevision: 1, ...row })),
      );
    }),
  );

  it.effect('fails closed when a recorded combination does not match the Current axis revision', () =>
    Effect.gen(function* rejectsStaleCombination() {
      const transaction = transactionWith(
        new Map([
          [
            productVariants,
            [
              {
                axisRevision: 2,
                combinationAxisRevision: 2,
                combinationKey: 'a'.repeat(64),
                lifecycleState: 'ACTIVE',
                productId,
                tenantId,
                variantId,
              },
            ],
          ],
        ]),
      );
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transaction, scope);
      const axes = yield* persistence.readCurrent(productRef);
      const failure = yield* Effect.flip(persistence.readRecordedCombinations(productRef, axes));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('reports an absent effective axis as missing without synthesizing an allowed value', () =>
    Effect.gen(function* readsMissingValue() {
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transactionWith(), scope);
      const axes = yield* persistence.readCurrent(productRef);
      expect(yield* persistence.readEffectiveValues(productRef, variantRef, axes)).toEqual([
        {
          attributeDefinitionId: definitionId,
          definitionRevision: 3,
          items: [],
          source: 'MISSING',
          sourceRevision: null,
          sourceValueSetRef: null,
        },
      ]);
    }),
  );

  it.effect('rejects a missing exact Product Type revision', () =>
    Effect.gen(function* rejectsMissingTypeRevision() {
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transactionWith(new Map([[productTypeRevisions, []]])), scope);
      const failure = yield* Effect.flip(persistence.readCurrent(productRef));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('rejects a missing exact Attribute Definition revision', () =>
    Effect.gen(function* rejectsMissingDefinitionRevision() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(new Map([[attributeDefinitionRevisions, []]])),
        scope,
      );
      const failure = yield* Effect.flip(persistence.readCurrent(productRef));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('rejects a stale definition rule snapshot despite a matching revision number', () =>
    Effect.gen(function* rejectsStaleDefinitionRules() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(
          new Map([
            [
              attributeDefinitionRevisions,
              [
                {
                  ...definitionRules,
                  attributeDefinitionId: definitionId,
                  meaning: 'Different meaning',
                  revision: 3,
                  tenantId,
                },
              ],
            ],
          ]),
        ),
        scope,
      );
      const failure = yield* Effect.flip(persistence.readCurrent(productRef));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('rejects an axis event for a different Product', () =>
    Effect.gen(function* rejectsForeignEvent() {
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle read-chain mock.
        transactionWith(
          new Map([
            [
              productVariantAxisEvents,
              [
                {
                  attributeDefinitionIds: [definitionId],
                  axisRevision: 1,
                  productId: '66666666-6666-4666-8666-666666666666',
                  tenantId,
                },
              ],
            ],
          ]),
        ),
        scope,
      );
      const failure = yield* Effect.flip(persistence.readCurrent(productRef));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
    }),
  );
});

describe('Variant Axis governed write', () => {
  const input = {
    actionInvocationId: '99999999-9999-4999-8999-999999999999',
    axes: [{ attributeDefinitionId: definitionId, definitionRevision: 3 }],
    expectedAxisRevision: 1,
    principalId: scope.principalId,
    productRef,
    reason: 'Distinguishes the physical forms',
  };

  it.effect('requires compare-and-swap before writing', () =>
    Effect.gen(function* staleWrite() {
      const writes: object[] = [];
      // @ts-expect-error Focused Drizzle transaction mock.
      const persistence = variantAxisPersistenceForScope(transactionWith(new Map(), writes), scope);
      const error = yield* Effect.flip(persistence.govern({ ...input, expectedAxisRevision: 0 }));
      expect(Schema.is(VariantAxisWriteConflict)(error)).toBe(true);
      expect(error).toMatchObject({ conflict: 'REVISION' });
      expect(writes).toEqual([]);
    }),
  );

  it.effect('rejects changed axes while an active Variant exists', () =>
    Effect.gen(function* activeSelection() {
      const writes: object[] = [];
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle transaction mock.
        transactionWith(
          new Map<AxisTable, readonly object[]>([[productVariants, [{ lifecycleState: 'ACTIVE', variantId }]]]),
          writes,
        ),
        scope,
      );
      const error = yield* Effect.flip(persistence.govern({ ...input, axes: [] }));
      expect(Schema.is(VariantAxisWriteConflict)(error)).toBe(true);
      expect(error).toMatchObject({ conflict: 'ACTIVE_SELECTION' });
      expect(writes).toEqual([]);
    }),
  );

  it.effect('rejects an outdated Definition pin', () =>
    Effect.gen(function* staleDefinition() {
      const writes: object[] = [];
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle transaction mock.
        transactionWith(
          new Map<AxisTable, readonly object[]>([
            [productVariantAxes, []],
            [
              productVariantAxisEvents,
              [{ attributeDefinitionIds: [], attributeDefinitionRevisions: [], axisRevision: 1, productId, tenantId }],
            ],
            [attributeDefinitions, [{ attributeDefinitionId: definitionId, currentRevision: 4, tenantId }]],
          ]),
          writes,
        ),
        scope,
      );
      const error = yield* Effect.flip(persistence.govern(input));
      expect(Schema.is(VariantAxisWriteConflict)(error)).toBe(true);
      expect(error).toMatchObject({ conflict: 'DEFINITION' });
      expect(writes).toEqual([]);
    }),
  );

  it.effect('requires a Product-local Variant applicability declaration', () =>
    Effect.gen(function* missingApplicability() {
      const writes: object[] = [];
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle transaction mock.
        transactionWith(
          new Map<AxisTable, readonly object[]>([
            [productVariantAxes, []],
            [
              productVariantAxisEvents,
              [{ attributeDefinitionIds: [], attributeDefinitionRevisions: [], axisRevision: 1, productId, tenantId }],
            ],
            [productAttributeApplicability, []],
          ]),
          writes,
        ),
        scope,
      );
      const error = yield* Effect.flip(persistence.govern(input));
      expect(Schema.is(VariantAxisWriteConflict)(error)).toBe(true);
      expect(error).toMatchObject({ conflict: 'TYPE_RULE' });
      expect(writes).toEqual([]);
    }),
  );

  it.effect('appends an exact revision event and current role after validation', () =>
    Effect.gen(function* storesPinnedAxis() {
      const writes: object[] = [];
      const persistence = variantAxisPersistenceForScope(
        // @ts-expect-error Focused Drizzle transaction mock.
        transactionWith(
          new Map<AxisTable, readonly object[]>([
            [productVariantAxes, []],
            [
              productVariantAxisEvents,
              [{ attributeDefinitionIds: [], attributeDefinitionRevisions: [], axisRevision: 1, productId, tenantId }],
            ],
          ]),
          writes,
        ),
        scope,
      );
      expect(yield* persistence.govern(input)).toEqual({ axisRevision: 2, changed: true });
      expect(writes).toEqual([
        { delete: productVariantAxes },
        {
          insert: productVariantAxisEvents,
          values: expect.objectContaining({
            attributeDefinitionIds: [definitionId],
            attributeDefinitionRevisions: [3],
            axisRevision: 2,
          }),
        },
        {
          insert: productVariantAxes,
          values: [
            expect.objectContaining({
              attributeDefinitionId: definitionId,
              definitionRevision: 3,
              ordinal: 0,
            }),
          ],
        },
      ]);
    }),
  );
});
