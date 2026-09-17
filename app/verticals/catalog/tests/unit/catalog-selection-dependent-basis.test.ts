import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { CatalogSelectionSchema } from '../../shared/domain/catalog-selection-evidence.ts';
import { setCompositions } from '../../src/database/schema.ts';
import { catalogSelectionDependentBasisForScope } from '../../src/persistence/catalog-selection-dependent-basis.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:dependent-basis-test:run:1',
    authMethod: 'system',
    principalId: '44444444-4444-4444-8444-444444444444',
    tenantId,
  }),
  correlationId: 'dependent-basis-test',
};
const selection = Schema.decodeUnknownSync(CatalogSelectionSchema)({
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: '22222222-2222-4222-8222-222222222222',
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: '33333333-3333-4333-8333-333333333333',
    resourceType: 'commerce.catalog.variant',
    tenantId,
  },
});
const at = new Date('2026-09-17T12:00:00.000Z');
const emptySetRows = { where: () => ({ limit: () => Effect.succeed([]) }) };
const emptySetTransaction = {
  select: () => ({
    from: (table: typeof setCompositions) => {
      expect(table).toBe(setCompositions);
      return emptySetRows;
    },
  }),
};

describe('Catalog selection dependent basis', () => {
  it.effect('fails closed before querying a foreign Tenant selection', () =>
    Effect.gen(function* test() {
      const transaction = {
        select: () => {
          throw new Error('must not query');
        },
      };
      // @ts-expect-error No transaction method is needed for the early ownership gate.
      const basis = catalogSelectionDependentBasisForScope(transaction, scope);
      const result = yield* basis.assess({
        at,
        selection: Schema.decodeUnknownSync(CatalogSelectionSchema)({
          ...selection,
          productRef: { ...selection.productRef, tenantId: '55555555-5555-4555-8555-555555555555' },
          variantRef: { ...selection.variantRef, tenantId: '55555555-5555-4555-8555-555555555555' },
        }),
      });
      expect(result.status).toBe('INDETERMINATE');
    }),
  );

  it.effect('has no dependent facts to reject for a plain selection', () =>
    Effect.gen(function* test() {
      const transaction = {
        select: () => {
          throw new Error('must not query');
        },
      };
      // @ts-expect-error No transaction method is needed without dependent references.
      const basis = catalogSelectionDependentBasisForScope(transaction, scope);
      expect(yield* basis.assess({ at, selection })).toEqual({ status: 'VALID' });
    }),
  );

  it.effect('does not promote a missing Set Composition to Current', () =>
    Effect.gen(function* test() {
      // @ts-expect-error Only the exercised owner read chain is mocked.
      const basis = catalogSelectionDependentBasisForScope(emptySetTransaction, scope);
      const result = yield* basis.assess({
        at,
        selection: Schema.decodeUnknownSync(CatalogSelectionSchema)({
          ...selection,
          setComposition: {
            resourceRef: {
              moduleId: 'commerce.catalog',
              resourceId: '66666666-6666-4666-8666-666666666666',
              resourceType: 'commerce.catalog.set-composition',
              tenantId,
            },
            revision: 1,
          },
        }),
      });
      expect(result.status).toBe('INDETERMINATE');
    }),
  );
});
