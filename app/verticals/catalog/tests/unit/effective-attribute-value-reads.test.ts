import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  attributeDefinitions,
  attributeValueItems,
  attributeValueRevisions,
  attributeValueSets,
  productTypeAssignments,
  productTypeRevisionAttributes,
  productTypeRevisions,
  productTypes,
  productVariants,
  products,
} from '../../src/database/schema.ts';
import { effectiveAttributeValueReadsForScope } from '../../src/persistence/effective-attribute-value-reads.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const definitionId = '55555555-5555-4555-8555-555555555555';
const productSetId = '66666666-6666-4666-8666-666666666666';
const variantSetId = '77777777-7777-4777-8777-777777777777';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:effective-value-test:run:1',
    authMethod: 'system',
    principalId: '99999999-9999-4999-8999-999999999999',
    tenantId,
  }),
  correlationId: 'effective-value-test',
};
const input = {
  attributeDefinitionRef: {
    moduleId: 'commerce.catalog',
    resourceId: definitionId,
    resourceType: 'commerce.catalog.attribute-definition',
    tenantId,
  },
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: productId,
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: variantId,
    resourceType: 'commerce.catalog.variant',
    tenantId,
  },
} as const;
interface SetFixture {
  readonly attributeValueSetId: string;
  readonly currentRevision: number;
  readonly currentState: 'SET' | 'REMOVED';
  readonly variantId: string | null;
}
const productSet: SetFixture = {
  attributeValueSetId: productSetId,
  currentRevision: 4,
  currentState: 'SET',
  variantId: null,
};
const variantSet: SetFixture = {
  attributeValueSetId: variantSetId,
  currentRevision: 2,
  currentState: 'SET',
  variantId,
};

type QueryTable =
  | typeof products
  | typeof productVariants
  | typeof attributeDefinitions
  | typeof productTypeAssignments
  | typeof productTypes
  | typeof productTypeRevisions
  | typeof productTypeRevisionAttributes
  | typeof attributeValueSets
  | typeof attributeValueRevisions
  | typeof attributeValueItems;

const queryResult = (result: ReturnType<(table: QueryTable) => readonly object[]>) =>
  Object.assign(Effect.succeed(result), { limit: () => Effect.succeed(result), orderBy: () => Effect.succeed(result) });

const serviceWith = (sets: readonly SetFixture[], texts: Readonly<Record<string, string>>) => {
  const queried: QueryTable[] = [];
  let revisionReads = 0;
  let itemReads = 0;
  const rows = (table: QueryTable) => {
    if (table === products || table === productVariants) {
      return [{ lifecycleState: 'ACTIVE' }];
    }
    if (table === attributeDefinitions) {
      return [
        {
          allowsNone: 0,
          allowsNotApplicable: 0,
          allowsUnknown: 1,
          applicableLevels: ['PRODUCT', 'VARIANT'],
          meaning: 'Product material',
          multiplicity: 'SINGLE',
          name: 'Material',
          valueKind: 'TEXT',
        },
      ];
    }
    if (table === productTypeAssignments) {
      return [{ productTypeId: '88888888-8888-4888-8888-888888888888' }];
    }
    if (table === productTypes) {
      return [{ currentRevision: 3 }];
    }
    if (table === productTypeRevisions) {
      return [
        {
          effectiveAt: new Date('1960-01-01T00:00:00.000Z'),
          productTypeRevisionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          revision: 3,
        },
      ];
    }
    if (table === productTypeRevisionAttributes) {
      return [
        { level: 'PRODUCT', requirement: 'OPTIONAL' },
        { level: 'VARIANT', requirement: 'OPTIONAL' },
      ];
    }
    if (table === attributeValueSets) {
      return sets;
    }
    if (table === attributeValueRevisions) {
      const set = sets[revisionReads];
      revisionReads += 1;
      return set === undefined ? [] : [{ changeKind: set.currentState }];
    }
    if (table === attributeValueItems) {
      const set = sets[itemReads];
      itemReads += 1;
      const value = set === undefined ? undefined : texts[set.attributeValueSetId];
      return value === undefined
        ? []
        : [{ attributeDefinitionId: definitionId, ordinal: 0, textValue: value, valueKind: 'TEXT' }];
    }
    return [];
  };
  const transaction = {
    select: () => ({
      from: (table: QueryTable) => {
        queried.push(table);
        return { where: () => queryResult(rows(table)) };
      },
    }),
  };
  // @ts-expect-error Test transaction implements the exercised query chains only.
  return { queried, service: effectiveAttributeValueReadsForScope(transaction, scope) };
};

describe('private effective attribute value reads', () => {
  it.effect('rejects foreign references before querying', () =>
    Effect.gen(function* foreignReferences() {
      const { queried, service } = serviceWith([], {});
      const reads = yield* service;
      const result = yield* reads.resolveVariant({
        ...input,
        variantRef: { ...input.variantRef, tenantId: '22222222-2222-4222-8222-222222222222' },
      });
      expect(result.status).toBe('INVALID_AUTHORITY');
      expect(queried).toEqual([]);
    }),
  );

  it.effect('inherits a persisted Product value and reports its source revision', () =>
    Effect.gen(function* inheritedValue() {
      const reads = yield* serviceWith([productSet], { [productSetId]: 'steel' }).service;
      const result = yield* reads.resolveVariant(input);
      expect(result).toMatchObject({
        productRevision: 4,
        source: { level: 'PRODUCT', revision: 4 },
        status: 'CURRENT',
        values: [{ kind: 'TEXT', text: 'steel' }],
      });
    }),
  );

  it.effect('prefers a persisted Variant override and reports both revisions', () =>
    Effect.gen(function* variantOverride() {
      const reads = yield* serviceWith([productSet, variantSet], {
        [productSetId]: 'steel',
        [variantSetId]: 'aluminium',
      }).service;
      const result = yield* reads.resolveVariant(input);
      expect(result).toMatchObject({
        productRevision: 4,
        source: { level: 'VARIANT', revision: 2 },
        status: 'CURRENT',
        values: [{ kind: 'TEXT', text: 'aluminium' }],
        variantRevision: 2,
      });
    }),
  );

  it.effect('returns to Product inheritance after a Variant tombstone', () =>
    Effect.gen(function* removedOverride() {
      const removed = { ...variantSet, currentRevision: 3, currentState: 'REMOVED' as const };
      const reads = yield* serviceWith([productSet, removed], { [productSetId]: 'stainless steel' }).service;
      const result = yield* reads.resolveVariant(input);
      expect(result).toMatchObject({
        source: { level: 'PRODUCT', revision: 4 },
        status: 'CURRENT',
        values: [{ kind: 'TEXT', text: 'stainless steel' }],
        variantRevision: 3,
      });
    }),
  );
});
