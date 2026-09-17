import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  attributeDefinitionRevisions,
  attributeDefinitions,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  productVariantAxes,
  productVariantAxisEvents,
  products,
} from '../../src/database/schema.ts';
import {
  VariantAxisBasisUnavailable,
  variantAxisPersistenceForScope,
} from '../../src/persistence/variant-axis-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const definitionId = '33333333-3333-4333-8333-333333333333';
const typeId = '44444444-4444-4444-8444-444444444444';
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

type AxisTable =
  | typeof products
  | typeof productVariantAxisEvents
  | typeof productVariantAxes
  | typeof productTypeAssignments
  | typeof productTypes
  | typeof productTypeRevisions
  | typeof attributeDefinitions
  | typeof attributeDefinitionRevisions
  | typeof productTypeRevisionAttributes;

const transactionWith = (overrides = new Map<AxisTable, readonly object[]>()) => {
  const rows = new Map<AxisTable, readonly object[]>([
    [products, [{ productId }]],
    [productVariantAxisEvents, [{ attributeDefinitionIds: [definitionId], axisRevision: 1 }]],
    [productVariantAxes, [{ attributeDefinitionId: definitionId, axisRevision: 1, ordinal: 0 }]],
    [productTypeAssignments, [{ productTypeId: typeId }]],
    [productTypes, [{ currentRevision: 2 }]],
    [productTypeRevisions, [{ revision: 2 }]],
    [
      attributeDefinitions,
      [
        {
          applicableLevels: ['VARIANT'],
          attributeDefinitionId: definitionId,
          controlledValueKind: 'COLOR',
          currentRevision: 3,
          multiplicity: 'SINGLE',
          valueKind: 'CONTROLLED',
        },
      ],
    ],
    [
      attributeDefinitionRevisions,
      [
        {
          applicableLevels: ['VARIANT'],
          controlledValueKind: 'COLOR',
          multiplicity: 'SINGLE',
          valueKind: 'CONTROLLED',
        },
      ],
    ],
    [productTypeRevisionAttributes, [{ attributeDefinitionId: definitionId }]],
  ]);
  for (const [table, value] of overrides) {
    rows.set(table, value);
  }
  const selected = (table: AxisTable) => {
    const result = Object.assign(Effect.succeed(rows.get(table) ?? []), {
      limit: () => Effect.succeed(rows.get(table) ?? []),
    });
    return { where: () => ({ limit: () => result, orderBy: () => result }) };
  };
  return {
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

  it.effect('does not promote active vocabulary to Product allowed values', () =>
    Effect.gen(function* rejectsVocabularyInference() {
      // @ts-expect-error Focused Drizzle read-chain mock.
      const persistence = variantAxisPersistenceForScope(transactionWith(), scope);
      const failure = yield* Effect.flip(persistence.readCurrent(productRef));
      expect(Schema.is(VariantAxisBasisUnavailable)(failure)).toBe(true);
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
});
